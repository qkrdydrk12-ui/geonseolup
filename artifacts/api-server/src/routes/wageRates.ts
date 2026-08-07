import { Router, type Request, type Response } from "express";
import { pgPool } from "../lib/db";
import { requireAdmin } from "../lib/adminStore";

const router = Router();

// 테이블 자동 생성
async function initTables() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS wage_rates (
      id SERIAL PRIMARY KEY,
      region VARCHAR(50) NOT NULL,
      job VARCHAR(100) NOT NULL,
      wage INTEGER NOT NULL,
      note VARCHAR(200),
      week_of DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_wage_rates_week ON wage_rates(week_of);
  `);
}
initTables().catch((e) => console.error("[DB] wage_rates initTables error:", e));

interface WageRateRow {
  id: number;
  region: string;
  job: string;
  wage: number;
  note: string | null;
  week_of: string;
  created_at: string;
  updated_at: string;
}

function toApi(row: WageRateRow) {
  return {
    id: row.id,
    region: row.region,
    job: row.job,
    wage: row.wage,
    note: row.note ?? "",
    weekOf: row.week_of,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/wage-rates?weekOf=YYYY-MM-DD — 공개, 특정 주(생략 시 최신 주) 시세 전체
router.get("/wage-rates", async (req: Request, res: Response) => {
  try {
    const weekOf = req.query["weekOf"] as string | undefined;

    let targetWeek = weekOf;
    if (!targetWeek) {
      const latest = await pgPool.query<{ week_of: string }>(
        `SELECT week_of FROM wage_rates ORDER BY week_of DESC LIMIT 1`
      );
      targetWeek = latest.rows[0]?.week_of;
    }

    if (!targetWeek) {
      res.json({ weekOf: null, weeks: [], rows: [] });
      return;
    }

    const [rowsResult, weeksResult] = await Promise.all([
      pgPool.query<WageRateRow>(
        `SELECT * FROM wage_rates WHERE week_of = $1 ORDER BY region, job`,
        [targetWeek]
      ),
      pgPool.query<{ week_of: string }>(
        `SELECT DISTINCT week_of FROM wage_rates ORDER BY week_of DESC LIMIT 12`
      ),
    ]);

    res.json({
      weekOf: targetWeek,
      weeks: weeksResult.rows.map((r) => r.week_of),
      rows: rowsResult.rows.map(toApi),
    });
  } catch (err) {
    console.error("[WageRates] GET error:", err);
    res.status(500).json({ error: "일당 시세 조회 실패" });
  }
});

// POST /api/wage-rates — 관리자 전용, 등록
router.post("/wage-rates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body as { region?: string; job?: string; wage?: number; note?: string; weekOf?: string };
    const region = (body.region ?? "").trim();
    const job = (body.job ?? "").trim();
    const wage = Number(body.wage);
    const note = (body.note ?? "").trim();
    const weekOf = (body.weekOf ?? "").trim();

    if (!region || !job || !wage || wage <= 0 || !weekOf) {
      res.status(400).json({ error: "지역·직종·일당·기준주는 필수입니다" });
      return;
    }

    const result = await pgPool.query<WageRateRow>(
      `INSERT INTO wage_rates (region, job, wage, note, week_of)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [region, job, wage, note || null, weekOf]
    );

    res.json({ ok: true, row: toApi(result.rows[0]!) });
  } catch (err) {
    console.error("[WageRates] POST error:", err);
    res.status(500).json({ error: "등록 실패" });
  }
});

// PUT /api/wage-rates/:id — 관리자 전용, 수정
router.put("/wage-rates/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    const body = req.body as { region?: string; job?: string; wage?: number; note?: string; weekOf?: string };
    const region = (body.region ?? "").trim();
    const job = (body.job ?? "").trim();
    const wage = Number(body.wage);
    const note = (body.note ?? "").trim();
    const weekOf = (body.weekOf ?? "").trim();

    if (!region || !job || !wage || wage <= 0 || !weekOf) {
      res.status(400).json({ error: "지역·직종·일당·기준주는 필수입니다" });
      return;
    }

    const result = await pgPool.query<WageRateRow>(
      `UPDATE wage_rates
       SET region = $1, job = $2, wage = $3, note = $4, week_of = $5, updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [region, job, wage, note || null, weekOf, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "해당 항목을 찾을 수 없습니다" });
      return;
    }

    res.json({ ok: true, row: toApi(result.rows[0]!) });
  } catch (err) {
    console.error("[WageRates] PUT error:", err);
    res.status(500).json({ error: "수정 실패" });
  }
});

// DELETE /api/wage-rates/:id — 관리자 전용, 삭제
router.delete("/wage-rates/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    await pgPool.query(`DELETE FROM wage_rates WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[WageRates] DELETE error:", err);
    res.status(500).json({ error: "삭제 실패" });
  }
});

export default router;
