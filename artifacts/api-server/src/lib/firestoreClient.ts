// Firestore REST API client
// Write operations use Firebase Anonymous Auth to satisfy "request.auth != null" rules.
// Read operations use the API key only (allows unauthenticated reads).

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

async function getAnonymousToken(): Promise<string> {
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
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });

  if (!res.ok) {
    const text = await res.text();
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
  return { id, ...fromFsFields(doc.fields) };
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

// ── Update (PATCH with updateMask) — requires auth ────────────────────────────

export async function updateDocument(
  collectionId: string,
  docId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const token = await getAnonymousToken();
  const fields = toFsFields(updates);
  const maskParams = Object.keys(updates)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const url = `${BASE_URL}/${collectionId}/${encodeURIComponent(docId)}?${maskParams}&key=${API_KEY}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    const kind = isPermissionError(res.status, text)
      ? "Firestore 권한 오류(403) — 보안 규칙에서 익명 쓰기를 허용해야 합니다"
      : `Firestore updateDocument 실패 [${res.status}]`;
    throw new Error(`${kind} collection=${collectionId} id=${docId}: ${text}`);
  }
}

// ── Add (POST) — requires auth ────────────────────────────────────────────────

export async function addDocument(
  collectionId: string,
  data: Record<string, unknown>
): Promise<string> {
  const token = await getAnonymousToken();
  const url = `${BASE_URL}/${collectionId}?key=${API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ fields: toFsFields(data) }),
  });

  if (!res.ok) {
    const text = await res.text();
    const kind = isPermissionError(res.status, text)
      ? "Firestore 권한 오류(403) — 보안 규칙에서 익명 쓰기를 허용해야 합니다"
      : `Firestore addDocument 실패 [${res.status}]`;
    throw new Error(`${kind} collection=${collectionId}: ${text}`);
  }

  const doc = (await res.json()) as FsDoc;
  return doc.name.split("/").pop() ?? "";
}
