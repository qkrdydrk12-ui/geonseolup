import { Link } from 'wouter';
import { RELATED_LINKS } from '@/data/relatedLinks';

interface Props {
  /** `news:${slug}` 또는 `info:${slug}` 형태의 현재 글 키 */
  currentKey: string;
}

/** 내부링크 보강용 "관련 글" 섹션 (2026-08-25 신설). 현장소식·건설꿀팁 상세 페이지 공통 사용. */
export default function RelatedLinks({ currentKey }: Props) {
  const items = RELATED_LINKS[currentKey];
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="text-xs font-bold text-gray-400 mb-2">관련 글</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <Link
            key={`${item.type}-${item.slug}`}
            href={`/${item.type}/${item.slug}`}
            className="block no-underline rounded-xl border border-gray-200 bg-white p-3.5 hover:border-[#f97316] transition-colors"
          >
            <div className="text-[11px] text-gray-400 mb-0.5">
              {item.type === 'news' ? '현장 소식' : '건설꿀팁'}
            </div>
            <div className="text-xs font-semibold text-[#1e3a5f] line-clamp-2">{item.title}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
