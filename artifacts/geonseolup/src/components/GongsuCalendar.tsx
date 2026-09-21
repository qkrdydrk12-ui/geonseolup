import { useEffect, useMemo, useState } from 'react';

interface WorkRecord {
  id: number;
  work_date: string;
  gongsu_type: string;
  daily_wage: number | null;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function GongsuCalendar({ refreshKey }: { refreshKey?: number }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const from = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${pad(month)}-${pad(lastDay)}`;
    setLoading(true);
    fetch(`/api/work-records?from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((data) => setRecords(data.records ?? []))
      .finally(() => setLoading(false));
  }, [year, month, refreshKey]);

  const recordsByDate = useMemo(() => {
    const map = new Map<string, WorkRecord[]>();
    for (const r of records) {
      const list = map.get(r.work_date) ?? [];
      list.push(r);
      map.set(r.work_date, list);
    }
    return map;
  }, [records]);

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function prevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  }
  function nextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6 mt-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="text-gray-400 px-2">◀</button>
        <div className="font-semibold text-[#1e3a5f]">{year}년 {month}월</div>
        <button onClick={nextMonth} className="text-gray-400 px-2">▶</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-2">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dateStr = `${year}-${pad(month)}-${pad(d)}`;
          const dayRecords = recordsByDate.get(dateStr) ?? [];
          const dayTotal = dayRecords.reduce((sum, r) => {
            if (r.gongsu_type === 'absent') return sum;
            const wage = r.daily_wage ?? 0;
            return sum + wage * Number(r.gongsu_type);
          }, 0);
          return (
            <div key={i} className="aspect-square border border-gray-100 rounded-lg p-1 flex flex-col items-center justify-center">
              <div className="text-xs text-gray-500">{d}</div>
              {dayTotal > 0 && (
                <div className="text-[9px] sm:text-[10px] font-bold mt-0.5 leading-none" style={{ color: '#1e3a5f' }}>
                  {dayTotal >= 10000 ? `${Math.round(dayTotal / 1000) / 10}만` : dayTotal.toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {loading && <div className="text-center text-gray-300 text-xs mt-2">불러오는 중...</div>}
    </div>
  );
}
