import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { Pool } from "pg";
import { requireAdmin } from "../lib/adminStore";
import { logger } from "../lib/logger";

const router = Router();

const SALT = "geonseolup_visitor_2026";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl: { rejectUnauthorized: false },
});

// idle 클라이언트 에러가 프로세스를 죽이지 않도록 처리
pool.on("error", (err) => {
  logger.error({ err }, "Visitor DB pool idle client error");
});

// KST (UTC+9) 기준 날짜 / 시간
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}
function kstDateOffset(days: number): string {
  return new Date(Date.now() + 9 * 3600000 - days * 86400000)
    .toISOString()
    .slice(0, 10);
}
function hourKST(): number {
  return new Date(Date.now() + 9 * 3600000).getUTCHours();
}

function hashIp(ip: string): string {
  return createHash("sha256")
    .update(ip + SALT)
    .digest("hex")
    .slice(0, 16);
}

// 유입 경로 분류 — UTM이 있으면 우선하고, 없으면 referrer 호스트로 추정한다.
// 브라우저가 referrer를 보내지 않으면 실제 출처를 복원할 수 없으므로 "출처 미확인"으로 분리한다.
const SOURCE_LABELS: Record<string, string> = {
  threads: "Threads",
  google: "Google",
  naver_search: "네이버 검색",
  naver_cafe: "네이버 카페",
  naver_blog: "네이버 블로그",
  naver_kin: "네이버 지식iN",
  naver_other: "네이버(기타)",
  daum_search: "다음 검색",
  daum_cafe: "다음 카페",
  daum_blog: "다음 블로그",
  daum_other: "다음(기타)",
  tistory: "티스토리",
  dcinside: "디시인사이드",
  ppomppu: "뽐뿌",
  clien: "클리앙",
  fmkorea: "에펨코리아",
  ruliweb: "루리웹",
  community: "기타 커뮤니티",
  cafe: "기타 카페",
  blog: "기타 블로그",
  band: "네이버 밴드",
  instagram: "Instagram",
  facebook: "Facebook",
  kakao: "카카오",
  twitter: "X(트위터)",
  youtube: "YouTube",
  telegram: "텔레그램",
  unknown: "출처 미확인",
  direct: "직접 방문",
  other: "기타",
  // 인앱브라우저 UA 추정치(referrer·UTM이 둘 다 없을 때만 폴백으로 사용) — 2026-08-30 추가.
  // 카카오톡/인스타그램/네이버/페이스북 인앱브라우저는 document.referrer를 구조적으로 안 보내
  // "출처 미확인"으로 뭉뚱그려지던 걸, User-Agent 서명으로 추정해 분리한다. 확정 값이 아니므로
  // "(추정)" 라벨을 붙여 UTM/referrer로 확인된 값과 구분한다.
  kakao_inapp: "카카오톡(추정)",
  instagram_inapp: "Instagram(추정)",
  naver_inapp: "네이버(추정)",
  facebook_inapp: "Facebook(추정)",
};

// 인앱브라우저 User-Agent 서명. referrer도 utm_source도 없는 "출처 미확인" 방문에만
// 폴백으로 적용한다 — 이미 확정된 출처(referrer/UTM)를 이걸로 덮어쓰지 않는다.
function detectInAppBrowser(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  if (/KAKAOTALK/i.test(ua)) return "kakao_inapp";
  if (/Instagram/i.test(ua)) return "instagram_inapp";
  if (/NAVER\(inapp/i.test(ua) || /NAVER Whale/i.test(ua) || /; NAVER\)/i.test(ua)) return "naver_inapp";
  if (/FBAN|FBAV|FBIOS/i.test(ua)) return "facebook_inapp";
  return null;
}

const INTERNAL_HOST_SUFFIXES = [
  "geonseolup.com",
  ".replit.app",
  ".replit.dev",
];

function isInternalHost(host: string): boolean {
  return INTERNAL_HOST_SUFFIXES.some((suffix) =>
    suffix.startsWith(".") ? host.endsWith(suffix) : host === suffix || host.endsWith(`.${suffix}`),
  );
}

