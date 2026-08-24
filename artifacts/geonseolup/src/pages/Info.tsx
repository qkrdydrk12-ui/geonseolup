import { useEffect } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import { useMergedArticles } from '@/lib/useMergedArticles';

function WageBanner() {
  return (
    <Link
      href="/wages"
      className="block no-underline mb-6 rounded-2xl p-5 text-white"
      style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5282 100%)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold opacity-75 mb-1">매주 업데이트</div>
          <div className="text-base font-bold">이번주 건설현장 일당 시세 보기</div>
          <div className="text-xs opacity-80 mt-1">평택·용인·화성·청주 지역별·직종별 일당 정리</div>
        </div>
        <div className="text-lg shrink-0">→</div>
      </div>
    </Link>
  );
}

export default function Info() {
  const { articles } = useMergedArticles();

  useEffect(() => {
    document.title = '정보/꿀팁 — 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '건설 현장 일자리 초보 가이드, 안전수칙, 일당 높은 현장 찾는 법 등 실용 정보를 모았습니다.';
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="max-w-[860px] mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-1">📚 정보 / 꿀팁</h1>
          <p className="text-sm text-gray-500">건설 현장 일자리에 관한 실용 정보를 모았습니다.</p>
        </div>

        <WageBanner />

        <div className="grid gap-4 sm:grid-cols-2">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/info/${article.slug}`}
              className="block no-underline"
            >
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col">
                <div
                  className="relative aspect-[16/9] overflow-hidden flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
                >
                  {/* 이미지가 없거나 못 불러오면 이모지 카드로 대체 (엑박 방지) */}
                  <span className="absolute text-5xl">{article.emoji}</span>
                  <img
                    src={article.imageSrc}
                    alt=""
                    loading="lazy"
                    className="relative w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col">
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
