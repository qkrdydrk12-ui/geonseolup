import { Router, type IRouter } from "express";
import {
  getPublicJobs,
  getPublicJobById,
  invalidatePublicJobsCache,
} from "../lib/jobsCache.js";
import { recordJobView, getPopularJobIds, extractIp } from "../lib/jobViews.js";

const router: IRouter = Router();

// GET /api/jobs — 공개 공고 목록 (서버 캐시 공유)
router.get("/jobs", async (_req, res) => {
  const { jobs, stale, fetchedAt } = await getPublicJobs();
  // 새 글이 즉시 보이도록 HTTP 캐시는 두지 않는다. (방문자 폭주는 서버 인메모리
  // 캐시 + TTL이 Firestore 읽기를 흡수하므로, JSON 자체를 캐시할 필요는 없다.)
  res.set("Cache-Control", "no-store");
  res.json({ jobs, stale, fetchedAt });
});

// GET /api/jobs/popular?limit=10&days=7 — 최근 N일간 조회수 상위 공고(현재 공개 중인 것만).
// 주의: 반드시 "/jobs/:id"보다 먼저 등록해야 한다 — 그렇지 않으면 "popular"가
// :id 파라미터로 잡아먹혀 이 라우트가 절대 실행되지 않는다.
router.get("/jobs/popular", async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query["limit"]) || 10));
    const days = Math.min(30, Math.max(1, Number(req.query["days"]) || 7));
    const popular = await getPopularJobIds(limit * 2, days); // 여유있게 뽑아서 비공개분 필터링
    const { jobs: publicJobs } = await getPublicJobs();
    const byId = new Map(publicJobs.map((j) => [j.id, j]));
    const result = popular
      .map((p) => ({ job: byId.get(p.jobId), views: p.views }))
      .filter((r): r is { job: (typeof publicJobs)[number]; views: number } => Boolean(r.job))
      .slice(0, limit)
      .map((r) => ({ ...r.job, views: r.views }));
    res.set("Cache-Control", "public, max-age=120");
    res.json({ jobs: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/jobs/:id — 단일 공고 (캐시에서 조회)
router.get("/jobs/:id", async (req, res) => {
  const job = await getPublicJobById(req.params.id);
  if (!job) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.set("Cache-Control", "public, max-age=30");
  res.json(job);
});

// POST /api/jobs/:id/view — 공고 상세 조회 기록 (인기 공고 집계용, 인증 불필요).
// 방문자당 공고당 하루 1회만 카운트되어 새로고침 어뷰징에 안전하다.
router.post("/jobs/:id/view", async (req, res) => {
  try {
    const ip = extractIp(req);
    const counted = await recordJobView(req.params.id, ip);
    res.json({ ok: true, counted });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/jobs/invalidate — 공개 목록에 영향을 주는 쓰기 직후 캐시 무효화.
// Firestore를 읽지 않으므로 비용이 없고, 다음 GET 요청이 최신 목록을 가져온다.
router.post("/jobs/invalidate", (_req, res) => {
  invalidatePublicJobsCache();
  res.json({ ok: true });
});

export default router;
