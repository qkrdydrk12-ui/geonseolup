// 정보/꿀팁(/info) 글 수정 내용 저장소.
// 원본 글은 프론트엔드 코드(infoData.ts)에 있고, 관리자가 수정한 내용만
// Postgres에 slug별 JSON으로 덮어쓰기(override) 형태로 보관한다.
// 프론트엔드는 원본 + 덮어쓰기를 병합해서 보여준다.

import { pgPool } from "./db.js";

export interface InfoOverride {
  slug: string;
  title: string;
  description: string;
  emoji: string;
  body: { subtitle?: string; text: string }[];
}

let _initialized = false;
async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS info_overrides (
      slug TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  _initialized = true;
}

export async function getAllInfoOverrides(): Promise<Record<string, InfoOverride>> {
  await ensureTable();
  const result = await pgPool.query<{ slug: string; data: InfoOverride }>(
    `SELECT slug, data FROM info_overrides`
  );
  const map: Record<string, InfoOverride> = {};
  for (const row of result.rows) map[row.slug] = { ...row.data, slug: row.slug };
  return map;
}

export async function saveInfoOverride(override: InfoOverride): Promise<void> {
  await ensureTable();
  await pgPool.query(
    `INSERT INTO info_overrides (slug, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (slug) DO UPDATE SET data = $2, updated_at = now()`,
    [override.slug, JSON.stringify(override)]
  );
}

export async function deleteInfoOverride(slug: string): Promise<void> {
  await ensureTable();
  await pgPool.query(`DELETE FROM info_overrides WHERE slug = $1`, [slug]);
}

// 입력 검증: 관리자 화면에서 온 데이터라도 형식이 깨져 있으면 저장을 거부한다.
export function validateInfoOverride(input: unknown): { ok: true; value: InfoOverride } | { ok: false; message: string } {
  if (typeof input !== "object" || input === null) return { ok: false, message: "잘못된 요청 형식입니다" };
  const o = input as Record<string, unknown>;
  if (typeof o["slug"] !== "string" || !/^[a-z0-9-]{1,64}$/.test(o["slug"])) {
    return { ok: false, message: "slug가 올바르지 않습니다" };
  }
  if (typeof o["title"] !== "string" || !o["title"].trim() || o["title"].length > 200) {
    return { ok: false, message: "제목을 확인해주세요 (1~200자)" };
  }
  if (typeof o["description"] !== "string" || o["description"].length > 500) {
    return { ok: false, message: "설명을 확인해주세요 (최대 500자)" };
  }
  if (typeof o["emoji"] !== "string" || o["emoji"].length > 16) {
    return { ok: false, message: "이모지를 확인해주세요" };
  }
  if (!Array.isArray(o["body"]) || o["body"].length === 0 || o["body"].length > 50) {
    return { ok: false, message: "본문 문단을 확인해주세요 (1~50개)" };
  }
  const body: { subtitle?: string; text: string }[] = [];
  for (const block of o["body"] as unknown[]) {
    if (typeof block !== "object" || block === null) return { ok: false, message: "본문 문단 형식이 올바르지 않습니다" };
    const b = block as Record<string, unknown>;
    if (typeof b["text"] !== "string" || !b["text"].trim() || b["text"].length > 5000) {
      return { ok: false, message: "본문 내용을 확인해주세요 (문단당 최대 5000자)" };
    }
    const entry: { subtitle?: string; text: string } = { text: b["text"] };
    if (typeof b["subtitle"] === "string" && b["subtitle"].trim()) {
      if (b["subtitle"].length > 200) return { ok: false, message: "소제목은 최대 200자입니다" };
      entry.subtitle = b["subtitle"];
    }
    body.push(entry);
  }
  return {
    ok: true,
    value: {
      slug: o["slug"],
      title: (o["title"] as string).trim(),
      description: (o["description"] as string).trim(),
      emoji: (o["emoji"] as string).trim(),
      body,
    },
  };
}
