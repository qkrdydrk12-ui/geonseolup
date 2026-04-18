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
import {
  getToken,
  setToken,
  clearToken,
  apiLogin,
  apiLogout,
  apiVerify,
  apiUpdateCreds,
  startIdleTimer,
} from '@/lib/adminAuth';

const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '전국'];
const JOBS = ['조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비', '화기감시자', '유도원', '양중', '덕트', '비계', '안전담당자', '품질담당자', '공사담당자', '기타'];
const MEALS = ['식사제공', '식사없음', '협의'];
const LODGINGS = ['숙박제공', '숙박없음', '협의'];

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
  const [authed, setAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true); // 토큰 검증 중
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState(false);
  const [pwErrorMsg, setPwErrorMsg] = useState('');
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
    adminPw: localStorage.getItem('cj_admin_pw') || 'wns585426!@',
    contactEmail: localStorage.getItem('cj_contact_email') || 'qkrdydrk@naver.com',
    contactKakao: localStorage.getItem('cj_contact_kakao') || '010-5567-2710',
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
  const [homeLayout, setHomeLayout] = useState({
    pageSize: localStorage.getItem('cj_home_page_size') || '12',
    infeedEvery: localStorage.getItem('cj_home_infeed_every') || '6',
    showPopular: localStorage.getItem('cj_home_show_popular') !== 'off',
    adTopHeight: localStorage.getItem('cj_ad_top_height') || '90',
    adInfeedHeight: localStorage.getItem('cj_ad_infeed_height') || '90',
    adBottomHeight: localStorage.getItem('cj_ad_bottom_height') || '90',
    adMaxWidth: localStorage.getItem('cj_ad_max_width') || '100%',
  });

  const DEFAULT_REGIONS_ADMIN = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  const DEFAULT_JOBS_ADMIN = ['조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비', '화기감시자', '유도원', '양중', '덕트', '비계', '안전담당자', '품질담당자', '공사담당자', '기타'];

  function loadList(key: string, defaults: string[]): string[] {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch {}
    return defaults;
  }

  const [regionListTab, setRegionListTab] = useState<'region' | 'job'>('region');
  const [customRegions, setCustomRegions] = useState<string[]>(() => loadList('cj_custom_regions', DEFAULT_REGIONS_ADMIN));
  const [customJobs, setCustomJobs] = useState<string[]>(() => loadList('cj_custom_jobs', DEFAULT_JOBS_ADMIN));
  const [newRegionInput, setNewRegionInput] = useState('');
  const [newJobInput, setNewJobInput] = useState('');

  const [footerText, setFooterText] = useState({
    title: localStorage.getItem('cj_footer_title') || '건설UP — 전국 건설 현장 일자리 정보',
    jobs: localStorage.getItem('cj_footer_jobs') || '배관 · 용접(TIG/아크/CO2/PVC) · 조공 · 화기감시자 · 형틀 · 철근 · 미장 · 도장',
    notice: localStorage.getItem('cj_footer_notice') || '※ 게재된 일자리 정보는 등록자 제공으로 정확성을 보장하지 않습니다.',
  });

  const IMG_AD_SLOTS = [
    { key: 'main_top', label: '홈 상단 배너' },
    { key: 'main_infeed', label: '홈 인피드' },
    { key: 'main_bottom', label: '홈 하단 배너' },
    { key: 'detail_top', label: '상세 상단 배너' },
    { key: 'detail_bottom', label: '상세 하단 배너' },
  ];
  const [imgAdSlot, setImgAdSlot] = useState('main_top');
  const [imgAdData, setImgAdData] = useState<Record<string, { src: string; url: string }>>(() => {
    const result: Record<string, { src: string; url: string }> = {};
    for (const s of [
      'main_top', 'main_infeed', 'main_bottom', 'detail_top', 'detail_bottom',
    ]) {
      result[s] = {
        src: localStorage.getItem(`cj_imgad_${s}_src`) || '',
        url: localStorage.getItem(`cj_imgad_${s}_url`) || '',
      };
    }
    return result;
  });

  const [contactLimitInput, setContactLimitInput] = useState(
    localStorage.getItem('cj_contact_daily_limit') || '20'
  );
  const [googleVerifyCode, setGoogleVerifyCode] = useState(
    localStorage.getItem('cj_google_verify') || ''
  );
  const [googleVerifyMethod, setGoogleVerifyMethod] = useState<'html' | 'dns'>('html');
  const [headCode, setHeadCode] = useState(
    localStorage.getItem('cj_head_inject') || ''
  );

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2600);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setPwError(false);
    setPwErrorMsg('');
    const result = await apiLogin(adminId, password);
    if (result.ok && result.token) {
      setToken(result.token);
      setAuthed(true);
      setPassword('');
      window.dispatchEvent(new Event('admin-login'));
    } else {
      setPwError(true);
      setPwErrorMsg(result.message || '아이디 또는 비밀번호가 올바르지 않습니다');
    }
  }

  async function handleLogout() {
    await apiLogout();
    clearToken();
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

  // 페이지 로드 시 기존 세션 토큰 검증
  useEffect(() => {
    async function checkSession() {
      if (getToken()) {
        const valid = await apiVerify();
        setAuthed(valid);
      }
      setAuthChecking(false);
    }
    checkSession();
  }, []);

  // 로그인 상태일 때 비활동 자동 로그아웃 타이머 시작
  useEffect(() => {
    if (!authed) return;
    const cleanup = startIdleTimer(() => {
      handleLogout();
      alert('20분간 활동이 없어 자동 로그아웃됐습니다.');
    });
    return cleanup;
  }, [authed]);

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

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}>
        <div className="text-white text-lg font-semibold animate-pulse">인증 확인 중...</div>
      </div>
    );
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
                {pwErrorMsg || '아이디 또는 비밀번호가 올바르지 않습니다.'}
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
                    {(() => {
                      const email = localStorage.getItem('cj_contact_email') || 'qkrdydrk@naver.com';
                      const kakao = localStorage.getItem('cj_contact_kakao') || '010-5567-2710';
                      return (<>📧 {email}<br />📞 {kakao}</>);
                    })()}
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
                      id="admin-id-input"
                      placeholder="새 아이디 (4자 이상)"
                      className="flex-1 py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                    />
                    <button
                      className="bg-[#1e3a5f] text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-[#2d5282] transition-colors font-[inherit] whitespace-nowrap"
                      onClick={async () => {
                        const el = document.getElementById('admin-id-input') as HTMLInputElement;
                        const val = el?.value?.trim();
                        if (!val || val.length < 4) { showToast('⚠️ 아이디는 4자 이상이어야 합니다'); return; }
                        const res = await apiUpdateCreds(val, '');
                        if (res.ok) { el.value = ''; showToast('✅ 아이디가 변경됐습니다'); }
                        else showToast('❌ ' + (res.message || '변경 실패'));
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
                      placeholder="새 비밀번호 (6자 이상)"
                      className="flex-1 py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f]"
                    />
                    <button
                      className="bg-[#1e3a5f] text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-[#2d5282] transition-colors font-[inherit] whitespace-nowrap"
                      onClick={async () => {
                        if (!settings.adminPw || settings.adminPw.length < 6) { showToast('⚠️ 비밀번호는 6자 이상이어야 합니다'); return; }
                        const res = await apiUpdateCreds('', settings.adminPw);
                        if (res.ok) showToast('✅ 비밀번호가 변경됐습니다');
                        else showToast('❌ ' + (res.message || '변경 실패'));
                      }}
                    >
                      변경
                    </button>
                  </div>
                </div>
                <p className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                  <span>🔒</span> 계정 정보는 서버에 안전하게 저장됩니다. 서버 재시작 시 초기값으로 돌아갑니다.
                </p>
              </div>
            </div>

            {/* 연락처 조회 제한 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-1 flex items-center gap-2">🔒 연락처 조회 제한</h2>
              <p className="text-sm text-gray-500 mb-5">사용자가 하루에 열람 가능한 연락처 수를 제한합니다. 초과 시 "과도한 조회로 제한되었습니다" 메시지가 표시됩니다.</p>

              {/* 현재 설정 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div className="bg-orange-50 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <div className="text-xs text-gray-500 font-semibold">하루 최대 열람 수</div>
                    <div className="text-xl font-extrabold text-[#f97316]">
                      {localStorage.getItem('cj_contact_daily_limit') || '20'}개
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <div className="text-xs text-gray-500 font-semibold">오늘의 내 열람 수</div>
                    <div className="text-xl font-extrabold text-blue-600">
                      {(() => {
                        try {
                          const log = JSON.parse(localStorage.getItem('cj_contact_log') || '[]') as number[];
                          const today = new Date().toDateString();
                          return log.filter((ts) => new Date(ts).toDateString() === today).length;
                        } catch { return 0; }
                      })()}개
                    </div>
                  </div>
                </div>
              </div>

              {/* 제한 수 설정 */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  하루 최대 연락처 열람 수 설정
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={contactLimitInput}
                    onChange={(e) => setContactLimitInput(e.target.value)}
                    className="w-32 py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                  />
                  <span className="text-sm text-gray-500 self-center">개 / 일</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {[5, 10, 20, 30, 50].map((n) => (
                    <button
                      key={n}
                      onClick={() => setContactLimitInput(String(n))}
                      className={`px-3 py-1 rounded-full text-xs font-bold border cursor-pointer font-[inherit] transition-colors ${
                        contactLimitInput === String(n)
                          ? 'bg-[#f97316] text-white border-[#f97316]'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-[#f97316]'
                      }`}
                    >
                      {n}개
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                <button
                  className="flex items-center gap-2 bg-[#f97316] text-white border-none py-2.5 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                  onClick={() => {
                    const val = Math.max(1, parseInt(contactLimitInput) || 20);
                    setContactLimitInput(String(val));
                    localStorage.setItem('cj_contact_daily_limit', String(val));
                    showToast(`✅ 하루 ${val}개로 제한이 설정됐습니다`);
                  }}
                >
                  💾 제한 저장
                </button>
                <button
                  className="flex items-center gap-2 bg-white text-gray-600 border border-gray-300 py-2.5 px-5 rounded-xl text-[14px] font-semibold cursor-pointer hover:border-red-400 hover:text-red-500 transition-colors font-[inherit]"
                  onClick={() => {
                    if (confirm('오늘 조회 기록을 초기화하시겠습니까?')) {
                      const log = JSON.parse(localStorage.getItem('cj_contact_log') || '[]') as number[];
                      const today = new Date().toDateString();
                      localStorage.setItem('cj_contact_log', JSON.stringify(log.filter((ts) => new Date(ts).toDateString() !== today)));
                      showToast('🔄 오늘 조회 기록이 초기화됐습니다');
                    }
                  }}
                >
                  🔄 오늘 기록 초기화
                </button>
              </div>
            </div>

            {/* 홈 화면 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-1 flex items-center gap-2">🏠 홈 화면 설정</h2>
              <p className="text-sm text-gray-500 mb-5">공고 목록 표시 방식, 인기 배너, 광고 크기를 조절합니다.</p>

              <div className="grid gap-5">
                {/* 공고 목록 */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b border-gray-100">📋 공고 목록 설정</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">페이지당 공고 수</label>
                      <select
                        value={homeLayout.pageSize}
                        onChange={(e) => setHomeLayout((p) => ({ ...p, pageSize: e.target.value }))}
                        className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none bg-white font-[inherit] focus:border-[#f97316]"
                      >
                        {['6','9','10','12','15','20','30'].map((v) => (
                          <option key={v} value={v}>{v}개씩 보기</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">인피드 광고 삽입 간격</label>
                      <select
                        value={homeLayout.infeedEvery}
                        onChange={(e) => setHomeLayout((p) => ({ ...p, infeedEvery: e.target.value }))}
                        className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none bg-white font-[inherit] focus:border-[#f97316]"
                      >
                        {['3','4','5','6','8','10','12'].map((v) => (
                          <option key={v} value={v}>{v}개마다 1회 삽입</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 인기 배너 */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b border-gray-100">🔥 인기 배너 섹션</h3>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      className={`relative w-11 h-6 rounded-full transition-colors ${homeLayout.showPopular ? 'bg-[#f97316]' : 'bg-gray-300'}`}
                      onClick={() => setHomeLayout((p) => ({ ...p, showPopular: !p.showPopular }))}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${homeLayout.showPopular ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {homeLayout.showPopular ? '🔥 인기 배너 표시 중' : '숨김'}
                    </span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1.5">상단 "급여 높은 TOP 5 / 숙식 제공 / 오늘 공고 / 용접 모집 / 화기감시자" 배너 행</p>
                </div>

                {/* 광고 크기 */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b border-gray-100">📐 광고 크기 설정</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">상단 배너 높이 (px)</label>
                      <input
                        type="number"
                        min={50} max={600}
                        value={homeLayout.adTopHeight}
                        onChange={(e) => setHomeLayout((p) => ({ ...p, adTopHeight: e.target.value }))}
                        placeholder="예: 90"
                        className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">인피드 광고 높이 (px)</label>
                      <input
                        type="number"
                        min={50} max={600}
                        value={homeLayout.adInfeedHeight}
                        onChange={(e) => setHomeLayout((p) => ({ ...p, adInfeedHeight: e.target.value }))}
                        placeholder="예: 90"
                        className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">하단 배너 높이 (px)</label>
                      <input
                        type="number"
                        min={50} max={600}
                        value={homeLayout.adBottomHeight}
                        onChange={(e) => setHomeLayout((p) => ({ ...p, adBottomHeight: e.target.value }))}
                        placeholder="예: 90"
                        className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">광고 최대 너비</label>
                      <select
                        value={homeLayout.adMaxWidth}
                        onChange={(e) => setHomeLayout((p) => ({ ...p, adMaxWidth: e.target.value }))}
                        className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none bg-white font-[inherit] focus:border-[#f97316]"
                      >
                        <option value="100%">전체 너비 (100%)</option>
                        <option value="728px">리더보드 (728px)</option>
                        <option value="640px">중형 (640px)</option>
                        <option value="468px">소형 (468px)</option>
                        <option value="336px">대형 사각형 (336px)</option>
                        <option value="320px">모바일 배너 (320px)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <button
                className="mt-5 flex items-center gap-2 bg-[#f97316] text-white border-none py-2.5 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                onClick={() => {
                  localStorage.setItem('cj_home_page_size', homeLayout.pageSize);
                  localStorage.setItem('cj_home_infeed_every', homeLayout.infeedEvery);
                  localStorage.setItem('cj_home_show_popular', homeLayout.showPopular ? 'on' : 'off');
                  localStorage.setItem('cj_ad_top_height', homeLayout.adTopHeight);
                  localStorage.setItem('cj_ad_infeed_height', homeLayout.adInfeedHeight);
                  localStorage.setItem('cj_ad_bottom_height', homeLayout.adBottomHeight);
                  localStorage.setItem('cj_ad_max_width', homeLayout.adMaxWidth);
                  showToast('✅ 홈 화면 설정이 저장됐습니다');
                }}
              >
                💾 홈 화면 설정 저장
              </button>
            </div>

            {/* 푸터 텍스트 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-1 flex items-center gap-2">✏️ 하단 텍스트 설정</h2>
              <p className="text-sm text-gray-500 mb-5">홈 화면 하단 푸터에 표시되는 세 줄의 텍스트를 수정합니다.</p>

              {/* 미리보기 */}
              <div className="rounded-xl mb-5 px-4 py-4 text-center" style={{ background: '#1e3a5f' }}>
                <p className="text-sm font-bold text-white mb-1">{footerText.title || '건설UP — 전국 건설 현장 일자리 정보'}</p>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{footerText.jobs || '(직종 목록)'}</p>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{footerText.notice || '(안내 문구)'}</p>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    ① 타이틀 <span className="text-gray-400 font-normal">(첫 번째 줄)</span>
                  </label>
                  <input
                    type="text"
                    value={footerText.title}
                    onChange={(e) => setFooterText((p) => ({ ...p, title: e.target.value }))}
                    placeholder="건설UP — 전국 건설 현장 일자리 정보"
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    ② 직종 목록 <span className="text-gray-400 font-normal">(두 번째 줄)</span>
                  </label>
                  <input
                    type="text"
                    value={footerText.jobs}
                    onChange={(e) => setFooterText((p) => ({ ...p, jobs: e.target.value }))}
                    placeholder="배관 · 용접 · 조공 · 화기감시자 · 형틀 · 철근 · 미장 · 도장"
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    ③ 안내 문구 <span className="text-gray-400 font-normal">(세 번째 줄)</span>
                  </label>
                  <input
                    type="text"
                    value={footerText.notice}
                    onChange={(e) => setFooterText((p) => ({ ...p, notice: e.target.value }))}
                    placeholder="※ 게재된 일자리 정보는 등록자 제공으로 정확성을 보장하지 않습니다."
                    className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                  />
                </div>
              </div>

              <button
                className="mt-5 flex items-center gap-2 bg-[#f97316] text-white border-none py-2.5 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                onClick={() => {
                  localStorage.setItem('cj_footer_title', footerText.title);
                  localStorage.setItem('cj_footer_jobs', footerText.jobs);
                  localStorage.setItem('cj_footer_notice', footerText.notice);
                  showToast('✅ 하단 텍스트가 저장됐습니다');
                }}
              >
                💾 하단 텍스트 저장
              </button>
            </div>

            {/* 지역 / 직종 관리 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-1 flex items-center gap-2">📍 지역 / 직종 관리</h2>
              <p className="text-sm text-gray-500 mb-4">홈 화면의 지역·직종 필터 버튼을 추가·삭제합니다.</p>

              {/* 탭 */}
              <div className="flex gap-2 mb-4">
                {(['region', 'job'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setRegionListTab(t)}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors font-[inherit] cursor-pointer ${
                      regionListTab === t
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-[#1e3a5f]'
                    }`}
                  >
                    {t === 'region' ? '📍 지역' : '🔧 직종'}
                  </button>
                ))}
              </div>

              {regionListTab === 'region' ? (
                <div>
                  {/* 추가 입력 */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newRegionInput}
                      onChange={(e) => setNewRegionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = newRegionInput.trim();
                          if (v && !customRegions.includes(v)) {
                            setCustomRegions((p) => [...p, v]);
                            setNewRegionInput('');
                          }
                        }
                      }}
                      placeholder="지역명 입력 (예: 울산)"
                      className="flex-1 py-2 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                    />
                    <button
                      onClick={() => {
                        const v = newRegionInput.trim();
                        if (v && !customRegions.includes(v)) {
                          setCustomRegions((p) => [...p, v]);
                          setNewRegionInput('');
                        }
                      }}
                      className="bg-[#f97316] text-white border-none px-4 py-2 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                    >
                      + 추가
                    </button>
                  </div>
                  {/* 현재 목록 */}
                  <div className="flex flex-wrap gap-2 mb-3 min-h-[40px] p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    {customRegions.length === 0 && (
                      <span className="text-xs text-gray-400 self-center">지역이 없습니다</span>
                    )}
                    {customRegions.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2.5 py-1 text-sm font-semibold text-gray-700 shadow-sm"
                      >
                        {r}
                        <button
                          onClick={() => setCustomRegions((p) => p.filter((x) => x !== r))}
                          className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors text-base leading-none cursor-pointer bg-transparent border-none font-[inherit]"
                          title="삭제"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    className="flex items-center gap-2 bg-[#f97316] text-white border-none py-2 px-5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                    onClick={() => {
                      localStorage.setItem('cj_custom_regions', JSON.stringify(customRegions));
                      showToast('✅ 지역 목록이 저장됐습니다');
                    }}
                  >
                    💾 지역 저장
                  </button>
                </div>
              ) : (
                <div>
                  {/* 추가 입력 */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newJobInput}
                      onChange={(e) => setNewJobInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = newJobInput.trim();
                          if (v && !customJobs.includes(v)) {
                            setCustomJobs((p) => [...p, v]);
                            setNewJobInput('');
                          }
                        }
                      }}
                      placeholder="직종명 입력 (예: 비계)"
                      className="flex-1 py-2 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                    />
                    <button
                      onClick={() => {
                        const v = newJobInput.trim();
                        if (v && !customJobs.includes(v)) {
                          setCustomJobs((p) => [...p, v]);
                          setNewJobInput('');
                        }
                      }}
                      className="bg-[#f97316] text-white border-none px-4 py-2 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                    >
                      + 추가
                    </button>
                  </div>
                  {/* 현재 목록 */}
                  <div className="flex flex-wrap gap-2 mb-3 min-h-[40px] p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    {customJobs.length === 0 && (
                      <span className="text-xs text-gray-400 self-center">직종이 없습니다</span>
                    )}
                    {customJobs.map((j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2.5 py-1 text-sm font-semibold text-gray-700 shadow-sm"
                      >
                        {j}
                        <button
                          onClick={() => setCustomJobs((p) => p.filter((x) => x !== j))}
                          className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors text-base leading-none cursor-pointer bg-transparent border-none font-[inherit]"
                          title="삭제"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    className="flex items-center gap-2 bg-[#f97316] text-white border-none py-2 px-5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                    onClick={() => {
                      localStorage.setItem('cj_custom_jobs', JSON.stringify(customJobs));
                      showToast('✅ 직종 목록이 저장됐습니다');
                    }}
                  >
                    💾 직종 저장
                  </button>
                </div>
              )}
            </div>

            {/* 이미지 광고 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-1 flex items-center gap-2">🖼️ 이미지 광고 설정</h2>
              <p className="text-sm text-gray-500 mb-4">이미지 파일을 업로드하고 클릭 시 이동할 URL을 설정합니다. 이미지 광고가 우선 적용됩니다.</p>

              {/* 슬롯 탭 */}
              <div className="flex gap-2 flex-wrap mb-5">
                {IMG_AD_SLOTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setImgAdSlot(s.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors font-[inherit] cursor-pointer ${
                      imgAdSlot === s.key
                        ? 'bg-[#f97316] text-white border-[#f97316]'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-[#f97316]'
                    }`}
                  >
                    {s.label}
                    {imgAdData[s.key]?.src && <span className="ml-1 text-[10px]">●</span>}
                  </button>
                ))}
              </div>

              {/* 현재 슬롯 편집 */}
              {(() => {
                const current = imgAdData[imgAdSlot] || { src: '', url: '' };
                return (
                  <div className="grid gap-4">
                    {/* 이미지 미리보기 */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-2">이미지 미리보기</label>
                      {current.src ? (
                        <div className="relative">
                          <img
                            src={current.src}
                            alt="광고 미리보기"
                            className="w-full rounded-lg object-cover border border-gray-200"
                            style={{ maxHeight: 180 }}
                          />
                          <button
                            onClick={() => setImgAdData((p) => ({ ...p, [imgAdSlot]: { ...p[imgAdSlot], src: '' } }))}
                            className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-lg cursor-pointer border-none font-[inherit] hover:bg-red-600"
                          >
                            ✕ 제거
                          </button>
                        </div>
                      ) : (
                        <div className="w-full rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center py-8 bg-gray-50">
                          <span className="text-2xl mb-2">🖼️</span>
                          <p className="text-xs text-gray-500">이미지를 업로드해 주세요</p>
                        </div>
                      )}
                    </div>

                    {/* 파일 업로드 */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-2">이미지 파일 선택</label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="bg-[#1e3a5f] text-white text-sm px-4 py-2 rounded-lg font-bold hover:bg-[#16304f] transition-colors">
                          📁 파일 선택
                        </span>
                        <span className="text-xs text-gray-500">{current.src ? '변경하려면 새 파일 선택' : 'JPG · PNG · WebP · GIF 권장'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 3 * 1024 * 1024) {
                              showToast('⚠️ 파일 크기가 3MB를 초과합니다');
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const src = ev.target?.result as string;
                              setImgAdData((p) => ({ ...p, [imgAdSlot]: { ...p[imgAdSlot], src } }));
                            };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {/* 클릭 링크 */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                        클릭 시 이동 URL <span className="text-gray-400 font-normal">(비워두면 링크 없음)</span>
                      </label>
                      <input
                        type="url"
                        value={current.url}
                        onChange={(e) => setImgAdData((p) => ({ ...p, [imgAdSlot]: { ...p[imgAdSlot], url: e.target.value } }))}
                        placeholder="https://example.com"
                        className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]"
                      />
                    </div>

                    {/* 버튼 */}
                    <div className="flex gap-3 flex-wrap">
                      <button
                        className="flex items-center gap-2 bg-[#f97316] text-white border-none py-2.5 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                        onClick={() => {
                          localStorage.setItem(`cj_imgad_${imgAdSlot}_src`, current.src);
                          localStorage.setItem(`cj_imgad_${imgAdSlot}_url`, current.url);
                          showToast('✅ 이미지 광고가 저장됐습니다');
                        }}
                      >
                        💾 저장
                      </button>
                      {current.src && (
                        <button
                          className="flex items-center gap-2 bg-white text-red-500 border border-red-300 py-2.5 px-5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-red-50 transition-colors font-[inherit]"
                          onClick={() => {
                            localStorage.removeItem(`cj_imgad_${imgAdSlot}_src`);
                            localStorage.removeItem(`cj_imgad_${imgAdSlot}_url`);
                            setImgAdData((p) => ({ ...p, [imgAdSlot]: { src: '', url: '' } }));
                            showToast('🗑️ 이미지 광고가 삭제됐습니다');
                          }}
                        >
                          🗑️ 삭제
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
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

            {/* head 코드 삽입 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h2 className="text-lg font-bold text-[#1e3a5f] flex items-center gap-2">
                  🧩 head 코드 삽입
                </h2>
                {headCode.trim() ? (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">✅ 적용 중</span>
                ) : (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-500">비어있음</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-5">
                구글 애드센스, Google Analytics(GA), 기타 메타 태그 등 <code className="bg-gray-100 px-1 rounded text-xs">&lt;head&gt;</code> 영역에 삽입할 HTML 코드를 붙여넣으세요.
              </p>

              {/* 빠른 예시 버튼 */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { label: 'GA4', code: '<!-- Google Analytics -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag(\'js\', new Date());\n  gtag(\'config\', \'G-XXXXXXXXXX\');\n</script>' },
                  { label: '애드센스', code: '<!-- Google AdSense -->\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX" crossorigin="anonymous"></script>' },
                  { label: '서치 콘솔', code: '<meta name="google-site-verification" content="여기에_인증코드_입력">' },
                  { label: 'Naver 인증', code: '<meta name="naver-site-verification" content="여기에_인증코드_입력">' },
                ].map((ex) => (
                  <button
                    key={ex.label}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-300 text-gray-600 bg-white hover:border-[#f97316] hover:text-[#f97316] cursor-pointer font-[inherit] transition-colors"
                    onClick={() => {
                      setHeadCode((prev) => {
                        const trimmed = prev.trim();
                        return trimmed ? trimmed + '\n\n' + ex.code : ex.code;
                      });
                      showToast(`📋 ${ex.label} 예시 코드가 추가됐습니다. 수정 후 저장하세요.`);
                    }}
                  >
                    + {ex.label} 예시
                  </button>
                ))}
              </div>

              <textarea
                value={headCode}
                onChange={(e) => setHeadCode(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={`<!-- 여기에 head 코드를 붙여넣으세요 -->\n\n예시:\n<meta name="google-site-verification" content="...">\n\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>\n<script>\n  // GA 코드\n</script>`}
                className="w-full py-3 px-4 border-[1.5px] border-gray-200 rounded-xl text-[13px] outline-none font-mono leading-relaxed resize-y focus:border-[#1e3a5f] bg-gray-50"
                style={{ minHeight: '200px' }}
              />

              <div className="flex gap-3 mt-3 flex-wrap">
                <button
                  className="flex items-center gap-2 bg-[#f97316] text-white border-none py-2.5 px-6 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                  onClick={() => {
                    localStorage.setItem('cj_head_inject', headCode);
                    window.dispatchEvent(new Event('head-inject-updated'));
                    showToast('✅ head 코드가 저장됐습니다. 새로고침 없이 즉시 적용됩니다.');
                  }}
                >
                  💾 저장 및 적용
                </button>
                {headCode.trim() && (
                  <button
                    className="flex items-center gap-2 bg-red-50 text-red-500 border-2 border-red-300 py-2.5 px-5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-red-100 transition-colors font-[inherit]"
                    onClick={() => {
                      if (!confirm('저장된 head 코드를 모두 삭제하시겠습니까?')) return;
                      setHeadCode('');
                      localStorage.removeItem('cj_head_inject');
                      window.dispatchEvent(new Event('head-inject-updated'));
                      showToast('🗑 head 코드가 삭제됐습니다');
                    }}
                  >
                    🗑 전체 삭제
                  </button>
                )}
              </div>

              <div className="mt-4 bg-amber-50 rounded-xl p-4 text-xs text-amber-800 space-y-1">
                <p className="font-bold">⚠️ 주의사항</p>
                <ul className="list-disc list-inside space-y-0.5 leading-relaxed">
                  <li>저장 즉시 모든 페이지에 적용됩니다</li>
                  <li><code className="bg-amber-100 px-1 rounded">&lt;script&gt;</code> 태그 포함 허용 (애드센스, GA 필요)</li>
                  <li>잘못된 코드 입력 시 사이트 오류가 발생할 수 있습니다</li>
                  <li>기존 OG 태그, SEO 태그와 중복되지 않도록 확인하세요</li>
                  <li>서버 재시작 후에도 localStorage에서 자동 복원됩니다</li>
                </ul>
              </div>
            </div>

            {/* 구글 서치 콘솔 연동 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h2 className="text-lg font-bold text-[#1e3a5f] flex items-center gap-2">
                  🔍 구글 서치 콘솔 연동
                </h2>
                {googleVerifyCode ? (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">✅ 인증 코드 저장됨</span>
                ) : (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-500">미연동</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-5">
                Google Search Console에서 도메인 소유권을 인증하세요. 검색 노출 및 SEO 관리에 필요합니다.
              </p>

              {/* 방법 선택 탭 */}
              <div className="flex gap-2 mb-5">
                {[
                  { key: 'html' as const, label: '① HTML 메타 태그' },
                  { key: 'dns' as const, label: '② DNS TXT 레코드' },
                ].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setGoogleVerifyMethod(m.key)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold border cursor-pointer font-[inherit] transition-colors ${
                      googleVerifyMethod === m.key
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-[#1e3a5f]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {googleVerifyMethod === 'html' ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 space-y-1.5">
                    <p className="font-bold">📋 적용 방법</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
                      <li><a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="underline font-semibold">search.google.com/search-console</a> 접속 → 속성 추가</li>
                      <li>URL 접두어 방식 선택 → <strong>https://geonseolup.com</strong> 입력</li>
                      <li>확인 방법: <strong>HTML 태그</strong> 선택</li>
                      <li>아래에 표시된 인증 코드를 복사하여 입력란에 붙여넣기</li>
                      <li>저장 버튼 클릭 → Google에서 자동으로 메타 태그 확인</li>
                    </ol>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">
                      google-site-verification 인증 코드
                    </label>
                    <p className="text-xs text-gray-400 mb-2">
                      Google Search Console에서 보여주는 메타 태그의 <code className="bg-gray-100 px-1 rounded">content</code> 값을 입력하세요
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={googleVerifyCode}
                        onChange={(e) => setGoogleVerifyCode(e.target.value.trim())}
                        placeholder="예: l4zDs-p4J7QbOLz50rVdfxE9wRU_ivHQ0obfKP"
                        className="flex-1 py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f] font-mono"
                      />
                      <button
                        className="bg-[#1e3a5f] text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-[#2d5282] transition-colors font-[inherit] whitespace-nowrap"
                        onClick={() => {
                          if (!googleVerifyCode.trim()) { showToast('⚠️ 인증 코드를 입력해주세요'); return; }
                          localStorage.setItem('cj_google_verify', googleVerifyCode.trim());
                          showToast('✅ 구글 인증 코드가 저장됐습니다');
                          window.dispatchEvent(new Event('google-verify-updated'));
                        }}
                      >
                        저장
                      </button>
                      {googleVerifyCode && (
                        <button
                          className="bg-red-50 text-red-500 border border-red-300 py-2.5 px-4 rounded-xl text-sm font-bold cursor-pointer hover:bg-red-100 transition-colors font-[inherit]"
                          onClick={() => {
                            localStorage.removeItem('cj_google_verify');
                            setGoogleVerifyCode('');
                            showToast('🗑 인증 코드가 삭제됐습니다');
                            window.dispatchEvent(new Event('google-verify-updated'));
                          }}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                  {googleVerifyCode && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300">
                      <p className="text-xs font-bold text-gray-600 mb-2">🏷 사이트에 자동 적용되는 메타 태그:</p>
                      <code className="text-xs text-gray-700 break-all">
                        {`<meta name="google-site-verification" content="${googleVerifyCode}">`}
                      </code>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800 space-y-1.5">
                    <p className="font-bold">📋 DNS TXT 레코드 적용 방법</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
                      <li><a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="underline font-semibold">search.google.com/search-console</a> 접속 → 속성 추가</li>
                      <li>도메인 방식 선택 → <strong>geonseolup.com</strong> 입력</li>
                      <li>Google이 제공하는 TXT 레코드 값 복사</li>
                      <li>도메인 구매처(GoDaddy, Namecheap, 가비아 등) DNS 관리 페이지 접속</li>
                      <li>TXT 레코드 추가: 호스트 <code className="bg-amber-100 px-1 rounded">@</code>, 값에 복사한 TXT 값 붙여넣기</li>
                      <li>저장 후 Google Search Console에서 확인 클릭 (최대 48시간 소요)</li>
                    </ol>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">
                      TXT 레코드 값 메모 (참고용)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={googleVerifyCode}
                        onChange={(e) => setGoogleVerifyCode(e.target.value.trim())}
                        placeholder="google-site-verification=xxxx..."
                        className="flex-1 py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#1e3a5f] font-mono"
                      />
                      <button
                        className="bg-gray-100 text-gray-700 border border-gray-300 py-2.5 px-4 rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-200 transition-colors font-[inherit]"
                        onClick={() => {
                          if (!googleVerifyCode) return;
                          navigator.clipboard.writeText(`google-site-verification=${googleVerifyCode}`).then(() => showToast('📋 복사됐습니다'));
                        }}
                      >
                        복사
                      </button>
                      <button
                        className="bg-[#1e3a5f] text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-[#2d5282] transition-colors font-[inherit]"
                        onClick={() => {
                          localStorage.setItem('cj_google_verify', googleVerifyCode.trim());
                          showToast('✅ 저장됐습니다');
                        }}
                      >
                        저장
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">DNS TXT 레코드 값을 여기에 메모해두면 나중에 참고할 수 있습니다.</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300 text-xs text-gray-600">
                    <p className="font-bold mb-1.5">DNS 레코드 설정 예시:</p>
                    <div className="grid grid-cols-3 gap-2 text-center font-mono">
                      <div><p className="font-bold text-gray-500 mb-1">유형</p><p className="bg-white rounded px-2 py-1 border">TXT</p></div>
                      <div><p className="font-bold text-gray-500 mb-1">호스트</p><p className="bg-white rounded px-2 py-1 border">@</p></div>
                      <div><p className="font-bold text-gray-500 mb-1">값</p><p className="bg-white rounded px-2 py-1 border truncate">google-site-...</p></div>
                    </div>
                  </div>
                </div>
              )}
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
