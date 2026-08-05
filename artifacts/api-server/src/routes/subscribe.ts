import { Router, type IRouter, type Request, type Response } from "express";
import { subscribeEmail, confirmSubscription, unsubscribeByToken } from "../lib/emailSubscribers.js";

const router: IRouter = Router();

const PAGE_STYLE =
  "font-family:Inter,system-ui,-apple-system,'Malgun Gothic',sans-serif;max-width:480px;margin:80px auto;padding:24px;text-align:center;color:#1e3a5f";

function resultPage(title: string, message: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title} - 건설UP</title></head>
  <body style="${PAGE_STYLE}">
    <h1 style="color:#f97316">${title}</h1>
    <p>${message}</p>
    <p><a href="https://geonseolup.com" style="color:#f97316;font-weight:bold">건설UP 홈으로 →</a></p>
  </body></html>`;
}

// POST /api/subscribe — 이메일 구독 신청 (region/job 선택적 필터, 더블 옵트인).
router.post("/subscribe", async (req: Request, res: Response) => {
  try {
    const { email, region, job } = req.body as { email?: string; region?: string; job?: string };
    if (!email) {
      res.status(400).json({ ok: false, error: "missing_email" });
      return;
    }
    const result = await subscribeEmail(email, region, job);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/subscribe/confirm?token=... — 확인 메일의 링크가 여는 엔드포인트.
router.get("/subscribe/confirm", async (req: Request, res: Response) => {
  const token = String(req.query["token"] ?? "");
  const ok = token ? await confirmSubscription(token) : false;
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(
    ok
      ? resultPage("구독이 확인됐어요! 🎉", "이제 조건에 맞는 신규 공고가 등록되면 이메일로 알려드릴게요.")
      : resultPage("링크가 유효하지 않아요", "이미 확인됐거나 만료된 링크입니다.")
  );
});

// GET /api/subscribe/unsubscribe?token=... — 이메일 하단 구독취소 링크.
router.get("/subscribe/unsubscribe", async (req: Request, res: Response) => {
  const token = String(req.query["token"] ?? "");
  const ok = token ? await unsubscribeByToken(token) : false;
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(
    ok
      ? resultPage("구독이 취소됐어요", "더 이상 알림 메일이 발송되지 않습니다. 언제든 다시 구독할 수 있어요.")
      : resultPage("링크가 유효하지 않아요", "이미 취소됐거나 잘못된 링크입니다.")
  );
});

export default router;
