import { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import type { Job, PendingJob } from '@/lib/firebase';
import {
  fbLoadJobs,
  fbAddJob,
  fbToggleHide,
  fbDeleteJob,
  fbLoadPending,
  fbUpdatePending,
  fbDeletePending,
  fbAutoHideOldJobs,
  fbPurgeOldHiddenJobs,
  fbAddReservedJob,
  fbCancelReservation,
  fbRetryReservation,
  fbSaveReservationLog,
  fbLoadReservationLogs,
  type ReservationLog,
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
const MEALS = ['식사제공', '식사없음', '협의', '출퇴근'];
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

// 도시명 → 광역시/도 매핑
const CITY_TO_PROVINCE: Record<string, string> = {
  // 경기도
  평택: '경기', 고덕: '경기', 용인: '경기', 이천: '경기', 수원: '경기', 성남: '경기', 안양: '경기',
  부천: '경기', 광명: '경기', 시흥: '경기', 안산: '경기', 고양: '경기', 파주: '경기',
  의정부: '경기', 하남: '경기', 남양주: '경기', 김포: '경기', 화성: '경기', 오산: '경기',
  안성: '경기', 포천: '경기', 양주: '경기', 여주: '경기', 군포: '경기', 과천: '경기',
  구리: '경기', 의왕: '경기', 동두천: '경기', 가평: '경기', 양평: '경기', 연천: '경기',
  // 경남
  창원: '경남', 진주: '경남', 거제: '경남', 통영: '경남', 사천: '경남', 밀양: '경남', 양산: '경남',
  // 경북
  포항: '경북', 경주: '경북', 구미: '경북', 안동: '경북', 영주: '경북', 김천: '경북', 상주: '경북',
  // 충북
  청주: '충북', 충주: '충북', 제천: '충북', 음성: '충북', 진천: '충북',
  // 충남
  천안: '충남', 아산: '충남', 당진: '충남', 서산: '충남', 논산: '충남', 공주: '충남', 보령: '충남',
  // 전북
  전주: '전북', 군산: '전북', 익산: '전북', 정읍: '전북', 남원: '전북',
  // 전남
  광양: '전남', 여수: '전남', 순천: '전남', 목포: '전남', 나주: '전남',
  // 강원
  강릉: '강원', 원주: '강원', 춘천: '강원', 속초: '강원', 태백: '강원',
  // 광역시 (도시명이 광역시 이름과 다를 때)
  해운대: '부산', 기장: '부산', 수영: '부산',
};

function stripEmoji(s: string): string {
  return s
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\w\s(),.·%\-+]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SalaryCandidate {
  raw: string;
  num: number;
  score: number;
  reason: string;
}

export interface WageBreakdown {
  role: string;
  wage: number;
  extraPay: number;
  extraLabel: string;
  total: number;
}

export interface ComplexSalaryResult {
  text: string;
  num: number;
  score: number;
  dailyWage: number;
  extraPay: number;
  extraLabel: string;
  totalPay: number;
  wageBreakdowns: WageBreakdown[];
  needsReview: boolean;
  candidates: SalaryCandidate[];
}

const EXTRA_KW_PAT = '일비|숙식비?|숙박비|식대|유류비|식비';
const ROLE_KW_PAT = '조공|기공|준기공|안전담당자|안담|화기감시자|화감|팀장|팀원|반장|초보|경력자?|기사|용접사|배관공|배관사|전공';
/** 단가 prefix 기호: -, ~, •, ·, >, ※, * — 건설 구인 문맥에서 "단가 표시"로 쓰임 */
const WAGE_PREFIX = '[-~•·>※*]';

/** 암묵적 만원 단위 포함 숫자 파싱: 14.5→145000, 15→150000, 170000→170000 */
function parseManValue(raw: string): number {
  const s = raw.replace(/[, ]/g, '');
  const n = parseFloat(s);
  if (isNaN(n) || n <= 0) return 0;
  if (n < 50) return Math.round(n * 10000);
  if (n >= 50000 && n <= 800000) return Math.round(n);
  return 0;
}

/** 일비/숙식비 금액 파싱: 2.5→25000, 2.5만→25000, 3→30000, 25000→25000 */
function parseExtraManValue(raw: string): number {
  const s = raw.replace(/[, ]/g, '');
  const hasMan = /만원?$/.test(s);
  const n = parseFloat(s.replace(/만원?$/, ''));
  if (isNaN(n) || n <= 0) return 0;
  if (hasMan || n < 50) return Math.round(n * 10000);
  if (n >= 1000 && n <= 200000) return Math.round(n);
  return 0;
}

function normalizeRoleName(r: string): string {
  const MAP: Record<string, string> = { 안담: '안전담당자', 화감: '화기감시자' };
  return MAP[r] ?? r;
}

function toManStr(n: number): string {
  const m = Math.round((n / 10000) * 10) / 10;
  return m % 1 === 0 ? `${m}만` : `${m}만`;
}

function buildWageDisplayText(breakdowns: WageBreakdown[]): string {
  const parts = breakdowns.map(bd => {
    const wStr = toManStr(bd.wage);
    if (bd.extraPay > 0) {
      const eStr = toManStr(bd.extraPay);
      const tStr = toManStr(bd.total);
      const base = bd.role ? `${bd.role} ${wStr}` : wStr;
      return `${base} + ${bd.extraLabel} ${eStr} (총 ${tStr})`;
    }
    return bd.role ? `${bd.role} ${wStr}` : formatSalary(bd.wage);
  });
  return parts.join(' / ');
}

/** 숫자형 표시: 170,000원 */
function formatSalary(num: number): string {
  return num.toLocaleString('ko-KR') + '원';
}

const SALARY_KW = '일당|단가|급여|임금|공임|일급|조공|기공|안전담당자|화기감시자|초보|팀원|팀장';

const NOISE_PATS: RegExp[] = [
  /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g,  // 전화번호
  /\d{4}[-./]\d{1,2}[-./]\d{1,2}/g,          // YYYY-MM-DD 날짜
  /\d{1,2}월\s*\d{1,2}일/g,                  // N월N일 날짜
  /급여일\s*\d+/g,                             // 급여일
  /\d+\s*개월/g,                               // 개월수
  /\d{1,2}:\d{2}/g,                           // HH:MM 시간
  /P[1-9](?:라인|LINE)?/gi,                    // P라인 현장명
  /\d+\s*명/g,                                 // 인원수
  /\d+\s*층/g,                                 // 층수 (건물/현장 층)
  /B\d+/gi,                                    // 지하층 (B1, B2 등)
  /\d+\s*호(?:기|실)?/g,                       // 호기/호실
];

/** 단일 숫자 문자열 → 원 단위 정수 정규화 */
function normalizeSalaryNum(s: string): number | null {
  s = s.trim().replace(/\s/g, '');
  // N만N천: 18만5천
  let m = s.match(/^(\d+)만(\d+)천$/);
  if (m) return parseInt(m[1]) * 10000 + parseInt(m[2]) * 1000;
  // N.N만 / N만원?: 16.5만, 17만, 17만원
  m = s.match(/^([\d.]+)만원?$/);
  if (m) return Math.round(parseFloat(m[1]) * 10000);
  // 170,000 — 쉼표 천단위 구분자
  m = s.match(/^(\d{2,3}),(\d{3})$/);
  if (m) return parseInt(m[1]) * 1000 + parseInt(m[2]);
  // 170.000 — 점 천단위 구분자 (유럽식)
  m = s.match(/^(\d{2,3})\.(\d{3})$/);
  if (m) return parseInt(m[1]) * 1000 + parseInt(m[2]);
  // 순수 정수 (170000, 140000)
  m = s.match(/^(\d+)원?$/);
  if (m) {
    const n = parseInt(m[1]);
    if (n >= 50000 && n <= 800000) return n;
    return null;
  }
  return null;
}

/** 텍스트에서 단가(일당) 후보 배열과 최선 결과 반환 */
function extractSalary(text: string): { text: string; num: number; score: number; candidates: SalaryCandidate[] } | null {
  let cleaned = text;
  for (const pat of NOISE_PATS) cleaned = cleaned.replace(new RegExp(pat.source, pat.flags), ' ');

  const candidates: SalaryCandidate[] = [];
  const seenNums = new Set<number>();

  function add(raw: string, num: number, score: number, reason: string) {
    if (num < 50000 || num > 800000) return;
    if (seenNums.has(num)) {
      const idx = candidates.findIndex((c) => c.num === num);
      if (idx >= 0 && candidates[idx].score < score) candidates[idx] = { raw, num, score, reason };
      return;
    }
    seenNums.add(num);
    candidates.push({ raw, num, score, reason });
  }

  let m: RegExpExecArray | null;

  // ── 1순위: 키워드 + 명시적 금액 ─────────────────────────────────────────
  // 예: "조공 15만", "안전담당자 170,000", "초보 140000"
  const kwExplicit = new RegExp(
    `(${SALARY_KW})\\s*(?:[가-힣]{0,6}\\s*)?(\\d{1,3}(?:[.,]\\d{3})?(?:\\.\\d+)?\\s*만원?|\\d{5,6}|\\d{2,3}[.,]\\d{3})`,
    'gi'
  );
  while ((m = kwExplicit.exec(cleaned)) !== null) {
    const num = normalizeSalaryNum(m[2].trim());
    if (num) add(m[0], num, 90, `키워드 "${m[1]}" + 금액`);
  }

  // ── 2순위: 키워드 + 만원단위 소수/정수 (일당 17, 팀원 단가 16.5) ──────────
  const kwImplicit = new RegExp(
    `(${SALARY_KW})\\s*(?:[가-힣]{0,6}\\s*)?((?:1[0-9]|[2-4][0-9])(?:\\.\\d+)?)(?![0-9만천,\\.원])`,
    'gi'
  );
  while ((m = kwImplicit.exec(cleaned)) !== null) {
    const val = parseFloat(m[2]);
    if (val >= 10 && val < 50) add(m[0], Math.round(val * 10000), 85, `키워드 "${m[1]}" + 만원단위`);
  }

  // ── 3순위: N만N천 / N.N만 / N만 표현 ─────────────────────────────────────
  const manPat = /(\d{1,3})\s*만\s*(\d)\s*천|([\d]{1,3}(?:\.\d+)?)\s*만원?/g;
  while ((m = manPat.exec(cleaned)) !== null) {
    const num = normalizeSalaryNum(m[0].replace(/\s/g, ''));
    if (num) add(m[0], num, 70, '만원 표현');
  }

  // ── 4순위: NNN,NNN / NNN.NNN (쉼표·점 천단위 구분자) ──────────────────────
  const sepPat = /\b(\d{2,3})[.,](\d{3})\b/g;
  while ((m = sepPat.exec(cleaned)) !== null) {
    const num = normalizeSalaryNum(m[0]);
    if (num) add(m[0], num, 75, '구분자 금액');
  }

  // ── 5순위 (AI 휴리스틱): 순수 5~6자리 정수 (170000, 140000) ──────────────
  const intPat = /\b(\d{5,6})\b/g;
  while ((m = intPat.exec(cleaned)) !== null) {
    const num = parseInt(m[1]);
    if (num >= 50000 && num <= 800000) add(m[1], num, 55, '숫자 직접 표기');
  }

  // ── 6순위: 기호 prefix 단가 (-, ~, •, >, * 등) ───────────────────────────
  // 예: "-17" → 170000, "~14.5" → 145000, "• 16.5" → 165000
  // 줄 시작 / 공백·구분자 다음에 오는 기호+숫자, 1~30 범위만 허용
  const prefixSymPat = new RegExp(
    `(?:^|[\\s\\n,/|])${WAGE_PREFIX}\\s*(\\d+(?:\\.\\d+)?)(?:\\s*만원?)?(?![\\d\\-])`,
    'gm'
  );
  while ((m = prefixSymPat.exec(cleaned)) !== null) {
    const n = parseFloat(m[1]);
    if (n >= 1 && n < 50) {
      const num = Math.round(n * 10000);
      add(m[0].trim(), num, 72, `기호 prefix "${m[0].trim()}"`);
    }
  }

  if (candidates.length === 0) return null;

  // 점수 내림차순, 동점이면 금액 높은 순
  candidates.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.num - a.num));
  const best = candidates[0];
  return { text: formatSalary(best.num), num: best.num, score: best.score, candidates };
}

