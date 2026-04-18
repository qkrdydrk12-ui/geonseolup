const TOKEN_KEY = 'cj_admin_token'; // sessionStorage → 탭/브라우저 닫으면 자동 삭제
const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20분

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiLogin(id: string, pw: string): Promise<{ ok: boolean; token?: string; message?: string }> {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pw }),
    });
    return await res.json();
  } catch {
    return { ok: false, message: '서버에 연결할 수 없습니다' };
  }
}

export async function apiLogout(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {}
  clearToken();
}

export async function apiVerify(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { clearToken(); return false; }
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiUpdateCreds(newId: string, newPw: string): Promise<{ ok: boolean; message?: string }> {
  const token = getToken();
  if (!token) return { ok: false, message: '인증이 필요합니다' };
  try {
    const res = await fetch('/api/admin/update-creds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newId, newPw }),
    });
    return await res.json();
  } catch {
    return { ok: false, message: '서버 오류가 발생했습니다' };
  }
}

// 비활동 자동 로그아웃 관리
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function startIdleTimer(onTimeout: () => void) {
  clearIdleTimer();
  const reset = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(onTimeout, IDLE_TIMEOUT_MS);
  };
  const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
  events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
  reset();
  return () => {
    clearIdleTimer();
    events.forEach((e) => window.removeEventListener(e, reset));
  };
}

export function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}
