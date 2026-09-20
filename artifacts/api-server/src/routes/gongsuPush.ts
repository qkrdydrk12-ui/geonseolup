// 공수표 4단계 — 회원별 아침 알림 구독/시간설정/테스트발송 API.
// 기존 lib/webPush.ts의 VAPID 설정(및 getVapidPublicKey)을 그대로 재사용한다.
import webpush from "web-push";
import { Router, type IRouter, type Request, type Response } from "express";
import { pgPool } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { requireUser } from "../lib/userSession.js";
import { getVapidPublicKey, isPushConfigured } from "../lib/webPush.js";
import { buildReminderPayload, startGongsuReminderScheduler } from "../lib/gongsuReminder.js";

startGongsuReminderScheduler();

const router: IRouter = Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_REMINDER_TIME = "06:55";

// GET /api/gongsu-push/vapid-public-key
router.get("/gongsu-push/vapid-public-key", (_req: Request, res: Response) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    res.status(503).json({ ok: false, error: "not_configured" });
    return;
  }
  res.json({ ok: true, publicKey });
});

interface SubscribeBody {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  reminderTime?: string;
}

// POST /api/gongsu-push/subscribe
router.post("/gongsu-push/subscribe", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  const body = req.body as SubscribeBody;
  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  const reminderTime = body.reminderTime && TIME_RE.test(body.reminderTime) ? body.reminderTime : DEFAULT_REMINDER_TIME;
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ ok: false, error: "invalid_subscription" });
    return;
  }
  try {
    await pgPool.query(
      `INSERT INTO gongsu_push_subscriptions (endpoint, user_id, p256dh, auth, reminder_time)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = $2, p256dh = $3, auth = $4, reminder_time = $5, enabled = true, updated_at = now()`,
      [endpoint, userId, p256dh, auth, reminderTime]
    );
    res.json({ ok: true, reminderTime });
  } catch (err) {
    logger.error({ err: String(err) }, "[gongsu-push] 구독 저장 실패");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/gongsu-push/unsubscribe
router.post("/gongsu-push/unsubscribe", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    res.status(400).json({ ok: false, error: "missing_endpoint" });
    return;
  }
  try {
    await pgPool.query(`DELETE FROM gongsu_push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [endpoint, userId]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: String(err) }, "[gongsu-push] 구독 해지 실패");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// PATCH /api/gongsu-push/reminder-time
router.patch("/gongsu-push/reminder-time", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  const { reminderTime } = req.body as { reminderTime?: string };
  if (!reminderTime || !TIME_RE.test(reminderTime)) {
    res.status(400).json({ ok: false, error: "invalid_time" });
    return;
  }
  try {
    await pgPool.query(`UPDATE gongsu_push_subscriptions SET reminder_time = $2, updated_at = now() WHERE user_id = $1`, [
      userId,
      reminderTime,
    ]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: String(err) }, "[gongsu-push] 알림 시간 수정 실패");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/gongsu-push/status
router.get("/gongsu-push/status", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  try {
    const result = await pgPool.query<{ reminder_time: string; enabled: boolean }>(
      `SELECT reminder_time, enabled FROM gongsu_push_subscriptions WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (result.rows.length === 0) {
      res.json({ ok: true, subscribed: false });
      return;
    }
    res.json({ ok: true, subscribed: result.rows[0].enabled, reminderTime: result.rows[0].reminder_time });
  } catch (err) {
    logger.error({ err: String(err) }, "[gongsu-push] 상태 조회 실패");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/gongsu-push/test — 설정 화면의 "테스트 알림 보내기" 버튼용.
router.post("/gongsu-push/test", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  try {
    const result = await pgPool.query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT endpoint, p256dh, auth FROM gongsu_push_subscriptions WHERE user_id = $1 AND enabled = true`,
      [userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ ok: false, error: "not_subscribed" });
      return;
    }
    isPushConfigured();
    const payload = buildReminderPayload();
    for (const row of result.rows) {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
    }
    res.json({ ok: true });
  } catch (err) {
    const detail = (err as { statusCode?: number; body?: string }) ?? {};
    logger.error({ err: String(err), statusCode: detail.statusCode, body: detail.body }, "[gongsu-push] 테스트 발송 실패");
    res.status(500).json({ ok: false, error: String(err), statusCode: detail.statusCode, body: detail.body });
  }
});

export default router;