/** 건설 구인글 복합 단가 추출 (기본단가 + 일비/숙식비 분리, 역할별 단가) */
function extractComplexSalary(text: string): ComplexSalaryResult | null {
  let cleaned = text;
  for (const pat of NOISE_PATS) cleaned = cleaned.replace(new RegExp(pat.source, pat.flags), ' ');
  // 전화번호 패턴에서 빠진 하이픈 연속 숫자 제거 (예: 010-1234-5678 잔여)
  cleaned = cleaned.replace(/\d{3,4}-\d{4}\b/g, ' ');

  const wageBreakdowns: WageBreakdown[] = [];
  const candidates: SalaryCandidate[] = [];
  const seenNums = new Set<number>();
  let bestScore = 0;

  function addCand(raw: string, num: number, score: number, reason: string) {
    if (num < 50000 || num > 800000) return;
    if (seenNums.has(num)) {
      const i = candidates.findIndex((c) => c.num === num);
      if (i >= 0 && candidates[i].score < score) candidates[i] = { raw, num, score, reason };
      return;
    }
    seenNums.add(num);
    candidates.push({ raw, num, score, reason });
  }

  let m: RegExpExecArray | null;

  // ── A: 역할 + 기본단가 + '+' + 일비/숙식비 (기호 prefix 허용) ──────────────
  // 예: "조공 15+일비2.5", "안담단가:-14.5+숙식3", "조공 ~15 + 숙식 2.5"
  const roleExtraPat = new RegExp(
    `(${ROLE_KW_PAT})\\s*(?:단가)?\\s*[:：]?\\s*${WAGE_PREFIX}?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:만원?)?\\s*\\+\\s*(${EXTRA_KW_PAT})\\s*(\\d+(?:\\.\\d+)?)\\s*(?:만원?)?`,
    'gi'
  );
  while ((m = roleExtraPat.exec(cleaned)) !== null) {
    const role = normalizeRoleName(m[1]);
    const wage = parseManValue(m[2]);
    const extraLabel = m[3];
    const extra = parseExtraManValue(m[4]);
    if (wage <= 0) continue;
    const total = wage + extra;
    if (!wageBreakdowns.find((b) => b.role === role)) {
      wageBreakdowns.push({ role, wage, extraPay: extra, extraLabel: extra > 0 ? extraLabel : '', total });
    }
    addCand(m[0], total || wage, 95, `역할 "${role}" + ${extraLabel}`);
    if (bestScore < 95) bestScore = 95;
  }

  // ── B: 역할 + 기본단가 (기호 prefix 허용, extra 없음) ────────────────────
  // 예: "조공 15만", "팀원단가:-16.5", "기공 ~17"
  const roleSimplePat = new RegExp(
    `(${ROLE_KW_PAT})\\s*(?:단가)?\\s*[:：]?\\s*${WAGE_PREFIX}?\\s*(\\d+(?:\\.\\d+)?)(?:\\s*만원?)?(?![\\s]*[+\\d])`,
    'gi'
  );
  while ((m = roleSimplePat.exec(cleaned)) !== null) {
    const role = normalizeRoleName(m[1]);
    const wage = parseManValue(m[2]);
    if (wage <= 0) continue;
    if (!wageBreakdowns.find((b) => b.role === role)) {
      wageBreakdowns.push({ role, wage, extraPay: 0, extraLabel: '', total: wage });
      addCand(m[0], wage, 85, `역할 "${role}"`);
      if (bestScore < 85) bestScore = 85;
    }
  }

  // ── C: 단순 기본단가 + '+' + 일비/숙식비 (기호 prefix 허용, 역할 없음) ────
  // 예: "15+일비2.5", "~16 + 숙식비 3", "-17만 + 일비 2만"
  const simpleExtraPat = new RegExp(
    `${WAGE_PREFIX}?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:만원?)?\\s*\\+\\s*(${EXTRA_KW_PAT})\\s*(\\d+(?:\\.\\d+)?)\\s*(?:만원?)?`,
    'gi'
  );
  while ((m = simpleExtraPat.exec(cleaned)) !== null) {
    const wage = parseManValue(m[1]);
    const extraLabel = m[2];
    const extra = parseExtraManValue(m[3]);
    if (wage <= 0) continue;
    const total = wage + extra;
    if (wageBreakdowns.length === 0) {
      wageBreakdowns.push({ role: '', wage, extraPay: extra, extraLabel, total });
    }
    addCand(m[0], total || wage, 88, `기본단가 + ${extraLabel}`);
    if (bestScore < 88) bestScore = 88;
  }

  // ── D: 역할 + 줄바꿈 + (기호 +) 단가 ────────────────────────────────────
  // 예: "조공\n-17", "안담\n~14.5", "전공\n  -16.5"
  const roleLinePat = new RegExp(
    `(${ROLE_KW_PAT})[ \\t]*[\\n\\r]+[ \\t]*${WAGE_PREFIX}?[ \\t]*(\\d+(?:\\.\\d+)?)(?:[ \\t]*만원?)?`,
    'gi'
  );
  while ((m = roleLinePat.exec(text)) !== null) {          // 원본 text 사용 (줄바꿈 보존)
    const role = normalizeRoleName(m[1]);
    const wage = parseManValue(m[2]);
    if (wage <= 0) continue;
    if (!wageBreakdowns.find((b) => b.role === role)) {
      wageBreakdowns.push({ role, wage, extraPay: 0, extraLabel: '', total: wage });
    }
    addCand(m[0].trim(), wage, 90, `역할 "${role}" (줄바꿈+기호)`);
    if (bestScore < 90) bestScore = 90;
  }

  // ── E: 단독 기호 prefix 단가 (역할 무관, 1~30 범위) ──────────────────────
  // 예: "-17", "~14.5", "• 16.5", "* 16" — 구인글 특화 단가 표기
  // 이미 찾은 것보다 많이 있는 경우만 추가 (낮은 신뢰도)
  const standalonePrefixPat = new RegExp(
    `(?:^|[\\s\\n,/|])${WAGE_PREFIX}[ \\t]*(\\d+(?:\\.\\d+)?)(?:[ \\t]*만원?)?(?![\\d.])`,
    'gm'
  );
  while ((m = standalonePrefixPat.exec(cleaned)) !== null) {
    const n = parseFloat(m[1]);
    if (n < 1 || n >= 50) continue;
    const wage = Math.round(n * 10000);
    if (wageBreakdowns.length === 0) {
      wageBreakdowns.push({ role: '', wage, extraPay: 0, extraLabel: '', total: wage });
    }
    addCand(m[0].trim(), wage, 75, `기호 prefix 단가 "${m[0].trim()}"`);
    if (bestScore < 75) bestScore = 75;
  }

  // ── Fallback: 기존 extractSalary 로직 사용 ───────────────────────────────
  if (candidates.length === 0) {
    const existing = extractSalary(text);
    if (!existing) return null;
    return {
      text: existing.text,
      num: existing.num,
      score: existing.score,
      dailyWage: existing.num,
      extraPay: 0,
      extraLabel: '',
      totalPay: existing.num,
      wageBreakdowns: [{ role: '', wage: existing.num, extraPay: 0, extraLabel: '', total: existing.num }],
      needsReview: existing.score < 70,
      candidates: existing.candidates,
    };
  }

  candidates.sort((a, b) => b.score - a.score || b.num - a.num);
  const primary = wageBreakdowns[0];
  const displayText = buildWageDisplayText(wageBreakdowns);

  return {
    text: displayText,
    num: candidates[0].num,
    score: bestScore,
    dailyWage: primary.wage,
    extraPay: primary.extraPay,
    extraLabel: primary.extraLabel,
    totalPay: primary.total,
    wageBreakdowns,
    needsReview: bestScore < 70,
    candidates,
  };
}

