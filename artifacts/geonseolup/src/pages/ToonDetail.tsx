import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@/components/ui/carousel';
import { useToonEpisode, useToonEpisodes } from '@/lib/toonApi';
import LikeButton from '@/components/LikeButton';
import CommentSection from '@/components/CommentSection';

// 조회수 집계용 — 같은 방문자가 새로고침해도 서버에서 하루 1회만 카운트되므로
// 실패해도(네트워크 오류 등) 무시하고 조용히 넘어간다 (부가 기능, jobs Detail.tsx와 동일한 방식).
function recordServerView(slug: string): void {
  fetch(`/api/toon/${encodeURIComponent(slug)}/view`, { method: 'POST' }).catch(() => {});
}

export default function ToonDetail({ slug }: { slug: string }) {
  const { episode, loading, notFound } = useToonEpisode(slug);
  const { episodes } = useToonEpisodes();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  // /api/toon은 episode_number 내림차순(최신화가 0번)으로 오므로
  // "다음 화"(회차 번호 +1)는 리스트에서 인덱스 -1, "이전 화"는 인덱스 +1 (InfoDetail.tsx와 동일 패턴).
  const currentIdx = episodes.findIndex((e) => e.slug === slug);
  const nextEpisode = currentIdx > 0 ? episodes[currentIdx - 1] : null;
  const prevEpisode = currentIdx >= 0 && currentIdx < episodes.length - 1 ? episodes[currentIdx + 1] : null;

  useEffect(() => {
    if (!episode) return;
    document.title = `${episode.title} — 노가다툰 — 건설UP`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = episode.description;
    recordServerView(episode.slug);
  }, [episode]);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  if (notFound) {
    return (
      <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
        <Header />
        <main className="max-w-[600px] mx-auto px-4 py-16 text-center">
          <p className="text-gray-500 mb-4">해당 화를 찾을 수 없습니다.</p>
          <Link href="/toon" className="text-[#f97316] font-semibold no-underline">노가다툰 전체 보기 →</Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="max-w-[560px] mx-auto px-4 py-8">
        <div className="mb-3">
          <Link href="/toon" className="text-xs text-gray-400 no-underline">← 노가다툰 전체 보기</Link>
        </div>

        {loading || !episode ? (
          <div className="aspect-[4/5] rounded-2xl bg-white border border-gray-200 animate-pulse" />
        ) : (
          <>
            <div className="mb-4">
              <span className="inline-block bg-[#f97316] text-white text-xs font-bold px-2 py-1 rounded-full mb-2">
                {episode.episodeNumber}화
              </span>
              <h1 className="text-xl font-bold text-[#1e3a5f] leading-snug">{episode.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{episode.description}</p>
            </div>

            <Carousel setApi={setApi} className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-black">
              <CarouselContent>
                {episode.panels.map((panel) => (
                  <CarouselItem key={panel.index}>
                    <img
                      src={panel.imageUrl}
                      alt={`${episode.title} ${panel.index + 1}컷`}
                      className="w-full h-auto"
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-2" />
              <CarouselNext className="right-2" />
            </Carousel>

            <div className="flex items-center justify-center gap-1.5 mt-3">
              {episode.panels.map((panel) => (
                <span
                  key={panel.index}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: panel.index === current ? '#f97316' : '#d1d5db' }}
                />
              ))}
            </div>
            <p className="text-center text-xs text-gray-400 mt-1">
              {current + 1} / {episode.panels.length}컷 · 좌우로 넘겨보세요
            </p>

            <div className="mt-5 flex justify-center">
              <LikeButton type="toon" slug={episode.slug} />
            </div>

            {/* 댓글 (2026-09-10 신설) */}
            <CommentSection type="toon" slug={episode.slug} />

            <p className="text-[11px] text-gray-400 leading-relaxed mt-6 border-t border-gray-200 pt-4">
              ※ {episode.disclaimer}
            </p>

            {/* 이전 화 / 다음 화 */}
            {(prevEpisode || nextEpisode) && (
              <div className="flex gap-3 mt-4">
                {prevEpisode ? (
                  <Link
                    href={`/toon/${prevEpisode.slug}`}
                    className="flex-1 bg-white rounded-xl border border-gray-200 p-4 no-underline hover:border-[#f97316] transition-colors"
                  >
                    <p className="text-[10px] text-gray-400 mb-1">← 이전 화</p>
                    <p className="text-xs font-semibold text-[#1e3a5f] line-clamp-2">
                      {prevEpisode.episodeNumber}화 · {prevEpisode.title}
                    </p>
                  </Link>
                ) : <div className="flex-1" />}
                {nextEpisode ? (
                  <Link
                    href={`/toon/${nextEpisode.slug}`}
                    className="flex-1 bg-white rounded-xl border border-gray-200 p-4 no-underline hover:border-[#f97316] transition-colors text-right"
                  >
                    <p className="text-[10px] text-gray-400 mb-1">다음 화 →</p>
                    <p className="text-xs font-semibold text-[#1e3a5f] line-clamp-2">
                      {nextEpisode.episodeNumber}화 · {nextEpisode.title}
                    </p>
                  </Link>
                ) : <div className="flex-1" />}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
