// 콘텐츠(건설꿀팁/현장소식/노가다툰) 알림받기 구독 저장소.
// 구인공고 push_subscriptions와 별개 테이블 - endpoint+topic 조합이 PK라 병합 로직 없이 단순하다.
import { pgPool } from "./db.js";
import { logger } from "./logger.js";

let _initialized = false;
async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS content_push_subscriptions (
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (endpoint, topic)
    );
  `);
  _initialized = true;
}
ensureTable().catch((e) => logger.error({ err: String(e) }, "[content-push-subs] 테이블 초기화 실패"));

export async function saveContentSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  topic: string
): Promise<void> {
  await ensureTable();
  await pgPool.query(
    `INSERT INTO content_push_subscriptions (endpoint, p256dh, auth, topic)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint, topic) DO UPDATE SET p256dh = $2, auth = $3`,
    [endpoint, p256dh, auth, topic]
  );
}

export async function removeContentSubscription(endpoint: string, topic: string): Promise<void> {
  await ensureTable();
  await pgPool.query(`DELETE FROM content_push_subscriptions WHERE endpoint = $1 AND topic = $2`, [
    endpoint,
    topic,
  ]);
}

export interface ContentPushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function getContentSubscribers(topic: string): Promise<ContentPushSubscriptionRow[]> {
  await ensureTable();
  const result = await pgPool.query<ContentPushSubscriptionRow>(
    `SELECT endpoint, p256dh, auth FROM content_push_subscriptions WHERE topic = $1`,
    [topic]
  );
  return result.rows;
}