function categorizeHost(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (isInternalHost(h)) return "internal";

  // 구체적인 하위 서비스부터 판별해야 naver.com/daum.net 일반 분류에 먹히지 않는다.
  if (h === "kin.naver.com" || h.endsWith(".kin.naver.com")) return "naver_kin";
  if (h === "cafe.naver.com" || h.endsWith(".cafe.naver.com")) return "naver_cafe";
  if (h === "blog.naver.com" || h.endsWith(".blog.naver.com")) return "naver_blog";
  if (h === "search.naver.com" || h.endsWith(".search.naver.com")) return "naver_search";
  if (h === "post.naver.com" || h.endsWith(".post.naver.com")) return "naver_blog";
  if (h === "naver.com" || h.endsWith(".naver.com")) return "naver_other";

  if (h === "cafe.daum.net" || h.endsWith(".cafe.daum.net")) return "daum_cafe";
  if (h === "blog.daum.net" || h.endsWith(".blog.daum.net")) return "daum_blog";
  if (h === "search.daum.net" || h.endsWith(".search.daum.net")) return "daum_search";
  if (h === "daum.net" || h.endsWith(".daum.net")) return "daum_other";
  if (h === "tistory.com" || h.endsWith(".tistory.com")) return "tistory";

  if (h === "dcinside.com" || h.endsWith(".dcinside.com")) return "dcinside";
  if (h === "ppomppu.co.kr" || h.endsWith(".ppomppu.co.kr")) return "ppomppu";
  if (h === "clien.net" || h.endsWith(".clien.net")) return "clien";
  if (h === "fmkorea.com" || h.endsWith(".fmkorea.com")) return "fmkorea";
  if (h === "ruliweb.com" || h.endsWith(".ruliweb.com")) return "ruliweb";
  if (
    h === "brunch.co.kr" || h.endsWith(".brunch.co.kr") ||
    h === "velog.io" || h.endsWith(".velog.io") ||
    h === "medium.com" || h.endsWith(".medium.com") ||
    h === "blogger.com" || h.endsWith(".blogger.com") ||
    h === "blogspot.com" || h.endsWith(".blogspot.com")
  ) return "blog";
  if (
    h === "teamblind.com" || h.endsWith(".teamblind.com") ||
    h === "bobaedream.co.kr" || h.endsWith(".bobaedream.co.kr") ||
    h === "inven.co.kr" || h.endsWith(".inven.co.kr") ||
    h === "theqoo.net" || h.endsWith(".theqoo.net") ||
    h === "mlbpark.donga.com" || h.endsWith(".mlbpark.donga.com") ||
    h === "arca.live" || h.endsWith(".arca.live")
  ) return "community";

  if (h.includes("threads.")) return "threads";
  if (h === "band.us" || h.endsWith(".band.us")) return "band";
  if (h.includes("google.")) return "google";
  if (h.includes("instagram.")) return "instagram";
  if (h.includes("facebook.") || h === "fb.com" || h.endsWith(".fb.com")) return "facebook";
  if (h.includes("kakao.") || h === "kko.to" || h.endsWith(".kko.to")) return "kakao";
  if (h.includes("twitter.") || h === "x.com" || h.endsWith(".x.com") || h === "t.co") return "twitter";
  if (h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtu.be") return "youtube";
  if (h === "telegram.org" || h.endsWith(".telegram.org") || h === "t.me") return "telegram";
  return "other";
}

function categorizeUtmSource(utmSource: string): string {
  const u = utmSource.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!u) return "other";
  if (u.includes("naver") && (u.includes("kin") || u.includes("knowledge") || u.includes("지식"))) return "naver_kin";
  if (u.includes("naver") && u.includes("cafe")) return "naver_cafe";
  if (u.includes("naver") && (u.includes("blog") || u.includes("post"))) return "naver_blog";
  if (u.includes("naver")) return "naver_search";
  if (u.includes("daum") && u.includes("cafe")) return "daum_cafe";
  if (u.includes("daum") && u.includes("blog")) return "daum_blog";
  if (u.includes("daum")) return "daum_search";
  if (u.includes("tistory")) return "tistory";
  if (u.includes("dcinside") || u === "dc") return "dcinside";
  if (u.includes("ppomppu")) return "ppomppu";
  if (u.includes("clien")) return "clien";
  if (u.includes("fmkorea") || u === "fm") return "fmkorea";
  if (u.includes("ruliweb")) return "ruliweb";
  if (u.includes("community") || u.includes("forum") || u.includes("board")) return "community";
  if (u === "cafe" || u.includes("personal_cafe") || u.includes("private_cafe")) return "cafe";
  if (u === "blog" || u.includes("personal_blog") || u.includes("private_blog")) return "blog";
  if (u.includes("thread")) return "threads";
  if (u.includes("band")) return "band";
  if (u.includes("google")) return "google";
  if (u.includes("instagram") || u === "ig") return "instagram";
  if (u.includes("facebook") || u === "fb") return "facebook";
  if (u.includes("kakao")) return "kakao";
  if (u.includes("twitter") || u === "x") return "twitter";
  if (u.includes("youtube")) return "youtube";
  if (u.includes("telegram")) return "telegram";
  if (u === "direct" || u === "bookmark") return "direct";
  return "other";
}

