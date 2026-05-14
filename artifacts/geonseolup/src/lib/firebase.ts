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
  // 확장 필드
  company?: string;
  headcount?: string;
  workType?: string;
  ageLimit?: string;
  startDate?: string;
  manager?: string;
  site?: string;
  line?: string;
  // 예약 등록
  status?: 'active' | 'reserved';
  reservedAt?: string; // ISO datetime (Asia/Seoul 기준 입력)
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
  try {
    const ref = await addDoc(JOBS_COL, { ...job, _createdAt: serverTimestamp() });
    return ref.id;
  } catch (e) {
    console.warn('[Firebase] fbAddJob failed:', e);
    const id = Date.now().toString();
    localSaveJob({ id, ...job });
    return id;
  }
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
  try {
    const ref = await addDoc(JOBS_COL, {
      ...job,
      status: 'reserved',
      reservedAt,
      hidden: false,
      _createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    console.warn('[Firebase] fbAddReservedJob failed:', e);
    const id = Date.now().toString();
    localSaveJob({ id, ...job, status: 'reserved', reservedAt });
    return id;
  }
}

export async function fbPublishReservedJob(id: string): Promise<void> {
  try {
    await updateDoc(doc(_db, 'jobs', id), {
      status: 'active',
      date: new Date().toISOString(),
      reservedAt: null,
    });
  } catch (e) {
    console.warn('[Firebase] fbPublishReservedJob failed:', e);
  }
}

export async function fbCancelReservation(id: string): Promise<void> {
  try {
    await deleteDoc(doc(_db, 'jobs', id));
  } catch (e) {
    console.warn('[Firebase] fbCancelReservation failed:', e);
  }
}

// 예약 시간이 지난 공고를 자동 게시 — 게시된 건수 반환
export async function fbCheckAndPublishReserved(jobs: Job[]): Promise<number> {
  const now = Date.now();
  const due = jobs.filter(
    (j) => j.status === 'reserved' && j.reservedAt && new Date(j.reservedAt).getTime() <= now
  );
  await Promise.all(due.map((j) => fbPublishReservedJob(j.id)));
  return due.length;
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
