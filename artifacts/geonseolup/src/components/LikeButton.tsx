import { useEffect, useState } from 'react';

type ContentType = 'blog' | 'news' | 'toon';

interface Props {
  type: ContentType;
  slug: string;
}

// 콘텐츠 타입별 API 경로 접두어 (서버 라우트: blogArticles.ts/siteNews.ts/toon.ts).
const API_PREFIX: Record<ContentType, string> = {
  blog: '/api/blog-articles',
  news: '/api/site-news',
  toon: '/api/toon',
};

// 방문자가 누르는 좋아요 버튼 — 처음 누르면 좋아요, 다시 누르면 취소(토글).
// 로그인 없이 IP 기준으로 하나씩만 인정된다(contentEngagement.ts 참고).
export default function LikeButton({ type, slug }: Props) {
  const [likes, setLikes] = useState<number | null>(null);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLikes(null);
    setLiked(false);
    fetch(`${API_PREFIX[type]}/${encodeURIComponent(slug)}/engagement`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setLikes(typeof d.likes === 'number' ? d.likes : 0);
        setLiked(!!d.liked);
      })
      .catch(() => {
        if (!cancelled) setLikes(0);
      });
    return () => { cancelled = true; };
  }, [type, slug]);

  async function handleClick() {
    if (busy || likes === null) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_PREFIX[type]}/${encodeURIComponent(slug)}/like`, { method: 'POST' });
      const d = await res.json();
      if (typeof d.likes === 'number') setLikes(d.likes);
      setLiked(!!d.liked);
    } catch {
      // 조용히 무시 — 좋아요는 부가 기능, 실패해도 페이지엔 영향 없음
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || likes === null}
      className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold border transition-colors disabled:opacity-60 font-[inherit] cursor-pointer ${
        liked
          ? 'bg-red-50 border-red-200 text-red-500'
          : 'bg-white border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-500'
      }`}
    >
      <span>{liked ? '❤️' : '🤍'}</span>
      <span>{likes === null ? '...' : `좋아요 ${likes}`}</span>
    </button>
  );
}
