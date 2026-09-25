import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { renderRichText } from '@/lib/richText';

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
  const [topic, setTopic] = useState<QualityTopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
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
  }, [topic]);

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
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <Header />

      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5282 100%)' }}>
        <div className="max-w-[860px] mx-auto px-4 pt-8 pb-7">
          <Link href="/quality" className="text-white/70 text-xs no-underline hover:text-white">
            ← 품질기준 목록
          </Link>
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

      <main className="max-w-[860px] mx-auto px-4 py-7">
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

        <div className="mt-7 text-center">
          <Link
            href="/quality"
            className="inline-block px-5 py-2.5 rounded-lg text-sm font-bold text-white no-underline"
            style={{ background: '#f97316' }}
          >
            다른 품질기준도 보기 →
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
