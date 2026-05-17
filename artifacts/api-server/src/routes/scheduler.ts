import { Router, type Request, type Response } from "express";
import {
  getSchedulerStats,
  runSchedulerOnce,
  bulkResetFailed,
} from "../lib/scheduler.js";
import { requireAdmin } from "../lib/adminStore.js";

const router = Router();

// GET /api/scheduler/status — 스케줄러 상태 조회 (인증 불필요)
router.get("/scheduler/status", (_req: Request, res: Response) => {
  res.json({ ok: true, ...getSchedulerStats() });
});

// POST /api/scheduler/trigger — 수동 즉시 실행 (관리자 인증 필요)
router.post(
  "/scheduler/trigger",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const result = await runSchedulerOnce();
      res.json({ ok: true, result, ...getSchedulerStats() });
    } catch (err) {
      res.status(500).json({ ok: false, message: String(err) });
    }
  }
);

// POST /api/scheduler/reset-failed — 실패 공고 일괄 초기화 (관리자 인증 필요)
// retryCount=99 등 영구 실패 처리된 공고를 reserved 상태로 복구
router.post(
  "/scheduler/reset-failed",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const result = await bulkResetFailed();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, message: String(err) });
    }
  }
);

export default router;
