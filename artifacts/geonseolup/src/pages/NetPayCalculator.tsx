import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { fbLoadPublicJobs, type Job } from '@/lib/firebase';
import {
  calcDailyNetPay,
  calcMonthlySummary,
  calcGrossFromGongsu,
  sanitizeWage,
  sanitizeDays,
  sanitizeGongsu,
  type MonthlyWorkEntry,
} from '@/lib/dailyNetPay';

const ORANGE = '#f97316';
const NAVY = '#1e3a5f';

// 직종별 평균 일당 비교에 쓰는 목록 — Home.tsx의 DEFAULT_JOBS 중 실제 "직종"에 해당하는 것만
// 골라 별도로 유지한다(관리 항목 등은 일당 비교 의미가 약해 제외).
const JOB_TYPE_OPTIONS = [
  '조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비',
  '화기감시자', '유도원', '양중', '덕트', '비계', '포설', '보온', '안전시설반',
];

// 계산기+영수증 일러스트 — 안전모 쓴 계산기가 "실수령액" 영수증을 뽑아내는 모습.
// 앞의 퇴직공제금 계산기(돼지저금통)와 구분되는 벡터 일러스트, 사진 대신 가벼운 SVG.
function HeroIllustration() {
  return (
    <svg viewBox="0 0 320 200" className="w-full h-auto" role="img" aria-label="안전모 쓴 계산기와 급여 영수증 일러스트">
      <ellipse cx="160" cy="180" rx="118" ry="12" fill="#1e3a5f" opacity="0.08" />
      {/* 영수증 종이 (계산기 위로 말려나오는 형태) */}
      <path d="M124 44 L196 44 L196 108 L188 100 L180 108 L172 100 L164 108 L156 100 L148 108 L140 100 L132 108 L124 100 Z" fill="#fff" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="134" y="54" width="52" height="4" rx="2" fill="#fdba74" />
      <rect x="134" y="64" width="38" height="4" rx="2" fill="#e2e8f0" />
      <rect x="134" y="74" width="44" height="4" rx="2" fill="#e2e8f0" />
      <rect x="134" y="86" width="30" height="6" rx="3" fill="#f97316" />
      {/* 계산기 몸체 */}
      <rect x="86" y="96" width="148" height="84" rx="14" fill="#1e3a5f" />
      <rect x="100" y="108" width="120" height="26" rx="6" fill="#0f2440" />
      <text x="160" y="127" textAnchor="middle" fontSize="15" fontWeight="800" fill="#4ade80" fontFamily="monospace">₩ NET</text>
      {/* 버튼 그리드 */}
      {[0, 1, 2, 3].map((col) =>
        [0, 1, 2].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={100 + col * 30}
            y={144 + row * 12}
            width="22"
            height="8"
            rx="3"
            fill={col === 3 && row === 2 ? ORANGE : '#33507a'}
          />
        )),
      )}
      {/* 안전모 (계산기 위에 살짝 걸쳐진 모습) */}
      <path d="M96 100 Q160 58 224 98 Q160 90 96 100 Z" fill="#f97316" />
      <rect x="112" y="96" width="76" height="9" rx="4.5" fill="#f97316" />
      <circle cx="160" cy="76" r="4.5" fill="#1e3a5f" />
      {/* 동전 */}
      <circle cx="252" cy="150" r="15" fill="#fde68a" stroke="#f59e0b" strokeWidth="2.5" />
      <text x="252" y="156" textAnchor="middle" fontSize="14" fontWeight="900" fill="#b45309">₩</text>
      <circle cx="66" cy="150" r="11" fill="#fde68a" stroke="#f59e0b" strokeWidth="2" />
    </svg>
  );
}

function loadCoreCache(): { dailyWage: number; gongsu: number; includePensionHealth: boolean } {
  try {
    const raw = localStorage.getItem('cj_net_pay_calc');
    if (!raw) return { dailyWage: 0, gongsu: 1, includePensionHealth: false };
    const parsed = JSON.parse(raw);
    return {
      dailyWage: sanitizeWage(parsed?.dailyWage),
      gongsu: parsed?.gongsu ? sanitizeGongsu(parsed.gongsu) : 1,
      includePensionHealth: !!parsed?.includePensionHealth,
    };
  } catch {
    return { dailyWage: 0, gongsu: 1, includePensionHealth: false };
  }
}

