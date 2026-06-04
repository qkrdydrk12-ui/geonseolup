// 공개 공고 목록 서버 캐시.
// 방문자가 각자 Firestore를 직접 구독하면 읽기 수가 방문자 수에 비례해 폭증한다.
// 대신 서버가 일정 주기(TTL)로 한 번만 읽어 캐시하고, 모든 방문자가 이를 공유하면
// 읽기 수가 "방문자 수"가 아니라 "캐시 갱신 횟수"로 상한이 고정된다.

import { getDocument, listRecentDocs } from "./firestoreClient.js";
import { logger } from "./logger.js";

export interface PublicJob {
  id: string;
  status?: string;
  hidden?: boolean;
  _deleted?: boolean;
  date?: string;
  [key: string]: unknown;
}

// 읽기 예산: 하루 읽기 ≈ (갱신 횟수/일) × LIMIT.
// Blaze(종량제)로 전환해 무료 50k 상한 제약이 사라졌으므로, 신선도를 위해 TTL을 짧게 잡는다.
// 또한 글 작성/승인 직후에는 `invalidatePublicJobsCache()`로 즉시 무효화되어 새 글이 바로 노출된다.
// (TTL은 그 사이의 백스톱일 뿐.) 무료 티어로 되돌릴 경우 env로 다시 길게(예: 600_000) 조정.
const TTL_MS = Number(process.env["JOBS_CACHE_TTL_MS"] ?? 60_000); // 기본 60초
const LIMIT = Number(process.env["JOBS_CACHE_LIMIT"] ?? 200); // 한 번에 읽는 최대 문서 수
// 갱신 실패(예: 429) 후 재시도 억제 시간. 쿼터 소진 중 매 요청마다 재시도해
// 소진 상태를 연장하지 않도록 한다.
const FAIL_COOLDOWN_MS = Number(process.env["JOBS_CACHE_FAIL_COOLDOWN_MS"] ?? 60_000);

interface CacheEntry {
  jobs: PublicJob[];
  fetchedAt: number;
}

let _cache: CacheEntry | null = null;
let _inflight: Promise<PublicJob[]> | null = null;
let _lastFailAt = 0;
// 무효화 세대 토큰: 갱신(refresh) 도중 무효화가 발생하면 세대가 바뀐다.
// 진행 중이던 갱신이 쓰기 이전 데이터로 캐시를 덮어쓰는 레이스를 막는 데 쓴다.
let _generation = 0;
// 외부 무효화 디바운스: POST /api/jobs/invalidate 가 남용돼도
// 이 간격보다 자주 강제 갱신(=Firestore 재읽기)되지 않도록 빈도를 제한한다.
let _lastInvalidateAt = 0;
const MIN_INVALIDATE_INTERVAL_MS = Number(
  process.env["JOBS_CACHE_MIN_INVALIDATE_MS"] ?? 3_000
);

// 한 건의 공고가 공개 노출 가능한지 (삭제/숨김/예약/실패 제외).
function isPublic(j: PublicJob): boolean {
  return (
    j._deleted !== true &&
    j.hidden !== true &&
    j.status !== "reserved" &&
    j.status !== "failed"
  );
}

// 공개적으로 노출 가능한 공고만 남긴다.
function toPublic(all: PublicJob[]): PublicJob[] {
  return all.filter(isPublic);
}

async function refresh(): Promise<PublicJob[]> {
  const gen = _generation;
  const all = (await listRecentDocs("jobs", LIMIT)) as PublicJob[];
  const pub = toPublic(all);
  // 이 갱신이 시작된 뒤 무효화(쓰기 직후)가 일어났다면 캐시에 쓰지 않는다.
  // 쓰기 이전 스냅샷으로 캐시가 덮어써져 새 글이 가려지는 레이스를 방지.
  if (gen === _generation) {
    _cache = { jobs: pub, fetchedAt: Date.now() };
  }
  logger.info(
    { total: all.length, publicCount: pub.length },
    "공개 공고 캐시 갱신"
  );
  return pub;
}

export interface CachedJobsResult {
  jobs: PublicJob[];
  stale: boolean;
  fetchedAt: number | null;
}

// 캐시가 신선하면 그대로 반환. 만료됐으면 갱신을 시도하되,
// 갱신 실패(예: Firestore 429) 시에는 오래된 캐시라도 반환해 서비스 연속성을 지킨다.
export async function getPublicJobs(): Promise<CachedJobsResult> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < TTL_MS) {
    return { jobs: _cache.jobs, stale: false, fetchedAt: _cache.fetchedAt };
  }

  // 최근 갱신이 실패했으면 쿨다운 동안 재시도하지 않고 기존 캐시/빈 목록 반환
  if (!_inflight && now - _lastFailAt < FAIL_COOLDOWN_MS) {
    return {
      jobs: _cache?.jobs ?? [],
      stale: true,
      fetchedAt: _cache?.fetchedAt ?? null,
    };
  }

  // 동시 요청이 중복 갱신하지 않도록 in-flight 공유
  if (!_inflight) {
    _inflight = refresh().finally(() => {
      _inflight = null;
    });
  }

  try {
    const jobs = await _inflight;
    return { jobs, stale: false, fetchedAt: _cache?.fetchedAt ?? now };
  } catch (err) {
    _lastFailAt = Date.now();
    logger.warn({ err }, "공개 공고 캐시 갱신 실패 — 기존 캐시로 대체");
    if (_cache) {
      return { jobs: _cache.jobs, stale: true, fetchedAt: _cache.fetchedAt };
    }
    // 캐시도 없으면 빈 목록 (프런트가 샘플/로컬 폴백 처리)
    return { jobs: [], stale: true, fetchedAt: null };
  }
}

export async function getPublicJobById(id: string): Promise<PublicJob | null> {
  const { jobs } = await getPublicJobs();
  const inCache = jobs.find((j) => j.id === id);
  if (inCache) return inCache;

  // 캐시(최근 LIMIT건)에 없으면 오래된 공개 공고의 딥링크일 수 있다.
  // 단일 문서 1회 읽기로만 보강 — 목록 읽기 상한에는 영향 없음.
  // 갱신 쿨다운 중에는 추가 읽기를 피해 쿼터 소진을 연장하지 않는다.
  if (Date.now() - _lastFailAt < FAIL_COOLDOWN_MS) return null;
  try {
    const doc = (await getDocument("jobs", id)) as PublicJob | null;
    if (doc && isPublic(doc)) return doc;
    return null;
  } catch (err) {
    _lastFailAt = Date.now();
    logger.warn({ err, id }, "공개 공고 단건 조회 실패");
    return null;
  }
}

// 공개 목록에 영향을 주는 쓰기(글 작성/승인/수정/삭제) 직후 호출.
// Firestore를 읽지 않고 캐시만 비워, 다음 요청에서 즉시 최신 목록을 다시 읽게 한다.
// 진행 중인 갱신이 있으면 세대(_generation)를 올려 그 결과가 캐시를 덮어쓰지 않게 하고,
// 디바운스로 외부 남용 시 과도한 강제 갱신을 막는다.
export function invalidatePublicJobsCache(): void {
  const now = Date.now();
  if (now - _lastInvalidateAt < MIN_INVALIDATE_INTERVAL_MS) return;
  _lastInvalidateAt = now;
  _cache = null;
  _lastFailAt = 0;
  _generation++;
}
