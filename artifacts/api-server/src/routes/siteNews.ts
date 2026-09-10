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

// 큰 이미지(base64)를 담아 보내는 라우트라 기본 100kb 제한을 이 라우터에서만 올림
const jsonBig = express.json({ limit: "8mb" });

// 테이블 자동 생성
async function initTables() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS site_news (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      image_data BYTEA,
      image_mime VARCHAR(50),
      source_label VARCHAR(50),
      source_url VARCHAR(300),
      published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_site_news_published ON site_news(published_at DESC);
    -- 2026-08-08: 개별 상세 URL(/news/:slug) + SEO(NewsArticle) 연결을 위해 slug 추가.
    ALTER TABLE site_news ADD COLUMN IF NOT EXISTS slug VARCHAR(150);
  `);
  // 기존에 slug 없이 등록된 글(마이그레이션 이전 데이터)에 제목 기반 slug를 채워준다.
  const { rows } = await pgPool.query<{ id: number; title: string }>(
    `SELECT id, title FROM site_news WHERE slug IS NULL OR slug = ''`
  );
  for (const row of rows) {
    const slug = await uniqueSlugFor(row.title, row.id);
    await pgPool.query(`UPDATE site_news SET slug = $1 WHERE id = $2`, [slug, row.id]);
  }
  await pgPool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_site_news_slug ON site_news(slug) WHERE slug IS NOT NULL`
  );
}
initTables().catch((e) => console.error("[DB] site_news initTables error:", e));

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "news";
}

async function uniqueSlugFor(title: string, excludeId?: number): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let n = 2;
  for (;;) {
    const { rows } = await pgPool.query<{ id: number }>(
      `SELECT id FROM site_news WHERE slug = $1`,
      [candidate]
    );
    const taken = rows.some((r) => r.id !== excludeId);
    if (!taken) return candidate;
    candidate = `${base}-${n}`;
    n++;
  }
}

interface SiteNewsRow {
  id: number;
  slug: string | null;
  title: string;
  body: string;
  image_mime: string | null;
  has_image: boolean;
  source_label: string | null;
  source_url: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
}

