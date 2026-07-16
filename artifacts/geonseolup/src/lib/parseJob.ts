// 공고 원문 자동 파싱 로직 — 관리자 페이지와 구인등록 페이지에서 공용으로 사용
import type { Job } from '@/lib/firebase';
import { WELD_SUBS } from '@/lib/utils';

const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '해외', '전국'];
const JOBS = ['조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비', '화기감시자', '유도원', '양중', '덕트', '비계', '안전담당자', '안전시설반', '품질담당자', '공사담당자', '기타'];
const MEALS = ['식사제공', '식사없음', '협의', '출퇴근'];
const LODGINGS = ['숙박제공', '숙박없음', '협의'];

// 도시명 → 광역시/도 매핑
const CITY_TO_PROVINCE: Record<string, string> = {
  // 경기도
  평택: '경기', 고덕: '경기', 용인: '경기', 원삼: '경기', 이천: '경기', 수원: '경기', 성남: '경기', 안양: '경기',
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

// 출퇴근·숙소·식대포함 등 단가 컨텍스트 포함 — 명시적 원 단위 금액과 함께 나올 때 최우선 처리
const SALARY_KW = '일당|단가|급여|임금|공임|일급|공수|조공|기공|안전담당자|화기감시자|초보|팀원|팀장|출퇴근|숙소|숙박|식대';

const NOISE_PATS: RegExp[] = [
  /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g,  // 전화번호
  /\d{4}[-./]\d{1,2}[-./]\d{1,2}/g,          // YYYY-MM-DD 날짜
  /\d{1,2}월\s*\d{1,2}일/g,                  // N월N일 날짜
  /급여일\s*\d+/g,                             // 급여일
  /\d+\s*개월/g,                               // 개월수
  /\d{1,2}:\d{2}/g,                           // HH:MM 시간
  /\d{1,2}\s*시\s*(?:\d{1,2}\s*분)?/g,         // N시 / N시 N분 (근무 시간대) — "14시~24시"가 단가로 오인식되는 것 방지
  /P[1-9](?:라인|LINE)?/gi,                    // P라인 현장명
  /\d+\s*명/g,                                 // 인원수
  /\d+\s*층/g,                                 // 층수 (건물/현장 층)
  /B\d+/gi,                                    // 지하층 (B1, B2 등)
  /\d+\s*호(?:기|실)?/g,                       // 호기/호실
  // ── 나이·기간·근무일·제도 — 급여 오인식 방지 ──────────────────────────────
  /\d+\s*세/g,                                 // 나이: 22세, 55세, ~55세
  /[2-6]0\s*대/g,                              // 나이 세대: 20대, 30대, 40대, 50대, 60대
  /주\s*[3-7]\s*일/g,                          // 근무일수: 주5일, 주6일
  /4\s*대\s*보험/g,                             // 4대보험
  /\d+\s*년/g,                                  // 기간: 2년, 3년
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
  // ── 한글 자간 공백 정규화: "단   가" → "단가", "일 당" → "일당" 등 ────────
  // 카카오톡 강조 표기에서 자주 보이는 패턴
  const SPACED_KW_NORM: Array<[RegExp, string]> = [
    [/단\s+가/g, '단가'],
    [/일\s+당/g, '일당'],
    [/일\s+급/g, '일급'],
    [/급\s+여(?!일)/g, '급여'],
    [/임\s+금/g, '임금'],
    [/공\s+임/g, '공임'],
    [/공\s+수/g, '공수'],
    [/조\s+공/g, '조공'],
    [/기\s+공/g, '기공'],
    [/팀\s+원/g, '팀원'],
    [/팀\s+장/g, '팀장'],
    [/숙\s+소/g, '숙소'],
    [/숙\s+박/g, '숙박'],
    [/식\s+대/g, '식대'],
    [/출\s*퇴\s*근/g, '출퇴근'],
  ];
  for (const [pat, rep] of SPACED_KW_NORM) cleaned = cleaned.replace(pat, rep);
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

  const salDbg: string[] = [];
  salDbg.push(`[salary:start] cleaned="${cleaned.slice(0, 120)}"`);

  let m: RegExpExecArray | null;

  // ── 0순위: 출퇴근|숙소|숙박 + 명시적 원 단위 금액 ───────────────────────────
  // score 60으로 낮게 유지 → 일급·단가 키워드(score 90)가 항상 우선
  // "숙소비 200,000원" 같은 비용성 항목이 급여로 오인되지 않도록 제한
  // 숙소비·숙박비(비용)는 제외, 출퇴근·식대 인접 금액만 허용
  const reChk = /(출퇴근|숙소(?!비)|숙박(?!비)|식대)[\s\S]{0,10}?(\d{2,3}[,\.]\d{3})\s*원?/gi;
  while ((m = reChk.exec(text)) !== null) {   // NOISE_PATS 전 원본 text 사용
    const num = normalizeSalaryNum(m[2].replace('.', ','));
    if (num) { add(m[0].trim(), num, 60, `"${m[1]}" + 원 단위 금액`); salDbg.push(`  ✓ [0순위] "${m[0].trim()}" → ${num}`); }
  }

  // ── 1순위: 키워드 + 명시적 금액 ─────────────────────────────────────────
  // 예: "조공 15만", "안전담당자 170,000", "초보 140000"
  // 단, "출퇴근|숙소|식대" 키워드에서는 만원 암묵 단위(10~49) 금지 (→ 2순위 제외)
  const IMPLICIT_SKIP = new Set(['출퇴근', '숙소', '숙박', '식대']);
  const kwExplicit = new RegExp(
    `(${SALARY_KW})\\s*[:：]?\\s*(?:[가-힣]{0,6}\\s*)?(\\d{1,3}(?:[.,]\\d{3})?(?:\\.\\d+)?\\s*만원?|\\d{5,6}|\\d{2,3}[.,]\\d{3})`,
    'gi'
  );
  while ((m = kwExplicit.exec(cleaned)) !== null) {
    const num = normalizeSalaryNum(m[2].trim());
    if (num) { add(m[0], num, 90, `키워드 "${m[1]}" + 금액`); salDbg.push(`  ✓ [1순위] "${m[0]}" → ${num}`); }
  }

  // ── 2순위: 키워드 + 만원단위 소수/정수 (일당 17, 팀원 단가 16.5) ──────────
  // 출퇴근·숙소·숙박·식대는 제외 (나이 숫자와 혼동 가능성 차단)
  const kwImplicit = new RegExp(
    `(${SALARY_KW})\\s*[:：]?\\s*(?:[가-힣]{0,6}\\s*)?((?:1[0-9]|[2-4][0-9])(?:\\.\\d+)?)(?![0-9만천,\\.원세])`,
    'gi'
  );
  while ((m = kwImplicit.exec(cleaned)) !== null) {
    if (IMPLICIT_SKIP.has(m[1].toLowerCase())) continue;
    const val = parseFloat(m[2]);
    if (val >= 10 && val < 50) {
      add(m[0], Math.round(val * 10000), 85, `키워드 "${m[1]}" + 만원단위`);
      salDbg.push(`  ✓ [2순위] "${m[0]}" → ${Math.round(val * 10000)}`);
    }
  }

  // ── 3순위: N만N천 / N.N만 / N만 표현 ─────────────────────────────────────
  const manPat = /(\d{1,3})\s*만\s*(\d)\s*천|([\d]{1,3}(?:\.\d+)?)\s*만원?/g;
  while ((m = manPat.exec(cleaned)) !== null) {
    const num = normalizeSalaryNum(m[0].replace(/\s/g, ''));
    if (num) { add(m[0], num, 70, '만원 표현'); salDbg.push(`  ✓ [3순위] "${m[0]}" → ${num}`); }
  }

  // ── 4순위: NNN,NNN / NNN.NNN (쉼표·점 천단위 구분자) ──────────────────────
  const sepPat = /\b(\d{2,3})[.,](\d{3})\b/g;
  while ((m = sepPat.exec(cleaned)) !== null) {
    const num = normalizeSalaryNum(m[0]);
    if (num) { add(m[0], num, 75, '구분자 금액'); salDbg.push(`  ✓ [4순위] "${m[0]}" → ${num}`); }
  }

  // ── 5순위 (AI 휴리스틱): 순수 5~6자리 정수 (170000, 140000) ──────────────
  const intPat = /\b(\d{5,6})\b/g;
  while ((m = intPat.exec(cleaned)) !== null) {
    const num = parseInt(m[1]);
    if (num >= 50000 && num <= 800000) { add(m[1], num, 55, '숫자 직접 표기'); salDbg.push(`  ✓ [5순위] "${m[1]}" → ${num}`); }
  }

  // ── 6순위: 기호 prefix 단가 (-, ~, •, >, * 등) ───────────────────────────
  // 예: "-17" → 170000, "~14.5" → 145000, "• 16.5" → 165000
  // 줄 시작 / 공백·구분자 다음에 오는 기호+숫자, 1~30 범위만 허용
  const prefixSymPat = new RegExp(
    `(?:^|[\\s\\n,/|])${WAGE_PREFIX}\\s*(\\d+(?:\\.\\d+)?)(?:\\s*만원?)?(?![\\d\\-세])`,
    'gm'
  );
  while ((m = prefixSymPat.exec(cleaned)) !== null) {
    const n = parseFloat(m[1]);
    if (n >= 1 && n < 50) {
      const num = Math.round(n * 10000);
      add(m[0].trim(), num, 72, `기호 prefix "${m[0].trim()}"`);
      salDbg.push(`  ✓ [6순위] "${m[0].trim()}" → ${num}`);
    }
  }

  salDbg.push(`[salary:end] candidates=${candidates.length} best=${candidates[0]?.num ?? '없음'}`);
  console.log(salDbg.join('\n'));

  if (candidates.length === 0) return null;

  // 점수 내림차순, 동점이면 금액 높은 순
  candidates.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.num - a.num));
  const best = candidates[0];
  return { text: formatSalary(best.num), num: best.num, score: best.score, candidates };
}

