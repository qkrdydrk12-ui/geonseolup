// 정보/꿀팁 글 덮어쓰기(override) API.
// - GET  /api/info/overrides           : 공개. 프론트가 원본과 병합해서 표시.
// - PUT  /api/admin/info/:slug         : 관리자. 수정 내용 저장.
// - DELETE /api/admin/info/:slug       : 관리자. 수정 내용 삭제(원본으로 복원).

import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/adminStore.js";
import {
  getAllInfoOverrides,
  saveInfoOverride,
  deleteInfoOverride,
  validateInfoOverride,
} from "../lib/infoOverrides.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/info/overrides", async (_req, res) => {
  try {
    const overrides = await getAllInfoOverrides();
    res.json({ ok: true, overrides });
  } catch (err) {
    logger.error({ err: String(err) }, "[info] overrides 조회 실패");
    res.status(500).json({ ok: false, message: "서버 오류" });
  }
});

router.put("/admin/info/:slug", requireAdmin, async (req, res) => {
  try {
    const check = validateInfoOverride({ ...req.body, slug: req.params.slug });
    if (!check.ok) {
      res.status(400).json({ ok: false, message: check.message });
      return;
    }
    await saveInfoOverride(check.value);
    logger.info({ slug: check.value.slug }, "[info] 글 수정 내용 저장");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: String(err) }, "[info] 저장 실패");
    res.status(500).json({ ok: false, message: "서버 오류" });
  }
});

router.delete("/admin/info/:slug", requireAdmin, async (req, res) => {
  try {
    await deleteInfoOverride(String(req.params.slug));
    logger.info({ slug: req.params.slug }, "[info] 글 수정 내용 삭제(원본 복원)");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: String(err) }, "[info] 삭제 실패");
    res.status(500).json({ ok: false, message: "서버 오류" });
  }
});

export default router;
