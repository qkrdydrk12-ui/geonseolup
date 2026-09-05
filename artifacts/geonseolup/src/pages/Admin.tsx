import { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import type { Job, PendingJob, JobReport } from '@/lib/firebase';
import {
  fbLoadJobs,
  fbAddJob,
  fbToggleHide,
  fbDeleteJob,
  fbLoadPending,
  fbUpdatePending,
  fbDeletePending,
  fbPurgeOldHiddenJobs,
  fbAutoDeleteOldJobs,
  fbAddReservedJob,
  fbCancelReservation,
  fbRetryReservation,
  fbSaveReservationLog,
  fbLoadReservationLogs,
  fbLoadReports,
  fbDeleteReport,
  fbSetSetting,
  fbGetSetting,
  fbInvalidatePublicCache,
  type ReservationLog,
} from '@/lib/firebase';
import { SAMPLE_JOBS } from '@/data/sampleJobs';
import { formatDate, parseSalaryNum, WELD_SUBS } from '@/lib/utils';
import {
  REGIONS, JOBS, MEALS, LODGINGS,
  extractPhones, parseJobText, generateSEOTitle,
  toManStr, buildWageDisplayText,
  type SalaryCandidate, type ComplexSalaryResult,
} from '@/lib/parseJob';
import AdminProducts from '@/components/AdminProducts';
import AdminSiteNews from '@/components/AdminSiteNews';
import AdminBlogArticles from '@/components/AdminBlogArticles';
import AdminToon from '@/components/AdminToon';
import { DEFAULT_STOPS as DEFAULT_SHUTTLE_SCHEDULE_YONGIN_SK, type ShuttleGroup as ShuttleScheduleGroup } from '@/lib/shuttleScheduleYonginSK';
import { DEFAULT_ROUTES as DEFAULT_SHUTTLE_SCHEDULE_PYEONGTAEK_SAMSUNG, type ShuttleCompanyGroup } from '@/lib/shuttleSchedulePyeongtaekSamsung';
import {
  getToken,
  setToken,
  clearToken,
  apiLogin,
  apiLogout,
  apiVerify,
  apiUpdateCreds,
} from '@/lib/adminAuth';


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


function emptyForm(): Partial<Job> {
  return {
    title: '', region: '', job: '', weldSub: '', weldTest: '',
    salary: '', meal: '', lodging: '', contact: '', detail: '', originalText: '',
    company: '', headcount: '', ageLimit: '', startDate: '', manager: '', site: '', line: '',
    dailyWage: undefined, extraPay: undefined, totalExpectedPay: undefined,
    wageBreakdowns: undefined, needsReview: undefined,
  };
}

type Tab = 'jobs' | 'add' | 'pending' | 'reports' | 'products' | 'news' | 'blog' | 'toon' | 'settings' | 'stats';

interface HourlyRow { hour: number; count: number; }
interface VisitorTotals { today: number; yesterday: number; week: number; total: number; }
interface SourceRow { source: string; label: string; count: number; }
interface CampaignRow {
  source: string;
  label: string;
  medium: string;
  campaign: string;
  content: string;
  landingPath: string;
  count: number;
}
interface LandingRow {
  source: string;
  label: string;
  landingPath: string;
  count: number;
}
interface UnknownDeviceRow { device: 'mobile' | 'desktop'; count: number; }

// 유입 경로별 표시 스타일 — 순서·색은 카테고리별로 고정(값 순위에 따라 바뀌지 않음)
const SOURCE_STYLE: Record<string, { label: string; color: string; icon: string }> = {
  threads:   { label: 'Threads',    color: '#2a78d6', icon: '🧵' },
  google:    { label: 'Google',     color: '#eb6834', icon: '🔎' },
  naver_search: { label: '네이버 검색', color: '#03c75a', icon: 'N' },
  naver_cafe:   { label: '네이버 카페', color: '#00a86b', icon: '☕' },
  naver_blog:   { label: '네이버 블로그', color: '#2db400', icon: '📝' },
  naver_kin:    { label: '네이버 지식iN', color: '#16a34a', icon: '💡' },
  naver_other:  { label: '네이버(기타)', color: '#65a30d', icon: 'N' },
  daum_search:  { label: '다음 검색', color: '#4c6ef5', icon: 'D' },
  daum_cafe:    { label: '다음 카페', color: '#4263eb', icon: '☕' },
  daum_blog:    { label: '다음 블로그', color: '#5c7cfa', icon: '📝' },
  daum_other:   { label: '다음(기타)', color: '#748ffc', icon: 'D' },
  tistory:      { label: '티스토리', color: '#f05a28', icon: 'T' },
  dcinside:     { label: '디시인사이드', color: '#3b4890', icon: 'DC' },
  ppomppu:      { label: '뽐뿌', color: '#2563eb', icon: 'P' },
  clien:        { label: '클리앙', color: '#0f766e', icon: 'C' },
  fmkorea:      { label: '에펨코리아', color: '#1d4ed8', icon: 'FM' },
  ruliweb:      { label: '루리웹', color: '#7c3aed', icon: 'R' },
  community:    { label: '기타 커뮤니티', color: '#8b5cf6', icon: '👥' },
  cafe:         { label: '기타 카페', color: '#a855f7', icon: '☕' },
  blog:         { label: '기타 블로그', color: '#d946ef', icon: '📝' },
  band:      { label: '네이버 밴드', color: '#008300', icon: '🥁' },
  instagram: { label: 'Instagram',  color: '#e87ba4', icon: '📸' },
  facebook:  { label: 'Facebook',   color: '#4a3aa7', icon: 'f' },
  kakao:     { label: '카카오',      color: '#eda100', icon: '💬' },
  twitter:   { label: 'X(트위터)',   color: '#e34948', icon: '✕' },
  youtube:   { label: 'YouTube',     color: '#ef4444', icon: '▶' },
  telegram:  { label: '텔레그램',     color: '#229ed9', icon: '✈' },
  unknown:   { label: '출처 미확인',   color: '#898781', icon: '❔' },
  direct:    { label: '직접 방문',   color: '#898781', icon: '🔗' },
  other:     { label: '기타',        color: '#c3c2b7', icon: '❔' },
  // User-Agent 기반 인앱브라우저 추정치(2026-08-30) — 원 채널 색을 옅게(연한 톤) 써서
  // referrer/UTM으로 확정된 값과 시각적으로 구분한다.
  kakao_inapp:     { label: '카카오톡(추정)', color: '#f0c064', icon: '💬' },
  instagram_inapp: { label: 'Instagram(추정)', color: '#f0b0cc', icon: '📸' },
  naver_inapp:     { label: '네이버(추정)', color: '#8fd6a8', icon: 'N' },
  facebook_inapp:  { label: 'Facebook(추정)', color: '#a89adf', icon: 'f' },
};

function readableLandingPath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true); // 토큰 검증 중
  // 이 브라우저는 사이트 주인 것 — 관리자 페이지를 연 순간 영구 표시해서
  // 이후 방문은 (로그인 여부와 무관하게) 방문자 통계에 잡히지 않게 한다.
  useEffect(() => {
    try { localStorage.setItem('geonseolup_owner', '1'); } catch { /* 무시 */ }
  }, []);
  const [adminId, setAdminId] = useState(() => localStorage.getItem('cj_saved_id') || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('cj_saved_id'));
  const [pwError, setPwError] = useState(false);
  const [pwErrorMsg, setPwErrorMsg] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showFindModal, setShowFindModal] = useState(false);
  const [findEmail, setFindEmail] = useState('');
  const [findPhone, setFindPhone] = useState('');
  const [findSent, setFindSent] = useState(false);
  const [tab, setTab] = useState<Tab>('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [deletingFailed, setDeletingFailed] = useState(false);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Partial<Job>>(emptyForm());
  const [parseText, setParseText] = useState('');
  const [parseResult, setParseResult] = useState<(Partial<Job> & { _salaryCalc?: string; _salaryCandidates?: SalaryCandidate[]; _complexSalary?: ComplexSalaryResult; _phoneCandidates?: string[] }) | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveModalTab, setReserveModalTab] = useState<'delay' | 'custom'>('delay');
  const [delayHours, setDelayHours] = useState<number>(3);
  const [reserveDate, setReserveDate] = useState('');
  const [reserveTime, setReserveTime] = useState('');
  const [repeatDays, setRepeatDays] = useState<number>(0);
  const [useRandomSpread, setUseRandomSpread] = useState(false);
  const [reservationLogs, setReservationLogs] = useState<ReservationLog[]>([]);
  const [reports, setReports] = useState<JobReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsEnabledUI, setReportsEnabledUI] = useState(() => localStorage.getItem('cj_reports_enabled') !== '0');
  // ── 자연스러운 발행 (랜덤 분산) 설정 ──────────────────────────────────────
  const [naturalPublish, setNaturalPublish] = useState(() => localStorage.getItem('cj_natural_publish') === '1');
  const [naturalRandRange, setNaturalRandRange] = useState<'0-3' | '0-5' | '5-10' | 'custom'>(() => {
    const v = localStorage.getItem('cj_natural_range');
    return (['0-3', '0-5', '5-10', 'custom'].includes(v || '') ? v : '0-5') as '0-3' | '0-5' | '5-10' | 'custom';
  });
  const [naturalCustomMin, setNaturalCustomMin] = useState(() => Number(localStorage.getItem('cj_natural_cmin') || '2'));
  const [naturalCustomMax, setNaturalCustomMax] = useState(() => Number(localStorage.getItem('cj_natural_cmax') || '10'));
  // ── 붙여넣기 자동 교체 설정 ────────────────────────────────────────────────
  const [autoReplacePaste, setAutoReplacePaste] = useState(() => localStorage.getItem('cj_auto_replace_paste') !== '0');
  const [showLogsModal, setShowLogsModal] = useState(false);
  // 방문 통계
  const [hourlyData, setHourlyData] = useState<HourlyRow[]>([]);
  const [visitorTotals, setVisitorTotals] = useState<VisitorTotals | null>(null);
  const [statsDate, setStatsDate] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
  const [statsLoading, setStatsLoading] = useState(false);
  const [sourceData, setSourceData] = useState<SourceRow[]>([]);
  const [campaignData, setCampaignData] = useState<CampaignRow[]>([]);
  const [landingData, setLandingData] = useState<LandingRow[]>([]);
  const [unknownDeviceData, setUnknownDeviceData] = useState<UnknownDeviceRow[]>([]);
  const [sourceDays, setSourceDays] = useState<1 | 7>(1);
  const [settings, setSettings] = useState({
    adminPw: localStorage.getItem('cj_admin_pw') || 'wns585426!@',
    contactEmail: localStorage.getItem('cj_contact_email') || 'qkrdydrk@naver.com',
    contactKakao: localStorage.getItem('cj_contact_kakao') || '010-5567-2710',
    contactLabel: localStorage.getItem('cj_contact_label') || '',
    autoHideHours: '',
    shareUrl: localStorage.getItem('cj_share_url') || '',
    openChatUrl: localStorage.getItem('cj_openchat_url') || '',
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
  const [autoDeleteHours, setAutoDeleteHours] = useState<string>(() => {
    const stored = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
    return stored.autoDeleteHours != null ? String(stored.autoDeleteHours) : '0';
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

  // ── 연속 등록 UX 설정 ──────────────────────────────────────────────────────
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [quickMode, setQuickMode] = useState(() => localStorage.getItem('cj_quick_mode') === '1');
  const [clearAfterSubmit, setClearAfterSubmit] = useState(() => localStorage.getItem('cj_clear_after_submit') !== '0');
  const [keepFields, setKeepFields] = useState<{ company: boolean; region: boolean; contact: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem('cj_keep_fields') || '{"company":false,"region":false,"contact":false}'); }
    catch { return { company: false, region: false, contact: false }; }
  });
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(() => {
    const d = localStorage.getItem('cj_form_draft');
    if (!d) return false;
    try { const f = JSON.parse(d); return !!(f.title || f.originalText); } catch { return false; }
  });

  // ── 고속 등록 UX ──────────────────────────────────────────────────────────
  const parseTextareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autoQuadInFlightRef = useRef(false);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [acHistory, setAcHistory] = useState<{ companies: string[]; sites: string[]; contacts: string[] }>(() => {
    try { return JSON.parse(localStorage.getItem('cj_ac_history') || '{"companies":[],"sites":[],"contacts":[]}'); }
    catch { return { companies: [], sites: [], contacts: [] }; }
  });

  const DEFAULT_REGIONS_ADMIN = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '해외'];
  const DEFAULT_JOBS_ADMIN = ['조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비', '화기감시자', '유도원', '양중', '덕트', '비계', '포설', '보온', '관리자', '안전담당자', '안전시설반', '품질담당자', '공사담당자', '기타'];

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
  const [customJobs, setCustomJobs] = useState<string[]>(() => {
    const list = loadList('cj_custom_jobs', DEFAULT_JOBS_ADMIN);
    // 기존 저장 목록에 신규 직종이 없으면 '기타' 앞에 추가
    const merged = [...list];
    for (const j of ['포설', '보온', '관리자']) {
      if (!merged.includes(j)) {
        const idx = merged.indexOf('기타');
        merged.splice(idx === -1 ? merged.length : idx, 0, j);
      }
    }
    return merged;
  });
  const [newRegionInput, setNewRegionInput] = useState('');
  const [newJobInput, setNewJobInput] = useState('');

  // 셔틀시간표 드롭다운(홈 화면) 링크 목록 — 실제 반영 값은 Firestore settings/shuttle_links.
  // icon/color는 회사 브랜드 느낌을 내려고 넣은 선택 항목(예: SK 레드, 삼성 블루).
  const DEFAULT_SHUTTLE_LINKS_ADMIN: { label: string; href: string; icon: string; color: string }[] = [
    { label: '용인SK셔틀', href: '/info/yongin-sk-shuttle-schedule', icon: '🚍', color: '#EE1C25' },
    { label: '평택삼성셔틀', href: '/info/pyeongtaek-samsung-shuttle-schedule', icon: '🚌', color: '#1428A0' },
  ];
  const [shuttleLinks, setShuttleLinks] = useState<{ label: string; href: string; icon?: string; color?: string }[]>(() => {
    try {
      const stored = localStorage.getItem('cj_shuttle_links');
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch {}
    return DEFAULT_SHUTTLE_LINKS_ADMIN;
  });

  // 용인SK 셔틀시간표 본문 데이터(정류장별 출근/퇴근 시간표) — 실제 반영 값은
  // Firestore settings/shuttle_schedule_yongin_sk. ShuttleScheduleYonginSK.tsx가 읽어감.
  const [shuttleSchedule, setShuttleSchedule] = useState<ShuttleScheduleGroup[]>(() => {
    try {
      const stored = localStorage.getItem('cj_shuttle_schedule_yongin_sk');
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch {}
    return DEFAULT_SHUTTLE_SCHEDULE_YONGIN_SK;
  });
  const [shuttleScheduleOpenStop, setShuttleScheduleOpenStop] = useState<string | null>(null);

  // 평택삼성 셔틀시간표 본문 데이터(노선별 출근/퇴근/주말 시간표) — 실제 반영 값은
  // Firestore settings/shuttle_schedule_pyeongtaek_samsung. ShuttleSchedulePyeongtaekSamsung.tsx가 읽어감.
  const [samsungShuttleSchedule, setSamsungShuttleSchedule] = useState<ShuttleCompanyGroup[]>(() => {
    try {
      const stored = localStorage.getItem('cj_shuttle_schedule_pyeongtaek_samsung');
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch {}
    return DEFAULT_SHUTTLE_SCHEDULE_PYEONGTAEK_SAMSUNG;
  });
  const [samsungShuttleOpenRoute, setSamsungShuttleOpenRoute] = useState<string | null>(null);

  const [footerText, setFooterText] = useState({
    title: localStorage.getItem('cj_footer_title') || '건설UP — 전국 건설 현장 일자리 정보',
    jobs: localStorage.getItem('cj_footer_jobs') || '배관 · 용접(TIG/아크/CO2/PVC/자동) · 조공 · 화기감시자 · 형틀 · 철근 · 미장 · 도장',
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

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2600);
  }

  const loadHourlyStats = useCallback(async (date: string, days: 1 | 7 = sourceDays) => {
    setStatsLoading(true);
    try {
      const token = getToken();
      const [hourly, totals, sources] = await Promise.all([
        fetch(`/api/stats/hourly?date=${date}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch('/api/stats/visitors', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch(`/api/stats/sources?date=${date}&days=${days}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      ]);
      setHourlyData(hourly.rows ?? []);
      setVisitorTotals(totals);
      setSourceData(sources.rows ?? []);
      setCampaignData(sources.campaigns ?? []);
      setLandingData(sources.landings ?? []);
      setUnknownDeviceData(sources.unknownByDevice ?? []);
    } catch {
      showToast('통계 조회 실패');
    } finally {
      setStatsLoading(false);
    }
  }, [sourceDays]);

  function handleSourceDaysChange(days: 1 | 7) {
    setSourceDays(days);
    loadHourlyStats(statsDate, days);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setPwError(false);
    setPwErrorMsg('');
    const result = await apiLogin(adminId, password);
    if (result.ok && result.token) {
      if (rememberMe) localStorage.setItem('cj_saved_id', adminId);
      else localStorage.removeItem('cj_saved_id');
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
    window.dispatchEvent(new Event('admin-logout'));
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

  async function saveAutoHide() {
    const h = parseInt(autoHideHours) || 0;
    const prev = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
    const next = { ...prev, autoHideHours: h };
    localStorage.setItem('cj_dup_settings', JSON.stringify(next));
    // 서버 스케줄러가 30분마다 읽도록 Firestore에도 동기화 (관리자 미접속 시에도 정리 동작)
    await fbSetSetting('dup_settings', next);
    computeDupStats(jobs, autoHideHours);
    showToast('✅ 자동숨김 설정이 저장됐습니다 (서버 동기화 완료)');
  }

  async function saveAutoDelete() {
    const h = parseInt(autoDeleteHours) || 0;
    const hide = parseInt(autoHideHours) || 0;
    if (h > 0 && hide > 0 && h <= hide) {
      showToast('⚠️ 자동삭제 시간은 자동숨김 시간보다 길어야 합니다');
      return;
    }
    const prev = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
    const next = { ...prev, autoDeleteHours: h };
    localStorage.setItem('cj_dup_settings', JSON.stringify(next));
    // 서버 스케줄러가 30분마다 읽도록 Firestore에도 동기화 (관리자 미접속 시에도 자동삭제 동작)
    await fbSetSetting('dup_settings', next);
    if (h === 0) {
      showToast('✅ 자동삭제가 비활성화됐습니다 (서버 동기화 완료)');
    } else {
      showToast('✅ 자동삭제 설정이 저장됐습니다 (서버 자동 실행 / 데이터 영구 삭제)');
    }
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

  useEffect(() => {
    if (authed) {
      loadJobs();
      loadPending();
      // 서버에 저장된 dup_settings(자동숨김/자동삭제 시간)을 가져와 로컬에 동기화 (크로스 디바이스)
      (async () => {
        try {
          const remote = (await fbGetSetting('dup_settings')) as { autoHideHours?: number; autoDeleteHours?: number } | null;
          if (remote && typeof remote === 'object') {
            const prev = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
            const merged = { ...prev, ...remote };
            localStorage.setItem('cj_dup_settings', JSON.stringify(merged));
            if (typeof remote.autoHideHours === 'number') setAutoHideHours(String(remote.autoHideHours));
            if (typeof remote.autoDeleteHours === 'number') setAutoDeleteHours(String(remote.autoDeleteHours));
          }
        } catch (e) {
          console.warn('[Admin] dup_settings 원격 동기화 실패', e);
        }
      })();
      // 셔틀시간표 링크 목록도 서버에서 최신으로 동기화 (다른 기기에서 수정했을 수 있음)
      (async () => {
        try {
          const remote = await fbGetSetting('shuttle_links');
          if (Array.isArray(remote) && remote.length > 0) {
            setShuttleLinks(remote as { label: string; href: string; icon?: string; color?: string }[]);
            localStorage.setItem('cj_shuttle_links', JSON.stringify(remote));
          }
        } catch (e) {
          console.warn('[Admin] shuttle_links 원격 동기화 실패', e);
        }
      })();
      // 용인SK 셔틀시간표 데이터도 서버에서 최신으로 동기화
      (async () => {
        try {
          const remote = await fbGetSetting('shuttle_schedule_yongin_sk');
          if (Array.isArray(remote) && remote.length > 0) {
            setShuttleSchedule(remote as ShuttleScheduleGroup[]);
            localStorage.setItem('cj_shuttle_schedule_yongin_sk', JSON.stringify(remote));
          }
        } catch (e) {
          console.warn('[Admin] shuttle_schedule_yongin_sk 원격 동기화 실패', e);
        }
      })();
      // 평택삼성 셔틀시간표 데이터도 서버에서 최신으로 동기화
      (async () => {
        try {
          const remote = await fbGetSetting('shuttle_schedule_pyeongtaek_samsung');
          if (Array.isArray(remote) && remote.length > 0) {
            setSamsungShuttleSchedule(remote as ShuttleCompanyGroup[]);
            localStorage.setItem('cj_shuttle_schedule_pyeongtaek_samsung', JSON.stringify(remote));
          }
        } catch (e) {
          console.warn('[Admin] shuttle_schedule_pyeongtaek_samsung 원격 동기화 실패', e);
        }
      })();
    }
  }, [authed]);

  // 자동숨김 DB 기록 + 24시간 지난 숨김 공고 하드삭제 (30분마다 실행)
  useEffect(() => {
    if (!authed) return;

    async function runCleanup() {
      const stored = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
      const autoDeleteHours: number = stored.autoDeleteHours ?? 0;
      const all = await fbLoadJobs();
      // 자동숨김(fbAutoHideOldJobs)은 더 이상 호출하지 않는다 —
      // "등록 48시간 후 모집마감"은 서버가 등록일 기준으로 자동 판정하며,
      // hidden 처리하면 마감 공고의 상세 페이지(90일 유지)까지 사라져 SEO에 해롭다.
      const purged = await fbPurgeOldHiddenJobs(all);
      // 완전 삭제는 최소 92일(활성 2일 + 마감 상태 90일 유지) 이후에만 —
      // 관리자 설정값이 더 짧아도 상세 페이지 유지 기간을 침범하지 않게 하한을 둔다.
      const MIN_DELETE_HOURS = 92 * 24;
      const deleted = await fbAutoDeleteOldJobs(all, Math.max(autoDeleteHours || MIN_DELETE_HOURS, MIN_DELETE_HOURS));
      if (purged > 0 || deleted > 0) {
        loadJobs();
      }
    }

    runCleanup();
    const timer = setInterval(runCleanup, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [authed]);

  useEffect(() => {
    if (authed && tab === 'reports') {
      (async () => {
        setReportsLoading(true);
        setReports(await fbLoadReports());
        setReportsLoading(false);
      })();
    }
    if (authed && tab === 'stats') {
      loadHourlyStats(statsDate);
    }
  }, [authed, tab, loadHourlyStats]);

  // ── 예약 헬퍼 ──────────────────────────────────────────────────────────────
  function toKSTIso(date: string, time: string): string {
    return new Date(`${date}T${time}:00+09:00`).toISOString();
  }
  function formatKST(isoStr: string): string {
    return new Date(isoStr).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }
  function nowKSTDate(): string {
    return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  }

  // 예약 확정
  async function handleReserve() {
    if (!form.title?.trim() || !form.region || !form.job) {
      showToast('⚠️ 필수 항목을 입력해주세요 (제목, 지역, 직종)');
      return;
    }
    let reservedAt: string;
    if (reserveModalTab === 'delay') {
      reservedAt = new Date(Date.now() + delayHours * 3600000).toISOString();
    } else {
      if (!reserveDate || !reserveTime) {
        showToast('⚠️ 날짜와 시간을 선택해주세요');
        return;
      }
      reservedAt = toKSTIso(reserveDate, reserveTime);
      if (new Date(reservedAt).getTime() <= Date.now()) {
        showToast('⚠️ 과거 시간은 예약할 수 없습니다');
        return;
      }
    }
    // 랜덤 분산 ±5~15분
    if (useRandomSpread) {
      const spread = Math.floor(Math.random() * 11) + 5;
      reservedAt = new Date(new Date(reservedAt).getTime() + spread * 60000).toISOString();
    }
    // 자동 간격 분산: 10분 내 충돌 예약 → 뒤로 밀기
    const reserved = jobs.filter((j) => j.status === 'reserved' && j.reservedAt);
    const targetMs = new Date(reservedAt).getTime();
    const conflicting = reserved.filter(
      (j) => Math.abs(new Date(j.reservedAt!).getTime() - targetMs) < 10 * 60000
    );
    if (conflicting.length > 0) {
      const latestMs = Math.max(...conflicting.map((j) => new Date(j.reservedAt!).getTime()));
      const gap = Math.floor(Math.random() * 8) + 3;
      reservedAt = new Date(latestMs + gap * 60000).toISOString();
      showToast(`⚡ 동시간대 분산: ${formatKST(reservedAt)}으로 조정됩니다`);
    }
    setSubmitting(true);
    try {
      // 안전망: contact가 비었는데 원문에 010 번호가 있으면 자동 보강
      let safeContact = form.contact || '';
      if (!safeContact.trim() && form.originalText) {
        const rescued = extractPhones(form.originalText).main;
        if (rescued) {
          safeContact = rescued;
          console.log('[Reserve] 안전망: 원문에서 전화번호 자동 보강 →', rescued);
        }
      }
      const jobData: Omit<Job, 'id'> = {
        ...(form as Omit<Job, 'id'>),
        contact: safeContact,
        salaryNum: parseSalaryNum(form.salary || ''),
        date: new Date().toISOString(),
        hidden: false,
        repeatDays,
        retryCount: 0,
        dispatchMode: 'manual' as const,
      };
      console.log('[Reserve] Firebase 저장 시작:', form.title, '→', formatKST(reservedAt));
      const savedId = await fbAddReservedJob(jobData, reservedAt);
      console.log('[Reserve] Firebase 저장 완료, id:', savedId, 'reservedAt:', reservedAt);
      await fbSaveReservationLog({
        jobId: savedId,
        jobTitle: form.title || '',
        scheduledAt: reservedAt,
        status: 'published',
        repeatDays: repeatDays || undefined,
        isRepeat: false,
        createdAt: new Date().toISOString(),
      });
      const repeatLabel = repeatDays > 0 ? ` (${repeatDays}일 반복 설정)` : '';
      showToast(`✅ ${formatKST(reservedAt)} 예약됐습니다${repeatLabel}`);
      setShowReserveModal(false);
      applySmartClear(form);
      if (quickMode) setTimeout(() => titleInputRef.current?.focus(), 80);
      await loadJobs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Reserve] 예약 등록 실패:', msg, err);
      showToast(`❌ 예약 실패: ${msg.slice(0, 60)}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ── 빠른 예약: 새벽 05:30 / 정오 11:00 / 저녁 20:00 ────────────────────────
  // 스마트 날짜 계산: 목표 시각이 현재 KST 이전이면 다음날, 이후면 오늘
  async function handleQuickReserve(
    hour: number,
    minute: number,
    label: '새벽' | '정오' | '저녁',
    emoji: string,
    shortcutUsed = false
  ) {
    if (!form.title?.trim() || !form.region || !form.job) {
      showToast('⚠️ 필수 항목을 입력해주세요 (제목·지역·직종)');
      return;
    }
    const nowKST = new Date(Date.now() + 9 * 3600000);
    const todayKST = nowKST.toISOString().slice(0, 10);
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    let reservedAt = toKSTIso(todayKST, timeStr);
    // 이미 지난 시각이면 → 다음날 예약
    if (new Date(reservedAt).getTime() <= Date.now()) {
      const tomorrowKST = new Date(nowKST.getTime() + 86400000);
      reservedAt = toKSTIso(tomorrowKST.toISOString().slice(0, 10), timeStr);
    }
    // 랜덤 분산 ±5~15분 적용
    if (useRandomSpread) {
      const spread = Math.floor(Math.random() * 11) + 5;
      reservedAt = new Date(new Date(reservedAt).getTime() + spread * 60000).toISOString();
    }
    // 충돌 방지: 10분 이내 예약 있으면 뒤로 밀기
    const reserved = jobs.filter((j) => j.status === 'reserved' && j.reservedAt);
    const targetMs = new Date(reservedAt).getTime();
    const conflicting = reserved.filter(
      (j) => Math.abs(new Date(j.reservedAt!).getTime() - targetMs) < 10 * 60000
    );
    if (conflicting.length > 0) {
      const latestMs = Math.max(...conflicting.map((j) => new Date(j.reservedAt!).getTime()));
      const gap = Math.floor(Math.random() * 8) + 3;
      reservedAt = new Date(latestMs + gap * 60000).toISOString();
      showToast(`⚡ 동시간대 분산: ${formatKST(reservedAt)}으로 조정됩니다`);
    }
    setSubmitting(true);
    try {
      // 안전망: contact가 비었는데 원문에 010 번호가 있으면 자동 보강
      let safeContact = form.contact || '';
      if (!safeContact.trim() && form.originalText) {
        const rescued = extractPhones(form.originalText).main;
        if (rescued) {
          safeContact = rescued;
          console.log('[QuickReserve] 연락처 자동 보강:', rescued);
        }
      }
      const jobData: Omit<Job, 'id'> = {
        ...(form as Omit<Job, 'id'>),
        contact: safeContact,
        salaryNum: parseSalaryNum(form.salary || ''),
        date: new Date().toISOString(),
        hidden: false,
        repeatDays,
        retryCount: 0,
        dispatchMode: 'manual' as const,
      };
      const savedId = await fbAddReservedJob(jobData, reservedAt);
      await fbSaveReservationLog({
        jobId: savedId,
        jobTitle: form.title || '',
        scheduledAt: reservedAt,
        status: 'published',
        repeatDays: repeatDays || undefined,
        isRepeat: false,
        createdAt: new Date().toISOString(),
        quickReserveType: label,
        shortcutUsed,
      });
      const repeatLabel = repeatDays > 0 ? ` · ${repeatDays}일 반복` : '';
      const shortcutLabel = shortcutUsed ? ' [⌨️ 단축키]' : '';
      showToast(`${emoji} ${label} ${formatKST(reservedAt)} 예약됐습니다${repeatLabel}${shortcutLabel}`);
      applySmartClear(form);
      if (quickMode) setTimeout(() => titleInputRef.current?.focus(), 80);
      await loadJobs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`❌ 예약 실패: ${msg.slice(0, 60)}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Ctrl+Q: 4회 자동 발행 (즉시 1회 + 새벽 05:30 / 정오 11:00 / 저녁 20:00 예약 3회) ──
  async function handleAutoQuadPublish() {
    // 중복 실행 방지: ref 기반 락 (stale closure에서도 안전)
    if (autoQuadInFlightRef.current || submitting) return;
    if (!form.title?.trim() || !form.region || !form.job) {
      showToast('⚠️ 필수 항목을 입력해주세요 (제목·지역·직종)');
      return;
    }
    autoQuadInFlightRef.current = true;
    setSubmitting(true);
    try {
      // 안전망: contact가 비었는데 원문에 010 번호가 있으면 자동 보강
      let safeContact = form.contact || '';
      if (!safeContact.trim() && form.originalText) {
        const rescued = extractPhones(form.originalText).main;
        if (rescued) safeContact = rescued;
      }
      const baseJob: Omit<Job, 'id'> = {
        ...(form as Omit<Job, 'id'>),
        contact: safeContact,
        salaryNum: parseSalaryNum(form.salary || ''),
        date: new Date().toISOString(),
        hidden: false,
        repeatDays,
        retryCount: 0,
        dispatchMode: 'manual' as const,
      };

      // 1) 즉시 발행 — 완료 확인 후 다음 단계 진행
      showToast('⚡ 4회 자동 발행 시작 — 1/4 즉시 발행 중…');
      const firstId = await fbAddJob(baseJob);
      console.log('[AutoQuad] 1/4 즉시 발행 완료, id:', firstId);

      // 2~4) 새벽 05:30 → 정오 11:00 → 저녁 20:00 순차 예약
      const slots: { h: number; m: number; label: '새벽' | '정오' | '저녁'; emoji: string }[] = [
        { h: 5, m: 30, label: '새벽', emoji: '🌅' },
        { h: 11, m: 0, label: '정오', emoji: '☀️' },
        { h: 20, m: 0, label: '저녁', emoji: '🌙' },
      ];
      const nowKST = new Date(Date.now() + 9 * 3600000);
      const todayKST = nowKST.toISOString().slice(0, 10);
      const tomorrowKST = new Date(nowKST.getTime() + 86400000).toISOString().slice(0, 10);
      const createdReservedAts: string[] = [];
      let step = 2;
      for (const s of slots) {
        const timeStr = `${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}`;
        let reservedAt = toKSTIso(todayKST, timeStr);
        // 이미 지난 시각이면 다음날로
        if (new Date(reservedAt).getTime() <= Date.now()) {
          reservedAt = toKSTIso(tomorrowKST, timeStr);
        }
        // 랜덤 분산 옵션 적용 (±5~15분)
        if (useRandomSpread) {
          const spread = Math.floor(Math.random() * 11) + 5;
          reservedAt = new Date(new Date(reservedAt).getTime() + spread * 60000).toISOString();
        }
        // 충돌 방지: 기존 예약(방금 등록분 포함)과 10분 이내 겹치면 뒤로 밀기
        const existing = [
          ...jobs.filter((j) => j.status === 'reserved' && j.reservedAt).map((j) => j.reservedAt!),
          ...createdReservedAts,
        ];
        const targetMs = new Date(reservedAt).getTime();
        const conflicting = existing.filter((t) => Math.abs(new Date(t).getTime() - targetMs) < 10 * 60000);
        if (conflicting.length > 0) {
          const latestMs = Math.max(...conflicting.map((t) => new Date(t).getTime()));
          const gap = Math.floor(Math.random() * 8) + 3;
          reservedAt = new Date(latestMs + gap * 60000).toISOString();
        }
        showToast(`${s.emoji} ${step}/4 ${s.label} 예약 등록 중…`);
        const savedId = await fbAddReservedJob(baseJob, reservedAt);
        await fbSaveReservationLog({
          jobId: savedId,
          jobTitle: form.title || '',
          scheduledAt: reservedAt,
          status: 'published',
          repeatDays: repeatDays || undefined,
          isRepeat: false,
          createdAt: new Date().toISOString(),
          quickReserveType: s.label,
          shortcutUsed: true,
        });
        console.log(`[AutoQuad] ${step}/4 ${s.label} 예약 완료, id:`, savedId, '/', formatKST(reservedAt));
        createdReservedAts.push(reservedAt);
        step++;
      }

      showToast(`✅ 4회 자동 발행 완료! (즉시 + 새벽·정오·저녁 예약)`);
      applySmartClear(form);
      if (quickMode) setTimeout(() => titleInputRef.current?.focus(), 80);
      await loadJobs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AutoQuad] 4회 자동 발행 실패:', msg, err);
      showToast(`❌ 4회 발행 중단: ${msg.slice(0, 60)} (이미 등록된 건은 유지됨)`);
    } finally {
      autoQuadInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  // 예약 취소
  async function handleCancelReservation(id: string) {
    if (!confirm('예약을 취소하시겠습니까?')) return;
    await fbCancelReservation(id);
    showToast('🗑 예약이 취소됐습니다');
    await loadJobs();
  }

  // 발행 실패 공고 수동 재시도
  async function handleRetryReservation(id: string) {
    await fbRetryReservation(id);
    showToast('🔄 재시도 예약됐습니다 (1분 이내 발행)');
    await loadJobs();
  }

  // 예약 로그 열기
  async function handleShowLogs() {
    const logs = await fbLoadReservationLogs(30);
    setReservationLogs(logs);
    setShowLogsModal(true);
  }

  // ── 서버 스케줄러 상태 폴링 ────────────────────────────────────────────────
  interface SchedulerStatus {
    ok: boolean;
    startedAt?: string;
    lastRunAt?: string | null;
    isRunning?: boolean;
    totalPublished?: number;
    totalRetried?: number;
    totalFailed?: number;
    lastPublished?: number;
    lastRetried?: number;
    lastFailed?: number;
    lastError?: string | null;
    nextRunInSeconds?: number;
    intervalSeconds?: number;
  }
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [triggerResult, setTriggerResult] = useState<{ published: number; failed: number } | null>(null);

  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduler/status');
      if (res.ok) setSchedulerStatus(await res.json());
    } catch { /* 서버 미응답 시 무시 */ }
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetchSchedulerStatus();
    const timer = setInterval(fetchSchedulerStatus, 30000);
    return () => clearInterval(timer);
  }, [authed, fetchSchedulerStatus]);

  function setField(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  // 폼 임시저장 (800ms 디바운스)
  useEffect(() => {
    if (!authed) return;
    if (!form.title && !form.salary && !form.contact && !form.originalText) return;
    const timer = setTimeout(() => {
      localStorage.setItem('cj_form_draft', JSON.stringify(form));
      setDraftSaved(true);
      setDraftAvailable(true);
      setTimeout(() => setDraftSaved(false), 1500);
    }, 800);
    return () => clearTimeout(timer);
  }, [form, authed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 단축키: Ctrl+Enter / Ctrl+Shift+Enter / Ctrl+D / Ctrl+F / Ctrl+G ────────
  useEffect(() => {
    if (!authed || tab !== 'add') return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      // Ctrl+D → 🌅 새벽 05:30
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        void handleQuickReserve(5, 30, '새벽', '🌅', true);
        return;
      }
      // Ctrl+F → ☀️ 정오 11:00
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void handleQuickReserve(11, 0, '정오', '☀️', true);
        return;
      }
      // Ctrl+G → 🌙 저녁 20:00
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        void handleQuickReserve(20, 0, '저녁', '🌙', true);
        return;
      }
      // Ctrl+Q → ⚡ 4회 자동 발행 (즉시 + 새벽/정오/저녁 예약)
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        void handleAutoQuadPublish();
        return;
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // Ctrl+Shift+Enter → 예약 모달 열기
      if (e.shiftKey) {
        if (!form.title?.trim() || !form.region || !form.job) {
          showToast('⚠️ 필수 항목을 입력해주세요 (제목·지역·직종)');
          return;
        }
        setReserveDate(new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
        const nh = new Date(Date.now() + 9 * 3600000 + 3600000);
        setReserveTime(nh.toISOString().slice(11, 16));
        setShowReserveModal(true);
      } else {
        // Ctrl+Enter → 즉시 등록
        if (formRef.current) formRef.current.requestSubmit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, tab, form.title, form.region, form.job]);

  // ── 중복 공고 감지 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const digits = (form.contact || '').replace(/\D/g, '');
    if (digits.length < 9) { setDupWarning(null); return; }
    const dup = jobs.find(
      (j) => j.contact === form.contact && j.status !== 'reserved' && !j.hidden && !j._deleted
    );
    setDupWarning(dup ? `⚠️ 같은 연락처 공고 이미 있음: "${(dup.title || '').slice(0, 20)}"` : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contact, jobs]);

  function applySmartClear(savedForm: Partial<Job>) {
    const kept: Partial<Job> = {};
    if (keepFields.company) kept.company = savedForm.company;
    if (keepFields.region) kept.region = savedForm.region;
    if (keepFields.contact) kept.contact = savedForm.contact;
    setForm({ ...emptyForm(), ...kept });
    setParseResult(null);
    setParseText('');
    localStorage.removeItem('cj_form_draft');
    setDraftAvailable(false);
    // 등록 후 원문 입력칸으로 포커스 이동 → 다음 공고 즉시 붙여넣기 가능
    setTimeout(() => parseTextareaRef.current?.focus(), 80);
  }

  // ── 자연 발행 랜덤 지연 계산 ────────────────────────────────────────────────
  function calcNaturalDelay(pendingCount: number): number {
    let [minM, maxM] = (() => {
      if (naturalRandRange === '0-3') return [0, 3];
      if (naturalRandRange === '0-5') return [0, 5];
      if (naturalRandRange === '5-10') return [5, 10];
      return [naturalCustomMin, Math.max(naturalCustomMin, naturalCustomMax)];
    })();
    // 스마트 분산: 예약 공고가 많을수록 대기 시간 자동 강화
    if (pendingCount >= 6) { minM = Math.max(minM, 2); maxM = Math.max(maxM * 2, 10); }
    else if (pendingCount >= 3) { maxM = Math.round(maxM * 1.5); }
    const range = Math.max(maxM - minM, 0);
    return minM + Math.random() * range;
  }

  async function handleAddJob(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title?.trim() || !form.region || !form.job) {
      showToast('⚠️ 필수 항목을 입력해주세요 (제목, 지역, 직종)');
      return;
    }
    setSubmitting(true);
    try {
      // 안전망: contact가 비었는데 원문에 010 번호가 있으면 자동 보강
      let safeContact = form.contact || '';
      if (!safeContact.trim() && form.originalText) {
        const rescued = extractPhones(form.originalText).main;
        if (rescued) {
          safeContact = rescued;
          console.log('[AddJob] 연락처 자동 보강:', rescued);
        }
      }
      const baseJob: Omit<Job, 'id'> = {
        ...form,
        contact: safeContact,
        salaryNum: parseSalaryNum(form.salary || ''),
        date: new Date().toISOString(),
        hidden: false,
      } as Omit<Job, 'id'>;

      // ── 자동완성 기록 업데이트 헬퍼 ──
      function updateAcHistory() {
        const acCopy = { companies: [...acHistory.companies], sites: [...acHistory.sites], contacts: [...acHistory.contacts] };
        let changed = false;
        const co = form.company?.trim(); if (co && !acCopy.companies.includes(co)) { acCopy.companies = [co, ...acCopy.companies].slice(0, 20); changed = true; }
        const si = form.site?.trim(); if (si && !acCopy.sites.includes(si)) { acCopy.sites = [si, ...acCopy.sites].slice(0, 20); changed = true; }
        const ct = form.contact?.trim(); if (ct && !acCopy.contacts.includes(ct)) { acCopy.contacts = [ct, ...acCopy.contacts].slice(0, 20); changed = true; }
        if (changed) { setAcHistory(acCopy); localStorage.setItem('cj_ac_history', JSON.stringify(acCopy)); }
      }

      if (naturalPublish) {
        // ── 자연스러운 랜덤 발행: 짧은 지연 후 예약 발행 ──
        const pendingCount = jobs.filter((j) => j.status === 'reserved').length;
        const delayMin = calcNaturalDelay(pendingCount);
        let reservedAt = new Date(Date.now() + delayMin * 60000).toISOString();
        // 충돌 방지: 기존 예약과 3분 이내 겹치면 뒤로 밀기
        const reservedList = jobs.filter((j) => j.status === 'reserved' && j.reservedAt);
        const targetMs = new Date(reservedAt).getTime();
        const conflicting = reservedList.filter((j) => Math.abs(new Date(j.reservedAt!).getTime() - targetMs) < 3 * 60000);
        if (conflicting.length > 0) {
          const latestMs = Math.max(...conflicting.map((j) => new Date(j.reservedAt!).getTime()));
          reservedAt = new Date(latestMs + (Math.floor(Math.random() * 3) + 2) * 60000).toISOString();
        }
        console.log('[Natural] 랜덤 지연:', Math.round(delayMin), '분 / 예정 발행:', reservedAt);
        console.log('[Natural] Firebase 저장 시작 (dispatchMode: natural):', form.title);
        const savedId = await fbAddReservedJob({ ...baseJob, dispatchMode: 'natural' }, reservedAt);
        console.log('[Natural] Firebase 저장 완료, id:', savedId, '/ 스케줄러가 발행 예정:', formatKST(reservedAt));
        // 예약 로그 저장 (예약 로그 탭에 표시되도록)
        await fbSaveReservationLog({
          jobId: savedId,
          jobTitle: form.title || '',
          scheduledAt: reservedAt,
          status: 'published',
          isRepeat: false,
          createdAt: new Date().toISOString(),
        });
        updateAcHistory();
        await loadJobs();
        const dispMin = Math.round(delayMin);
        const dispLabel = dispMin <= 0 ? '곧' : `약 ${dispMin}분 후`;
        showToast(`🎲 ${dispLabel} 자동 발행 예정 — ${formatKST(reservedAt)}`);
        applySmartClear(form);
      } else {
        // ── 즉시 발행 ──
        const savedId = await fbAddJob(baseJob);
        console.log('[Admin] Firebase 저장 완료, id:', savedId);
        updateAcHistory();
        await loadJobs();
        showToast('✅ 공고가 등록됐습니다!');
        applySmartClear(form);
        if (quickMode) setTimeout(() => titleInputRef.current?.focus(), 80);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Admin] 공고 등록 실패:', msg, err);
      showToast(`❌ 등록 실패: ${msg.slice(0, 60)}`);
    } finally {
      setSubmitting(false);
    }
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

  // 발행 실패(status==='failed') 공고 일괄 삭제.
  // 이미 화면에 로드된 목록(jobs 상태)을 대상으로 하므로 추가 읽기 없이 동작 →
  // Firestore 읽기 쿼터가 소진된 상태에서도 삭제(쓰기) 가능.
  async function handleDeleteAllFailed() {
    if (deletingFailed) return; // 중복 실행 방지
    const failedJobs = jobs.filter((j) => j.status === 'failed');
    if (failedJobs.length === 0) {
      showToast('발행 실패한 공고가 없습니다');
      return;
    }
    if (!confirm(`발행 실패한 공고 ${failedJobs.length}건을 모두 삭제하시겠습니까?`)) return;
    setDeletingFailed(true);
    showToast(`🗑 ${failedJobs.length}건 삭제 중…`);
    const successIds = new Set<string>();
    for (const j of failedJobs) {
      // fbDeleteJob은 성공 시 true, 실패 시 false 반환 (예외를 던지지 않음)
      if (await fbDeleteJob(j.id)) successIds.add(j.id);
    }
    // 실제 삭제에 성공한 항목만 로컬 상태에서 제거
    // (loadJobs는 읽기 쿼터 소진 시 실패할 수 있어 로컬 반영이 중요)
    setJobs((prev) => prev.filter((j) => !successIds.has(j.id)));
    const failedToDelete = failedJobs.length - successIds.size;
    showToast(
      failedToDelete > 0
        ? `⚠️ ${successIds.size}건 삭제, ${failedToDelete}건 실패 (잠시 후 재시도)`
        : `✅ ${successIds.size}건 삭제 완료`
    );
    setDeletingFailed(false);
    try { await loadJobs(); } catch { /* 읽기 실패 무시 — 로컬 상태로 이미 반영됨 */ }
  }

  function handleCloneJob(job: Job) {
    // 발행 메타데이터 제외하고 내용만 복사
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, date: _d, status: _s, reservedAt: _r, publishedAt: _p,
            retryCount: _rc, lastRetryAt: _lr, failReason: _f,
            _deleted: _del, _createdAt: _ca, hiddenAt: _ha, hidden: _hid, ...rest } = job;
    setForm({ ...emptyForm(), ...rest });
    setParseText(rest.originalText || '');
    setParseResult(null);
    setTab('add');
    showToast('📋 공고 복제됐습니다 — 내용 수정 후 등록하세요');
    setTimeout(() => titleInputRef.current?.focus(), 150);
  }

  async function handleApprovePending(item: PendingJob) {
    try {
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
      await fbInvalidatePublicCache(); // 승인된 글 즉시 노출
      showToast('✅ 승인 처리됐습니다');
      await loadJobs();
      await loadPending();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Admin] 승인 등록 실패:', msg, err);
      showToast(`❌ 승인 실패: ${msg.slice(0, 60)}`);
    }
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

  function handleParseText(text: string) {
    const parsed = parseJobText(text);
    // SEO 최적화 제목 생성
    const seoTitle = generateSEOTitle(parsed);
    if (seoTitle) parsed.title = seoTitle;
    setParseResult(parsed);
    // 표시 전용 필드 제외
    const { _salaryCalc: _sc, _salaryCandidates: _cands, _complexSalary: _cs, ...formData } = parsed;
    setForm((prev) => ({ ...prev, ...formData }));
  }

  function handleParse() {
    if (!parseText.trim()) return;
    handleParseText(parseText);
  }


  function saveSettings() {
    localStorage.setItem('cj_contact_email', settings.contactEmail);
    localStorage.setItem('cj_contact_kakao', settings.contactKakao);
    localStorage.setItem('cj_contact_label', settings.contactLabel);
    localStorage.setItem('cj_share_url', settings.shareUrl);
    localStorage.setItem('cj_openchat_url', settings.openChatUrl);
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
            <div className="flex items-center gap-2 mb-3">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 accent-[#f97316] cursor-pointer"
              />
              <label htmlFor="rememberMe" className="text-sm text-gray-500 cursor-pointer select-none">아이디 기억하기</label>
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
  const reservedJobs = visibleJobs.filter((j) => j.status === 'reserved');
  const activeJobs = visibleJobs.filter((j) => j.status !== 'reserved');
  const failedCount = visibleJobs.filter((j) => j.status === 'failed').length;

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
              { key: 'jobs', label: `공고 관리 (${activeJobs.length})${reservedJobs.length > 0 ? ` 예약${reservedJobs.length}` : ''}` },
              { key: 'add', label: '공고 등록' },
              { key: 'pending', label: `신청 관리 (${pending.filter((p) => p.status === 'pending').length})` },
              { key: 'reports', label: `신고 관리${reports.length > 0 ? ` (${reports.length})` : ''}` },
              { key: 'products', label: '추천템' },
              { key: 'news', label: '현장 소식' },
              { key: 'blog', label: '건설 꿀팁' },
              { key: 'toon', label: '노가다툰' },
              { key: 'stats', label: '방문 통계' },
              { key: 'settings', label: '설정' },
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
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 pb-2.5 border-b-2 border-gray-100 flex items-center justify-between flex-wrap gap-2">
              📋 공고 목록
              <div className="flex gap-2">
                <button
                  className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 py-1.5 px-3 rounded-lg cursor-pointer hover:bg-violet-100 transition-colors font-[inherit]"
                  onClick={handleShowLogs}
                >
                  📋 예약 로그
                </button>
                <button
                  className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 py-1.5 px-3 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors font-[inherit]"
                  onClick={loadJobs}
                >
                  🔄 새로고침
                </button>
              </div>
            </h2>

            {/* 서버 스케줄러 상태 */}
            <div className={`mb-4 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs border ${
              !schedulerStatus?.ok
                ? 'bg-amber-50 border-amber-200'
                : (schedulerStatus.totalFailed ?? 0) > 0
                ? 'bg-red-50 border-red-200'
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  schedulerStatus?.isRunning
                    ? 'bg-blue-400 animate-pulse'
                    : !schedulerStatus?.ok
                    ? 'bg-amber-400'
                    : (schedulerStatus.totalFailed ?? 0) > 0
                    ? 'bg-red-500'
                    : 'bg-green-500'
                }`} />
                <span className={`font-bold ${
                  !schedulerStatus?.ok ? 'text-amber-800'
                  : (schedulerStatus.totalFailed ?? 0) > 0 ? 'text-red-700'
                  : 'text-green-800'
                }`}>
                  {schedulerStatus?.isRunning
                    ? '⚙️ 스케줄러 실행 중…'
                    : !schedulerStatus?.ok
                    ? '⚠️ 서버 연결 확인 중'
                    : (schedulerStatus.totalFailed ?? 0) > 0
                    ? '⚠️ 서버 스케줄러 (발행 실패 있음)'
                    : '🖥 서버 스케줄러 활성'}
                </span>
              </div>
              {schedulerStatus?.ok && (
                <>
                  <span className="text-gray-500">
                    마지막 실행:{' '}
                    <span className="font-semibold text-gray-700">
                      {schedulerStatus.lastRunAt
                        ? new Date(schedulerStatus.lastRunAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '대기 중'}
                    </span>
                  </span>
                  <span className="text-gray-500">
                    누적 발행: <span className="font-bold text-green-700">{schedulerStatus.totalPublished ?? 0}건</span>
                  </span>
                  {(schedulerStatus.totalFailed ?? 0) > 0 && (
                    <span className="text-red-600 font-bold">
                      발행 실패: {schedulerStatus.totalFailed}건
                      {schedulerStatus.lastFailed ? ` (마지막 ${schedulerStatus.lastFailed}건)` : ''}
                    </span>
                  )}
                  {(schedulerStatus.totalRetried ?? 0) > 0 && (
                    <span className="text-gray-500">재시도: <span className="font-semibold text-blue-600">{schedulerStatus.totalRetried}건</span></span>
                  )}
                  <span className="text-gray-400">다음 실행: {schedulerStatus.nextRunInSeconds ?? '?'}초 후</span>
                  {triggerResult && (
                    <span className={`font-semibold ${triggerResult.failed > 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {triggerResult.failed > 0
                        ? `❌ 발행 ${triggerResult.published}건 성공 / ${triggerResult.failed}건 실패`
                        : triggerResult.published > 0
                        ? `✅ ${triggerResult.published}건 발행 완료`
                        : '✅ 실행 완료 (대상 없음)'}
                    </span>
                  )}
                  <div className="ml-auto flex gap-1.5">
                    {/* 실패 공고 일괄 초기화 — retryCount=99 영구실패 복구 */}
                    {(schedulerStatus.totalFailed ?? 0) > 0 && (
                      <button
                        type="button"
                        className="text-[11px] bg-white border border-red-300 text-red-600 px-2.5 py-1 rounded-lg font-bold cursor-pointer hover:bg-red-50 font-[inherit] whitespace-nowrap"
                        onClick={async () => {
                          const token = getToken();
                          if (!token) { showToast('⚠️ 관리자 인증이 필요합니다'); return; }
                          showToast('🔄 실패 공고 초기화 중…');
                          try {
                            const res = await fetch('/api/scheduler/reset-failed', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                            const data = await res.json() as { ok: boolean; reset?: number; total?: number; message?: string };
                            if (res.ok && data.ok) {
                              showToast(`✅ ${data.reset}/${data.total}건 초기화 완료 — 30초 후 자동 발행 예정`);
                              fetchSchedulerStatus();
                              loadJobs();
                            } else {
                              showToast(`❌ 초기화 실패: ${data.message ?? '오류'}`);
                            }
                          } catch (e) {
                            showToast(`❌ 네트워크 오류: ${String(e)}`);
                          }
                        }}
                      >🔄 실패 {schedulerStatus.totalFailed}건 초기화</button>
                    )}
                    {/* 스케줄러 즉시 실행 테스트 */}
                    <button
                      type="button"
                      className="text-[11px] bg-white border border-green-300 text-green-700 px-2.5 py-1 rounded-lg font-bold cursor-pointer hover:bg-green-100 font-[inherit] whitespace-nowrap"
                      onClick={async () => {
                        const token = getToken();
                        if (!token) { showToast('⚠️ 관리자 인증이 필요합니다'); return; }
                        setTriggerResult(null);
                        showToast('⚙️ 스케줄러 실행 중…');
                        try {
                          const res = await fetch('/api/scheduler/trigger', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                          const data = await res.json() as { ok: boolean; result?: { published: number; retried: number; failed: number }; message?: string };
                          if (res.ok && data.ok) {
                            const r = data.result ?? { published: 0, retried: 0, failed: 0 };
                            setTriggerResult({ published: r.published, failed: r.failed });
                            showToast(
                              r.failed > 0
                                ? `❌ ${r.published}건 발행 / ${r.failed}건 실패`
                                : r.published > 0
                                ? `✅ ${r.published}건 발행 완료`
                                : '✅ 실행 완료 (대기 없음)'
                            );
                            fetchSchedulerStatus();
                            loadJobs();
                          } else {
                            showToast(`❌ 실행 실패: ${data.message ?? '알 수 없는 오류'}`);
                          }
                        } catch (e) {
                          showToast(`❌ 네트워크 오류: ${String(e)}`);
                        }
                      }}
                    >⚡ 즉시 실행</button>
                  </div>
                </>
              )}
              {/* 마지막 오류 표시 */}
              {schedulerStatus?.ok && schedulerStatus.lastError && (
                <div className="w-full mt-1 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                  <span className="font-bold">마지막 오류: </span>{schedulerStatus.lastError.slice(0, 120)}
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <span className="text-2xl animate-spin">⚙️</span>
              </div>
            ) : visibleJobs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">등록된 공고가 없습니다</div>
            ) : (
              <div className="grid gap-3">
                {failedCount > 0 && (
                  <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-[10px] px-4 py-2.5">
                    <span className="text-[13px] font-bold text-red-600">❌ 발행 실패 공고 {failedCount}건</span>
                    <button
                      type="button"
                      disabled={deletingFailed}
                      className="bg-red-500 text-white py-[7px] px-3.5 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-red-600 transition-colors font-[inherit] whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                      onClick={handleDeleteAllFailed}
                    >
                      {deletingFailed ? '🗑 삭제 중…' : '🗑 실패 공고 전체 삭제'}
                    </button>
                  </div>
                )}
                {visibleJobs.map((job) => (
                  <div
                    key={job.id}
                    className={`bg-white border rounded-[10px] p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                      job.status === 'reserved'
                        ? 'border-violet-300 bg-violet-50'
                        : job.hidden
                        ? 'opacity-50 bg-gray-50 border-gray-200'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0 w-full">
                      <div className="text-[15px] font-bold mb-1 text-gray-900 truncate">{job.title}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                        <span>📍 {job.region}</span>
                        <span>🔧 {job.job}</span>
                        <span>💰 {job.salary || '협의'}</span>
                        <span>🕐 {formatDate(job.date)}</span>
                        {job.status === 'reserved' && job.reservedAt && (
                          <span className={`font-bold ${job.dispatchMode === 'natural' ? 'text-emerald-600' : 'text-violet-600'}`}>
                            {job.dispatchMode === 'natural' ? '🎲 랜덤 분산 대기' : '📅 예약중'} · {formatKST(job.reservedAt)} 발행
                            {job.repeatDays && job.repeatDays > 0 ? ` 🔁${job.repeatDays}일` : ''}
                          </span>
                        )}
                        {job.status === 'failed' && (
                          <span className="text-red-500 font-bold">
                            ❌ {(() => {
                              const r = job.failReason || '';
                              if (r.includes('권한') || r.includes('PERMISSION_DENIED')) return 'Firestore 권한 오류 — 보안 규칙 확인 필요';
                              if (r.includes('CONFIGURATION_NOT_FOUND')) return '익명 인증 비활성화 — Firebase Console 확인';
                              if (r.includes('401') || r.includes('UNAUTHENTICATED')) return '인증 오류 (401)';
                              if ((job.retryCount || 0) === 99) return '영구 실패 (재시도 중단)';
                              return `발행 실패${(job.retryCount || 0) > 0 && (job.retryCount || 0) < 99 ? ` (${job.retryCount}회 시도)` : ''}`;
                            })()}
                            {job.failReason && !['권한', 'PERMISSION_DENIED', 'CONFIGURATION_NOT_FOUND'].some((k) => (job.failReason || '').includes(k))
                              ? ` · ${job.failReason.slice(0, 50)}`
                              : ''}
                          </span>
                        )}
                        {job.hidden && <span className="text-amber-600 font-bold">🙈 숨김</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 w-full sm:w-auto justify-end flex-wrap">
                      {job.status === 'reserved' ? (
                        <button
                          className="bg-white border-2 border-violet-400 text-violet-600 py-[7px] px-3.5 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-violet-50 transition-colors font-[inherit] whitespace-nowrap"
                          onClick={() => handleCancelReservation(job.id)}
                        >
                          📅 예약취소
                        </button>
                      ) : job.status === 'failed' ? (
                        <button
                          className="bg-white border-2 border-red-400 text-red-500 py-[7px] px-3.5 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-red-50 transition-colors font-[inherit] whitespace-nowrap"
                          onClick={() => handleRetryReservation(job.id)}
                        >
                          🔄 재시도
                        </button>
                      ) : (
                        <button
                          className="bg-white border-2 border-amber-400 text-amber-500 py-[7px] px-3.5 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-amber-50 transition-colors font-[inherit] whitespace-nowrap"
                          onClick={() => handleToggleHide(job.id, !!job.hidden)}
                        >
                          {job.hidden ? '👁 공개' : '🙈 숨김'}
                        </button>
                      )}
                      <button
                        className="bg-white border-2 border-blue-300 text-blue-600 py-[7px] px-3 rounded-lg text-[13px] font-bold cursor-pointer hover:bg-blue-50 transition-colors font-[inherit] whitespace-nowrap"
                        onClick={() => handleCloneJob(job)}
                        title="공고 복제 후 수정 등록"
                      >
                        📋 복제
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

            {/* 연속 등록 UX 설정 바 */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {/* 빠른 등록 모드 토글 */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <button
                  type="button"
                  onClick={() => { const n = !quickMode; setQuickMode(n); localStorage.setItem('cj_quick_mode', n ? '1' : '0'); }}
                  className={`relative inline-flex w-10 h-[22px] rounded-full transition-colors ${quickMode ? 'bg-orange-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${quickMode ? 'translate-x-5' : 'translate-x-[3px]'}`} />
                </button>
                <span className="text-xs font-bold text-gray-700">⚡ 빠른 등록</span>
                {quickMode && <span className="text-[10px] text-orange-500 font-semibold hidden sm:inline">등록 후 제목 칸 자동 포커스</span>}
              </label>

              {/* 초기화 옵션 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className="font-semibold text-green-700">✅ 등록 후 자동 초기화</span>
                </label>
                <span className="text-gray-300">|</span>
                <span className="text-gray-400 text-[11px]">유지:</span>
                {(['company', 'region', 'contact'] as const).map((f) => (
                  <label key={f} className="flex items-center gap-1 cursor-pointer select-none">
                    <input type="checkbox" checked={!!keepFields[f]} onChange={(e) => { const n = { ...keepFields, [f]: e.target.checked }; setKeepFields(n); localStorage.setItem('cj_keep_fields', JSON.stringify(n)); }} className="w-3 h-3 accent-blue-500 cursor-pointer" />
                    <span>{f === 'company' ? '업체명' : f === 'region' ? '지역' : '연락처'}</span>
                  </label>
                ))}
                <span className="text-gray-300">|</span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={autoReplacePaste} onChange={(e) => { setAutoReplacePaste(e.target.checked); localStorage.setItem('cj_auto_replace_paste', e.target.checked ? '1' : '0'); }} className="w-3.5 h-3.5 accent-orange-500 cursor-pointer" />
                  <span className="font-semibold">새 붙여넣기 시 자동 교체</span>
                </label>
              </div>

              {/* 임시저장/복구 */}
              <div className="ml-auto flex items-center gap-2">
                {draftSaved && <span className="text-[11px] text-green-600 font-semibold">💾 임시저장됨</span>}
                {draftAvailable && !form.title && (
                  <button
                    type="button"
                    className="text-[11px] bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-lg font-bold cursor-pointer hover:bg-blue-100 font-[inherit]"
                    onClick={() => {
                      const d = localStorage.getItem('cj_form_draft');
                      if (d) { try { setForm(JSON.parse(d)); setDraftAvailable(false); showToast('📝 임시저장 복구됐습니다'); } catch { /* ignore */ } }
                    }}
                  >
                    📝 임시저장 복구
                  </button>
                )}
              </div>
            </div>

            {/* 원문 파싱 */}
            <div className="mb-5">
              <h3 className="text-sm font-bold text-gray-700 mb-2">📋 원문 붙여넣기로 자동 파싱</h3>
              <textarea
                ref={parseTextareaRef}
                value={parseText}
                onChange={(e) => setParseText(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (text.trim().length > 9) {
                    if (autoReplacePaste) {
                      e.preventDefault();
                      setParseText(text);
                      handleParseText(text);
                      showToast('📋 붙여넣기 → 자동 파싱 완료!');
                    } else {
                      setTimeout(() => {
                        setParseText(text);
                        handleParseText(text);
                        showToast('📋 붙여넣기 → 자동 파싱 완료!');
                      }, 30);
                    }
                  }
                }}
                placeholder="카카오톡 원문을 붙여넣으면 자동 파싱됩니다 (버튼 불필요 — 붙여넣기만 해도 OK!)"
                rows={4}
                className="w-full py-3.5 px-3.5 border-2 border-gray-200 rounded-[10px] text-sm outline-none font-[inherit] focus:border-[#f97316] resize-y min-h-[120px]"
              />
              {/* ── 빠른 예약 버튼: 붙여넣기 후 바로 클릭 ── */}
              <div className="mt-2 flex gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={submitting}
                  title="새벽 05:30 예약 (단축키: Ctrl+D)"
                  className="bg-indigo-500 text-white border-none py-2 px-3 rounded-lg text-sm font-bold cursor-pointer hover:bg-indigo-600 active:scale-95 transition-all font-[inherit] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  onClick={() => void handleQuickReserve(5, 30, '새벽', '🌅')}
                >
                  🌅 새벽 05:30
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  title="정오 11:00 예약 (단축키: Ctrl+F)"
                  className="bg-amber-500 text-white border-none py-2 px-3 rounded-lg text-sm font-bold cursor-pointer hover:bg-amber-600 active:scale-95 transition-all font-[inherit] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  onClick={() => void handleQuickReserve(11, 0, '정오', '☀️')}
                >
                  ☀️ 정오 11:00
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  title="저녁 20:00 예약 (단축키: Ctrl+G)"
                  className="bg-slate-600 text-white border-none py-2 px-3 rounded-lg text-sm font-bold cursor-pointer hover:bg-slate-700 active:scale-95 transition-all font-[inherit] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  onClick={() => void handleQuickReserve(20, 0, '저녁', '🌙')}
                >
                  🌙 저녁 20:00
                </button>
              </div>
              {/* 단축키 안내 */}
              <div className="mt-1.5 flex gap-3 flex-wrap">
                <span className="text-[10px] text-gray-400">⌨️ <kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 text-[9px] font-mono">Ctrl+D</kbd> 새벽</span>
                <span className="text-[10px] text-gray-400"><kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 text-[9px] font-mono">Ctrl+F</kbd> 정오</span>
                <span className="text-[10px] text-gray-400"><kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 text-[9px] font-mono">Ctrl+G</kbd> 저녁</span>
                <span className="text-[10px] text-gray-400"><kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 text-[9px] font-mono">Ctrl+Enter</kbd> 즉시등록</span>
                <span className="text-[10px] text-gray-400"><kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 text-[9px] font-mono">Ctrl+⇧+Enter</kbd> 예약모달</span>
                <span className="text-[10px] text-gray-400"><kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 text-[9px] font-mono">Ctrl+Q</kbd> ⚡4회 자동발행 (즉시+새벽·정오·저녁)</span>
              </div>
              {parseResult && (() => {
                const LABEL: Record<string, string> = {
                  title: '📝 제목', region: '📍 지역', job: '🔧 직종',
                  salary: '💰 급여', contact: '📞 연락처',
                  meal: '🍱 식사', lodging: '🏠 숙박', weldSub: '🔩 용접종류', weldTest: '📋 시험',
                  company: '🏢 회사명', headcount: '👥 모집인원',
                  ageLimit: '🎂 나이제한', startDate: '📅 투입시기', manager: '👤 담당자',
                  site: '🏭 현장', line: '🔢 라인',
                };
                const SKIP = new Set([
                  'originalText', '_salaryCalc', '_salaryCandidates', '_complexSalary', '_phoneCandidates',
                  'salaryNum', 'dailyWage', 'extraPay', 'totalExpectedPay', 'wageBreakdowns', 'needsReview',
                ]);
                const entries = Object.entries(parseResult).filter(([k, v]) => !SKIP.has(k) && v && String(v) !== '0');
                const cs = parseResult._complexSalary;
                return (
                  <div className="mt-3 bg-blue-50 border-2 border-blue-200 rounded-[10px] p-4 space-y-3">
                    <h4 className="text-sm font-bold text-blue-800">✅ 파싱 결과 — 아래 폼에 자동 반영됐습니다</h4>

                    {/* ── 급여 분석 카드 ── */}
                    {cs && (
                      <div className={`rounded-lg border px-3 py-2.5 ${cs.needsReview ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                          <span className="text-xs font-bold text-amber-800">
                            💰 급여 분석 — 신뢰도 {cs.score}점
                          </span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${cs.needsReview ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                            {cs.needsReview ? '⚠️ 검수 필요' : '✅ 자동 완성'}
                          </span>
                        </div>

                        {/* 역할별 단가 분리 표시 */}
                        {cs.wageBreakdowns.length > 0 && (
                          <div className="space-y-1.5 mb-2">
                            {cs.wageBreakdowns.map((bd, i) => (
                              <div key={i} className="bg-white rounded-lg px-3 py-2 border border-amber-200 text-xs">
                                <div className="flex items-center justify-between flex-wrap gap-1">
                                  <span className="font-bold text-amber-900">{bd.role || '기본단가'}</span>
                                  <span className="text-amber-700 font-semibold">
                                    {toManStr(bd.wage)}원
                                    {bd.extraPay > 0 && (
                                      <>
                                        <span className="text-gray-400 mx-1">+</span>
                                        <span>{bd.extraLabel} {toManStr(bd.extraPay)}원</span>
                                        <span className="ml-1 font-bold text-orange-600">= 총 {toManStr(bd.total)}원</span>
                                      </>
                                    )}
                                  </span>
                                </div>
                                {bd.extraPay > 0 && (
                                  <div className="text-gray-400 mt-0.5 text-[10px]">
                                    기본 {bd.wage.toLocaleString()}원 + {bd.extraLabel} {bd.extraPay.toLocaleString()}원 = 총 {bd.total.toLocaleString()}원
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 단가 후보 클릭 버튼 */}
                        {cs.candidates.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {cs.candidates.map((c, i) => {
                              // 인덱스 불일치 버그 수정: 인덱스 대신 금액 기준으로 매칭
                              const matchBd = cs.wageBreakdowns.find(
                                (bd) => bd.wage === c.num || bd.total === c.num
                              );
                              // 현재 form에 이 후보가 선택돼 있는지 (금액 기준)
                              const isSelected = form.salaryNum === c.num;
                              return (
                                <button key={i} type="button"
                                  title={`출처: "${c.raw}" · ${c.reason}`}
                                  className={`text-xs px-2.5 py-1.5 rounded-lg font-bold border transition-colors cursor-pointer font-[inherit] ${
                                    isSelected
                                      ? 'bg-amber-400 border-amber-500 text-amber-900'
                                      : 'bg-white border-amber-300 text-amber-700 hover:bg-amber-50'
                                  }`}
                                  onClick={() => {
                                    // 클릭한 후보의 금액을 직접 displayText로 사용
                                    const displayText = matchBd
                                      ? buildWageDisplayText([matchBd])
                                      : c.num.toLocaleString('ko-KR') + '원';
                                    console.debug('[급여 후보 선택]', {
                                      후보: c.raw, 금액: c.num, 표시값: displayText, 신뢰도: c.score,
                                    });
                                    // 단일 setForm으로 salary + 숫자값 동시 업데이트 (상태 충돌 방지)
                                    setForm((prev) => ({
                                      ...prev,
                                      salary: displayText,
                                      salaryNum: c.num,
                                      dailyWage: matchBd?.wage ?? c.num,
                                      extraPay: matchBd?.extraPay || undefined,
                                      totalExpectedPay: matchBd?.total || undefined,
                                    }));
                                    showToast(`✅ ${toManStr(c.num)}원으로 변경됐습니다`);
                                  }}
                                >
                                  {toManStr(c.num)}원{isSelected ? ' ✓' : i === 0 ? ' ★' : ''} <span className="opacity-60">({c.score}점)</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-[11px] text-amber-600 mt-1.5">★ 후보를 클릭하면 급여 값이 즉시 변경됩니다</p>

                        {/* 검수 필요 경고 */}
                        {cs.needsReview && (
                          <div className="mt-2 bg-red-100 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-700 font-semibold">
                            ⚠️ 신뢰도 낮음 — 원문 확인 후 급여 값을 직접 수정해주세요
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── 전화번호 파싱 결과 카드 ── */}
                    {(parseResult.contact || (parseResult._phoneCandidates && parseResult._phoneCandidates.length > 0)) && (
                      <div className={`rounded-lg border px-3 py-2.5 ${parseResult.contact ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                          <span className="text-xs font-bold text-green-800">
                            📞 전화번호 파싱
                          </span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${parseResult.contact ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                            {parseResult.contact ? '✅ 자동 인식' : '⚠️ 검수 필요'}
                          </span>
                        </div>
                        {parseResult.contact && (
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-sm font-bold text-green-900">{parseResult.contact}</span>
                            <a href={`tel:${parseResult.contact.replace(/-/g, '')}`}
                              className="text-[11px] bg-green-600 text-white px-2 py-0.5 rounded-full font-bold hover:bg-green-700">
                              📲 전화
                            </a>
                          </div>
                        )}
                        {parseResult._phoneCandidates && parseResult._phoneCandidates.length > 0 && (
                          <>
                            <p className="text-[11px] text-gray-600 mb-1.5">
                              {parseResult.contact ? '감지된 전화번호 목록:' : '⚠️ 자동 인식 실패 — 아래 후보 중 선택하세요:'}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {parseResult._phoneCandidates.map((num, i) => (
                                <button key={i} type="button"
                                  className={`text-xs px-2.5 py-1.5 rounded-lg font-bold border transition-colors cursor-pointer font-[inherit] ${
                                    num === parseResult.contact
                                      ? 'bg-green-400 border-green-500 text-green-900'
                                      : 'bg-white border-blue-300 text-blue-700 hover:bg-blue-50'
                                  }`}
                                  onClick={() => {
                                    setField('contact', num);
                                    showToast(`✅ 연락처가 ${num}으로 설정됐습니다`);
                                  }}
                                >
                                  {num}{num === parseResult.contact ? ' ★' : ''}
                                </button>
                              ))}
                            </div>
                            <p className="text-[11px] text-blue-600 mt-1.5">★ 번호를 클릭하면 연락처 값이 변경됩니다</p>
                          </>
                        )}
                      </div>
                    )}

                    {/* 계산 요약 */}
                    {parseResult._salaryCalc && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs font-bold text-orange-700">
                        💡 {parseResult._salaryCalc}
                      </div>
                    )}

                    {/* 나머지 파싱 필드 */}
                    <div className="flex flex-wrap gap-2">
                      {entries.map(([k, v]) => (
                        <span key={k} className="bg-white border border-blue-200 text-blue-800 text-xs px-2.5 py-1 rounded-lg font-medium">
                          {LABEL[k] ?? k}: <span className="font-bold">{String(v)}</span>
                        </span>
                      ))}
                    </div>
                    {entries.length === 0 && !cs && (
                      <p className="text-xs text-blue-600">파싱된 항목이 없습니다. 원문을 확인해주세요.</p>
                    )}
                  </div>
                );
              })()}
            </div>

            <form ref={formRef} onSubmit={handleAddJob}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-full">
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">공고 제목 <span className="text-[#f97316]">*</span></label>
                  <input ref={titleInputRef} type="text" value={form.title || ''} onChange={(e) => setField('title', e.target.value)} placeholder="공고 제목" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
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
                  <input type="text" value={form.salary || ''} onChange={(e) => setField('salary', e.target.value)} placeholder="예: 18만5천원" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                  {parseResult?._salaryCalc && (
                    <p className="mt-1 text-xs font-semibold text-orange-500">💡 {parseResult._salaryCalc}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">연락처</label>
                  <div className="flex gap-2 items-center">
                    <input type="tel" autoComplete="off" value={form.contact || ''} onChange={(e) => setField('contact', e.target.value)} placeholder="예: 010-1234-5678" className={`flex-1 py-2.5 px-3.5 border-2 rounded-lg text-sm outline-none font-[inherit] transition-colors ${dupWarning ? 'border-amber-400 bg-amber-50 focus:border-amber-500' : 'border-gray-200 focus:border-[#f97316]'}`} />
                    {form.contact && /^01[016789]/.test(form.contact.replace(/-/g, '')) && (
                      <a href={`tel:${form.contact.replace(/-/g, '')}`}
                        className="shrink-0 py-2.5 px-3 bg-green-500 text-white text-sm font-bold rounded-lg hover:bg-green-600 transition-colors">
                        📲
                      </a>
                    )}
                  </div>
                  {dupWarning && (
                    <p className="mt-1 text-[11px] font-bold text-amber-600 flex items-center gap-1">
                      {dupWarning}
                    </p>
                  )}
                  {/* 파싱 후보 번호 — 연락처가 비었거나 여러 개 감지된 경우 */}
                  {parseResult?._phoneCandidates && parseResult._phoneCandidates.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {parseResult._phoneCandidates.map((num, i) => (
                        <button key={i} type="button"
                          onClick={() => { setField('contact', num); showToast(`✅ ${num} 설정됨`); }}
                          className={`text-[11px] px-2 py-1 rounded-md font-bold border cursor-pointer font-[inherit] transition-colors ${
                            form.contact === num
                              ? 'bg-green-500 border-green-600 text-white'
                              : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-green-50 hover:border-green-400'
                          }`}>
                          {num}
                        </button>
                      ))}
                      <span className="text-[10px] text-gray-400 self-center">후보 클릭으로 선택</span>
                    </div>
                  )}
                </div>
                {/* ── 추가 필드 ── */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">🏢 회사명</label>
                  <input type="text" list="cj-ac-companies" value={form.company || ''} onChange={(e) => setField('company', e.target.value)} placeholder="예: 두원전기" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                  <datalist id="cj-ac-companies">{acHistory.companies.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">👥 모집인원</label>
                  <input type="text" value={form.headcount || ''} onChange={(e) => setField('headcount', e.target.value)} placeholder="예: 남자조공 4명" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">🏭 현장명</label>
                  <input type="text" list="cj-ac-sites" value={form.site || ''} onChange={(e) => setField('site', e.target.value)} placeholder="예: 삼성 평택 반도체" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                  <datalist id="cj-ac-sites">
                    {['삼성 반도체', '고덕 P4', '평택 P1', '평택 P2', '평택 P3', '평택 P4', '수원 S1', 'SK하이닉스', 'LG디스플레이', 'LG에너지솔루션', ...acHistory.sites].filter((v, i, a) => a.indexOf(v) === i).map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">🔢 라인</label>
                  <input type="text" value={form.line || ''} onChange={(e) => setField('line', e.target.value)} placeholder="예: P2" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">🎂 나이 제한</label>
                  <input type="text" value={form.ageLimit || ''} onChange={(e) => setField('ageLimit', e.target.value)} placeholder="예: 22~50세" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">📅 투입시기</label>
                  <input type="text" value={form.startDate || ''} onChange={(e) => setField('startDate', e.target.value)} placeholder="예: 다음주 / 즉시 / 4월 30일" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">👤 담당자</label>
                  <input type="text" value={form.manager || ''} onChange={(e) => setField('manager', e.target.value)} placeholder="예: 홍길동 반장" className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316]" />
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
              {/* 자연스러운 랜덤 발행 설정 */}
              <div className="mt-4 mb-1">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div
                    className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${naturalPublish ? 'bg-violet-600' : 'bg-gray-300'}`}
                    onClick={() => { const n = !naturalPublish; setNaturalPublish(n); localStorage.setItem('cj_natural_publish', n ? '1' : '0'); }}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${naturalPublish ? 'left-[22px]' : 'left-[2px]'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-700">🎲 자연스러운 랜덤 발행 적용</p>
                    <p className="text-xs text-gray-400">즉시 등록 대신 짧은 랜덤 지연 후 발행 — 운영자 패턴 분산</p>
                  </div>
                </label>
                {naturalPublish && (
                  <div className="mt-2 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl space-y-2">
                    <p className="text-xs font-bold text-violet-700">발행 지연 범위</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {(['0-3', '0-5', '5-10', 'custom'] as const).map((r) => (
                        <button key={r} type="button"
                          className={`py-1.5 px-3 rounded-lg text-xs font-bold border-2 cursor-pointer transition-all font-[inherit] ${naturalRandRange === r ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400 hover:text-violet-600'}`}
                          onClick={() => { setNaturalRandRange(r); localStorage.setItem('cj_natural_range', r); }}
                        >{r === '0-3' ? '0~3분' : r === '0-5' ? '0~5분' : r === '5-10' ? '5~10분' : '사용자 지정'}</button>
                      ))}
                    </div>
                    {naturalRandRange === 'custom' && (
                      <div className="flex items-center gap-2 pt-1">
                        <input type="number" min={0} max={60} value={naturalCustomMin}
                          onChange={(e) => { const v = Number(e.target.value); setNaturalCustomMin(v); localStorage.setItem('cj_natural_cmin', String(v)); }}
                          className="w-16 py-1.5 px-2 border-2 border-gray-200 rounded-lg text-xs outline-none font-[inherit] focus:border-violet-400" />
                        <span className="text-xs text-gray-500">분 ~</span>
                        <input type="number" min={0} max={60} value={naturalCustomMax}
                          onChange={(e) => { const v = Number(e.target.value); setNaturalCustomMax(v); localStorage.setItem('cj_natural_cmax', String(v)); }}
                          className="w-16 py-1.5 px-2 border-2 border-gray-200 rounded-lg text-xs outline-none font-[inherit] focus:border-violet-400" />
                        <span className="text-xs text-gray-500">분</span>
                      </div>
                    )}
                    <p className="text-[11px] text-violet-500">스마트 분산: 대기 공고가 많을수록 지연 자동 강화 · 예약과 충돌 방지</p>
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button type="submit" disabled={submitting} className={`flex-1 py-[14px] rounded-xl text-[15px] font-bold text-white border-none cursor-pointer font-[inherit] transition-colors flex items-center justify-center gap-2 ${submitting ? 'bg-gray-300 cursor-not-allowed' : naturalPublish ? 'bg-violet-600 hover:bg-violet-700' : 'bg-[#f97316] hover:bg-[#ea580c]'}`}>
                  {submitting ? '등록 중...' : naturalPublish ? '🎲 랜덤 발행 등록' : '✅ 공고 등록하기'}
                  {!submitting && <span className="text-[11px] opacity-60 font-normal bg-white/20 px-1.5 py-0.5 rounded">Ctrl+Enter</span>}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 신청 관리 */}
        {tab === 'reports' && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 pb-2.5 border-b-2 border-gray-100 flex items-center justify-between">
              🚩 신고된 공고
              <button
                className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 py-1.5 px-3 rounded-lg cursor-pointer font-[inherit]"
                onClick={async () => { setReportsLoading(true); setReports(await fbLoadReports()); setReportsLoading(false); }}
              >
                🔄 새로고침
              </button>
            </h2>
            {reportsLoading ? (
              <div className="text-center py-12 text-gray-400">불러오는 중…</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12 text-gray-400">접수된 신고가 없습니다</div>
            ) : (
              <div className="grid gap-3">
                {reports.map((r) => {
                  const targetJob = jobs.find((j) => j.id === r.jobId);
                  return (
                    <div key={r.id} className="border border-red-200 bg-red-50/40 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span className="text-[11px] font-bold bg-red-500 text-white px-2 py-0.5 rounded">
                          {r.reason}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {new Date(r.createdAt).toLocaleString('ko-KR')}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-[#1e3a5f] mb-1 break-words">
                        {r.jobTitle || '(제목 없음)'}
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        📞 {r.jobContact || '-'} · ID: {r.jobId}
                        {!targetJob && <span className="ml-2 text-orange-500 font-semibold">⚠ 공고 삭제됨</span>}
                      </div>
                      {r.note && (
                        <div className="text-[13px] text-gray-700 bg-white border border-gray-200 rounded-lg p-2 mb-2 whitespace-pre-wrap break-words">
                          {r.note}
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        {targetJob && (
                          <>
                            <button
                              className="text-[11px] bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-semibold cursor-pointer hover:bg-gray-50 font-[inherit]"
                              onClick={async () => {
                                if (!confirm('이 공고를 숨김 처리하시겠습니까?')) return;
                                await fbToggleHide(r.jobId, true);
                                showToast('✅ 공고를 숨겼습니다');
                                loadJobs();
                              }}
                            >
                              👁 공고 숨김
                            </button>
                            <button
                              className="text-[11px] bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg font-semibold cursor-pointer hover:bg-red-200 font-[inherit]"
                              onClick={async () => {
                                if (!confirm('이 공고를 완전히 삭제하시겠습니까?')) return;
                                await fbDeleteJob(r.jobId);
                                showToast('✅ 공고를 삭제했습니다');
                                loadJobs();
                              }}
                            >
                              🗑 공고 삭제
                            </button>
                          </>
                        )}
                        <button
                          className="text-[11px] bg-[#1e3a5f] text-white border-none px-3 py-1.5 rounded-lg font-semibold cursor-pointer hover:bg-[#2d5282] font-[inherit] ml-auto"
                          onClick={async () => {
                            try {
                              await fbDeleteReport(r.id);
                              setReports((prev) => prev.filter((x) => x.id !== r.id));
                            } catch {
                              showToast('❌ 신고 삭제 실패 — Firestore 규칙을 확인해주세요');
                            }
                          }}
                        >
                          ✓ 처리 완료
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'products' && <AdminProducts showToast={showToast} />}


        {tab === 'news' && <AdminSiteNews showToast={showToast} />}

        {tab === 'blog' && <AdminBlogArticles showToast={showToast} />}
        {tab === 'toon' && <AdminToon showToast={showToast} />}

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
        {/* ── 방문 통계 탭 ── */}
        {tab === 'stats' && (() => {
          const todayKST = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
          const yesterdayKST = new Date(Date.now() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
          const peak = hourlyData.length ? hourlyData.reduce((a, b) => a.count >= b.count ? a : b) : null;
          const totalHourly = hourlyData.reduce((s, r) => s + r.count, 0);
          return (
            <div className="flex flex-col gap-5">
              {/* 요약 카드 */}
              {visitorTotals && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: '오늘', value: visitorTotals.today, color: 'text-[#f97316]' },
                    { label: '어제', value: visitorTotals.yesterday, color: 'text-blue-600' },
                    { label: '이번주', value: visitorTotals.week, color: 'text-green-600' },
                    { label: '전체', value: visitorTotals.total, color: 'text-gray-700' },
                  ].map((c) => (
                    <div key={c.label} className="bg-white rounded-xl p-4 shadow-sm text-center">
                      <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                      <p className={`text-2xl font-black ${c.color}`}>{c.value.toLocaleString()}</p>
                      <p className="text-xs text-gray-400 mt-0.5">명</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 시간대별 차트 */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="text-base font-bold text-[#1e3a5f]">🕐 시간대별 방문자 (KST)</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => { setStatsDate(todayKST); loadHourlyStats(todayKST); }}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold border cursor-pointer font-[inherit] ${statsDate === todayKST ? 'bg-[#f97316] text-white border-[#f97316]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#f97316]'}`}>
                      오늘
                    </button>
                    <button onClick={() => { setStatsDate(yesterdayKST); loadHourlyStats(yesterdayKST); }}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold border cursor-pointer font-[inherit] ${statsDate === yesterdayKST ? 'bg-[#f97316] text-white border-[#f97316]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#f97316]'}`}>
                      어제
                    </button>
                    <input type="date" value={statsDate} max={todayKST}
                      onChange={(e) => { setStatsDate(e.target.value); loadHourlyStats(e.target.value); }}
                      className="text-xs px-2 py-1.5 rounded-lg border-2 border-gray-200 outline-none font-[inherit] focus:border-[#f97316]" />
                    <button onClick={() => loadHourlyStats(statsDate)}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold border border-gray-200 bg-white text-gray-600 hover:border-[#f97316] cursor-pointer font-[inherit]">
                      {statsLoading ? '⏳' : '🔄'}
                    </button>
                  </div>
                </div>

                {/* 피크/합계 뱃지 */}
                {!statsLoading && totalHourly > 0 && (
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <span className="bg-orange-50 border border-orange-200 text-orange-700 text-xs px-2.5 py-1 rounded-lg font-semibold">
                      📈 피크: {peak?.hour}시 ({peak?.count}명)
                    </span>
                    <span className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2.5 py-1 rounded-lg font-semibold">
                      👥 시간별 합계: {totalHourly}명
                    </span>
                    <span className="text-xs text-gray-400 self-center">* 같은 IP라도 시간대 달라지면 카운트</span>
                  </div>
                )}

                {statsLoading ? (
                  <div className="flex items-center justify-center h-52 text-gray-400 text-sm">불러오는 중...</div>
                ) : hourlyData.length === 0 ? (
                  <div className="flex items-center justify-center h-52 text-gray-400 text-sm">
                    데이터 없음 — 조회 버튼을 눌러주세요
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={hourlyData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}시`} tick={{ fontSize: 10 }} interval={1} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [`${v}명`, '방문자']} labelFormatter={(h: number) => `${h}시~${h + 1}시`} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {hourlyData.map((row) => (
                          <Cell key={row.hour} fill={row === peak && peak.count > 0 ? '#f97316' : '#1e3a5f'} fillOpacity={row.count === 0 ? 0.15 : 0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* 시간대별 숫자 리스트 */}
              {!statsLoading && totalHourly > 0 && (
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-[#1e3a5f] mb-3">📋 시간대별 상세</h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {hourlyData.map((row) => (
                      <div key={row.hour} className={`rounded-lg px-2 py-2 text-center border ${row === peak && peak.count > 0 ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-100'}`}>
                        <p className="text-[11px] text-gray-400 font-medium">{String(row.hour).padStart(2, '0')}시</p>
                        <p className={`text-base font-black ${row === peak && peak.count > 0 ? 'text-[#f97316]' : row.count > 0 ? 'text-[#1e3a5f]' : 'text-gray-300'}`}>{row.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 유입 경로 */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="text-base font-bold text-[#1e3a5f]">🌐 유입 경로</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleSourceDaysChange(1)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold border cursor-pointer font-[inherit] ${sourceDays === 1 ? 'bg-[#f97316] text-white border-[#f97316]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#f97316]'}`}>
                      선택한 날짜
                    </button>
                    <button onClick={() => handleSourceDaysChange(7)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold border cursor-pointer font-[inherit] ${sourceDays === 7 ? 'bg-[#f97316] text-white border-[#f97316]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#f97316]'}`}>
                      최근 7일
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                  {sourceDays === 1 ? statsDate : `${statsDate} 기준 최근 7일 합계`} · 같은 IP는 같은 유입경로로 하루 1회만 집계
                  <br />
                  사이트 내부 이동은 제외 · 출처 미확인은 브라우저가 원래 앱이나 링크 정보를 보내지 않은 방문
                </p>

                {statsLoading ? (
                  <div className="flex items-center justify-center h-32 text-gray-400 text-sm">불러오는 중...</div>
                ) : sourceData.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-gray-400 text-sm">이 기간엔 방문 기록이 없어요</div>
                ) : (() => {
                  const maxCount = Math.max(...sourceData.map((r) => r.count));
                  const totalSource = sourceData.reduce((s, r) => s + r.count, 0);
                  return (
                    <div className="flex flex-col gap-2.5">
                      {sourceData.map((r) => {
                        const style = SOURCE_STYLE[r.source] ?? SOURCE_STYLE['other'];
                        const pct = totalSource ? Math.round((r.count / totalSource) * 100) : 0;
                        const barPct = maxCount ? Math.max((r.count / maxCount) * 100, 4) : 0;
                        return (
                          <div key={r.source} className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                              <span className="w-[118px] shrink-0 text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                                <span aria-hidden className="inline-flex items-center justify-center w-4 text-center">{style.icon}</span>
                                {r.label || style.label}
                              </span>
                              <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${barPct}%`, backgroundColor: style.color }}
                                />
                              </div>
                              <span className="w-[92px] shrink-0 text-right text-xs font-bold text-gray-700 tabular-nums">
                                {r.count.toLocaleString()}명 <span className="text-gray-400 font-normal">({pct}%)</span>
                              </span>
                            </div>
                            {/* 출처 미확인만 기기 종류로 한 번 더 쪼개서 원인 진단에 도움을 준다(2026-08-31 추가) */}
                            {r.source === 'unknown' && unknownDeviceData.length > 0 && (
                              <p className="pl-[130px] text-[11px] text-gray-400">
                                {unknownDeviceData
                                  .map((d) => `${d.device === 'mobile' ? '📱 모바일' : '💻 PC'} ${d.count.toLocaleString()}명`)
                                  .join(' · ')}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* UTM 캠페인/게시물별 성과 */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-base font-bold text-[#1e3a5f]">📣 홍보 링크별 성과</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    홍보 주소에 utm_campaign 또는 utm_content가 붙은 방문을 게시물 단위로 집계합니다.
                  </p>
                </div>
                {statsLoading ? (
                  <div className="flex items-center justify-center h-24 text-gray-400 text-sm">불러오는 중...</div>
                ) : campaignData.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
                    <p className="text-sm font-semibold text-gray-500">이 기간에는 표시된 홍보 링크 방문이 없어요</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      예: ?utm_source=naver_kin&amp;utm_campaign=지식인답변&amp;utm_content=답변1
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-400">
                          <th className="py-2 pr-3 font-semibold">유입처</th>
                          <th className="py-2 pr-3 font-semibold">캠페인</th>
                          <th className="py-2 pr-3 font-semibold">게시물 표시</th>
                          <th className="py-2 pr-3 font-semibold">첫 방문 페이지</th>
                          <th className="py-2 text-right font-semibold">방문</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignData.map((row, index) => {
                          const style = SOURCE_STYLE[row.source] ?? SOURCE_STYLE.other;
                          return (
                            <tr
                              key={`${row.source}-${row.campaign}-${row.content}-${row.landingPath}-${index}`}
                              className="border-b border-gray-100 last:border-0"
                            >
                              <td className="py-2.5 pr-3 font-semibold text-gray-700">
                                <span
                                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                                  style={{ backgroundColor: style.color }}
                                />
                                {row.label || style.label}
                                {row.medium && <span className="text-gray-400 font-normal"> · {row.medium}</span>}
                              </td>
                              <td className="py-2.5 pr-3 text-gray-600">{row.campaign || '-'}</td>
                              <td className="py-2.5 pr-3 text-gray-600">{row.content || '-'}</td>
                              <td
                                className="py-2.5 pr-3 text-gray-500 max-w-[220px] truncate"
                                title={readableLandingPath(row.landingPath)}
                              >
                                {readableLandingPath(row.landingPath)}
                              </td>
                              <td className="py-2.5 text-right font-black text-[#f97316]">{row.count.toLocaleString()}명</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 첫 방문 페이지 */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-base font-bold text-[#1e3a5f]">🚪 처음 들어온 페이지</h2>
                  <p className="text-xs text-gray-400 mt-1">방문자가 외부 링크에서 처음 도착한 페이지 상위 15개입니다.</p>
                </div>
                {statsLoading ? (
                  <div className="flex items-center justify-center h-24 text-gray-400 text-sm">불러오는 중...</div>
                ) : landingData.length === 0 ? (
                  <div className="flex items-center justify-center h-20 text-gray-400 text-sm">
                    새 통계 적용 이후 방문부터 표시됩니다
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {landingData.map((row, index) => {
                      const style = SOURCE_STYLE[row.source] ?? SOURCE_STYLE.other;
                      return (
                        <div
                          key={`${row.source}-${row.landingPath}-${index}`}
                          className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                        >
                          <span
                            className="shrink-0 text-[10px] font-bold text-white rounded-full px-2 py-1"
                            style={{ backgroundColor: style.color }}
                          >
                            {row.label || style.label}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700"
                            title={readableLandingPath(row.landingPath)}
                          >
                            {readableLandingPath(row.landingPath)}
                          </span>
                          <span className="shrink-0 text-xs font-black text-[#1e3a5f]">{row.count.toLocaleString()}명</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {tab === 'settings' && (
          <div className="flex flex-col gap-5">
            {/* 신고 받기 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-3 flex items-center gap-2">
                🚩 공고 신고 받기
              </h2>
              <div className="text-sm text-gray-600 mb-5 space-y-1 leading-relaxed">
                <p><span className="font-bold text-gray-700">ON (기본):</span> 사용자가 공고 카드의 🚩 신고 버튼으로 신고 가능</p>
                <p><span className="font-bold text-gray-700">OFF:</span> 신고 버튼이 사용자 화면에서 숨겨짐</p>
              </div>
              <button
                onClick={() => {
                  const cur = localStorage.getItem('cj_reports_enabled') !== '0';
                  const next = cur ? '0' : '1';
                  localStorage.setItem('cj_reports_enabled', next);
                  // 같은 탭 내 다른 컴포넌트에 즉시 알리기 위한 합성 storage 이벤트
                  window.dispatchEvent(new StorageEvent('storage', { key: 'cj_reports_enabled', newValue: next }));
                  showToast(cur ? '🚫 신고 받기 OFF' : '✅ 신고 받기 ON');
                  setReportsEnabledUI(!cur);
                }}
                className="flex items-center gap-3 cursor-pointer border-none bg-transparent p-0 font-[inherit]"
                type="button"
              >
                <span
                  className="relative inline-flex w-[52px] h-[28px] rounded-full transition-colors duration-200 shrink-0"
                  style={{ background: reportsEnabledUI ? '#22c55e' : '#d1d5db' }}
                >
                  <span
                    className="absolute top-[3px] left-[3px] w-[22px] h-[22px] bg-white rounded-full shadow transition-transform duration-200"
                    style={{ transform: reportsEnabledUI ? 'translateX(24px)' : 'translateX(0)' }}
                  />
                </span>
                <span className={`text-[15px] font-extrabold ${reportsEnabledUI ? 'text-emerald-600' : 'text-gray-500'}`}>
                  {reportsEnabledUI ? 'ON — 신고 받는 중' : 'OFF — 신고 버튼 숨김'}
                </span>
              </button>
              <div className="mt-4 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 leading-relaxed">
                <span className="text-base shrink-0">💡</span>
                <div>
                  <p className="font-semibold mb-1">크로스 디바이스 신고 수신을 활성화하려면:</p>
                  <p>Firebase Console → Firestore → 규칙에서 <code className="bg-white px-1 rounded text-[11px]">match /reports/&#123;id&#125;</code> 에 <code className="bg-white px-1 rounded text-[11px]">allow create: if true;</code> 추가 필요.</p>
                  <p className="mt-1">규칙을 추가하지 않아도 사용자에게는 정상 접수 메시지가 표시되며, 같은 기기의 신고만 관리자 페이지에서 보입니다.</p>
                </div>
              </div>
            </div>

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

              {/* 자동 삭제 시간 (데이터까지 영구 삭제) */}
              <p className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <span>🗑️</span> 공고 자동삭제 시간 <span className="text-[10px] font-normal text-red-500 bg-red-50 px-1.5 py-0.5 rounded">데이터 영구 삭제</span>
              </p>
              <div className="flex items-center gap-3 mb-2">
                <select
                  value={autoDeleteHours}
                  onChange={(e) => setAutoDeleteHours(e.target.value)}
                  className="py-2.5 px-3.5 border-2 border-gray-200 rounded-xl text-sm font-semibold outline-none bg-white font-[inherit] focus:border-[#ef4444] appearance-none cursor-pointer min-w-[220px]"
                >
                  <option value="0">비활성화 (자동삭제 안함)</option>
                  <option value="72">72시간 후 자동삭제 (3일)</option>
                  <option value="168">7일 후 자동삭제</option>
                  <option value="336">14일 후 자동삭제</option>
                  <option value="720">30일 후 자동삭제</option>
                  <option value="2160">90일 후 자동삭제</option>
                </select>
                <button
                  onClick={saveAutoDelete}
                  className="bg-red-500 text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-red-600 transition-colors font-[inherit] whitespace-nowrap"
                >
                  저장
                </button>
              </div>
              <p className="text-xs text-red-500 mb-6 leading-relaxed">
                ⚠️ 설정한 시간이 지난 공고는 <strong>Firestore에서 완전히 삭제됩니다</strong>. 신고 내역 등 연결된 데이터도 함께 사라지며 복구할 수 없습니다.<br />
                자동숨김 시간보다 반드시 더 길게 설정하세요. (예: 자동숨김 48시간 → 자동삭제 7일)
              </p>

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

            {/* 오픈채팅 URL 설정 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-2 flex items-center gap-2">
                💛 카카오 오픈채팅 URL 설정
              </h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                메인 페이지 우측 상단 <strong>오픈채팅</strong> 버튼 클릭 시 열릴 카카오 오픈채팅 주소를 입력하세요.<br />
                예: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">https://open.kakao.com/o/xxxxxxxx</code>
              </p>
              <div className="max-w-[680px]">
                <label className="block text-sm font-bold text-gray-700 mb-1.5">오픈채팅 URL</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={settings.openChatUrl}
                    onChange={(e) => setSettings((p) => ({ ...p, openChatUrl: e.target.value }))}
                    placeholder="예: https://open.kakao.com/o/xxxxxxxx"
                    className="flex-1 py-2.5 px-3.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#f97316]"
                  />
                  <button
                    className="bg-[#f97316] text-white border-none py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit] whitespace-nowrap"
                    onClick={async () => {
                      const v = settings.openChatUrl.trim();
                      if (v && !v.startsWith('http')) {
                        showToast('⚠️ http:// 또는 https:// 로 시작해야 합니다');
                        return;
                      }
                      localStorage.setItem('cj_openchat_url', v);
                      setSettings((p) => ({ ...p, openChatUrl: v }));
                      try {
                        await fbSetSetting('openchat_url', v);
                        showToast('✅ 오픈채팅 URL이 저장됐습니다 (모든 기기 동기화)');
                      } catch {
                        showToast('✅ 저장됐지만 서버 동기화 실패 — 이 기기에서만 적용');
                      }
                    }}
                  >
                    저장
                  </button>
                </div>
                <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-600 break-all">
                  현재 오픈채팅: <strong className="text-gray-800">{settings.openChatUrl || '설정 없음 (오픈채팅 버튼 클릭 시 안내 알림)'}</strong>
                </div>
              </div>
            </div>

            {/* 셔틀시간표 드롭다운 링크 관리 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-2 flex items-center gap-2">
                🚌 셔틀시간표 링크 관리
              </h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                홈 화면 "새 공고 알림받기" 줄의 <strong>🚌 셔틀시간표▼</strong> 드롭다운에 뜰 항목입니다.
                현장이 늘어나면 아래에서 항목을 추가하면 됩니다. 링크는 보통 건설꿀팁 글 주소(<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/info/글슬러그</code>) 형식입니다.
              </p>
              <div className="max-w-[680px] flex flex-col gap-2.5">
                {shuttleLinks.map((s, i) => (
                  <div key={i} className="flex gap-2 items-center flex-wrap">
                    <input
                      type="text"
                      value={s.icon ?? ''}
                      onChange={(e) => setShuttleLinks((prev) => prev.map((x, idx) => (idx === i ? { ...x, icon: e.target.value } : x)))}
                      placeholder="🚌"
                      title="이모지"
                      className="w-[48px] shrink-0 py-2 px-2 text-center border-[1.5px] border-gray-200 rounded-lg text-base outline-none font-[inherit] focus:border-[#f97316]"
                    />
                    <input
                      type="color"
                      value={s.color || '#1f2937'}
                      onChange={(e) => setShuttleLinks((prev) => prev.map((x, idx) => (idx === i ? { ...x, color: e.target.value } : x)))}
                      title="글씨 색"
                      className="w-[36px] h-[36px] shrink-0 p-0.5 border-[1.5px] border-gray-200 rounded-lg cursor-pointer"
                    />
                    <input
                      type="text"
                      value={s.label}
                      onChange={(e) => setShuttleLinks((prev) => prev.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                      placeholder="표시 이름 (예: 용인SK셔틀)"
                      style={{ color: s.color || undefined }}
                      className="w-[150px] shrink-0 py-2 px-3 border-[1.5px] border-gray-200 rounded-lg text-[13px] font-bold outline-none font-[inherit] focus:border-[#f97316]"
                    />
                    <input
                      type="text"
                      value={s.href}
                      onChange={(e) => setShuttleLinks((prev) => prev.map((x, idx) => (idx === i ? { ...x, href: e.target.value } : x)))}
                      placeholder="/info/글-슬러그"
                      className="flex-1 min-w-[160px] py-2 px-3 border-[1.5px] border-gray-200 rounded-lg text-[13px] outline-none font-[inherit] focus:border-[#f97316]"
                    />
                    <button
                      onClick={() => setShuttleLinks((prev) => prev.filter((_, idx) => idx !== i))}
                      className="shrink-0 text-gray-400 hover:text-red-500 transition-colors text-lg leading-none cursor-pointer bg-transparent border-none px-1"
                      title="삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {shuttleLinks.length === 0 && (
                  <div className="text-xs text-gray-400 py-2">항목이 없습니다. 아래 버튼으로 추가하세요.</div>
                )}
                <div className="flex gap-2 mt-1">
                  <button
                    className="flex items-center gap-1.5 bg-white border-[1.5px] border-[#1e3a5f] text-[#1e3a5f] py-2 px-4 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#1e3a5f] hover:text-white transition-all font-[inherit]"
                    onClick={() => setShuttleLinks((prev) => [...prev, { label: '', href: '', icon: '🚌', color: '#1f2937' }])}
                  >
                    + 항목 추가
                  </button>
                  <button
                    className="bg-[#f97316] text-white border-none py-2 px-5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors font-[inherit]"
                    onClick={async () => {
                      const cleaned = shuttleLinks
                        .map((s) => ({
                          label: s.label.trim(),
                          href: s.href.trim(),
                          icon: (s.icon || '').trim(),
                          color: (s.color || '').trim(),
                        }))
                        .filter((s) => s.label && s.href);
                      setShuttleLinks(cleaned);
                      localStorage.setItem('cj_shuttle_links', JSON.stringify(cleaned));
                      try {
                        await fbSetSetting('shuttle_links', cleaned);
                        showToast('✅ 셔틀시간표 목록이 저장됐습니다 (모든 기기 동기화)');
                      } catch {
                        showToast('✅ 저장됐지만 서버 동기화 실패 — 이 기기에서만 적용');
                      }
                    }}
                  >
                    💾 저장
                  </button>
                </div>
              </div>
            </div>

            {/* 용인SK 셔틀시간표 본문 데이터 관리 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-2 flex items-center gap-2">
                🚍 용인SK 셔틀시간표 데이터 관리
              </h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                <a href="/info/yongin-sk-shuttle-schedule" target="_blank" rel="noreferrer" className="text-[#f97316] underline">/info/yongin-sk-shuttle-schedule</a> 페이지에 표시되는
                정류장별 출근·퇴근 시간표입니다. 시간은 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">HH:MM</code> 형식으로 쉼표(,)로 구분해서 입력하세요.
              </p>
              <div className="flex flex-col gap-6">
                {shuttleSchedule.map((group, gi) => (
                  <div key={group.key} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex gap-2 items-center mb-3 flex-wrap">
                      <input
                        type="text"
                        value={group.title}
                        onChange={(e) => setShuttleSchedule((prev) => prev.map((g, idx) => (idx === gi ? { ...g, title: e.target.value } : g)))}
                        placeholder="그룹 이름 (예: 현장 인근)"
                        className="w-[150px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] font-bold outline-none font-[inherit] focus:border-[#EE1C25]"
                      />
                      <input
                        type="text"
                        value={group.desc}
                        onChange={(e) => setShuttleSchedule((prev) => prev.map((g, idx) => (idx === gi ? { ...g, desc: e.target.value } : g)))}
                        placeholder="그룹 설명"
                        className="flex-1 min-w-[160px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#EE1C25]"
                      />
                      <span className="text-xs text-gray-400 shrink-0">{group.stops.length}곳</span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {group.stops.map((stop, si) => {
                        const stopId = `${gi}-${si}`;
                        const isOpen = shuttleScheduleOpenStop === stopId;
                        return (
                          <div key={stopId} className="border border-gray-100 rounded-lg bg-gray-50/60">
                            <button
                              type="button"
                              onClick={() => setShuttleScheduleOpenStop(isOpen ? null : stopId)}
                              className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-transparent border-none cursor-pointer"
                            >
                              <span className="text-[13px] font-bold text-gray-800">{stop.name || '(이름 없음)'}</span>
                              <span className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400">출근 {stop.commuteIn.length} · 퇴근 {stop.commuteOut.length}</span>
                                <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                              </span>
                            </button>
                            {isOpen && (
                              <div className="px-3 pb-3 flex flex-col gap-2">
                                <div className="flex gap-2 flex-wrap">
                                  <input
                                    type="text"
                                    value={stop.name}
                                    onChange={(e) => setShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, stops: g.stops.map((s, sidx) => sidx === si ? { ...s, name: e.target.value } : s) }))}
                                    placeholder="정류장 이름"
                                    className="w-[160px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] font-bold outline-none font-[inherit] focus:border-[#EE1C25]"
                                  />
                                  <input
                                    type="text"
                                    value={stop.address ?? ''}
                                    onChange={(e) => setShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, stops: g.stops.map((s, sidx) => sidx === si ? { ...s, address: e.target.value } : s) }))}
                                    placeholder="주소"
                                    className="flex-1 min-w-[160px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#EE1C25]"
                                  />
                                  <input
                                    type="text"
                                    value={stop.note ?? ''}
                                    onChange={(e) => setShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, stops: g.stops.map((s, sidx) => sidx === si ? { ...s, note: e.target.value } : s) }))}
                                    placeholder="특이사항 (예: 승차권 필요, 없으면 비움)"
                                    className="w-[220px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#EE1C25]"
                                  />
                                  <button
                                    onClick={() => setShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, stops: g.stops.filter((_, sidx) => sidx !== si) }))}
                                    className="shrink-0 text-gray-400 hover:text-red-500 transition-colors text-base leading-none cursor-pointer bg-transparent border-none px-1"
                                    title="이 정류장 삭제"
                                  >
                                    ×
                                  </button>
                                </div>
                                <label className="text-[11px] font-bold text-gray-500">출근 시간표 (쉼표로 구분)</label>
                                <textarea
                                  value={stop.commuteIn.join(', ')}
                                  onChange={(e) => setShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, stops: g.stops.map((s, sidx) => sidx === si ? { ...s, commuteIn: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } : s) }))}
                                  rows={2}
                                  className="w-full py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#EE1C25] resize-y"
                                  placeholder="03:30, 03:50, 04:00, ..."
                                />
                                <label className="text-[11px] font-bold text-gray-500">퇴근 시간표 (쉼표로 구분)</label>
                                <textarea
                                  value={stop.commuteOut.join(', ')}
                                  onChange={(e) => setShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, stops: g.stops.map((s, sidx) => sidx === si ? { ...s, commuteOut: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } : s) }))}
                                  rows={2}
                                  className="w-full py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#EE1C25] resize-y"
                                  placeholder="07:10, 07:20, 07:40, ..."
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button
                        className="self-start flex items-center gap-1.5 bg-white border-[1.5px] border-gray-300 text-gray-500 py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer hover:border-[#EE1C25] hover:text-[#EE1C25] transition-all font-[inherit]"
                        onClick={() => setShuttleSchedule((prev) => prev.map((g, idx) => idx === gi ? { ...g, stops: [...g.stops, { name: '', address: '', destination: 'SK 용인 현장', commuteIn: [], commuteOut: [] }] } : g))}
                      >
                        + 정류장 추가
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  className="self-start bg-[#EE1C25] text-white border-none py-2.5 px-6 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#c8151c] transition-colors font-[inherit]"
                  onClick={async () => {
                    localStorage.setItem('cj_shuttle_schedule_yongin_sk', JSON.stringify(shuttleSchedule));
                    try {
                      await fbSetSetting('shuttle_schedule_yongin_sk', shuttleSchedule);
                      showToast('✅ 셔틀시간표 데이터가 저장됐습니다 (모든 기기 동기화)');
                    } catch {
                      showToast('✅ 저장됐지만 서버 동기화 실패 — 이 기기에서만 적용');
                    }
                  }}
                >
                  💾 전체 저장
                </button>
              </div>
            </div>

            {/* 평택삼성 셔틀시간표 본문 데이터 관리 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-2 flex items-center gap-2">
                🚌 평택삼성 셔틀시간표 데이터 관리
              </h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                <a href="/info/pyeongtaek-samsung-shuttle-schedule" target="_blank" rel="noreferrer" className="text-[#f97316] underline">/info/pyeongtaek-samsung-shuttle-schedule</a> 페이지에 표시되는
                노선별 출근·퇴근·주말 시간표입니다. 시간은 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">HH:MM</code> 형식으로 쉼표(,)로 구분해서 입력하세요.
              </p>
              <div className="flex flex-col gap-6">
                {samsungShuttleSchedule.map((group, gi) => (
                  <div key={group.key} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex gap-2 items-center mb-3 flex-wrap">
                      <input
                        type="text"
                        value={group.title}
                        onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, idx) => (idx === gi ? { ...g, title: e.target.value } : g)))}
                        placeholder="회사 이름 (예: 삼성물산)"
                        className="w-[150px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] font-bold outline-none font-[inherit] focus:border-[#1428A0]"
                      />
                      <span className="text-xs text-gray-400 shrink-0">노선 {group.routes.length}개</span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {group.routes.map((route, ri) => {
                        const routeId = `${gi}-${ri}`;
                        const isOpen = samsungShuttleOpenRoute === routeId;
                        return (
                          <div key={routeId} className="border border-gray-100 rounded-lg bg-gray-50/60">
                            <button
                              type="button"
                              onClick={() => setSamsungShuttleOpenRoute(isOpen ? null : routeId)}
                              className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-transparent border-none cursor-pointer"
                            >
                              <span className="text-[13px] font-bold text-gray-800">{route.routeNumber}번 {route.name || '(이름 없음)'}</span>
                              <span className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400">출근 {route.commuteIn.length} · 퇴근 {route.commuteOut.length} · 주말출근 {route.weekendCommuteIn.length}</span>
                                <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                              </span>
                            </button>
                            {isOpen && (
                              <div className="px-3 pb-3 flex flex-col gap-2">
                                <div className="flex gap-2 flex-wrap">
                                  <input
                                    type="text"
                                    value={route.routeNumber}
                                    onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, routeNumber: e.target.value } : r) }))}
                                    placeholder="노선 번호"
                                    className="w-[70px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] font-bold outline-none font-[inherit] focus:border-[#1428A0]"
                                  />
                                  <input
                                    type="text"
                                    value={route.name}
                                    onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, name: e.target.value } : r) }))}
                                    placeholder="노선 이름"
                                    className="w-[160px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] font-bold outline-none font-[inherit] focus:border-[#1428A0]"
                                  />
                                  <input
                                    type="text"
                                    value={route.contractor}
                                    onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, contractor: e.target.value } : r) }))}
                                    placeholder="운영사 (예: 삼성물산/더조은)"
                                    className="flex-1 min-w-[160px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0]"
                                  />
                                  <label className="flex items-center gap-1.5 text-[11px] text-gray-500 shrink-0">
                                    <input
                                      type="checkbox"
                                      checked={route.isExpress}
                                      onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, isExpress: e.target.checked } : r) }))}
                                    />
                                    직행
                                  </label>
                                  <button
                                    onClick={() => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.filter((_, ridx) => ridx !== ri) }))}
                                    className="shrink-0 text-gray-400 hover:text-red-500 transition-colors text-base leading-none cursor-pointer bg-transparent border-none px-1"
                                    title="이 노선 삭제"
                                  >
                                    ×
                                  </button>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  <input
                                    type="text"
                                    value={route.origin.name}
                                    onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, origin: { ...r.origin, name: e.target.value } } : r) }))}
                                    placeholder="출발 정류장 이름"
                                    className="w-[160px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0]"
                                  />
                                  <input
                                    type="text"
                                    value={route.origin.address ?? ''}
                                    onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, origin: { ...r.origin, address: e.target.value } } : r) }))}
                                    placeholder="출발지 주소"
                                    className="flex-1 min-w-[160px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0]"
                                  />
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  <input
                                    type="text"
                                    value={route.destination.name}
                                    onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, destination: { ...r.destination, name: e.target.value } } : r) }))}
                                    placeholder="도착 정류장 이름"
                                    className="w-[160px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0]"
                                  />
                                  <input
                                    type="text"
                                    value={route.destination.address ?? ''}
                                    onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, destination: { ...r.destination, address: e.target.value } } : r) }))}
                                    placeholder="도착지 주소"
                                    className="flex-1 min-w-[160px] py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0]"
                                  />
                                </div>
                                <label className="text-[11px] font-bold text-gray-500">경유 정류장 (한 줄에 하나, "이름|주소" 형식)</label>
                                <textarea
                                  value={route.stops.map((s) => `${s.name}|${s.address ?? ''}`).join('\n')}
                                  onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, stops: e.target.value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const [name, address] = line.split('|'); return { name: (name ?? '').trim(), address: (address ?? '').trim() || null }; }) } : r) }))}
                                  rows={3}
                                  className="w-full py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0] resize-y"
                                  placeholder="한국유통수퍼센타 앞|경기도 평택시 신장동 211-59"
                                />
                                <label className="text-[11px] font-bold text-gray-500">평일 출근 시간표 (쉼표로 구분)</label>
                                <textarea
                                  value={route.commuteIn.join(', ')}
                                  onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, commuteIn: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } : r) }))}
                                  rows={2}
                                  className="w-full py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0] resize-y"
                                  placeholder="04:00, 04:30, 04:40, ..."
                                />
                                <label className="text-[11px] font-bold text-gray-500">평일 퇴근 시간표 (쉼표로 구분)</label>
                                <textarea
                                  value={route.commuteOut.join(', ')}
                                  onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, commuteOut: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } : r) }))}
                                  rows={2}
                                  className="w-full py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0] resize-y"
                                  placeholder="16:20, 16:40, 17:00, ..."
                                />
                                <label className="text-[11px] font-bold text-gray-500">주말 출근 시간표 (쉼표로 구분, 없으면 비움)</label>
                                <textarea
                                  value={route.weekendCommuteIn.join(', ')}
                                  onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, weekendCommuteIn: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } : r) }))}
                                  rows={2}
                                  className="w-full py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0] resize-y"
                                  placeholder="04:20, 04:30, ..."
                                />
                                <label className="text-[11px] font-bold text-gray-500">주말 퇴근 시간표 (쉼표로 구분, 없으면 비움)</label>
                                <textarea
                                  value={route.weekendCommuteOut.join(', ')}
                                  onChange={(e) => setSamsungShuttleSchedule((prev) => prev.map((g, gidx) => gidx !== gi ? g : { ...g, routes: g.routes.map((r, ridx) => ridx === ri ? { ...r, weekendCommuteOut: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } : r) }))}
                                  rows={2}
                                  className="w-full py-1.5 px-2.5 border-[1.5px] border-gray-200 rounded-lg text-[12px] outline-none font-[inherit] focus:border-[#1428A0] resize-y"
                                  placeholder="15:20, 15:30, ..."
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button
                        className="self-start flex items-center gap-1.5 bg-white border-[1.5px] border-gray-300 text-gray-500 py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer hover:border-[#1428A0] hover:text-[#1428A0] transition-all font-[inherit]"
                        onClick={() => setSamsungShuttleSchedule((prev) => prev.map((g, idx) => idx === gi ? { ...g, routes: [...g.routes, { id: `route-new-${Date.now()}`, routeNumber: '', name: '', contractor: '', isExpress: false, origin: { name: '', address: '' }, destination: { name: '', address: '' }, stops: [], commuteIn: [], commuteOut: [], weekendCommuteIn: [], weekendCommuteOut: [] } as any] } : g))}
                      >
                        + 노선 추가
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  className="self-start bg-[#1428A0] text-white border-none py-2.5 px-6 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#0E1D70] transition-colors font-[inherit]"
                  onClick={async () => {
                    localStorage.setItem('cj_shuttle_schedule_pyeongtaek_samsung', JSON.stringify(samsungShuttleSchedule));
                    try {
                      await fbSetSetting('shuttle_schedule_pyeongtaek_samsung', samsungShuttleSchedule);
                      showToast('✅ 셔틀시간표 데이터가 저장됐습니다 (모든 기기 동기화)');
                    } catch {
                      showToast('✅ 저장됐지만 서버 동기화 실패 — 이 기기에서만 적용');
                    }
                  }}
                >
                  💾 전체 저장
                </button>
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

      {/* 예약 등록 모달 */}
      {showReserveModal && (() => {
        const nowKST = Date.now();
        const previewMs =
          reserveModalTab === 'delay'
            ? nowKST + delayHours * 3600000 + (useRandomSpread ? 10 * 60000 : 0)
            : reserveDate && reserveTime
            ? new Date(toKSTIso(reserveDate, reserveTime)).getTime() + (useRandomSpread ? 10 * 60000 : 0)
            : 0;
        const previewLabel = previewMs > nowKST ? formatKST(new Date(previewMs).toISOString()) : '';
        const OPTIMAL = [
          { label: '🌅 새벽 05:30', h: 5, m: 30 },
          { label: '☀️ 정오 11:00', h: 11, m: 0 },
          { label: '🌙 저녁 20:00', h: 20, m: 0 },
        ];
        return (
          <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
              {/* 헤더 */}
              <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-5 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#1e3a5f]">📅 예약 발행 설정</h3>
                  <p className="text-xs text-gray-400 truncate mt-0.5 max-w-[240px]">📝 {form.title}</p>
                </div>
                <button
                  onClick={() => setShowReserveModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 border-none cursor-pointer hover:bg-gray-200 text-lg font-bold font-[inherit]"
                >×</button>
              </div>

              <div className="px-5 py-4 space-y-5">
                {/* ── 탭 ── */}
                <div className="bg-gray-100 rounded-xl p-1 flex gap-1">
                  {([['delay', '⏱ 지연 등록'], ['custom', '📅 시간 직접 선택']] as const).map(([k, lbl]) => (
                    <button key={k} type="button"
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border-none cursor-pointer transition-all font-[inherit] ${reserveModalTab === k ? 'bg-white text-violet-700 shadow-sm' : 'bg-transparent text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setReserveModalTab(k)}
                    >{lbl}</button>
                  ))}
                </div>

                {/* ── 지연 등록 탭 ── */}
                {reserveModalTab === 'delay' && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">⚡ 빠른 선택</p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[1, 3, 6, 12, 24].map((h) => (
                          <button key={h} type="button"
                            className={`py-2.5 rounded-lg text-xs font-bold border-2 cursor-pointer transition-all font-[inherit] ${delayHours === h ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400 hover:text-violet-600'}`}
                            onClick={() => setDelayHours(h)}
                          >{h < 24 ? `${h}시간` : '24시간'}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-2">🌟 최적 시간 추천 <span className="font-normal text-gray-400">(건설 현장 트래픽 기준)</span></p>
                      <div className="grid grid-cols-3 gap-2">
                        {OPTIMAL.map(({ label, h, m }) => {
                          const kstNow = new Date(Date.now() + 9 * 3600000);
                          let target = new Date(kstNow);
                          target.setUTCHours(h - 9, m, 0, 0);
                          if (target.getTime() <= Date.now()) target = new Date(target.getTime() + 86400000);
                          const diffH = Math.round((target.getTime() - Date.now()) / 3600000 * 10) / 10;
                          return (
                            <button key={label} type="button"
                              className="bg-gradient-to-b from-violet-50 to-white border-2 border-violet-200 rounded-lg py-2 px-2 text-center cursor-pointer hover:border-violet-500 hover:from-violet-100 transition-all font-[inherit] group"
                              onClick={() => {
                                setDelayHours(Math.round(diffH));
                              }}
                            >
                              <div className="text-xs font-bold text-violet-700">{label}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">약 {diffH}시간 후</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 직접 선택 탭 ── */}
                {reserveModalTab === 'custom' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1.5">게시 날짜</label>
                      <input type="date" value={reserveDate} min={nowKSTDate()}
                        onChange={(e) => setReserveDate(e.target.value)}
                        className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1.5">게시 시간 (한국 시간)</label>
                      <input type="time" value={reserveTime}
                        onChange={(e) => setReserveTime(e.target.value)}
                        className="w-full py-2.5 px-3.5 border-2 border-gray-200 rounded-lg text-sm outline-none font-[inherit] focus:border-violet-500"
                      />
                    </div>
                  </div>
                )}

                {/* ── 구분선 ── */}
                <div className="border-t border-dashed border-gray-200" />

                {/* ── 반복 예약 ── */}
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-2">🔁 반복 예약 <span className="font-normal text-gray-400">(발행 후 새 공고 자동 생성)</span></p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([0, 1, 3, 7] as const).map((d) => (
                      <button key={d} type="button"
                        className={`py-2.5 rounded-lg text-xs font-bold border-2 cursor-pointer transition-all font-[inherit] ${repeatDays === d ? 'bg-[#f97316] text-white border-[#f97316]' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-400 hover:text-orange-600'}`}
                        onClick={() => setRepeatDays(d)}
                      >{d === 0 ? '없음' : `${d}일 반복`}</button>
                    ))}
                  </div>
                  {repeatDays > 0 && (
                    <p className="text-[11px] text-orange-600 mt-1.5 bg-orange-50 rounded-lg px-3 py-1.5">
                      ✅ 발행 후 {repeatDays}일 뒤 동일 공고가 새 예약으로 자동 등록됩니다
                    </p>
                  )}
                </div>

                {/* ── 랜덤 분산 ── */}
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${useRandomSpread ? 'bg-violet-600' : 'bg-gray-300'}`}
                    onClick={() => setUseRandomSpread(!useRandomSpread)}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${useRandomSpread ? 'left-[22px]' : 'left-[2px]'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-700">랜덤 분산 ±5~15분</p>
                    <p className="text-xs text-gray-400">동일 시간대 도배 방지 · 자동 간격 조절</p>
                  </div>
                </label>

                {/* ── 예정 시간 미리보기 ── */}
                {previewLabel && (
                  <div className="bg-violet-50 border-2 border-violet-200 rounded-xl px-4 py-3 text-center">
                    <p className="text-xs text-violet-500 font-semibold mb-0.5">예정 발행 시간</p>
                    <p className="text-lg font-bold text-violet-700">{previewLabel}</p>
                    {useRandomSpread && <p className="text-[11px] text-violet-400 mt-0.5">(실제는 ±5~15분 랜덤 조정됩니다)</p>}
                    {repeatDays > 0 && <p className="text-[11px] text-orange-500 mt-0.5">🔁 발행 후 {repeatDays}일 뒤 자동 재등록</p>}
                  </div>
                )}

                {/* ── 액션 버튼 ── */}
                <div className="flex gap-2.5">
                  <button type="button" disabled={submitting}
                    className="flex-1 bg-violet-600 text-white border-none py-3.5 rounded-xl text-sm font-bold cursor-pointer hover:bg-violet-700 transition-colors font-[inherit] disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleReserve}
                  >
                    {submitting ? '예약 중...' : '📅 예약 확정'}
                  </button>
                  <button type="button"
                    className="px-5 bg-gray-100 text-gray-600 border-none py-3.5 rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-200 transition-colors font-[inherit]"
                    onClick={() => setShowReserveModal(false)}
                  >취소</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 예약 로그 모달 */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
            <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-5 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1e3a5f]">📋 예약 발행 로그</h3>
              <button onClick={() => setShowLogsModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 border-none cursor-pointer hover:bg-gray-200 text-lg font-bold font-[inherit]"
              >×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {reservationLogs.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">로그가 없습니다</div>
              ) : (
                <div className="space-y-2">
                  {reservationLogs.map((log) => (
                    <div key={log.id} className={`rounded-xl px-4 py-3 border text-xs ${log.status === 'published' ? 'bg-green-50 border-green-200' : log.status === 'failed' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm truncate max-w-[200px]">{log.jobTitle || '(제목 없음)'}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${log.status === 'published' ? 'bg-green-500 text-white' : log.status === 'failed' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-white'}`}>
                          {log.status === 'published' ? '✅ 발행' : log.status === 'failed' ? '❌ 실패' : '🔄 재시도'}
                        </span>
                      </div>
                      <div className="text-gray-500 space-y-0.5">
                        <div>예약: {log.scheduledAt ? formatKST(log.scheduledAt) : '-'}</div>
                        {log.publishedAt && <div>발행: {formatKST(log.publishedAt)}</div>}
                        {log.repeatDays && log.repeatDays > 0 && <div>🔁 {log.repeatDays}일 반복 설정</div>}
                        {log.isRepeat && <div className="text-orange-600">♻️ 반복 재등록</div>}
                        {log.retryCount && log.retryCount > 0 && <div>재시도 {log.retryCount}회</div>}
                        {log.failReason && <div className="text-red-500">사유: {log.failReason}</div>}
                        <div className="text-gray-400">{log.createdAt ? formatKST(log.createdAt) : ''} 생성</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
