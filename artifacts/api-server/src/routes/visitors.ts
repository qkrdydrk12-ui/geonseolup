import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { Pool } from "pg";
import { requireAdmin } from "../lib/adminStore";

const router = Router();

const SALT = "geonseolup_visitor_2026";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl: { rejectUnauthorized: false },
});

// idle 클라이언트 에러가 프로세스를 죽이지 않도록 처리
pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected idle client error:", err.message);
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

// 유입 경로 분류 — utm_source가 있으면 그걸 우선 쓰고, 없으면 referrer 호스트로 추정한다.
const SOURCE_LABELS: Record<string, string> = {
  threads: "Threads",
  google: "Google",
  naver: "Naver",
  band: "네이버 밴드",
  instagram: "Instagram",
  facebook: "Facebook",
  kakao: "카카오",
  twitter: "X(트위터)",
  direct: "직접 방문",
  other: "기타",
};

function categorizeSource(referrer: string | undefined, utmSource: string | undefined): string {
  if (utmSource) {
    const u = utmSource.toLowerCase();
    if (u.includes("thread")) return "threads";
    if (u.includes("band")) return "band";
    if (u.includes("google")) return "google";
    if (u.includes("naver")) return "naver";
    if (u.includes("instagram") || u === "ig") return "instagram";
    if (u.includes("facebook") || u === "fb") return "facebook";
    if (u.includes("kakao")) return "kakao";
    if (u.includes("twitter") || u === "x") return "twitter";
    return "other";
  }
  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  // 자기 사이트 내부 이동(리퍼러가 우리 도메인)은 외부 유입이 아니므로 direct로 취급
  if (host.endsWith("geonseolup.com") || host.endsWith(".replit.app") || host.endsWith(".replit.dev")) {
    return "direct";
  }
  if (host.includes("threads.")) return "threads";
  if (host.includes("band.us")) return "band";
  if (host.includes("google.")) return "google";
  if (host.includes("naver.")) return "naver";
  if (host.includes("instagram.")) return "instagram";
  if (host.includes("facebook.") || host.includes("fb.com")) return "facebook";
  if (host.includes("kakao.") || host.includes("kko.to")) return "kakao";
  if (host.includes("twitter.") || host === "x.com" || host.includes("t.co")) return "twitter";
  return "other";
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
}
initTables().catch((e) => console.error("[DB] initTables error:", e));

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

// POST /api/visit — 방문 기록 (인증 불필요). body: { referrer?: string, utmSource?: string }
router.post("/visit", async (req: Request, res: Response) => {
  try {
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

    // 유입 경로 기록 (같은 날 같은 IP·같은 소스는 1회만 카운트)
    const body = (req.body ?? {}) as { referrer?: string; utmSource?: string };
    const source = categorizeSource(body.referrer, body.utmSource);
    let referrerHost: string | null = null;
    if (body.referrer) {
      try {
        referrerHost = new URL(body.referrer).hostname.slice(0, 255);
      } catch {
        referrerHost = null;
      }
    }
    await pool.query(
      `INSERT INTO visit_sources (visit_date, source, referrer_host, ip_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (visit_date, source, ip_hash) DO NOTHING`,
      [today, source, referrerHost, ipHash]
    );

    const counted = (insertResult.rowCount ?? 0) > 0;
    res.json({ ok: true, counted });
  } catch (err) {
    console.error("[Visit] Error:", err);
    res.status(500).json({ error: "방문 기록 실패" });
  }
});

// GET /api/stats/visitors — 일별 통계 (관리자 전용)
router.get("/stats/visitors", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await getVisitorStats();
    res.json(stats);
  } catch (err) {
    console.error("[Visitors] Error:", err);
    res.status(500).json({ error: "통계 조회 실패" });
  }
});

// GET /api/stats/hourly?date=YYYY-MM-DD — 시간대별 통계 (관리자 전용)
router.get("/stats/hourly", requireAdmin, async (req: Request, res: Response) => {
  try {
    const date = (req.query["date"] as string) || todayKST();

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
    console.error("[Hourly] Error:", err);
    res.status(500).json({ error: "시간대별 통계 조회 실패" });
  }
});

// GET /api/stats/sources?date=YYYY-MM-DD&days=N — 유입 경로별 통계 (관리자 전용)
// date만 주면 그 하루, days를 주면 date(기본 오늘)로부터 그 일수만큼 소급 합산.
router.get("/stats/sources", requireAdmin, async (req: Request, res: Response) => {
  try {
    const date = (req.query["date"] as string) || todayKST();
    const days = Math.max(1, Number(req.query["days"] as string) || 1);
    const fromDate =
      days === 1 ? date : new Date(new Date(date).getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);

    const result = await pool.query<{ source: string; count: string }>(
      `SELECT source, COUNT(*) AS count
       FROM visit_sources
       WHERE visit_date BETWEEN $1 AND $2
         AND source <> 'direct'
       GROUP BY source
       ORDER BY count DESC`,
      [fromDate, date]
    );

    // 기록된 적 없는 소스는 0으로 채우지 않고, 실제 유입 있었던 것만 반환 + 라벨 붙여서 준다
    const rows = result.rows.map((r) => ({
      source: r.source,
      label: SOURCE_LABELS[r.source] ?? r.source,
      count: Number(r.count),
    }));
    const total = rows.reduce((s, r) => s + r.count, 0);

    res.json({ date, days, from: fromDate, to: date, total, rows });
  } catch (err) {
    console.error("[Sources] Error:", err);
    res.status(500).json({ error: "유입경로 통계 조회 실패" });
  }
});

// POST /api/stats/visitors/reset — 통계 초기화 (관리자 전용)
router.post("/stats/visitors/reset", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await pool.query("TRUNCATE visitor_logs, visit_hourly, visit_sources");
    res.json({ success: true, total: 0, today: 0, yesterday: 0, week: 0 });
  } catch (err) {
    console.error("[Visitors] Reset error:", err);
    res.status(500).json({ error: "초기화 실패" });
  }
});

export default router;
