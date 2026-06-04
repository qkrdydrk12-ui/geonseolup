import { Router, type IRouter } from "express";
import {
  getPublicJobs,
  getPublicJobById,
  invalidatePublicJobsCache,
} from "../lib/jobsCache.js";

const router: IRouter = Router();

// GET /api/jobs — 공개 공고 목록 (서버 캐시 공유)
router.get("/jobs", async (_req, res) => {
  const { jobs, stale, fetchedAt } = await getPublicJobs();
  // 새 글이 즉시 보이도록 HTTP 캐시는 두지 않는다. (방문자 폭주는 서버 인메모리
  // 캐시 + TTL이 Firestore 읽기를 흡수하므로, JSON 자체를 캐시할 필요는 없다.)
  res.set("Cache-Control", "no-store");
  res.json({ jobs, stale, fetchedAt });
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

// POST /api/jobs/invalidate — 공개 목록에 영향을 주는 쓰기 직후 캐시 무효화.
// Firestore를 읽지 않으므로 비용이 없고, 다음 GET 요청이 최신 목록을 가져온다.
router.post("/jobs/invalidate", (_req, res) => {
  invalidatePublicJobsCache();
  res.json({ ok: true });
});

export default router;
