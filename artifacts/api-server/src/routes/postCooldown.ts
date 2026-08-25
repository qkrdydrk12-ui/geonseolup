import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { Pool } from "pg";
import { runQuery, updateDocument } from "../lib/firestoreClient.js";

const router = Router();

const COOLDOWN_MS = 30 * 60 * 1000; // 30분
// 2026-08-25: jobLifecycle.ts의 ACTIVE_HOURS(48)와 반드시 같은 값을 쓴다 — "아직 모집 중인
// 공고"의 정의가 두 군데서 다르면 끌올 판단과 실제 마감 표시가 어긋난다.
const ACTIVE_HOURS = 48;
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
 * 같은 연락처로 아직 모집 중(등록 48시간 이내, hidden 아님)인 공고가 있으면
 * 새 문서를 또 만들지 않고 그 공고를 "끌어올린다"(date를 지금 시각으로 갱신 +
 * 이번에 새로 적어낸 내용으로 필드 업데이트). 2026-08-25 신설 — 같은 사람이
 * 30분 쿨타임이 풀린 뒤 재등록하면서 완전히 같은 공고가 목록에 중복으로
 * 쌓이는 문제(사용자 실측 발견)를 해결하기 위함.
 * 실패해도 예외를 던지지 않고 bumped:false로 폴백 — 신규 등록 흐름은 항상 살아있어야 한다.
 */
async function tryBumpActiveJob(
  phone: string,
  formData: Record<string, unknown> | undefined
): Promise<{ bumped: boolean; jobId?: string }> {
  if (!formData) return { bumped: false };
  try {
    const matches = await runQuery("jobs", [
      { field: "contact", op: "EQUAL", value: phone },
    ]);
    const now = Date.now();
    const active = matches
      .filter((j) => j["hidden"] !== true)
      .filter((j) => {
        const dateVal = j["date"];
        if (typeof dateVal !== "string") return false;
        const posted = new Date(dateVal).getTime();
        return !isNaN(posted) && now - posted < ACTIVE_HOURS * 3600_000;
      })
      .sort((a, b) => String(b["date"]).localeCompare(String(a["date"])));

    const target = active[0];
    if (!target) return { bumped: false };

    const jobId = String(target["id"]);
    await updateDocument("jobs", jobId, {
      ...formData,
      date: new Date().toISOString(),
    });
    return { bumped: true, jobId };
  } catch (err) {
    console.error("[PostCooldown] bump check failed (신규 등록으로 폴백):", err);
    return { bumped: false };
  }
}

/**
 * POST /api/post-cooldown
 * 전화번호 쿨타임 확인 + 등록 (원자적 처리) + 활성 공고 끌올 판단
 * Body: { phone: string, formData?: object } — formData는 끌올 시 그 문서에 덮어쓸 최신 공고 내용
 * Response: { allowed: boolean, remainingMs?: number, remainingMins?: number, bumped?: boolean, bumpedJobId?: string }
 */
router.post("/post-cooldown", async (req: Request, res: Response) => {
  try {
    const { phone, formData } = req.body as {
      phone?: string;
      formData?: Record<string, unknown>;
    };
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

    // 30분 쿨타임은 통과 — 아직 모집 중인 같은 번호 공고가 있으면 새로 만들지 않고 끌어올린다.
    const { bumped, jobId } = await tryBumpActiveJob(phone, formData);

    // 허용 → 즉시 기록 (이후 Firebase 등록 실패 시에도 쿨타임 적용)
    await pool.query(
      `INSERT INTO post_cooldowns (phone_hash) VALUES ($1)`,
      [phoneHash]
    );

    // 오래된 기록 정리 (1시간 이상 지난 것)
    pool
      .query(`DELETE FROM post_cooldowns WHERE posted_at < NOW() - INTERVAL '1 hour'`)
      .catch(() => {});

    res.json({ allowed: true, bumped, bumpedJobId: jobId });
  } catch (err) {
    console.error("[PostCooldown] Error:", err);
    // 서버 오류 시 등록 허용 (사용자 경험 우선)
    res.json({ allowed: true, bumped: false });
  }
});

export default router;
