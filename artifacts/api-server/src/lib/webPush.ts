// 웹 푸시 알림 발송 (VAPID, 별도 외부 서비스 계정 불필요 — 키 쌍은 자체 생성).
// 필요한 환경변수 (Replit Secrets, 레포에는 커밋하지 않음):
//   VAPID_PUBLIC_KEY  — 프런트가 구독할 때 쓰는 공개키 (비밀 아님, 노출돼도 무방)
//   VAPID_PRIVATE_KEY — 서버가 발송할 때 서명하는 비공개키 (반드시 비밀 유지)

import webpush from "web-push";
import { logger } from "./logger.js";
import { getMatchingSubscriptions, removeSubscription, type PushSubscriptionRow } from "./pushSubscriptions.js";

const VAPID_SUBJECT = "mailto:qkrdydrk12@gmail.com";

let _configured = false;
function ensureConfigured(): boolean {
  if (_configured) return true;
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  _configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env["VAPID_PUBLIC_KEY"] ?? null;
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}

interface NewJobPayload {
  id: string;
  title?: string;
  region?: string;
  job?: string;
  salary?: string;
}

// 신규 공고를 매칭되는 구독자에게 발송. 부가 기능이라 실패해도 예외를 던지지 않는다.
export async function notifyPushSubscribers(payload: NewJobPayload): Promise<void> {
  if (!ensureConfigured()) {
    logger.debug("[push] VAPID_PUBLIC_KEY/PRIVATE_KEY 미설정 — 건너뜀");
    return;
  }
  const region = payload.region ?? "";
  const job = payload.job ?? "";
  let subs: PushSubscriptionRow[] = [];
  try {
    subs = await getMatchingSubscriptions(region, job);
  } catch (err) {
    logger.warn({ err: String(err) }, "[push] 구독자 조회 실패");
    return;
  }
  if (subs.length === 0) return;

  const titleParts = [region, job, payload.salary].filter(Boolean);
  const notifTitle = "🔔 새 공고 등록";
  const notifBody = payload.title || titleParts.join(" · ") || "새로운 건설 현장 구인 공고가 등록됐어요";
  const body = JSON.stringify({
    title: notifTitle,
    body: notifBody,
    url: `https://geonseolup.com/detail/${payload.id}`,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 구독이 만료/취소된 경우(410 Gone, 404 Not Found) — 정리해서 다음부터 재시도하지 않는다.
        if (statusCode === 410 || statusCode === 404) {
          await removeSubscription(sub.endpoint).catch(() => {});
        } else {
          logger.warn({ err: String(err), endpoint: sub.endpoint }, "[push] 발송 실패");
        }
      }
    })
  );

  logger.info({ count: subs.length, jobId: payload.id }, "[push] 신규 공고 알림 발송 완료");
}
