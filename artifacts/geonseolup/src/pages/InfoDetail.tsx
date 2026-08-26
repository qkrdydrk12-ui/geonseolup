import { useEffect } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import RelatedLinks from '@/components/RelatedLinks';
import { useMergedArticles } from '@/lib/useMergedArticles';
import { renderRichText } from '@/lib/richText';

interface Props {
  slug: string;
}

export default function InfoDetail({ slug }: Props) {
  const { articles, loading } = useMergedArticles();
  const article = articles.find((a) => a.slug === slug);

  useEffect(() => {
    if (article) {
      document.title = `${article.title} — 건설UP`;
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (meta) meta.content = article.description;
    } else {
      document.title = '페이지를 찾을 수 없습니다 — 건설UP';
    }
  }, [article]);

  if (!article) {
    if (loading) {
      return (
        <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
          <Header />
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-5xl mb-4">😔</div>
            <p className="font-semibold mb-3">페이지를 찾을 수 없습니다.</p>
            <Link href="/info" className="text-[#f97316] underline text-sm">목록으로 돌아가기</Link>
          </div>
        </div>
      </div>
    );
  }

  const currentIdx = articles.findIndex((a) => a.slug === slug);
  const prevArticle = currentIdx > 0 ? articles[currentIdx - 1] : null;
  const nextArticle = currentIdx < articles.length - 1 ? articles[currentIdx + 1] : null;

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="max-w-[760px] mx-auto px-4 py-8">

        {/* 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-5">
          <Link href="/" className="hover:text-[#f97316] no-underline transition-colors">홈</Link>
          <span>›</span>
          <Link href="/info" className="hover:text-[#f97316] no-underline transition-colors">정보/꿀팁</Link>
          <span>›</span>
          <span className="text-gray-600 font-medium truncate">{article.title}</span>
        </div>

        {/* 본문 카드 */}
        <article className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div
            className="relative aspect-[16/9] flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
          >
            {/* 이미지가 없거나 못 불러오면 이모지 표지로 대체 (엑박 방지) */}
            <span className="absolute text-6xl">{article.emoji}</span>
            <img
              src={article.imageSrc}
              alt=""
              className="relative w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <div className="p-6 sm:p-8">
            <div className="text-4xl mb-4">{article.emoji}</div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1e3a5f] leading-snug mb-2">
              {article.title}
            </h1>
            <p className="text-sm text-gray-400 mb-6 pb-5 border-b border-gray-100">{article.description}</p>

          <div className="space-y-5 text-[15px] text-gray-700 leading-relaxed">
            {article.body.map((block, i) => (
              <div key={i}>
                {block.subtitle && (
                  <h2 className="text-base font-bold text-[#1e3a5f] mb-1.5">{block.subtitle}</h2>
                )}
                {block.image && (
                  <img
                    src={block.image}
                    alt=""
                    loading="lazy"
                    className="w-full rounded-xl border border-gray-200 mb-3"
                  />
                )}
                {renderRichText(block.text)}
              </div>
            ))}
          </div>

          {/* 구인 목록 CTA */}
          <div
            className="mt-8 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
            style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
          >
            <div className="text-white flex-1">
              <p className="font-bold text-sm mb-0.5">지금 바로 건설 일자리를 찾아보세요</p>
              <p className="text-xs text-white/70">전국 건설 현장 실시간 구인 정보</p>
            </div>
            <Link
              href="/"
              className="shrink-0 px-4 py-2 rounded-lg text-xs font-extrabold no-underline transition-colors hover:opacity-90"
              style={{ background: '#f97316', color: '#fff' }}
            >
              구인 목록 보기 →
            </Link>
          </div>

          <RelatedLinks currentKey={`info:${article.slug}`} />
          </div>
        </article>

        {/* 이전 / 다음 */}
        <div className="flex gap-3 mt-4">
          {prevArticle ? (
            <Link
              href={`/info/${prevArticle.slug}`}
              className="flex-1 bg-white rounded-xl border border-gray-200 p-4 no-underline hover:border-[#f97316] transition-colors"
            >
              <p className="text-[10px] text-gray-400 mb-1">← 이전 글</p>
              <p className="text-xs font-semibold text-[#1e3a5f] line-clamp-2">{prevArticle.title}</p>
            </Link>
          ) : <div className="flex-1" />}
          {nextArticle ? (
            <Link
              href={`/info/${nextArticle.slug}`}
              className="flex-1 bg-white rounded-xl border border-gray-200 p-4 no-underline hover:border-[#f97316] transition-colors text-right"
            >
              <p className="text-[10px] text-gray-400 mb-1">다음 글 →</p>
              <p className="text-xs font-semibold text-[#1e3a5f] line-clamp-2">{nextArticle.title}</p>
            </Link>
          ) : <div className="flex-1" />}
        </div>

        {/* 목록으로 */}
        <div className="text-center mt-5">
          <Link href="/info" className="text-sm text-gray-500 hover:text-[#f97316] transition-colors no-underline">
            ← 목록으로 돌아가기
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
