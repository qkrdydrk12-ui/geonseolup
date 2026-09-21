import { useEffect, useState } from 'react';
import { PiggyBank, Landmark } from 'lucide-react';
import { estimateRetirementFundFromWorkDates } from '@/lib/retirementFundHistory';
import { MIN_ELIGIBLE_DAYS } from '@/lib/retirementFund';
import { calcSeverance } from '@/lib/severancePay';

interface WorkRecordLite {
  work_date: string;
  gongsu_type: string;
  daily_wage: number | null;
}

function parseLocalDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export default function GongsuRetirementFund({ refreshKey }: { refreshKey?: number }) {
  const [totalDays, setTotalDays] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [eligible, setEligible] = useState(false);
  const [taxMode, setTaxMode] = useState<'daily' | 'regular'>('daily');
  const [severancePay, setSeverancePay] = useState(0);
  const [severanceSpanDays, setSeveranceSpanDays] = useState(0);
  const [severanceLimitedData, setSeveranceLimitedData] = useState(false);
  const [hasRecords, setHasRecords] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/work-records?from=2000-01-01&to=2099-12-31').then((res) => res.json()),
      fetch('/api/auth/tax-settings')
        .then((res) => res.json())
        .catch(() => null),
    ])
      .then(([workData, taxData]) => {
        if (taxData && (taxData.taxMode === 'regular' || taxData.taxMode === 'daily')) {
          setTaxMode(taxData.taxMode);
        }

        const records = (workData.records ?? []) as WorkRecordLite[];
        const workedRecords = records.filter((r) => r.gongsu_type !== 'absent');
        const workDates = workedRecords.map((r) => r.work_date);

        const fundResult = estimateRetirementFundFromWorkDates(workDates);
        setTotalDays(fundResult.totalDays);
        setTotalAmount(fundResult.totalAmount);
        setEligible(fundResult.eligible);

        if (workedRecords.length === 0) {
          setHasRecords(false);
          return;
        }
        setHasRecords(true);

        const sortedDates = [...workDates].sort();
        const earliest = parseLocalDate(sortedDates[0]);
        const today = parseLocalDate(new Date().toISOString().slice(0, 10));

        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        threeMonthsAgo.setDate(threeMonthsAgo.getDate() + 1);

        const limitedData = earliest.getTime() > threeMonthsAgo.getTime();
        setSeveranceLimitedData(limitedData);

        const windowStart = limitedData ? earliest : threeMonthsAgo;
        const windowStartStr = `${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, '0')}-${String(windowStart.getDate()).padStart(2, '0')}`;

        const recentWageTotal = workedRecords
          .filter((r) => r.work_date >= windowStartStr)
          .reduce((sum, r) => sum + (r.daily_wage ?? 0) * Number(r.gongsu_type), 0);
        const recentCalendarDays = daysBetween(windowStart, today) + 1;
        const spanDays = daysBetween(earliest, today) + 1;

        const result = calcSeverance({ recentWageTotal, recentCalendarDays, spanDays });
        setSeverancePay(result.severancePay);
        setSeveranceSpanDays(spanDays);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <div className="bg-white rounded-3xl shadow-[0_4px_24px_-6px_rgba(30,58,95,0.15)] p-5 sm:p-6 mt-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
          {taxMode === 'regular' ? (
            <Landmark className="w-4 h-4 text-[#1e3a5f]" />
          ) : (
            <PiggyBank className="w-4 h-4 text-[#1e3a5f]" />
          )}
        </div>
        <h2 className="font-bold text-[#1e3a5f]">
          {taxMode === 'regular' ? '법정 퇴직금 추정액' : '퇴직공제금 추정 적립액'}
        </h2>
      </div>
      <p className="text-xs text-gray-400 mb-4 ml-10">
        {taxMode === 'regular'
          ? '최근 3개월 평균임금 기준 추정치입니다. 실제 지급액과 차이 날 수 있습니다.'
          : '실제 적립액과 다를 수 있는 추정치입니다.'}
      </p>
      {loading ? (
        <div className="text-sm text-gray-400">불러오는 중...</div>
      ) : taxMode === 'regular' ? (
        !hasRecords ? (
          <p className="text-xs text-gray-400">아직 근무 기록이 없습니다.</p>
        ) : (
          <>
            <div className="flex justify-between items-baseline bg-gray-50 rounded-xl px-4 py-3.5">
              <span className="text-sm text-gray-500">재직 {severanceSpanDays}일</span>
              <span className="text-xl font-bold text-[#1e3a5f]">{severancePay.toLocaleString()}원</span>
            </div>
            {severanceLimitedData && (
              <p className="text-xs text-gray-400 mt-2.5">
                아직 3개월치 기록이 쌓이지 않아 현재까지의 근무 기록만으로 계산한 추정치입니다.
              </p>
            )}
          </>
        )
      ) : (
        <>
          <div className="flex justify-between items-baseline bg-gray-50 rounded-xl px-4 py-3.5">
            <span className="text-sm text-gray-500">누적 {totalDays}일</span>
            <span className="text-xl font-bold text-[#1e3a5f]">{totalAmount.toLocaleString()}원</span>
          </div>
          {!eligible && (
            <p className="text-xs text-gray-400 mt-2.5">
              수급 최소 적립일수({MIN_ELIGIBLE_DAYS}일)에 아직 도달하지 않았습니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
