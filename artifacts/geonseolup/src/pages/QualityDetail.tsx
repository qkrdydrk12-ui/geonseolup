import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { renderRichText } from '@/lib/richText';
import { useQualityTopics } from '@/lib/useQualityTopics';

interface BodyBlock { subtitle?: string; text: string }
interface ImageBlock { imageBase64: string; caption?: string; kind?: 'correct' | 'defect' | 'step' | 'diagram' }

interface QualityTopicDetail {
  id: number;
  code: string;
  category: string;
  title: string;
  slug: string;
  summary: string;
  keywords: string[];
  body: BodyBlock[];
  images: ImageBlock[];
  sourcePage: number | null;
}

const KIND_LABEL: Record<string, { label: string; className: string }> = {
  correct: { label: '적합 예시', className: 'bg-green-50 text-green-700 border-green-200' },
  defect: { label: '부적합(주의) 예시', className: 'bg-red-50 text-red-700 border-red-200' },
  step: { label: '시공 순서', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  diagram: { label: '도면/규격', className: 'bg-gray-50 text-gray-600 border-gray-200' },
};

interface Props {
  slug: string;
}

export default function QualityDetail({ slug }: Props) {
  const [, navigate] = useLocation();
  const { topics } = useQualityTopics();
  const [topic, setTopic] = useState<QualityTopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setTopic(null);
    fetch(`/api/quality-topics/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data: QualityTopicDetail | null) => {
        if (!cancelled && data) setTopic(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!topic) return;
    document.title = `${topic.title} — 건설 품질기준 — 건설UP`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = topic.summary;
    window.scrollTo(0, 0);
  }, [topic]);

  // 목록(코드순 정렬)에서 현재 항목의 위치를 찾아 이전/다음 항목을 계산 — 책 넘기듯 이어보기용.
  const { prevTopic, nextTopic, position } = useMemo(() => {
    if (topics.length === 0) return { prevTopic: null, nextTopic: null, position: null };
    const idx = topics.findIndex((t) => t.slug === slug);
    if (idx === -1) return { prevTopic: null, nextTopic: null, position: null };
    return {
      prevTopic: idx > 0 ? topics[idx - 1]! : null,
      nextTopic: idx < topics.length - 1 ? topics[idx + 1]! : null,
      position: { index: idx + 1, total: topics.length },
    };
  }, [topics, slug]);

  function goPrev() {
    if (prevTopic) navigate(`/quality/${prevTopic.slug}`);
  }
  function goNext() {
    if (nextTopic) navigate(`/quality/${nextTopic.slug}`);
  }

  // 스와이프: 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전.
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 60) return;
    if (delta < 0) goNext();
    else goPrev();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevTopic, nextTopic]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#f8fafc' }}>
        <Header />
        <div className="text-center py-24 text-gray-400 text-sm">불러오는 중...</div>
      </div>
    );
  }

  if (notFound || !topic) {
    return (
      <div className="min-h-screen" style={{ background: '#f8fafc' }}>
        <Header />
        <div className="text-center py-24">
          <div className="text-4xl mb-3">😕</div>
          <p className="text-sm text-gray-500 mb-4">해당 품질기준 항목을 찾을 수 없어요.</p>
          <Link href="/quality" className="text-[#f97316] font-bold text-sm no-underline">← 품질기준 목록으로</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <Header />

      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5282 100%)' }}>
        <div className="max-w-[860px] mx-auto px-4 pt-8 pb-7">
          <div className="flex items-center justify-between mb-3">
            <Link href="/quality" className="text-white/70 text-xs no-underline hover:text-white">
              ← 품질기준 목록
            </Link>
            {position && (
              <span className="text-white/50 text-xs font-mono">{position.index} / {position.total}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3 mb-2">
            <span className="text-[11px] font-bold text-white bg-white/15 border border-white/25 px-2 py-0.5 rounded-full">
              {topic.category}
            </span>
            <span className="text-[11px] text-white/50 font-mono">{topic.code}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-snug mb-2">{topic.title}</h1>
          <p className="text-sm text-white/70">{topic.summary}</p>
        </div>
      </div>

      {/* 상단 이전/다음 내비게이션 — 책 넘기듯 바로 이어보기 */}
      <div className="max-w-[860px] mx-auto px-4 pt-4">
        <div className="flex items-stretch gap-2">
          <button
            onClick={goPrev}
            disabled={!prevTopic}
            className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
              prevTopic ? 'bg-white border-gray-200 hover:border-[#1e3a5f] cursor-pointer' : 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
            }`}
          >
            <span className="text-lg shrink-0">←</span>
            <span className="min-w-0">
              <span className="block text-[9px] text-gray-400 font-bold">이전 항목</span>
              <span className="block text-[11px] font-bold text-gray-700 truncate">{prevTopic?.title ?? '-'}</span>
            </span>
          </button>
          <button
            onClick={goNext}
            disabled={!nextTopic}
            className={`flex-1 flex items-center justify-end gap-2 px-3 py-2.5 rounded-xl border text-right transition-colors ${
              nextTopic ? 'bg-white border-gray-200 hover:border-[#1e3a5f] cursor-pointer' : 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
            }`}
          >
            <span className="min-w-0">
              <span className="block text-[9px] text-gray-400 font-bold">다음 항목</span>
              <span className="block text-[11px] font-bold text-gray-700 truncate">{nextTopic?.title ?? '-'}</span>
            </span>
            <span className="text-lg shrink-0">→</span>
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-1.5 sm:hidden">← 좌우로 밀어서 넘길 수도 있어요 →</p>
      </div>

      <main className="max-w-[860px] mx-auto px-4 py-5">
        <article className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-7">
          {topic.body.map((block, i) => (
            <div key={i} className={i > 0 ? 'mt-6' : ''}>
              {block.subtitle && (
                <h2 className="text-base font-bold text-[#1e3a5f] mb-2 pb-2 border-b-2 border-orange-100">
                  {block.subtitle}
                </h2>
              )}
              <div className="text-[14px] text-gray-700 leading-relaxed">
                {renderRichText(block.text)}
              </div>
            </div>
          ))}
        </article>

        {topic.images.length > 0 && (
          <div className="mt-6">
            <h2 className="text-base font-bold text-[#1e3a5f] mb-3">📷 현장 사진으로 확인하기</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {topic.images.map((img, i) => {
                const kindInfo = img.kind ? KIND_LABEL[img.kind] : null;
                return (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="relative">
                      <img src={img.imageBase64} alt={img.caption || topic.title} loading="lazy" className="w-full h-auto" />
                      {kindInfo && (
                        <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded-full border ${kindInfo.className}`}>
                          {kindInfo.label}
                        </span>
                      )}
                    </div>
                    {img.caption && (
                      <p className="text-xs text-gray-500 p-2.5 leading-relaxed">{img.caption}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 하단 이전/다음 — 본문 다 읽고 바로 이어보기 */}
        <div className="mt-7 flex items-stretch gap-2">
          <button
            onClick={goPrev}
            disabled={!prevTopic}
            className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border text-left transition-colors ${
              prevTopic ? 'bg-white border-gray-200 hover:border-[#1e3a5f] cursor-pointer' : 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
            }`}
          >
            <span className="text-lg shrink-0">←</span>
            <span className="min-w-0">
              <span className="block text-[9px] text-gray-400 font-bold">이전 항목</span>
              <span className="block text-[12px] font-bold text-gray-700 truncate">{prevTopic?.title ?? '-'}</span>
            </span>
          </button>
          <button
            onClick={goNext}
            disabled={!nextTopic}
            className={`flex-1 flex items-center justify-end gap-2 px-4 py-3 rounded-xl border text-right transition-colors ${
              nextTopic ? 'text-white border-[#f97316] cursor-pointer' : 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
            }`}
            style={nextTopic ? { background: '#f97316' } : undefined}
          >
            <span className="min-w-0">
              <span className={`block text-[9px] font-bold ${nextTopic ? 'text-white/80' : 'text-gray-400'}`}>다음 항목</span>
              <span className={`block text-[12px] font-bold truncate ${nextTopic ? 'text-white' : 'text-gray-700'}`}>{nextTopic?.title ?? '-'}</span>
            </span>
            <span className="text-lg shrink-0">→</span>
          </button>
        </div>

        <div className="mt-5 text-center">
          <Link href="/quality" className="text-xs text-gray-400 no-underline hover:text-gray-600">
            목록으로 돌아가기
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
