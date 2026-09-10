// 콘텐츠(건설꿀팁/현장소식/노가다툰) 조회수·좋아요 집계 — [[job-views]]와 동일한 원리.
// 같은 방문자가 새로고침을 반복해도 조회수가 부풀려지지 않도록
// (콘텐츠 타입, slug, 날짜, 방문자 IP 해시) 단위로 하루 1회만 카운트한다.
// 좋아요는 날짜 구분 없이 (콘텐츠 타입, slug, IP 해시) 단위로 영구 1회 — 다시 누르면 취소(토글).
// 구인구직은 이미 job_view_events(잡뷰) 전용 테이블이 따로 있어 이 모듈의 대상이 아니다.

import { createHash } from "crypto";
import { pgPool } from "./db";
import { logger } from "./logger.js";

export type ContentType = "blog" | "news" | "toon";
export const CONTENT_TYPES: ContentType[] = ["blog", "news", "toon"];

const SALT = "geonseolup_contentengage_2026";

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
async function ensureTables(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS content_view_events (
      id SERIAL PRIMARY KEY,
      content_type VARCHAR(20) NOT NULL,
      content_id VARCHAR(150) NOT NULL,
      view_date DATE NOT NULL,
      ip_hash VARCHAR(16) NOT NULL,
      viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(content_type, content_id, view_date, ip_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_content_view_events_item ON content_view_events(content_type, content_id);
    CREATE INDEX IF NOT EXISTS idx_content_view_events_date ON content_view_events(view_date);

    CREATE TABLE IF NOT EXISTS content_likes (
      id SERIAL PRIMARY KEY,
      content_type VARCHAR(20) NOT NULL,
      content_id VARCHAR(150) NOT NULL,
      ip_hash VARCHAR(16) NOT NULL,
      liked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(content_type, content_id, ip_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_content_likes_item ON content_likes(content_type, content_id);

    CREATE TABLE IF NOT EXISTS content_comments (
      id SERIAL PRIMARY KEY,
      content_type VARCHAR(20) NOT NULL,
      content_id VARCHAR(150) NOT NULL,
      author VARCHAR(30) NOT NULL DEFAULT '익명',
      body VARCHAR(500) NOT NULL,
      ip_hash VARCHAR(16) NOT NULL,
      hidden BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_content_comments_item ON content_comments(content_type, content_id);
    CREATE INDEX IF NOT EXISTS idx_content_comments_created ON content_comments(created_at);
  `);
  _initialized = true;
}
ensureTables().catch((e) => logger.error({ err: String(e) }, "[content-engagement] 테이블 초기화 실패"));

// 요청에서 클라이언트 IP 추출 (jobViews.ts/visitors.ts와 동일한 방식)
export function extractIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (typeof first === "string" ? first.split(",")[0]?.trim() : undefined) || req.socket?.remoteAddress || "0.0.0.0";
}

export async function recordContentView(type: ContentType, contentId: string, ip: string): Promise<boolean> {
  await ensureTables();
  const ipHash = hashIp(ip);
  const today = todayKST();
  try {
    const result = await pgPool.query(
      `INSERT INTO content_view_events (content_type, content_id, view_date, ip_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (content_type, content_id, view_date, ip_hash) DO NOTHING`,
      [type, contentId, today, ipHash]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.warn({ err: String(err), type, contentId }, "[content-engagement] 조회 기록 실패");
    return false;
  }
}

export async function getViewCount(type: ContentType, contentId: string): Promise<number> {
  await ensureTables();
  const result = await pgPool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM content_view_events WHERE content_type = $1 AND content_id = $2`,
    [type, contentId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function getLikeCount(type: ContentType, contentId: string): Promise<number> {
  await ensureTables();
  const result = await pgPool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM content_likes WHERE content_type = $1 AND content_id = $2`,
    [type, contentId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function getEngagement(
  type: ContentType,
  contentId: string,
  ip: string
): Promise<{ views: number; likes: number; liked: boolean }> {
  await ensureTables();
  const ipHash = hashIp(ip);
  const [views, likes, likedResult] = await Promise.all([
    getViewCount(type, contentId),
    getLikeCount(type, contentId),
    pgPool.query(
      `SELECT 1 FROM content_likes WHERE content_type = $1 AND content_id = $2 AND ip_hash = $3`,
      [type, contentId, ipHash]
    ),
  ]);
  return { views, likes, liked: (likedResult.rowCount ?? 0) > 0 };
}

// 좋아요 토글 — 이미 눌렀으면 취소, 안 눌렀으면 등록.
export async function toggleLike(type: ContentType, contentId: string, ip: string): Promise<{ liked: boolean; likes: number }> {
  await ensureTables();
  const ipHash = hashIp(ip);
  try {
    const inserted = await pgPool.query(
      `INSERT INTO content_likes (content_type, content_id, ip_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (content_type, content_id, ip_hash) DO NOTHING`,
      [type, contentId, ipHash]
    );
    let liked = (inserted.rowCount ?? 0) > 0;
    if (!liked) {
      // 이미 있었다는 뜻 — 취소(삭제) 처리
      await pgPool.query(
        `DELETE FROM content_likes WHERE content_type = $1 AND content_id = $2 AND ip_hash = $3`,
        [type, contentId, ipHash]
      );
      liked = false;
    }
    const likes = await getLikeCount(type, contentId);
    return { liked, likes };
  } catch (err) {
    logger.warn({ err: String(err), type, contentId }, "[content-engagement] 좋아요 처리 실패");
    const likes = await getLikeCount(type, contentId);
    return { liked: false, likes };
  }
}

// 최근 N일간 조회수 상위 콘텐츠 id(slug) 목록 (조회수 내림차순) — 관리자 통계용.
export async function getPopularContent(type: ContentType, limit = 10, days = 7): Promise<{ contentId: string; views: number }[]> {
  await ensureTables();
  const since = kstDateOffset(days);
  try {
    const result = await pgPool.query<{ content_id: string; views: string }>(
      `SELECT content_id, COUNT(*) AS views
       FROM content_view_events
       WHERE content_type = $1 AND view_date >= $2
       GROUP BY content_id
       ORDER BY views DESC
       LIMIT $3`,
      [type, since, limit]
    );
    return result.rows.map((r) => ({ contentId: r.content_id, views: Number(r.views) }));
  } catch (err) {
    logger.warn({ err: String(err), type }, "[content-engagement] 인기 콘텐츠 조회 실패");
    return [];
  }
}

// 콘텐츠 타입 전체의 조회수·좋아요 수를 한 번에 조회 (관리자 목록 화면 "조회수 한눈에 보기"용).
// 인기 콘텐츠(getPopularContent)와 달리 최근 N일 제한 없이 전체 누적 기준이고,
// 목록에 있는지 여부와 무관하게 조회 이벤트가 있는 contentId는 전부 포함한다.
export async function getAllCounts(type: ContentType): Promise<{ contentId: string; views: number; likes: number }[]> {
  await ensureTables();
  try {
    const result = await pgPool.query<{ content_id: string; views: string; likes: string }>(
      `SELECT
         COALESCE(v.content_id, l.content_id) AS content_id,
         COALESCE(v.views, 0) AS views,
         COALESCE(l.likes, 0) AS likes
       FROM
         (SELECT content_id, COUNT(*) AS views FROM content_view_events WHERE content_type = $1 GROUP BY content_id) v
         FULL OUTER JOIN
         (SELECT content_id, COUNT(*) AS likes FROM content_likes WHERE content_type = $1 GROUP BY content_id) l
         ON v.content_id = l.content_id`,
      [type]
    );
    return result.rows.map((r) => ({ contentId: r.content_id, views: Number(r.views), likes: Number(r.likes) }));
  } catch (err) {
    logger.warn({ err: String(err), type }, "[content-engagement] 전체 카운트 조회 실패");
    return [];
  }
}

// getAllCounts와 같은 모양이지만 조회수만 기간으로 제한한다 (2026-09-08 "오늘/어제/N일" 기간
// 선택 추가 — [[job-views]]의 getJobViewCountMap과 동일한 원리, exact=true면 그 날짜 하루만
// `view_date = since`, 아니면 오늘부터 days일 전까지 누적 `view_date >= since`).
// 좋아요는 날짜 구분이 없는 영구 집계라 기간과 무관하게 항상 전체 누적으로 붙인다.
export async function getRangedCounts(
  type: ContentType,
  days: number,
  exact: boolean
): Promise<{ contentId: string; views: number; likes: number }[]> {
  await ensureTables();
  const since = kstDateOffset(days);
  const dateClause = exact ? `view_date = $2` : `view_date >= $2`;
  try {
    const result = await pgPool.query<{ content_id: string; views: string; likes: string }>(
      `SELECT
         COALESCE(v.content_id, l.content_id) AS content_id,
         COALESCE(v.views, 0) AS views,
         COALESCE(l.likes, 0) AS likes
       FROM
         (SELECT content_id, COUNT(*) AS views FROM content_view_events WHERE content_type = $1 AND ${dateClause} GROUP BY content_id) v
         FULL OUTER JOIN
         (SELECT content_id, COUNT(*) AS likes FROM content_likes WHERE content_type = $1 GROUP BY content_id) l
         ON v.content_id = l.content_id`,
      [type, since]
    );
    return result.rows.map((r) => ({ contentId: r.content_id, views: Number(r.views), likes: Number(r.likes) }));
  } catch (err) {
    logger.warn({ err: String(err), type, days, exact }, "[content-engagement] 기간별 카운트 조회 실패");
    return [];
  }
}

// ── 댓글(2026-09-10 신설) ───────────────────────────────────────────────
// 로그인 없이 IP 기준으로 남기는 익명 댓글. content_likes와 같은 (content_type, content_id) 키.

export interface CommentRow {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

const COMMENT_COOLDOWN_MS = 15_000; // 같은 글에 15초 안에 연달아 쓰는 것 방지(오클릭/중복전송 방지 목적)
const COMMENT_DAILY_LIMIT_PER_IP = 30; // 스팸 방지용 하루 상한(사이트 전체 기준)

// 제어문자 제거(줄바꿈은 허용) + 앞뒤 공백 정리 + 길이 제한.
// HTML 이스케이프는 프론트에서 텍스트로만 렌더링하므로(dangerouslySetInnerHTML 안 씀) 여기서는 저장용 정제만 한다.
// 정규식 문자 클래스 대신 코드포인트 필터링을 쓴다(제어문자 리터럴을 소스에 직접 넣지 않기 위함).
function sanitizeCommentText(raw: string, maxLen: number): string {
  const kept: string[] = [];
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    const isNewline = code === 10;
    const isControl = code < 32 || code === 127;
    if (isControl && !isNewline) continue;
    kept.push(ch);
  }
  return kept.join("").trim().slice(0, maxLen);
}

export async function getComments(type: ContentType, contentId: string): Promise<CommentRow[]> {
  await ensureTables();
  const result = await pgPool.query<{ id: number; author: string; body: string; created_at: string }>(
    `SELECT id, author, body, created_at FROM content_comments
     WHERE content_type = $1 AND content_id = $2 AND hidden = false
     ORDER BY created_at DESC LIMIT 200`,
    [type, contentId]
  );
  return result.rows.map((r) => ({ id: r.id, author: r.author, body: r.body, createdAt: r.created_at }));
}

export async function getCommentCount(type: ContentType, contentId: string): Promise<number> {
  await ensureTables();
  const result = await pgPool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM content_comments WHERE content_type = $1 AND content_id = $2 AND hidden = false`,
    [type, contentId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export type AddCommentResult =
  | { ok: true; comment: CommentRow }
  | { ok: false; reason: "empty" | "too_long" | "cooldown" | "daily_limit" };

export async function addComment(
  type: ContentType,
  contentId: string,
  ip: string,
  authorRaw: string,
  bodyRaw: string
): Promise<AddCommentResult> {
  await ensureTables();
  if (bodyRaw.length > 500) return { ok: false, reason: "too_long" };
  const body = sanitizeCommentText(bodyRaw || "", 500);
  if (!body || body.length < 1) return { ok: false, reason: "empty" };
  const author = sanitizeCommentText(authorRaw || "", 30) || "익명";
  const ipHash = hashIp(ip);

  // 쿨다운: 같은 글에 같은 IP가 최근에 남긴 댓글이 있으면 거절(중복 전송/도배 1차 방지)
  const recent = await pgPool.query<{ created_at: string }>(
    `SELECT created_at FROM content_comments
     WHERE content_type = $1 AND content_id = $2 AND ip_hash = $3
     ORDER BY created_at DESC LIMIT 1`,
    [type, contentId, ipHash]
  );
  const lastAt = recent.rows[0]?.created_at;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < COMMENT_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }

  // 하루 상한: 사이트 전체에서 같은 IP가 남긴 댓글 수(2차 스팸 방지, 정상 이용자는 거의 걸릴 일 없음)
  const todayCount = await pgPool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM content_comments WHERE ip_hash = $1 AND created_at >= now() - interval '1 day'`,
    [ipHash]
  );
  if (Number(todayCount.rows[0]?.count ?? 0) >= COMMENT_DAILY_LIMIT_PER_IP) {
    return { ok: false, reason: "daily_limit" };
  }

  const inserted = await pgPool.query<{ id: number; author: string; body: string; created_at: string }>(
    `INSERT INTO content_comments (content_type, content_id, author, body, ip_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, author, body, created_at`,
    [type, contentId, author, body, ipHash]
  );
  const row = inserted.rows[0]!;
  return { ok: true, comment: { id: row.id, author: row.author, body: row.body, createdAt: row.created_at } };
}

// 관리자 전용 — 최근 댓글 목록(숨김 포함, 관리자가 스팸을 걸러낼 수 있게).
export async function getRecentCommentsAdmin(limit = 200): Promise<
  { id: number; contentType: ContentType; contentId: string; author: string; body: string; hidden: boolean; createdAt: string }[]
> {
  await ensureTables();
  const result = await pgPool.query<{
    id: number; content_type: ContentType; content_id: string; author: string; body: string; hidden: boolean; created_at: string;
  }>(
    `SELECT id, content_type, content_id, author, body, hidden, created_at FROM content_comments
     ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(500, limit))]
  );
  return result.rows.map((r) => ({
    id: r.id, contentType: r.content_type, contentId: r.content_id,
    author: r.author, body: r.body, hidden: r.hidden, createdAt: r.created_at,
  }));
}

// 관리자 전용 — 댓글 숨김/숨김해제(소프트 삭제, 오판 시 복구 가능).
export async function setCommentHidden(id: number, hidden: boolean): Promise<boolean> {
  await ensureTables();
  const result = await pgPool.query(`UPDATE content_comments SET hidden = $1 WHERE id = $2`, [hidden, id]);
  return (result.rowCount ?? 0) > 0;
}

// 관리자 전용 — 댓글 완전 삭제.
export async function deleteComment(id: number): Promise<boolean> {
  await ensureTables();
  const result = await pgPool.query(`DELETE FROM content_comments WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// 위 인기 콘텐츠 id들의 좋아요 수를 한 번에 조회 (관리자 통계 테이블용)
export async function getLikeCounts(type: ContentType, contentIds: string[]): Promise<Map<string, number>> {
  await ensureTables();
  if (contentIds.length === 0) return new Map();
  try {
    const result = await pgPool.query<{ content_id: string; count: string }>(
      `SELECT content_id, COUNT(*) AS count FROM content_likes
       WHERE content_type = $1 AND content_id = ANY($2)
       GROUP BY content_id`,
      [type, contentIds]
    );
    return new Map(result.rows.map((r) => [r.content_id, Number(r.count)]));
  } catch (err) {
    logger.warn({ err: String(err), type }, "[content-engagement] 좋아요 수 일괄 조회 실패");
    return new Map();
  }
}
