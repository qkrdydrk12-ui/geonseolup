import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { pgPool } from "../lib/db";
import { requireAdmin, getTokenFromReq, isTokenValid } from "../lib/adminStore";

const router: IRouter = Router();

const jsonBig = express.json({ limit: "8mb" });

async function initTables() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS toon_episodes (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(150) UNIQUE NOT NULL,
      title VARCHAR(200) NOT NULL,
      description VARCHAR(300) NOT NULL,
      disclaimer VARCHAR(300) NOT NULL DEFAULT '이 이야기는 반도체 현장 실제 경험을 바탕으로 각색한 풍자 웹툰입니다. 등장인물 이름은 모두 허구입니다.',
      episode_number INT NOT NULL DEFAULT 1,
      published BOOLEAN NOT NULL DEFAULT true,
      scheduled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_toon_episodes_number ON toon_episodes(episode_number DESC);

    CREATE TABLE IF NOT EXISTS toon_panels (
      id SERIAL PRIMARY KEY,
      episode_id INT NOT NULL REFERENCES toon_episodes(id) ON DELETE CASCADE,
      panel_index INT NOT NULL,
      image_data BYTEA NOT NULL,
      image_mime VARCHAR(50) NOT NULL,
      caption VARCHAR(300),
      UNIQUE(episode_id, panel_index)
    );
  `);
}
initTables().catch((e) => console.error("[DB] toon_episodes initTables error:", e));

function creatorInfo(req: Request): string {
  const rawUploader = req.get("x-uploader") ?? "";
  let uploader = "미상";
  try {
    uploader = decodeURIComponent(rawUploader).trim().slice(0, 50) || "미상";
  } catch {
    uploader = rawUploader.trim().slice(0, 50) || "미상";
  }
  const ip = (req.get("x-forwarded-for") ?? req.ip ?? "").split(",")[0]!.trim();
  return `${uploader} | ip:${ip}`.slice(0, 300);
}

interface EpisodeRow {
  id: number;
  slug: string;
  title: string;
  description: string;
  disclaimer: string;
  episode_number: number;
  published: boolean;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  panel_count: string; // count(*) comes back as string from pg
}

const LIST_COLS = `e.id, e.slug, e.title, e.description, e.disclaimer, e.episode_number,
  e.published, e.scheduled_at, e.created_at, e.updated_at, e.created_by,
  (SELECT count(*) FROM toon_panels p WHERE p.episode_id = e.id) AS panel_count`;

function toApiListItem(row: EpisodeRow, includeCreator = false) {
  const base = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    disclaimer: row.disclaimer,
    episodeNumber: row.episode_number,
    panelCount: Number(row.panel_count),
    coverImageUrl: `/api/toon-panel-image/${row.slug}/0?v=${new Date(row.updated_at).getTime()}`,
    published: row.published,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return includeCreator ? { ...base, createdBy: row.created_by ?? null } : base;
}

function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 100) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return true;
  return false;
}

function decodeImage(imageBase64?: string): { data: Buffer; mime: string } | null {
  if (!imageBase64) return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
  const data = match ? Buffer.from(match[2]!, "base64") : Buffer.from(imageBase64, "base64");
  const mime = match ? match[1]! : "image/webp";
  if (!looksLikeImage(data)) return null;
  return { data, mime };
}

// GET /api/toon — 공개, 발행된 에피소드 최신순(episode_number 내림차순)
router.get("/toon", async (_req: Request, res: Response) => {
  try {
    const result = await pgPool.query<EpisodeRow>(
      `SELECT ${LIST_COLS} FROM toon_episodes e
       WHERE published = true AND (scheduled_at IS NULL OR scheduled_at <= now())
       ORDER BY episode_number DESC LIMIT 100`
    );
    res.json({ rows: result.rows.map((r) => toApiListItem(r)) });
  } catch (err) {
    console.error("[Toon] GET list error:", err);
    res.status(500).json({ error: "노가다툰 목록 조회 실패" });
  }
});

// GET /api/toon/all — 관리자 전용, 비공개 포함 전체
router.get("/toon/all", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await pgPool.query<EpisodeRow>(
      `SELECT ${LIST_COLS} FROM toon_episodes e ORDER BY episode_number DESC LIMIT 300`
    );
    res.json({ rows: result.rows.map((r) => toApiListItem(r, true)) });
  } catch (err) {
    console.error("[Toon] GET all error:", err);
    res.status(500).json({ error: "노가다툰 목록 조회 실패" });
  }
});

// GET /api/toon/:slug — 공개, 단일 에피소드 상세(패널 목록 포함)
router.get("/toon/:slug", async (req: Request, res: Response) => {
  try {
    const slug = req.params["slug"] ?? "";
    const epResult = await pgPool.query<EpisodeRow>(
      `SELECT ${LIST_COLS} FROM toon_episodes e WHERE e.slug = $1`,
      [slug]
    );
    const ep = epResult.rows[0];
    if (!ep) {
      res.status(404).json({ error: "해당 에피소드를 찾을 수 없습니다" });
      return;
    }
    const isLive = ep.published && (!ep.scheduled_at || new Date(ep.scheduled_at).getTime() <= Date.now());
    const isAdmin = isTokenValid(getTokenFromReq(req));
    if (!isLive && !isAdmin) {
      res.status(404).json({ error: "해당 에피소드를 찾을 수 없습니다" });
      return;
    }
    const panelsResult = await pgPool.query<{ panel_index: number; caption: string | null }>(
      `SELECT panel_index, caption FROM toon_panels WHERE episode_id = $1 ORDER BY panel_index ASC`,
      [ep.id]
    );
    const v = new Date(ep.updated_at).getTime();
    res.json({
      row: {
        ...toApiListItem(ep),
        panels: panelsResult.rows.map((p) => ({
          index: p.panel_index,
          caption: p.caption,
          imageUrl: `/api/toon-panel-image/${slug}/${p.panel_index}?v=${v}`,
        })),
      },
    });
  } catch (err) {
    console.error("[Toon] GET detail error:", err);
    res.status(500).json({ error: "에피소드 조회 실패" });
  }
});

// GET /api/toon-panel-image/:slug/:index — 공개, 패널 이미지 서빙
router.get("/toon-panel-image/:slug/:index", async (req: Request, res: Response) => {
  const slug = req.params["slug"] ?? "";
  const index = Number(req.params["index"]);
  const result = await pgPool.query<{ image_data: Buffer; image_mime: string }>(
    `SELECT p.image_data, p.image_mime FROM toon_panels p
     JOIN toon_episodes e ON e.id = p.episode_id
     WHERE e.slug = $1 AND p.panel_index = $2`,
    [slug, index]
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

interface PanelInput {
  imageBase64: string;
  caption?: string;
}

// POST /api/toon — 관리자 전용, 새 에피소드 등록
router.post("/toon", requireAdmin, jsonBig, async (req: Request, res: Response) => {
  const client = await pgPool.connect();
  try {
    const body = req.body as {
      slug?: string; title?: string; description?: string; disclaimer?: string;
      episodeNumber?: number; panels?: PanelInput[]; published?: boolean; scheduledAt?: string;
    };
    const slug = (body.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const title = (body.title ?? "").trim();
    const description = (body.description ?? "").trim();
    const disclaimer = (body.disclaimer ?? "").trim() ||
      "이 이야기는 반도체 현장 실제 경험을 바탕으로 각색한 풍자 웹툰입니다. 등장인물 이름은 모두 허구입니다.";
    const episodeNumber = Number(body.episodeNumber) || 1;
    const panels = Array.isArray(body.panels) ? body.panels : [];

    if (!slug || !title || !description || panels.length === 0) {
      res.status(400).json({ error: "slug·제목·설명·패널 이미지는 필수입니다" });
      return;
    }
    const decoded = panels.map((p) => decodeImage(p.imageBase64));
    if (decoded.some((d) => !d)) {
      res.status(400).json({ error: "패널 이미지 중 인식할 수 없는 파일이 있습니다" });
      return;
    }
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const scheduledAtIso = scheduledAt && scheduledAt.getTime() > Date.now() ? scheduledAt.toISOString() : null;

    await client.query("BEGIN");
    const epResult = await client.query<{ id: number }>(
      `INSERT INTO toon_episodes (slug, title, description, disclaimer, episode_number, published, scheduled_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [slug, title, description, disclaimer, episodeNumber, body.published !== false, scheduledAtIso, creatorInfo(req)]
    );
    const episodeId = epResult.rows[0]!.id;
    for (let i = 0; i < panels.length; i++) {
      const d = decoded[i]!;
      await client.query(
        `INSERT INTO toon_panels (episode_id, panel_index, image_data, image_mime, caption) VALUES ($1,$2,$3,$4,$5)`,
        [episodeId, i, d!.data, d!.mime, panels[i]!.caption ?? null]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, id: episodeId, slug });
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(409).json({ error: "이미 존재하는 slug입니다" });
      return;
    }
    console.error("[Toon] POST error:", err);
    res.status(500).json({ error: "등록 실패" });
  } finally {
    client.release();
  }
});

