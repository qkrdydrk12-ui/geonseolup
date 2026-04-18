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
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showFindModal, setShowFindModal] = useState(false);
  const [findEmail, setFindEmail] = useState('');
  const [findPhone, setFindPhone] = useState('');
  const [findSent, setFindSent] = useState(false);
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
  const [autoHideHours, setAutoHideHours] = useState<string>(() => {
    const stored = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
    return stored.autoHideHours != null ? String(stored.autoHideHours) : '48';
  });
  const [dupStats, setDupStats] = useState({ visible: 0, autoHidden: 0, manualHidden: 0, similarPairs: 0 });
  const [adPageTab, setAdPageTab] = useState<'main' | 'detail'>('main');
  const [adCodes, setAdCodes] = useState({
    mainTop: localStorage.getItem('cj_ad_main_top') || '',
    mainInfeed: localStorage.getItem('cj_ad_main_infeed') || '',
    mainBottom: localStorage.getItem('cj_ad_main_bottom') || '',
    detailTop: localStorage.getItem('cj_ad_detail_top') || '',
    detailInfeed: localStorage.getItem('cj_ad_detail_infeed') || '',
    detailBottom: localStorage.getItem('cj_ad_detail_bottom') || '',
  });
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2600);
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const storedPw = localStorage.getItem('cj_admin_pw') || '1234';
    const storedId = localStorage.getItem('cj_admin_id') || 'admin';
    if (adminId === storedId && password === storedPw) {
      localStorage.setItem(ADMIN_KEY, '1');
      setAuthed(true);
      setPwError(false);
      window.dispatchEvent(new Event('admin-login'));
    } else {
      setPwError(true);
    }
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_KEY);
    setAuthed(false);
    setPassword('');
  }

  function computeDupStats(jobList: typeof jobs, hideHours: string) {
    const hours = parseInt(hideHours) || 0;
    const now = Date.now();
    let visible = 0, autoHidden = 0, manualHidden = 0;
    const contactMap = new Map<string, number>();
    for (const j of jobList) {
      if (j.hidden) { manualHidden++; continue; }
      const ageH = (now - new Date(j.date).getTime()) / 36e5;
      if (hours > 0 && ageH >= hours) { autoHidden++; } else { visible++; }
      if (j.contact?.trim()) {
        const key = j.contact.trim();
        contactMap.set(key, (contactMap.get(key) || 0) + 1);
      }
    }
    const similarPairs = [...contactMap.values()].filter((v) => v > 1).length;
    setDupStats({ visible, autoHidden, manualHidden, similarPairs });
  }

  async function loadJobs() {
    setLoading(true);
    const data = await fbLoadJobs();
    const list = data.length ? data : SAMPLE_JOBS;
    setJobs(list);
    const stored = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
    const hours = stored.autoHideHours != null ? String(stored.autoHideHours) : '48';
    computeDupStats(list, hours);
    setLoading(false);
  }

  async function loadPending() {
    const data = await fbLoadPending();
    setPending(data);
  }

  function saveAutoHide() {
    const h = parseInt(autoHideHours) || 0;
    const prev = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
    localStorage.setItem('cj_dup_settings', JSON.stringify({ ...prev, autoHideHours: h }));
    computeDupStats(jobs, autoHideHours);
    showToast('✅ 자동숨김 설정이 저장됐습니다');
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
          <h2 className="text-[22px] font-bold text-[#1e3a5f] mb-1">건설UP 관리자</h2>
          <p className="text-sm text-gray-400 mb-7">로그인하여 공고를 관리하세요</p>
          <form onSubmit={handleLogin}>
            <div className="text-left mb-3">
              <label className="block text-xs font-bold text-gray-500 mb-1.5">아이디</label>
              <input
                type="text"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                placeholder="아이디"
                autoComplete="username"
                className="w-full py-3 pl-3.5 pr-4 border-2 border-gray-200 rounded-[10px] text-[15px] outline-none font-[inherit] focus:border-[#f97316]"
              />
            </div>
            <div className="text-left mb-4">
              <label className="block text-xs font-bold text-gray-500 mb-1.5">비밀번호</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  autoComplete="current-password"
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
                아이디 또는 비밀번호가 올바르지 않습니다.
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-[#f97316] text-white border-none py-3.5 rounded-[10px] text-base font-bold cursor-pointer hover:bg-[#ea580c] transition-colors mt-1 font-[inherit]"
            >
              🔐 로그인
            </button>
          </form>

          <div className="flex items-center justify-center gap-4 mt-4">
            <button
              type="button"
              onClick={() => { setShowFindModal(true); setFindSent(false); setFindEmail(''); setFindPhone(''); }}
              className="text-[12px] text-gray-400 hover:text-[#f97316] cursor-pointer bg-transparent border-none font-[inherit] underline-offset-2 hover:underline transition-colors"
            >
              아이디/비밀번호 찾기
            </button>
            <span className="text-gray-200">|</span>
            <a
              href="/"
              className="text-[12px] text-gray-400 hover:text-[#1e3a5f] no-underline hover:underline underline-offset-2 transition-colors"
            >
              🏠 홈으로 이동
            </a>
          </div>
          <p className="text-[10px] text-gray-300 mt-4">관리자 전용 로그인</p>
        </div>

        {/* 아이디/비밀번호 찾기 모달 */}
        {showFindModal && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center px-5"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowFindModal(false); }}
          >
            <div className="bg-white rounded-2xl p-8 w-full max-w-[380px] shadow-2xl">
              <h3 className="text-[18px] font-bold text-[#1e3a5f] mb-1">🔍 아이디/비밀번호 찾기</h3>
              <p className="text-xs text-gray-400 mb-5">
                가입 시 등록한 이메일 또는 휴대폰번호를 입력하세요.
              </p>
              {!findSent ? (
                <>
                  <div className="mb-3">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">이메일 주소</label>
                    <input
                      type="email"
                      value={findEmail}
                      onChange={(e) => setFindEmail(e.target.value)}
                      placeholder="example@email.com"
                      className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                    />
                  </div>
                  <div className="mb-5">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">휴대폰번호</label>
                    <input
                      type="tel"
                      value={findPhone}
                      onChange={(e) => setFindPhone(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowFindModal(false)}
                      className="flex-1 bg-gray-100 text-gray-600 border-none py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-gray-200 transition-colors font-[inherit]"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => {
                        if (!findEmail && !findPhone) return;
                        setFindSent(true);
                      }}
                      className="flex-1 bg-[#f97316] text-white border-none py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                    >
                      찾기
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <div className="text-4xl mb-3">📬</div>
                  <p className="text-sm text-gray-700 font-semibold mb-1">확인이 완료되었습니다</p>
                  <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                    관리자에게 아이디/비밀번호 재발급을 요청해 주세요.<br />
                    {localStorage.getItem('cj_contact_email') && (
                      <>📧 {localStorage.getItem('cj_contact_email')}</>
                    )}
                    {localStorage.getItem('cj_contact_kakao') && (
                      <><br />💛 카카오 {localStorage.getItem('cj_contact_kakao')}</>
                    )}
                  </p>
                  <button
                    onClick={() => setShowFindModal(false)}
                    className="w-full bg-[#1e3a5f] text-white border-none py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#2d5282] transition-colors font-[inherit]"
                  >
                    확인
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
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

            {/* 중복 공고 관리 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-3 flex items-center gap-2">
                🔄 중복 공고 관리
              </h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                같은 연락처의 이전 공고는 하단으로 자동 이동되며, 일정 시간이 지난 공고는 메인 목록에서 자동으로 숨겨집니다.<br />
                데이터는 삭제되지 않으며 관리 탭에서 언제든 확인할 수 있습니다.
              </p>

              {/* 자동숨김 시간 */}
              <p className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <span>⏰</span> 공고 자동숨김 시간
              </p>
              <div className="flex items-center gap-3 mb-2">
                <select
                  value={autoHideHours}
                  onChange={(e) => setAutoHideHours(e.target.value)}
                  className="py-2.5 px-3.5 border-2 border-gray-200 rounded-xl text-sm font-semibold outline-none bg-white font-[inherit] focus:border-[#f97316] appearance-none cursor-pointer min-w-[220px]"
                >
                  <option value="0">비활성화 (자동숨김 안함)</option>
                  <option value="24">24시간 후 자동숨김</option>
                  <option value="48">48시간 후 자동숨김 (기본)</option>
                  <option value="72">72시간 후 자동숨김</option>
                  <option value="168">7일 후 자동숨김</option>
                  <option value="336">14일 후 자동숨김</option>
                </select>
                <button
                  onClick={saveAutoHide}
                  className="bg-[#f97316] text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit] whitespace-nowrap"
                >
                  저장
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-6">설정한 시간이 지난 공고는 메인 목록에서 자동으로 사라집니다. (데이터 유지)</p>

              {/* 공고 현황 요약 */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                  <span>📊</span> 공고 현황 요약
                </p>
                <button
                  onClick={() => { loadJobs(); }}
                  className="flex items-center gap-1.5 text-xs font-semibold border border-gray-200 rounded-lg px-3 py-1.5 bg-white cursor-pointer hover:bg-gray-50 font-[inherit] text-gray-600 whitespace-nowrap"
                >
                  🔄 새로고침
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: '✅', label: '노출 중', value: dupStats.visible, color: 'text-emerald-600' },
                  { icon: '⏱️', label: '자동숨김', value: dupStats.autoHidden, color: 'text-amber-500' },
                  { icon: '🙈', label: '수동숨김', value: dupStats.manualHidden, color: 'text-gray-500' },
                  { icon: '🔍', label: '유사공고 쌍', value: dupStats.similarPairs, color: 'text-purple-600' },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                    <div className="text-2xl mb-1">{s.icon}</div>
                    <div className={`text-2xl font-extrabold mb-1 ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500 font-medium">{s.label}</div>
                  </div>
                ))}
              </div>
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

            {/* 문의하기 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-2 flex items-center gap-2">
                📥 문의하기 설정
              </h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                메인 페이지 우측 상단 <strong>문의하기</strong> 버튼 클릭 시 표시될 연락 수단을 설정하세요.<br />
                이메일 또는 카카오톡 ID 중 하나만 입력해도 됩니다.
              </p>
              <div className="grid gap-4 max-w-[680px]">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <span>📧</span> 이메일 주소
                  </label>
                  <input
                    type="email"
                    value={settings.contactEmail}
                    onChange={(e) => setSettings((p) => ({ ...p, contactEmail: e.target.value }))}
                    placeholder="예: example@gmail.com"
                    className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#f97316]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <span>💛</span> 카카오톡 ID
                  </label>
                  <input
                    type="text"
                    value={settings.contactKakao}
                    onChange={(e) => setSettings((p) => ({ ...p, contactKakao: e.target.value }))}
                    placeholder="예: mykakaoid (카카오톡 오픈채팅 or ID)"
                    className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#f97316]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    버튼 안내 문구 <span className="text-xs font-normal text-gray-400">(모달 상단 안내 텍스트)</span>
                  </label>
                  <input
                    type="text"
                    value={settings.contactLabel}
                    onChange={(e) => setSettings((p) => ({ ...p, contactLabel: e.target.value }))}
                    placeholder="예: 구인/구직 문의는 아래로 연락주세요 😊"
                    className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#f97316]"
                  />
                </div>
                <div>
                  <button
                    className="flex items-center gap-2 bg-[#f97316] text-white border-none py-2.5 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                    onClick={() => {
                      localStorage.setItem('cj_contact_email', settings.contactEmail);
                      localStorage.setItem('cj_contact_kakao', settings.contactKakao);
                      localStorage.setItem('cj_contact_label', settings.contactLabel);
                      showToast('✅ 문의하기 설정이 저장됐습니다');
                    }}
                  >
                    🖫 저장
                  </button>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 leading-relaxed">
                  <p><span className="mr-1">📧</span> 이메일: <strong className="text-gray-800">{settings.contactEmail || '설정 없음'}</strong></p>
                  <p className="mt-1"><span className="mr-1">💛</span> 카톡 ID: <strong className="text-gray-800">{settings.contactKakao || '설정 없음'}</strong></p>
                  <p className="mt-1"><span className="mr-1">💬</span> 안내 문구: <strong className="text-gray-800">{settings.contactLabel || '설정 없음'}</strong></p>
                </div>
              </div>
            </div>

            {/* 카카오 공유 링크 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-2 flex items-center gap-2">
                💬 카카오 공유 링크 설정
              </h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                메인 페이지 우측 상단 <strong>공유</strong> 버튼 클릭 시 공유될 URL을 입력하세요.<br />
                비워두면 현재 페이지 주소가 자동 사용됩니다.
              </p>
              <div className="max-w-[680px]">
                <label className="block text-sm font-bold text-gray-700 mb-1.5">공유 링크 URL</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={settings.shareUrl}
                    onChange={(e) => setSettings((p) => ({ ...p, shareUrl: e.target.value }))}
                    placeholder="예: https://yoursite.com"
                    className="flex-1 py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#f97316]"
                  />
                  <button
                    className="bg-[#f97316] text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit] whitespace-nowrap"
                    onClick={() => {
                      localStorage.setItem('cj_share_url', settings.shareUrl);
                      showToast('✅ 공유 링크가 저장됐습니다');
                    }}
                  >
                    저장
                  </button>
                </div>
                <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-600">
                  현재 설정된 링크: <strong className="text-gray-800">{settings.shareUrl || '설정 없음 (현재 페이지 주소 사용)'}</strong>
                </div>
              </div>
            </div>

            {/* 관리자 계정 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 flex items-center gap-2">
                🔑 관리자 계정 설정
              </h2>
              <div className="grid gap-3 max-w-[480px]">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">아이디</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      defaultValue={localStorage.getItem('cj_admin_id') || 'admin'}
                      id="admin-id-input"
                      placeholder="관리자 아이디"
                      className="flex-1 py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                    />
                    <button
                      className="bg-[#1e3a5f] text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-[#2d5282] transition-colors font-[inherit] whitespace-nowrap"
                      onClick={() => {
                        const el = document.getElementById('admin-id-input') as HTMLInputElement;
                        const val = el?.value?.trim();
                        if (!val) return;
                        localStorage.setItem('cj_admin_id', val);
                        showToast('✅ 아이디가 변경됐습니다');
                      }}
                    >
                      변경
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">비밀번호</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={settings.adminPw}
                      onChange={(e) => setSettings((p) => ({ ...p, adminPw: e.target.value }))}
                      placeholder="새 비밀번호 입력"
                      className="flex-1 py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                    />
                    <button
                      className="bg-[#1e3a5f] text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-[#2d5282] transition-colors font-[inherit] whitespace-nowrap"
                      onClick={() => {
                        localStorage.setItem('cj_admin_pw', settings.adminPw);
                        showToast('✅ 비밀번호가 변경됐습니다');
                      }}
                    >
                      변경
                    </button>
                  </div>
                </div>
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <span>💡</span> 기본 아이디: <strong>admin</strong> / 기본 비밀번호: <strong>1234</strong>
                </p>
              </div>
            </div>

            {/* 광고 코드 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-2 flex items-center gap-2">
                📢 광고 코드 설정
              </h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                각 영역에 애드센스 또는 기타 광고 코드를 붙여넣으세요.<br />
                저장 후 메인/상세 페이지에 즉시 반영됩니다. 비워두면 광고 영역이 숨겨집니다.
              </p>

              {/* 페이지 서브탭 */}
              <div className="flex gap-2 mb-5">
                {([
                  { id: 'main', icon: '🏠', label: '메인 페이지' },
                  { id: 'detail', icon: '📄', label: '상세 페이지' },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setAdPageTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border-2 cursor-pointer font-[inherit] transition-colors ${
                      adPageTab === t.id
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {adPageTab === 'main' && (
                <div className="grid gap-4">
                  {[
                    { key: 'mainTop', label: '① 상단 배너 광고', hint: '상단 헤더 아래' },
                    { key: 'mainInfeed', label: '② 인피드 광고', hint: '카드 6개마다 자동 삽입' },
                    { key: 'mainBottom', label: '③ 하단 배너 광고', hint: '푸터 위' },
                  ].map((slot) => (
                    <div key={slot.key}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        {slot.label} <span className="text-xs font-normal text-gray-400">({slot.hint})</span>
                      </label>
                      <textarea
                        value={adCodes[slot.key as keyof typeof adCodes]}
                        onChange={(e) => setAdCodes((p) => ({ ...p, [slot.key]: e.target.value }))}
                        rows={4}
                        placeholder="광고 코드 붙여넣기"
                        className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-mono font-[inherit] focus:border-[#f97316] resize-y min-h-[80px]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {adPageTab === 'detail' && (
                <div className="grid gap-4">
                  {[
                    { key: 'detailTop', label: '① 상단 배너 광고', hint: '상단 헤더 아래' },
                    { key: 'detailInfeed', label: '② 인피드 광고', hint: '본문 중간 삽입' },
                    { key: 'detailBottom', label: '③ 하단 배너 광고', hint: '푸터 위' },
                  ].map((slot) => (
                    <div key={slot.key}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        {slot.label} <span className="text-xs font-normal text-gray-400">({slot.hint})</span>
                      </label>
                      <textarea
                        value={adCodes[slot.key as keyof typeof adCodes]}
                        onChange={(e) => setAdCodes((p) => ({ ...p, [slot.key]: e.target.value }))}
                        rows={4}
                        placeholder="광고 코드 붙여넣기"
                        className="w-full py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-mono font-[inherit] focus:border-[#f97316] resize-y min-h-[80px]"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <button
                  className="flex items-center gap-2 bg-[#f97316] text-white border-none py-2.5 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                  onClick={() => {
                    localStorage.setItem('cj_ad_main_top', adCodes.mainTop);
                    localStorage.setItem('cj_ad_main_infeed', adCodes.mainInfeed);
                    localStorage.setItem('cj_ad_main_bottom', adCodes.mainBottom);
                    localStorage.setItem('cj_ad_detail_top', adCodes.detailTop);
                    localStorage.setItem('cj_ad_detail_infeed', adCodes.detailInfeed);
                    localStorage.setItem('cj_ad_detail_bottom', adCodes.detailBottom);
                    showToast('✅ 광고 코드가 저장됐습니다');
                  }}
                >
                  💾 광고 코드 저장
                </button>
                <button
                  className="flex items-center gap-2 bg-red-50 text-red-500 border-2 border-red-300 py-2.5 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-red-100 transition-colors font-[inherit]"
                  onClick={() => {
                    if (!confirm('모든 광고 코드를 초기화하시겠습니까?')) return;
                    const empty = { mainTop: '', mainInfeed: '', mainBottom: '', detailTop: '', detailInfeed: '', detailBottom: '' };
                    setAdCodes(empty);
                    ['cj_ad_main_top','cj_ad_main_infeed','cj_ad_main_bottom','cj_ad_detail_top','cj_ad_detail_infeed','cj_ad_detail_bottom'].forEach((k) => localStorage.removeItem(k));
                    showToast('🗑 광고 코드가 초기화됐습니다');
                  }}
                >
                  🗑 전체 초기화
                </button>
              </div>
              <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                <span>💡</span> 비워두면 해당 광고 영역 자체가 화면에서 숨겨집니다.
              </p>
            </div>

            {/* 현황 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 flex items-center gap-2">
                📊 현황
              </h2>
              <div className="grid gap-2 text-sm text-gray-700">
                {[
                  { icon: '📄', label: '총 등록 공고', value: jobs.length },
                  { icon: '👁', label: '공개 중', value: jobs.filter((j) => !j.hidden).length },
                  { icon: '🙈', label: '숨김 중', value: jobs.filter((j) => !!j.hidden).length },
                  { icon: '🔧', label: '용접 계열', value: jobs.filter((j) => j.job === '용접' || j.weldSub).length },
                  { icon: '🔥', label: '화기감시자', value: jobs.filter((j) => j.job === '화기감시자').length },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className="text-base">{row.icon}</span>
                    <span className="text-gray-600">{row.label}:</span>
                    <strong className="text-gray-900">{row.value}건</strong>
                  </div>
                ))}
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
