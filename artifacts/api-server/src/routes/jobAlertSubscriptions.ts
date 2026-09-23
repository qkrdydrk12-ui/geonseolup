import { Router, type IRouter, type Request, type Response } from "express";
import { saveJobAlertSubscription, normalizePhone } from "../lib/jobAlertSubscriptions.js";
import { runJobAlertDigest, startJobAlertDigestScheduler } from "../lib/jobAlertDigest.js";
import { requireAdmin } from "../lib/adminStore.js";

// 이 라우트 모듈이 로드될 때 다이제스트 스케줄러를 함께 시작한다 (gongsuPush.ts와 동일한 패턴).
startJobAlertDigestScheduler();

const router: IRouter = Router();

router.post("/job-alert-subscriptions", async (req: Request, res: Response) => {
  try {
    const body = req.body as { phone?: string; region?: string; jobType?: string; consent?: boolean };
    if (!body.consent) {
      res.status(400).json({ ok: false, error: "consent_required" });
      return;
    }
    const phone = normalizePhone(String(body.phone ?? ""));
    if (!phone) {
      res.status(400).json({ ok: false, error: "invalid_phone" });
      return;
    }
    const region = typeof body.region === "string" ? body.region : null;
    const jobType = typeof body.jobType === "string" ? body.jobType : null;
    const row = await saveJobAlertSubscription(phone, region, jobType);
    res.json({ ok: true, id: row.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// 관리자 수동 트리거(테스트/장애 복구용). 건설UP 새공고알림 템플릿(UL_7211) 승인 전에는 항상 실패하는 게 정상이다.
router.post("/admin/job-alert-digest/run", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await runJobAlertDigest();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
