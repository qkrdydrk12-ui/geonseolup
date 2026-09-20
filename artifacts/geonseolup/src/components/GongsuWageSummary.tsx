import { useEffect, useState } from 'react';
import { calcDailyNetPay, sanitizeWage } from '@/lib/dailyNetPay';

interface SiteSummary {
  siteId: number;
  siteName: string;
  workDays: number;
  employmentInsuranceApplies: boolean;
}

export default function GongsuWageSummary({ refreshKey }: { refreshKey?: number }) {
  const [wageInput, setWageInput] = useState('');
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    fetch(`/api/work-records/site-summary?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then((res) => res.json())
      .then((data) => setSites(data.sites ?? []))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const wage = sanitizeWage(wageInput);
  const result = wage > 0 ? calcDailyNetPay({ dailyWage: wage, includePensionHealth: false }) : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mt-4">
      <h2 className="font-semibold text-[#1e3a5f] mb-3">실수령액 계산기</h2>
      <input
        type="text"
        inputMode="numeric"
        value={wageInput}
        onChange={(e) => setWageInput(e.target.value)}
        placeholder="오늘 일당 (원)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
      />
      {result && (
        <div className="text-sm text-gray-700 space-y-1 mb-4">
          <div className="flex justify-between">
            <span className="text-gray-500">소득세+지방세</span>
            <span>{(result.incomeTax + result.localTax).toLocaleString()}원</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">고용보험료</span>
            <span>{result.employmentInsurance.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between font-semibold text-[#1e3a5f] pt-1 border-t border-gray-100">
            <span>실수령액</span>
            <span>{result.netPay.toLocaleString()}원</span>
          </div>
        </div>
      )}
      {!loading && sites.length > 0 && (
        <div className="pt-3 border-t border-gray-100 space-y-1.5">
          {sites.map((s) => (
            <div key={s.siteId} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                {s.siteName} · 이번 달 {s.workDays}일
              </span>
              {s.employmentInsuranceApplies && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: '#e0f2fe', color: '#0369a1' }}
                >
                  고용보험 적용
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
