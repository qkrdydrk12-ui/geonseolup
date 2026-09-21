import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';

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
    <div className="bg-white rounded-3xl shadow-[0_4px_24px_-6px_rgba(30,58,95,0.15)] p-4 sm:p-6 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
          <CalendarDays className="w-4 h-4 text-[#1e3a5f]" />
        </div>
        <h2 className="font-bold text-[#1e3a5f]">근무 캘린더</h2>
      </div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
        >
          ‹
        </button>
        <div className="font-bold text-[#1e3a5f]">
          {year}년 {month}월
        </div>
        <button
          onClick={nextMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 font-semibold mb-2">
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
            <div
              key={i}
              className="aspect-square rounded-xl p-1 flex flex-col items-center justify-center hover:bg-gray-50 transition"
            >
              <div className="text-xs text-gray-500">{d}</div>
              {dayTotal > 0 && (
                <div
                  className="text-[9px] sm:text-[10px] font-bold mt-0.5 leading-none"
                  style={{ color: '#f97316' }}
                >
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