// PUT /api/toon/:id — 관리자 전용, 수정(메타 정보 + 패널 전체 교체)
router.put("/toon/:id", requireAdmin, jsonBig, async (req: Request, res: Response) => {
  const client = await pgPool.connect();
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    const body = req.body as {
      title?: string; description?: string; disclaimer?: string; episodeNumber?: number;
      panels?: PanelInput[]; published?: boolean; scheduledAt?: string | null;
    };
    const title = (body.title ?? "").trim();
    const description = (body.description ?? "").trim();
    const disclaimer = (body.disclaimer ?? "").trim();
    const episodeNumber = Number(body.episodeNumber) || 1;
    const published = body.published !== false;
    const hasScheduledAtField = Object.prototype.hasOwnProperty.call(body, "scheduledAt");
    const scheduledDate = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const scheduledAtIso = scheduledDate && scheduledDate.getTime() > Date.now() ? scheduledDate.toISOString() : null;

    if (!title || !description) {
      res.status(400).json({ error: "제목·설명은 필수입니다" });
      return;
    }

    await client.query("BEGIN");
    const result = await client.query(
      hasScheduledAtField
        ? `UPDATE toon_episodes SET title=$1, description=$2, disclaimer=$3, episode_number=$4, published=$5, scheduled_at=$6, updated_at=now() WHERE id=$7 RETURNING id`
        : `UPDATE toon_episodes SET title=$1, description=$2, disclaimer=$3, episode_number=$4, published=$5, updated_at=now() WHERE id=$6 RETURNING id`,
      hasScheduledAtField
        ? [title, description, disclaimer, episodeNumber, published, scheduledAtIso, id]
        : [title, description, disclaimer, episodeNumber, published, id]
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "해당 에피소드를 찾을 수 없습니다" });
      return;
    }

    if (Array.isArray(body.panels) && body.panels.length > 0) {
      const decoded = body.panels.map((p) => decodeImage(p.imageBase64));
      if (decoded.some((d) => !d)) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "패널 이미지 중 인식할 수 없는 파일이 있습니다" });
        return;
      }
      await client.query(`DELETE FROM toon_panels WHERE episode_id = $1`, [id]);
      for (let i = 0; i < body.panels.length; i++) {
        const d = decoded[i]!;
        await client.query(
          `INSERT INTO toon_panels (episode_id, panel_index, image_data, image_mime, caption) VALUES ($1,$2,$3,$4,$5)`,
          [id, i, d!.data, d!.mime, body.panels[i]!.caption ?? null]
        );
      }
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Toon] PUT error:", err);
    res.status(500).json({ error: "수정 실패" });
  } finally {
    client.release();
  }
});

// DELETE /api/toon/:id — 관리자 전용, 삭제(패널은 CASCADE)
router.delete("/toon/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    await pgPool.query(`DELETE FROM toon_episodes WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Toon] DELETE error:", err);
    res.status(500).json({ error: "삭제 실패" });
  }
});

export default router;
