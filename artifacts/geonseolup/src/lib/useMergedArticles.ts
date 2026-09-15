import { useEffect, useState } from 'react';
import { INFO_ARTICLES, getArticleImage, type InfoArticle } from './infoData';

export interface DisplayArticle extends InfoArticle {
  imageSrc: string;
}

interface BlogArticleApiRow {
  slug: string;
  title: string;
  description: string;
  emoji: string;
  // 2026-09-15: 목록 API(/api/blog-articles)는 더 이상 body를 내려주지 않는다(37MB까지 불어나서
  // 모바일에서 느려지다 500 에러로 죽었던 사고 — 상세 절차는 InfoDetail.tsx 참고). 목록/이전·다음
  // 글 네비게이션은 body가 필요 없으므로 여기선 아예 안 받는다.
  imageUrl: string | null;
  relatedJob?: string | null;
  relatedCalculator?: string | null;
}

let cache: DisplayArticle[] | null = null;

function staticOnly(): DisplayArticle[] {
  return INFO_ARTICLES.map((a) => ({ ...a, imageSrc: getArticleImage(a.slug) }));
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
          // 목록 API가 body를 안 주므로 빈 배열로 채워둔다 — 이 훅은 목록 화면과
          // 이전/다음 글 네비게이션에만 쓰고, 실제 본문 렌더링은 InfoDetail.tsx가
          // /api/blog-articles/:slug(단건, body 포함)를 따로 받아서 한다.
          body: [],
          imageSrc: r.imageUrl || getArticleImage(r.slug),
          relatedJob: r.relatedJob ?? null,
          relatedCalculator: r.relatedCalculator ?? null,
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