function makeNote(text: string): string {
  const sentences: string[] = [];

  // 근무일 + 연장 → 한 문장으로
  const wdM = text.match(/주\s*([5-7])\s*일/);
  const hasExt = /연장/.test(text);
  const extM = text.match(/연장\s*주?\s*(\d+[~\-]\d+|\d+)\s*회/);
  if (wdM && hasExt) {
    const extStr = extM ? ` 연장 ${extM[1]}회` : ' 연장 있음';
    sentences.push(`주${wdM[1]}일 근무,${extStr}입니다.`);
  } else if (wdM) {
    sentences.push(`주${wdM[1]}일 근무입니다.`);
  } else if (hasExt) {
    sentences.push(extM ? `연장 ${extM[1]}회 있습니다.` : '연장 있습니다.');
  }

  // 우대/조건 → 두 번째 문장으로
  const conds: string[] = [];
  if (/초보\s*(?:가능|환영|ok|OK)/i.test(text)) conds.push('초보도 가능');
  if (/장기\s*(?:근무|가능|우대)/.test(text)) conds.push('장기 근무 가능하신 분 환영');
  if (/성실/.test(text)) conds.push('성실하신 분 우대');
  if (/근태/.test(text)) conds.push('근태 중요');
  if (conds.length > 0) sentences.push(conds.join(', ') + '합니다.');

  return sentences.join(' ').slice(0, 60);
}

