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
// 무료 한도(50,000/일) 안에 들도록 TTL을 보수적으로 잡는다.
// 공고가 200건(LIMIT)까지 누적된 상태에서 항상 켜진 탭이 1개만 있어도
// TTL 5분이면 288회 × 200건 ≈ 57.6k 로 무료 한도를 넘어선다.
// TTL 10분이면 144회 × 200건 ≈ 28.8k 로 스케줄러/정리 루틴 비용을 더해도 한도 안에 든다.
const TTL_MS = Number(process.env["JOBS_CACHE_TTL_MS"] ?? 600_000); // 기본 10분
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
  const all = (await listRecentDocs("jobs", LIMIT)) as PublicJob[];
  const pub = toPublic(all);
  _cache = { jobs: pub, fetchedAt: Date.now() };
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