function toApi(row: SiteNewsRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    imageUrl: row.has_image
      ? `/api/site-news-image/${row.id}?v=${new Date(row.updated_at).getTime()}`
      : null,
    sourceLabel: row.source_label ?? "",
    sourceUrl: row.source_url ?? "",
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function decodeImage(imageBase64?: string): { data: Buffer; mime: string } | null {
  if (!imageBase64) return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
  if (match) {
    return { data: Buffer.from(match[2]!, "base64"), mime: match[1]! };
  }
  // data URL 접두어 없이 순수 base64만 온 경우 PNG로 가정
  return { data: Buffer.from(imageBase64, "base64"), mime: "image/png" };
}

// GET /api/site-news — 공개, 최신순 목록 (이미지 바이트는 제외, hasImage만)
router.get("/site-news", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query["limit"]) || 30, 100);
    const result = await pgPool.query<SiteNewsRow>(
      `SELECT id, slug, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
              source_label, source_url, published_at, created_at, updated_at
       FROM site_news
       WHERE published_at <= now()
       ORDER BY published_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ rows: result.rows.map(toApi) });
  } catch (err) {
    console.error("[SiteNews] GET list error:", err);
    res.status(500).json({ error: "현장 소식 조회 실패" });
  }
});

// GET /api/site-news/all — 관리자 전용, 예약 포함 전체 목록
router.get("/site-news/all", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await pgPool.query<SiteNewsRow>(
      `SELECT id, slug, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
              source_label, source_url, published_at, created_at, updated_at
       FROM site_news
       ORDER BY published_at DESC
       LIMIT 200`
    );
    res.json({ rows: result.rows.map(toApi) });
  } catch (err) {
    console.error("[SiteNews] GET all error:", err);
    res.status(500).json({ error: "현장 소식 조회 실패" });
  }
});

// GET /api/site-news/by-slug/:slug — 공개, 상세 페이지(NewsDetail.tsx)·SEO 라우트에서 사용
router.get("/site-news/by-slug/:slug", async (req: Request, res: Response) => {
  try {
    const slug = String(req.params["slug"]);
    const result = await pgPool.query<SiteNewsRow>(
      `SELECT id, slug, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
              source_label, source_url, published_at, created_at, updated_at
       FROM site_news
       WHERE slug = $1 AND published_at <= now()`,
      [slug]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ row: toApi(row) });
  } catch (err) {
    console.error("[SiteNews] GET by-slug error:", err);
    res.status(500).json({ error: "조회 실패" });
  }
});

// POST /api/site-news/:slug/view — 조회 기록 (관리자 통계용, 인증 불필요, 하루 1회/IP만 카운트).
router.post("/site-news/:slug/view", async (req: Request, res: Response) => {
  try {
    const ip = extractIp(req);
    const counted = await recordContentView("news", String(req.params["slug"]), ip);
    res.json({ ok: true, counted });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/site-news/:slug/engagement — 공개, 조회수·좋아요 수·내가 좋아요 눌렀는지 조회.
router.get("/site-news/:slug/engagement", async (req: Request, res: Response) => {
  try {
    const ip = extractIp(req);
    const data = await getEngagement("news", String(req.params["slug"]), ip);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/site-news/:slug/like — 공개, 좋아요 토글(누르면 등록, 다시 누르면 취소). 인증 불필요.
router.post("/site-news/:slug/like", async (req: Request, res: Response) => {
  try {
    const ip = extractIp(req);
    const result = await toggleLike("news", String(req.params["slug"]), ip);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/site-news/:slug/comments — 공개, 댓글 목록 조회.
router.get("/site-news/:slug/comments", async (req: Request, res: Response) => {
  try {
    const rows = await getComments("news", String(req.params["slug"]));
    res.json({ ok: true, rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/site-news/:slug/comments — 공개, 댓글 작성. 인증 불필요(로그인 없는 사이트).
router.post("/site-news/:slug/comments", async (req: Request, res: Response) => {
  try {
    const ip = extractIp(req);
    const body = req.body as { author?: string; body?: string };
    const result = await addComment("news", String(req.params["slug"]), ip, body.author ?? "", body.body ?? "");
    if (!result.ok) {
      res.status(400).json({ ok: false, reason: result.reason });
      return;
    }
    res.json({ ok: true, comment: result.comment });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/site-news-image/:id — 공개, 이미지 서빙
router.get("/site-news-image/:id", async (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).send("invalid id");
    return;
  }
  const result = await pgPool.query<{ image_data: Buffer | null; image_mime: string | null }>(
    `SELECT image_data, image_mime FROM site_news WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row?.image_data) {
    res.status(404).send("not found");
    return;
  }
  res.set("Content-Type", row.image_mime || "image/png");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(row.image_data);
});

// POST /api/site-news — 관리자 전용, 등록
router.post("/site-news", requireAdmin, bustCache, jsonBig, async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      title?: string; body?: string; imageBase64?: string; slug?: string;
      sourceLabel?: string; sourceUrl?: string; publishedAt?: string;
    };
    const title = (body.title ?? "").trim();
    const content = (body.body ?? "").trim();
    if (!title || !content) {
      res.status(400).json({ error: "제목과 본문은 필수입니다" });
      return;
    }
    const image = decodeImage(body.imageBase64);
    const publishedAt = body.publishedAt ? new Date(body.publishedAt) : new Date();
    const requestedSlug = (body.slug ?? "").trim();
    const slug = await uniqueSlugFor(requestedSlug ? slugify(requestedSlug) : title);

    const result = await pgPool.query<SiteNewsRow>(
      `INSERT INTO site_news (title, body, image_data, image_mime, source_label, source_url, published_at, slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, slug, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
                 source_label, source_url, published_at, created_at, updated_at`,
      [
        title, content,
        image?.data ?? null, image?.mime ?? null,
        (body.sourceLabel ?? "").trim() || null,
        (body.sourceUrl ?? "").trim() || null,
        publishedAt.toISOString(),
        slug,
      ]
    );
    const saved = result.rows[0]!;
    if (new Date(saved.published_at).getTime() <= Date.now()) {
      notifyIndexNow([`https://geonseolup.com/news/${saved.slug}`]).catch(() => {});
    }
    res.json({ ok: true, row: toApi(saved) });
  } catch (err) {
    console.error("[SiteNews] POST error:", err);
    res.status(500).json({ error: "등록 실패" });
  }
});

