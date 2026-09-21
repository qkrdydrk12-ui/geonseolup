import { pgPool } from "./db.js";
import { logger } from "./logger.js";

export interface JobAlertSubscriptionRow {
  id: number;
  phone: string;
  region: string | null;
  jobType: string | null;
  consentedAt: string;
  createdAt: string;
  enabled: boolean;
}

let _initialized = false;
async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS job_alert_subscriptions (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      region TEXT,
      job_type TEXT,
      consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      enabled BOOLEAN NOT NULL DEFAULT true
    );
    CREATE INDEX IF NOT EXISTS idx_job_alert_subs_region_job ON job_alert_subscriptions(region, job_type);
  `);
  _initialized = true;
}
ensureTable().catch((e) => logger.error({ err: String(e) }, "[job-alert-subs] table init failed"));

// Korean mobile phone: normalize to digits-only, expect 01[016789] + 7-8 more digits (10-11 total).
const PHONE_RE = /^01[016789]\d{7,8}$/;

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!PHONE_RE.test(digits)) return null;
  return digits;
}

export async function saveJobAlertSubscription(
  phone: string,
  region: string | null,
  jobType: string | null
): Promise<JobAlertSubscriptionRow> {
  await ensureTable();
  const normRegion = region && region !== "전체" ? region : null;
  const normJobType = jobType && jobType !== "전체" ? jobType : null;
  const result = await pgPool.query<JobAlertSubscriptionRow>(
    `INSERT INTO job_alert_subscriptions (phone, region, job_type)
     VALUES ($1, $2, $3)
     RETURNING id, phone, region, job_type AS "jobType", consented_at AS "consentedAt", created_at AS "createdAt", enabled`,
    [phone, normRegion, normJobType]
  );
  return result.rows[0];
}
