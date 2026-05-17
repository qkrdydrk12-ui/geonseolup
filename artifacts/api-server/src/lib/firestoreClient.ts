// Firestore REST API client
// Uses the Firebase web API key — no service account needed when rules allow open access

const PROJECT_ID = "geonseolup";
const API_KEY = "AIzaSyDBV9vioVA_Avbd0CGH7fMzCVZEYbG3UQM";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

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

// ── Query ─────────────────────────────────────────────────────────────────────

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
    throw new Error(`Firestore runQuery failed [${res.status}]: ${text}`);
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

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Firestore updateDocument failed [${res.status}]: ${text}`
    );
  }
}

// ── Add (POST) ────────────────────────────────────────────────────────────────

export async function addDocument(
  collectionId: string,
  data: Record<string, unknown>
): Promise<string> {
  const url = `${BASE_URL}/${collectionId}?key=${API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFsFields(data) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore addDocument failed [${res.status}]: ${text}`);
  }

  const doc = (await res.json()) as FsDoc;
  return doc.name.split("/").pop() ?? "";
}
