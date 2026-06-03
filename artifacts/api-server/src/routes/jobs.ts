import { Router, type IRouter } from "express";
import { getPublicJobs, getPublicJobById } from "../lib/jobsCache.js";

const router: IRouter = Router();

// GET /api/jobs — 공개 공고 목록 (서버 캐시 공유)
router.get("/jobs", async (_req, res) => {
  const { jobs, stale, fetchedAt } = await getPublicJobs();
  // CDN/프록시 캐시 힌트 (방문자 폭주 시 추가 보호)
  res.set("Cache-Control", "public, max-age=30");
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

export default router;
