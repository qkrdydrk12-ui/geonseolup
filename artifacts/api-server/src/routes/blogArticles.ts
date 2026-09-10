import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { pgPool } from "../lib/db";
import { requireAdmin } from "../lib/adminStore";
import { notifyIndexNow } from "../lib/indexNow";
import { invalidateArticleCaches } from "../lib/articleMeta";
import { recordContentView, extractIp, getEngagement, toggleLike, getComments, addComment } from "../lib/contentEngagement.js";

const router: IRouter = Router();

// 글 등록/수정/삭제가 끝나면 SEO·사이트맵·OG 캐시를 즉시 비운다 (새 글 바로 반영).
function bustCache(_req: Request, res: Response, next: () => void) {
  res.on("finish", () => invalidateArticleCaches());
  next();
}

const jsonBig = express.json({ limit: "8mb" });

// 프론트 parseJob.ts의 JOBS 배열과 동일 목록(2026-09-09) — 글 CTA용 직종 태그 검증에 사용.
// 여기서 어긋난 값(오타·목록에 없는 값)이 들어오면 조용히 무시(null)해서 잘못된 링크가 만들어지는 걸 막는다.
const RELATED_JOB_OPTIONS = new Set([
  '조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비',
  '화기감시자', '유도원', '양중', '덕트', '비계', '포설', '보온', '관리자',
  '안전담당자', '안전시설반', '품질담당자', '공사담당자', '칸막이', '청소', '기타',
]);
function normalizeRelatedJob(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return RELATED_JOB_OPTIONS.has(s) ? s : null;
}

// 글 본문 안에 인라인으로 삽입할 계산기 위젯(2026-09-10 신설) — 체류시간 개선 목적.
// InfoDetail.tsx의 CALCULATOR_WIDGETS 맵 키와 정확히 일치해야 한다.
const RELATED_CALCULATOR_OPTIONS = new Set([
  'retirement-fund', 'net-pay', 'severance-pay',
]);
function normalizeRelatedCalculator(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return RELATED_CALCULATOR_OPTIONS.has(s) ? s : null;
}

