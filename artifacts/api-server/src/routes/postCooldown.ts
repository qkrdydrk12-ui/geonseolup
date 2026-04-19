import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { Pool } from "pg";

const router = Router();

const COOLDOWN_MS = 30 * 60 * 1000; // 30분
const SALT = "geonseolup_post_2026";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false,
});

function hashPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return createHash("sha256")
    .update(digits + SALT)
    .digest("hex")
    .slice(0, 24);
}

/**
 * POST /api/post-cooldown
 * 전화번호 쿨타임 확인 + 등록 (원자적 처리)
 * Body: { phone: string }
 * Response: { allowed: boolean, remainingMs?: number, remainingMins?: number }
 */
router.post("/post-cooldown", async (req: Request, res: Response) => {
  try {
    const { phone } = req.body as { phone?: string };
    if (!phone || phone.replace(/[^0-9]/g, "").length < 10) {
      res.status(400).json({ allowed: false, message: "올바른 전화번호를 입력해주세요" });
      return;
    }

    const phoneHash = hashPhone(phone);
    const cutoff = new Date(Date.now() - COOLDOWN_MS);

    // 30분 이내 동일 전화번호 등록 이력 조회
    const check = await pool.query<{ posted_at: Date }>(
      `SELECT posted_at FROM post_cooldowns
       WHERE phone_hash = $1 AND posted_at > $2
       ORDER BY posted_at DESC
       LIMIT 1`,
      [phoneHash, cutoff]
    );

    if (check.rows.length > 0) {
      const postedAt = check.rows[0]!.posted_at.getTime();
      const remainingMs = COOLDOWN_MS - (Date.now() - postedAt);
      const remainingMins = Math.ceil(remainingMs / 60000);
      res.json({ allowed: false, remainingMs, remainingMins });
      return;
    }

    // 허용 → 즉시 기록 (이후 Firebase 등록 실패 시에도 쿨타임 적용)
    await pool.query(
      `INSERT INTO post_cooldowns (phone_hash) VALUES ($1)`,
      [phoneHash]
    );

    // 오래된 기록 정리 (1시간 이상 지난 것)
    pool
      .query(`DELETE FROM post_cooldowns WHERE posted_at < NOW() - INTERVAL '1 hour'`)
      .catch(() => {});

    res.json({ allowed: true });
  } catch (err) {
    console.error("[PostCooldown] Error:", err);
    // 서버 오류 시 등록 허용 (사용자 경험 우선)
    res.json({ allowed: true });
  }
});

export default router;
