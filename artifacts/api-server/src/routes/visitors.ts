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

// KST (UTC+9) 기준 날짜
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}
function kstDateOffset(days: number): string {
  return new Date(Date.now() + 9 * 3600000 - days * 86400000)
    .toISOString()
    .slice(0, 10);
}

function hashIp(ip: string): string {
  return createHash("sha256")
    .update(ip + SALT)
    .digest("hex")
    .slice(0, 16);
}

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

// POST /api/visit — 방문 기록 (인증 불필요: 모든 사용자 방문 집계)
router.post("/visit", async (req: Request, res: Response) => {
  try {
    const rawIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "0.0.0.0";
    const ipHash = hashIp(rawIp);
    const today = todayKST();

    const insertResult = await pool.query(
      `INSERT INTO visitor_logs (visit_date, ip_hash)
       VALUES ($1, $2)
       ON CONFLICT (visit_date, ip_hash) DO NOTHING`,
      [today, ipHash]
    );

    const counted = (insertResult.rowCount ?? 0) > 0;
    // 방문 기록만 처리, 통계는 반환하지 않음 (인증 필요)
    res.json({ ok: true, counted });
  } catch (err) {
    console.error("[Visit] Error:", err);
    res.status(500).json({ error: "방문 기록 실패" });
  }
});

// GET /api/stats/visitors — 통계 조회 (관리자 전용)
router.get("/stats/visitors", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await getVisitorStats();
    res.json(stats);
  } catch (err) {
    console.error("[Visitors] Error:", err);
    res.status(500).json({ error: "통계 조회 실패" });
  }
});

// POST /api/stats/visitors/reset — 통계 초기화 (관리자 전용)
router.post("/stats/visitors/reset", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await pool.query("TRUNCATE visitor_logs");
    res.json({ success: true, total: 0, today: 0, yesterday: 0, week: 0 });
  } catch (err) {
    console.error("[Visitors] Reset error:", err);
    res.status(500).json({ error: "초기화 실패" });
  }
});

export default router;
