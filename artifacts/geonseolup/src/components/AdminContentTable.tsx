import type { SortKey } from '@/lib/contentStats';

export interface AdminContentTableRow {
  key: string | number;
  title: string;
  badges?: { label: string; className: string }[];
  metaLine: string; // 예: "/info/slug · 9/6 12:00 등록"
  views: number;
  likes?: number; // 좋아요 개념이 없는 콘텐츠(예: 구인구직 공고)는 생략 — 전체 행에 없으면 좋아요 열 자체가 숨겨진다
  lowView?: boolean; // 저조한 글이면 강조 표시
  onEdit?: () => void; // 없으면 "수정" 버튼을 숨긴다
  onDelete?: () => void; // 없으면 삭제 버튼을 숨긴다 (기본 내장 글 등)
}

const thCls = 'text-left text-[11px] font-bold text-gray-400 px-3 py-2 whitespace-nowrap';
const sortableThCls = `${thCls} cursor-pointer hover:text-gray-600 select-none`;

// 블로그/현장소식/노가다툰 관리자 목록의 "표형" 뷰 — 카드형보다 정보 밀도가 높아
// 스크롤 한 번에 훨씬 많은 글의 조회수·좋아요를 한눈에 비교할 수 있다.
export default function AdminContentTable({
  rows,
  sortKey,
  onSortChange,
}: {
  rows: AdminContentTableRow[];
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
}) {
  function arrow(key: SortKey) {
    return sortKey === key ? ' ▾' : '';
  }
  const showLikes = rows.some((r) => r.likes !== undefined);
  const showActions = rows.some((r) => r.onEdit || r.onDelete);
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-collapse min-w-[520px]">
        <thead>
          <tr className="border-b border-gray-100">
            <th className={thCls}>제목</th>
            <th className={sortableThCls} onClick={() => onSortChange('views')}>👁 조회수{arrow('views')}</th>
            {showLikes && <th className={sortableThCls} onClick={() => onSortChange('likes')}>❤️ 좋아요{arrow('likes')}</th>}
            <th className={thCls}>비고</th>
            {showActions && <th className={thCls}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`border-b border-gray-50 last:border-0 ${r.lowView ? 'bg-red-50/40' : ''}`}>
              <td className="px-3 py-2 align-top">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm text-gray-900">{r.title}</span>
                  {r.badges?.map((b, i) => (
                    <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.className}`}>{b.label}</span>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">{r.metaLine}</p>
              </td>
              <td className="px-3 py-2 align-top text-sm font-semibold text-gray-700 whitespace-nowrap">{r.views.toLocaleString()}</td>
              {showLikes && <td className="px-3 py-2 align-top text-sm font-semibold text-gray-700 whitespace-nowrap">{(r.likes ?? 0).toLocaleString()}</td>}
              <td className="px-3 py-2 align-top">
                {r.lowView && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">저조</span>}
              </td>
              {showActions && (
                <td className="px-3 py-2 align-top">
                  <div className="flex gap-1.5 justify-end">
                    {r.onEdit && (
                      <button type="button" onClick={r.onEdit} className="bg-white border border-blue-200 text-blue-600 px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-blue-50 font-[inherit] whitespace-nowrap">수정</button>
                    )}
                    {r.onDelete && (
                      <button type="button" onClick={r.onDelete} className="bg-white border border-red-200 text-red-500 px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-red-50 font-[inherit] whitespace-nowrap">삭제</button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
