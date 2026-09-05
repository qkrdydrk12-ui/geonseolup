import { useEffect } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useToonEpisodes } from '@/lib/toonApi';

export default function Toon() {
  const { episodes, loading } = useToonEpisodes();

  useEffect(() => {
    document.title = '노가다툰 — 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '건설 현장 실제 경험을 바탕으로 각색한 공감 카툰, 노가다툰. 매주 새 이야기를 만나보세요.';
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="max-w-[860px] mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-1">🎨 노가다툰</h1>
          <p className="text-sm text-gray-500">현장 실화를 바탕으로 한 공감 카툰. 매주 새 이야기가 올라옵니다.</p>
        </div>

        {!loading && episodes.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">
            아직 등록된 화가 없습니다. 곧 1화가 올라올 예정이에요.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {episodes.map((ep) => (
            <Link key={ep.slug} href={`/toon/${ep.slug}`} className="block no-underline">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col">
                <div className="relative aspect-[4/5] overflow-hidden bg-gray-900">
                  <img
                    src={ep.coverImageUrl}
                    alt={ep.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <span className="absolute top-2 left-2 bg-[#f97316] text-white text-xs font-bold px-2 py-1 rounded-full">
                    {ep.episodeNumber}화
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h2 className="text-[15px] font-bold text-[#1e3a5f] leading-snug mb-2">
                    {ep.title}
                  </h2>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                    {ep.description}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-[#f97316]">
                    전체 보기 →
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
