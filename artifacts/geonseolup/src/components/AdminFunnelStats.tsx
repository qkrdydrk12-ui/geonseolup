import { useEffect, useState } from 'react';
import { getToken } from '@/lib/adminAuth';
import AdminRankedBars, { type RankedBarItem } from './AdminRankedBars';

interface FunnelResponse {
  days: number;
  totalSessions: number;
  bounceSessions: number;
  bounceRate: number;
  overallAvgDurationSec: number;
  exitPoints: RankedBarItem[];
  avgDurationByPage: RankedBarItem[];
}

const PERIODS = [
  { days: 7, label: '최근 7일' },
  { days: 14, label: '최근 14일' },
  { days: 30, label: '최근 30일' },
];

function formatSec(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

async function apiFetch(url: string) {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
  return res.json();
}

// 방문자가 사이트를 한 페이지만 보고 떠나는지(이탈률), 주로 어느 페이지에서 나가는지(이탈 지점),
// 페이지별로 평균 얼마나 머무는지(체류시간)를 보여준다. PageFlowTracker가 쌓는 page_view_events 기반.
export default function AdminFunnelStats() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/stats/funnel?days=${days}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-base font-bold text-[#1e3a5f]">🚶 체류시간·이탈</h2>
        <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full cursor-pointer font-[inherit] transition-colors ${
                days === p.days ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">세션(브라우저 탭 하나) 단위 · 관리자 자신의 방문은 집계에서 제외</p>

      {loading ? (
        <div className="flex items-center justify-center h-24 text-gray-400 text-sm">불러오는 중...</div>
      ) : !data || data.totalSessions === 0 ? (
        <div className="flex items-center justify-center h-20 text-gray-400 text-sm">이 기간엔 방문 기록이 없어요</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            <div className="flex-1 min-w-[110px] bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-400 font-semibold">전체 방문 세션</p>
              <p className="text-sm font-extrabold text-gray-800">{data.totalSessions.toLocaleString()}건</p>
            </div>
            <div className="flex-1 min-w-[110px] bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <p className="text-[10px] text-red-400 font-semibold">이탈률(1페이지만 보고 나감)</p>
              <p className="text-sm font-extrabold text-red-600">{Math.round(data.bounceRate * 100)}%</p>
            </div>
            <div className="flex-1 min-w-[110px] bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-400 font-semibold">평균 체류시간</p>
              <p className="text-sm font-extrabold text-gray-800">{formatSec(data.overallAvgDurationSec)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <AdminRankedBars title="🚪 이탈 지점 (마지막으로 본 페이지)" items={data.exitPoints} />
            <div>
              <AdminRankedBars title="⏱ 페이지별 평균 체류시간(초)" items={data.avgDurationByPage} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
