import { useEffect, useState } from 'react';
import { NEWS_NEWEST_FIRST, getNewsImage, type NewsArticle } from './newsData';

export interface DisplayNewsArticle extends NewsArticle {
  imageSrc: string;
  sourceUrl?: string;
}

interface SiteNewsApiRow {
  id: number;
  slug: string | null;
  title: string;
  body: string;
  imageUrl: string | null;
  sourceLabel: string;
  sourceUrl: string;
  publishedAt: string;
}

let cache: DisplayNewsArticle[] | null = null;

function staticOnly(): DisplayNewsArticle[] {
  return NEWS_NEWEST_FIRST.map((a) => ({ ...a, imageSrc: getNewsImage(a.slug) }));
}

function toDisplay(r: SiteNewsApiRow): DisplayNewsArticle {
  return {
    slug: r.slug || String(r.id),
    title: r.title,
    description: r.body.slice(0, 120),
    date: r.publishedAt.slice(0, 10),
    body: [{ text: r.body }],
    imageSrc: r.imageUrl || getNewsImage(r.slug || String(r.id)),
    sourceUrl: r.sourceUrl || undefined,
  };
}

/**
 * 관리자 패널("현장 소식" 코너)에서 DB로 직접 발행한 글 + 기존 코드에 하드코딩된
 * NEWS_NEWEST_FIRST(newsData.ts)를 합쳐서 보여준다. DB 발행 글이 최신순으로 앞에 오고,
 * slug가 겹치면 DB 쪽을 우선한다. DB 발행 글은 git push/Replit 배포 없이 바로 반영된다.
 */
export function useMergedNews() {
  const [articles, setArticles] = useState<DisplayNewsArticle[]>(() => cache ?? staticOnly());
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) {
      setArticles(cache);
      setLoading(false);
      return;
    }
    fetch('/api/site-news')
      .then((res) => res.json())
      .then((data: { rows: SiteNewsApiRow[] }) => {
        const dynamic = (data.rows ?? []).filter((r) => r.slug).map(toDisplay);
        const staticArticles = staticOnly().filter(
          (s) => !dynamic.some((d) => d.slug === s.slug)
        );
        const merged = [...dynamic, ...staticArticles];
        cache = merged;
        setArticles(merged);
        setLoading(false);
      })
      .catch(() => {
        setArticles(staticOnly());
        setLoading(false);
      });
  }, []);

  return { articles, loading };
}
