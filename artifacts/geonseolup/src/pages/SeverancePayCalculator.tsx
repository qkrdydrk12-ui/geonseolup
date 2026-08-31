import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  analyzeContinuity,
  calcSeverance,
  estimateRecentCalendarDays,
  sanitizeAmount,
  sanitizeCalendarDays,
  todayStr,
  type WorkPeriod,
  type GapSeverity,
} from '@/lib/severancePay';

const ORANGE = '#f97316';
const NAVY = '#1e3a5f';

const GAP_LABEL: Record<GapSeverity, string> = {
  none: '',
  safe: '공백 짧음 — 계속근로로 볼 여지 있음',
  ambiguous: '공백 애매함 — 사안에 따라 다름',
  broken: '공백 긺 — 계속근로 인정 어려울 수 있음',
};
const GAP_COLOR: Record<GapSeverity, string> = {
  none: '#9ca3af',
  safe: '#16a34a',
  ambiguous: '#d97706',
  broken: '#dc2626',
};

// 계속근로(달력 두 칸이 사슬로 이어진 모습) + 안전모 + 퇴직금 봉투 일러스트.
// 앞의 두 계산기(돼지저금통, 계산기+영수증)와 구분되는 세 번째 벡터 일러스트.
function HeroIllustration() {
  return (
    <svg viewBox="0 0 320 200" className="w-full h-auto" role="img" aria-label="계속근로 달력과 퇴직금 봉투 일러스트">
      <ellipse cx="160" cy="180" rx="118" ry="12" fill="#1e3a5f" opacity="0.08" />
      {/* 달력 2장 (계속근로 = 이어진 기간) */}
      <rect x="46" y="88" width="76" height="70" rx="8" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
      <rect x="46" y="88" width="76" height="20" rx="8" fill="#1e3a5f" />
      <rect x="60" y="80" width="6" height="16" rx="3" fill="#1e3a5f" />
      <rect x="104" y="80" width="6" height="16" rx="3" fill="#1e3a5f" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={`a${r}-${c}`} x={56 + c * 15} y={118 + r * 12} width="9" height="7" rx="2" fill="#e2e8f0" />
        )),
      )}

      <rect x="198" y="88" width="76" height="70" rx="8" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
      <rect x="198" y="88" width="76" height="20" rx="8" fill="#f97316" />
      <rect x="212" y="80" width="6" height="16" rx="3" fill="#f97316" />
      <rect x="256" y="80" width="6" height="16" rx="3" fill="#f97316" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={`b${r}-${c}`} x={208 + c * 15} y={118 + r * 12} width="9" height="7" rx="2" fill="#fed7aa" />
        )),
      )}

      {/* 사슬(계속근로 연결) */}
      <circle cx="139" cy="120" r="9" fill="none" stroke="#f97316" strokeWidth="5" />
      <circle cx="160" cy="120" r="9" fill="none" stroke="#1e3a5f" strokeWidth="5" />
      <circle cx="181" cy="120" r="9" fill="none" stroke="#f97316" strokeWidth="5" />

      {/* 안전모 (왼쪽 달력 위) */}
      <path d="M60 90 Q84 62 108 88 Q84 82 60 90 Z" fill="#1e3a5f" />
      <rect x="68" y="87" width="32" height="8" rx="4" fill="#1e3a5f" />

      {/* 동전 */}
      <circle cx="252" cy="172" r="13" fill="#fde68a" stroke="#f59e0b" strokeWidth="2.5" />
      <text x="252" y="177" textAnchor="middle" fontSize="13" fontWeight="900" fill="#b45309">₩</text>
      <circle cx="68" cy="170" r="10" fill="#fde68a" stroke="#f59e0b" strokeWidth="2" />
    </svg>
  );
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function loadCache(): { periods: WorkPeriod[]; recentWageTotal: number; recentCalendarDays: number } {
  try {
    const raw = localStorage.getItem('cj_severance_calc');
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.periods) || parsed.periods.length === 0) return defaultState();
    return {
      periods: parsed.periods,
      recentWageTotal: sanitizeAmount(parsed.recentWageTotal),
      recentCalendarDays: sanitizeCalendarDays(parsed.recentCalendarDays),
    };
  } catch {
    return defaultState();
  }
}

