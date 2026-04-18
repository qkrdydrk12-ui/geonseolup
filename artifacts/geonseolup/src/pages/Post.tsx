import { useState } from 'react';
import { useLocation } from 'wouter';
import { fbAddPending, fbAddJob } from '@/lib/firebase';
import { WELD_SUBS, parseSalaryNum } from '@/lib/utils';

const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전국'];
const JOBS = ['조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비', '화기감시자', '양중', '덕트', '기타'];
const MEALS = ['식사제공', '식사없음', '협의'];
const LODGINGS = ['숙박제공', '숙박없음', '협의'];
const WELD_TEST_OPTIONS = ['가능', '불가능'];

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
    detail: '',
    originalText: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [autoPublished, setAutoPublished] = useState(false);
  const [error, setError] = useState('');

  const showWeld = form.job === '용접';
  const showFireNotice = form.job === '화기감시자';

  function setField(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.title.trim()) { setError('공고 제목을 입력해주세요.'); return; }
    if (!form.region) { setError('지역을 선택해주세요.'); return; }
    if (!form.job) { setError('직종을 선택해주세요.'); return; }

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
      setDone(true);
    } catch (e) {
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

  return (
    <div className="min-h-screen pb-10" style={{ background: '#f1f5f9' }}>
      <div className="max-w-[700px] mx-auto px-4 pt-6">
        <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6 sm:p-8">
          <h1 className="text-xl font-extrabold text-[#1e3a5f] mb-[6px] pb-[14px] border-b-2 border-gray-100 flex items-center gap-2">
            ✏️ 구인 공고 등록
          </h1>
          <p className="text-xs text-gray-400 mb-5 mt-2.5">
            아래 양식을 작성해 제출하시면 관리자 검토 후 공고가 등록됩니다.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm font-semibold mb-4">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* 제목 */}
              <div className="col-span-full">
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  공고 제목 <span className="text-[#f97316]">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  placeholder="예: 서울 강동 TIG 용접사 모집"
                  className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                />
              </div>

              {/* 지역 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  지역 <span className="text-[#f97316]">*</span>
                </label>
                <select
                  value={form.region}
                  onChange={(e) => setField('region', e.target.value)}
                  className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none bg-white font-[inherit] focus:border-[#f97316] appearance-none"
                >
                  <option value="">지역 선택</option>
                  {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* 직종 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                  직종 <span className="text-[#f97316]">*</span>
                </label>
                <select
                  value={form.job}
                  onChange={(e) => {
                    setField('job', e.target.value);
                    if (e.target.value !== '용접') setField('weldSub', '');
                  }}
                  className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none bg-white font-[inherit] focus:border-[#f97316] appearance-none"
                >
                  <option value="">직종 선택</option>
                  {JOBS.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>

              {/* 용접 세부 */}
              {showWeld && (
                <div className="col-span-full bg-purple-50 border-2 border-purple-200 rounded-xl p-3.5">
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

              {/* 화기감시자 안내 */}
              {showFireNotice && (
                <div className="col-span-full bg-red-50 border-2 border-red-200 rounded-xl p-3 text-sm text-red-800 font-semibold">
                  🧯 화기감시자 자격증 보유자 우대 — 자격증 관련 정보를 비고란에 기재해주세요.
                </div>
              )}

              {/* 급여 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">급여</label>
                <input
                  type="text"
                  value={form.salary}
                  onChange={(e) => setField('salary', e.target.value)}
                  placeholder="예: 28만원, 협의"
                  className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                />
              </div>

              {/* 연락처 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">연락처</label>
                <input
                  type="text"
                  value={form.contact}
                  onChange={(e) => setField('contact', e.target.value)}
                  placeholder="예: 010-1234-5678"
                  className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                />
              </div>

              {/* 식사 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">🍚 식사</label>
                <div className="flex flex-wrap gap-2">
                  {MEALS.map((m) => (
                    <label key={m} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="meal"
                        checked={form.meal === m}
                        onChange={() => setField('meal', m)}
                        className="w-auto accent-[#f97316]"
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </div>

              {/* 숙박 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">🏠 숙박</label>
                <div className="flex flex-wrap gap-2">
                  {LODGINGS.map((l) => (
                    <label key={l} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="lodging"
                        checked={form.lodging === l}
                        onChange={() => setField('lodging', l)}
                        className="w-auto accent-[#f97316]"
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </div>

              {/* 비고 */}
              <div className="col-span-full">
                <label className="block text-xs font-bold text-gray-500 mb-1.5">비고 (선택)</label>
                <input
                  type="text"
                  value={form.detail}
                  onChange={(e) => setField('detail', e.target.value)}
                  placeholder="경력·자격·기타 요건 등"
                  className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                />
              </div>

              {/* 원문 */}
              <div className="col-span-full">
                <label className="block text-xs font-bold text-gray-500 mb-1.5">원문 내용 (선택)</label>
                <textarea
                  value={form.originalText}
                  onChange={(e) => setField('originalText', e.target.value)}
                  placeholder="카카오톡·SNS 등에 올린 원문을 그대로 붙여넣어 주세요"
                  rows={4}
                  className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316] resize-y min-h-[100px]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full mt-5 py-[14px] rounded-xl text-[15px] font-bold text-white border-none cursor-pointer transition-colors font-[inherit] ${
                submitting ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#f97316] hover:bg-[#ea580c]'
              }`}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-[2.5px] border-white border-t-transparent rounded-full animate-spin" />
                  제출 중...
                </span>
              ) : (
                '📝 구인 공고 신청하기'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
