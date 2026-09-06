export interface RankedBarItem {
  label: string;
  views: number;
}

// 지역별/직종별 조회수 랭킹처럼 "항목 + 막대 + 숫자"를 보여주는 간단한 공통 리스트.
// 별도 차트 라이브러리 없이 순수 CSS 막대(비율 폭)로 표현한다.
export default function AdminRankedBars({ title, items, limit = 8 }: { title: string; items: RankedBarItem[]; limit?: number }) {
  const top = items.slice(0, limit);
  const max = top.length ? Math.max(...top.map((i) => i.views), 1) : 1;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-extrabold text-gray-700 mb-3">{title}</h3>
      {top.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">데이터가 없습니다</p>
      ) : (
        <div className="flex flex-col gap-2">
          {top.map((item, i) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-gray-400 w-4 shrink-0">{i + 1}</span>
              <span className="text-xs font-semibold text-gray-700 w-16 shrink-0 truncate" title={item.label}>{item.label}</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#f97316] rounded-full" style={{ width: `${Math.max((item.views / max) * 100, item.views > 0 ? 3 : 0)}%` }} />
              </div>
              <span className="text-[11px] font-bold text-gray-600 w-10 text-right shrink-0">{item.views.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
