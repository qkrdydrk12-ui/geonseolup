import { useEffect, useState } from 'react';
import { Link } from 'wouter';

export interface RelatedLinkEntry {
  type: 'news' | 'info';
  slug: string;
  title: string;
}

interface Props {
  /** `news:${slug}` 또는 `info:${slug}` 형태의 현재 글 키 */
  currentKey: string;
}

// 탭 안에서 여러 상세 페이지를 넘나들 때마다 매번 새로 fetch하지 않도록 모듈 스코프에 캐시
// (서버도 60초 캐시를 두지만, 같은 세션 내 중복 요청 자체를 줄인다).
let _mapPromise: Promise<Record<string, RelatedLinkEntry[]>> | null = null;
function loadRelatedLinksMap(): Promise<Record<string, RelatedLinkEntry[]>> {
  if (!_mapPromise) {
    _mapPromise = fetch('/api/related-links')
      .then((r) => (r.ok ? r.json() : { map: {} }))
      .then((d) => (d?.map ?? {}) as Record<string, RelatedLinkEntry[]>)
      .catch(() => ({}));
  }
  return _mapPromise;
}

/** 내부링크 보강용 "관련 글" 섹션 (2026-08-25 신설, 같은 날 Postgres(`related_links` 테이블)로 데이터
 * 이전 + 카드 디자인 보강 — 흰 배경이 안 끌린다는 사용자 지적으로 브랜드 컬러(네이비/오렌지) 톤
 * 배경+아이콘 배지로 교체). 현장소식·건설꿀팁 상세 페이지 공통 사용. 서버 렌더링(SEO, seo.ts)에도
 * 동일 데이터가 별도로 주입되므로, 여기서는 클라이언트(JS 실행 후) 표시만 담당한다. */
export default function RelatedLinks({ currentKey }: Props) {
  const [items, setItems] = useState<RelatedLinkEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRelatedLinksMap().then((map) => {
      if (!cancelled) setItems(map[currentKey] ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [currentKey]);

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="text-xs font-bold text-gray-400 mb-2">관련 글</p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {items.map((item) => {
          const isNews = item.type === 'news';
          return (
            <Link
              key={`${item.type}-${item.slug}`}
              href={`/${item.type}/${item.slug}`}
              className={`group block no-underline rounded-xl border p-3.5 transition-all hover:-translate-y-[2px] hover:shadow-md ${
                isNews
                  ? 'bg-gradient-to-br from-[#eef4fb] to-white border-[#dbe6f3] hover:border-[#1e3a5f]'
                  : 'bg-gradient-to-br from-[#fff3ea] to-white border-[#fbdcc2] hover:border-[#f97316]'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] shrink-0 ${
                    isNews ? 'bg-[#1e3a5f]/10' : 'bg-[#f97316]/15'
                  }`}
                >
                  {isNews ? '📰' : '💡'}
                </span>
                <span
                  className={`text-[11px] font-bold ${isNews ? 'text-[#1e3a5f]' : 'text-[#f97316]'}`}
                >
                  {isNews ? '현장 소식' : '건설꿀팁'}
                </span>
              </div>
              <div className="text-xs font-semibold text-[#1e3a5f] line-clamp-2 group-hover:text-[#0f2439]">
                {item.title}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
