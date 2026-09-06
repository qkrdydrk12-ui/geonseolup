export type ViewMode = 'card' | 'table';

// 블로그/현장소식/노가다툰 관리자 목록에서 카드형 ⇄ 표형 뷰를 전환하는 공통 토글.
export default function AdminViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">
      {([
        { key: 'card', label: '카드형' },
        { key: 'table', label: '표형' },
      ] as const).map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full cursor-pointer font-[inherit] transition-colors ${
            value === o.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
