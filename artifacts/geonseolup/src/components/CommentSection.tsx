import { useEffect, useState } from 'react';

type ContentType = 'blog' | 'news' | 'toon';

interface Props {
  type: ContentType;
  slug: string;
}

interface Comment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

// 콘텐츠 타입별 API 경로 접두어 (LikeButton.tsx와 동일한 매핑, 서버 라우트: blogArticles.ts/siteNews.ts/toon.ts).
const API_PREFIX: Record<ContentType, string> = {
  blog: '/api/blog-articles',
  news: '/api/site-news',
  toon: '/api/toon',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

const REASON_MESSAGE: Record<string, string> = {
  empty: '댓글 내용을 입력해주세요.',
  too_long: '댓글이 너무 깁니다(500자 이내).',
  cooldown: '조금 전에 댓글을 남기셨어요. 잠시 후 다시 시도해주세요.',
  daily_limit: '오늘 댓글 작성 한도를 넘었어요. 내일 다시 시도해주세요.',
};

// 로그인 없이 남기는 익명 댓글 섹션. IP 기준으로 짧은 쿨다운·하루 상한이 있다(스팸 방지, contentEngagement.ts 참고).
export default function CommentSection({ type, slug }: Props) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `${API_PREFIX[type]}/${encodeURIComponent(slug)}/comments`;

  useEffect(() => {
    let cancelled = false;
    setComments(null);
    fetch(base)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setComments(Array.isArray(d.rows) ? d.rows : []);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => { cancelled = true; };
  }, [base]);

  async function handleSubmit() {
    if (submitting) return;
    const trimmed = body.trim();
    if (!trimmed) { setError('댓글 내용을 입력해주세요.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, body: trimmed }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(REASON_MESSAGE[d.reason as string] || '댓글 등록에 실패했어요. 잠시 후 다시 시도해주세요.');
        return;
      }
      setComments((prev) => [d.comment as Comment, ...(prev ?? [])]);
      setBody('');
    } catch {
      setError('댓글 등록에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-extrabold text-[#1e3a5f] mb-3 pb-[7px] border-b-2 border-gray-200 flex items-center gap-1.5">
        💬 댓글
        {comments !== null && (
          <span className="ml-auto text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {comments.length}
          </span>
        )}
      </h2>

      {/* 작성 폼 */}
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 mb-4">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="닉네임 (선택, 비우면 익명)"
            maxLength={30}
            className="w-[160px] shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:outline-none focus:border-[#f97316]"
          />
          <input
            type="text"
            value={body}
            onChange={(e) => { setBody(e.target.value); if (error) setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="댓글을 남겨보세요"
            maxLength={500}
            className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:outline-none focus:border-[#f97316]"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="shrink-0 px-4 py-2 rounded-lg text-[13px] font-extrabold text-white disabled:opacity-50 cursor-pointer border-none font-[inherit]"
            style={{ background: '#f97316' }}
          >
            등록
          </button>
        </div>
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        <p className="text-[10.5px] text-gray-400">로그인 없이 누구나 남길 수 있어요. 서로 예의를 지켜주세요.</p>
      </div>

      {/* 목록 */}
      {comments === null && (
        <p className="text-[12.5px] text-gray-400 text-center py-4">불러오는 중...</p>
      )}
      {comments !== null && comments.length === 0 && (
        <p className="text-[12.5px] text-gray-400 text-center py-4">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>
      )}
      {comments !== null && comments.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[12.5px] font-bold text-gray-700">{c.author}</span>
                <span className="text-[10.5px] text-gray-400">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
