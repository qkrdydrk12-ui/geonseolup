import { useEffect, useState } from 'react';
import Header from '@/components/Header';

interface WageRate {
  id: number;
  region: string;
  job: string;
  wage: number;
  note: string;
  weekOf: string;
}

interface WageRatesResponse {
  weekOf: string | null;
  weeks: string[];
  rows: WageRate[];
}

function formatWeekLabel(weekOf: string): string {
  const d = new Date(weekOf);
  if (Number.isNaN(d.getTime())) return weekOf;
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const fmt = (x: Date) => `${x.getMonth() + 1}.${x.getDate()}`;
  return `${fmt(d)} ~ ${fmt(end)}`;
}

export default function Wages() {
  const [data, setData] = useState<WageRatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState('전체');
  const [jobFilter, setJobFilter] = useState('전체');

  useEffect(() => {
    document.title = '이번주 건설현장 일당 시세 — 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) {
      meta.content = '평택·용인·화성·청주 등 반도체·건설현장 지역별·직종별 일당 시세를 매주 정리해서 알려드립니다.';
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch('/api/wage-rates')
      .then((res) => res.json())
      .then((d: WageRatesResponse) => setData(d))
      .catch(() => setData({ weekOf: null, weeks: [], rows: [] }))
      .finally(() => setLoading(false));
  }, []);

  async function loadWeek(weekOf: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/wage-rates?weekOf=${weekOf}`);
      const d: WageRatesResponse = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }

  const rows = data?.rows ?? [];
  const regions = ['전체', ...Array.from(new Set(rows.map((r) => r.region)))];
  const jobs = ['전체', ...Array.from(new Set(rows.map((r) => r.job)))];
  const visible = rows.filter(
    (r) => (regionFilter === '전체' || r.region === regionFilter) && (jobFilter === '전체' || r.job === jobFilter)
  );

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="max-w-[860px] mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-1">이번주 건설현장 일당 시세</h1>
          <p className="text-sm text-gray-500">
            평택·용인·화성·청주 등 반도체·건설현장 지역별·직종별 일당을 정리했습니다.
            {data?.weekOf && <> 기준: {formatWeekLabel(data.weekOf)}</>}
          </p>
        </div>

        {data && data.weeks.length > 1 && (
          <div className="flex items-center gap-2 mb-4">
            <label className="text-xs font-semibold text-gray-500">주 선택</label>
            <select
              value={data.weekOf ?? ''}
              onChange={(e) => loadWeek(e.target.value)}
              className="py-1.5 px-2.5 border border-gray-300 rounded-lg text-xs outline-none bg-white font-[inherit]"
            >
              {data.weeks.map((w) => (
                <option key={w} value={w}>{formatWeekLabel(w)}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2 mb-4 flex-wrap">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="py-2 px-3 border border-gray-300 rounded-lg text-sm outline-none bg-white font-[inherit]"
          >
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            className="py-2 px-3 border border-gray-300 rounded-lg text-sm outline-none bg-white font-[inherit]"
          >
            {jobs.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">등록된 시세가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                    <th className="py-3 px-4 font-semibold">지역</th>
                    <th className="py-3 px-4 font-semibold">직종</th>
                    <th className="py-3 px-4 font-semibold">일당</th>
                    <th className="py-3 px-4 font-semibold">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="py-3 px-4 font-semibold text-[#1e3a5f]">{r.region}</td>
                      <td className="py-3 px-4">{r.job}</td>
                      <td className="py-3 px-4 font-bold text-[#f97316]">{r.wage.toLocaleString('ko-KR')}원</td>
                      <td className="py-3 px-4 text-gray-500">{r.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4 leading-relaxed">
          이 시세는 실제 수집된 구인공고를 참고해 참고용으로 정리한 값이며, 현장·업체에 따라 실제 지급 단가는 다를 수 있습니다.
          최신 구인공고는 <a href="/" className="text-[#f97316] font-semibold no-underline">건설UP 메인 페이지</a>에서 확인하세요.
        </p>
      </main>
    </div>
  );
}
