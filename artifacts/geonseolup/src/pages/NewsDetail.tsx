import { useEffect } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import RelatedLinks from '@/components/RelatedLinks';
import { useMergedNews } from '@/lib/useMergedNews';
import { renderRichText } from '@/lib/richText';

interface Props {
  slug: string;
}

export default function NewsDetail({ slug }: Props) {
  const { articles, loading } = useMergedNews();
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
            <Link href="/news" className="text-[#f97316] underline text-sm">목록으로 돌아가기</Link>
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
          <Link href="/news" className="hover:text-[#f97316] no-underline transition-colors">현장 소식</Link>
          <span>›</span>
          <span className="text-gray-600 font-medium truncate">{article.title}</span>
        </div>

        {/* 본문 카드 */}
        <article className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div style={{ background: '#0d0d0d' }}>
            <img
              src={article.imageSrc}
              alt=""
              className="w-full max-w-[560px] mx-auto block"
            />
          </div>
          <div className="p-6 sm:p-8">
            <div className="text-xs text-gray-400 mb-2">{article.date} · 건설업 현장 소식</div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1e3a5f] leading-snug mb-2">
              {article.title}
            </h1>
            {/* DB(site_news) 글은 description이 본문 첫 문단을 그대로 잘라 만든 것이라
                아래 본문과 그대로 겹쳐 보이고 단어 중간이 잘리는 문제가 있었다(2026-08-09
                발견) — 별도 요약 문장이 있는 정적 글에서만 미리보기를 보여준다. */}
            {article.isDbArticle ? (
              <div className="mb-6 pb-5 border-b border-gray-100" />
            ) : (
              <p className="text-sm text-gray-400 mb-6 pb-5 border-b border-gray-100">{article.description}</p>
            )}

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
                      className="w-full max-w-[440px] mx-auto block rounded-xl border border-gray-200 mb-3"
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
                className="shrink-0 px-4 py-2 rounded-lg bg-[#f97316] text-white text-sm font-bold no-underline hover:bg-[#ea580c] transition-colors"
              >
                구인 공고 보기 →
              </Link>
            </div>

            <RelatedLinks currentKey={`news:${article.slug}`} />

            {/* 이전/다음 글 */}
            {(prevArticle || nextArticle) && (
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {prevArticle && (
                  <Link
                    href={`/news/${prevArticle.slug}`}
                    className="block no-underline rounded-xl border border-gray-200 p-3.5 hover:border-[#f97316] transition-colors"
                  >
                    <div className="text-[11px] text-gray-400 mb-0.5">← 이전 소식</div>
                    <div className="text-xs font-semibold text-[#1e3a5f] line-clamp-1">{prevArticle.title}</div>
                  </Link>
                )}
                {nextArticle && (
                  <Link
                    href={`/news/${nextArticle.slug}`}
                    className="block no-underline rounded-xl border border-gray-200 p-3.5 hover:border-[#f97316] transition-colors sm:text-right"
                  >
                    <div className="text-[11px] text-gray-400 mb-0.5">다음 소식 →</div>
                    <div className="text-xs font-semibold text-[#1e3a5f] line-clamp-1">{nextArticle.title}</div>
                  </Link>
                )}
              </div>
            )}

            <div className="mt-6 text-center">
              <Link href="/news" className="text-sm text-gray-500 underline hover:text-[#f97316]">목록으로 돌아가기</Link>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