function parseJobText(text: string): Partial<Job> & { _salaryCalc?: string; _salaryCandidates?: SalaryCandidate[]; _complexSalary?: ComplexSalaryResult } {
  const r: Partial<Job> & { _salaryCalc?: string; _salaryCandidates?: SalaryCandidate[]; _complexSalary?: ComplexSalaryResult } = { originalText: text };

  // ── 제목: 첫 줄 이모지·특수문자 제거 ──
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const cleanTitle = stripEmoji(lines[0] ?? '');
  if (cleanTitle) r.title = cleanTitle;

  // ── 삼성 평택 반도체 / 고덕 / P라인 통합 감지 (지역보다 먼저) ──
  const cleanText = text.replace(/[^\uAC00-\uD7A30-9A-Za-z]/g, '');
  const plineM = cleanText.match(/P([1-6])/i);
  const line = plineM ? `P${plineM[1]}` : '';
  if (cleanText.includes('평택') || cleanText.includes('고덕') || line) {
    r.region = '경기';
    r.site = '삼성 반도체';
    if (line) r.line = line;
  }

  // ── 지역: 도시명 우선 → 광역시/도 직접 ──
  if (!r.region) {
    for (const [city, province] of Object.entries(CITY_TO_PROVINCE)) {
      if (text.includes(city)) { r.region = province; break; }
    }
  }
  if (!r.region) {
    for (const reg of REGIONS) {
      if (text.includes(reg)) { r.region = reg; break; }
    }
  }

  // ── 직종 ──
  for (const job of [...JOBS, ...WELD_SUBS]) {
    if (text.includes(job)) { r.job = job; break; }
  }
  // 화재/화기/감시 키워드가 있으면 화기감시자로 통합
  if (/화재|화기|감시/.test(text)) r.job = '화기감시자';

  // ── 급여 (복합 단가 추출) ──
  const sal = extractComplexSalary(text);
  if (sal) {
    r.salary = sal.text;
    r.salaryNum = sal.num;
    r.dailyWage = sal.dailyWage || undefined;
    r.extraPay = sal.extraPay || undefined;
    r.totalExpectedPay = sal.totalPay || undefined;
    r.needsReview = sal.needsReview || undefined;
    if (sal.wageBreakdowns.some((b) => b.role)) {
      r.wageBreakdowns = sal.wageBreakdowns;
    }
    r._salaryCandidates = sal.candidates;
    r._complexSalary = sal;
    if (sal.extraPay > 0) {
      r._salaryCalc = `기본 ${toManStr(sal.dailyWage)} + ${sal.extraLabel} ${toManStr(sal.extraPay)} = 총 ${formatSalary(sal.totalPay)}`;
    } else if (sal.candidates.length > 1) {
      r._salaryCalc = `신뢰도 ${sal.score}점 · 후보 ${sal.candidates.length}개 감지`;
    }
  }

  // ── 전화번호 (-·. 구분자 모두 지원) ──
  const phoneM = text.match(/(\d{2,4})[.\-\s](\d{3,4})[.\-\s](\d{4})/);
  if (phoneM) r.contact = `${phoneM[1]}-${phoneM[2]}-${phoneM[3]}`;

  // ── 담당자 ──
  const mgrM = text.match(/담당자\s*[:：]\s*(.+)/);
  if (mgrM) r.manager = stripEmoji(mgrM[1]);

  // ── 회사명 ──
  for (const pat of [/(?:회사|업체명|업체|회사명)\s*[:：]\s*(.+)/, /회사[:：](.+)/]) {
    const m = text.match(pat);
    if (m) { r.company = m[1].trim(); break; }
  }

  // ── 모집인원 ──
  const hcM = text.match(/(?:모집인원|인원)\s*[:：]?\s*(.+)/);
  if (hcM) r.headcount = hcM[1].replace(/\(.*?\)/g, '').trim();
  else {
    const hcAuto = text.match(/(?:남녀?|여성?|남성?)?(?:조공|기공|기사|용접사|배관공)?\s*\d+\s*명/);
    if (hcAuto) r.headcount = hcAuto[0].trim();
  }

  // ── 식사 / 숙박 ──
  if (/출퇴근/.test(text)) {
    r.meal = '출퇴근';
  } else if (/숙식\s*제공/.test(text)) {
    r.meal = '식사제공';
    r.lodging = '숙박제공';
  } else {
    if (/식사\s*제공|식 제공|식대\s*제공/.test(text)) r.meal = '식사제공';
  }
  if (/숙[소박]\s*[Oo제]|숙박제공|숙소O/.test(text)) r.lodging = '숙박제공';
  // 키워드 없으면 협의로 기본값 설정
  if (!r.meal) r.meal = '협의';
  if (!r.lodging) r.lodging = '협의';

  // ── 나이 제한 ──
  const ageRangeM = text.match(/(\d+)\s*세?\s*[~\-~]\s*(\d+)\s*세/);
  if (ageRangeM) r.ageLimit = `${ageRangeM[1]}~${ageRangeM[2]}세`;
  else {
    const ageTilM = text.match(/(\d+)\s*세\s*(?:까지|이하|미만)/);
    if (ageTilM) r.ageLimit = `~${ageTilM[1]}세`;
    else {
      const ageFromM = text.match(/지원\s*나이\s*[:：]\s*(.+)/);
      if (ageFromM) r.ageLimit = stripEmoji(ageFromM[1]);
    }
  }

  // ── 투입시기 / 입사일 ──
  const sdLabel = text.match(/(?:투입시기|입사일|투입일|입사)\s*[:：]?\s*(.+)/);
  if (sdLabel) r.startDate = sdLabel[1].replace(/\(.*?\)/g, '').trim();
  else if (/다음\s*주/.test(text)) r.startDate = '다음주';
  else if (/즉시/.test(text)) r.startDate = '즉시 입사';

  // ── 용접 시험 ──
  if (/시험\s*가능/.test(text)) r.weldTest = '가능';
  if (/시험\s*없음|시험\s*불가/.test(text)) r.weldTest = '불가능';

  // ── 비고 자동 생성 ──
  const note = makeNote(text);
  if (note && !r.detail) r.detail = note;

  return r;
}

