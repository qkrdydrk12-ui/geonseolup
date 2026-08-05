// 이메일 구독(신규 공고 알림) — Resend로 발송.
// 필요한 환경변수 (Replit Secrets, 레포에는 커밋하지 않음):
//   RESEND_API_KEY   — resend.com 발급 API 키
//   RESEND_FROM_EMAIL — 선택. 미설정 시 Resend 샌드박스 발신주소 사용(도메인 인증 불필요)
//
// 신규 공고마다 이메일을 즉시 발송하면 구독자당·하루당 발송량이 쉽게 Resend 무료
// 한도(하루 100통)를 넘길 수 있어, 신규 공고를 모아뒀다가 일정 주기(기본 15분)마다
// "다이제스트" 이메일 1통으로 묶어 보낸다.

import { randomBytes } from "crypto";
import { Resend } from "resend";
import { pgPool } from "./db.js";
import { logger } from "./logger.js";

const SITE_URL = "https://geonseolup.com";
const DIGEST_INTERVAL_MS = 15 * 60_000; // 15분

interface NewJobPayload {
  id: string;
  title?: string;
  region?: string;
  job?: string;
  salary?: string;
}

function getResend(): Resend | null {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return null;
  return new Resend(key);
}

function fromAddress(): string {
  return process.env["RESEND_FROM_EMAIL"] || "건설UP <onboarding@resend.dev>";
}

let _initialized = false;
async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS email_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      region TEXT,
      job TEXT,
      confirmed BOOLEAN NOT NULL DEFAULT false,
      confirm_token TEXT NOT NULL,
      unsub_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      confirmed_at TIMESTAMPTZ
    );
  `);
  _initialized = true;
}
ensureTable().catch((e) => logger.error({ err: String(e) }, "[email-subs] 테이블 초기화 실패"));

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 구독 신청 — 미확정(confirmed=false) 상태로 저장하고 확인 메일을 보낸다 (더블 옵트인).
export async function subscribeEmail(
  email: string,
  region?: string,
  job?: string
): Promise<{ ok: boolean; error?: string }> {
  await ensureTable();
  const normEmail = email.trim().toLowerCase();
  if (!isValidEmail(normEmail)) return { ok: false, error: "invalid_email" };

  const normRegion = region && region !== "전체" ? region : null;
  const normJob = job && job !== "전체" ? job : null;
  const confirmToken = randomBytes(16).toString("hex");
  const unsubToken = randomBytes(16).toString("hex");

  await pgPool.query(
    `INSERT INTO email_subscribers (email, region, job, confirmed, confirm_token, unsub_token)
     VALUES ($1, $2, $3, false, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       region = $2, job = $3, confirm_token = $4,
       confirmed = false, confirmed_at = NULL`,
    [normEmail, normRegion, normJob, confirmToken, unsubToken]
  );

  const resend = getResend();
  if (!resend) {
    logger.debug("[email-subs] RESEND_API_KEY 미설정 — 확인 메일 발송 건너뜀");
    return { ok: true };
  }

  const confirmUrl = `${SITE_URL}/api/subscribe/confirm?token=${confirmToken}`;
  const filterDesc = [normRegion, normJob].filter(Boolean).join(" ") || "전체 지역·직종";
  try {
    await resend.emails.send({
      from: fromAddress(),
      to: normEmail,
      subject: "[건설UP] 구독 확인을 완료해주세요",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e3a5f">
          <h2 style="color:#f97316">건설UP 구독 확인</h2>
          <p><b>${filterDesc}</b> 신규 공고 알림 구독을 신청하셨습니다.</p>
          <p>아래 버튼을 눌러 구독을 확정해주세요 (누르지 않으면 알림이 발송되지 않습니다).</p>
          <p style="margin:24px 0">
            <a href="${confirmUrl}" style="background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">구독 확인하기</a>
          </p>
          <p style="font-size:12px;color:#94a3b8">본인이 신청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
        </div>`,
    });
  } catch (err) {
    logger.warn({ err: String(err), email: normEmail }, "[email-subs] 확인 메일 발송 실패");
  }
  return { ok: true };
}

