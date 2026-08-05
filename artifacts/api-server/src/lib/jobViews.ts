// 공고 조회수 집계 — "인기 공고" 섹션의 데이터 소스.
// 같은 방문자가 새로고침을 반복해도 조회수가 부풀려지지 않도록
// (공고 ID, 날짜, 방문자 IP 해시) 단위로 하루 1회만 카운트한다.

import { createHash } from "crypto";
import { pgPool } from "./db.js";
import { logger } from "./logger.js";

const SALT = "geonseolup_jobview_2026";

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + SALT).digest("hex").slice(0, 16);
}

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}
function kstDateOffset(days: number): string {
  return new Date(Date.now() + 9 * 3600000 - days * 86400000).toISOString().slice(0, 10);
}

let _initialized = false;
async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS job_view_events (
      id SERIAL PRIMARY KEY,
      job_id TEXT NOT NULL,
      view_date DATE NOT NULL,
      ip_hash VARCHAR(16) NOT NULL,
      viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(job_id, view_date, ip_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_job_view_events_job ON job_view_events(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_view_events_date ON job_view_events(view_date);
  `);
  _initialized = true;
}
ensureTable().catch((e) => logger.error({ err: String(e) }, "[job-views] 테이블 초기화 실패"));

// 요청에서 클라이언트 IP 추출 (visitors.ts와 동일한 방식)
export function extractIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (typeof first === "string" ? first.split(",")[0]?.trim() : undefined) || req.socket?.remoteAddress || "0.0.0.0";
}

export async function recordJobView(jobId: string, ip: string): Promise<boolean> {
  await ensureTable();
  const ipHash = hashIp(ip);
  const today = todayKST();
  try {
    const result = await pgPool.query(
      `INSERT INTO job_view_events (job_id, view_date, ip_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id, view_date, ip_hash) DO NOTHING`,
      [jobId, today, ipHash]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.warn({ err: String(err), jobId }, "[job-views] 조회 기록 실패");
    return false;
  }
}

// 최근 N일간 조회수 상위 공고 id 목록 (조회수 내림차순)
export async function getPopularJobIds(limit = 10, days = 7): Promise<{ jobId: string; views: number }[]> {
  await ensureTable();
  const since = kstDateOffset(days);
  try {
    const result = await pgPool.query<{ job_id: string; views: string }>(
      `SELECT job_id, COUNT(*) AS views
       FROM job_view_events
       WHERE view_date >= $1
       GROUP BY job_id
       ORDER BY views DESC
       LIMIT $2`,
      [since, limit]
    );
    return result.rows.map((r) => ({ jobId: r.job_id, views: Number(r.views) }));
  } catch (err) {
    logger.warn({ err: String(err) }, "[job-views] 인기 공고 조회 실패");
    return [];
  }
}