function defaultState() {
  return {
    periods: [{ id: makeId(), label: '현장 1', startDate: '', endDate: '' }] as WorkPeriod[],
    recentWageTotal: 0,
    recentCalendarDays: 0,
  };
}

export default function SeverancePayCalculator() {
  const cached = loadCache();
  const [periods, setPeriods] = useState<WorkPeriod[]>(cached.periods);
  const [recentWageTotal, setRecentWageTotal] = useState<number>(cached.recentWageTotal);
  const [recentCalendarDays, setRecentCalendarDays] = useState<number>(cached.recentCalendarDays);

  useEffect(() => {
    document.title = '건설 일용직 퇴직금 계산기 — 계속근로 인정 가능성까지 확인 | 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '건설 일용직은 근무 구간이 끊겨 있어도 계속근로로 인정되면 퇴직금 대상이 될 수 있어요. 여러 근무 구간을 입력하면 공백 기간을 분석해 계속근로 인정 가능성과 예상 퇴직금을 함께 계산해드립니다.';
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cj_severance_calc', JSON.stringify({ periods, recentWageTotal, recentCalendarDays }));
    } catch { /* noop */ }
  }, [periods, recentWageTotal, recentCalendarDays]);

  const continuity = useMemo(() => analyzeContinuity(periods), [periods]);

  const lastEndDate = useMemo(() => {
    const withDates = continuity.sortedPeriods;
    if (withDates.length === 0) return '';
    const last = withDates[withDates.length - 1];
    return last.endDate || todayStr();
  }, [continuity.sortedPeriods]);

  const suggestedCalendarDays = useMemo(
    () => (lastEndDate ? estimateRecentCalendarDays(lastEndDate) : 0),
    [lastEndDate],
  );

  const result = useMemo(
    () => calcSeverance({
      recentWageTotal,
      recentCalendarDays: recentCalendarDays || suggestedCalendarDays,
      spanDays: continuity.spanDays,
    }),
    [recentWageTotal, recentCalendarDays, suggestedCalendarDays, continuity.spanDays],
  );

  function addPeriod() {
    setPeriods((prev) => [...prev, { id: makeId(), label: `현장 ${prev.length + 1}`, startDate: '', endDate: '' }]);
  }
  function updatePeriod(id: string, patch: Partial<WorkPeriod>) {
    setPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function removePeriod(id: string) {
    setPeriods((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }

  const overallBadge = (() => {
    if (continuity.spanDays === 0) return null;
    if (!continuity.eligible1Year) {
      return { text: `계속근로 ${continuity.spanDays.toLocaleString('ko-KR')}일 — 1년(365일) 미만`, color: '#6b7280' };
    }
    if (continuity.worstGapSeverity === 'none' || continuity.worstGapSeverity === 'safe') {
      return { text: '1년 이상 + 공백 없음/짧음 — 퇴직금 대상 가능성 높음', color: '#16a34a' };
    }
    if (continuity.worstGapSeverity === 'ambiguous') {
      return { text: '1년 이상이지만 공백이 애매함 — 노무사 상담 권장', color: '#d97706' };
    }
    return { text: '공백이 길어 계속근로 인정이 어려울 수 있음', color: '#dc2626' };
  })();

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fb' }}>
      <Header />
      <main className="max-w-[760px] mx-auto px-4 py-6 sm:py-8">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
          <Link href="/" className="hover:text-[#f97316] no-underline transition-colors">홈</Link>
          <span>›</span>
          <span className="text-gray-600 font-medium">퇴직금 계산기</span>
        </div>

        <div className="rounded-2xl overflow-hidden mb-6 px-5 sm:px-8 pt-6" style={{ background: 'linear-gradient(135deg,#fff7ed,#fef3e2)' }}>
          <div className="max-w-[220px] mx-auto">
            <HeroIllustration />
          </div>
          <div className="text-center pb-6 pt-1">
            <h1 className="font-extrabold text-xl sm:text-[26px] leading-tight mb-1.5" style={{ color: NAVY }}>
              건설 일용직 퇴직금 계산기
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">근무 구간을 나눠 입력하면 계속근로 인정 가능성까지 함께 확인해드려요</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-6 text-[13px] leading-relaxed text-gray-600">
          <p className="mb-1.5">
            일용직은 원칙적으로 매일 새 근로계약을 맺는 형태라 퇴직금 대상이 아니지만,
            <b style={{ color: ORANGE }}> 같은 회사에서 사실상 끊김 없이 계속 근로</b>했다면(계속근로기간 1년 이상)
            예외적으로 퇴직금을 청구할 수 있어요.
          </p>
          <p className="text-gray-400 text-[12px]">일반 계산기처럼 입사일 하나만 받지 않고, 쉬었던 기간까지 구간별로 입력받아서 공백이 계속근로 인정에 문제없는 수준인지 같이 보여드립니다.</p>
        </div>

        {/* 근무 구간 입력 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-extrabold text-[15px]" style={{ color: NAVY }}>같은 회사(원청) 근무 구간</h2>
          </div>
          <p className="text-[11.5px] text-gray-400 mb-3">현장이 바뀌어도 같은 회사 소속이었다면 하나로, 회사가 바뀌었으면 구간을 나눠 입력하세요</p>

          <div className="flex flex-col gap-2.5 mb-3">
            {periods.map((p, idx) => (
              <div key={p.id}>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={p.label}
                      onChange={(e) => updatePeriod(p.id, { label: e.target.value })}
                      className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] font-bold text-gray-700 focus:outline-none focus:border-[#f97316]"
                    />
                    {periods.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePeriod(p.id)}
                        className="shrink-0 w-7 h-7 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 cursor-pointer text-sm"
                        aria-label="삭제"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={p.startDate}
                      onChange={(e) => updatePeriod(p.id, { startDate: e.target.value })}
                      className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-[12.5px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                    />
                    <span className="text-[11px] text-gray-400 shrink-0">~</span>
                    <input
                      type="date"
                      value={p.endDate}
                      placeholder="근무 중"
                      onChange={(e) => updatePeriod(p.id, { endDate: e.target.value })}
                      className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-[12.5px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <p className="text-[10.5px] text-gray-400 mt-1">비워두면 오늘까지 근무 중인 것으로 계산해요</p>
                </div>
                {idx < continuity.gaps.length && continuity.gaps[idx].days > 0 && (
                  <div className="flex items-center gap-1.5 py-1.5 pl-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GAP_COLOR[continuity.gaps[idx].severity] }} />
                    <span className="text-[11px] font-bold" style={{ color: GAP_COLOR[continuity.gaps[idx].severity] }}>
                      공백 {continuity.gaps[idx].days.toLocaleString('ko-KR')}일 — {GAP_LABEL[continuity.gaps[idx].severity]}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addPeriod}
            className="w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-[12.5px] font-bold text-gray-500 hover:border-[#f97316] hover:text-[#f97316] cursor-pointer bg-transparent"
          >
            + 근무 구간 추가
          </button>
        </div>

        {overallBadge && (
          <div className="rounded-xl p-4 mb-5 text-center" style={{ background: `${overallBadge.color}14` }}>
            <p className="text-[13px] font-extrabold" style={{ color: overallBadge.color }}>{overallBadge.text}</p>
          </div>
        )}

        {/* 평균임금 입력 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-5">
          <h2 className="font-extrabold text-[15px] mb-1" style={{ color: NAVY }}>최근 3개월 평균임금</h2>
          <p className="text-[11.5px] text-gray-400 mb-3">월급이 아니라 최근 3개월간 실제로 받은 금액을 기준으로 계산해요</p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-gray-500 w-[104px] shrink-0">최근 3개월 총액</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="예: 9000000"
                value={recentWageTotal || ''}
                onChange={(e) => setRecentWageTotal(sanitizeAmount(e.target.value))}
                className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] font-bold text-gray-800 text-right focus:outline-none focus:border-[#f97316]"
              />
              <span className="text-[12px] text-gray-400 shrink-0">원</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-gray-500 w-[104px] shrink-0">그 기간 달력일수</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder={suggestedCalendarDays ? String(suggestedCalendarDays) : '예: 90'}
                value={recentCalendarDays || ''}
                onChange={(e) => setRecentCalendarDays(sanitizeCalendarDays(e.target.value))}
                className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] font-bold text-gray-800 text-right focus:outline-none focus:border-[#f97316]"
              />
              <span className="text-[12px] text-gray-400 shrink-0">일</span>
            </div>
            {suggestedCalendarDays > 0 && (
              <p className="text-[11px] text-gray-400">마지막 근무일 기준 최근 3개월은 약 {suggestedCalendarDays}일이에요(비워두면 자동 적용)</p>
            )}
          </div>
        </div>

        {/* 결과 카드 */}
        <div className="rounded-xl p-5 sm:p-6 mb-5 text-center" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}>
          <p className="text-white/70 text-xs font-bold mb-1.5">계속근로 {continuity.spanDays.toLocaleString('ko-KR')}일 기준 예상 퇴직금</p>
          <p className="text-white font-black text-3xl sm:text-[38px] tabular-nums tracking-tight">
            {result.severancePay.toLocaleString('ko-KR')}<span className="text-lg sm:text-xl font-bold ml-1">원</span>
          </p>
          {result.averageDailyWage > 0 && (
            <p className="mt-3 inline-block text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/15 text-white">
              평균임금(1일) {result.averageDailyWage.toLocaleString('ko-KR')}원 × 30일 × (재직일수÷365)
            </p>
          )}
        </div>

        {/* 유의사항 */}
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 sm:p-5 mb-6 text-[11.5px] leading-relaxed text-gray-500">
          <p className="font-bold text-gray-600 mb-1.5">참고용 추정치입니다</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>일용직의 계속근로 인정 여부는 실제로는 사업주가 같은지, 업무 지시 체계가 같은지 등을 종합적으로 따져 사안별로 다르게 판단됩니다. 공백 일수 기준(30일/90일)은 참고용 경험칙이지 법에 정해진 숫자가 아니에요.</li>
            <li>4주 평균 1주 소정근로시간이 15시간 이상이어야 하는 요건은 별도로 충족해야 하며(통상 풀타임 일용은 해당), 이 계산기는 이 조건을 별도로 검증하지 않습니다.</li>
            <li>퇴직금을 실제로 청구하려면 근로계약서, 출근 기록, 급여 지급 내역 등 계속근로를 뒷받침할 증빙을 모아두는 게 중요해요.</li>
            <li>정확한 판단은 가까운 고용노동청 또는 공인노무사 상담을 통해 확인하세요.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 mb-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-[12.5px] text-gray-500">다른 계산기도 확인해보세요</span>
          <div className="flex items-center gap-3">
            <Link href="/net-pay-calculator" className="text-[12.5px] font-bold no-underline" style={{ color: ORANGE }}>
              실수령액 계산기 →
            </Link>
            <Link href="/retirement-fund-calculator" className="text-[12.5px] font-bold no-underline" style={{ color: ORANGE }}>
              퇴직공제금 계산기 →
            </Link>
          </div>
        </div>

        <div
          className="rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
          style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
        >
          <div className="text-white flex-1">
            <p className="font-bold text-sm mb-0.5">지금 바로 건설 일자리를 찾아보세요</p>
            <p className="text-xs text-white/70">전국 건설 현장 실시간 구인 정보</p>
          </div>
          <Link
            href="/"
            className="shrink-0 px-4 py-2 rounded-lg text-xs font-extrabold no-underline transition-colors hover:opacity-90"
            style={{ background: '#f97316', color: '#fff' }}
          >
            구인 목록 보기 →
          </Link>
        </div>

        <div className="text-center mt-5">
          <Link href="/" className="text-sm text-gray-500 hover:text-[#f97316] transition-colors no-underline">
            ← 홈으로 돌아가기
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
