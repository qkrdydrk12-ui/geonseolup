import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  RETIREMENT_FUND_BRACKETS,
  MIN_ELIGIBLE_DAYS,
  calcRetirementFund,
  sanitizeDays,
} from '@/lib/retirementFund';

const ORANGE = '#f97316';
const NAVY = '#1e3a5f';

function loadCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem('cj_retirement_fund_calc');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 퇴직공제금 계산기 — 재사용 가능한 위젯 버전.
 * RetirementFundCalculator.tsx(전체 페이지)와 블로그 글 인라인 삽입(InfoDetail.tsx) 둘 다에서 쓴다.
 * Header/Footer/브레드크럼 등 페이지 전체 레이아웃은 포함하지 않는다 — 순수 계산기 UI만.
 */
export default function RetirementFundCalculatorWidget() {
  const [daysByBracket, setDaysByBracket] = useState<Record<string, number>>(loadCache);

  useEffect(() => {
    try { localStorage.setItem('cj_retirement_fund_calc', JSON.stringify(daysByBracket)); } catch { /* noop */ }
  }, [daysByBracket]);

  const result = useMemo(() => calcRetirementFund(daysByBracket), [daysByBracket]);

  function handleChange(key: string, raw: string) {
    setDaysByBracket((prev) => ({ ...prev, [key]: sanitizeDays(raw) }));
  }

  function handleReset() {
    setDaysByBracket({});
  }

  return (
    <div className="rounded-2xl border-2 p-4 sm:p-5" style={{ borderColor: '#fed7aa', background: '#fffaf5' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🧮</span>
        <h3 className="font-extrabold text-[15px] sm:text-base" style={{ color: NAVY }}>내 퇴직공제금 직접 계산해보기</h3>
      </div>
      <p className="text-[12px] text-gray-500 mb-4">근무 시기별 일수만 넣으면 예상 적립액이 바로 나와요.</p>

      {/* 입력 폼 */}
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12.5px] font-bold text-gray-700">근무 시기별 일수 입력</span>
          {result.totalDays > 0 && (
            <button type="button" onClick={handleReset} className="text-[11px] text-gray-400 hover:text-[#f97316] cursor-pointer bg-transparent border-none">
              전체 초기화
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {RETIREMENT_FUND_BRACKETS.map((b) => (
            <div key={b.key} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold text-gray-800 truncate">{b.label}</p>
                <p className="text-[10.5px] text-gray-400">
                  {b.sublabel ? `${b.sublabel} · ` : ''}일당 {b.rate.toLocaleString('ko-KR')}원
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={20000}
                  placeholder="0"
                  value={daysByBracket[b.key] || ''}
                  onChange={(e) => handleChange(b.key, e.target.value)}
                  className="w-[68px] text-right rounded-lg border border-gray-200 px-2 py-1.5 text-[13px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                />
                <span className="text-[11px] text-gray-400">일</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 결과 카드 */}
      <div className="rounded-xl p-4 sm:p-5 mb-4 text-center" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}>
        <p className="text-white/70 text-[11px] font-bold mb-1">총 적립일수 {result.totalDays.toLocaleString('ko-KR')}일 기준 예상 적립액(원금)</p>
        <p className="text-white font-black text-2xl sm:text-[30px] tabular-nums tracking-tight">
          {result.totalAmount.toLocaleString('ko-KR')}<span className="text-base sm:text-lg font-bold ml-1">원</span>
        </p>
        {result.totalDays > 0 && !result.eligible && (
          <p className="mt-2.5 inline-block text-[10.5px] font-bold px-3 py-1.5 rounded-full bg-white/15 text-white">
            적립일수 {MIN_ELIGIBLE_DAYS}일 미만은 원칙적으로 수급 대상이 아니에요 (앞으로 {(MIN_ELIGIBLE_DAYS - result.totalDays).toLocaleString('ko-KR')}일 더 필요)
          </p>
        )}
        {result.eligible && (
          <p className="mt-2.5 inline-block text-[10.5px] font-bold px-3 py-1.5 rounded-full bg-white/15 text-white">
            {MIN_ELIGIBLE_DAYS}일 이상 적립 — 수급 요건 충족
          </p>
        )}
      </div>

      {/* 구간별 내역 (입력한 것만 표시) */}
      {result.breakdown.some((r) => r.days > 0) && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 mb-1">
          <h4 className="text-[12px] font-extrabold text-gray-700 mb-2">기간별 내역</h4>
          <div className="flex flex-col gap-1.5">
            {result.breakdown.filter((r) => r.days > 0).map((r) => (
              <div key={r.key} className="flex items-center justify-between text-[12px]">
                <span className="text-gray-500">{r.label} · {r.days.toLocaleString('ko-KR')}일 × {r.rate.toLocaleString('ko-KR')}원</span>
                <span className="font-bold text-gray-700 tabular-nums">{r.amount.toLocaleString('ko-KR')}원</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10.5px] text-gray-400 mt-3 leading-relaxed">
        참고용 추정치예요(이자 미포함 원금). 정확한 적립일수·금액은 건설근로자공제회 앱(m.cwma.or.kr) 또는 1666-1133으로 확인하세요.
        {' '}
        <Link href="/retirement-fund-calculator" className="font-bold no-underline" style={{ color: ORANGE }}>
          전체 화면으로 보기 →
        </Link>
      </p>
    </div>
  );
}
