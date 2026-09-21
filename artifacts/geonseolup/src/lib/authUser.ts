export interface AuthUser {
  id: number;
  nickname: string;
}

let cachedPromise: Promise<AuthUser | null> | null = null;
let cacheTime = 0;
const CACHE_MS = 4000;

export function fetchAuthUser(): Promise<AuthUser | null> {
  const now = Date.now();
  if (cachedPromise && now - cacheTime < CACHE_MS) {
    return cachedPromise;
  }
  cacheTime = now;
  cachedPromise = fetch('/api/auth/me')
    .then((res) => res.json())
    .then((data) => data.user ?? null)
    .catch(() => null);
  return cachedPromise;
}

export function invalidateAuthUserCache() {
  cachedPromise = null;
}
