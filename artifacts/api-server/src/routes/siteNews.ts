import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { pgPool } from "../lib/db";
import { requireAdmin } from "../lib/adminStore";

const router: IRouter = Router();

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
  `);
}
initTables().catch((e) => console.error("[DB] site_news initTables error:", e));

interface SiteNewsRow {
  id: number;
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
    title: row.title,
    body: row.body,
    imageUrl: row.has_image ? `/api/site-news-image/${row.id}` : null,
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
      `SELECT id, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
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
      `SELECT id, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
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
router.post("/site-news", requireAdmin, jsonBig, async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      title?: string; body?: string; imageBase64?: string;
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

    const result = await pgPool.query<SiteNewsRow>(
      `INSERT INTO site_news (title, body, image_data, image_mime, source_label, source_url, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
                 source_label, source_url, published_at, created_at, updated_at`,
      [
        title, content,
        image?.data ?? null, image?.mime ?? null,
        (body.sourceLabel ?? "").trim() || null,
        (body.sourceUrl ?? "").trim() || null,
        publishedAt.toISOString(),
      ]
    );
    res.json({ ok: true, row: toApi(result.rows[0]!) });
  } catch (err) {
    console.error("[SiteNews] POST error:", err);
    res.status(500).json({ error: "등록 실패" });
  }
});

// PUT /api/site-news/:id — 관리자 전용, 수정 (imageBase64 없으면 기존 이미지 유지)
router.put("/site-news/:id", requireAdmin, jsonBig, async (req: Request, res: Response) => {
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
         RETURNING id, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
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
         RETURNING id, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
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
         RETURNING id, title, body, image_mime, (image_data IS NOT NULL) AS has_image,
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
    res.json({ ok: true, row: toApi(result.rows[0]!) });
  } catch (err) {
    console.error("[SiteNews] PUT error:", err);
    res.status(500).json({ error: "수정 실패" });
  }
});

// DELETE /api/site-news/:id — 관리자 전용, 삭제
router.delete("/site-news/:id", requireAdmin, async (req: Request, res: Response) => {
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