async function initTables() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS blog_articles (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(150) UNIQUE NOT NULL,
      title VARCHAR(200) NOT NULL,
      description VARCHAR(300) NOT NULL,
      emoji VARCHAR(10) NOT NULL DEFAULT '📝',
      body JSONB NOT NULL DEFAULT '[]',
      image_data BYTEA,
      image_mime VARCHAR(50),
      published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_blog_articles_created ON blog_articles(created_at DESC);
    ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS created_by TEXT;
    -- 2026-08-29: 예약 발행 지원 — scheduled_at이 미래면 그 시각까지 공개 목록/상세에서 숨김.
    -- (site_news의 published_at <= now() 필터 패턴을 그대로 재사용)
    ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
    -- 2026-09-09: 글 하단 CTA를 해당 직종 구인공고로 연결하기 위한 직종 태그 (parseJob.ts JOBS 값 중 하나, 미지정 가능).
    ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS related_job VARCHAR(30);
    -- 2026-09-10: 글 본문 안에 인라인으로 삽입할 계산기 위젯 ('retirement-fund'|'net-pay'|'severance-pay', 미지정 가능).
    ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS related_calculator VARCHAR(30);
  `);
  // 잘못 저장된 깨진 이미지(수십 바이트짜리 쓰레기 데이터) 자동 정리 — 목록에서 엑박 방지
  await pgPool.query(
    `UPDATE blog_articles SET image_data = NULL, image_mime = NULL
     WHERE image_data IS NOT NULL AND length(image_data) < 100`
  );
}

// 누가 올렸는지 추적용: X-Uploader 헤더(도구 이름) + 접속 IP + 브라우저 정보를 기록
// HTTP 헤더 값은 ISO-8859-1만 허용돼서 클라이언트가 한글 값을 encodeURIComponent로 인코딩해 보낸다 — 여기서 디코딩.
function creatorInfo(req: Request): string {
  const rawUploader = req.get("x-uploader") ?? "";
  let uploader = "미상";
  try {
    uploader = decodeURIComponent(rawUploader).trim().slice(0, 50) || "미상";
  } catch {
    uploader = rawUploader.trim().slice(0, 50) || "미상";
  }
  const ip = (req.get("x-forwarded-for") ?? req.ip ?? "").split(",")[0]!.trim();
  const ua = (req.get("user-agent") ?? "").slice(0, 180);
  return `${uploader} | ip:${ip} | ${ua}`.slice(0, 300);
}
initTables().catch((e) => console.error("[DB] blog_articles initTables error:", e));

interface BodyBlock { subtitle?: string; text: string }

interface BlogArticleRow {
  id: number;
  slug: string;
  title: string;
  description: string;
  emoji: string;
  body: BodyBlock[];
  has_image: boolean;
  published: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  related_job: string | null;
  related_calculator: string | null;
}

function toApi(row: BlogArticleRow, includeCreator = false) {
  if (includeCreator) return { ...toApiBase(row), createdBy: row.created_by ?? null };
  return toApiBase(row);
}

function toApiBase(row: BlogArticleRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    emoji: row.emoji,
    body: row.body,
    imageUrl: row.has_image
      ? `/api/blog-articles-image/${row.slug}?v=${new Date(row.updated_at).getTime()}`
      : null,
    published: row.published,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    relatedJob: row.related_job,
    relatedCalculator: row.related_calculator,
  };
}

// 진짜 이미지인지 앞머리(매직 바이트)로 확인 — 아니면 저장하지 않는다 (엑박 예방)
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 100) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return true;
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return true;
  return false;
}

function decodeImage(imageBase64?: string): { data: Buffer; mime: string } | null {
  if (!imageBase64) return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
  const data = match ? Buffer.from(match[2]!, "base64") : Buffer.from(imageBase64, "base64");
  const mime = match ? match[1]! : "image/webp";
  if (!looksLikeImage(data)) return null; // 깨진/잘못된 값이면 이미지 없이 저장
  return { data, mime };
}

const SELECT_COLS = `id, slug, title, description, emoji, body,
  (image_data IS NOT NULL AND length(image_data) > 100) AS has_image, published, scheduled_at, created_at, updated_at, created_by, related_job, related_calculator`;

// GET /api/blog-articles — 공개, 발행된 글 최신순
// scheduled_at이 미래인 글은 그 시각이 지나기 전까지 목록에서 숨긴다(예약 발행).
router.get("/blog-articles", async (_req: Request, res: Response) => {
  try {
    const result = await pgPool.query<BlogArticleRow>(
      `SELECT ${SELECT_COLS} FROM blog_articles
       WHERE published = true AND (scheduled_at IS NULL OR scheduled_at <= now())
       ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ rows: result.rows.map((r) => toApi(r)) });
  } catch (err) {
    console.error("[BlogArticles] GET list error:", err);
    res.status(500).json({ error: "건설 꿀팁 목록 조회 실패" });
  }
});

// GET /api/blog-articles/all — 관리자 전용, 비공개 포함 전체
router.get("/blog-articles/all", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await pgPool.query<BlogArticleRow>(
      `SELECT ${SELECT_COLS} FROM blog_articles ORDER BY created_at DESC LIMIT 300`
    );
    res.json({ rows: result.rows.map((r) => toApi(r, true)) });
  } catch (err) {
    console.error("[BlogArticles] GET all error:", err);
    res.status(500).json({ error: "건설 꿀팁 목록 조회 실패" });
  }
});

