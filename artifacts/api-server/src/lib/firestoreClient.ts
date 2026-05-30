// Firestore REST API client
// Write operations first try WITHOUT auth (works when Firestore rules allow unauthenticated writes).
// If the response is 401/403, retries with a Firebase Anonymous Auth token.
// Read operations always use the API key only (no auth needed).

const PROJECT_ID = "geonseolup";
const API_KEY = "AIzaSyDBV9vioVA_Avbd0CGH7fMzCVZEYbG3UQM";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
const REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`;

// ── Anonymous auth token cache ────────────────────────────────────────────────

interface AuthCache {
  idToken: string;
  refreshToken: string;
  expiresAt: number; // ms
}

let _authCache: AuthCache | null = null;
// Track whether anonymous auth is available (disabled = CONFIGURATION_NOT_FOUND)
let _anonAuthDisabled = false;

async function getAnonymousToken(): Promise<string | null> {
  if (_anonAuthDisabled) return null;

  const now = Date.now();

  // Return cached token if still valid (60 s buffer)
  if (_authCache && _authCache.expiresAt > now + 60_000) {
    return _authCache.idToken;
  }

  // Try refreshing with existing refresh token
  if (_authCache?.refreshToken) {
    try {
      const res = await fetch(REFRESH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(_authCache.refreshToken)}`,
      });
      if (res.ok) {
        const d = (await res.json()) as {
          id_token: string;
          refresh_token: string;
          expires_in: string;
        };
        _authCache = {
          idToken: d.id_token,
          refreshToken: d.refresh_token,
          expiresAt: now + Number(d.expires_in) * 1000,
        };
        return _authCache.idToken;
      }
    } catch {
      // fall through to fresh sign-in
    }
  }

  // Fresh anonymous sign-in
  try {
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (text.includes("CONFIGURATION_NOT_FOUND") || text.includes("ADMIN_ONLY_OPERATION")) {
        // Anonymous Auth provider is disabled in this Firebase project.
        // Mark as disabled so we stop trying — writes will work without auth
        // if Firestore rules allow unauthenticated access.
        _anonAuthDisabled = true;
        return null;
      }
      throw new Error(`Firebase 익명 인증 실패 [${res.status}]: ${text}`);
    }

    const d = (await res.json()) as {
      idToken: string;
      refreshToken: string;
      expiresIn: string;
    };
    _authCache = {
      idToken: d.idToken,
      refreshToken: d.refreshToken,
      expiresAt: now + Number(d.expiresIn) * 1000,
    };
    return _authCache.idToken;
  } catch (err) {
    // Network error — don't mark as permanently disabled
    throw err;
  }
}

// ── Permission error detection ────────────────────────────────────────────────

export function isPermissionError(status: number, body: string): boolean {
  return (
    status === 403 ||
    status === 401 ||
    body.includes("PERMISSION_DENIED") ||
    body.includes("UNAUTHENTICATED")
  );
}

// ── Value types ───────────────────────────────────────────────────────────────

type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { mapValue: { fields: FsFields } }
  | { arrayValue: { values?: FsValue[] } }
  | { timestampValue: string };

type FsFields = Record<string, FsValue>;

interface FsDoc {
  name: string;
  fields: FsFields;
  updateTime?: string;
  createTime?: string;
}

// ── JS ↔ Firestore conversion ─────────────────────────────────────────────────

function toFsValue(val: unknown): FsValue {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number") {
    return Number.isInteger(val)
      ? { integerValue: String(val) }
      : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: val.length ? { values: val.map(toFsValue) } : {},
    };
  }
  if (typeof val === "object") {
    return {
      mapValue: { fields: toFsFields(val as Record<string, unknown>) },
    };
  }
  return { stringValue: String(val) };
}

function toFsFields(obj: Record<string, unknown>): FsFields {
  const fields: FsFields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFsValue(v);
  }
  return fields;
}

function fromFsValue(val: FsValue): unknown {
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return val.booleanValue;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return val.doubleValue;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val)
    return (val.arrayValue.values ?? []).map(fromFsValue);
  if ("mapValue" in val) return fromFsFields(val.mapValue.fields);
  return null;
}

function fromFsFields(fields: FsFields): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    obj[k] = fromFsValue(v);
  }
  return obj;
}

function docToObject(doc: FsDoc): Record<string, unknown> & { id: string } {
  const id = doc.name.split("/").pop() ?? "";
  // _updateTime: 낙관적 동시성 제어(원자적 발행)를 위한 서버 타임스탬프
  return { id, _updateTime: doc.updateTime, ...fromFsFields(doc.fields) };
}

// ── Internal helper: fetch with optional retry using anonymous auth ────────────

async function fetchWithAuth(
  url: string,
  method: "PATCH" | "POST",
  body: string
): Promise<Response> {
  // Attempt 1: no auth (works when Firestore rules allow unauthenticated writes)
  const res1 = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });

  // If not an auth error, return as-is (success or non-auth failure)
  if (res1.status !== 401 && res1.status !== 403) {
    return res1;
  }

  // Attempt 2: try with anonymous auth token
  const token = await getAnonymousToken();
  if (!token) {
    // Anonymous auth unavailable — return original error response
    return res1;
  }

  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body,
  });
}

// ── Query (read — API key only, no auth required) ─────────────────────────────

export interface FsFilter {
  field: string;
  op:
    | "EQUAL"
    | "NOT_EQUAL"
    | "LESS_THAN"
    | "LESS_THAN_OR_EQUAL"
    | "GREATER_THAN"
    | "GREATER_THAN_OR_EQUAL";
  value: unknown;
}