function makeEntryId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function NetPayCalculator() {
  const cached = loadCoreCache();
  const [dailyWage, setDailyWage] = useState<number>(cached.dailyWage);
  const [gongsu, setGongsu] = useState<number>(cached.gongsu);
  const [includePensionHealth, setIncludePensionHealth] = useState<boolean>(cached.includePensionHealth);
  const [entries, setEntries] = useState<MonthlyWorkEntry[]>([]);
  const [compareJob, setCompareJob] = useState<string>('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);

  useEffect(() => {
    document.title = '건설 일용직 실수령액 계산기 — 일당 세금·4대보험 공제 후 금액 확인 | 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '형틀·철근·용접·조공 등 건설 일용직 일당 실수령액을 바로 계산하세요. 일용근로소득세, 지방소득세, 고용보험까지 반영하고 여러 현장 합산·직종별 평균 일당 비교까지 됩니다.';
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cj_net_pay_calc', JSON.stringify({ dailyWage, gongsu, includePensionHealth }));
    } catch { /* noop */ }
  }, [dailyWage, gongsu, includePensionHealth]);

  useEffect(() => {
    let cancelled = false;
    fbLoadPublicJobs().then((list) => {
      if (!cancelled) {
        setJobs(list);
        setJobsLoaded(true);
      }
    }).catch(() => setJobsLoaded(true));
    return () => { cancelled = true; };
  }, []);

  const grossWage = useMemo(() => calcGrossFromGongsu(dailyWage, gongsu), [dailyWage, gongsu]);

  const result = useMemo(
    () => calcDailyNetPay({ dailyWage: grossWage, includePensionHealth }),
    [grossWage, includePensionHealth],
  );

  const monthly = useMemo(
    () => calcMonthlySummary(entries, includePensionHealth),
    [entries, includePensionHealth],
  );

  const jobAverage = useMemo(() => {
    if (!compareJob) return null;
    const matched = jobs.filter((j) => j.job === compareJob && typeof j.salaryNum === 'number' && j.salaryNum! > 0);
    if (matched.length === 0) return null;
    const sum = matched.reduce((acc, j) => acc + (j.salaryNum || 0), 0);
    return { avg: Math.round(sum / matched.length), count: matched.length };
  }, [compareJob, jobs]);

  function addEntry() {
    setEntries((prev) => [...prev, { id: makeEntryId(), label: `현장 ${prev.length + 1}`, dailyWage: 0, gongsu: 1, days: 0 }]);
  }
  function updateEntry(id: string, patch: Partial<MonthlyWorkEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fb' }}>
      <Header />
      <main className="max-w-[760px] mx-auto px-4 py-6 sm:py-8">
        {/* 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
          <Link href="/" className="hover:text-[#f97316] no-underline transition-colors">홈</Link>
          <span>›</span>
          <span className="text-gray-600 font-medium">실수령액 계산기</span>
        </div>

        {/* 히어로 */}
        <div className="rounded-2xl overflow-hidden mb-6 px-5 sm:px-8 pt-6" style={{ background: 'linear-gradient(135deg,#fff7ed,#fef3e2)' }}>
          <div className="max-w-[220px] mx-auto">
            <HeroIllustration />
          </div>
          <div className="text-center pb-6 pt-1">
            <h1 className="font-extrabold text-xl sm:text-[26px] leading-tight mb-1.5" style={{ color: NAVY }}>
              건설 일용직 실수령액 계산기
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">일당만 입력하면 세금·보험 공제 후 진짜 받는 돈을 바로 계산해드려요</p>
          </div>
        </div>

        {/* 설명 박스 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-6 text-[13px] leading-relaxed text-gray-600">
          <p className="mb-1.5">
            일반 월급 실수령액 계산기는 정규직 기준이라 <b style={{ color: NAVY }}>건설 일용직</b>과는 원천징수 방식이 달라요.
            일용근로소득은 <b style={{ color: ORANGE }}>1일 15만원까지 비과세</b>가 적용되고, 세액공제 55%까지 반영해서 계산합니다.
          </p>
          <p className="text-gray-400 text-[12px]">국민연금·건강보험은 보통 월 8일 미만·1개월 미만 단기 근무면 가입 대상이 아니에요. 한 현장에서 1개월 이상 계속 일할 예정이면 아래 토글을 켜주세요.</p>
        </div>

        {/* 입력 폼 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-5">
          <h2 className="font-extrabold text-[15px] mb-1" style={{ color: NAVY }}>1공수 단가 × 오늘 공수</h2>
          <p className="text-[11.5px] text-gray-400 mb-3">특근·연장으로 1.2공수, 1.5공수처럼 받았다면 그대로 입력하세요</p>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="예: 180000"
              value={dailyWage || ''}
              onChange={(e) => setDailyWage(sanitizeWage(e.target.value))}
              className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3.5 py-3 text-[16px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
            />
            <span className="text-[13px] text-gray-400 shrink-0">원 ×</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={5}
              step={0.1}
              placeholder="1"
              value={gongsu === 1 ? '1' : gongsu || ''}
              onChange={(e) => setGongsu(sanitizeGongsu(e.target.value))}
              className="w-[64px] shrink-0 rounded-lg border border-gray-200 px-2 py-3 text-[16px] font-bold text-gray-800 text-right focus:outline-none focus:border-[#f97316]"
            />
            <span className="text-[13px] text-gray-400 shrink-0">공수</span>
          </div>
          {dailyWage > 0 && gongsu !== 1 && (
            <p className="text-[11.5px] text-gray-400 mb-2">→ 오늘 세전 급여 {grossWage.toLocaleString('ko-KR')}원</p>
          )}
          <label className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3 cursor-pointer select-none mt-2">
            <input
              type="checkbox"
              checked={includePensionHealth}
              onChange={(e) => setIncludePensionHealth(e.target.checked)}
              className="w-4 h-4 accent-[#f97316]"
            />
            <span className="text-[12.5px] text-gray-600">이 현장에서 <b>1개월 이상, 월 8일 이상</b> 계속 일할 예정이에요 (국민연금·건강보험 포함 계산)</span>
          </label>
        </div>

        {/* 결과 카드 */}
        <div className="rounded-xl p-5 sm:p-6 mb-5 text-center" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}>
          <p className="text-white/70 text-xs font-bold mb-1.5">일당 {result.dailyWage.toLocaleString('ko-KR')}원 기준 실수령액</p>
          <p className="text-white font-black text-3xl sm:text-[38px] tabular-nums tracking-tight">
            {result.netPay.toLocaleString('ko-KR')}<span className="text-lg sm:text-xl font-bold ml-1">원</span>
          </p>
          {result.dailyWage > 0 && (
            <p className="mt-3 inline-block text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/15 text-white">
              공제액 합계 {result.totalDeduction.toLocaleString('ko-KR')}원
            </p>
          )}
        </div>

        {/* 공제 내역 */}
        {result.dailyWage > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-5">
            <h3 className="text-[13px] font-extrabold text-gray-700 mb-3">공제 내역</h3>
            <div className="flex flex-col gap-2">
              {[
                { label: '소득세', value: result.incomeTax },
                { label: '지방소득세', value: result.localTax },
                { label: '고용보험(근로자 부담)', value: result.employmentInsurance },
                ...(includePensionHealth ? [
                  { label: '국민연금(근로자 부담)', value: result.nationalPension },
                  { label: '건강보험(근로자 부담)', value: result.healthInsurance },
                  { label: '장기요양보험료', value: result.longTermCare },
                ] : []),
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="font-bold text-gray-700 tabular-nums">-{row.value.toLocaleString('ko-KR')}원</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 직종별 평균 일당 비교 — 자사 실시간 구인공고 데이터 기반, 다른 계산기엔 없는 기능 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-5">
          <h3 className="text-[13px] font-extrabold text-gray-700 mb-1">직종별 평균 일당과 비교</h3>
          <p className="text-[11.5px] text-gray-400 mb-3">건설UP에 지금 등록된 실제 구인 공고 기준으로 비교해드려요</p>
          <select
            value={compareJob}
            onChange={(e) => setCompareJob(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[13px] font-bold text-gray-700 focus:outline-none focus:border-[#f97316] bg-white mb-2"
          >
            <option value="">직종 선택 안 함</option>
            {JOB_TYPE_OPTIONS.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          {compareJob && jobsLoaded && jobAverage && (
            <div className="rounded-lg bg-orange-50 px-3.5 py-3 text-[12.5px] text-gray-700">
              현재 등록된 <b style={{ color: ORANGE }}>{compareJob}</b> 공고 {jobAverage.count}건 평균 일당은{' '}
              <b className="tabular-nums">{jobAverage.avg.toLocaleString('ko-KR')}원</b>이에요.
              {dailyWage > 0 && (
                <> 입력하신 1공수 단가는 평균보다{' '}
                  <b style={{ color: dailyWage >= jobAverage.avg ? '#16a34a' : '#dc2626' }}>
                    {Math.abs(dailyWage - jobAverage.avg).toLocaleString('ko-KR')}원 {dailyWage >= jobAverage.avg ? '높아요' : '낮아요'}
                  </b>.
                </>
              )}
            </div>
          )}
          {compareJob && jobsLoaded && !jobAverage && (
            <p className="text-[12px] text-gray-400">지금은 {compareJob} 직종의 일당 정보가 있는 공고가 없어요.</p>
          )}
        </div>

        {/* 이번달 실수령액 합산 — 여러 현장을 옮겨 다니는 일용직 특성 반영 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[13px] font-extrabold text-gray-700">이번달 실수령액 합산</h3>
            {entries.length > 0 && (
              <button type="button" onClick={() => setEntries([])} className="text-[11px] text-gray-400 hover:text-[#f97316] cursor-pointer bg-transparent border-none">
                전체 초기화
              </button>
            )}
          </div>
          <p className="text-[11.5px] text-gray-400 mb-3">한 달에 여러 현장을 다녔다면 현장별로 나눠서 더해보세요</p>

          <div className="flex flex-col gap-2.5 mb-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={entry.label}
                    onChange={(e) => updateEntry(entry.id, { label: e.target.value })}
                    className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] font-bold text-gray-700 focus:outline-none focus:border-[#f97316]"
                  />
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="shrink-0 w-7 h-7 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 cursor-pointer text-sm"
                    aria-label="삭제"
                  >
                    ×
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="1공수 단가"
                    value={entry.dailyWage || ''}
                    onChange={(e) => updateEntry(entry.id, { dailyWage: sanitizeWage(e.target.value) })}
                    className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-[12.5px] font-bold text-gray-800 text-right focus:outline-none focus:border-[#f97316]"
                  />
                  <span className="text-[10.5px] text-gray-400 shrink-0">원×</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={5}
                    step={0.1}
                    placeholder="1"
                    value={entry.gongsu === 1 ? '1' : entry.gongsu || ''}
                    onChange={(e) => updateEntry(entry.id, { gongsu: sanitizeGongsu(e.target.value) })}
                    className="w-[42px] shrink-0 rounded-lg border border-gray-200 px-1.5 py-2 text-[12.5px] font-bold text-gray-800 text-right focus:outline-none focus:border-[#f97316]"
                  />
                  <span className="text-[10.5px] text-gray-400 shrink-0">공수×</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={31}
                    placeholder="일수"
                    value={entry.days || ''}
                    onChange={(e) => updateEntry(entry.id, { days: sanitizeDays(e.target.value) })}
                    className="w-[46px] shrink-0 rounded-lg border border-gray-200 px-1.5 py-2 text-[12.5px] font-bold text-gray-800 text-right focus:outline-none focus:border-[#f97316]"
                  />
                  <span className="text-[10.5px] text-gray-400 shrink-0">일</span>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addEntry}
            className="w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-[12.5px] font-bold text-gray-500 hover:border-[#f97316] hover:text-[#f97316] cursor-pointer bg-transparent"
          >
            + 현장 추가
          </button>

          {monthly.totalDays > 0 && (
            <div className="mt-4 rounded-lg bg-gray-50 px-3.5 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-400">총 {monthly.totalDays.toLocaleString('ko-KR')}일 근무 · 세전 {monthly.totalGross.toLocaleString('ko-KR')}원</p>
                <p className="text-[13px] font-extrabold" style={{ color: NAVY }}>이번달 예상 실수령액</p>
              </div>
              <p className="font-black text-lg tabular-nums" style={{ color: ORANGE }}>
                {monthly.totalNet.toLocaleString('ko-KR')}원
              </p>
            </div>
          )}
        </div>

        {/* 유의사항 */}
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 sm:p-5 mb-6 text-[11.5px] leading-relaxed text-gray-500">
          <p className="font-bold text-gray-600 mb-1.5">참고용 추정치입니다</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>산재보험은 전액 사업주 부담이라 이 계산에서는 빠져 있어요(근로자 공제 없음).</li>
            <li>국민연금·건강보험료율은 매년 조정될 수 있어, 실제 공제액과 소폭 차이가 날 수 있습니다.</li>
            <li>직종별 평균 일당은 현재 건설UP에 등록된 공고 기준이라, 등록된 공고 수가 적은 직종은 평균이 실제 시세와 다를 수 있어요.</li>
            <li>정확한 원천징수 금액은 국세청 홈택스(hometax.go.kr) 원천징수세액 조회에서 확인할 수 있어요.</li>
          </ul>
        </div>

        {/* 다른 계산기 + 구인 목록 CTA */}
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 mb-3 flex items-center justify-between">
          <span className="text-[12.5px] text-gray-500">퇴직공제금도 궁금하다면?</span>
          <Link href="/retirement-fund-calculator" className="text-[12.5px] font-bold no-underline" style={{ color: ORANGE }}>
            퇴직공제금 계산기 →
          </Link>
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
