import { useState, useEffect, useRef } from 'react';
import type { Job, PendingJob } from '@/lib/firebase';
import {
  fbLoadJobs,
  fbAddJob,
  fbToggleHide,
  fbDeleteJob,
  fbLoadPending,
  fbUpdatePending,
  fbDeletePending,
} from '@/lib/firebase';
import { SAMPLE_JOBS } from '@/data/sampleJobs';
import { formatDate, parseSalaryNum, WELD_SUBS } from '@/lib/utils';

const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전국'];
const JOBS = ['조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비', '화기감시자', '양중', '덕트', '기타'];
const MEALS = ['식사제공', '식사없음', '협의'];
const LODGINGS = ['숙박제공', '숙박없음', '협의'];
const ADMIN_KEY = 'cj_admin_auth';

function PendingItem({
  item,
  onApprove,
  onReject,
  onDelete,
}: {
  item: PendingJob;
  onApprove: (item: PendingJob) => void;
  onReject: (item: PendingJob) => void;
  onDelete: (id: string) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <div
      className={`bg-white border-[1.5px] rounded-[11px] p-4 flex flex-col gap-2.5 ${
        item.status === 'pending' ? 'border-l-4 border-amber-400' :
        item.status === 'approved' ? 'border-l-4 border-emerald-500' :
        'border-l-4 border-red-400 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5 flex-wrap">
        <div className="text-[15px] font-extrabold text-gray-900">{item.title || '제목없음'}</div>
        <span className={`text-[11px] font-bold px-[9px] py-1 rounded-full whitespace-nowrap ${
          item.status === 'pending' ? 'bg-amber-100 text-amber-800' :
          item.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
          'bg-red-100 text-red-800'
        }`}>
          {item.status === 'pending' ? '⏳ 검토중' : item.status === 'approved' ? '✅ 승인됨' : '❌ 반려'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2.5 text-xs text-gray-500">
        <span>📍 {item.region || '-'}</span>
        <span>🔧 {item.job || '-'}</span>
        <span>💰 {item.salary || '-'}</span>
        <span>📞 {item.contact || '-'}</span>
        <span>🕐 {formatDate(item.date || new Date().toISOString())}</span>
      </div>
      {item.status === 'pending' && (
        <div className="flex gap-2 flex-wrap">
          <button className="bg-emerald-500 text-white border-none py-2 px-4 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-emerald-600 font-[inherit]" onClick={() => onApprove(item)}>✅ 승인</button>
          <button className="bg-white border-2 border-red-400 text-red-500 py-[7px] px-4 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-red-50 font-[inherit]" onClick={() => onReject(item)}>❌ 반려</button>
          <button className="bg-white border-2 border-gray-200 text-gray-500 py-[7px] px-3 rounded-lg text-xs font-semibold cursor-pointer hover:bg-gray-50 font-[inherit]" onClick={() => setDetailOpen((v) => !v)}>
            {detailOpen ? '▲ 접기' : '▼ 원문보기'}
          </button>
          <button className="bg-white border-2 border-red-200 text-red-400 py-[7px] px-3 rounded-lg text-xs font-semibold cursor-pointer hover:bg-red-50 font-[inherit] ml-auto" onClick={() => onDelete(item.id)}>🗑 삭제</button>
        </div>
      )}
      {detailOpen && (
        <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed border border-dashed border-gray-200">
          {item.originalText || '원문 없음'}
        </pre>
      )}
    </div>
  );
}

function parseJobText(text: string): Partial<Job> {
  const r: Partial<Job> = { originalText: text };
  const titleM = text.match(/^(.+)/);
  if (titleM) r.title = titleM[1].trim();
  for (const reg of REGIONS) {
    if (text.includes(reg)) { r.region = reg; break; }
  }
  for (const job of [...JOBS, ...WELD_SUBS]) {
    if (text.includes(job)) { r.job = job; break; }
  }
  const salM = text.match(/(\d+)\s*만/);
  if (salM) { r.salary = salM[1] + '만원'; r.salaryNum = parseSalaryNum(r.salary); }
  const phoneM = text.match(/(\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4})/);
  if (phoneM) r.contact = phoneM[1].replace(/\s/g, '');
  if (text.includes('식사제공') || text.includes('식 제공')) r.meal = '식사제공';
  if (text.includes('숙박제공') || text.includes('숙 제공') || text.includes('숙식제공')) r.lodging = '숙박제공';
  if (text.includes('숙식제공') || text.includes('숙식 제공')) { r.meal = '식사제공'; r.lodging = '숙박제공'; }
  if (text.includes('시험가능') || text.includes('시험 가능')) r.weldTest = '가능';
  if (text.includes('시험없음') || text.includes('시험 없음') || text.includes('시험불가')) r.weldTest = '불가능';
  return r;
}

function emptyForm(): Partial<Job> {
  return { title: '', region: '', job: '', weldSub: '', weldTest: '', salary: '', meal: '', lodging: '', contact: '', detail: '', originalText: '' };
}

type Tab = 'jobs' | 'add' | 'pending' | 'settings';

export default function Admin() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(ADMIN_KEY));
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [tab, setTab] = useState<Tab>('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Partial<Job>>(emptyForm());
  const [parseText, setParseText] = useState('');
  const [parseResult, setParseResult] = useState<Partial<Job> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState({
    adminPw: localStorage.getItem('cj_admin_pw') || '1234',
    contactEmail: localStorage.getItem('cj_contact_email') || '',
    contactKakao: localStorage.getItem('cj_contact_kakao') || '',
    contactLabel: localStorage.getItem('cj_contact_label') || '',
    autoHideHours: '',
    shareUrl: localStorage.getItem('cj_share_url') || '',
  });
  const [siteText, setSiteText] = useState({
    siteName: localStorage.getItem('cj_site_name') || '',
    siteSubtitle: localStorage.getItem('cj_site_subtitle') || '',
    mainDesc: localStorage.getItem('cj_main_desc') || '',
    footerText: localStorage.getItem('cj_footer_text') || '',
  });
  const [designTab, setDesignTab] = useState<'text' | 'font' | 'color'>('text');
  const [fontSettings, setFontSettings] = useState({
    titleSize: localStorage.getItem('cj_font_title') || '',
    bodySize: localStorage.getItem('cj_font_body') || '',
    badgeSize: localStorage.getItem('cj_font_badge') || '',
  });
  const [colorSettings, setColorSettings] = useState({
    primary: localStorage.getItem('cj_color_primary') || '#f97316',
    secondary: localStorage.getItem('cj_color_secondary') || '#1e3a5f',
    accent: localStorage.getItem('cj_color_accent') || '#fee500',
  });
  const [reviewMode, setReviewMode] = useState(
    localStorage.getItem('cj_review_mode') === 'on'
  );
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2600);
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const stored = localStorage.getItem('cj_admin_pw') || '1234';
    if (password === stored) {
      localStorage.setItem(ADMIN_KEY, '1');
      setAuthed(true);
      setPwError(false);
    } else {
      setPwError(true);
    }
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_KEY);
    setAuthed(false);
    setPassword('');
  }

  async function loadJobs() {
    setLoading(true);
    const data = await fbLoadJobs();
    setJobs(data.length ? data : SAMPLE_JOBS);
    setLoading(false);
  }

  async function loadPending() {
    const data = await fbLoadPending();
    setPending(data);
  }

  useEffect(() => {
    if (authed) {
      loadJobs();
      loadPending();
    }
  }, [authed]);

  function setField(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleAddJob(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title?.trim() || !form.region || !form.job) {
      showToast('⚠️ 필수 항목을 입력해주세요 (제목, 지역, 직종)');
      return;
    }
    setSubmitting(true);
    await fbAddJob({
      ...form,
      salaryNum: parseSalaryNum(form.salary || ''),
      date: new Date().toISOString(),
      hidden: false,
    } as Omit<Job, 'id'>);
    showToast('✅ 공고가 등록됐습니다!');
    setForm(emptyForm());
    setParseResult(null);
    setParseText('');
    await loadJobs();
    setTab('jobs');
    setSubmitting(false);
  }

  async function handleToggleHide(id: string, hidden: boolean) {
    await fbToggleHide(id, !hidden);
    showToast(hidden ? '👁 공개 처리됐습니다' : '🙈 숨김 처리됐습니다');
    await loadJobs();
  }

  async function handleDelete(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await fbDeleteJob(id);
    showToast('🗑 삭제됐습니다');
    await loadJobs();
  }

  async function handleApprovePending(item: PendingJob) {
    await fbAddJob({
      title: item.title || '',
      region: item.region || '',
      job: item.job || '',
      weldSub: item.weldSub || '',
      weldTest: item.weldTest || '',
      salary: item.salary || '',
      salaryNum: item.salaryNum || 0,
      meal: item.meal || '',
      lodging: item.lodging || '',
      contact: item.contact || '',
      detail: item.detail || '',
      originalText: item.originalText || '',
      date: item.date || new Date().toISOString(),
      hidden: false,
    });
    await fbUpdatePending(item.id, { status: 'approved' });
    showToast('✅ 승인 처리됐습니다');
    await loadJobs();
    await loadPending();
  }

  async function handleRejectPending(item: PendingJob) {
    await fbUpdatePending(item.id, { status: 'rejected' });
    showToast('❌ 반려 처리됐습니다');
    await loadPending();
  }

  async function handleDeletePending(id: string) {
    if (!confirm('신청을 삭제하시겠습니까?')) return;
    await fbDeletePending(id);
    showToast('🗑 삭제됐습니다');
    await loadPending();
  }

  function handleParse() {
    if (!parseText.trim()) return;
    const parsed = parseJobText(parseText);
    setParseResult(parsed);
    setForm((prev) => ({ ...prev, ...parsed }));
  }

  function saveSettings() {
    localStorage.setItem('cj_admin_pw', settings.adminPw);
    localStorage.setItem('cj_contact_email', settings.contactEmail);
    localStorage.setItem('cj_contact_kakao', settings.contactKakao);
    localStorage.setItem('cj_contact_label', settings.contactLabel);
    localStorage.setItem('cj_share_url', settings.shareUrl);
    if (settings.autoHideHours) {
      const prev = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
      localStorage.setItem('cj_dup_settings', JSON.stringify({ ...prev, autoHideHours: parseInt(settings.autoHideHours) }));
    }
    showToast('✅ 설정이 저장됐습니다');
  }

  function saveDesignSettings() {
    localStorage.setItem('cj_site_name', siteText.siteName);
    localStorage.setItem('cj_site_subtitle', siteText.siteSubtitle);
    localStorage.setItem('cj_main_desc', siteText.mainDesc);
    localStorage.setItem('cj_footer_text', siteText.footerText);
    localStorage.setItem('cj_font_title', fontSettings.titleSize);
    localStorage.setItem('cj_font_body', fontSettings.bodySize);
    localStorage.setItem('cj_font_badge', fontSettings.badgeSize);
    localStorage.setItem('cj_color_primary', colorSettings.primary);
    localStorage.setItem('cj_color_secondary', colorSettings.secondary);
    localStorage.setItem('cj_color_accent', colorSettings.accent);
    showToast('✅ 디자인 설정이 저장됐습니다');
  }

  function toggleReviewMode() {
    const next = !reviewMode;
    setReviewMode(next);
    localStorage.setItem('cj_review_mode', next ? 'on' : 'off');
    showToast(next ? '✅ 검토 모드 ON — 승인 후 공개' : '✅ 검토 모드 OFF — 즉시 자동 노출');
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}>
        <div className="bg-white rounded-2xl p-10 w-full max-w-[400px] shadow-[0_20px_60px_rgba(0,0,0,0.2)] text-center">
          <div className="text-[36px] mb-2">🏗️</div>
          <h2 className="text-[22px] font-bold text-[#1e3a5f] mb-1.5">관리자 로그인</h2>
          <p className="text-sm text-gray-500 mb-7">건설UP 관리자 페이지</p>
          <form onSubmit={handleLogin}>
            <div className="text-left mb-4">
              <label className="block text-xs font-bold text-gray-500 mb-1.5">비밀번호</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full py-3 pl-3.5 pr-10 border-2 border-gray-200 rounded-[10px] text-[15px] outline-none font-[inherit] focus:border-[#f97316]"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-none border-none cursor-pointer text-lg text-gray-500"
                  onClick={() => setShowPw(!showPw)}
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            {pwError && (
              <div className="bg-red-100 text-red-700 rounded-lg py-2.5 px-3.5 text-[13px] font-semibold mb-3">
                비밀번호가 올바르지 않습니다.
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-[#f97316] text-white border-none py-3.5 rounded-[10px] text-base font-bold cursor-pointer hover:bg-[#ea580c] transition-colors mt-2 font-[inherit]"
            >
              로그인
            </button>
          </form>
          <p className="text-[11px] text-gray-400 mt-4">기본 비밀번호: 1234</p>
        </div>
      </div>
    );
  }

  const visibleJobs = jobs.filter((j) => !j._deleted);

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fa' }}>
      {/* 관리자 헤더 */}
      <header className="text-white" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}>
        <div className="max-w-[1100px] mx-auto px-4 py-3.5 flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            🏗️ 건설UP 관리자
          </h1>
          <div className="flex items-center gap-2">
            <span className="bg-white/15 rounded-lg py-1.5 px-3 text-[13px]">👤 관리자</span>
            <a href="/" className="bg-white/15 border border-white/30 text-white py-[7px] px-3.5 rounded-lg text-[13px] font-semibold no-underline hover:bg-white/28 transition-colors">
              🏠 홈
            </a>
            <button
              className="bg-red-500 text-white border-none py-[7px] px-3.5 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-red-600 transition-colors font-[inherit]"
              onClick={handleLogout}
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1100px] mx-auto px-4 py-6">
        {/* 탭 */}
        <div className="flex gap-1 mb-5 bg-white rounded-xl p-1.5 shadow-sm overflow-x-auto">
          {(
            [
              { key: 'jobs', label: `📋 공고 관리 (${visibleJobs.length})` },
              { key: 'add', label: '➕ 공고 등록' },
              { key: 'pending', label: `📥 신청 관리 (${pending.filter((p) => p.status === 'pending').length})` },
              { key: 'settings', label: '⚙️ 설정' },
            ] as { key: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              className={`flex-1 min-w-[100px] py-2.5 px-4 border-none rounded-lg text-sm font-semibold cursor-pointer transition-all whitespace-nowrap font-[inherit] ${
                tab === t.key ? 'bg-[#f97316] text-white' : 'bg-transparent text-gray-500 hover:bg-orange-50'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 공고 관리 */}
        {tab === 'jobs' && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 pb-2.5 border-b-2 border-gray-100 flex items-center justify-between">
              📋 공고 목록
              <button
                className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 py-1.5 px-3 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors font-[inherit]"
                onClick={loadJobs}
              >
                🔄 새로고침
              </button>
            </h2>
            {loading ? (
              <div className="flex justify-center py-10">
                <span className="text-2xl animate-spin">⚙️</span>
              </div>
            ) : visibleJobs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">등록된 공고가 없습니다</div>
            ) : (
              <div className="grid gap-3">
                {visibleJobs.map((job) => (
                  <div
                    key={job.id}
                    className={`bg-white border rounded-[10px] p-4 flex items-center gap-3 flex-wrap ${
                      job.hidden ? 'opacity-50 bg-gray-50 border-gray-200' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold mb-1 text-gray-900 truncate">{job.title}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                        <span>📍 {job.region}</span>
                        <span>🔧 {job.job}</span>
                        <span>💰 {job.salary || '협의'}</span>
                        <span>🕐 {formatDate(job.date)}</span>
                        {job.hidden && <span className="text-amber-600 font-bold">🙈 숨김</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        className="bg-white border-2 border-amber-400 text-amber-500 py-[7px] px-3.5 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-amber-50 transition-colors font-[inherit] whitespace-nowrap"
                        onClick={() => handleToggleHide(job.id, !!job.hidden)}
                      >
                        {job.hidden ? '👁 공개' : '🙈 숨김'}
                      </button>
                      <button
                        className="bg-white border-2 border-red-400 text-red-500 py-[7px] px-3.5 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-red-50 transition-colors font-[inherit] whitespace-nowrap"
                        onClick={() => handleDelete(job.id)}
                      >
                        🗑 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 공고 등록 */}
        {tab === 'add' && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 pb-2.5 border-b-2 border-gray-100">➕ 공고 직접 등록</h2>

            {/* 원문 파싱 */}
            <div className="mb-5">
              <h3 className="text-sm font-bold text-gray-700 mb-2">📋 원문 붙여넣기로 자동 파싱</h3>
              <textarea
                value={parseText}
                onChange={(e) => setParseText(e.target.value)}
                placeholder="카카오톡/SNS 원문을 붙여넣으면 자동으로 파싱됩니다"
                rows={4}
                className="w-full py-3.5 px-3.5 border-2 border-gray-200 rounded-[10px] text-sm outline-none font-[inherit] focus:border-[#f97316] resize-y min-h-[120px]"
              />
              <button
                type="button"
                className="mt-2 bg-blue-600 text-white border-none py-2 px-4 rounded-lg text-sm font-bold cursor-pointer hover:bg-blue-700 transition-colors font-[inherit]"
                onClick={handleParse}
              >
                🔍 자동 파싱
              </button>
              {parseResult && (
                <div className="mt-3 bg-blue-50 border-2 border-blue-200 rounded-[10px] p-4">
                  <h4 className="text-sm font-bold text-blue-800 mb-3">✅ 파싱 결과 — 아래 폼에 반영됐습니다</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(parseResult)
                      .filter(([k, v]) => k !== 'originalText' && v)
                      .map(([k, v]) => (
                        <span key={k} className="bg-white border border-blue-200 text-blue-800 text-xs px-2 py-1 rounded-lg">
                          <strong>{k}:</strong> {String(v)}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleAddJob}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-full">
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">공고 제목 <span className="text-[#f97316]">*</span></label>
                  <input type="text" value={form.title || ''} onChange={(e) => setField('title', e.target.value)} placeholder="공고 제목" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">지역 <span className="text-[#f97316]">*</span></label>
                  <select value={form.region || ''} onChange={(e) => setField('region', e.target.value)} className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none bg-white font-[inherit] focus:border-[#f97316] appearance-none">
                    <option value="">지역 선택</option>
                    {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">직종 <span className="text-[#f97316]">*</span></label>
                  <select value={form.job || ''} onChange={(e) => setField('job', e.target.value)} className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none bg-white font-[inherit] focus:border-[#f97316] appearance-none">
                    <option value="">직종 선택</option>
                    {JOBS.map((j) => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                {form.job === '용접' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">용접 종류</label>
                      <div className="flex flex-wrap gap-2">
                        {WELD_SUBS.map((w) => (
                          <button key={w} type="button" className={`px-3 py-1.5 border-2 rounded-lg text-xs font-bold cursor-pointer font-[inherit] ${form.weldSub === w ? 'bg-purple-700 border-purple-700 text-white' : 'bg-white border-purple-200 text-purple-700'}`} onClick={() => setField('weldSub', form.weldSub === w ? '' : w)}>{w}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">자격시험 여부</label>
                      <div className="flex gap-3">
                        {['가능', '불가능'].map((opt) => (
                          <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm">
                            <input type="radio" name="weldTest" checked={form.weldTest === opt} onChange={() => setField('weldTest', opt)} className="w-auto" /> {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">급여</label>
                  <input type="text" value={form.salary || ''} onChange={(e) => setField('salary', e.target.value)} placeholder="예: 28만원" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">연락처</label>
                  <input type="text" value={form.contact || ''} onChange={(e) => setField('contact', e.target.value)} placeholder="예: 010-1234-5678" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">🍚 식사</label>
                  <div className="flex flex-wrap gap-2">
                    {MEALS.map((m) => <label key={m} className="flex items-center gap-1.5 cursor-pointer text-sm"><input type="radio" name="meal" checked={form.meal === m} onChange={() => setField('meal', m)} className="w-auto" /> {m}</label>)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">🏠 숙박</label>
                  <div className="flex flex-wrap gap-2">
                    {LODGINGS.map((l) => <label key={l} className="flex items-center gap-1.5 cursor-pointer text-sm"><input type="radio" name="lodging" checked={form.lodging === l} onChange={() => setField('lodging', l)} className="w-auto" /> {l}</label>)}
                  </div>
                </div>
                <div className="col-span-full">
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">비고</label>
                  <input type="text" value={form.detail || ''} onChange={(e) => setField('detail', e.target.value)} placeholder="경력·자격·기타 요건" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                </div>
                <div className="col-span-full">
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">원문 내용</label>
                  <textarea value={form.originalText || ''} onChange={(e) => setField('originalText', e.target.value)} rows={4} placeholder="원문 내용" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316] resize-y min-h-[100px]" />
                </div>
              </div>
              <button type="submit" disabled={submitting} className={`w-full mt-5 py-[14px] rounded-xl text-[15px] font-bold text-white border-none cursor-pointer font-[inherit] transition-colors ${submitting ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#f97316] hover:bg-[#ea580c]'}`}>
                {submitting ? '등록 중...' : '✅ 공고 등록하기'}
              </button>
            </form>
          </div>
        )}

        {/* 신청 관리 */}
        {tab === 'pending' && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 pb-2.5 border-b-2 border-gray-100 flex items-center justify-between">
              📥 구인 신청 관리
              <button className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 py-1.5 px-3 rounded-lg cursor-pointer font-[inherit]" onClick={loadPending}>🔄 새로고침</button>
            </h2>
            {pending.length === 0 ? (
              <div className="text-center py-12 text-gray-400">신청된 공고가 없습니다</div>
            ) : (
              <div className="grid gap-3">
                {pending.map((item) => (
                  <PendingItem
                    key={item.id}
                    item={item}
                    onApprove={handleApprovePending}
                    onReject={handleRejectPending}
                    onDelete={handleDeletePending}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 설정 */}
        {tab === 'settings' && (
          <div className="flex flex-col gap-5">
            {/* 구인 등록 검토 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-3 flex items-center gap-2">
                📋 구인 등록 검토 설정
              </h2>
              <div className="text-sm text-gray-600 mb-5 space-y-1 leading-relaxed">
                <p><span className="font-bold text-gray-700">OFF (기본):</span> 사용자가 등록하면 즉시 메인 페이지에 자동 노출</p>
                <p><span className="font-bold text-gray-700">ON:</span> 사용자 등록 글을 관리자가 직접 검토 후 승인</p>
              </div>

              {/* 토글 */}
              <button
                onClick={toggleReviewMode}
                className="flex items-center gap-3 cursor-pointer border-none bg-transparent p-0 font-[inherit]"
                type="button"
              >
                <span
                  className="relative inline-flex w-[52px] h-[28px] rounded-full transition-colors duration-200 shrink-0"
                  style={{ background: reviewMode ? '#22c55e' : '#d1d5db' }}
                >
                  <span
                    className="absolute top-[3px] left-[3px] w-[22px] h-[22px] bg-white rounded-full shadow transition-transform duration-200"
                    style={{ transform: reviewMode ? 'translateX(24px)' : 'translateX(0)' }}
                  />
                </span>
                <span className={`text-[15px] font-extrabold ${reviewMode ? 'text-emerald-600' : 'text-gray-500'}`}>
                  {reviewMode ? 'ON — 검토 후 승인 중' : 'OFF — 즉시 자동 노출 중'}
                </span>
              </button>

              {!reviewMode && (
                <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <span className="text-base shrink-0">⚠️</span>
                  <span>OFF 상태에서는 부적절한 글이 즉시 노출될 수 있습니다. ON으로 설정을 권장합니다.</span>
                </div>
              )}
              {reviewMode && (
                <div className="mt-4 flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
                  <span className="text-base shrink-0">✅</span>
                  <span>ON 상태입니다. 사용자가 등록한 공고는 관리자가 승인해야 공개됩니다.</span>
                </div>
              )}
            </div>

            {/* 사이트 텍스트 & 디자인 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-1 flex items-center gap-2">
                🎨 사이트 텍스트 &amp; 디자인 설정
              </h2>
              <p className="text-sm text-gray-500 mb-5">저장 즉시 메인·상세 페이지에 반영됩니다. 비워두면 기본값이 사용됩니다.</p>

              {/* 서브탭 */}
              <div className="flex gap-2 mb-6">
                {([
                  { id: 'text', icon: '📝', label: '텍스트' },
                  { id: 'font', icon: '🔡', label: '글꼴 크기' },
                  { id: 'color', icon: '🎨', label: '색상' },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDesignTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border-2 cursor-pointer font-[inherit] transition-colors ${
                      designTab === t.id
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {/* 텍스트 탭 */}
              {designTab === 'text' && (
                <div className="grid gap-5 max-w-[680px]">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                      사이트 이름 <span className="text-xs font-normal text-gray-400">(헤더 로고)</span>
                    </label>
                    <input
                      type="text"
                      value={siteText.siteName}
                      onChange={(e) => setSiteText((p) => ({ ...p, siteName: e.target.value }))}
                      placeholder="예: 건설UP"
                      className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                      헤더 서브 문구 <span className="text-xs font-normal text-gray-400">(로고 아래 작은 글씨)</span>
                    </label>
                    <input
                      type="text"
                      value={siteText.siteSubtitle}
                      onChange={(e) => setSiteText((p) => ({ ...p, siteSubtitle: e.target.value }))}
                      placeholder="예: 건설 현장 일자리 정보"
                      className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                      메인 페이지 설명 <span className="text-xs font-normal text-gray-400">(빈 결과 화면 등에 사용)</span>
                    </label>
                    <input
                      type="text"
                      value={siteText.mainDesc}
                      onChange={(e) => setSiteText((p) => ({ ...p, mainDesc: e.target.value }))}
                      placeholder="예: 전국 건설 현장 구인공고"
                      className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                      푸터 텍스트 <span className="text-xs font-normal text-gray-400">(하단 설명 문구)</span>
                    </label>
                    <textarea
                      value={siteText.footerText}
                      onChange={(e) => setSiteText((p) => ({ ...p, footerText: e.target.value }))}
                      placeholder="예: 배관·용접·조공 등 건설 현장 일자리 정보"
                      rows={3}
                      className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f] resize-y min-h-[80px]"
                    />
                  </div>
                </div>
              )}

              {/* 글꼴 크기 탭 */}
              {designTab === 'font' && (
                <div className="grid gap-5 max-w-[680px]">
                  {[
                    { key: 'titleSize', label: '공고 제목 크기', placeholder: '예: 16px 또는 1rem', hint: '카드·상세 페이지 공고 제목' },
                    { key: 'bodySize', label: '본문 글씨 크기', placeholder: '예: 14px 또는 0.875rem', hint: '일반 텍스트·설명 영역' },
                    { key: 'badgeSize', label: '뱃지 글씨 크기', placeholder: '예: 11px 또는 0.7rem', hint: 'NEW·직종 뱃지 등' },
                  ].map((item) => (
                    <div key={item.key}>
                      <label className="block text-sm font-bold text-gray-700 mb-1">
                        {item.label} <span className="text-xs font-normal text-gray-400">({item.hint})</span>
                      </label>
                      <input
                        type="text"
                        value={fontSettings[item.key as keyof typeof fontSettings]}
                        onChange={(e) => setFontSettings((p) => ({ ...p, [item.key]: e.target.value }))}
                        placeholder={item.placeholder}
                        className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* 색상 탭 */}
              {designTab === 'color' && (
                <div className="grid gap-5 max-w-[680px]">
                  {[
                    { key: 'primary', label: '주 색상 (Primary)', hint: '헤더·버튼·강조색', default: '#f97316' },
                    { key: 'secondary', label: '보조 색상 (Secondary)', hint: '타이틀·네비게이션', default: '#1e3a5f' },
                    { key: 'accent', label: '강조 색상 (Accent)', hint: '카카오 공유 버튼 등', default: '#fee500' },
                  ].map((item) => (
                    <div key={item.key}>
                      <label className="block text-sm font-bold text-gray-700 mb-1">
                        {item.label} <span className="text-xs font-normal text-gray-400">({item.hint})</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={colorSettings[item.key as keyof typeof colorSettings]}
                          onChange={(e) => setColorSettings((p) => ({ ...p, [item.key]: e.target.value }))}
                          className="w-10 h-10 rounded-lg border-2 border-gray-200 cursor-pointer p-0.5 bg-white"
                        />
                        <input
                          type="text"
                          value={colorSettings[item.key as keyof typeof colorSettings]}
                          onChange={(e) => setColorSettings((p) => ({ ...p, [item.key]: e.target.value }))}
                          placeholder={item.default}
                          className="flex-1 py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                        />
                        <button
                          type="button"
                          onClick={() => setColorSettings((p) => ({ ...p, [item.key]: item.default }))}
                          className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-2 font-[inherit] bg-white cursor-pointer whitespace-nowrap"
                        >
                          기본값
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <p className="text-xs font-bold text-gray-500 mb-3">미리보기</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1.5 rounded-lg text-white text-sm font-bold" style={{ background: colorSettings.primary }}>주 색상</span>
                      <span className="px-3 py-1.5 rounded-lg text-white text-sm font-bold" style={{ background: colorSettings.secondary }}>보조 색상</span>
                      <span className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: colorSettings.accent, color: '#3c1e1e' }}>강조 색상</span>
                    </div>
                  </div>
                </div>
              )}

              <button
                className="mt-6 bg-[#1e3a5f] text-white border-none py-3 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#2d5282] transition-colors font-[inherit]"
                onClick={saveDesignSettings}
              >
                💾 디자인 설정 저장
              </button>
            </div>

            {/* 기본 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 pb-2.5 border-b-2 border-gray-100">⚙️ 기본 설정</h2>
              <div className="grid gap-4 max-w-[560px]">
                {[
                  { key: 'adminPw', label: '관리자 비밀번호', placeholder: '비밀번호', type: 'password' },
                  { key: 'contactEmail', label: '문의 이메일', placeholder: 'example@email.com', type: 'email' },
                  { key: 'contactKakao', label: '카카오톡 ID / 오픈채팅 URL', placeholder: 'kakao ID 또는 https://open.kakao.com/...', type: 'text' },
                  { key: 'contactLabel', label: '문의 안내 문구', placeholder: '구인/구직 관련 문의는 아래 연락처로 연락주세요.', type: 'text' },
                  { key: 'shareUrl', label: '공유 URL (SNS 공유 시 사용)', placeholder: 'https://yoursite.com', type: 'text' },
                  { key: 'autoHideHours', label: '공고 자동 숨김 (시간)', placeholder: '예: 48 (48시간 이후 자동숨김, 0=비활성화)', type: 'number' },
                ].map((item) => (
                  <div key={item.key}>
                    <label className="block text-sm font-bold text-gray-700 mb-2">{item.label}</label>
                    <input
                      type={item.type}
                      value={settings[item.key as keyof typeof settings]}
                      onChange={(e) => setSettings((prev) => ({ ...prev, [item.key]: e.target.value }))}
                      placeholder={item.placeholder}
                      className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                    />
                  </div>
                ))}
                <button
                  className="bg-[#1e3a5f] text-white border-none py-3 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#2d5282] transition-colors font-[inherit]"
                  onClick={saveSettings}
                >
                  💾 설정 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1e3a5f] text-white px-5 py-3 rounded-xl text-sm font-semibold shadow-lg z-[9999] whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}
