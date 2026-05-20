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

export async function fbDeleteJob(id: string): Promise<void> {
  try {
    await updateDoc(doc(_db, 'jobs', id), { hidden: true, _deleted: true });
  } catch (e) {
    console.warn('[Firebase] fbDeleteJob failed:', e);
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

export async function fbPublishReservedJob(job: Job): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(_db, 'jobs', job.id), {
    status: 'active',
    date: now,
    publishedAt: now,
    reservedAt: null,
    retryCount: 0,
    lastRetryAt: null,
    failReason: null,
  });
  // 반복 예약: 발행 후 N일 뒤 새 공고 자동 생성
  if (job.repeatDays && job.repeatDays > 0) {
    const { id: _id, publishedAt: _p, failReason: _f, lastRetryAt: _lr, ...rest } = job;
    const repeatAt = new Date(Date.now() + job.repeatDays * 24 * 3600000).toISOString();
    await fbAddReservedJob({ ...rest, status: 'reserved', retryCount: 0, date: now } as Omit<Job, 'id'>, repeatAt);
  }
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
      await fbPublishReservedJob(job);
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