export async function confirmSubscription(token: string): Promise<boolean> {
  await ensureTable();
  const result = await pgPool.query(
    `UPDATE email_subscribers SET confirmed = true, confirmed_at = now()
     WHERE confirm_token = $1 RETURNING id`,
    [token]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  await ensureTable();
  const result = await pgPool.query(`DELETE FROM email_subscribers WHERE unsub_token = $1 RETURNING id`, [token]);
  return (result.rowCount ?? 0) > 0;
}

// ── 신규 공고 다이제스트 큐 ─────────────────────────────────────────────────
const _pending: NewJobPayload[] = [];
const _seenIds = new Set<string>();

export async function notifyNewJobSubscribers(payload: NewJobPayload): Promise<void> {
  if (_seenIds.has(payload.id)) return;
  _seenIds.add(payload.id);
  _pending.push(payload);
}

async function flushDigest(): Promise<void> {
  if (_pending.length === 0) return;
  const jobs = _pending.splice(0, _pending.length);
  _seenIds.clear();

  const resend = getResend();
  if (!resend) return; // 미설정이면 큐만 비우고 조용히 종료

  await ensureTable();
  let subs: { email: string; region: string | null; job: string | null; unsub_token: string }[] = [];
  try {
    const result = await pgPool.query<{ email: string; region: string | null; job: string | null; unsub_token: string }>(
      `SELECT email, region, job, unsub_token FROM email_subscribers WHERE confirmed = true`
    );
    subs = result.rows;
  } catch (err) {
    logger.warn({ err: String(err) }, "[email-subs] 구독자 조회 실패");
    return;
  }
  if (subs.length === 0) return;

  for (const sub of subs) {
    const matched = jobs.filter(
      (j) => (!sub.region || j.region === sub.region) && (!sub.job || j.job === sub.job)
    );
    if (matched.length === 0) continue;

    const unsubUrl = `${SITE_URL}/api/subscribe/unsubscribe?token=${sub.unsub_token}`;
    const itemsHtml = matched
      .slice(0, 20)
      .map((j) => {
        const titleParts = [j.region, j.job, j.salary].filter(Boolean).join(" · ");
        const label = j.title || titleParts || "새 공고";
        return `<li style="margin-bottom:8px"><a href="${SITE_URL}/detail/${j.id}" style="color:#1e3a5f;font-weight:600">${label}</a></li>`;
      })
      .join("\n");

    try {
      await resend.emails.send({
        from: fromAddress(),
        to: sub.email,
        subject: `[건설UP] 신규 공고 ${matched.length}건 알림`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e3a5f">
            <h2 style="color:#f97316">새 공고가 등록됐어요</h2>
            <ul style="padding-left:18px">${itemsHtml}</ul>
            <p style="margin:24px 0"><a href="${SITE_URL}" style="color:#f97316;font-weight:bold">건설UP에서 전체 보기 →</a></p>
            <p style="font-size:12px;color:#94a3b8"><a href="${unsubUrl}" style="color:#94a3b8">구독 취소</a></p>
          </div>`,
      });
    } catch (err) {
      logger.warn({ err: String(err), email: sub.email }, "[email-subs] 다이제스트 발송 실패");
    }
  }

  logger.info({ jobs: jobs.length, subscribers: subs.length }, "[email-subs] 다이제스트 발송 완료");
}

let _digestHandle: ReturnType<typeof setInterval> | null = null;
export function startEmailDigestScheduler(): void {
  if (_digestHandle != null) return;
  _digestHandle = setInterval(() => {
    flushDigest().catch((err) => logger.error({ err: String(err) }, "[email-subs] 다이제스트 발송 실패"));
  }, DIGEST_INTERVAL_MS);
}
