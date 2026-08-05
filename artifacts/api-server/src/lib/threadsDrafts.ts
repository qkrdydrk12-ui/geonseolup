// 신규 공고 중 "홍보할 만한" 것이 등록되면 Threads 홍보 문구 초안을 자동으로
// 만들어 큐에 쌓아둔다. 실제 발행은 절대 여기서 하지 않는다 — 관리자가
// /admin 화면에서 초안을 보고 "발행" 버튼을 눌러야만 나간다 (사람 승인 필수).

import { pgPool } from "./db.js";
import { logger } from "./logger.js";

export interface ThreadsDraft {
  id: number;
  jobId: string;
  text: string;
  linkUrl: string;
  status: "pending" | "published" | "rejected";
  createdAt: string;
  publishedAt: string | null;
}

let _initialized = false;
async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS threads_drafts (
      id SERIAL PRIMARY KEY,
      job_id TEXT NOT NULL,
      text TEXT NOT NULL,
      link_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at TIMESTAMPTZ
    );
  `);
  _initialized = true;
}
ensureTable().catch((e) => logger.error({ err: String(e) }, "[threads-drafts] 테이블 초기화 실패"));

interface NewJobPayload {
  id: string;
  title?: string;
  region?: string;
  job?: string;
  salary?: string;
  meal?: string;
  lodging?: string;
}

// "홍보할 만한" 공고인지 판단 — 전부 다 초안을 만들면 관리자가 매번 걸러야 해서 피곤해지므로
// 숙식 둘 다 제공하거나 급여가 눈에 띄게 높은 경우만 자동 초안 대상으로 삼는다.
function isPromotable(job: NewJobPayload, salaryNum?: number): boolean {
  const bothProvided = Boolean(job.meal?.includes("제공") && job.lodging?.includes("제공"));
  const highPay = typeof salaryNum === "number" && salaryNum >= 200_000;
  return bothProvided || highPay;
}

function buildDraftText(job: NewJobPayload): string {
  const titleParts = [job.region, job.job, job.salary].filter(Boolean).join(" · ");
  const perks = [job.meal?.includes("제공") && "🍚 식사제공", job.lodging?.includes("제공") && "🏠 숙소제공"]
    .filter(Boolean)
    .join(" ");
  return [
    `${job.region ?? ""} ${job.job ?? ""} 구인 중!`,
    titleParts,
    perks || undefined,
    "지금 건설UP에서 상세 조건 확인하세요 👇",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function maybeCreateDraft(job: NewJobPayload, salaryNum?: number): Promise<void> {
  await ensureTable();
  if (!isPromotable(job, salaryNum)) return;
  try {
    await pgPool.query(
      `INSERT INTO threads_drafts (job_id, text, link_url) VALUES ($1, $2, $3)`,
      [job.id, buildDraftText(job), `https://geonseolup.com/detail/${job.id}`]
    );
    logger.info({ jobId: job.id }, "[threads-drafts] 신규 홍보 초안 생성");
  } catch (err) {
    logger.warn({ err: String(err), jobId: job.id }, "[threads-drafts] 초안 생성 실패");
  }
}

export async function listPendingDrafts(): Promise<ThreadsDraft[]> {
  await ensureTable();
  const result = await pgPool.query(
    `SELECT id, job_id AS "jobId", text, link_url AS "linkUrl", status,
            created_at AS "createdAt", published_at AS "publishedAt"
     FROM threads_drafts WHERE status = 'pending' ORDER BY created_at DESC LIMIT 30`
  );
  return result.rows;
}

export async function markDraftPublished(id: number): Promise<void> {
  await ensureTable();
  await pgPool.query(`UPDATE threads_drafts SET status = 'published', published_at = now() WHERE id = $1`, [id]);
}

export async function markDraftRejected(id: number): Promise<void> {
  await ensureTable();
  await pgPool.query(`UPDATE threads_drafts SET status = 'rejected' WHERE id = $1`, [id]);
}

export async function getDraftById(id: number): Promise<ThreadsDraft | null> {
  await ensureTable();
  const result = await pgPool.query(
    `SELECT id, job_id AS "jobId", text, link_url AS "linkUrl", status,
            created_at AS "createdAt", published_at AS "publishedAt"
     FROM threads_drafts WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}
