import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import { NEWS_NEWEST_FIRST, getNewsImage } from '@/lib/newsData';

// 관리자 패널에서 발행하는 짧은 소식 (DB 저장)
interface SiteNews {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  sourceLabel: string;
  sourceUrl: string;
  publishedAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export default function News() {
  const [rows, setRows] = useState<SiteNews[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = '건설업 현장 소식 — 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '대형 현장 착공, 투자, 안전 기준 등 건설업계 소식을 현장 근로자 시각에서 정리했습니다.';
  }, []);

  useEffect(() => {
    fetch('/api/site-news')
      .then((res) => res.json())
      .then((d: { rows: SiteNews[] }) => setRows(d.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="max-w-[860px] mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-1">🏗️ 건설업 현장 소식</h1>
          <p className="text-sm text-gray-500">대형 현장 착공·투자·안전 소식을 현장 근로자 시각에서 정리했습니다.</p>
        </div>

        {/* 심층 기사 (장문, 상세 페이지로 연결) */}
        {NEWS_NEWEST_FIRST.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 mb-8">
            {NEWS_NEWEST_FIRST.map((article) => (
              <Link
                key={article.slug}
                href={`/news/${article.slug}`}
                className="block no-underline"
              >
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col">
                  <div className="relative aspect-[16/9] overflow-hidden" style={{ background: '#0d0d0d' }}>
                    <img
                      src={getNewsImage(article.slug)}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="text-[11px] text-gray-400 mb-1.5">{article.date}</div>
                    <h2 className="text-[15px] font-bold text-[#1e3a5f] leading-snug mb-2">
                      {article.title}
                    </h2>
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                      {article.description}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-[#f97316]">
                      자세히 보기 →
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* 짧은 소식 (관리자 패널에서 발행) */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-200">불러오는 중...</div>
        ) : rows.length === 0 ? (
          NEWS_NEWEST_FIRST.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-200">아직 등록된 소식이 없습니다.</div>
          ) : null
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((r) => (
              <article key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {r.imageUrl && (
                  <div className="aspect-[16/9]" style={{ background: '#0d0d0d' }}>
                    <img src={r.imageUrl} alt={r.title} className="w-full h-full object-contain" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h2 className="text-base font-bold text-gray-900">{r.title}</h2>
                    {r.sourceLabel && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#f97316] shrink-0">{r.sourceLabel}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{r.body}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{formatDate(r.publishedAt)}</span>
                    {r.sourceUrl && (
                      <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#f97316] font-semibold no-underline">
                        원문 보기 →
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 leading-relaxed text-center">
          최신 구인공고는 <a href="/" className="text-[#f97316] font-semibold no-underline">건설UP 메인 페이지</a>에서 확인하세요.
        </p>
      </main>
    </div>
  );
}
