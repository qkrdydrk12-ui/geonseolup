// 건설 일용직 퇴직금 추정 계산 로직 (2026-08-31 신설)
//
// 일반적인 "퇴직금 계산기"는 입사일~퇴사일 한 구간만 입력받아 근속연수를 계산한다.
// 하지만 건설 일용직은 한 현장·한 회사에서 매일 새로 근로계약을 맺는 형태라, 법적으로는
// "계속근로관계"가 인정돼야만 퇴직금 대상이 된다(근로기준법 제34조, 근로자퇴직급여
// 보장법 제4조 — 계속근로기간 1년 이상 + 4주 평균 주 15시간 이상).
//
// 판례상 같은 사업주 밑에서 반복적으로 재고용되며 공백이 짧았다면(대체로 1개월 이내를
// 안전권으로 보고, 그 이상은 사안마다 다르게 판단됨) "사실상 계속근로"로 인정된 사례가
// 있다. 이 계산기는 단일 구간이 아니라 "근무 구간을 여러 개 입력 → 구간 사이 공백을
// 자동으로 분석해서 계속근로 인정 가능성을 등급으로 보여주는" 방식으로 이 특성을 반영한다
// — 이게 일반 퇴직금 계산기와의 핵심 차이점.
//
// 평균임금도 "월급"이 아니라 "최근 3개월간 실제 받은 총액 ÷ 그 기간 달력일수"로 계산한다
// (근로기준법 제2조, 일용직·시급제 근로자에게 실제로 적용되는 방식).

export interface WorkPeriod {
  id: string;
  label: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD, 비어있으면 아직 근무 중(오늘까지)으로 간주 */
  endDate: string;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export type GapSeverity = 'none' | 'safe' | 'ambiguous' | 'broken';

export interface PeriodGap {
  /** 앞 구간의 id */
  afterId: string;
  days: number;
  severity: GapSeverity;
}

export interface ContinuityResult {
  /** 시작일 순으로 정렬된 유효 구간만 */
  sortedPeriods: WorkPeriod[];
  gaps: PeriodGap[];
  /** 최초 근무 시작일 ~ 최종 근무 종료일까지 달력일수(공백 포함, 계속근로 인정 시 기준) */
  spanDays: number;
  /** 공백 중 가장 심한 등급 (구간이 1개뿐이면 'none') */
  worstGapSeverity: GapSeverity;
  eligible1Year: boolean;
}

/** 공백 일수를 3단계로 분류한다. 30일 이내는 판례상 계속근로로 보는 경우가 많고,
 *  90일을 넘어가면 계속근로로 인정받기 어려운 편이다(모두 사안에 따라 다름 — 참고용). */
export function classifyGap(days: number): GapSeverity {
  if (days <= 0) return 'none';
  if (days <= 30) return 'safe';
  if (days <= 90) return 'ambiguous';
  return 'broken';
}

export function analyzeContinuity(periods: WorkPeriod[]): ContinuityResult {
  const valid = periods
    .map((p) => ({ ...p, start: parseDate(p.startDate), end: p.endDate ? parseDate(p.endDate) : new Date() }))
    .filter((p) => p.start && p.end && p.end.getTime() >= p.start.getTime()) as (WorkPeriod & { start: Date; end: Date })[];

  valid.sort((a, b) => a.start.getTime() - b.start.getTime());

  const gaps: PeriodGap[] = [];
  for (let i = 0; i < valid.length - 1; i++) {
    const gapDays = daysBetween(valid[i].end, valid[i + 1].start) - 1;
    gaps.push({ afterId: valid[i].id, days: Math.max(0, gapDays), severity: classifyGap(gapDays) });
  }

  const spanDays = valid.length > 0 ? daysBetween(valid[0].start, valid[valid.length - 1].end) + 1 : 0;

  const severityRank: Record<GapSeverity, number> = { none: 0, safe: 1, ambiguous: 2, broken: 3 };
  const worstGapSeverity = gaps.reduce<GapSeverity>(
    (worst, g) => (severityRank[g.severity] > severityRank[worst] ? g.severity : worst),
    'none',
  );

  return {
    sortedPeriods: valid.map(({ start: _s, end: _e, ...rest }) => rest),
    gaps,
    spanDays,
    worstGapSeverity,
    eligible1Year: spanDays >= 365,
  };
}

export interface SeveranceInput {
  /** 최근 3개월간 실제로 받은 임금 총액 */
  recentWageTotal: number;
  /** 그 기간의 달력일수(공휴일·비근무일 포함, 보통 89~92일) */
  recentCalendarDays: number;
  spanDays: number;
}

export interface SeveranceResult {
  averageDailyWage: number;
  severancePay: number;
}

export function sanitizeAmount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 1_000_000_000);
}

export function sanitizeCalendarDays(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 200);
}

/** 평균임금(1일) = 최근 3개월 실제 지급 총액 ÷ 그 기간 달력일수
 *  퇴직금 = 평균임금 × 30일 × (재직일수 ÷ 365) — 근로기준법 제34조 */
export function calcSeverance(input: SeveranceInput): SeveranceResult {
  const wageTotal = sanitizeAmount(input.recentWageTotal);
  const calendarDays = sanitizeCalendarDays(input.recentCalendarDays);
  const spanDays = Math.max(0, Math.floor(input.spanDays) || 0);

  const averageDailyWage = calendarDays > 0 ? Math.round(wageTotal / calendarDays) : 0;
  const severancePay = Math.round(averageDailyWage * 30 * (spanDays / 365));

  return { averageDailyWage, severancePay };
}

/** endDate 기준 최근 3개월(오늘 포함, 3개월 전 다음날부터)의 달력일수를 자동 계산해준다. */
export function estimateRecentCalendarDays(endDate: string): number {
  const end = parseDate(endDate) || new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);
  start.setDate(start.getDate() + 1);
  return Math.max(1, daysBetween(start, end) + 1);
}

export function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
