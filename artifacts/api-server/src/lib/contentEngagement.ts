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
