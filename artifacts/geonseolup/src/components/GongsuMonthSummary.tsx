import { useEffect, useState } from 'react';
import { calcDailyNetPay } from '@/lib/dailyNetPay';

interface WorkRecord {
  id: number;
  work_date: string;
  gongsu_type: string;
  daily_wage: number | null;
}

export default function GongsuMonthSummary({ refreshKey }: { refreshKey?: number }) {
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    setLoading(true);
    fetch(`/api/work-records?from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((data) => setRecords(data.records ?? []))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const workedRecords = records.filter((r) => r.gongsu_type !== 'absent');
  const workDays = workedRecords.length;
  let grossTotal = 0;
  let netTotal = 0;
  for (const r of workedRecords) {
    const wage = r.daily_wage ?? 0;
    const amount = Math.round(wage * Number(r.gongsu_type));
    if (amount <= 0) continue;
    grossTotal += amount;
    netTotal += calcDailyNetPay({ dailyWage: amount, includePensionHealth: false }).netPay;
  }

  return (
    <div
      className="rounded-2xl overflow-hidden mt-4 p-5 sm:p-6 text-center"
      style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
    >
      <div className="text-white/70 text-xs font-bold mb-1">이번 달 실수령 추정</div>
      <div className="text-white font-black text-3xl sm:text-[38px] tabular-nums tracking-tight">
        {loading ? '–' : `${netTotal.toLocaleString()}원`}
      </div>
      {!loading && grossTotal > 0 && (
        <span className="inline-block mt-2 px-3 py-1 rounded-full bg-white/15 text-white text-[11px]">
          세전 총액 {grossTotal.toLocaleString()}원
        </span>
      )}
      <div className="mt-4 pt-4 border-t border-white/15">
        <div className="text-white/60 text-[11px] font-bold">이번 달 근무일수</div>
        <div className="text-white font-bold text-lg">{loading ? '–' : `${workDays}일`}</div>
      </div>
    </div>
  );
}
