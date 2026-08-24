import { useEffect, useState } from 'react';
import { INFO_ARTICLES, getArticleImage, type InfoArticle } from './infoData';

export interface DisplayArticle extends InfoArticle {
  imageSrc: string;
  publishedAt?: string;
  updatedAt?: string;
  sourceLabel: string;
}

interface BlogArticleApiRow {
  slug: string;
  title: string;
  description: string;
  emoji: string;
  body: InfoArticle['body'];
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

let cache: DisplayArticle[] | null = null;

function staticOnly(): DisplayArticle[] {
  return INFO_ARTICLES.map((a) => ({
    ...a,
    imageSrc: getArticleImage(a.slug),
    sourceLabel: '건설UP 편집부 자체 제작',
  }));
}

/**
 * 관리자 패널("건설 꿀팁" 코너)에서 DB로 직접 발행한 글 + 기존 코드에 하드코딩된
 * INFO_ARTICLES(infoData.ts)를 합쳐서 보여준다. DB 발행 글이 최신순으로 앞에 오고,
 * slug가 겹치면 DB 쪽을 우선한다(관리자가 기존 글을 "수정"한 경우를 대비).
 * DB 발행 글은 git push/Replit 배포 없이 바로 반영된다.
 */
export function useMergedArticles() {
  const [articles, setArticles] = useState<DisplayArticle[]>(() => cache ?? staticOnly());
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) {
      setArticles(cache);
      setLoading(false);
      return;
    }
    fetch('/api/blog-articles')
      .then((res) => res.json())
      .then((data: { rows: BlogArticleApiRow[] }) => {
        const dynamic: DisplayArticle[] = (data.rows ?? []).map((r) => ({
          slug: r.slug,
          title: r.title,
          description: r.description,
          emoji: r.emoji,
          body: r.body,
          imageSrc: r.imageUrl || getArticleImage(r.slug),
          publishedAt: r.createdAt,
          updatedAt: r.updatedAt,
          sourceLabel: '건설UP 편집부',
        }));
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