/** 월급 패턴 (≥1,000,000원) 우선 추출
 *  예: "급여 : 3,660,000원(주간주52시간)" → { text: "월 3,660,000", num: 3660000 }
 *  키워드(급여/월급/월/임금/연봉) 인접 또는 "원" 단위 + (시간/주/시급 같은 비월급 컨텍스트 제외)
 */
function extractMonthlySalary(text: string): { text: string; num: number; score: number } | null {
  // 노이즈 제거 (전화번호, 날짜 등)
  let cleaned = text;
  for (const pat of NOISE_PATS) cleaned = cleaned.replace(new RegExp(pat.source, pat.flags), ' ');
  cleaned = cleaned.replace(/\d{3,4}-\d{4}\b/g, ' ');

  // 키워드 + 쉼표 포함 7자리 이상 금액 + (선택)원
  // "급여 : 3,660,000원" / "월급 3,800,000" / "월 4,200,000원"
  const monthlyKwPat = /(월\s*급여?|월급|급여|임금|연봉|월)\s*[:：]?\s*([1-9]\d{0,2}(?:,\d{3}){1,3})\s*원?/g;
  let best: { num: number; raw: string; score: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = monthlyKwPat.exec(cleaned)) !== null) {
    const num = parseInt(m[2].replace(/,/g, ''), 10);
    // "연봉"이면 12로 나눠 월급 환산 (연봉 36,000,000 → 월 3,000,000)
    const isYearly = /연봉/.test(m[1]);
    // 연봉은 1200만~3억, 월급은 100만~2000만 범위 허용 후 변환
    const minRaw = isYearly ? 12_000_000 : 1_000_000;
    const maxRaw = isYearly ? 300_000_000 : 20_000_000;
    if (num < minRaw || num > maxRaw) continue;
    const monthlyNum = isYearly ? Math.round(num / 12) : num;
    if (monthlyNum < 1_000_000 || monthlyNum > 25_000_000) continue;
    // "급여일"·"급여 매월 10일"처럼 금액이 아닌 매칭 회피 — 이미 \d{1,3},\d{3}+ 강제라 안전
    const score = isYearly ? 88 : 95;
    if (!best || score > best.score || (score === best.score && monthlyNum > best.num)) {
      best = { num: monthlyNum, raw: m[0], score };
    }
  }

  // ── 만원 단위 한국식 표기 추가: "월900만", "월급 900만원", "월 900 만", "연봉 1억 2천만" 등 ──
  // 100만~2000만 범위(월급) / 연봉은 1200만~30000만(=3억)
  const monthlyManPat = /(월\s*급여?|월급|급여|임금|연봉|월)\s*[:：]?\s*(\d{2,5}(?:\.\d+)?)\s*만\s*원?/g;
  while ((m = monthlyManPat.exec(cleaned)) !== null) {
    const manVal = parseFloat(m[2]);
    const isYearly = /연봉/.test(m[1]);
    // 월급: 100만~2000만 / 연봉: 1200만~30000만
    if (isYearly) {
      if (manVal < 1200 || manVal > 30000) continue;
    } else {
      if (manVal < 100 || manVal > 2000) continue;
    }
    const rawNum = manVal * 10000;
    const monthlyNum = isYearly ? Math.round(rawNum / 12) : rawNum;
    if (monthlyNum < 1_000_000 || monthlyNum > 25_000_000) continue;
    const score = isYearly ? 88 : 95;
    if (!best || score > best.score || (score === best.score && monthlyNum > best.num)) {
      best = { num: monthlyNum, raw: m[0], score };
    }
  }
  if (best) {
    return { text: `월 ${best.num.toLocaleString('ko-KR')}`, num: best.num, score: best.score };
  }
  return null;
}

