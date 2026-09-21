import { useEffect, useState } from 'react';
import { PiggyBank } from 'lucide-react';
import { estimateRetirementFundFromWorkDates } from '@/lib/retirementFundHistory';
import { MIN_ELIGIBLE_DAYS } from '@/lib/retirementFund';

interface WorkRecordLite {
  work_date: string;
  gongsu_type: string;
}

export default function GongsuRetirementFund({ refreshKey }: { refreshKey?: number }) {
  const [totalDays, setTotalDays] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/work-records?from=2000-01-01&to=2099-12-31')
      .then((res) => res.json())
      .then((data) => {
        const records = (data.records ?? []) as WorkRecordLite[];
        const workDates = records.filter((r) => r.gongsu_type !== 'absent').map((r) => r.work_date);
        const result = estimateRetirementFundFromWorkDates(workDates);
        setTotalDays(result.totalDays);
        setTotalAmount(result.totalAmount);
        setEligible(result.eligible);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <div className="bg-white rounded-3xl shadow-[0_4px_24px_-6px_rgba(30,58,95,0.15)] p-5 sm:p-6 mt-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
          <PiggyBank className="w-4 h-4 text-[#1e3a5f]" />
        </div>
        <h2 className="font-bold text-[#1e3a5f]">퇴직공제금 추정 적립액</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4 ml-10">실제 적립액과 다를 수 있는 추정치입니다.</p>
      {loading ? (
        <div className="text-sm text-gray-400">불러오는 중...</div>
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
