import { pgPool } from "./db.js";
import { logger } from "./logger.js";
import { getPublicJobs, filterActiveJobs, type PublicJob } from "./jobsCache.js";

const KST_OFFSET_MS = 9 * 3600_000;
const TICK_MS = 60_000;
const DIGEST_TIME = process.env["JOB_ALERT_DIGEST_TIME"] || "18:30";

function kstNow(now: number = Date.now()): { hhmm: string; dateStr: string } {
  const kst = new Date(now + KST_OFFSET_MS);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return { hhmm: `${hh}:${mm}`, dateStr: kst.toISOString().slice(0, 10) };
}

let _initialized = false;
async function ensureTables(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS job_alert_notify_state (
      subscription_id INTEGER PRIMARY KEY REFERENCES job_alert_subscriptions(id) ON DELETE CASCADE,
      last_notified_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS job_alert_digest_runs (
      run_date TEXT PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  _initialized = true;
}
ensureTables().catch((e) => logger.error({ err: String(e) }, "[job-alert-digest] table init failed"));

interface SubscriptionRow {
  id: number;
  phone: string;
  region: string | null;
  jobType: string | null;
  createdAt: string;
  lastNotifiedAt: string | null;
}

async function claimTodayRun(dateStr: string): Promise<boolean> {
  const result = await pgPool.query(
    `INSERT INTO job_alert_digest_runs (run_date) VALUES ($1) ON CONFLICT (run_date) DO NOTHING RETURNING run_date`,
    [dateStr]
  );
  return result.rows.length > 0;
}

function jobField(job: PublicJob, key: string): string {
  const v = (job as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function matchesSubscription(job: PublicJob, region: string | null, jobType: string | null): boolean {
  if (region && jobField(job, "region") !== region) return false;
  if (jobType && jobField(job, "job") !== jobType) return false;
  return true;
}

function jobTimestamp(job: PublicJob): number {
  const raw = job.date;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

interface AligoSendResult {
  ok: boolean;
  error?: string;
}

async function sendAlimTalk(phone: string, region: string | null, jobType: string | null): Promise<AligoSendResult> {
  const apikey = process.env["ALIGO_API_KEY"];
  const userid = process.env["ALIGO_USER_ID"];
  const senderkey = process.env["ALIGO_SENDER_KEY"];
  const sender = process.env["ALIGO_SENDER_PHONE"];
  const tplCode = process.env["ALIGO_JOB_ALERT_TPL_CODE"] || "UL_7211";
  if (!apikey || !userid || !senderkey || !sender) {
    return { ok: false, error: "aligo_not_configured" };
  }

  const regionLabel = region || "전체";
  const jobTypeLabel = jobType || "전체";
  const message = `[건설UP] ${regionLabel} ${jobTypeLabel} 신규 공고가 등록되었습니다!\n\n지금 바로 확인하고 지원해보세요.`;

  const body = new URLSearchParams({
    apikey,
    userid,
    senderkey,
    tpl_code: tplCode,
    sender,
    receiver_1: phone,
    subject_1: "건설UP 새 공고",
    message_1: message,
    failover: "Y",
    fsubject_1: "건설UP 새 공고",
    fmessage_1: `${message}\ngeonseolup.com`,
  });

  try {
    const res = await fetch("https://kakaoapi.aligo.in/akv10/alimtalk/send/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { code?: number; message?: string };
    if (data.code === 0) return { ok: true };
    return { ok: false, error: data.message || `aligo_error_${String(data.code)}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function runJobAlertDigest(): Promise<{ sent: number; skipped: number; failed: number }> {
  await ensureTables();
  const { dateStr } = kstNow();
  const claimed = await claimTodayRun(dateStr);
  if (!claimed) {
    logger.info({ dateStr }, "[job-alert-digest] already ran today, skipping");
    return { sent: 0, skipped: 0, failed: 0 };
  }

  let subs: SubscriptionRow[];
  try {
    const result = await pgPool.query<SubscriptionRow>(`
      SELECT s.id, s.phone, s.region, s.job_type AS "jobType", s.created_at AS "createdAt",
             n.last_notified_at AS "lastNotifiedAt"
      FROM job_alert_subscriptions s
      LEFT JOIN job_alert_notify_state n ON n.subscription_id = s.id
      WHERE s.enabled = true
    `);
    subs = result.rows;
  } catch (err) {
    logger.error({ err: String(err) }, "[job-alert-digest] subscription query failed");
    return { sent: 0, skipped: 0, failed: 0 };
  }
  if (subs.length === 0) return { sent: 0, skipped: 0, failed: 0 };

  let jobs: PublicJob[];
  try {
    const { jobs: rawJobs } = await getPublicJobs();
    jobs = filterActiveJobs(rawJobs);
  } catch (err) {
    logger.error({ err: String(err) }, "[job-alert-digest] job fetch failed");
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const nowIso = new Date().toISOString();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      const cutoff = sub.lastNotifiedAt ? new Date(sub.lastNotifiedAt).getTime() : new Date(sub.createdAt).getTime();
      const matches = jobs.filter((j) => matchesSubscription(j, sub.region, sub.jobType) && jobTimestamp(j) > cutoff);
      if (matches.length === 0) {
        skipped++;
        continue;
      }
      const result = await sendAlimTalk(sub.phone, sub.region, sub.jobType);
      if (result.ok) {
        await pgPool.query(
          `INSERT INTO job_alert_notify_state (subscription_id, last_notified_at) VALUES ($1, $2)
           ON CONFLICT (subscription_id) DO UPDATE SET last_notified_at = $2`,
          [sub.id, nowIso]
        );
        sent++;
      } else {
        failed++;
        logger.warn({ subscriptionId: sub.id, error: result.error }, "[job-alert-digest] send failed");
      }
    } catch (err) {
      failed++;
      logger.error({ subscriptionId: sub.id, err: String(err) }, "[job-alert-digest] subscriber processing failed");
    }
  }

  logger.info({ total: subs.length, sent, skipped, failed }, "[job-alert-digest] run complete");
  return { sent, skipped, failed };
}

let _started = false;
export function startJobAlertDigestScheduler(): void {
  if (_started) return;
  _started = true;
  const check = () => {
    const { hhmm } = kstNow();
    if (hhmm === DIGEST_TIME) {
      runJobAlertDigest().catch((err) => logger.warn({ err: String(err) }, "[job-alert-digest] scheduled run failed"));
    }
  };
  check();
  setInterval(check, TICK_MS);
}
