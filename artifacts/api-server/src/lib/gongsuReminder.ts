// 공수표 4단계 — 매일 아침 공수 입력 리마인드 발송 스케줄러.
// 기존 lib/webPush.ts와 동일한 web-push(VAPID) 라이브러리를 재사용한다(같은 프로세스에서
// setVapidDetails가 이미 호출되어 있으므로 여기서는 webpush.sendNotification만 호출하면 된다).
// 사용자별로 다른 시간을 지원해야 해서 기존 digestSlots.ts(고정 슬롯 방식)는 쓰지 않고
// 매분 KST 시각을 확인해 일치하는 구독자에게만 발송하는 방식으로 구현한다.
import webpush from "web-push";
import { pgPool } from "./db.js";
import { logger } from "./logger.js";

const KST_OFFSET_MS = 9 * 3600_000;
const TICK_MS = 60_000;

function kstNow(now: number = Date.now()): { hhmm: string; dateStr: string } {
  const kst = new Date(now + KST_OFFSET_MS);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return { hhmm: `${hh}:${mm}`, dateStr: kst.toISOString().slice(0, 10) };
}

interface DueRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function buildReminderPayload(): string {
  return JSON.stringify({
    title: "🔨 오늘 공수 기록하셨나요?",
    body: "탭 한 번으로 오늘 공수를 기록해보세요",
    url: "/mypage",
  });
}

async function sendDueReminders(): Promise<void> {
  const { hhmm, dateStr } = kstNow();
  let rows: DueRow[];
  try {
    const result = await pgPool.query<DueRow>(
      `SELECT endpoint, p256dh, auth
       FROM gongsu_push_subscriptions
       WHERE reminder_time = $1 AND enabled = true
         AND (last_sent_date IS NULL OR last_sent_date <> $2)`,
      [hhmm, dateStr]
    );
    rows = result.rows;
  } catch (err) {
    logger.error({ err: String(err) }, "[gongsu-reminder] 대상 조회 실패");
    return;
  }
  if (rows.length === 0) return;

  const payload = buildReminderPayload();
  for (const row of rows) {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
      await pgPool.query(`UPDATE gongsu_push_subscriptions SET last_sent_date = $2 WHERE endpoint = $1`, [
        row.endpoint,
        dateStr,
      ]);
    } catch (err) {
      logger.warn({ err: String(err), endpoint: row.endpoint }, "[gongsu-reminder] 발송 실패");
    }
  }
  logger.info({ count: rows.length, hhmm }, "[gongsu-reminder] 발송 완료");
}

let _started = false;
export function startGongsuReminderScheduler(): void {
  if (_started) return;
  _started = true;
  sendDueReminders().catch((err) => logger.warn({ err: String(err) }, "[gongsu-reminder] 초기 체크 실패"));
  setInterval(() => {
    sendDueReminders().catch((err) => logger.warn({ err: String(err) }, "[gongsu-reminder] 체크 실패"));
  }, TICK_MS);
}