export async function runQuery(
  collectionId: string,
  filters: FsFilter[]
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const makeFilter = (f: FsFilter) => ({
    fieldFilter: {
      field: { fieldPath: f.field },
      op: f.op,
      value: toFsValue(f.value),
    },
  });

  const where =
    filters.length === 1
      ? makeFilter(filters[0])
      : {
          compositeFilter: {
            op: "AND",
            filters: filters.map(makeFilter),
          },
        };

  const res = await fetch(`${BASE_URL}:runQuery?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Firestore runQuery 실패 [${res.status}] collection=${collectionId}: ${text}`
    );
  }

  const results = (await res.json()) as Array<{ document?: FsDoc }>;
  return results
    .filter((r) => r.document != null)
    .map((r) => docToObject(r.document!));
}

// ── Update (PATCH with updateMask) ────────────────────────────────────────────

export async function updateDocument(
  collectionId: string,
  docId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const fields = toFsFields(updates);
  const maskParams = Object.keys(updates)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const url = `${BASE_URL}/${collectionId}/${encodeURIComponent(docId)}?${maskParams}&key=${API_KEY}`;
  const body = JSON.stringify({ fields });

  const res = await fetchWithAuth(url, "PATCH", body);

  if (!res.ok) {
    const text = await res.text();
    const kind = isPermissionError(res.status, text)
      ? "Firestore 권한 오류 — 보안 규칙에서 쓰기를 허용해야 합니다"
      : `Firestore updateDocument 실패 [${res.status}]`;
    throw new Error(`${kind} collection=${collectionId} id=${docId}: ${text}`);
  }
}

// ── Guarded update (PATCH with currentDocument.updateTime precondition) ────────
// 낙관적 동시성 제어: 읽은 시점(updateTime) 이후 문서가 바뀌지 않았을 때만 적용.
// 다른 발행 주체가 먼저 처리했으면(updateTime 불일치) false 반환 → 중복 발행 방지.
export async function updateDocumentGuarded(
  collectionId: string,
  docId: string,
  updates: Record<string, unknown>,
  expectedUpdateTime: string
): Promise<boolean> {
  const fields = toFsFields(updates);
  const maskParams = Object.keys(updates)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const precond = `currentDocument.updateTime=${encodeURIComponent(expectedUpdateTime)}`;
  const url = `${BASE_URL}/${collectionId}/${encodeURIComponent(docId)}?${maskParams}&${precond}&key=${API_KEY}`;
  const body = JSON.stringify({ fields });

  const res = await fetchWithAuth(url, "PATCH", body);

  if (res.ok) return true;

  const text = await res.text();
  // updateTime 불일치 → 다른 주체가 먼저 발행 (경쟁에서 짐). 정상 동작이므로 false.
  // Firestore/프록시 구현에 따라 409 ABORTED, 412 Precondition Failed,
  // 400 FAILED_PRECONDITION 중 하나로 반환될 수 있어 모두 처리.
  if (
    res.status === 409 ||
    res.status === 412 ||
    (res.status === 400 && /FAILED_PRECONDITION|updateTime/i.test(text))
  ) {
    return false;
  }

  const kind = isPermissionError(res.status, text)
    ? "Firestore 권한 오류 — 보안 규칙에서 쓰기를 허용해야 합니다"
    : `Firestore updateDocumentGuarded 실패 [${res.status}]`;
  throw new Error(`${kind} collection=${collectionId} id=${docId}: ${text}`);
}

// ── Get single document (read — API key only) ─────────────────────────────────

export async function getDocument(
  collectionId: string,
  docId: string
): Promise<(Record<string, unknown> & { id: string }) | null> {
  const url = `${BASE_URL}/${collectionId}/${encodeURIComponent(docId)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Firestore getDocument 실패 [${res.status}] collection=${collectionId} id=${docId}: ${text}`
    );
  }
  const doc = (await res.json()) as FsDoc;
  return docToObject(doc);
}

// ── Delete (DELETE) ───────────────────────────────────────────────────────────

export async function deleteDocument(
  collectionId: string,
  docId: string
): Promise<void> {
  const url = `${BASE_URL}/${collectionId}/${encodeURIComponent(docId)}?key=${API_KEY}`;

  // 1차: 인증 없이 시도
  let res = await fetch(url, { method: "DELETE" });

  // 401/403이면 익명 인증 토큰으로 재시도
  if (res.status === 401 || res.status === 403) {
    const token = await getAnonymousToken();
    if (token) {
      res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    const kind = isPermissionError(res.status, text)
      ? "Firestore 권한 오류 — 보안 규칙에서 삭제를 허용해야 합니다"
      : `Firestore deleteDocument 실패 [${res.status}]`;
    throw new Error(`${kind} collection=${collectionId} id=${docId}: ${text}`);
  }
}

// ── Add (POST) ────────────────────────────────────────────────────────────────

export async function addDocument(
  collectionId: string,
  data: Record<string, unknown>
): Promise<string> {
  const url = `${BASE_URL}/${collectionId}?key=${API_KEY}`;
  const body = JSON.stringify({ fields: toFsFields(data) });

  const res = await fetchWithAuth(url, "POST", body);

  if (!res.ok) {
    const text = await res.text();
    const kind = isPermissionError(res.status, text)
      ? "Firestore 권한 오류 — 보안 규칙에서 쓰기를 허용해야 합니다"
      : `Firestore addDocument 실패 [${res.status}]`;
    throw new Error(`${kind} collection=${collectionId}: ${text}`);
  }

  const doc = (await res.json()) as FsDoc;
  return doc.name.split("/").pop() ?? "";
}
