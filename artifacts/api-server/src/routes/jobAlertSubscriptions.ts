import { Router, type IRouter, type Request, type Response } from "express";
import { saveJobAlertSubscription, normalizePhone } from "../lib/jobAlertSubscriptions.js";

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

export default router;