/** 건설 구인글 복합 단가 추출 (기본단가 + 일비/숙식비 분리, 역할별 단가) */
function extractComplexSalary(text: string): ComplexSalaryResult | null {
  // ── 0순위: 월급(100만원 이상) 키워드 + 쉼표 금액 ── 단가 파싱보다 우선 ──
  const monthly = extractMonthlySalary(text);
  if (monthly) {
    return {
      text: monthly.text,
      num: monthly.num,
      score: monthly.score,
      dailyWage: 0,
      extraPay: 0,
      extraLabel: '',
      totalPay: monthly.num,
      wageBreakdowns: [{ role: '월급', wage: monthly.num, extraPay: 0, extraLabel: '', total: monthly.num }],
      needsReview: false,
      candidates: [{ raw: monthly.text, num: monthly.num, score: monthly.score, reason: '월급 (100만원 이상)' }],
    };
  }

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

  // ── C-0: 공수 키워드 + 기본 + (선택) +추가 (라벨 없는 + 허용) ──────────────
  // 예: "공수 24", "공수 : 24 + 1.5", "공수:25+2"
  // "공수"는 건설 현장에서 "일당/단가"와 동의어로 자주 쓰임
  //
  // ⚠️ 단, 다음은 일수(공수 횟수) 의미라 단가 아님 → 제외:
  //   ① "평균공수/총공수/월공수/주공수/일공수/최대공수/최소공수/순공수/약공수/예상공수/보장공수" 등 prefix
  //   ② 숫자 뒤에 "~숫자공수" 범위 표기 (예: "공수:28~30공수")
  //   ③ 매치 직후에 또 "공수"가 붙음 (X공수 = 일수 단위)
  //   ④ 일당 상식 범위(1~30만원) 밖
  const gongsooPat = /(평균|총|월|주|일|최대|최소|순|약|예상|월평균|월최대|보장)?공수\s*[:：]?\s*(\d+(?:\.\d+)?)(\s*[~∼\-]\s*\d+(?:\.\d+)?\s*공수)?(?:\s*\+\s*(\d+(?:\.\d+)?))?/g;
  while ((m = gongsooPat.exec(cleaned)) !== null) {
    if (m[1]) continue;                              // ① 일수 prefix → 단가 아님
    if (m[3]) continue;                              // ② 범위 표기(X~Y공수) → 일수
    const tail = cleaned.slice(m.index + m[0].length, m.index + m[0].length + 3);
    if (/^\s*공수/.test(tail)) continue;             // ③ X공수 형태 → 일수
    const wage = parseManValue(m[2]);
    if (wage <= 0 || wage > 30) continue;            // ④ 일당 상식 범위 밖
    const extra = m[4] ? parseExtraManValue(m[4]) : 0;
    const total = wage + extra;
    if (wageBreakdowns.length === 0) {
      wageBreakdowns.push({ role: '', wage, extraPay: extra, extraLabel: extra > 0 ? '추가' : '', total });
    }
    addCand(m[0], total || wage, 92, extra > 0 ? '공수 + 추가' : '공수');
    if (bestScore < 92) bestScore = 92;
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

/**
 * 본문을 요약해 비고(detail) 칸에 자동 입력.
 * — 팩트 위주 간결 형식 (쉼표 구분 라벨)
 * — 다른 필드(지역·직종·단가·연락처)에 이미 들어가는 정보는 제외, 인사말/마무리 멘트 없음.
 */
function makeNote(text: string): string {
  const facts: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    facts.push(v);
  };

  // ① 모집 인원
  const headM = text.match(/(?:모집|구함)?\s*(?:인원\s*[:：]?\s*)?(\d{1,3})\s*명/);
  if (headM && +headM[1] >= 1 && +headM[1] <= 999) push(`${headM[1]}명 모집`);

  // ② 경력
  const expM = text.match(/(?:경력|경험)\s*(\d{1,2})\s*년\s*(?:이상|↑|\+)/);
  if (expM) push(`경력 ${expM[1]}년↑`);
  else if (/경력자\s*우대|경력자\s*환영/.test(text)) push('경력자 우대');

  // ③ 나이
  const ageM = text.match(/(\d{2})\s*[~\-∼]\s*(\d{2})\s*세/);
  if (ageM) push(`${ageM[1]}~${ageM[2]}세`);

  // ④ 근무일 / 연장
  const wdM = text.match(/주\s*([5-7])\s*일/);
  if (wdM) push(`주${wdM[1]}일`);
  const extCountM = text.match(/연장\s*주?\s*(\d+[~\-]\d+|\d+)\s*회/);
  const extHourM = text.match(/연장\s*(?:1\s*시간)?\s*(\d+(?:\.\d+)?)\s*만/);
  if (extCountM) push(`연장 ${extCountM[1]}회`);
  else if (extHourM) push(`연장 시급 ${extHourM[1]}만`);
  else if (/연장/.test(text)) push('연장 있음');

  // ⑤ 근무 기간 / 공사 기간
  const durMonthM = text.match(/(\d{1,2})\s*개월/);
  if (durMonthM && /근무가능|근무\s*가능|이상\s*근무|이상가능/.test(text)) push(`${durMonthM[1]}개월↑ 근무`);
  else if (durMonthM && /공사기간|공사\s*기간/.test(text)) push(`공사 ${durMonthM[1]}개월`);

  // ⑥ 출국/투입
  const depM = text.match(/(\d{1,2})\s*월\s*(?:중)?\s*(?:출국|투입|입사|시작)/);
  if (depM) push(`${depM[1]}월 출국`);

  // ⑦ 급여 형태
  if (/주급/.test(text)) push('주급');
  else if (/월급(?!여)/.test(text) && !/월급여/.test(text)) push('월급');

  // ⑧ 급여일
  const payDayM = text.match(/급여일\s*[:：]?\s*(매월\s*\d{1,2}일|\d{1,2}일|매주\s*\S{1,5})/);
  if (payDayM) push(`급여일 ${payDayM[1].trim()}`);

  // ⑨ 4대보험
  if (/4대\s*(?:보험)?\s*(?:가입|유|적용)/.test(text) || /4대유/.test(text)) push('4대보험');

  // ⑩ 숙식/식대
  if (/숙소\s*(?:제공|있음|가능)/.test(text)) push('숙소 제공');
  if (/식대\s*(?:제공|포함|있음)|식사\s*제공|3식\s*제공|중식\s*포함/.test(text)) push('식사 제공');

  // ⑪ 구비서류
  if (/구비서류|준비물|지참/.test(text)) {
    const docs: string[] = [];
    if (/이수증|기초안전/.test(text)) docs.push('이수증');
    if (/신분증/.test(text)) docs.push('신분증');
    if (/통장(?:사본)?/.test(text)) docs.push('통장사본');
    if (/경력증명/.test(text)) docs.push('경력증명');
    if (docs.length > 0) push(`준비물: ${docs.join('·')}`);
  }

  // ⑫ 우대/조건
  if (/초보\s*(?:가능|환영|ok|OK)/i.test(text)) push('초보 환영');
  if (/장기\s*(?:근무|가능|우대)/.test(text)) push('장기근무 우대');
  if (/동반\s*(?:입사|가능)/.test(text)) push('동반입사 가능');
  if (/성실/.test(text)) push('성실한 분 우대');

  return facts.join(' · ').slice(0, 200);
}

/** ─────────────────────────────────────────────────────────────────────────
 *  전화번호 추출 — 단순·강력 버전
 *
 *  핵심 규칙: "010 시작 + 숫자만 추출 시 11자리 → 무조건 전화번호"
 *  복잡한 isFP/confidence 필터 제거. 제외 조건은 최소한만 유지:
 *    ① 매치 직후에 만/원 이 바로 붙어있으면 금액 단위로 판단해 제외
 *    ② P라인 번호 (P1~P9) 직전이면 제외
 * ──────────────────────────────────────────────────────────────────────── */
function extractPhones(rawText: string): { main: string | null; candidates: string[] } {
  const found = new Set<string>();
  const dbg: string[] = [];

  /** 숫자만 추출 → 010-XXXX-XXXX 포맷. 유효하지 않으면 null */
  function normalize(raw: string): string | null {
    const d = raw.replace(/\D/g, '');
    if (d.startsWith('010') && d.length === 11)
      return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (/^01[16789]/.test(d) && d.length === 11)
      return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (/^01[016789]/.test(d) && d.length === 10)
      return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return null;
  }

  /** 이모지·변형선택자·비표준공백 제거 (개행 유지)
   *  ⚠ 과거 버그: /[\u2600-\u27FF\u1F300-\u1FFFF]/gu 는 \u 4자리 제한 때문에
   *     실제로 [0-\u1FFF] 범위로 해석되어 숫자 0~9가 전부 지워져 전화번호 파싱이
   *     완전히 망가졌었음. surrogate pair 규칙으로 이미 이모지가 처리되므로,
   *     BMP 심볼 범위만 명시적으로 남긴다. */
  function stripEmojis(s: string): string {
    return s
      .replace(/\uFE0F/g, '')
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ' ')   // 모든 astral plane 이모지 (👉 📞 🧯 등)
      .replace(/[\u2600-\u27FF\u2B00-\u2BFF]/g, ' ')      // BMP 심볼 (✔ ✖ ♦ ➕ ⭐ 등)
      .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');
  }

  function tryAdd(raw: string, src: string, matchEnd: number, tag: string) {
    // 최소 false-positive 체크 (금액 단위 / P라인)
    const after2 = src.slice(matchEnd, matchEnd + 2);
    const before4 = src.slice(Math.max(0, matchEnd - raw.length - 4), matchEnd - raw.length);
    if (/^[만원]/.test(after2)) return;   // 만원/원이 바로 뒤 = 금액
    if (/P\d$/.test(before4))  return;   // P1/P2 라인번호
    const n = normalize(raw);
    if (n && !found.has(n)) {
      found.add(n);
      dbg.push(`  ✓ [${tag}] "${raw.trim()}" → ${n}`);
    }
  }

  dbg.push(`[phone:start] raw.len=${rawText.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — 줄 단위 스캔 (최우선, 이모지 제거 후)
  //   각 줄을 독립적으로 처리 → 같은 줄의 노이즈 숫자가 다른 줄 번호에 영향 없음
  // ══════════════════════════════════════════════════════════════════════════
  const lines = rawText.split('\n');
  dbg.push(`  lines=${lines.length}`);

  for (let li = 0; li < lines.length; li++) {
    const s = stripEmojis(lines[li]);
    const tag = `L${li + 1}`;

    // 패턴 ①: 구분자(-, ., 공백) 있음/없음 — 010-2813-5575 / 010 2813 5575 / 01028135575
    const re1 = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g;
    let m: RegExpExecArray | null;
    while ((m = re1.exec(s)) !== null)
      tryAdd(m[0], s, m.index + m[0].length, tag);

    // 패턴 ②: 연속 11자리 (구분자 완전 없음) — 01028135575
    const re2 = /01[016789]\d{7,8}/g;
    while ((m = re2.exec(s)) !== null)
      tryAdd(m[0], s, m.index + m[0].length, `${tag}-d`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — 전체 텍스트 스캔 (줄 탐색에서 놓친 경우 보완)
  //   개행을 공백으로 통일한 단일 라인에서 재탐색
  // ══════════════════════════════════════════════════════════════════════════
  const flat = stripEmojis(rawText).replace(/\s+/g, ' ');

  const reFlat1 = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g;
  let mf: RegExpExecArray | null;
  while ((mf = reFlat1.exec(flat)) !== null)
    tryAdd(mf[0], flat, mf.index + mf[0].length, 'full');

  const reFlat2 = /01[016789]\d{7,8}/g;
  while ((mf = reFlat2.exec(flat)) !== null)
    tryAdd(mf[0], flat, mf.index + mf[0].length, 'full-d');

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — 키워드 컨텍스트 스캔 (담당자/연락처/총무 등 근처 번호 우선 포착)
  //   키워드 근처 번호는 false-positive 체크 완전 면제
  // ══════════════════════════════════════════════════════════════════════════
  const KW = '연락처|연락|문의|전화|문자|연락주|연락바|contact|팀장|반장|총무|팀원|직접구인|직통|구인|지원|담당자|연락담당';
  const reKW = new RegExp(`(?:${KW})\\s*[:：]?\\s*(01[016789][\\d\\s.\\-]{8,12})`, 'gi');
  const kwSources = [flat, rawText];
  for (const src of kwSources) {
    reKW.lastIndex = 0;
    let mk: RegExpExecArray | null;
    while ((mk = reKW.exec(src)) !== null) {
      // 키워드 근처 번호는 금액 단위 체크만 적용
      const after2 = src.slice(mk.index + mk[0].length, mk.index + mk[0].length + 2);
      if (/^[만원]/.test(after2)) continue;
      const n = normalize(mk[1]);
      if (n && !found.has(n)) { found.add(n); dbg.push(`  ✓ [kw] "${mk[1].trim()}" → ${n}`); }
    }
  }

  dbg.push(`[phone:end] found=${found.size} → ${[...found].join(' / ') || '없음'}`);
  console.log(dbg.join('\n'));

  const list = [...found];
  return { main: list[0] ?? null, candidates: list };
}

function parseJobText(text: string): Partial<Job> & { _salaryCalc?: string; _salaryCandidates?: SalaryCandidate[]; _complexSalary?: ComplexSalaryResult; _phoneCandidates?: string[] } {
  const r: Partial<Job> & { _salaryCalc?: string; _salaryCandidates?: SalaryCandidate[]; _complexSalary?: ComplexSalaryResult; _phoneCandidates?: string[] } = { originalText: text };

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

  // ── 지역: 해외 키워드 최우선 → 도시명 → 광역시/도 직접 ──
  // 해외 국가/도시/지역명 감지 → 자동 "해외" 매핑
  const OVERSEAS_KW = [
    '해외', '국외',
    // 영문
    'USA', 'U.S.A', 'America', 'Japan', 'China', 'Vietnam', 'Singapore', 'Saudi', 'Qatar', 'UAE', 'Dubai', 'Kuwait',
    // 미국
    '미국', '텍사스', '캘리포니아', '뉴욕', '시애틀', '애리조나', '오스틴', '테일러', '피닉스', '실리콘밸리',
    // 동아시아
    '일본', '도쿄', '오사카', '나고야', '후쿠오카',
    '중국', '베이징', '상하이', '상해', '광저우', '심천', '선전',
    '대만', '타이완', '타이베이',
    '홍콩', '마카오',
    // 동남아
    '베트남', '하노이', '호치민', '다낭',
    '태국', '방콕', '치앙마이',
    '말레이시아', '쿠알라룸푸르',
    '싱가포르', '인도네시아', '자카르타', '필리핀', '마닐라', '캄보디아', '라오스', '미얀마',
    // 중동
    '사우디', '사우디아라비아', '카타르', '아랍에미리트', '두바이', '아부다비', '쿠웨이트', '바레인', '이라크',
    // 유럽/오세아니아/기타
    '호주', '시드니', '뉴질랜드', '캐나다', '독일', '프랑스', '영국', '러시아', '폴란드', '체코',
    '몽골', '카자흐스탄', '우즈베키스탄',
  ];
  // 짧아서 오탐 위험이 큰 해외 키워드는 문맥까지 확인
  // - "외국인 지원 가능"은 국내 공고에도 흔함 → '외국인'은 제외
  // - "오만원"(금액), "~이란"(조사) 오탐 방지
  const OVERSEAS_RX = [
    /외국(?!인)/,
    /(?<![가-힣])오만(?![원가-힣])/,
    /(?<![가-힣])이란(?![가-힣])/,
  ];
  if (!r.region) {
    for (const kw of OVERSEAS_KW) {
      if (text.includes(kw)) { r.region = '해외'; break; }
    }
    if (!r.region && OVERSEAS_RX.some((rx) => rx.test(text))) r.region = '해외';
  }
  // 본문에 여러 지역이 언급될 때는 "가장 먼저 등장한" 지역을 선택
  // (예: 제목 "지역 대구 ..." 이 근무지역 나열보다 우선)
  if (!r.region) {
    let best: { region: string; idx: number } | null = null;
    for (const [city, province] of Object.entries(CITY_TO_PROVINCE)) {
      const idx = text.indexOf(city);
      if (idx >= 0 && (best === null || idx < best.idx)) best = { region: province, idx };
    }
    for (const reg of REGIONS) {
      const idx = text.indexOf(reg);
      if (idx >= 0 && (best === null || idx < best.idx)) best = { region: reg, idx };
    }
    if (best) r.region = best.region;
  }

  // ── 직종 ──
  // 1) 명확한 직종 키워드(JOBS, 용접 종류) 우선 매칭 — 본문 등장 순으로 가장 먼저 잡힌 것
  //    "자동"은 너무 일반적이므로 용접 컨텍스트가 있을 때만 매칭에 포함
  const WELD_SUBS_SAFE = WELD_SUBS.filter((w) => w !== '자동');
  let firstJob: { job: string; idx: number } | null = null;
  for (const job of [...JOBS, ...WELD_SUBS_SAFE]) {
    const idx = text.indexOf(job);
    if (idx >= 0 && (firstJob === null || idx < firstJob.idx)) firstJob = { job, idx };
  }
  if (firstJob) r.job = firstJob.job;

  // "자동용접" / "자동 용접" / "용접 자동" / "용접:자동" / "용접종류 자동" / "자동용접사" 감지
  // → 직종 드롭다운은 '용접'으로 두고 weldSub만 '자동'으로 설정
  //   (관리자 폼 JOBS 옵션에 '자동'이 없어서 드롭다운이 비어 보이는 버그 회피)
  if (/자동\s*용접|용접(?:\s*종류)?\s*[:：]?\s*자동/.test(text)) {
    r.job = '용접';
    r.weldSub = '자동';
  }

  // 2) 화기감시자 변형 표현 통합 — 단일 글자 "화기/화재/감시"는 절대 트리거 금지
  //    반드시 "화기감시"·"화재감시"·"안전감시"·"감시자" 같은 직종 명사가 들어있어야 함
  //    (예전 `/화재|화기|감시/` 는 본문에 우연히 "감시"만 있어도 잘못 덮어써서 버그)
  //    그리고 JOBS 매칭이 이미 다른 직종(배관·조공 등)을 잡았으면 덮어쓰지 않음
  if (!r.job && /화기\s*감시(?:자)?|화재\s*감시(?:자)?|안전\s*감시(?:자)?|감시자/.test(text)) {
    r.job = '화기감시자';
  }
  // 안전시설반 변형 표현 정규화 (공백 포함, 다양한 접미사 모두 "안전시설반"으로 통합)
  // 인식 표현: 안전시설반, 안전 시설반, 안전시설팀, 안전시설작업자, 시설반
  if (/안전\s*시설(반|팀|작업자?)?|시설반/.test(text)) r.job = '안전시설반';

  // 3) 직종 fallback — 어떤 패턴에도 매칭되지 않으면 '기타'로 분류
  //    (실리콘 작업, 부품 교체, 청소 등 비표준 직종이 누락되지 않도록)
  if (!r.job) r.job = '기타';

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

  // ── 전화번호 (이모지/특수문자 제거, 구분자 유무·연속 숫자·문맥 추론 모두 지원) ──
  const phoneResult = extractPhones(text);
  if (phoneResult.main) {
    r.contact = phoneResult.main;
    // 여러 번호 감지 시 나머지도 후보로 기록
    if (phoneResult.candidates.length > 1) {
      r._phoneCandidates = phoneResult.candidates;
    }
  } else {
    // 파싱 실패 시 관리자 검수용 후보 숫자 수집
    const raw = [...(text.matchAll(/01[016789]\d{7,8}/g))].map((m) => {
      const d = m[0];
      return d.length === 11 ? `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}` : `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
    });
    if (raw.length > 0) r._phoneCandidates = [...new Set(raw)].slice(0, 5);
  }

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

export {
  REGIONS, JOBS, MEALS, LODGINGS, CITY_TO_PROVINCE,
  stripEmoji, extractPhones, parseJobText, generateSEOTitle,
  toManStr, buildWageDisplayText, formatSalary,
};