// POST /api/blog-articles/:slug/view — 조회 기록 (관리자 통계용, 인증 불필요, 하루 1회/IP만 카운트).
// 기본 내장 글(코드에 있는 INFO_ARTICLES)도 slug만 맞으면 똑같이 기록된다.
router.post("/blog-articles/:slug/view", async (req: Request, res: Response) => {
  try {
    const ip = extractIp(req);
    const counted = await recordContentView("blog", String(req.params["slug"]), ip);
    res.json({ ok: true, counted });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/blog-articles/:slug/engagement — 공개, 조회수·좋아요 수·내가 좋아요 눌렀는지 조회.
// 상세 페이지 로딩 시 좋아요 버튼 초기 상태를 그리는 데 쓴다.
router.get("/blog-articles/:slug/engagement", async (req: Request, res: Response) => {
  try {
    const ip = extractIp(req);
    const data = await getEngagement("blog", String(req.params["slug"]), ip);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/blog-articles/:slug/like — 공개, 좋아요 토글(누르면 등록, 다시 누르면 취소). 인증 불필요.
router.post("/blog-articles/:slug/like", async (req: Request, res: Response) => {
  try {
    const ip = extractIp(req);
    const result = await toggleLike("blog", String(req.params["slug"]), ip);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/blog-articles/:slug/comments — 공개, 댓글 목록 조회.
router.get("/blog-articles/:slug/comments", async (req: Request, res: Response) => {
  try {
    const rows = await getComments("blog", String(req.params["slug"]));
    res.json({ ok: true, rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/blog-articles/:slug/comments — 공개, 댓글 작성. 인증 불필요(로그인 없는 사이트).
router.post("/blog-articles/:slug/comments", async (req: Request, res: Response) => {
  try {
    const ip = extractIp(req);
    const body = req.body as { author?: string; body?: string };
    const result = await addComment("blog", String(req.params["slug"]), ip, body.author ?? "", body.body ?? "");
    if (!result.ok) {
      res.status(400).json({ ok: false, reason: result.reason });
      return;
    }
    res.json({ ok: true, comment: result.comment });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/blog-articles-image/:slug — 공개, 이미지 서빙
router.get("/blog-articles-image/:slug", async (req: Request, res: Response) => {
  const slug = req.params["slug"] ?? "";
  const result = await pgPool.query<{ image_data: Buffer | null; image_mime: string | null }>(
    `SELECT image_data, image_mime FROM blog_articles WHERE slug = $1`,
    [slug]
  );
  const row = result.rows[0];
  if (!row?.image_data) {
    res.status(404).send("not found");
    return;
  }
  res.set("Content-Type", row.image_mime || "image/webp");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(row.image_data);
});

// POST /api/blog-articles — 관리자 전용, 등록
router.post("/blog-articles", requireAdmin, bustCache, jsonBig, async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      slug?: string; title?: string; description?: string; emoji?: string;
      body?: BodyBlock[]; imageBase64?: string; published?: boolean; scheduledAt?: string; relatedJob?: string; relatedCalculator?: string;
    };
    const slug = (body.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const title = (body.title ?? "").trim();
    const description = (body.description ?? "").trim();
    // 2026-09-02: 이모지 완전 폐지(사용자 지시 — "이모지 아예 넣지마"). 예전엔 emoji가 비어있으면
    // "📝" 기본값으로 강제 대체하던 버그가 있어서(빈 문자열을 보내도 무시됨) 정책이 실제로 적용된
    // 적이 없었다. 이제는 무엇을 보내든 항상 빈 문자열로 저장한다 — 클라이언트가 뭘 보내도 무시.
    const emoji = "";
    const bodyBlocks = Array.isArray(body.body) ? body.body : [];

    if (!slug || !title || !description || bodyBlocks.length === 0) {
      res.status(400).json({ error: "slug·제목·설명·본문은 필수입니다" });
      return;
    }
    const image = decodeImage(body.imageBase64);
    // scheduledAt이 미래 시각이면 예약 발행(그 시각까지 공개 목록에서 숨김), 과거/미지정이면 즉시 공개.
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const scheduledAtIso = scheduledAt && scheduledAt.getTime() > Date.now() ? scheduledAt.toISOString() : null;
    const relatedJob = normalizeRelatedJob(body.relatedJob);
    const relatedCalculator = normalizeRelatedCalculator(body.relatedCalculator);

    const result = await pgPool.query<BlogArticleRow>(
      `INSERT INTO blog_articles (slug, title, description, emoji, body, image_data, image_mime, published, scheduled_at, created_by, related_job, related_calculator)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${SELECT_COLS}`,
      [slug, title, description, emoji, JSON.stringify(bodyBlocks),
        image?.data ?? null, image?.mime ?? null, body.published !== false, scheduledAtIso, creatorInfo(req), relatedJob, relatedCalculator]
    );
    const saved = result.rows[0]!;
    const isLiveNow = saved.published && (!saved.scheduled_at || new Date(saved.scheduled_at).getTime() <= Date.now());
    if (isLiveNow) {
      notifyIndexNow([`https://geonseolup.com/info/${saved.slug}`]).catch(() => {});
    }
    res.json({ ok: true, row: toApi(saved) });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(409).json({ error: "이미 존재하는 slug입니다" });
      return;
    }
    console.error("[BlogArticles] POST error:", err);
    res.status(500).json({ error: "등록 실패" });
  }
});

// PUT /api/blog-articles/:id — 관리자 전용, 수정
router.put("/blog-articles/:id", requireAdmin, bustCache, jsonBig, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    const body = req.body as {
      title?: string; description?: string; emoji?: string;
      body?: BodyBlock[]; imageBase64?: string; published?: boolean; scheduledAt?: string | null; relatedJob?: string; relatedCalculator?: string;
    };
    const title = (body.title ?? "").trim();
    const description = (body.description ?? "").trim();
    // 2026-09-02: 이모지 완전 폐지 — POST와 동일하게 무엇을 보내든 항상 빈 문자열로 저장한다.
    const emoji = "";
    const bodyBlocks = Array.isArray(body.body) ? body.body : [];
    if (!title || !description || bodyBlocks.length === 0) {
      res.status(400).json({ error: "제목·설명·본문은 필수입니다" });
      return;
    }
    const image = decodeImage(body.imageBase64);
    const published = body.published !== false;
    // scheduledAt: undefined면 기존 값 유지, null/빈문자열이면 예약 해제(즉시 공개), 미래 시각이면 예약 갱신.
    const hasScheduledAtField = Object.prototype.hasOwnProperty.call(body, "scheduledAt");
    const scheduledDate = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const scheduledAtIso = scheduledDate && scheduledDate.getTime() > Date.now() ? scheduledDate.toISOString() : null;
    const relatedJob = normalizeRelatedJob(body.relatedJob);
    const relatedCalculator = normalizeRelatedCalculator(body.relatedCalculator);

    const result = image
      ? await pgPool.query<BlogArticleRow>(
          hasScheduledAtField
            ? `UPDATE blog_articles SET title=$1, description=$2, emoji=$3, body=$4,
                 image_data=$5, image_mime=$6, published=$7, scheduled_at=$8, related_job=$9, related_calculator=$10, updated_at=now()
               WHERE id=$11 RETURNING ${SELECT_COLS}`
            : `UPDATE blog_articles SET title=$1, description=$2, emoji=$3, body=$4,
                 image_data=$5, image_mime=$6, published=$7, related_job=$8, related_calculator=$9, updated_at=now()
               WHERE id=$10 RETURNING ${SELECT_COLS}`,
          hasScheduledAtField
            ? [title, description, emoji, JSON.stringify(bodyBlocks), image.data, image.mime, published, scheduledAtIso, relatedJob, relatedCalculator, id]
            : [title, description, emoji, JSON.stringify(bodyBlocks), image.data, image.mime, published, relatedJob, relatedCalculator, id]
        )
      : await pgPool.query<BlogArticleRow>(
          hasScheduledAtField
            ? `UPDATE blog_articles SET title=$1, description=$2, emoji=$3, body=$4,
                 published=$5, scheduled_at=$6, related_job=$7, related_calculator=$8, updated_at=now()
               WHERE id=$9 RETURNING ${SELECT_COLS}`
            : `UPDATE blog_articles SET title=$1, description=$2, emoji=$3, body=$4,
                 published=$5, related_job=$6, related_calculator=$7, updated_at=now()
               WHERE id=$8 RETURNING ${SELECT_COLS}`,
          hasScheduledAtField
            ? [title, description, emoji, JSON.stringify(bodyBlocks), published, scheduledAtIso, relatedJob, relatedCalculator, id]
            : [title, description, emoji, JSON.stringify(bodyBlocks), published, relatedJob, relatedCalculator, id]
        );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "해당 글을 찾을 수 없습니다" });
      return;
    }
    const saved = result.rows[0]!;
    const isLiveNow = saved.published && (!saved.scheduled_at || new Date(saved.scheduled_at).getTime() <= Date.now());
    if (isLiveNow) {
      notifyIndexNow([`https://geonseolup.com/info/${saved.slug}`]).catch(() => {});
    }
    res.json({ ok: true, row: toApi(saved) });
  } catch (err) {
    console.error("[BlogArticles] PUT error:", err);
    res.status(500).json({ error: "수정 실패" });
  }
});

// DELETE /api/blog-articles/:id — 관리자 전용, 삭제
router.delete("/blog-articles/:id", requireAdmin, bustCache, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    await pgPool.query(`DELETE FROM blog_articles WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[BlogArticles] DELETE error:", err);
    res.status(500).json({ error: "삭제 실패" });
  }
});

export default router;
