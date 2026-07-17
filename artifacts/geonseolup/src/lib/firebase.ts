import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  runTransaction,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDBV9vioVA_Avbd0CGH7fMzCVZEYbG3UQM',
  authDomain: 'geonseolup.firebaseapp.com',
  projectId: 'geonseolup',
  storageBucket: 'geonseolup.firebasestorage.app',
  messagingSenderId: '762237788664',
  appId: '1:762237788664:web:2db68aaef822c0f090360d',
  measurementId: 'G-H6W30S363W',
};

const _app = initializeApp(FIREBASE_CONFIG);
const _db = getFirestore(_app);

const JOBS_COL = collection(_db, 'jobs');
const PRODUCTS_COL = collection(_db, 'products');
const PENDING_COL = collection(_db, 'pending');
const SETTINGS_COL = collection(_db, 'settings');
const LOGS_COL = collection(_db, 'reservationLogs');
const REPORTS_COL = collection(_db, 'reports');

export interface JobReport {
  id: string;
  jobId: string;
  jobTitle: string;
  jobContact?: string;
  reason: string;
  note?: string;
  createdAt: string;
  _createdAt?: unknown;
}

export interface ReservationLog {
  id: string;
  jobId: string;
  jobTitle: string;
  scheduledAt: string;
  publishedAt?: string;
  status: 'published' | 'failed' | 'retrying';
  retryCount?: number;
  failReason?: string;
  isRepeat?: boolean;
  repeatDays?: number;
  createdAt: string;
  // 빠른 예약 메타
  quickReserveType?: '새벽' | '정오' | '저녁';
  shortcutUsed?: boolean;
}

export interface Job {
  id: string;
  title: string;
  region: string;
  job: string;
  weldSub?: string;
  weldTest?: string;
  salary: string;
  salaryNum?: number;
  meal?: string;
  lodging?: string;
  contact?: string;
  detail?: string;
  originalText?: string;
  date: string;
  hidden?: boolean;
  hiddenAt?: number;
  _deleted?: boolean;
  _createdAt?: unknown;
  dispatchMode?: 'natural' | 'manual';
  // 확장 필드
  company?: string;
  headcount?: string;
  workType?: string;
  ageLimit?: string;
  startDate?: string;
  manager?: string;
  site?: string;
  line?: string;
  // 급여 상세 (복합 단가 파싱)
  dailyWage?: number;
  extraPay?: number;
  totalExpectedPay?: number;
  wageBreakdowns?: Array<{ role: string; wage: number; extraPay: number; extraLabel: string; total: number }>;
  needsReview?: boolean;
  // 예약 등록
  status?: 'active' | 'reserved' | 'failed';
  reservedAt?: string;
  repeatDays?: number;    // 0=없음, 1/3/7=발행 후 N일 뒤 재등록
  retryCount?: number;
  lastRetryAt?: string;
  publishedAt?: string;
  failReason?: string;
}

