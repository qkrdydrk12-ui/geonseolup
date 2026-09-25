import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { pgPool } from "../lib/db";
import { requireAdmin } from "../lib/adminStore";

const router: IRouter = Router();

const jsonBig = express.json({ limit: "15mb" });

async function initTables() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS quality_topics (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) NOT NULL,
      category VARCHAR(100) NOT NULL,
      title VARCHAR(200) NOT NULL,
      slug VARCHAR(150) UNIQUE NOT NULL,
      summary VARCHAR(300) NOT NULL,
      keywords JSONB NOT NULL DEFAULT '[]',
      body JSONB NOT NULL DEFAULT '[]',
      images JSONB NOT NULL DEFAULT '[]',
      source_page INTEGER,
      published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS quality_topics_code_key ON quality_topics(code);
    CREATE INDEX IF NOT EXISTS idx_quality_topics_category ON quality_topics(category);
  `);
}
initTables().catch((e) => console.error("[DB] quality_topics initTables error:", e));

interface BodyBlock { subtitle?: string; text: string }
interface ImageBlock { imageBase64: string; caption?: string; kind?: string }

interface QualityTopicRow {
  id: number;
  code: string;
  category: string;
  title: string;
  slug: string;
  summary: string;
  keywords: string[];
  body: BodyBlock[];
  images: ImageBlock[];
  source_page: number | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

function toApiList(row: QualityTopicRow & { thumb?: string | null }) {
  return {
    id: row.id,
    code: row.code,
    category: row.category,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    keywords: row.keywords,
    thumbnail: row.thumb ?? null,
    sourcePage: row.source_page,
  };
}

function toApiDetail(row: QualityTopicRow) {
  return {
    id: row.id,
    code: row.code,
    category: row.category,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    keywords: row.keywords,
    body: row.body,
    images: row.images,
    sourcePage: row.source_page,
    updatedAt: row.updated_at,
  };
}

const SELECT_LIST = `id, code, category, title, slug, summary, keywords,
  (images -> 0 ->> 'imageBase64') AS thumb, source_page`;

// GET /api/quality-topics — 공개, 전체 목록(경량 — body/images 전체 대신 썸네일 1장만 SQL에서 추출).
// ⚠️ 2026-09-25 사고: images 컬럼 전체(코덱스 생성 이미지, 장당 1~3MB)를 그대로 SELECT해서 161건 쌓이니
// 응답이 너무 커져 500 에러가 났다(blog_articles 37MB 사고와 동일 패턴). 절대 images 전체를 목록에서 select하지 않는다.
router.get("/quality-topics", async (_req: Request, res: Response) => {
  try {
    const result = await pgPool.query(
      `SELECT id, code, category, title, slug, summary, keywords, source_page,
        (images -> 0 ->> 'imageBase64') AS thumb
       FROM quality_topics WHERE published = true ORDER BY code ASC LIMIT 1000`
    );
    res.json({ rows: result.rows.map((r) => toApiList(r)) });
  } catch (err) {
    console.error("[Quality] GET list error:", err);
    res.status(500).json({ error: "품질기준 목록 조회 실패" });
  }
});

// GET /api/quality-topics/all — 관리자 전용, 비공개 포함 전체 (마찬가지로 썸네일만, images 전체 금지)
router.get("/quality-topics/all", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await pgPool.query(
      `SELECT id, code, category, title, slug, summary, keywords, source_page, published,
        (images -> 0 ->> 'imageBase64') AS thumb
       FROM quality_topics ORDER BY code ASC LIMIT 1000`
    );
    res.json({ rows: result.rows.map((r) => ({ ...toApiList(r), published: r.published })) });
  } catch (err) {
    console.error("[Quality] GET all error:", err);
    res.status(500).json({ error: "품질기준 목록 조회 실패" });
  }
});

// GET /api/quality-topics/:slug — 공개, 단건 상세(body+images 포함)
router.get("/quality-topics/:slug", async (req: Request, res: Response) => {
  try {
    const result = await pgPool.query<QualityTopicRow>(
      `SELECT id, code, category, title, slug, summary, keywords, body, images, source_page, published, created_at, updated_at
       FROM quality_topics WHERE slug = $1 AND published = true LIMIT 1`,
      [req.params["slug"]]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "해당 품질기준 항목을 찾을 수 없습니다" });
      return;
    }
    res.json(toApiDetail(row));
  } catch (err) {
    console.error("[Quality] GET one error:", err);
    res.status(500).json({ error: "품질기준 상세 조회 실패" });
  }
});

// POST /api/quality-topics — 관리자 전용, 등록(스크립트 일괄입력용)
router.post("/quality-topics", requireAdmin, jsonBig, async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      code?: string; category?: string; title?: string; slug?: string; summary?: string;
      keywords?: string[]; body?: BodyBlock[]; images?: ImageBlock[]; sourcePage?: number; published?: boolean;
    };
    const code = (body.code ?? "").trim();
    const category = (body.category ?? "").trim();
    const title = (body.title ?? "").trim();
    const slug = (body.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const summary = (body.summary ?? "").trim();
    if (!code || !category || !title || !slug || !summary) {
      res.status(400).json({ error: "code·category·title·slug·summary는 필수입니다" });
      return;
    }
    const result = await pgPool.query<QualityTopicRow>(
      `INSERT INTO quality_topics (code, category, title, slug, summary, keywords, body, images, source_page, published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, code, category, title, slug, summary, keywords, body, images, source_page, published, created_at, updated_at`,
      [code, category, title, slug, summary,
        JSON.stringify(body.keywords ?? []), JSON.stringify(body.body ?? []), JSON.stringify(body.images ?? []),
        body.sourcePage ?? null, body.published !== false]
    );
    res.json({ ok: true, row: toApiDetail(result.rows[0]!) });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(409).json({ error: "이미 존재하는 code 또는 slug입니다" });
      return;
    }
    console.error("[Quality] POST error:", err);
    res.status(500).json({ error: "등록 실패" });
  }
});

// PUT /api/quality-topics/:id — 관리자 전용, 수정
router.put("/quality-topics/:id", requireAdmin, jsonBig, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    const body = req.body as {
      category?: string; title?: string; summary?: string;
      keywords?: string[]; body?: BodyBlock[]; images?: ImageBlock[]; published?: boolean;
    };
    const result = await pgPool.query<QualityTopicRow>(
      `UPDATE quality_topics SET category=$1, title=$2, summary=$3, keywords=$4, body=$5, images=$6, published=$7, updated_at=now()
       WHERE id=$8
       RETURNING id, code, category, title, slug, summary, keywords, body, images, source_page, published, created_at, updated_at`,
      [
        (body.category ?? "").trim(), (body.title ?? "").trim(), (body.summary ?? "").trim(),
        JSON.stringify(body.keywords ?? []), JSON.stringify(body.body ?? []), JSON.stringify(body.images ?? []),
        body.published !== false, id,
      ]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "해당 항목을 찾을 수 없습니다" });
      return;
    }
    res.json({ ok: true, row: toApiDetail(result.rows[0]!) });
  } catch (err) {
    console.error("[Quality] PUT error:", err);
    res.status(500).json({ error: "수정 실패" });
  }
});

// DELETE /api/quality-topics/:id — 관리자 전용, 삭제
router.delete("/quality-topics/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    await pgPool.query(`DELETE FROM quality_topics WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Quality] DELETE error:", err);
    res.status(500).json({ error: "삭제 실패" });
  }
});

export default router;
