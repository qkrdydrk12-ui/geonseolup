// ── 관리자용 콘텐츠(건설꿀팁/현장소식/노가다툰) 조회수·좋아요 조회 라우트 ──────
// 각 관리자 목록 화면(AdminBlogArticles/AdminSiteNews/AdminToon)이 이 엔드포인트를
// 한 번씩 호출해서 slug별 조회수·좋아요 수를 표시한다. 조회 기록 자체는 각 콘텐츠
// 라우트(blogArticles.ts/siteNews.ts/toon.ts)의 POST .../:slug/view 에서 이뤄진다.
import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/adminStore";
import { getAllCounts, CONTENT_TYPES, type ContentType } from "../lib/contentEngagement.js";

const router = Router();

// GET /api/admin/content-views?type=blog|news|toon
router.get("/admin/content-views", requireAdmin, async (req: Request, res: Response) => {
  const type = req.query["type"];
  if (typeof type !== "string" || !CONTENT_TYPES.includes(type as ContentType)) {
    res.status(400).json({ ok: false, message: `type은 ${CONTENT_TYPES.join("/")} 중 하나여야 합니다` });
    return;
  }
  const rows = await getAllCounts(type as ContentType);
  res.json({ ok: true, rows });
});

export default router;