// SEO 최적화 제목 자동 생성 (지역/현장 직종 모집 일N만 형식)
function generateSEOTitle(p: Partial<Job>): string {
  const parts: string[] = [];
  if (p.site) {
    parts.push(p.site);
    if (p.line) parts.push(p.line);
  } else if (p.region) {
    parts.push(p.region);
  }
  if (p.job) parts.push(p.job);
  if (p.weldSub) parts.push(p.weldSub);
  parts.push('모집');
  const wage = p.dailyWage || p.salaryNum;
  if (wage && wage >= 100000) {
    parts.push(`일${toManStr(wage)}`);
    if (p.extraPay && p.extraPay > 0) parts.push(`+${toManStr(p.extraPay)}`);
  }
  if (p.lodging === '숙박제공') parts.push('숙박O');
  else if (p.meal === '식사제공') parts.push('식사O');
  const t = parts.join(' ');
  return t.length > 5 ? t : '';
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

type Tab = 'jobs' | 'add' | 'pending' | 'settings' | 'stats';

interface HourlyRow { hour: number; count: number; }
interface VisitorTotals { today: number; yesterday: number; week: number; total: number; }

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true); // 토큰 검증 중
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
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Partial<Job>>(emptyForm());
  const [parseText, setParseText] = useState('');
  const [parseResult, setParseResult] = useState<(Partial<Job> & { _salaryCalc?: string; _salaryCandidates?: SalaryCandidate[]; _complexSalary?: ComplexSalaryResult }) | null>(null);
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
  const [showLogsModal, setShowLogsModal] = useState(false);
  // 방문 통계
  const [hourlyData, setHourlyData] = useState<HourlyRow[]>([]);
  const [visitorTotals, setVisitorTotals] = useState<VisitorTotals | null>(null);
  const [statsDate, setStatsDate] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
  const [statsLoading, setStatsLoading] = useState(false);
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
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [acHistory, setAcHistory] = useState<{ companies: string[]; sites: string[]; contacts: string[] }>(() => {
    try { return JSON.parse(localStorage.getItem('cj_ac_history') || '{"companies":[],"sites":[],"contacts":[]}'); }
    catch { return { companies: [], sites: [], contacts: [] }; }
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

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2600);
  }

  const loadHourlyStats = useCallback(async (date: string) => {
    setStatsLoading(true);
    try {
      const token = getToken();
      const [hourly, totals] = await Promise.all([
        fetch(`/api/stats/hourly?date=${date}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch('/api/stats/visitors', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      ]);
      setHourlyData(hourly.rows ?? []);
      setVisitorTotals(totals);
    } catch {
      showToast('통계 조회 실패');
    } finally {
      setStatsLoading(false);
    }
  }, []);

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

  // 자동숨김 DB 기록 + 24시간 지난 숨김 공고 하드삭제 (30분마다 실행)
  useEffect(() => {
    if (!authed) return;

    async function runCleanup() {
      const stored = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
      const autoHideHours: number = stored.autoHideHours ?? 48;
      const all = await fbLoadJobs();
      await fbAutoHideOldJobs(all, autoHideHours);
      const purged = await fbPurgeOldHiddenJobs(all);
      if (purged > 0) {
        loadJobs();
      }
    }

    runCleanup();
    const timer = setInterval(runCleanup, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [authed]);

  useEffect(() => {
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
    const jobData: Omit<Job, 'id'> = {
      ...(form as Omit<Job, 'id'>),
      salaryNum: parseSalaryNum(form.salary || ''),
      date: new Date().toISOString(),
      hidden: false,
      repeatDays,
      retryCount: 0,
    };
    await fbAddReservedJob(jobData, reservedAt);
    await fbSaveReservationLog({
      jobId: '',
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
    loadJobs(); // 백그라운드 업데이트
    setSubmitting(false);
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
    lastPublished?: number;
    lastRetried?: number;
    nextRunInSeconds?: number;
    intervalSeconds?: number;
  }
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);

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

  // ── 단축키: Ctrl+Enter 즉시 등록 / Ctrl+Shift+Enter 예약 등록 ───────────────
  useEffect(() => {
    if (!authed || tab !== 'add') return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== 'Enter') return;
      e.preventDefault();
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
    if (!clearAfterSubmit) return;
    const kept: Partial<Job> = {};
    if (keepFields.company) kept.company = savedForm.company;
    if (keepFields.region) kept.region = savedForm.region;
    if (keepFields.contact) kept.contact = savedForm.contact;
    setForm({ ...emptyForm(), ...kept });
    setParseResult(null);
    setParseText('');
    localStorage.removeItem('cj_form_draft');
    setDraftAvailable(false);
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
    // 자동완성 기록 업데이트
    const acCopy = { companies: [...acHistory.companies], sites: [...acHistory.sites], contacts: [...acHistory.contacts] };
    let acChanged = false;
    const co = form.company?.trim(); if (co && !acCopy.companies.includes(co)) { acCopy.companies = [co, ...acCopy.companies].slice(0, 20); acChanged = true; }
    const si = form.site?.trim(); if (si && !acCopy.sites.includes(si)) { acCopy.sites = [si, ...acCopy.sites].slice(0, 20); acChanged = true; }
    const ct = form.contact?.trim(); if (ct && !acCopy.contacts.includes(ct)) { acCopy.contacts = [ct, ...acCopy.contacts].slice(0, 20); acChanged = true; }
    if (acChanged) { setAcHistory(acCopy); localStorage.setItem('cj_ac_history', JSON.stringify(acCopy)); }
    applySmartClear(form);
    if (quickMode) setTimeout(() => titleInputRef.current?.focus(), 80);
    loadJobs(); // 백그라운드 업데이트
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
              { key: 'jobs', label: `📋 공고 관리 (${activeJobs.length})${reservedJobs.length > 0 ? ` 📅${reservedJobs.length}` : ''}` },
              { key: 'add', label: '➕ 공고 등록' },
              { key: 'pending', label: `📥 신청 관리 (${pending.filter((p) => p.status === 'pending').length})` },
              { key: 'stats', label: '📊 방문 통계' },
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
            <div className={`mb-4 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs border ${
              schedulerStatus?.ok
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${schedulerStatus?.isRunning ? 'bg-blue-400 animate-pulse' : schedulerStatus?.ok ? 'bg-green-500' : 'bg-amber-400'}`} />
                <span className={`font-bold ${schedulerStatus?.ok ? 'text-green-800' : 'text-amber-800'}`}>
                  {schedulerStatus?.ok ? '🖥 서버 스케줄러 활성' : '⚠️ 서버 연결 확인 중'}
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
                  {(schedulerStatus.totalRetried ?? 0) > 0 && (
                    <span className="text-gray-500">재시도: <span className="font-semibold text-blue-600">{schedulerStatus.totalRetried}건</span></span>
                  )}
                  <span className="text-gray-400">다음 실행: {schedulerStatus.nextRunInSeconds ?? '?'}초 후</span>
                  <button
                    type="button"
                    className="ml-auto text-[11px] bg-white border border-green-300 text-green-700 px-2 py-0.5 rounded-lg font-bold cursor-pointer hover:bg-green-100 font-[inherit]"
                    onClick={async () => {
                      const token = getToken();
                      if (!token) { showToast('⚠️ 관리자 인증이 필요합니다'); return; }
                      const res = await fetch('/api/scheduler/trigger', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                      if (res.ok) { showToast('✅ 스케줄러 즉시 실행됐습니다'); fetchSchedulerStatus(); loadJobs(); }
                    }}
                  >⚡ 즉시 실행</button>
                </>
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
                {visibleJobs.map((job) => (
                  <div
                    key={job.id}
                    className={`bg-white border rounded-[10px] p-4 flex items-center gap-3 flex-wrap ${
                      job.status === 'reserved'
                        ? 'border-violet-300 bg-violet-50'
                        : job.hidden
                        ? 'opacity-50 bg-gray-50 border-gray-200'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold mb-1 text-gray-900 truncate">{job.title}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                        <span>📍 {job.region}</span>
                        <span>🔧 {job.job}</span>
                        <span>💰 {job.salary || '협의'}</span>
                        <span>🕐 {formatDate(job.date)}</span>
                        {job.status === 'reserved' && job.reservedAt && (
                          <span className="text-violet-600 font-bold">
                            📅 예약중 · {formatKST(job.reservedAt)} 게시
                            {job.repeatDays && job.repeatDays > 0 ? ` 🔁${job.repeatDays}일` : ''}
                          </span>
                        )}
                        {job.status === 'failed' && (
                          <span className="text-red-500 font-bold">
                            ❌ 발행실패{(job.retryCount || 0) > 0 ? ` (${job.retryCount}회 시도)` : ''}
                            {job.failReason ? ` · ${job.failReason.slice(0, 40)}` : ''}
                          </span>
                        )}
                        {job.hidden && <span className="text-amber-600 font-bold">🙈 숨김</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
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
                  <input type="checkbox" checked={clearAfterSubmit} onChange={(e) => { setClearAfterSubmit(e.target.checked); localStorage.setItem('cj_clear_after_submit', e.target.checked ? '1' : '0'); }} className="w-3.5 h-3.5 accent-orange-500 cursor-pointer" />
                  <span className="font-semibold">등록 후 초기화</span>
                </label>
                {clearAfterSubmit && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-gray-400 text-[11px]">유지:</span>
                    {(['company', 'region', 'contact'] as const).map((f) => (
                      <label key={f} className="flex items-center gap-1 cursor-pointer select-none">
                        <input type="checkbox" checked={!!keepFields[f]} onChange={(e) => { const n = { ...keepFields, [f]: e.target.checked }; setKeepFields(n); localStorage.setItem('cj_keep_fields', JSON.stringify(n)); }} className="w-3 h-3 accent-blue-500 cursor-pointer" />
                        <span>{f === 'company' ? '업체명' : f === 'region' ? '지역' : '연락처'}</span>
                      </label>
                    ))}
                  </>
                )}
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
                  if (text.trim().length > 15) {
                    setTimeout(() => {
                      setParseText(text);
                      handleParseText(text);
                      showToast('📋 붙여넣기 → 자동 파싱 완료!');
                    }, 30);
                  }
                }}
                placeholder="카카오톡 원문을 붙여넣으면 자동 파싱됩니다 (버튼 불필요 — 붙여넣기만 해도 OK!)"
                rows={4}
                className="w-full py-3.5 px-3.5 border-2 border-gray-200 rounded-[10px] text-sm outline-none font-[inherit] focus:border-[#f97316] resize-y min-h-[120px]"
              />
              <div className="mt-2 flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="bg-blue-600 text-white border-none py-2 px-4 rounded-lg text-sm font-bold cursor-pointer hover:bg-blue-700 transition-colors font-[inherit]"
                  onClick={handleParse}
                >
                  🔍 자동 파싱
                </button>
                <button
                  type="button"
                  className="bg-violet-600 text-white border-none py-2 px-4 rounded-lg text-sm font-bold cursor-pointer hover:bg-violet-700 transition-colors font-[inherit]"
                  onClick={() => {
                    if (!form.title?.trim() || !form.region || !form.job) {
                      showToast('⚠️ 먼저 공고 내용을 파싱하거나 입력해주세요 (제목·지역·직종 필수)');
                      return;
                    }
                    const kstNow = new Date(Date.now() + 9 * 3600000);
                    setReserveDate(nowKSTDate());
                    const nextHour = new Date(kstNow.getTime() + 3600000);
                    setReserveTime(nextHour.toISOString().slice(11, 16));
                    setShowReserveModal(true);
                  }}
                >
                  📅 예약 등록
                </button>
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
                  'originalText', '_salaryCalc', '_salaryCandidates', '_complexSalary',
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
                            {cs.candidates.map((c, i) => (
                              <button key={i} type="button"
                                title={`출처: "${c.raw}" · ${c.reason}`}
                                className={`text-xs px-2.5 py-1.5 rounded-lg font-bold border transition-colors cursor-pointer font-[inherit] ${
                                  i === 0 ? 'bg-amber-400 border-amber-500 text-amber-900' : 'bg-white border-amber-300 text-amber-700 hover:bg-amber-50'
                                }`}
                                onClick={() => {
                                  const bd = cs.wageBreakdowns[i] ?? cs.wageBreakdowns[0];
                                  const displayText = bd ? buildWageDisplayText([bd]) : c.num.toLocaleString('ko-KR') + '원';
                                  setField('salary', displayText);
                                  setForm((prev) => ({
                                    ...prev,
                                    salaryNum: c.num,
                                    dailyWage: bd?.wage,
                                    extraPay: bd?.extraPay || undefined,
                                    totalExpectedPay: bd?.total,
                                  }));
                                  showToast(`✅ ${toManStr(c.num)}원으로 변경됐습니다`);
                                }}
                              >
                                {toManStr(c.num)}원{i === 0 ? ' ★' : ''} <span className="opacity-60">({c.score}점)</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <p className="text-[11px] text-amber-600 mt-1.5">★ 후보를 클릭하면 급여 값이 변경됩니다</p>

                        {/* 검수 필요 경고 */}
                        {cs.needsReview && (
                          <div className="mt-2 bg-red-100 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-700 font-semibold">
                            ⚠️ 신뢰도 낮음 — 원문 확인 후 급여 값을 직접 수정해주세요
                          </div>
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
                  <input type="tel" list="cj-ac-contacts" value={form.contact || ''} onChange={(e) => setField('contact', e.target.value)} placeholder="예: 010-1234-5678" className={`w-full py-2.5 px-3.5 border-2 rounded-lg text-sm outline-none font-[inherit] transition-colors ${dupWarning ? 'border-amber-400 bg-amber-50 focus:border-amber-500' : 'border-gray-200 focus:border-[#f97316]'}`} />
                  <datalist id="cj-ac-contacts">{acHistory.contacts.map((c) => <option key={c} value={c} />)}</datalist>
                  {dupWarning && (
                    <p className="mt-1 text-[11px] font-bold text-amber-600 flex items-center gap-1">
                      {dupWarning}
                    </p>
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
              <div className="mt-5 flex gap-2">
                <button type="submit" disabled={submitting} className={`flex-1 py-[14px] rounded-xl text-[15px] font-bold text-white border-none cursor-pointer font-[inherit] transition-colors flex items-center justify-center gap-2 ${submitting ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#f97316] hover:bg-[#ea580c]'}`}>
                  {submitting ? '등록 중...' : '✅ 공고 등록하기'}
                  {!submitting && <span className="text-[11px] opacity-60 font-normal bg-white/20 px-1.5 py-0.5 rounded">Ctrl+Enter</span>}
                </button>
              </div>
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
            </div>
          );
        })()}

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
          { label: '☀️ 정오 12:00', h: 12, m: 0 },
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