function categorizeSource(referrer: string | undefined, utmSource: string | undefined): string {
  if (utmSource) {
    return categorizeUtmSource(utmSource);
  }
  if (!referrer) return "unknown";
  try {
    return categorizeHost(new URL(referrer).hostname);
  } catch {
    return "other";
  }
}

function refineStoredSource(source: string, referrerHost: string | null): string {
  if (source === "direct") {
    if (referrerHost && categorizeHost(referrerHost) === "internal") return "internal";
    // 예전 기록에서 direct는 referrer가 없다는 의미였으므로 "출처 미확인"으로 바로잡는다.
    return "unknown";
  }
  if ((source === "naver" || source === "other") && referrerHost) {
    const byHost = categorizeHost(referrerHost);
    if (byHost !== "other") return byHost;
  }
  if (source === "naver") return "naver_other";
  return source;
}

function safeTrackingValue(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .trim()
    .slice(0, maxLength);
}

function safeLandingPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  // 검색어·전화번호 등 쿼리 정보는 저장하지 않고 경로만 남긴다.
  const path = value.split(/[?#]/, 1)[0].slice(0, 255) || "/";
  const allowedRoute =
    /^\/$/u.test(path) ||
    /^\/detail\/[A-Za-z0-9_-]{1,100}$/u.test(path) ||
    /^\/jobs\/[^/]{1,120}\/[^/]{1,120}$/u.test(path) ||
    /^\/(?:post|shop|info|news|wages|contact|terms|privacy)$/u.test(path) ||
    /^\/(?:info|news)\/[A-Za-z0-9_-]{1,160}$/u.test(path);
  return allowedRoute ? path : "/";
}

function safeStatsDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return todayKST();
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return todayKST();
  return value;
}

function safeStatsDays(value: unknown): 1 | 7 {
  return String(value) === "7" ? 7 : 1;
}