// PUT /api/site-news/:id — 관리자 전용, 수정 (imageBase64 없으면 기존 이미지 유지)
router.put("/site-news/:id", requireAdmin, bustCache, jsonBig, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    const body = req.body as {
      title?: string; body?: string; imageBase64?: string; removeImage?: boolean;
      sourceLabel?: string; sourceUrl?: string; publishedAt?: string;
    };
    const title = (body.title ?? "").trim();
    const content = (body.body ?? "").trim();
    if (!title || !content) {
      res.status(400).json({ error: "제목과 본문은 필수입니다" });
      return;
    }
    const image = decodeImage(body.imageBase64);
    const publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;

    let result;
    if (image) {
      result = await pgPool.query<SiteNewsRow>(
        `UPDATE site_news
         SET title = $1, body = $2, image_data = $3, image_mime = $4,
             source_label = $5, source_url = $6,
             published_at = COALESCE($7, published_at), updated_at = now()
         WHERE id = $8
         RETURNING id, slug, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
                   source_label, source_url, published_at, created_at, updated_at`,
        [title, content, image.data, image.mime,
          (body.sourceLabel ?? "").trim() || null, (body.sourceUrl ?? "").trim() || null,
          publishedAt ? publishedAt.toISOString() : null, id]
      );
    } else if (body.removeImage) {
      result = await pgPool.query<SiteNewsRow>(
        `UPDATE site_news
         SET title = $1, body = $2, image_data = NULL, image_mime = NULL,
             source_label = $3, source_url = $4,
             published_at = COALESCE($5, published_at), updated_at = now()
         WHERE id = $6
         RETURNING id, slug, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
                   source_label, source_url, published_at, created_at, updated_at`,
        [title, content,
          (body.sourceLabel ?? "").trim() || null, (body.sourceUrl ?? "").trim() || null,
          publishedAt ? publishedAt.toISOString() : null, id]
      );
    } else {
      result = await pgPool.query<SiteNewsRow>(
        `UPDATE site_news
         SET title = $1, body = $2,
             source_label = $3, source_url = $4,
             published_at = COALESCE($5, published_at), updated_at = now()
         WHERE id = $6
         RETURNING id, slug, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
                   source_label, source_url, published_at, created_at, updated_at`,
        [title, content,
          (body.sourceLabel ?? "").trim() || null, (body.sourceUrl ?? "").trim() || null,
          publishedAt ? publishedAt.toISOString() : null, id]
      );
    }

    if (result.rows.length === 0) {
      res.status(404).json({ error: "해당 항목을 찾을 수 없습니다" });
      return;
    }
    const saved = result.rows[0]!;
    if (new Date(saved.published_at).getTime() <= Date.now()) {
      notifyIndexNow([`https://geonseolup.com/news/${saved.slug}`]).catch(() => {});
    }
    res.json({ ok: true, row: toApi(saved) });
  } catch (err) {
    console.error("[SiteNews] PUT error:", err);
    res.status(500).json({ error: "수정 실패" });
  }
});

// DELETE /api/site-news/:id — 관리자 전용, 삭제
router.delete("/site-news/:id", requireAdmin, bustCache, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    await pgPool.query(`DELETE FROM site_news WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[SiteNews] DELETE error:", err);
    res.status(500).json({ error: "삭제 실패" });
  }
});

export default router;
