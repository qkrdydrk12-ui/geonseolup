import { Router, type IRouter } from "express";
import {
  getPublicJobs,
  getPublicJobById,
  invalidatePublicJobsCache,
  filterActiveJobs,
  getRawJobContact,
} from "../lib/jobsCache.js";
import { isJobClosed, isJobExpired, getClosesAt } from "../lib/jobLifecycle.js";
import { recordJobView, getPopularJobIds, extractIp } from "../lib/jobViews.js";

const router: IRouter = Router();

// GET /api/jobs — 공개 공고 목록 (서버 캐시 공유)
router.get("/jobs", async (_req, res) => {
  const { jobs, stale, fetchedAt } = await getPublicJobs();
  // 기본 목록은 활성(모집 중) 공고만 — 마감(등록 48시간 경과) 공고는 제외.
  // 새 글이 즉시 보이도록 HTTP 캐시는 두지 않는다. (방문자 폭주는 서버 인메모리
  // 캐시 + TTL이 Firestore 읽기를 흡수하므로, JSON 자체를 캐시할 필요는 없다.)
  res.set("Cache-Control", "no-store");
  res.json({ jobs: filterActiveJobs(jobs), stale, fetchedAt });
});

// GET /api/jobs/popular?limit=10&days=7 — 최근 N일간 조회수 상위 공고(현재 공개 중인 것만).
// 주의: 반드시 "/jobs/:id"보다 먼저 등록해야 한다 — 그렇지 않으면 "popular"가
// :id 파라미터로 잡아먹혀 이 라우트가 절대 실행되지 않는다.
router.get("/jobs/popular", async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query["limit"]) || 10));
    const days = Math.min(30, Math.max(1, Number(req.query["days"]) || 7));
    const popular = await getPopularJobIds(limit * 2, days); // 여유있게 뽑아서 비공개분 필터링
    const { jobs: cachedJobs } = await getPublicJobs();
    const publicJobs = filterActiveJobs(cachedJobs);
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

// GET /api/jobs/:id/contact — "연락처 보기" 버튼 전용: 실제 전화번호 반환.
// 공개 목록/상세/HTML에는 마스킹 번호만 나가므로, 원본은 이 엔드포인트로만 조회된다.
// 스크래핑 방지를 위해 IP당 하루 조회 횟수를 제한한다 (인메모리 — 재시작 시 초기화).
const CONTACT_REVEAL_DAILY_LIMIT = 30;
const _contactReveals = new Map<string, { day: string; count: number }>();
router.get("/jobs/:id/contact", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const ip = extractIp(req);
  const day = new Date().toDateString();
  const rec = _contactReveals.get(ip);
  const count = rec && rec.day === day ? rec.count : 0;
  if (count >= CONTACT_REVEAL_DAILY_LIMIT) {
    res.status(429).json({ error: "limit" });
    return;
  }
  const result = await getRawJobContact(req.params.id);
  if (result.status === "gone") {
    res.status(410).json({ error: "closed" });
    return;
  }
  if (result.status !== "ok") {
    res.status(404).json({ error: "not_found" });
    return;
  }
  _contactReveals.set(ip, { day, count: count + 1 });
  // 지난 날짜 기록 정리 (맵 무한 증식 방지)
  if (_contactReveals.size > 5000) {
    for (const [k, v] of _contactReveals) if (v.day !== day) _contactReveals.delete(k);
  }
  res.json({ contact: result.contact });
});

// GET /api/jobs/:id — 단일 공고 (캐시에서 조회)
router.get("/jobs/:id", async (req, res) => {
  const job = await getPublicJobById(req.params.id);
  if (!job || isJobExpired(job)) {
    // 마감 후 90일까지 지난 공고는 "확실히 사라짐" → 410 Gone
    res.status(job ? 410 : 404).json({ error: job ? "expired" : "not_found" });
    return;
  }
  const closesAt = getClosesAt(job);
  res.set("Cache-Control", "public, max-age=30");
  // closed: 모집마감 여부(등록 48시간 경과), closesAt: 마감 시각 — 프론트 상세 페이지가 사용
  res.json({ ...job, closed: isJobClosed(job), closesAt: closesAt ? closesAt.toISOString() : null });
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
