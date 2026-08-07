import { useEffect } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import { NEWS_NEWEST_FIRST, getNewsImage } from '@/lib/newsData';

export default function News() {
  useEffect(() => {
    document.title = '건설업 현장 소식 — 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '대형 현장 착공, 투자, 인력 수요 등 건설업계 소식을 현장 근로자 시각에서 정리했습니다.';
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="max-w-[860px] mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-1">🏗️ 건설업 현장 소식</h1>
          <p className="text-sm text-gray-500">대형 현장 착공·투자 소식을 현장 근로자 시각에서 정리했습니다.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
                    className="w-full h-full object-cover"
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
      </main>
    </div>
  );
}