export interface PendingJob extends Omit<Job, 'id' | 'status'> {
  id: string;
  submittedAt?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

function localLoadJobs(): Job[] {
  try {
    const raw = localStorage.getItem('construction_jobs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function localSaveJob(job: Job): void {
  const jobs = localLoadJobs();
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) jobs[idx] = job;
  else jobs.unshift(job);
  localStorage.setItem('construction_jobs', JSON.stringify(jobs));
}

function localLoadPending(): PendingJob[] {
  try {
    const raw = localStorage.getItem('cj_pending_jobs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function localSavePending(entry: PendingJob): void {
  const list = localLoadPending();
  list.unshift(entry);
  localStorage.setItem('cj_pending_jobs', JSON.stringify(list));
}

export async function fbLoadJobs(): Promise<Job[]> {
  try {
    const snap = await getDocs(query(JOBS_COL, orderBy('date', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job));
  } catch (e) {
    console.warn('[Firebase] fbLoadJobs failed:', e);
    return localLoadJobs();
  }
}

export function fbOnJobs(callback: (jobs: Job[]) => void): Unsubscribe {
  try {
    return onSnapshot(
      query(JOBS_COL, orderBy('date', 'desc')),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job))),
      (err) => {
        console.warn('[Firebase] onSnapshot failed:', err);
        callback(localLoadJobs());
      }
    );
  } catch (e) {
    console.warn('[Firebase] fbOnJobs failed:', e);
    callback(localLoadJobs());
    return () => {};
  }
}

export async function fbGetJob(id: string): Promise<Job | null> {
  try {
    const snap = await getDoc(doc(_db, 'jobs', id));
    if (snap.exists()) return { id: snap.id, ...snap.data() } as Job;
  } catch (e) {
    console.warn('[Firebase] fbGetJob failed:', e);
  }
  return localLoadJobs().find((j) => j.id === id) || null;
}

// ── 공개 목록: 서버 캐시 경유 (Firestore 직접 읽기 X) ────────────────────────────
// 방문자마다 Firestore를 통째로 구독하면 읽기 쿼터가 폭증하므로,
// 공개 화면(홈/상세)은 서버가 캐시한 /api/jobs 를 공유해서 읽는다.
const PUBLIC_JOBS_CACHE_KEY = 'cj_public_jobs_cache';

export async function fbLoadPublicJobs(): Promise<Job[]> {
  try {
    const res = await fetch('/api/jobs', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { jobs?: Job[]; stale?: boolean } | Job[];
    const jobs = Array.isArray(data) ? data : data.jobs ?? [];
    if (jobs.length > 0) {
      try { localStorage.setItem(PUBLIC_JOBS_CACHE_KEY, JSON.stringify(jobs)); } catch { /* 용량 초과 무시 */ }
      return jobs;
    }
    // 서버 캐시가 비어 있음(콜드 스타트/읽기 쿼터 소진 등) → 빈 목록 대신
    // 이 기기가 마지막으로 받은 실제 공고를 보여준다 (샘플 폴백보다 우선).
    const lastGood = readPublicJobsCache();
    if (lastGood.length > 0) return lastGood;
    return jobs;
  } catch (e) {
    console.warn('[api] fbLoadPublicJobs failed:', e);
    // 서버 미응답 시: 직전 캐시 → 로컬 저장본 순으로 폴백
    const lastGood = readPublicJobsCache();
    if (lastGood.length > 0) return lastGood;
    return localLoadJobs();
  }
}

// 글 작성/승인 등 공개 목록에 영향을 주는 쓰기 직후 호출 → 서버 캐시 즉시 무효화.
// 실패해도 TTL 만료로 곧 갱신되므로 조용히 무시한다.
export async function fbInvalidatePublicCache(): Promise<void> {
  try {
    await fetch('/api/jobs/invalidate', { method: 'POST', headers: { Accept: 'application/json' } });
  } catch { /* 무시 */ }
}

function readPublicJobsCache(): Job[] {
  try {
    const cached = localStorage.getItem(PUBLIC_JOBS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as Job[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* 파싱 실패 무시 */ }
  return [];
}

export async function fbGetPublicJob(id: string): Promise<Job | null> {
  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Job;
  } catch (e) {
    console.warn('[api] fbGetPublicJob failed:', e);
    const all = await fbLoadPublicJobs();
    return all.find((j) => j.id === id) || null;
  }
}

export async function fbAddJob(job: Omit<Job, 'id'>): Promise<string> {
  // undefined 필드 제거 (Firestore는 undefined 값을 거부함)
  const clean = Object.fromEntries(
    Object.entries({ ...job, _createdAt: serverTimestamp() }).filter(([, v]) => v !== undefined)
  );
  const ref = await addDoc(JOBS_COL, clean);
  return ref.id;
}

export async function fbSetJob(id: string, job: Partial<Job>): Promise<void> {
  try {
    await setDoc(doc(_db, 'jobs', id), job, { merge: true });
  } catch (e) {
    console.warn('[Firebase] fbSetJob failed:', e);
  }
}

export async function fbToggleHide(id: string, hidden: boolean): Promise<void> {
  try {
    const update: Record<string, unknown> = { hidden };
    if (hidden) update.hiddenAt = Date.now();
    else update.hiddenAt = null;
    await updateDoc(doc(_db, 'jobs', id), update);
  } catch (e) {
    console.warn('[Firebase] fbToggleHide failed:', e);
  }
}

export async function fbDeleteJob(id: string): Promise<boolean> {
  try {
    await updateDoc(doc(_db, 'jobs', id), { hidden: true, _deleted: true });
    return true;
  } catch (e) {
    console.warn('[Firebase] fbDeleteJob failed:', e);
    return false;
  }
}

// 자동숨김 + DB 기록: date 기준으로 autoHideHours 초과 공고 hidden:true + hiddenAt 기록
export async function fbAutoHideOldJobs(jobs: Job[], autoHideHours: number): Promise<void> {
  if (!autoHideHours) return;
  const cutoff = Date.now() - autoHideHours * 3600000;
  const toHide = jobs.filter((j) => !j.hidden && new Date(j.date).getTime() < cutoff);
  await Promise.all(toHide.map((j) => fbToggleHide(j.id, true)));
}

// 24시간 이상 숨김 상태인 공고 하드 삭제
export async function fbPurgeOldHiddenJobs(jobs: Job[]): Promise<number> {
  const cutoff = Date.now() - 24 * 3600000;
  const toPurge = jobs.filter(
    (j) => j.hidden && j.hiddenAt != null && (j.hiddenAt as number) < cutoff
  );
  await Promise.all(toPurge.map((j) => deleteDoc(doc(_db, 'jobs', j.id))));
  return toPurge.length;
}

// date 기준으로 autoDeleteHours 초과 공고를 Firestore에서 완전 삭제 (데이터 포함)
// hidden 여부와 무관하게 적용 — "자동 삭제" 정책
// 단, 예약 공고(status='reserved')와 실패 공고(status='failed')는 보호 —
// 발행 전 사라지면 안 되므로 명시적으로 제외
export async function fbAutoDeleteOldJobs(jobs: Job[], autoDeleteHours: number): Promise<number> {
  if (!autoDeleteHours) return 0;
  const cutoff = Date.now() - autoDeleteHours * 3600000;
  const toDelete = jobs.filter((j) => {
    if (j.status === 'reserved' || j.status === 'failed') return false;
    return new Date(j.date).getTime() < cutoff;
  });
  await Promise.all(toDelete.map((j) => deleteDoc(doc(_db, 'jobs', j.id))));
  return toDelete.length;
}

// ── 예약 등록 ───────────────────────────────────────────────────────────────
export async function fbAddReservedJob(job: Omit<Job, 'id'>, reservedAt: string): Promise<string> {
  // undefined 필드 제거 (Firestore는 undefined 값 거부 → 쓰기 실패 원인)
  const clean = Object.fromEntries(
    Object.entries({
      ...job,
      status: 'reserved',
      reservedAt,
      hidden: false,
      retryCount: 0,
      _createdAt: serverTimestamp(),
    }).filter(([, v]) => v !== undefined)
  );
  // 에러는 호출자에게 전파 (silent fallback 제거 — localStorage에만 저장되면 스케줄러가 못 찾음)
  const ref = await addDoc(JOBS_COL, clean);
  return ref.id;
}

// 발행을 원자적으로 처리 — 트랜잭션으로 'reserved' 상태일 때만 게시(중복 발행 방지).
// 반환값: 이 호출이 실제로 발행을 수행했으면 true, 이미 다른 발행 주체가 처리해서
// 건너뛴 경우 false. (클라이언트 다중 탭 + 서버 스케줄러 동시 실행 시 중복 방지)
export async function fbPublishReservedJob(job: Job): Promise<boolean> {
  const ref = doc(_db, 'jobs', job.id);
  // 트랜잭션 스냅샷 데이터를 반환받아 반복예약 복제에 사용(stale 방지). claim 실패 시 null.
  const claimedData = await runTransaction<(Job & { id: string }) | null>(_db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const data = { ...(snap.data() as Omit<Job, 'id'>), id: snap.id };
    // 이미 발행됐거나 예약 상태가 아니면 건너뜀 (중복 발행 차단)
    if (data.status !== 'reserved') return null;
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status: 'active',
      date: now,
      publishedAt: now,
      reservedAt: null,
      retryCount: 0,
      lastRetryAt: null,
      failReason: null,
    };
    // 안전망: contact 비었는데 원문에 010 번호가 있으면 자동 보강
    const currentContact = (data.contact ?? '').trim();
    const originalText = (data as { originalText?: string }).originalText ?? '';
    if (!currentContact && originalText) {
      const phoneMatch = originalText.match(/01[016789][-.\s]*\d{3,4}[-.\s]*\d{4}/);
      if (phoneMatch) {
        const rescued = phoneMatch[0].replace(/[\s.]/g, '-').replace(/-+/g, '-');
        updatePayload.contact = rescued;
        console.log('[Firebase] publish 안전망: 원문에서 전화번호 자동 보강 →', rescued);
      }
    }
    tx.update(ref, updatePayload);
    return data;
  });
  if (!claimedData) {
    console.log('[Firebase] publish 건너뜀 — 이미 다른 주체가 발행함:', job.id);
    return false;
  }
  // 반복 예약: 발행 성공(claim)한 주체만, 트랜잭션 스냅샷 기준으로 새 공고 생성 → 중복 복제 방지
  if (claimedData.repeatDays && claimedData.repeatDays > 0) {
    const now = new Date().toISOString();
    const { id: _id, publishedAt: _p, failReason: _f, lastRetryAt: _lr, ...rest } = claimedData;
    const repeatAt = new Date(Date.now() + claimedData.repeatDays * 24 * 3600000).toISOString();
    await fbAddReservedJob({ ...rest, status: 'reserved', retryCount: 0, date: now } as Omit<Job, 'id'>, repeatAt);
  }
  return true;
}

export async function fbMarkReservationFailed(id: string, reason: string, currentRetry: number): Promise<void> {
  try {
    await updateDoc(doc(_db, 'jobs', id), {
      status: 'failed',
      retryCount: currentRetry + 1,
      lastRetryAt: new Date().toISOString(),
      failReason: reason.slice(0, 200),
    });
  } catch (e) {
    console.warn('[Firebase] fbMarkReservationFailed:', e);
  }
}

export async function fbRetryReservation(id: string): Promise<void> {
  try {
    await updateDoc(doc(_db, 'jobs', id), {
      status: 'reserved',
      // 30초 후 발행 예약 (즉시 발행 가능하도록)
      reservedAt: new Date(Date.now() + 30000).toISOString(),
      retryCount: 0,     // 재시도 카운트 초기화 (99 영구실패 해제)
      failReason: null,
      lastRetryAt: null,
    });
  } catch (e) {
    console.warn('[Firebase] fbRetryReservation:', e);
  }
}

export async function fbCancelReservation(id: string): Promise<void> {
  try {
    await deleteDoc(doc(_db, 'jobs', id));
  } catch (e) {
    console.warn('[Firebase] fbCancelReservation failed:', e);
  }
}

export async function fbSaveReservationLog(log: Omit<ReservationLog, 'id'>): Promise<void> {
  try {
    await addDoc(LOGS_COL, { ...log, _createdAt: serverTimestamp() });
  } catch (e) {
    console.warn('[Firebase] fbSaveReservationLog failed:', e);
  }
}

export async function fbLoadReservationLogs(limitCount = 30): Promise<ReservationLog[]> {
  try {
    const snap = await getDocs(query(LOGS_COL, orderBy('_createdAt', 'desc')));
    return snap.docs.slice(0, limitCount).map((d) => ({ id: d.id, ...d.data() } as ReservationLog));
  } catch (e) {
    console.warn('[Firebase] fbLoadReservationLogs failed:', e);
    return [];
  }
}

// 예약 시간이 지난 공고 자동 게시 + 실패 재시도
export async function fbCheckAndPublishReserved(jobs: Job[]): Promise<{ published: number; retried: number }> {
  const now = Date.now();
  let published = 0, retried = 0;

  // 1. 예약 시간 도달 → 게시
  const due = jobs
    .filter((j) => j.status === 'reserved' && j.reservedAt && new Date(j.reservedAt).getTime() <= now)
    .sort((a, b) => new Date(a.reservedAt!).getTime() - new Date(b.reservedAt!).getTime());

  for (const job of due) {
    try {
      const didPublish = await fbPublishReservedJob(job);
      // 이미 다른 주체가 발행한 경우(false) → 카운트/로그 건너뜀 (중복 로그 방지)
      if (!didPublish) continue;
      published++;
      await fbSaveReservationLog({
        jobId: job.id,
        jobTitle: job.title || '',
        scheduledAt: job.reservedAt!,
        publishedAt: new Date().toISOString(),
        status: 'published',
        isRepeat: (job.retryCount || 0) > 0,
        repeatDays: job.repeatDays,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      await fbMarkReservationFailed(job.id, String(e), job.retryCount || 0);
      await fbSaveReservationLog({
        jobId: job.id,
        jobTitle: job.title || '',
        scheduledAt: job.reservedAt!,
        status: 'failed',
        failReason: String(e).slice(0, 200),
        retryCount: (job.retryCount || 0) + 1,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // 2. 실패 공고 자동 재시도 (5분 경과, 최대 3회)
  const toRetry = jobs.filter(
    (j) =>
      j.status === 'failed' &&
      (j.retryCount || 0) < 3 &&
      j.lastRetryAt &&
      now - new Date(j.lastRetryAt).getTime() >= 5 * 60000
  );
  for (const job of toRetry) {
    try {
      await updateDoc(doc(_db, 'jobs', job.id), { status: 'reserved', reservedAt: new Date(now + 30000).toISOString() });
      retried++;
    } catch (e) {
      await fbMarkReservationFailed(job.id, String(e), job.retryCount || 0);
    }
  }

  return { published, retried };
}

export async function fbLoadPending(): Promise<PendingJob[]> {
  try {
    const snap = await getDocs(query(PENDING_COL, orderBy('_createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PendingJob));
  } catch (e) {
    console.warn('[Firebase] fbLoadPending failed:', e);
    return localLoadPending();
  }
}

export async function fbAddPending(entry: Omit<PendingJob, 'id'>): Promise<string> {
  try {
    const ref = await addDoc(PENDING_COL, {
      ...entry,
      submittedAt: entry.date || new Date().toISOString(),
      _createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    console.warn('[Firebase] fbAddPending failed:', e);
    const id = Date.now().toString();
    localSavePending({ id, ...entry } as PendingJob);
    return id;
  }
}

export async function fbUpdatePending(id: string, updates: Partial<PendingJob>): Promise<void> {
  try {
    await updateDoc(doc(_db, 'pending', id), updates as Record<string, unknown>);
  } catch (e) {
    console.warn('[Firebase] fbUpdatePending failed:', e);
  }
}

export async function fbDeletePending(id: string): Promise<void> {
  try {
    await deleteDoc(doc(_db, 'pending', id));
  } catch (e) {
    console.warn('[Firebase] fbDeletePending failed:', e);
  }
}

function localLoadReports(): JobReport[] {
  try {
    const raw = localStorage.getItem('cj_reports');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function localSaveReport(r: JobReport): void {
  const list = localLoadReports();
  list.unshift(r);
  localStorage.setItem('cj_reports', JSON.stringify(list.slice(0, 200)));
}

function localDeleteReport(id: string): void {
  const list = localLoadReports().filter((r) => r.id !== id);
  localStorage.setItem('cj_reports', JSON.stringify(list));
}

export async function fbAddReport(entry: Omit<JobReport, 'id' | '_createdAt'>): Promise<string> {
  // Firestore 우선 시도
  try {
    const ref = await addDoc(REPORTS_COL, {
      ...entry,
      _createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    console.warn('[Firebase] fbAddReport failed, falling back to local:', e);
    // 로컬 폴백 — Firestore 권한 오류 시에도 신고 접수 성공으로 처리
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    localSaveReport({ id, ...entry } as JobReport);
    return id;
  }
}

export async function fbLoadReports(): Promise<JobReport[]> {
  let firebaseReports: JobReport[] = [];
  try {
    const snap = await getDocs(query(REPORTS_COL, orderBy('_createdAt', 'desc')));
    firebaseReports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobReport));
  } catch (e) {
    console.warn('[Firebase] fbLoadReports failed:', e);
  }
  // Firestore + 로컬 병합 (중복 ID 제거, 최신순 정렬)
  const local = localLoadReports();
  const all = [...firebaseReports, ...local];
  const seen = new Set<string>();
  const merged = all.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  // 정렬: _createdAt(Firestore Timestamp) 우선, 없으면 createdAt(ISO) 파싱
  const tsOf = (r: JobReport): number => {
    const ca = r._createdAt as { seconds?: number; toMillis?: () => number } | null | undefined;
    if (ca && typeof ca.toMillis === 'function') return ca.toMillis();
    if (ca && typeof ca.seconds === 'number') return ca.seconds * 1000;
    const t = Date.parse(r.createdAt || '');
    return isNaN(t) ? 0 : t;
  };
  return merged.sort((a, b) => tsOf(b) - tsOf(a));
}

export async function fbDeleteReport(id: string): Promise<void> {
  // 로컬 항목은 즉시 삭제 후 종료
  if (id.startsWith('local_')) {
    localDeleteReport(id);
    return;
  }
  // Firestore 항목은 실패 시 throw — UI에서 실패 처리 가능
  try {
    await deleteDoc(doc(_db, 'reports', id));
  } catch (e) {
    console.warn('[Firebase] fbDeleteReport failed:', e);
    throw e;
  }
}

export async function fbGetSetting(key: string): Promise<unknown> {
  try {
    const snap = await getDoc(doc(_db, 'settings', key));
    return snap.exists() ? (snap.data() as { value: unknown }).value : null;
  } catch (e) {
    console.warn('[Firebase] fbGetSetting failed:', e);
    return null;
  }
}

export async function fbSetSetting(key: string, value: unknown): Promise<void> {
  try {
    await setDoc(doc(_db, 'settings', key), { value });
  } catch (e) {
    console.warn('[Firebase] fbSetSetting failed:', e);
  }
}

export { _db as db, JOBS_COL, PENDING_COL, SETTINGS_COL };

// ── 건설 추천템 (쿠팡파트너스 상품) ──────────────────────────────────────────
export const PRODUCT_CATEGORIES = ['안전화', '안전모', '작업복', '장갑', '공구', '측정기', '전동공구', '용접용품', '우의', '여름용품', '겨울용품', '차량용품', '기타'];

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;        // 원 단위
  rating: number;       // 0~5 (소수 허용)
  reviewCount: number;
  link: string;         // 쿠팡파트너스 링크
  image: string;        // base64 data URL 또는 이미지 URL
  brand?: string;       // 브랜드 (쿠팡 API 자동 조회 시)
  order: number;        // 노출 순서 (낮을수록 먼저)
  hidden?: boolean;
  createdAt: string;
}

const PRODUCTS_CACHE_KEY = 'cj_products_cache';
const PRODUCTS_CACHE_TTL = 10 * 60 * 1000; // 10분 — 방문자 Firestore 읽기 절약

export async function fbLoadProducts(force = false): Promise<Product[]> {
  if (!force) {
    try {
      const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
      if (raw) {
        const { ts, items } = JSON.parse(raw) as { ts: number; items: Product[] };
        if (Date.now() - ts < PRODUCTS_CACHE_TTL && Array.isArray(items)) return items;
      }
    } catch { /* 캐시 파싱 실패 무시 */ }
  }
  try {
    const snap = await getDocs(query(PRODUCTS_COL, orderBy('order', 'asc')));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
    try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), items })); } catch { /* 용량 초과 무시 */ }
    return items;
  } catch (e) {
    console.warn('[Firebase] fbLoadProducts failed:', e);
    try {
      const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
      if (raw) return (JSON.parse(raw) as { items: Product[] }).items || [];
    } catch { /* 무시 */ }
    return [];
  }
}

export function fbInvalidateProductsCache(): void {
  try { localStorage.removeItem(PRODUCTS_CACHE_KEY); } catch { /* 무시 */ }
}

export async function fbAddProduct(p: Omit<Product, 'id'>): Promise<string> {
  const clean = Object.fromEntries(
    Object.entries({ ...p, _createdAt: serverTimestamp() }).filter(([, v]) => v !== undefined)
  );
  const ref = await addDoc(PRODUCTS_COL, clean);
  fbInvalidateProductsCache();
  return ref.id;
}

export async function fbUpdateProduct(id: string, p: Partial<Product>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
  await updateDoc(doc(_db, 'products', id), clean);
  fbInvalidateProductsCache();
}

export async function fbDeleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(_db, 'products', id));
  fbInvalidateProductsCache();
}

/** 정렬된 상품 ID 배열대로 order를 1..N 재부여 (원자적 배치 쓰기) */
export async function fbReorderProducts(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(_db);
  orderedIds.forEach((id, i) => batch.update(doc(_db, 'products', id), { order: i + 1 }));
  await batch.commit();
  fbInvalidateProductsCache();
}
