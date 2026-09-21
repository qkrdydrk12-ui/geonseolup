import { useEffect, useState } from 'react';
import { fetchTaxSettings } from '@/lib/taxSettings';
import { Wallet } from 'lucide-react';
import { calcDailyNetPay } from '@/lib/dailyNetPay';
import { calcRegularEmployeeMonthlyNetPay } from '@/lib/regularEmployeeTax';

interface WorkRecord {
  id: number;
  work_date: string;
  gongsu_type: string;
  daily_wage: number | null;
}

export default function GongsuMonthSummary({ refreshKey }: { refreshKey?: number }) {
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxMode, setTaxMode] = useState<'daily' | 'regular'>('daily');
  const [dependents, setDependents] = useState(1);

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
    fetchTaxSettings().then((data) => {
      if (!data) return;
      if (data.taxMode === "regular" || data.taxMode === "daily") setTaxMode(data.taxMode as "daily" | "regular");
      if (typeof data.dependents === "number") setDependents(data.dependents);
    });
  }, [refreshKey]);

  const workedRecords = records.filter((r) => r.gongsu_type !== 'absent');
  const workDays = workedRecords.length;
  let grossTotal = 0;
  for (const r of workedRecords) {
    const wage = r.daily_wage ?? 0;
    const amount = Math.round(wage * Number(r.gongsu_type));
    if (amount <= 0) continue;
    grossTotal += amount;
  }

  let netTotal = 0;
  if (taxMode === 'regular') {
    netTotal = calcRegularEmployeeMonthlyNetPay({ monthlyWage: grossTotal, dependents }).netPay;
  } else {
    for (const r of workedRecords) {
      const wage = r.daily_wage ?? 0;
      const amount = Math.round(wage * Number(r.gongsu_type));
      if (amount <= 0) continue;
      netTotal += calcDailyNetPay({ dailyWage: amount, includePensionHealth: false }).netPay;
    }
  }

  return (
    <div
      className="rounded-3xl overflow-hidden mt-4 p-6 sm:p-7 text-center shadow-[0_8px_30px_-8px_rgba(30,58,95,0.45)]"
      style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
    >
      <div className="flex items-center justify-center gap-1.5 text-white/70 text-xs font-bold mb-1.5">
        <Wallet className="w-3.5 h-3.5" />
        이번 달 실수령 추정
      </div>
      <div className="text-white font-black text-4xl sm:text-[42px] tabular-nums tracking-tight">
        {loading ? '–' : `${netTotal.toLocaleString()}원`}
      </div>
      {!loading && grossTotal > 0 && (
        <span className="inline-block mt-2.5 px-3 py-1 rounded-full bg-white/15 text-white text-[11px] font-semibold">
          세전 총액 {grossTotal.toLocaleString()}원
        </span>
      )}
      <div className="mt-5 pt-5 border-t border-white/15">
        <div className="text-white/60 text-[11px] font-bold">이번 달 근무일수</div>
        <div className="text-white font-bold text-lg mt-0.5">{loading ? '–' : `${workDays}일`}</div>
      </div>
    </div>
  );
}
