import { useState } from 'react';
import { useLocation } from 'wouter';
import { fbAddPending, fbAddJob } from '@/lib/firebase';
import { WELD_SUBS, parseSalaryNum } from '@/lib/utils';

const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전국'];
const JOBS = ['조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비', '화기감시자', '양중', '덕트', '비계', '안전담당자', '품질담당자', '공사담당자', '기타'];
const WELD_TEST_OPTIONS = ['가능', '불가능'];

function formatPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function validatePhone(value: string): { valid: boolean; message: string } {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length === 0) return { valid: false, message: '' };
  if (digits.length < 11) return { valid: false, message: `🚫 자리수가 부족합니다 (현재 ${digits.length}자리 / 11자리 필요)` };
  if (digits.length > 11) return { valid: false, message: '🚫 자리수가 초과됩니다 (11자리만 허용)' };
  if (!digits.startsWith('010')) return { valid: false, message: '🚫 010으로 시작하는 번호만 입력 가능합니다' };
  return { valid: true, message: '✔ 올바른 전화번호입니다' };
}

export default function Post() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    title: '',
    region: '',
    job: '',
    weldSub: '',
    weldTest: '',
    salary: '',
    meal: '',
    lodging: '',
    contact: '',
    manager: '',
    detail: '',
    originalText: '',
  });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [autoPublished, setAutoPublished] = useState(false);
  const [error, setError] = useState('');

  const showWeld = form.job === '용접';

  function getCooldownRemain(contact: string): number {
    const digits = contact.replace(/[^0-9]/g, '');
    if (digits.length !== 11) return 0;
    const COOLDOWN_MS = 30 * 60 * 1000;
    const raw = localStorage.getItem('cj_post_log');
    const log: { contact: string; ts: number }[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const found = log.find((e) => e.contact === contact.trim() && now - e.ts < COOLDOWN_MS);
    if (found) return COOLDOWN_MS - (now - found.ts);
    return 0;
  }

  const contactCooldownRemain = getCooldownRemain(form.contact);
  const contactCooldownMins = Math.ceil(contactCooldownRemain / 60000);

  function containsPhone(text: string): boolean {
    const digits = text.replace(/[^0-9]/g, '');
    return digits.length >= 9;
  }

  const titleHasPhone = containsPhone(form.title);
  const detailHasPhone = containsPhone(form.detail);

  function setField(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function toggleMeal(val: string) {
    setForm((prev) => ({ ...prev, meal: prev.meal === val ? '' : val }));
  }
  function toggleLodging(val: string) {
    setForm((prev) => ({ ...prev, lodging: prev.lodging === val ? '' : val }));
  }

  function checkCooldown(contact: string): number {
    const COOLDOWN_MS = 30 * 60 * 1000;
    const raw = localStorage.getItem('cj_post_log');
    const log: { contact: string; ts: number }[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const clean = log.filter((e) => now - e.ts < COOLDOWN_MS);
    localStorage.setItem('cj_post_log', JSON.stringify(clean));
    const found = clean.find((e) => e.contact === contact.trim());
    if (found) {
      const remain = COOLDOWN_MS - (now - found.ts);
      return remain;
    }
    return 0;
  }

  function recordPost(contact: string) {
    const raw = localStorage.getItem('cj_post_log');
    const log: { contact: string; ts: number }[] = raw ? JSON.parse(raw) : [];
    log.push({ contact: contact.trim(), ts: Date.now() });
    localStorage.setItem('cj_post_log', JSON.stringify(log));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('공고 제목을 입력해주세요.'); return; }
    if (titleHasPhone) { setError('공고 제목에 전화번호를 입력할 수 없습니다. 연락처란을 이용해주세요.'); return; }
    if (!form.region) { setError('지역을 선택해주세요.'); return; }
    if (!form.job) { setError('직종을 선택해주세요.'); return; }
    if (detailHasPhone) { setError('비고/추가 정보란에 전화번호를 입력할 수 없습니다. 연락처란을 이용해주세요.'); return; }
    if (!form.contact.trim()) { setError('연락처를 입력해주세요.'); return; }
    const phoneResult = validatePhone(form.contact);
    if (!phoneResult.valid) { setError('올바른 전화번호를 입력해주세요 (010-1234-5678)'); return; }
    if (!agreed) { setError('이용 규칙에 동의해주세요.'); return; }

    const cooldownRemain = checkCooldown(form.contact);
    if (cooldownRemain > 0) {
      const mins = Math.ceil(cooldownRemain / 60000);
      setError(`동일 연락처로 이미 등록된 공고가 있습니다. ${mins}분 후 다시 시도해주세요. (30분 쿨타임)`);
      return;
    }

    setSubmitting(true);
    const isReviewMode = localStorage.getItem('cj_review_mode') === 'on';
    try {
      if (isReviewMode) {
        await fbAddPending({
          ...form,
          salaryNum: parseSalaryNum(form.salary),
          date: new Date().toISOString(),
          status: 'pending',
          hidden: false,
        });
        setAutoPublished(false);
      } else {
        await fbAddJob({
          ...form,
          salaryNum: parseSalaryNum(form.salary),
          date: new Date().toISOString(),
          hidden: false,
        });
        setAutoPublished(true);
      }
      recordPost(form.contact);
      setDone(true);
    } catch {
      setError('등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f1f5f9' }}>
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center border border-gray-200">
          <div className="text-6xl mb-4">{autoPublished ? '🎉' : '✅'}</div>
          <h2 className="text-xl font-extrabold text-[#1e3a5f] mb-2">
            {autoPublished ? '공고가 등록됐습니다!' : '구인 신청이 완료됐습니다!'}
          </h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            {autoPublished
              ? '공고가 즉시 메인 페이지에 노출됩니다.'
              : '관리자 검토 후 공고가 등록됩니다. 빠른 시간 내에 처리해드리겠습니다.'}
          </p>
          <button
            className="bg-[#f97316] text-white border-none px-8 py-3 rounded-xl text-base font-bold cursor-pointer hover:bg-[#ea580c] transition-colors w-full"
            onClick={() => setLocation('/')}
          >
            일자리 목록 보기
          </button>
        </div>
      </div>
    );
  }

  const inputCls = 'w-full py-3 px-4 border border-gray-300 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316] focus:ring-2 focus:ring-orange-100 transition-all bg-white';
  const selectCls = 'w-full py-3 px-4 border border-gray-300 rounded-lg text-sm outline-none bg-white font-[inherit] focus:border-[#f97316] focus:ring-2 focus:ring-orange-100 transition-all appearance-none';

  return (
    <div className="min-h-screen pb-12" style={{ background: '#eef2f7' }}>
      <div className="max-w-[640px] mx-auto px-4 pt-8">

        {/* 페이지 헤더 */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-[#1e3a5f] mb-2">📋 구인글 등록</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            현장 정보를 입력하시면 관리자 검토 후 게시됩니다.<br />
            허위 공고나 부적절한 내용은 삭제될 수 있습니다.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold mb-4">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* 기본 정보 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-extrabold text-gray-700 mb-4 flex items-center gap-1.5 border-b border-gray-100 pb-3">
              📌 기본 정보
            </h2>
            <div className="flex flex-col gap-4">

              {/* 공고 제목 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  공고 제목 <span className="text-[#f97316]">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  maxLength={60}
                  onChange={(e) => setField('title', e.target.value)}
                  placeholder="예: 대구 TIG 용접사 급구 (일당 35만)"
                  className={`${inputCls} ${titleHasPhone ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''}`}
                />
                <div className="flex items-center justify-between mt-1">
                  {titleHasPhone
                    ? <span className="text-xs text-red-600 font-semibold">🚫 제목에 전화번호를 입력할 수 없습니다</span>
                    : <span />
                  }
                  <span className="text-xs text-gray-400">{form.title.length}/60자</span>
                </div>
              </div>

              {/* 지역 + 직종 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    지역 <span className="text-[#f97316]">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={form.region}
                      onChange={(e) => setField('region', e.target.value)}
                      className={selectCls}
                    >
                      <option value="">-- 지역 선택 --</option>
                      {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▼</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    직종 <span className="text-[#f97316]">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={form.job}
                      onChange={(e) => {
                        setField('job', e.target.value);
                        if (e.target.value !== '용접') { setField('weldSub', ''); setField('weldTest', ''); }
                      }}
                      className={selectCls}
                    >
                      <option value="">-- 직종 선택 --</option>
                      {JOBS.map((j) => <option key={j} value={j}>{j}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▼</span>
                  </div>
                </div>
              </div>

              {/* 용접 세부 */}
              {showWeld && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-purple-800 mb-2.5">⚙️ 용접 종류 선택</h4>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {WELD_SUBS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className={`px-4 py-[7px] border-2 rounded-lg text-[13px] font-bold cursor-pointer transition-all font-[inherit] ${
                          form.weldSub === w
                            ? 'bg-purple-700 border-purple-700 text-white'
                            : 'bg-white border-purple-200 text-purple-700 hover:border-purple-500'
                        }`}
                        onClick={() => setField('weldSub', form.weldSub === w ? '' : w)}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-purple-700 mb-1.5">자격시험 여부</div>
                    <div className="flex gap-4">
                      {WELD_TEST_OPTIONS.map((opt) => (
                        <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <input
                            type="radio"
                            name="weldTest"
                            checked={form.weldTest === opt}
                            onChange={() => setField('weldTest', opt)}
                            className="accent-purple-700 w-auto"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 일당 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  일당 (급여) <span className="text-[#f97316]">*</span>
                  <span className="text-xs font-normal text-gray-400 ml-1.5">숫자+단위 입력</span>
                </label>
                <input
                  type="text"
                  value={form.salary}
                  onChange={(e) => setField('salary', e.target.value)}
                  placeholder="예: 30만원, 320,000원, 협의"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* 근무 조건 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-extrabold text-gray-700 mb-4 flex items-center gap-1.5 border-b border-gray-100 pb-3">
              🏠 근무 조건
            </h2>
            <div className="flex flex-col gap-4">

              {/* 식사 + 숙박 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">식사 제공</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMeal('식사제공')}
                      className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg border-2 text-sm font-bold transition-all cursor-pointer font-[inherit] ${
                        form.meal === '식사제공'
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-400'
                      }`}
                    >
                      🍚 식사제공
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMeal('식사없음')}
                      className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg border-2 text-sm font-bold transition-all cursor-pointer font-[inherit] ${
                        form.meal === '식사없음'
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-red-300'
                      }`}
                    >
                      ✕ 없음
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">숙박 제공</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleLodging('숙박제공')}
                      className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg border-2 text-sm font-bold transition-all cursor-pointer font-[inherit] ${
                        form.lodging === '숙박제공'
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-400'
                      }`}
                    >
                      🏠 숙박제공
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLodging('숙박없음')}
                      className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg border-2 text-sm font-bold transition-all cursor-pointer font-[inherit] ${
                        form.lodging === '숙박없음'
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-red-300'
                      }`}
                    >
                      ✕ 없음
                    </button>
                  </div>
                </div>
              </div>

              {/* 비고 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  비고 / 추가 정보
                  <span className="text-xs font-normal text-gray-400 ml-1.5">근무기간, 인원, 자격 등</span>
                </label>
                <textarea
                  value={form.detail}
                  onChange={(e) => {
                    if (e.target.value.length <= 200) setField('detail', e.target.value);
                  }}
                  placeholder="예: 주 5일, 2주 이상 가능자, 용접기능사 우대"
                  rows={4}
                  className={`w-full py-3 px-4 border rounded-lg text-sm outline-none font-[inherit] transition-all resize-none ${
                    detailHasPhone
                      ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                      : 'border-gray-300 focus:border-[#f97316] focus:ring-2 focus:ring-orange-100'
                  }`}
                />
                <div className="flex items-center justify-between mt-1">
                  {detailHasPhone
                    ? <span className="text-xs text-red-600 font-semibold">🚫 비고란에 전화번호를 입력할 수 없습니다</span>
                    : <span />
                  }
                  <span className="text-xs text-gray-400">{form.detail.length}/200자</span>
                </div>
              </div>
            </div>
          </div>

          {/* 연락처 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-extrabold text-gray-700 mb-4 flex items-center gap-1.5 border-b border-gray-100 pb-3">
              📞 연락처
            </h2>
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <label className="text-sm font-semibold text-gray-700">
                    연락처 <span className="text-[#f97316]">*</span>
                  </label>
                  {contactCooldownRemain > 0 && (
                    <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 leading-tight">
                      ⚠️ 동일 연락처로 이미 등록된 공고가 있습니다. {contactCooldownMins}분 후 다시 시도해주세요. (30분 쿨타임)
                    </span>
                  )}
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={form.contact}
                  onChange={(e) => setField('contact', formatPhone(e.target.value))}
                  placeholder="예: 010-1234-5678"
                  maxLength={13}
                  className={(() => {
                    const phoneResult = validatePhone(form.contact);
                    const invalid = form.contact.length > 0 && !phoneResult.valid;
                    const cooldown = contactCooldownRemain > 0;
                    return `${inputCls} ${invalid || cooldown ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : phoneResult.valid ? 'border-emerald-400 focus:border-emerald-400' : ''}`;
                  })()}
                />
                {(() => {
                  const phoneResult = validatePhone(form.contact);
                  if (form.contact.length === 0) return (
                    <p className="text-xs text-gray-400 mt-1">숫자만 입력하면 자동으로 010-1234-5678 형식으로 변환됩니다</p>
                  );
                  if (!phoneResult.valid) return (
                    <p className="text-xs text-red-600 font-semibold mt-1">{phoneResult.message}</p>
                  );
                  return <p className="text-xs text-emerald-600 font-semibold mt-1">{phoneResult.message}</p>;
                })()}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  담당자 이름 또는 업체명
                  <span className="text-xs font-normal text-gray-400 ml-1.5">선택</span>
                </label>
                <input
                  type="text"
                  value={form.manager}
                  onChange={(e) => setField('manager', e.target.value)}
                  placeholder="예: 홍길동 반장, (주)건설파트너"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* 개인정보 안내 */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-1.5">🔒 개인정보 안내</p>
            <p className="text-sm text-amber-700 leading-relaxed">
              입력하신 연락처는 구직자와 연결 목적으로만 사용되며, 제3자에게 제공되지 않습니다.<br />
              공개를 원하지 않는 정보는 입력하지 마세요.
            </p>
          </div>

          {/* 중복 등록 안내 */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-1.5">ℹ 중복 등록 안내</p>
            <ul className="text-sm text-blue-700 leading-relaxed space-y-1">
              <li>· 동일 연락처로 <strong>30분 이내 재등록은 제한</strong>됩니다.</li>
              <li>· 제목·지역·급여가 유사한 공고는 <strong>중복으로 감지</strong>되어 노출이 제한될 수 있습니다.</li>
              <li>· 같은 연락처 공고가 여럿일 경우 <strong>최신 글이 우선 노출</strong>됩니다.</li>
            </ul>
          </div>

          {/* 이용 규칙 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-extrabold text-gray-700 mb-4 flex items-center gap-1.5 border-b border-gray-100 pb-3">
              🚫 이용 규칙
            </h2>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm font-bold text-red-700 mb-2.5">🔇 아래 내용이 포함된 글은 즉시 삭제됩니다</p>
              <ul className="text-sm text-red-700 space-y-1.5">
                <li>· 성적인 표현 또는 음란 내용 금지</li>
                <li>· 혐오·차별·비하 발언 금지</li>
                <li>· 사적인 대화·홍보·광고성 내용 금지</li>
                <li>· 허위·과장 공고 금지</li>
              </ul>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-4 h-4 accent-[#f97316] cursor-pointer shrink-0"
              />
              <span className="text-sm font-semibold text-gray-700">위 규칙을 확인했으며, 이에 동의합니다.</span>
            </label>
          </div>

          {/* 제출 버튼 */}
          <div className="pb-2">
            <button
              type="submit"
              disabled={submitting || !agreed}
              className={`w-full py-4 rounded-xl text-base font-extrabold text-white border-none cursor-pointer transition-colors font-[inherit] ${
                submitting || !agreed ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#f97316] hover:bg-[#ea580c]'
              }`}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-[2.5px] border-white border-t-transparent rounded-full animate-spin" />
                  제출 중...
                </span>
              ) : (
                '📋 구인글 등록하기'
              )}
            </button>
            <p className="text-center text-xs text-gray-400 mt-2">
              이용 규칙을 어길 시 관리자에 의해 삭제될 수 있음을 알려드립니다.
            </p>
          </div>

        </form>
      </div>
    </div>
  );
}
