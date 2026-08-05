// Threads(Meta) 장기 액세스 토큰 자동 갱신.
// 장기 토큰은 60일짜리라 방치하면 언젠가 만료되어 발행이 조용히 막힌다.
// 이 모듈은 DB에 토큰을 보관하면서 만료 10일 전부터 매일 자동 갱신을 시도해
// "토큰 만료로 인한 장애"가 다시는 일어나지 않게 한다.
//
// 최초 1회만 사용자가 Replit Secrets에 THREADS_ACCESS_TOKEN_SEED(기존에
// 발급받은 장기 토큰 값)를 등록해두면, 그 이후로는 이 모듈이 알아서
// 계속 갱신하며 DB에만 최신 토큰을 보관한다 (레포/env에는 다시 안 씀).
//
// 주의: 이 모듈은 토큰 "유효성 유지"만 담당한다. 실제 Threads 발행 기능은
// 별도이며(현재 미구현), 발행은 여전히 사람의 승인을 거쳐야 한다는 기존
// 운영 원칙과 무관하다.

import { pgPool } from "./db.js";
import { logger } from "./logger.js";

const REFRESH_URL = "https://graph.threads.net/refresh_access_token";
const CHECK_INTERVAL_MS = 24 * 3600_000; // 하루 1회 점검
const REFRESH_BEFORE_MS = 10 * 24 * 3600_000; // 만료 10일 전부터 갱신 시도 (재시도 여유 확보)
const DEFAULT_TTL_MS = 60 * 24 * 3600_000; // Meta 장기 토큰 기본 수명(60일) — 시드 시 최초 만료 추정치

let _initialized = false;
async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS threads_token (
      id INTEGER PRIMARY KEY DEFAULT 1,
      access_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT threads_token_singleton CHECK (id = 1)
    );
  `);
  _initialized = true;
}

// DB에 토큰이 없으면 환경변수(THREADS_ACCESS_TOKEN_SEED)로 최초 1회 시드.
async function seedIfEmpty(): Promise<void> {
  await ensureTable();
  const existing = await pgPool.query(`SELECT id FROM threads_token WHERE id = 1`);
  if ((existing.rowCount ?? 0) > 0) return;

  const seed = process.env["THREADS_ACCESS_TOKEN_SEED"];
  if (!seed) return;

  await pgPool.query(
    `INSERT INTO threads_token (id, access_token, expires_at) VALUES (1, $1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [seed, new Date(Date.now() + DEFAULT_TTL_MS)]
  );
  logger.info("[threads-token] THREADS_ACCESS_TOKEN_SEED로 최초 토큰 시드 완료");
}

export async function getCurrentThreadsToken(): Promise<{ token: string; expiresAt: Date } | null> {
  await seedIfEmpty();
  const result = await pgPool.query<{ access_token: string; expires_at: Date }>(
    `SELECT access_token, expires_at FROM threads_token WHERE id = 1`
  );
  const row = result.rows[0];
  if (!row) return null;
  return { token: row.access_token, expiresAt: new Date(row.expires_at) };
}

async function refreshIfNeeded(): Promise<void> {
  const current = await getCurrentThreadsToken();
  if (!current) {
    logger.debug("[threads-token] 저장된 토큰 없음(THREADS_ACCESS_TOKEN_SEED 미설정) — 건너뜀");
    return;
  }

  const msLeft = current.expiresAt.getTime() - Date.now();
  if (msLeft > REFRESH_BEFORE_MS) return; // 아직 여유 있음

  if (msLeft <= 0) {
    logger.error(
      { expiresAt: current.expiresAt.toISOString() },
      "[threads-token] 토큰이 이미 만료됨 — 자동 갱신 불가, 수동으로 재발급 필요"
    );
    return;
  }

  try {
    const url = `${REFRESH_URL}?grant_type=th_refresh_token&access_token=${encodeURIComponent(current.token)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`갱신 API 실패 [${res.status}]: ${text}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

    await pgPool.query(
      `UPDATE threads_token SET access_token = $1, expires_at = $2, updated_at = now() WHERE id = 1`,
      [data.access_token, newExpiresAt]
    );
    logger.info(
      { newExpiresAt: newExpiresAt.toISOString() },
      "[threads-token] 장기 토큰 자동 갱신 성공 — 다음 만료일 갱신됨"
    );
  } catch (err) {
    logger.error(
      { err: String(err), expiresAt: current.expiresAt.toISOString() },
      "[threads-token] 자동 갱신 실패 — 다음 점검 주기(24시간 뒤)에 재시도"
    );
  }
}

let _handle: ReturnType<typeof setInterval> | null = null;
export function startThreadsTokenScheduler(): void {
  if (_handle != null) return;
  refreshIfNeeded().catch((err) => logger.error({ err: String(err) }, "[threads-token] 초기 점검 실패"));
  _handle = setInterval(() => {
    refreshIfNeeded().catch((err) => logger.error({ err: String(err) }, "[threads-token] 점검 실패"));
  }, CHECK_INTERVAL_MS);
}
