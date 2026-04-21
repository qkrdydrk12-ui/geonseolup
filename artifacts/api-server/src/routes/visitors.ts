import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { Pool } from "pg";
import { requireAdmin } from "../lib/adminStore";

const router = Router();

const SALT = "geonseolup_visitor_2026";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false,
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

// POST /api/visit — 방문 기록 (인증 불필요)
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

// POST /api/stats/visitors/reset — 통계 초기화 (관리자 전용)
router.post("/stats/visitors/reset", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await pool.query("TRUNCATE visitor_logs, visit_hourly");
    res.json({ success: true, total: 0, today: 0, yesterday: 0, week: 0 });
  } catch (err) {
    console.error("[Visitors] Reset error:", err);
    res.status(500).json({ error: "초기화 실패" });
  }
});

export default router;
