import type { StatsSummary } from '@/lib/contentStats';

// 블로그/현장소식/노가다툰/구인구직 등 관리자 목록 위에서 공통으로 쓰는 요약 스탯 바.
// 스크롤 없이 전체 조회수·좋아요·저조한 글 개수를 한눈에 보여준다.
export default function AdminStatsSummaryBar({ stats, countLabel = '총 글' }: { stats: StatsSummary; countLabel?: string }) {
  if (stats.totalCount === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <div className="flex-1 min-w-[90px] bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        <p className="text-[10px] text-gray-400 font-semibold">{countLabel}</p>
        <p className="text-sm font-extrabold text-gray-800">{stats.totalCount}건</p>
      </div>
      <div className="flex-1 min-w-[90px] bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        <p className="text-[10px] text-gray-400 font-semibold">총 조회수</p>
        <p className="text-sm font-extrabold text-gray-800">👁 {stats.totalViews.toLocaleString()}</p>
      </div>
      {stats.totalLikes !== undefined && (
        <div className="flex-1 min-w-[90px] bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          <p className="text-[10px] text-gray-400 font-semibold">총 좋아요</p>
          <p className="text-sm font-extrabold text-gray-800">❤️ {stats.totalLikes.toLocaleString()}</p>
        </div>
      )}
      {stats.zeroViewCount > 0 && (
        <div className="flex-1 min-w-[90px] bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <p className="text-[10px] text-red-400 font-semibold">조회수 0</p>
          <p className="text-sm font-extrabold text-red-600">{stats.zeroViewCount}건</p>
        </div>
      )}
    </div>
  );
}
