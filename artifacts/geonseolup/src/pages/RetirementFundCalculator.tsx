import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  RETIREMENT_FUND_BRACKETS,
  MIN_ELIGIBLE_DAYS,
  calcRetirementFund,
  sanitizeDays,
} from '@/lib/retirementFund';

const ORANGE = '#f97316';
const NAVY = '#1e3a5f';

// 와디즈 스타일의 플랫 일러스트 — 안전모 쓴 돼지저금통 + 동전(사진 대신 벡터, 로딩 가벼움).
function HeroIllustration() {
  return (
    <svg viewBox="0 0 320 200" className="w-full h-auto" role="img" aria-label="퇴직공제금 저금통 일러스트">
      <ellipse cx="160" cy="176" rx="120" ry="14" fill="#1e3a5f" opacity="0.08" />
      {/* 동전들 */}
      <circle cx="70" cy="70" r="16" fill="#fde68a" stroke="#f59e0b" strokeWidth="2.5" />
      <text x="70" y="76" textAnchor="middle" fontSize="15" fontWeight="900" fill="#b45309">₩</text>
      <circle cx="252" cy="56" r="13" fill="#fde68a" stroke="#f59e0b" strokeWidth="2.5" />
      <text x="252" y="61" textAnchor="middle" fontSize="12" fontWeight="900" fill="#b45309">₩</text>
      <circle cx="248" cy="108" r="10" fill="#fde68a" stroke="#f59e0b" strokeWidth="2" />
      {/* 돼지 몸통 */}
      <ellipse cx="160" cy="120" rx="92" ry="58" fill="#f97316" />
      <ellipse cx="160" cy="120" rx="92" ry="58" fill="url(#body-shine)" />
      {/* 다리 */}
      <rect x="100" y="164" width="18" height="20" rx="8" fill="#ea580c" />
      <rect x="202" y="164" width="18" height="20" rx="8" fill="#ea580c" />
      {/* 코 */}
      <ellipse cx="235" cy="122" rx="20" ry="15" fill="#fb923c" />
      <ellipse cx="228" cy="122" rx="4" ry="6" fill="#c2410c" />
      <ellipse cx="242" cy="122" rx="4" ry="6" fill="#c2410c" />
      {/* 귀 */}
      <path d="M195 78 L206 56 L218 80 Z" fill="#ea580c" />
      {/* 눈 */}
      <circle cx="205" cy="108" r="4.5" fill="#1e3a5f" />
      {/* 동전 투입구 */}
      <rect x="140" y="70" width="34" height="7" rx="3.5" fill="#c2410c" />
      {/* 안전모 */}
      <path d="M110 76 Q160 32 208 74 Q160 66 110 76 Z" fill="#1e3a5f" />
      <rect x="122" y="72" width="76" height="10" rx="5" fill="#1e3a5f" />
      <circle cx="160" cy="52" r="5" fill="#f97316" />
      {/* 꼬리 */}
      <path d="M64 132 q-14 -4 -10 -18 q10 4 12 16 Z" fill="#ea580c" />
      <defs>
        <linearGradient id="body-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

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

export default function RetirementFundCalculator() {
  const [daysByBracket, setDaysByBracket] = useState<Record<string, number>>(loadCache);

  useEffect(() => {
    document.title = '건설근로자 퇴직공제금 계산기 — 적립일수로 예상 수령액 확인 | 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '건설 일용직 퇴직공제금, 연도별 적립 단가를 반영해서 예상 적립액을 바로 계산해보세요. 근무 시기별 일수만 입력하면 자동으로 계산됩니다.';
  }, []);

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
    <div className="min-h-screen" style={{ background: '#f8f9fb' }}>
      <Header />
      <main className="max-w-[760px] mx-auto px-4 py-6 sm:py-8">
        {/* 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
          <Link href="/" className="hover:text-[#f97316] no-underline transition-colors">홈</Link>
          <span>›</span>
          <span className="text-gray-600 font-medium">퇴직공제금 계산기</span>
        </div>

        {/* 히어로 */}
        <div className="rounded-2xl overflow-hidden mb-6 px-5 sm:px-8 pt-6" style={{ background: 'linear-gradient(135deg,#fff7ed,#fef3e2)' }}>
          <div className="max-w-[220px] mx-auto">
            <HeroIllustration />
          </div>
          <div className="text-center pb-6 pt-1">
            <h1 className="font-extrabold text-xl sm:text-[26px] leading-tight mb-1.5" style={{ color: NAVY }}>
              건설근로자 퇴직공제금 계산기
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">근무 시기별 일수만 입력하면 예상 적립액을 바로 계산해드려요</p>
          </div>
        </div>

        {/* 설명 박스 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-6 text-[13px] leading-relaxed text-gray-600">
          <p className="mb-1.5">
            건설 현장에서 일하면 사업주가 하루 근무마다 <b style={{ color: NAVY }}>퇴직공제부금</b>을 납부하고, 이 중 근로자 개인 몫(퇴직공제금)이 쌓입니다.
            <b style={{ color: ORANGE }}> 적립일수 {MIN_ELIGIBLE_DAYS}일 이상</b>이면 건설업에서 퇴직할 때 신청해서 받을 수 있어요.
          </p>
          <p className="text-gray-400 text-[12px]">여러 현장을 옮겨다녔어도 공제회가 전부 합산해서 관리하니, 일한 시기별로 나눠서 대략적인 일수만 입력하면 됩니다.</p>
        </div>

        {/* 입력 폼 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-extrabold text-[15px]" style={{ color: NAVY }}>근무 시기별 일수 입력</h2>
            {result.totalDays > 0 && (
              <button type="button" onClick={handleReset} className="text-[11px] text-gray-400 hover:text-[#f97316] cursor-pointer bg-transparent border-none">
                전체 초기화
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            {RETIREMENT_FUND_BRACKETS.map((b) => (
              <div key={b.key} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-gray-800 truncate">{b.label}</p>
                  <p className="text-[11px] text-gray-400">
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
                    className="w-[74px] text-right rounded-lg border border-gray-200 px-2.5 py-2 text-[14px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                  />
                  <span className="text-[12px] text-gray-400">일</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 결과 카드 */}
        <div className="rounded-xl p-5 sm:p-6 mb-5 text-center" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}>
          <p className="text-white/70 text-xs font-bold mb-1.5">총 적립일수 {result.totalDays.toLocaleString('ko-KR')}일 기준 예상 적립액(원금)</p>
          <p className="text-white font-black text-3xl sm:text-[38px] tabular-nums tracking-tight">
            {result.totalAmount.toLocaleString('ko-KR')}<span className="text-lg sm:text-xl font-bold ml-1">원</span>
          </p>
          {result.totalDays > 0 && !result.eligible && (
            <p className="mt-3 inline-block text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/15 text-white">
              적립일수 {MIN_ELIGIBLE_DAYS}일 미만은 원칙적으로 수급 대상이 아니에요 (앞으로 {(MIN_ELIGIBLE_DAYS - result.totalDays).toLocaleString('ko-KR')}일 더 필요)
            </p>
          )}
          {result.eligible && (
            <p className="mt-3 inline-block text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/15 text-white">
              {MIN_ELIGIBLE_DAYS}일 이상 적립 — 수급 요건 충족
            </p>
          )}
        </div>

        {/* 구간별 내역 (입력한 것만 표시) */}
        {result.breakdown.some((r) => r.days > 0) && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-5">
            <h3 className="text-[13px] font-extrabold text-gray-700 mb-3">기간별 내역</h3>
            <div className="flex flex-col gap-2">
              {result.breakdown.filter((r) => r.days > 0).map((r) => (
                <div key={r.key} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-gray-500">{r.label} · {r.days.toLocaleString('ko-KR')}일 × {r.rate.toLocaleString('ko-KR')}원</span>
                  <span className="font-bold text-gray-700 tabular-nums">{r.amount.toLocaleString('ko-KR')}원</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 유의사항 */}
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 sm:p-5 mb-6 text-[11.5px] leading-relaxed text-gray-500">
          <p className="font-bold text-gray-600 mb-1.5">참고용 추정치입니다</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>실제 단가는 그 현장이 <b>입찰공고를 낸 시점</b> 기준으로 정해져 근무 기간 내내 유지됩니다. 계산기는 연도별 표준 인상 단가로 근사 계산한 것이라, 오래전 단가가 그대로인 현장에서 일했다면 실제 금액과 차이가 날 수 있어요.</li>
            <li>이 금액은 <b>이자를 포함하지 않은 원금</b>입니다. 실제로는 매달 이자가 복리로 더해져 여기 나온 금액보다 많을 수 있습니다.</li>
            <li>정확한 적립일수·금액은 건설근로자공제회 앱(m.cwma.or.kr) 또는 <b>1666-1133</b>으로 확인할 수 있어요.</li>
          </ul>
        </div>

        {/* 구인 목록 CTA */}
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
