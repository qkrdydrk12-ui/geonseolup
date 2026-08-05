// ── 관리자용 Google Indexing API 알림 라우트 ────────────────────────────────
// 공고 발행/삭제 시 구글에 색인 요청을 보낸다. (요청 주체는 관리자 세션)
import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/adminStore";
import {
  isIndexingConfigured,
  notifyGoogleIndexing,
  type IndexingNotifyType,
} from "../lib/googleIndexing";

const router = Router();

const SITE_URL = "https://geonseolup.com";

// GET /api/admin/indexing/status — 자격 증명 설정 여부 확인
router.get("/admin/indexing/status", requireAdmin, (_req: Request, res: Response) => {
  res.json({ ok: true, configured: isIndexingConfigured() });
});

// POST /api/admin/indexing/notify — { urls: string[], type: "URL_UPDATED" | "URL_DELETED" }
// urls는 전체 URL 또는 경로(/detail/xxx)를 허용. 최대 50건(쿼터 보호).
router.post("/admin/indexing/notify", requireAdmin, async (req: Request, res: Response) => {
  if (!isIndexingConfigured()) {
    res.status(503).json({ ok: false, message: "Google Indexing 자격 증명이 설정되지 않았습니다" });
    return;
  }
  const { urls, type } = req.body as { urls?: unknown; type?: unknown };
  const notifyType: IndexingNotifyType = type === "URL_DELETED" ? "URL_DELETED" : "URL_UPDATED";
  if (!Array.isArray(urls) || urls.length === 0) {
    res.status(400).json({ ok: false, message: "urls 배열이 필요합니다" });
    return;
  }
  const list = urls
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .slice(0, 50)
    .map((u) => (u.startsWith("http") ? u : `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`))
    // 우리 도메인 URL만 허용
    .filter((u) => u.startsWith(`${SITE_URL}/`) || u === SITE_URL);

  if (list.length === 0) {
    res.status(400).json({ ok: false, message: "유효한 URL이 없습니다" });
    return;
  }

  const results: Array<{ url: string; ok: boolean }> = [];
  for (const url of list) {
    const ok = await notifyGoogleIndexing(url, notifyType);
    results.push({ url, ok });
  }
  const succeeded = results.filter((r) => r.ok).length;
  res.json({ ok: succeeded > 0, total: results.length, succeeded, results });
});

export default router;
