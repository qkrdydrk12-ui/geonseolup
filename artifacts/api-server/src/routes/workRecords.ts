// 공수표(일용직 출퇴근 기록) 기능 1단계 — 공수 기록 코어 CRUD.
// 기획문서: Desktop/건설UP 공수표/건설UP_공수표_실행단계.html, 1단계 시작 2026-09-20.
import { Router, type IRouter, type Request, type Response } from "express";
import { pgPool } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { requireUser } from "../lib/userSession.js";

const router: IRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GONGSU_NUMBER_RE = /^\d+(\.\d)?$/;

// "absent" 또는 0.1 단위 소수 문자열(0.1~5)만 허용 — 하루 여러 현장으로 1.2공수 등도 가능.
function isValidGongsuType(value: string): boolean {
  if (value === "absent") return true;
  if (!GONGSU_NUMBER_RE.test(value)) return false;
  const n = Number(value);
  return n > 0 && n <= 5;
}

interface WorkRecordRow {
  id: number;
  work_date: string;
  gongsu_type: string;
  site_id: number | null;
  site_name: string | null;
}

async function resolveSiteId(userId: number, siteName: string | undefined | null): Promise<number | null> {
  const name = (siteName || "").trim();
  if (!name) return null;
  const existing = await pgPool.query<{ id: number }>(
    `SELECT id FROM sites WHERE user_id = $1 AND name = $2`,
    [userId, name]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const inserted = await pgPool.query<{ id: number }>(
    `INSERT INTO sites (user_id, name) VALUES ($1, $2) RETURNING id`,
    [userId, name]
  );
  return inserted.rows[0].id;
}

// POST /api/work-records — 공수 기록 등록(하루에 여러 현장 기록 가능).
router.post("/work-records", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  const { workDate, gongsuType, siteName } = req.body as {
    workDate?: string;
    gongsuType?: string;
    siteName?: string;
  };
  if (!workDate || !DATE_RE.test(workDate)) {
    res.status(400).json({ ok: false, message: "workDate(YYYY-MM-DD)가 필요합니다" });
    return;
  }
  if (!gongsuType || !isValidGongsuType(gongsuType)) {
    res.status(400).json({ ok: false, message: "gongsuType은 absent 또는 0.1 단위 숫자(0.1~5)여야 합니다" });
    return;
  }
  try {
    const siteId = await resolveSiteId(userId, siteName);
    const result = await pgPool.query<{ id: number }>(
      `INSERT INTO work_records (user_id, site_id, work_date, gongsu_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, siteId, workDate, gongsuType]
    );
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    logger.error({ err: String(err) }, "[work-records] 등록 실패");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/work-records?from=YYYY-MM-DD&to=YYYY-MM-DD — 기간 조회(달력/오늘 기록 표시용).
router.get("/work-records", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    res.status(400).json({ ok: false, message: "from, to(YYYY-MM-DD)가 필요합니다" });
    return;
  }
  try {
    const result = await pgPool.query<WorkRecordRow>(
      `SELECT wr.id, wr.work_date, wr.gongsu_type, wr.site_id, s.name AS site_name
       FROM work_records wr
       LEFT JOIN sites s ON s.id = wr.site_id
       WHERE wr.user_id = $1 AND wr.work_date BETWEEN $2 AND $3
       ORDER BY wr.work_date ASC, wr.id ASC`,
      [userId, from, to]
    );
    res.json({ ok: true, records: result.rows });
  } catch (err) {
    logger.error({ err: String(err) }, "[work-records] 조회 실패");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// PATCH /api/work-records/:id — 기록 수정.
router.patch("/work-records/:id", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ ok: false, message: "잘못된 id" });
    return;
  }
  const { gongsuType, siteName } = req.body as { gongsuType?: string; siteName?: string };
  if (!gongsuType || !isValidGongsuType(gongsuType)) {
    res.status(400).json({ ok: false, message: "gongsuType은 absent 또는 0.1 단위 숫자(0.1~5)여야 합니다" });
    return;
  }
  try {
    const result =
      siteName !== undefined
        ? await pgPool.query(
            `UPDATE work_records SET gongsu_type = $3, site_id = $4, updated_at = now()
             WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, userId, gongsuType, await resolveSiteId(userId, siteName)]
          )
        : await pgPool.query(
            `UPDATE work_records SET gongsu_type = $3, updated_at = now()
             WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, userId, gongsuType]
          );
    if (result.rows.length === 0) {
      res.status(404).json({ ok: false, message: "기록을 찾을 수 없습니다" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: String(err) }, "[work-records] 수정 실패");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// DELETE /api/work-records/:id
router.delete("/work-records/:id", requireUser, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: number }).userId;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ ok: false, message: "잘못된 id" });
    return;
  }
  try {
    const result = await pgPool.query(
      `DELETE FROM work_records WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ ok: false, message: "기록을 찾을 수 없습니다" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: String(err) }, "[work-records] 삭제 실패");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
