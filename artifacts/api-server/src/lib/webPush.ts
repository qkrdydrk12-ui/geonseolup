// 웹 푸시 알림 발송 (VAPID, 별도 외부 서비스 계정 불필요 — 키 쌍은 자체 생성).
// 필요한 환경변수 (Replit Secrets, 레포에는 커밋하지 않음):
//   VAPID_PUBLIC_KEY  — 프런트가 구독할 때 쓰는 공개키 (비밀 아님, 노출돼도 무방)
//   VAPID_PRIVATE_KEY — 서버가 발송할 때 서명하는 비공개키 (반드시 비밀 유지)

import webpush from "web-push";
import { logger } from "./logger.js";
import { getMatchingSubscriptions, removeSubscription, type PushSubscriptionRow } from "./pushSubscriptions.js";
import { scheduleAtSlots } from "./digestSlots.js";

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

// ── 취합(다이제스트) 발송 ───────────────────────────────────────────────────
// 공고가 올라올 때마다 즉시 알리지 않고 큐에 모았다가, 하루 3회
// (KST 06:00 / 11:30 / 18:30 — digestSlots.ts) 취합해서 1건으로 발송한다.
let _pending: NewJobPayload[] = [];
const _seenIds = new Set<string>();
let _schedulerStarted = false;

function ensureSlotScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;
  scheduleAtSlots(() => {
    const jobs = _pending;
    _pending = [];
    _seenIds.clear();
    flushPushBatch(jobs).catch((err) => {
      logger.warn({ err: String(err) }, "[push] 취합 발송 실패");
    });
  });
}

// 신규 공고를 발송 대기열에 추가. 다음 발송 시각에 일괄 발송된다.
export function notifyPushSubscribers(payload: NewJobPayload): Promise<void> {
  if (_seenIds.has(payload.id)) return Promise.resolve();
  _seenIds.add(payload.id);
  _pending.push(payload);
  ensureSlotScheduler();
  return Promise.resolve();
}

async function sendToSub(sub: PushSubscriptionRow, body: string): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
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
}

// 대기열에 모인 공고들을 구독자별로 묶어 1인당 1건의 알림만 보낸다.
async function flushPushBatch(jobs: NewJobPayload[]): Promise<void> {
  if (jobs.length === 0) return;
  if (!ensureConfigured()) {
    logger.debug("[push] VAPID_PUBLIC_KEY/PRIVATE_KEY 미설정 — 건너뜀");
    return;
  }

  // 구독자(endpoint)별로 매칭되는 공고 목록을 집계
  const perSub = new Map<string, { sub: PushSubscriptionRow; matched: NewJobPayload[] }>();
  for (const payload of jobs) {
    let subs: PushSubscriptionRow[] = [];
    try {
      subs = await getMatchingSubscriptions(payload.region ?? "", payload.job ?? "");
    } catch (err) {
      logger.warn({ err: String(err) }, "[push] 구독자 조회 실패");
      continue;
    }
    for (const sub of subs) {
      const entry = perSub.get(sub.endpoint);
      if (entry) entry.matched.push(payload);
      else perSub.set(sub.endpoint, { sub, matched: [payload] });
    }
  }
  if (perSub.size === 0) return;

  await Promise.all(
    Array.from(perSub.values()).map(async ({ sub, matched }) => {
      let body: string;
      if (matched.length === 1) {
        const p = matched[0];
        const titleParts = [p.region, p.job, p.salary].filter(Boolean);
        body = JSON.stringify({
          title: "🔔 새 공고 도착!",
          body: p.title || titleParts.join(" · ") || "새로운 건설 현장 구인 공고가 등록됐어요",
          url: `https://geonseolup.com/detail/${p.id}`,
        });
      } else {
        // 지역·직종 요약 (최대 3개)
        const tags = Array.from(
          new Set(matched.map((p) => [p.region, p.job].filter(Boolean).join(" ")).filter(Boolean))
        ).slice(0, 3);
        const suffix = tags.length > 0 ? ` (${tags.join(", ")}${tags.length >= 3 ? " 외" : ""})` : "";
        body = JSON.stringify({
          title: `🔔 오늘의 공고 ${matched.length}건 도착!`,
          body: `건설UP에서 확인하세요${suffix}`,
          url: "https://geonseolup.com/",
        });
      }
      await sendToSub(sub, body);
    })
  );

  logger.info(
    { subscribers: perSub.size, jobs: jobs.length },
    "[push] 신규 공고 묶음 알림 발송 완료"
  );
}
