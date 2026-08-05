// 웹 푸시 구독 저장소. 방문자가 브라우저 푸시 알림을 구독하면(선택적으로 지역/직종
// 필터와 함께) 저장해두고, 신규 공고가 올라올 때 매칭되는 구독자에게 발송한다.

import { pgPool } from "./db.js";
import { logger } from "./logger.js";

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  region: string | null;
  job: string | null;
}

let _initialized = false;
async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      region TEXT,
      job TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_push_subs_region_job ON push_subscriptions(region, job);
  `);
  _initialized = true;
}
ensureTable().catch((e) => logger.error({ err: String(e) }, "[push-subs] 테이블 초기화 실패"));

export async function saveSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  region?: string | null,
  job?: string | null
): Promise<void> {
  await ensureTable();
  // 지역/직종 미지정 또는 "전체"는 null로 저장 (= 전체 공고 알림).
  const normRegion = region && region !== "전체" ? region : null;
  const normJob = job && job !== "전체" ? job : null;
  await pgPool.query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, region, job)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = $2, auth = $3, region = $4, job = $5`,
    [endpoint, p256dh, auth, normRegion, normJob]
  );
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await ensureTable();
  await pgPool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

// 신규 공고(region, job)에 매칭되는 구독자만 조회.
// 구독자의 region/job이 NULL이면 "전체 알림" 구독으로 취급해 항상 매칭된다.
export async function getMatchingSubscriptions(
  region: string,
  job: string
): Promise<PushSubscriptionRow[]> {
  await ensureTable();
  const result = await pgPool.query<PushSubscriptionRow>(
    `SELECT endpoint, p256dh, auth, region, job
     FROM push_subscriptions
     WHERE (region IS NULL OR region = $1)
       AND (job IS NULL OR job = $2)`,
    [region, job]
  );
  return result.rows;
}

export async function countSubscriptions(): Promise<number> {
  await ensureTable();
  const result = await pgPool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM push_subscriptions`);
  return Number(result.rows[0]?.count ?? 0);
}
