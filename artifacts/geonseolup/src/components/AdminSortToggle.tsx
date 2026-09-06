import { SORT_OPTIONS, type SortKey } from '@/lib/contentStats';

// 블로그/현장소식/노가다툰/구인구직 관리자 목록 상단에서 공통으로 쓰는 정렬 토글.
// keys를 주면 그 항목만 보여준다(예: 좋아요 개념이 없는 구인구직은 ['latest','views']만).
export default function AdminSortToggle({ value, onChange, keys }: { value: SortKey; onChange: (v: SortKey) => void; keys?: SortKey[] }) {
  const options = keys ? SORT_OPTIONS.filter((o) => keys.includes(o.key)) : SORT_OPTIONS;
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border cursor-pointer font-[inherit] transition-colors ${
            value === o.key
              ? 'bg-[#f97316] border-[#f97316] text-white'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
