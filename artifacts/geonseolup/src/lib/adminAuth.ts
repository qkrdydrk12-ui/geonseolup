const TOKEN_KEY = 'cj_admin_token'; // localStorage — 브라우저를 닫아도 로그인 유지

export function getToken(): string | null {
  // 과거 sessionStorage에 저장된 토큰이 있으면 localStorage로 이전
  const legacy = sessionStorage.getItem(TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(TOKEN_KEY, legacy);
    sessionStorage.removeItem(TOKEN_KEY);
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
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

export async function apiSaveInfoOverride(article: {
  slug: string;
  title: string;
  description: string;
  emoji: string;
  body: { subtitle?: string; text: string }[];
}): Promise<{ ok: boolean; message?: string }> {
  const token = getToken();
  if (!token) return { ok: false, message: '인증이 필요합니다' };
  try {
    const res = await fetch(`/api/admin/info/${article.slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(article),
    });
    return await res.json();
  } catch {
    return { ok: false, message: '서버 오류가 발생했습니다' };
  }
}

export async function apiResetInfoOverride(slug: string): Promise<{ ok: boolean; message?: string }> {
  const token = getToken();
  if (!token) return { ok: false, message: '인증이 필요합니다' };
  try {
    const res = await fetch(`/api/admin/info/${slug}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return await res.json();
  } catch {
    return { ok: false, message: '서버 오류가 발생했습니다' };
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
