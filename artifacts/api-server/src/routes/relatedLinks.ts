import { Router, type IRouter, type Request, type Response } from "express";
import { pgPool } from "../lib/db";
import { requireAdmin } from "../lib/adminStore";

const router: IRouter = Router();

export interface RelatedLinkEntry {
  type: "news" | "info";
  slug: string;
  title: string;
}

async function initTable() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS related_links (
      key VARCHAR(200) PRIMARY KEY,
      items JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
const ready = initTable().catch((err) => {
  console.error("[related-links] 테이블 초기화 실패:", err);
});

// 서버 캐시 — site_news/blog_articles와 동일한 패턴(articleMeta.ts TTL 5분).
// 관련 글은 자주 안 바뀌는 데이터라 캐시 미스가 나도 부담 없다.
const TTL_MS = 5 * 60_000;
let _cache: { map: Record<string, RelatedLinkEntry[]>; fetchedAt: number } | null = null;

export function invalidateRelatedLinksCache() {
  _cache = null;
}

async function loadMap(): Promise<Record<string, RelatedLinkEntry[]>> {
  await ready;
  const { rows } = await pgPool.query<{ key: string; items: RelatedLinkEntry[] }>(
    `SELECT key, items FROM related_links`
  );
  const map: Record<string, RelatedLinkEntry[]> = {};
  for (const row of rows) map[row.key] = row.items;
  return map;
}

/** SEO 서버 렌더링(seo.ts)에서 같은 프로세스 내에서 직접 호출하는 용도 — HTTP 왕복 없음. */
export async function getRelatedLinksMap(): Promise<Record<string, RelatedLinkEntry[]>> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < TTL_MS) return _cache.map;
  try {
    const map = await loadMap();
    _cache = { map, fetchedAt: now };
    return map;
  } catch (err) {
    console.error("[related-links] 캐시 갱신 실패:", err);
    return _cache?.map ?? {};
  }
}

// GET /api/related-links — 공개, 캐시 경유. 클라이언트 RelatedLinks 컴포넌트가 사용.
router.get("/related-links", async (_req: Request, res: Response) => {
  try {
    const map = await getRelatedLinksMap();
    res.set("Cache-Control", "public, max-age=60");
    res.json({ map });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/admin/related-links — 관리자/자동화 전용. 글 하나(key)의 관련 글 목록을 등록/교체.
// Body: { key: "news:<slug>" | "info:<slug>", items: [{type, slug, title}, ...] } (1~5개 권장)
router.post("/admin/related-links", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { key, items } = req.body as { key?: string; items?: RelatedLinkEntry[] };
    if (!key || !/^(news|info):.+/.test(key)) {
      res.status(400).json({ ok: false, error: 'key는 "news:slug" 또는 "info:slug" 형태여야 합니다' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 6) {
      res.status(400).json({ ok: false, error: "items는 1~6개의 배열이어야 합니다" });
      return;
    }
    for (const it of items) {
      if (!it || (it.type !== "news" && it.type !== "info") || !it.slug || !it.title) {
        res.status(400).json({ ok: false, error: "items 각 항목은 {type, slug, title}이 모두 필요합니다" });
        return;
      }
    }
    await ready;
    await pgPool.query(
      `INSERT INTO related_links (key, items, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET items = $2::jsonb, updated_at = now()`,
      [key, JSON.stringify(items)]
    );
    invalidateRelatedLinksCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/admin/related-links — 관리자 전용. 전체 매핑 조회(운영 확인용).
router.get("/admin/related-links", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await ready;
    const { rows } = await pgPool.query<{ key: string; items: RelatedLinkEntry[]; updated_at: string }>(
      `SELECT key, items, updated_at FROM related_links ORDER BY updated_at DESC`
    );
    res.json({ ok: true, rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
