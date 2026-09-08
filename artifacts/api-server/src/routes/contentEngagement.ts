// ── 관리자용 콘텐츠(건설꿀팁/현장소식/노가다툰) 조회수·좋아요 조회 라우트 ──────
// 각 관리자 목록 화면(AdminBlogArticles/AdminSiteNews/AdminToon)이 이 엔드포인트를
// 한 번씩 호출해서 slug별 조회수·좋아요 수를 표시한다. 조회 기록 자체는 각 콘텐츠
// 라우트(blogArticles.ts/siteNews.ts/toon.ts)의 POST .../:slug/view 에서 이뤄진다.
import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/adminStore";
import { getAllCounts, getRangedCounts, CONTENT_TYPES, type ContentType } from "../lib/contentEngagement.js";

const router = Router();

// GET /api/admin/content-views?type=blog|news|toon&range=today|yesterday|7|14|30
// range를 안 주면(기존 호출자들 — AdminBlogArticles/AdminSiteNews/AdminToon 목록 화면) 예전과
// 동일하게 전체 누적으로 응답한다. range를 주면(콘텐츠 성과 탭의 기간 선택, 2026-09-08 추가)
// 그 기간만큼 조회수를 좁혀서 응답 — [[job-views]] admin.ts의 range 처리와 동일한 원리.
router.get("/admin/content-views", requireAdmin, async (req: Request, res: Response) => {
  const type = req.query["type"];
  if (typeof type !== "string" || !CONTENT_TYPES.includes(type as ContentType)) {
    res.status(400).json({ ok: false, message: `type은 ${CONTENT_TYPES.join("/")} 중 하나여야 합니다` });
    return;
  }
  const rangeParam = typeof req.query["range"] === "string" ? req.query["range"] : "";
  if (!rangeParam) {
    const rows = await getAllCounts(type as ContentType);
    res.json({ ok: true, rows, range: null });
    return;
  }
  const isExact = rangeParam === "today" || rangeParam === "yesterday";
  const days = isExact
    ? (rangeParam === "yesterday" ? 1 : 0)
    : Math.max(1, Math.min(90, Number(rangeParam) || 7));
  const rows = await getRangedCounts(type as ContentType, days, isExact);
  res.json({ ok: true, rows, range: rangeParam });
});

export default router;
