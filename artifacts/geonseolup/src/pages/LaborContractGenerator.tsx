import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  defaultContractInput,
  sanitizeWageAmount,
  sanitizeBreakMinutes,
  formatContractTerm,
  calcDailyWageFromContract,
  type ContractInput,
  type ContractTermType,
} from '@/lib/laborContract';
// PDF 다운로드 전용 — 입력 즉시 결과물(파일)을 손에 쥐어주는 게 이 페이지의 핵심 가치라
// "인쇄 대화상자를 거쳐 PDF로 저장"이라는 간접적인 방법 대신 진짜 파일 다운로드로 구현한다.
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const ORANGE = '#f97316';
const NAVY = '#1e3a5f';

const JOB_TYPE_OPTIONS = [
  '조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비',
  '화기감시자', '유도원', '양중', '덕트', '비계', '포설', '보온', '안전시설반',
];

// 클립보드(계약서) + 펜 + 안전모 일러스트 — 앞의 세 계산기(돼지저금통, 계산기+영수증,
// 계속근로 달력+사슬)와 구분되는 네 번째 벡터 일러스트.
function HeroIllustration() {
  return (
    <svg viewBox="0 0 320 200" className="w-full h-auto" role="img" aria-label="안전모와 근로계약서 클립보드 일러스트">
      <ellipse cx="160" cy="180" rx="118" ry="12" fill="#1e3a5f" opacity="0.08" />
      {/* 클립보드 */}
      <rect x="96" y="60" width="128" height="118" rx="10" fill="#1e3a5f" />
      <rect x="106" y="76" width="108" height="94" rx="6" fill="#fff" />
      <rect x="134" y="52" width="52" height="20" rx="6" fill="#f97316" />
      <rect x="146" y="46" width="28" height="12" rx="4" fill="#c2410c" />
      {/* 계약서 문구 라인 */}
      <rect x="118" y="88" width="70" height="5" rx="2.5" fill="#e2e8f0" />
      <rect x="118" y="100" width="84" height="5" rx="2.5" fill="#e2e8f0" />
      <rect x="118" y="112" width="60" height="5" rx="2.5" fill="#e2e8f0" />
      <rect x="118" y="124" width="76" height="5" rx="2.5" fill="#e2e8f0" />
      {/* 체크박스 + 체크 */}
      <rect x="118" y="140" width="12" height="12" rx="3" fill="none" stroke="#f97316" strokeWidth="2.5" />
      <path d="M120 146 L124 150 L130 142" fill="none" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="138" y="142" width="50" height="5" rx="2.5" fill="#fed7aa" />

      {/* 안전모 (클립보드 위) */}
      <path d="M104 62 Q160 22 216 60 Q160 50 104 62 Z" fill="#f97316" />
      <rect x="120" y="58" width="80" height="10" rx="5" fill="#f97316" />
      <circle cx="160" cy="34" r="5" fill="#1e3a5f" />

      {/* 서명 펜 */}
      <g transform="translate(228,120) rotate(45)">
        <rect x="0" y="0" width="10" height="56" rx="5" fill="#1e3a5f" />
        <rect x="0" y="0" width="10" height="14" rx="5" fill="#334155" />
        <path d="M2 56 L8 56 L5 66 Z" fill="#f97316" />
      </g>
      <path d="M232 174 q14 -4 26 -1" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function loadCache(): ContractInput {
  try {
    const raw = localStorage.getItem('cj_labor_contract');
    if (!raw) return defaultContractInput();
    const parsed = JSON.parse(raw);
    return { ...defaultContractInput(), ...parsed };
  } catch {
    return defaultContractInput();
  }
}

const TERM_OPTIONS: { value: ContractTermType; label: string }[] = [
  { value: '1month', label: '1개월 (자동 갱신) — 가장 흔한 방식' },
  { value: 'untilCompletion', label: '공사(작업) 종료 시까지' },
  { value: 'custom', label: '직접 입력' },
];

export default function LaborContractGenerator() {
  const [input, setInput] = useState<ContractInput>(loadCache);

  useEffect(() => {
    document.title = '건설 일용직 근로계약서 양식 — 바로 채워서 완성하기 | 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '건설 일용직 근로계약서, 서면으로 안 쓰면 나중에 임금체불·퇴직금 분쟁에서 불리해질 수 있어요. 현장명·계약기간·1공수 단가만 채우면 계약서가 완성됩니다. 실수령액·퇴직금 계산기와도 바로 연결돼요.';
  }, []);

  useEffect(() => {
    try { localStorage.setItem('cj_labor_contract', JSON.stringify(input)); } catch { /* noop */ }
  }, [input]);

  function update<K extends keyof ContractInput>(key: K, value: ContractInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  const termText = useMemo(() => formatContractTerm(input), [input.startDate, input.termType, input.customEndDate]);
  const dailyWage = useMemo(() => calcDailyWageFromContract(input.unitWage, input.gongsu), [input.unitWage, input.gongsu]);

  const filledEnough = input.companyName && input.workerName && input.startDate && input.jobType && input.unitWage > 0;

  const previewRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadPdf() {
    if (!previewRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 12, pageWidth, imgHeight);
      const fileName = `근로계약서_${input.workerName || '근로자'}_${input.startDate || ''}.pdf`;
      pdf.save(fileName);
    } catch {
      // 캡처 실패 시 인쇄 대화상자로 폴백(브라우저에서 PDF로 저장 가능)
      window.print();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fb' }}>
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
          .print-only-card { box-shadow: none !important; border: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
      <Header />
      <main className="max-w-[760px] mx-auto px-4 py-6 sm:py-8">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4 no-print">
          <Link href="/" className="hover:text-[#f97316] no-underline transition-colors">홈</Link>
          <span>›</span>
          <span className="text-gray-600 font-medium">근로계약서 양식</span>
        </div>

        <div className="rounded-2xl overflow-hidden mb-6 px-5 sm:px-8 pt-6 no-print" style={{ background: 'linear-gradient(135deg,#fff7ed,#fef3e2)' }}>
          <div className="max-w-[220px] mx-auto">
            <HeroIllustration />
          </div>
          <div className="text-center pb-6 pt-1">
            <h1 className="font-extrabold text-xl sm:text-[26px] leading-tight mb-1.5" style={{ color: NAVY }}>
              건설 일용직 근로계약서 양식
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">현장명·계약기간·1공수 단가만 채우면 계약서 PDF를 바로 다운로드할 수 있어요</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-6 text-[13px] leading-relaxed text-gray-600 no-print">
          <p className="mb-1.5">
            일용직도 사업주는 서면 근로계약서를 작성·교부할 의무가 있어요(근로기준법). 그런데 현장에서는
            생략되는 경우가 많고, <b style={{ color: ORANGE }}>나중에 임금체불이나 퇴직금 분쟁이 생겼을 때</b> 계약서가
            없으면 입증이 훨씬 어려워져요.
          </p>
          <p className="text-gray-400 text-[12px]">일용직이라도 실제로는 매일 새로 계약서를 쓰기보다 <b>계약기간을 1개월로 잡고 자동 갱신</b>하는 방식이 흔해요(아래 기본값도 그렇게 맞춰뒀어요).</p>
        </div>

        {/* 입력 폼 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-5 no-print">
          <h2 className="font-extrabold text-[15px] mb-4" style={{ color: NAVY }}>계약 정보 입력</h2>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11.5px] text-gray-500 mb-1 block">사업주(회사명)</label>
                <input
                  type="text"
                  value={input.companyName}
                  onChange={(e) => update('companyName', e.target.value)}
                  placeholder="예: 건설UP(주)"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-gray-500 mb-1 block">근로자 성명</label>
                <input
                  type="text"
                  value={input.workerName}
                  onChange={(e) => update('workerName', e.target.value)}
                  placeholder="예: 홍길동"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                />
              </div>
            </div>

            <div>
              <label className="text-[11.5px] text-gray-500 mb-1 block">현장명(공사명)</label>
              <input
                type="text"
                value={input.siteName}
                onChange={(e) => update('siteName', e.target.value)}
                placeholder="예: OO아파트 신축공사 현장"
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11.5px] text-gray-500 mb-1 block">직종</label>
                <select
                  value={input.jobType}
                  onChange={(e) => update('jobType', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-bold text-gray-700 bg-white focus:outline-none focus:border-[#f97316]"
                >
                  <option value="">선택</option>
                  {JOB_TYPE_OPTIONS.map((j) => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-gray-500 mb-1 block">근로개시일</label>
                <input
                  type="date"
                  value={input.startDate}
                  onChange={(e) => update('startDate', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                />
              </div>
            </div>

            <div>
              <label className="text-[11.5px] text-gray-500 mb-1.5 block">계약기간</label>
              <div className="flex flex-col gap-1.5">
                {TERM_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 cursor-pointer">
                    <input
                      type="radio"
                      name="termType"
                      checked={input.termType === opt.value}
                      onChange={() => update('termType', opt.value)}
                      className="accent-[#f97316]"
                    />
                    <span className="text-[12.5px] text-gray-700">{opt.label}</span>
                  </label>
                ))}
                {input.termType === 'custom' && (
                  <input
                    type="date"
                    value={input.customEndDate}
                    onChange={(e) => update('customEndDate', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <label className="text-[11.5px] text-gray-500 mb-1 block">1공수 단가</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={input.unitWage || ''}
                  onChange={(e) => update('unitWage', sanitizeWageAmount(e.target.value))}
                  placeholder="예: 180000"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-bold text-gray-800 text-right focus:outline-none focus:border-[#f97316]"
                />
              </div>
              <span className="text-[12px] text-gray-400 shrink-0 mt-5">원 ×</span>
              <div className="w-[70px] shrink-0">
                <label className="text-[11.5px] text-gray-500 mb-1 block">공수</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={input.gongsu}
                  onChange={(e) => update('gongsu', e.target.value)}
                  placeholder="1"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-bold text-gray-800 text-right focus:outline-none focus:border-[#f97316]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11.5px] text-gray-500 mb-1 block">출근</label>
                <input
                  type="time"
                  value={input.workStartTime}
                  onChange={(e) => update('workStartTime', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2 py-2 text-[12.5px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-gray-500 mb-1 block">퇴근</label>
                <input
                  type="time"
                  value={input.workEndTime}
                  onChange={(e) => update('workEndTime', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-2 py-2 text-[12.5px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-gray-500 mb-1 block">휴게(분)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={input.breakMinutes || ''}
                  onChange={(e) => update('breakMinutes', sanitizeBreakMinutes(e.target.value))}
                  className="w-full rounded-lg border border-gray-200 px-2 py-2 text-[12.5px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
                />
              </div>
            </div>

            <div>
              <label className="text-[11.5px] text-gray-500 mb-1 block">임금 지급일</label>
              <input
                type="text"
                value={input.payDay}
                onChange={(e) => update('payDay', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[13px] font-bold text-gray-800 focus:outline-none focus:border-[#f97316]"
              />
            </div>

            <div>
              <label className="text-[11.5px] text-gray-500 mb-1.5 block">사회보험 적용</label>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 opacity-70">
                  <input type="checkbox" checked readOnly className="accent-[#f97316]" />
                  <span className="text-[12.5px] text-gray-700">산재보험 (전 근로자 의무가입, 근로자 부담 없음)</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={input.insuranceEmployment}
                    onChange={(e) => update('insuranceEmployment', e.target.checked)}
                    className="accent-[#f97316]"
                  />
                  <span className="text-[12.5px] text-gray-700">고용보험</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={input.insurancePension}
                    onChange={(e) => update('insurancePension', e.target.checked)}
                    className="accent-[#f97316]"
                  />
                  <span className="text-[12.5px] text-gray-700">국민연금 (통상 월 8일·1개월 이상 근무 시)</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={input.insuranceHealth}
                    onChange={(e) => update('insuranceHealth', e.target.checked)}
                    className="accent-[#f97316]"
                  />
                  <span className="text-[12.5px] text-gray-700">건강보험 (통상 월 8일·1개월 이상 근무 시)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 완성된 계약서 미리보기 — ref로 감싼 영역만 PDF로 캡처(버튼은 제외) */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-7 mb-5 print-only-card">
          <div ref={previewRef} className="bg-white p-1">
          <h2 className="text-center font-black text-lg mb-5" style={{ color: NAVY }}>표준 근로계약서 (건설 일용직)</h2>

          <div className="flex flex-col gap-3 text-[13px] text-gray-700 leading-relaxed">
            <p>
              <b>{input.companyName || '(사업주명)'}</b>(이하 "사업주")과(와) <b>{input.workerName || '(근로자명)'}</b>(이하 "근로자")은
              다음과 같이 근로계약을 체결한다.
            </p>

            <div className="rounded-lg border border-gray-100 overflow-hidden mt-1">
              {[
                ['근무 현장', input.siteName || '(현장명 미입력)'],
                ['담당 업무', input.jobType || '(직종 미입력)'],
                ['계약기간', termText],
                ['소정근로시간', `${input.workStartTime} ~ ${input.workEndTime} (휴게시간 ${input.breakMinutes}분)`],
                ['임금(1일 기준)', dailyWage > 0 ? `1공수 단가 ${input.unitWage.toLocaleString('ko-KR')}원 × ${input.gongsu || '1'}공수 = ${dailyWage.toLocaleString('ko-KR')}원` : '(단가 미입력)'],
                ['임금 지급일', input.payDay],
                ['사회보험', ['산재보험', input.insuranceEmployment && '고용보험', input.insurancePension && '국민연금', input.insuranceHealth && '건강보험'].filter(Boolean).join(' · ')],
              ].map(([label, value]) => (
                <div key={label as string} className="flex border-b border-gray-100 last:border-0">
                  <div className="w-[100px] shrink-0 bg-gray-50 px-3 py-2.5 text-[12px] font-bold text-gray-500">{label}</div>
                  <div className="flex-1 px-3 py-2.5 text-[12.5px] font-bold text-gray-800">{value}</div>
                </div>
              ))}
            </div>

            <p className="text-[11.5px] text-gray-400 mt-2">
              위 내용에 대해 사업주와 근로자는 상호 성실히 이행할 것을 약정하며, 근로계약서 1부를 근로자에게 교부한다.
            </p>

            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-dashed border-gray-200">
              <div className="text-center">
                <p className="text-[11px] text-gray-400 mb-6">사업주</p>
                <p className="text-[12.5px] font-bold text-gray-700 border-t border-gray-300 pt-1.5">{input.companyName || '(서명)'}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-gray-400 mb-6">근로자</p>
                <p className="text-[12.5px] font-bold text-gray-700 border-t border-gray-300 pt-1.5">{input.workerName || '(서명)'}</p>
              </div>
            </div>
          </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={!filledEnough || downloading}
            className="no-print w-full mt-5 rounded-lg py-2.5 text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 transition-opacity"
            style={{ background: ORANGE, color: '#fff' }}
          >
            {!filledEnough ? '필수 항목을 먼저 채워주세요' : downloading ? '파일 만드는 중...' : '계약서 PDF 다운로드'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print w-full mt-2 rounded-lg py-2 text-[12px] font-bold cursor-pointer bg-transparent border border-gray-200 text-gray-500"
          >
            바로 인쇄하기
          </button>
        </div>

        {/* 체크리스트 */}
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 sm:p-5 mb-6 text-[11.5px] leading-relaxed text-gray-500 no-print">
          <p className="font-bold text-gray-600 mb-1.5">계약서 작성·보관 체크리스트</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>계약서는 <b>2부 작성해서 근로자도 1부 반드시 보관</b>하세요(교부받지 못했다면 사업주에게 요청할 수 있어요).</li>
            <li>이 페이지는 참고용 서식이에요 — 정확한 표준 양식은 고용노동부 홈페이지(moel.go.kr)에서도 확인할 수 있어요.</li>
            <li>1공수 단가·근무시간·계약기간은 실제 근무 조건과 다르게 적으면 나중에 분쟁이 생겼을 때 오히려 불리해질 수 있으니 사실대로 적으세요.</li>
            <li>여기서 입력한 정보는 이 브라우저에만 저장되고 서버로 전송되지 않아요.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4 mb-3 flex items-center justify-between flex-wrap gap-2 no-print">
          <span className="text-[12.5px] text-gray-500">이 조건으로 실수령액도 확인해보세요</span>
          <Link href="/net-pay-calculator" className="text-[12.5px] font-bold no-underline" style={{ color: ORANGE }}>
            실수령액 계산기 →
          </Link>
        </div>

        <div
          className="rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 no-print"
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

        <div className="text-center mt-5 no-print">
          <Link href="/" className="text-sm text-gray-500 hover:text-[#f97316] transition-colors no-underline">
            ← 홈으로 돌아가기
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
