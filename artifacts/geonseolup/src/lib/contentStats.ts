// 관리자 화면에서 블로그/현장소식/노가다툰처럼 조회수·좋아요를 가진 콘텐츠 목록을
// 정렬·요약하는 공통 로직. AdminBlogArticles / AdminSiteNews / AdminToon / AdminContentStats에서
// 같은 로직을 각자 복붙하지 않도록 여기 한 곳에 모아둔다.

export interface ContentCounts {
  views: number;
  likes: number;
}

export type CountsMap = Record<string, ContentCounts>;

export type SortKey = 'latest' | 'views' | 'likes';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'latest', label: '최신순' },
  { key: 'views', label: '조회수순' },
  { key: 'likes', label: '좋아요순' },
];

/** counts[getKey(row)]가 없으면 0으로 취급한다 (아직 조회수 API가 안 돌아왔거나 slug가 없는 경우). */
export function getCounts(counts: CountsMap, key: string | null | undefined): ContentCounts {
  return (key && counts[key]) || { views: 0, likes: 0 };
}

/**
 * rows를 조회수/좋아요/최신순으로 정렬한다.
 * - 'latest'는 서버가 이미 최신순으로 내려주므로 원래 순서를 그대로 둔다(불필요한 재정렬 방지).
 * - 원본 배열은 건드리지 않고 새 배열을 반환한다.
 */
export function sortByStat<T>(
  rows: T[],
  counts: CountsMap,
  getKey: (row: T) => string | null | undefined,
  sortKey: SortKey,
): T[] {
  if (sortKey === 'latest') return rows;
  return [...rows].sort((a, b) => getCounts(counts, getKey(b))[sortKey] - getCounts(counts, getKey(a))[sortKey]);
}

export interface StatsSummary {
  totalCount: number;
  totalViews: number;
  totalLikes: number;
  zeroViewCount: number;
}

/** 목록 상단 요약바용 — 전체 글 수·조회수 합·좋아요 합·조회수 0인 글 개수를 한 번에 계산한다. */
export function summarizeStats<T>(
  rows: T[],
  counts: CountsMap,
  getKey: (row: T) => string | null | undefined,
): StatsSummary {
  let totalViews = 0;
  let totalLikes = 0;
  let zeroViewCount = 0;
  for (const row of rows) {
    const c = getCounts(counts, getKey(row));
    totalViews += c.views;
    totalLikes += c.likes;
    if (c.views === 0) zeroViewCount += 1;
  }
  return { totalCount: rows.length, totalViews, totalLikes, zeroViewCount };
}

/** 이 시간(48시간) 이상 지났는데도 조회수가 0이면 "저조한 글"로 본다 — 막 올라온 글까지 저조하다고 표시하지 않기 위한 유예 기간. */
export const LOW_PERFORMER_MIN_AGE_MS = 48 * 3600 * 1000;

export function isLowPerformer(views: number, publishedAtMs: number, now: number = Date.now()): boolean {
  return views === 0 && now - publishedAtMs > LOW_PERFORMER_MIN_AGE_MS;
}

