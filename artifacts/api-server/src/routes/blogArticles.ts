import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { pgPool } from "../lib/db";
import { requireAdmin } from "../lib/adminStore";
import { notifyIndexNow } from "../lib/indexNow";
import { notifyGoogleIndexing } from "../lib/googleIndexing";
import { invalidateArticleCaches } from "../lib/articleMeta";

const router: IRouter = Router();

// 글 등록/수정/삭제가 끝나면 SEO·사이트맵·OG 캐시를 즉시 비운다 (새 글 바로 반영).
function bustCache(_req: Request, res: Response, next: () => void) {
  res.on("finish", () => invalidateArticleCaches());
  next();
}

const jsonBig = express.json({ limit: "8mb" });

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
  `);
  // 잘못 저장된 깨진 이미지(수십 바이트짜리 쓰레기 데이터) 자동 정리 — 목록에서 엑박 방지
  await pgPool.query(
    `UPDATE blog_articles SET image_data = NULL, image_mime = NULL
     WHERE image_data IS NOT NULL AND length(image_data) < 100`
  );
}

// 누가 올렸는지 추적용: X-Uploader 헤더(도구 이름) + 접속 IP + 브라우저 정보를 기록
function creatorInfo(req: Request): string {
  const uploader = (req.get("x-uploader") ?? "").trim().slice(0, 50) || "미상";
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
  created_at: string;
  updated_at: string;
  created_by?: string | null;
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
    imageUrl: row.has_image ? `/api/blog-articles-image/${row.slug}` : null,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  (image_data IS NOT NULL AND length(image_data) > 100) AS has_image, published, created_at, updated_at, created_by`;

// GET /api/blog-articles — 공개, 발행된 글 최신순
router.get("/blog-articles", async (_req: Request, res: Response) => {
  try {
    const result = await pgPool.query<BlogArticleRow>(
      `SELECT ${SELECT_COLS} FROM blog_articles WHERE published = true ORDER BY created_at DESC LIMIT 100`
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
      body?: BodyBlock[]; imageBase64?: string; published?: boolean;
    };
    const slug = (body.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const title = (body.title ?? "").trim();
    const description = (body.description ?? "").trim();
    const emoji = (body.emoji ?? "📝").trim() || "📝";
    const bodyBlocks = Array.isArray(body.body) ? body.body : [];

    if (!slug || !title || !description || bodyBlocks.length === 0) {
      res.status(400).json({ error: "slug·제목·설명·본문은 필수입니다" });
      return;
    }
    const image = decodeImage(body.imageBase64);

    const result = await pgPool.query<BlogArticleRow>(
      `INSERT INTO blog_articles (slug, title, description, emoji, body, image_data, image_mime, published, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECT_COLS}`,
      [slug, title, description, emoji, JSON.stringify(bodyBlocks),
        image?.data ?? null, image?.mime ?? null, body.published !== false, creatorInfo(req)]
    );
    const saved = result.rows[0]!;
    if (saved.published) {
      notifyIndexNow([`https://geonseolup.com/info/${saved.slug}`]).catch(() => {});
      notifyGoogleIndexing(`https://geonseolup.com/info/${saved.slug}`, "URL_UPDATED").catch(() => {});
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
      body?: BodyBlock[]; imageBase64?: string; published?: boolean;
    };
    const title = (body.title ?? "").trim();
    const description = (body.description ?? "").trim();
    const emoji = (body.emoji ?? "📝").trim() || "📝";
    const bodyBlocks = Array.isArray(body.body) ? body.body : [];
    if (!title || !description || bodyBlocks.length === 0) {
      res.status(400).json({ error: "제목·설명·본문은 필수입니다" });
      return;
    }
    const image = decodeImage(body.imageBase64);
    const published = body.published !== false;

    const result = image
      ? await pgPool.query<BlogArticleRow>(
          `UPDATE blog_articles SET title=$1, description=$2, emoji=$3, body=$4,
             image_data=$5, image_mime=$6, published=$7, updated_at=now()
           WHERE id=$8 RETURNING ${SELECT_COLS}`,
          [title, description, emoji, JSON.stringify(bodyBlocks), image.data, image.mime, published, id]
        )
      : await pgPool.query<BlogArticleRow>(
          `UPDATE blog_articles SET title=$1, description=$2, emoji=$3, body=$4,
             published=$5, updated_at=now()
           WHERE id=$6 RETURNING ${SELECT_COLS}`,
          [title, description, emoji, JSON.stringify(bodyBlocks), published, id]
        );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "해당 글을 찾을 수 없습니다" });
      return;
    }
    const saved = result.rows[0]!;
    if (saved.published) {
      notifyIndexNow([`https://geonseolup.com/info/${saved.slug}`]).catch(() => {});
      notifyGoogleIndexing(`https://geonseolup.com/info/${saved.slug}`, "URL_UPDATED").catch(() => {});
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
