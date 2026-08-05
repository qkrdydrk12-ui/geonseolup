import { Router, type IRouter, type Request, type Response } from "express";
import { getVapidPublicKey } from "../lib/webPush.js";
import { saveSubscription, removeSubscription } from "../lib/pushSubscriptions.js";

const router: IRouter = Router();

// GET /api/push/vapid-public-key — 프런트가 구독(subscribe) 시 필요한 공개키.
router.get("/push/vapid-public-key", (_req: Request, res: Response) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "push_not_configured" });
    return;
  }
  res.json({ publicKey: key });
});

interface SubscribeBody {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  region?: string;
  job?: string;
}

// POST /api/push/subscribe — 브라우저 푸시 구독 등록 (선택적 지역/직종 필터 포함).
router.post("/push/subscribe", async (req: Request, res: Response) => {
  try {
    const body = req.body as SubscribeBody;
    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const auth = body.subscription?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ ok: false, error: "invalid_subscription" });
      return;
    }
    await saveSubscription(endpoint, p256dh, auth, body.region, body.job);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/push/unsubscribe — 구독 해지.
router.post("/push/unsubscribe", async (req: Request, res: Response) => {
  try {
    const endpoint = (req.body as { endpoint?: string })?.endpoint;
    if (!endpoint) {
      res.status(400).json({ ok: false, error: "missing_endpoint" });
      return;
    }
    await removeSubscription(endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