// 테이블 자동 생성
async function initTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_logs (
      id SERIAL PRIMARY KEY,
      visit_date DATE NOT NULL,
      ip_hash VARCHAR(16) NOT NULL,
      UNIQUE(visit_date, ip_hash)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_hourly (
      id SERIAL PRIMARY KEY,
      visit_date DATE NOT NULL,
      visit_hour SMALLINT NOT NULL CHECK (visit_hour >= 0 AND visit_hour <= 23),
      ip_hash VARCHAR(16) NOT NULL,
      UNIQUE(visit_date, visit_hour, ip_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_visit_hourly_date ON visit_hourly(visit_date);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_sources (
      id SERIAL PRIMARY KEY,
      visit_date DATE NOT NULL,
      source VARCHAR(20) NOT NULL,
      referrer_host VARCHAR(255),
      ip_hash VARCHAR(16) NOT NULL,
      UNIQUE(visit_date, source, ip_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_visit_sources_date ON visit_sources(visit_date);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_attributions (
      id SERIAL PRIMARY KEY,
      visit_date DATE NOT NULL,
      source VARCHAR(20) NOT NULL,
      medium VARCHAR(50) NOT NULL DEFAULT '',
      campaign VARCHAR(100) NOT NULL DEFAULT '',
      content VARCHAR(100) NOT NULL DEFAULT '',
      landing_path VARCHAR(255) NOT NULL DEFAULT '/',
      ip_hash VARCHAR(16) NOT NULL,
      UNIQUE(visit_date, ip_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_visit_attributions_date ON visit_attributions(visit_date);
  `);
}
const tablesReady = initTables();
tablesReady.catch((err) => logger.error({ err }, "Visitor table initialization failed"));

async function getVisitorStats() {
  const today = todayKST();
  const yesterday = kstDateOffset(1);
  const weekAgo = kstDateOffset(6);

  const result = await pool.query<{
    today: string;
    yesterday: string;
    week: string;
    total: string;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE visit_date = $1) AS today,
      COUNT(*) FILTER (WHERE visit_date = $2) AS yesterday,
      COUNT(*) FILTER (WHERE visit_date >= $3) AS week,
      COUNT(*) AS total
    FROM visitor_logs`,
    [today, yesterday, weekAgo]
  );

  const row = result.rows[0];
  return {
    total: Number(row?.total ?? 0),
    today: Number(row?.today ?? 0),
    yesterday: Number(row?.yesterday ?? 0),
    week: Number(row?.week ?? 0),
  };
}

interface VisitBody {
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  landingPath?: string;
}

// POST /api/visit — 방문 기록 (인증 불필요)
router.post("/visit", async (req: Request, res: Response) => {
  try {
    await tablesReady;
    const body = (req.body ?? {}) as VisitBody;
    const referrer =
      typeof body.referrer === "string" && body.referrer.length <= 2048
        ? body.referrer
        : undefined;
    const utmSource = safeTrackingValue(body.utmSource, 50);
    let source = categorizeSource(referrer, utmSource || undefined);
    // referrer도 utm도 없어 "출처 미확인"으로 떨어진 경우에만, User-Agent로 인앱브라우저
    // 추정을 시도한다(확정된 값은 절대 덮어쓰지 않음). 2026-08-30 추가.
    if (source === "unknown") {
      const inapp = detectInAppBrowser(req.headers["user-agent"] as string | undefined);
      if (inapp) source = inapp;
    }

    // 같은 사이트 안에서 발생한 새로고침/이동은 전체·시간대·유입 통계 어디에도 넣지 않는다.
    if (source === "internal") {
      res.json({ ok: true, counted: false, attributed: false });
      return;
    }

    const rawIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "0.0.0.0";
    const ipHash = hashIp(rawIp);
    const today = todayKST();
    const hour = hourKST();

    const insertResult = await pool.query(
      `INSERT INTO visitor_logs (visit_date, ip_hash)
       VALUES ($1, $2)
       ON CONFLICT (visit_date, ip_hash) DO NOTHING`,
      [today, ipHash]
    );

    // 시간별 기록 (시간당 1회 중복 방지)
    await pool.query(
      `INSERT INTO visit_hourly (visit_date, visit_hour, ip_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (visit_date, visit_hour, ip_hash) DO NOTHING`,
      [today, hour, ipHash]
    );

    let referrerHost: string | null = null;
    if (referrer) {
      try {
        referrerHost = new URL(referrer).hostname.slice(0, 255);
      } catch {
        referrerHost = null;
      }
    }

    // 하루 첫 외부 방문 1건만 attribution으로 원자적 기록한다.
    // 같은 사람이 다른 링크/페이지로 다시 들어와도 첫 유입처·첫 페이지가 바뀌지 않는다.
    const attributionResult = await pool.query<{ recorded: boolean }>(
      `WITH first_touch AS (
         INSERT INTO visit_attributions
           (visit_date, source, medium, campaign, content, landing_path, ip_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (visit_date, ip_hash) DO NOTHING
         RETURNING 1
       ),
       source_insert AS (
         INSERT INTO visit_sources (visit_date, source, referrer_host, ip_hash)
         SELECT $1, $2, $8, $7 FROM first_touch
         ON CONFLICT (visit_date, source, ip_hash) DO NOTHING
         RETURNING 1
       )
       SELECT EXISTS(SELECT 1 FROM first_touch) AS recorded`,
      [
        today,
        source,
        safeTrackingValue(body.utmMedium, 50),
        safeTrackingValue(body.utmCampaign, 100),
        safeTrackingValue(body.utmContent, 100),
        safeLandingPath(body.landingPath),
        ipHash,
        referrerHost,
      ],
    );

    const counted = (insertResult.rowCount ?? 0) > 0;
    res.json({ ok: true, counted, attributed: attributionResult.rows[0]?.recorded === true });
  } catch (err) {
    req.log.error({ err }, "Visit recording failed");
    res.status(500).json({ error: "방문 기록 실패" });
  }
});

// GET /api/stats/visitors — 일별 통계 (관리자 전용)
router.get("/stats/visitors", requireAdmin, async (req: Request, res: Response) => {
  try {
    await tablesReady;
    const stats = await getVisitorStats();
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Visitor stats query failed");
    res.status(500).json({ error: "통계 조회 실패" });
  }
});

// GET /api/stats/hourly?date=YYYY-MM-DD — 시간대별 통계 (관리자 전용)
router.get("/stats/hourly", requireAdmin, async (req: Request, res: Response) => {
  try {
    await tablesReady;
    const date = safeStatsDate(req.query["date"]);

    const result = await pool.query<{ hour: string; count: string }>(
      `SELECT visit_hour AS hour, COUNT(*) AS count
       FROM visit_hourly
       WHERE visit_date = $1
       GROUP BY visit_hour
       ORDER BY visit_hour`,
      [date]
    );

    // 0~23시 전체 채우기 (방문 없는 시간 = 0)
    const map: Record<number, number> = {};
    for (const row of result.rows) {
      map[Number(row.hour)] = Number(row.count);
    }
    const rows = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: map[h] ?? 0,
    }));

    res.json({ date, rows });
  } catch (err) {
    req.log.error({ err }, "Hourly visitor stats query failed");
    res.status(500).json({ error: "시간대별 통계 조회 실패" });
  }
});

// GET /api/stats/sources?date=YYYY-MM-DD&days=N — 유입 경로별 통계 (관리자 전용)
// date만 주면 그 하루, days를 주면 date(기본 오늘)로부터 그 일수만큼 소급 합산.
router.get("/stats/sources", requireAdmin, async (req: Request, res: Response) => {
  try {
    await tablesReady;
    const date = safeStatsDate(req.query["date"]);
    const days = safeStatsDays(req.query["days"]);
    const fromDate =
      days === 1 ? date : new Date(new Date(date).getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);

    const [sourceResult, campaignResult, landingResult] = await Promise.all([
      pool.query<{ source: string; referrer_host: string | null; count: string }>(
      `SELECT source, referrer_host, COUNT(*) AS count
       FROM visit_sources
       WHERE visit_date BETWEEN $1 AND $2
       GROUP BY source, referrer_host`,
      [fromDate, date],
      ),
      pool.query<{
        source: string;
        medium: string;
        campaign: string;
        content: string;
        landing_path: string;
        count: string;
      }>(
        `SELECT source, medium, campaign, content, landing_path, COUNT(*) AS count
         FROM visit_attributions
         WHERE visit_date BETWEEN $1 AND $2
           AND (campaign <> '' OR content <> '')
         GROUP BY source, medium, campaign, content, landing_path
         ORDER BY count DESC, campaign, content
         LIMIT 30`,
        [fromDate, date],
      ),
      pool.query<{ source: string; landing_path: string; count: string }>(
        `SELECT source, landing_path, COUNT(*) AS count
         FROM visit_attributions
         WHERE visit_date BETWEEN $1 AND $2
         GROUP BY source, landing_path
         ORDER BY count DESC, landing_path
         LIMIT 15`,
        [fromDate, date],
      ),
    ]);

    // 과거의 넓은 분류도 저장된 referrer_host를 이용해 가능한 범위에서 다시 세분화한다.
    const sourceCounts = new Map<string, number>();
    for (const row of sourceResult.rows) {
      const source = refineStoredSource(row.source, row.referrer_host);
      if (source === "internal") continue;
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + Number(row.count));
    }
    const rows = Array.from(sourceCounts, ([source, count]) => ({
      source,
      label: SOURCE_LABELS[source] ?? source,
      count,
    })).sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);

    const campaigns = campaignResult.rows.map((row) => ({
      source: row.source,
      label: SOURCE_LABELS[row.source] ?? row.source,
      medium: row.medium,
      campaign: row.campaign,
      content: row.content,
      landingPath: row.landing_path,
      count: Number(row.count),
    }));
    const landings = landingResult.rows.map((row) => ({
      source: row.source,
      label: SOURCE_LABELS[row.source] ?? row.source,
      landingPath: row.landing_path,
      count: Number(row.count),
    }));

    res.json({ date, days, from: fromDate, to: date, total, rows, campaigns, landings });
  } catch (err) {
    req.log.error({ err }, "Traffic source stats query failed");
    res.status(500).json({ error: "유입경로 통계 조회 실패" });
  }
});

// POST /api/stats/visitors/reset — 통계 초기화 (관리자 전용)
router.post("/stats/visitors/reset", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await tablesReady;
    await pool.query("TRUNCATE visitor_logs, visit_hourly, visit_sources, visit_attributions");
    res.json({ success: true, total: 0, today: 0, yesterday: 0, week: 0 });
  } catch (err) {
    _req.log.error({ err }, "Visitor stats reset failed");
    res.status(500).json({ error: "초기화 실패" });
  }
});

export default router;
