import { useEffect, useState } from 'react';
import { getToken } from '@/lib/adminAuth';
import type { StatsSummary, SortKey } from '@/lib/contentStats';
import AdminSortToggle from './AdminSortToggle';
import AdminStatsSummaryBar from './AdminStatsSummaryBar';
import AdminRankedBars, { type RankedBarItem } from './AdminRankedBars';
import AdminContentTable, { type AdminContentTableRow } from './AdminContentTable';

interface JobViewRow {
  id: string;
  title: string;
  region: string;
  job: string;
  date: string | null;
  views: number;
}

interface JobViewsResponse {
  days: number;
  totalJobs: number;
  totalViews: number;
  zeroViewCount: number;
  byRegion: RankedBarItem[];
  byJobType: RankedBarItem[];
  jobs: JobViewRow[];
}

// range는 그대로 서버로 전달된다 — 'today'/'yesterday'는 그 하루만 정확히 집계하고,
// 나머지는 오늘부터 N일 전까지 누적 집계한다 (2026-09-08 "오늘/어제" 옵션 추가).
const PERIODS = [
  { range: 'today', label: '오늘' },
  { range: 'yesterday', label: '어제' },
  { range: '7', label: '최근 7일' },
  { range: '14', label: '최근 14일' },
  { range: '30', label: '최근 30일' },
];

async function apiFetch(url: string) {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
  return res.json();
}

// 활성 구인구직 공고 전체의 조회수를 지역별·직종별로 집계해 "사람들이 요즘 어떤 공고를
// 보고 있는지" 전체 흐름을 보여주는 탭. 개별 공고 관리(수정/삭제)는 "공고 관리" 탭에서 한다.
export default function AdminJobViews() {
  const [range, setRange] = useState('7');
  const [data, setData] = useState<JobViewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('views');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/admin/job-views?range=${range}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const jobs = data?.jobs ?? [];
  const sortedJobs = sortKey === 'latest'
    ? [...jobs].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    : jobs; // 서버가 이미 조회수 내림차순으로 정렬해서 줌

  const summary: StatsSummary | null = data
    ? { totalCount: data.totalJobs, totalViews: data.totalViews, zeroViewCount: data.zeroViewCount }
    : null;

  const tableRows: AdminContentTableRow[] = sortedJobs.slice(0, 50).map((j) => ({
    key: j.id,
    title: j.title,
    badges: [
      { label: j.region, className: 'bg-blue-50 text-blue-600' },
      { label: j.job, className: 'bg-orange-50 text-[#f97316]' },
    ],
    metaLine: j.date ? new Date(j.date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }) + ' 등록' : '',
    views: j.views,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="text-sm font-extrabold text-gray-700">공고 조회 현황</h3>
          <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.range}
                type="button"
                onClick={() => setRange(p.range)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full cursor-pointer font-[inherit] transition-colors ${
                  range === p.range ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mb-4 border-b border-gray-100 pb-3">이 기간에 조회 기록이 있는 공고는 마감된 공고도 포함됩니다 — 완전히 만료(마감 후 90일 경과)되거나 삭제된 공고만 제외됩니다.</p>
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
        ) : !summary ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오지 못했습니다.</div>
        ) : (
          <AdminStatsSummaryBar stats={summary} countLabel="활성 공고" />
        )}
      </div>

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <AdminRankedBars title="지역별 조회수" items={data.byRegion} />
            <AdminRankedBars title="직종별 조회수" items={data.byJobType} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3 flex-wrap gap-2">
              <h3 className="text-sm font-extrabold text-gray-700">공고별 조회수 랭킹 (상위 {tableRows.length})</h3>
              <AdminSortToggle value={sortKey} onChange={setSortKey} keys={['views', 'latest']} />
            </div>
            {tableRows.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">조회 기록이 없습니다.</div>
            ) : (
              <AdminContentTable sortKey={sortKey} onSortChange={setSortKey} rows={tableRows} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
