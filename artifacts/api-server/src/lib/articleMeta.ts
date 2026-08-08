// 건설꿀팁(/info)·현장 소식(/news) 글 메타데이터 공용 모듈.
// - 정적 글: 프론트 소스(infoData.ts / newsData.ts)를 읽어 slug/title/description(/date)을
//   정규식으로 추출해 캐시한다 (새 글이 추가돼도 별도 작업 없이 sitemap/RSS/SEO에 자동 반영).
// - DB 글(관리자 블로그): blog_articles 테이블에서 published 글의 slug·제목·설명·
//   작성/수정 시각을 읽어온다 — 수정 시 updated_at이 자동 갱신되므로 lastmod도 자동 갱신.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pgPool } from "./db";

export interface ArticleMeta {
  slug: string;
  title: string;
  description: string;
  /** YYYY-MM-DD 또는 ISO 문자열. 정적 info 글에는 없음. */
  date?: string;
  /** 수정 시각 (DB 글만). */
  updated?: string;
  /** DB 글이면 이미지 API 경로, 아니면 undefined (정적 규칙 사용). */
  imageUrl?: string;
}

const TTL_MS = 5 * 60_000;

async function readFrontSource(rel: string): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), `artifacts/geonseolup/${rel}`),
    path.resolve(process.cwd(), `../geonseolup/${rel}`),
  ];
  let lastErr: unknown;
  for (const p of candidates) {
    try {
      return await readFile(p, "utf8");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const unescape = (s: string) => s.replace(/\\'/g, "'").replace(/\\\\/g, "\\");

function parseArticles(src: string): ArticleMeta[] {
  const list: ArticleMeta[] = [];
  // slug/title/description(선택적으로 date까지) — 작은따옴표 이스케이프(\') 허용.
  const re =
    /slug:\s*'((?:\\'|[^'])+)',\s*\n\s*title:\s*\n?\s*'((?:\\'|[^'])+)',\s*\n\s*description:\s*\n?\s*'((?:\\'|[^'])+)'(?:,\s*\n\s*date:\s*'([^']*)')?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    list.push({
      slug: unescape(m[1]!),
      title: unescape(m[2]!),
      description: unescape(m[3]!),
      date: m[4] || undefined,
    });
  }
  return list;
}

let _info: { list: ArticleMeta[]; at: number } | null = null;
export async function getInfoMeta(): Promise<ArticleMeta[]> {
  if (_info && Date.now() - _info.at < TTL_MS) return _info.list;
  const list = parseArticles(await readFrontSource("src/lib/infoData.ts"));
  _info = { list, at: Date.now() };
  return list;
}

let _news: { list: ArticleMeta[]; at: number } | null = null;
export async function getNewsMeta(): Promise<ArticleMeta[]> {
  if (_news && Date.now() - _news.at < TTL_MS) return _news.list;
  const list = parseArticles(await readFrontSource("src/lib/newsData.ts"));
  _news = { list, at: Date.now() };
  return list;
}

let _blog: { list: ArticleMeta[]; at: number } | null = null;
/** 관리자가 등록한 DB 블로그 글(공개된 것만). 실패 시 빈 배열. */
export async function getBlogArticleMeta(): Promise<ArticleMeta[]> {
  if (_blog && Date.now() - _blog.at < TTL_MS) return _blog.list;
  try {
    const { rows } = await pgPool.query(
      `SELECT slug, title, description, created_at, updated_at, (image_data IS NOT NULL) AS has_image
       FROM blog_articles WHERE published = true ORDER BY created_at DESC`
    );
    const list: ArticleMeta[] = rows.map((r: Record<string, unknown>) => ({
      slug: String(r.slug),
      title: String(r.title),
      description: String(r.description),
      date: r.created_at ? new Date(r.created_at as string).toISOString() : undefined,
      updated: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined,
      imageUrl: r.has_image ? `/api/blog-articles-image/${encodeURIComponent(String(r.slug))}` : undefined,
    }));
    _blog = { list, at: Date.now() };
    return list;
  } catch {
    return _blog?.list ?? [];
  }
}

/** 정적 info 글 + DB 블로그 글 합본 (DB 글이 같은 slug면 우선). */
export async function getMergedInfoMeta(): Promise<ArticleMeta[]> {
  const [statics, db] = await Promise.all([getInfoMeta(), getBlogArticleMeta()]);
  const dbSlugs = new Set(db.map((a) => a.slug));
  return [...db, ...statics.filter((a) => !dbSlugs.has(a.slug))];
}
