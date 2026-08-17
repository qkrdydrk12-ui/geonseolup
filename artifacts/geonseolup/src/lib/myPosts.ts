// 이 브라우저에서 등록한 구인 글 기록 (글쓴이 본인에게만 "수정" 버튼을 보여주기 위함).
// 서버 계정이 없으므로 로컬 기기 기준으로만 판별한다.
// 글은 48시간 모집 후 마감되므로 기록은 3일 지나면 정리한다.

export interface MyPostForm {
  title: string;
  region: string;
  job: string;
  weldSub: string;
  weldTest: string;
  salary: string;
  headcount?: string;
  startDate?: string;
  meal: string;
  lodging: string;
  contact: string;
  manager: string;
  detail: string;
  originalText: string;
}

interface MyPostEntry {
  id: string;
  ts: number;
  form: MyPostForm;
}

const KEY = 'cj_my_posts';
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3일

function load(): MyPostEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as MyPostEntry[];
    const now = Date.now();
    return list.filter((e) => e && e.id && now - e.ts < MAX_AGE_MS);
  } catch {
    return [];
  }
}

function persist(list: MyPostEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-20)));
  } catch { /* 저장 불가 시 무시 */ }
}

export function saveMyPost(id: string, form: MyPostForm) {
  const list = load().filter((e) => e.id !== id);
  list.push({ id, ts: Date.now(), form });
  persist(list);
}

export function getMyPost(id: string): MyPostEntry | null {
  return load().find((e) => e.id === id) ?? null;
}

export function isMyPost(id: string): boolean {
  return !!getMyPost(id);
}
