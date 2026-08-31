// 건설 일용직 일당 실수령액 추정 계산 로직 (2026-08-31 신설)
//
// 일반적인 "연봉/월급 실수령액 계산기"는 정규직 월급여 기준이라 건설 일용직에는 잘 맞지 않는다.
// 일용근로소득은 소득세법상 원천징수 방식 자체가 다르고(비과세 15만원 + 세액공제 55%),
// 4대보험 가입 여부도 "1개월 미만·월 8일 미만 근로"면 국민연금·건강보험은 대부분 미가입인
// 등 상용직과 다르다. 이 계산기는 그 차이를 반영한다.
//
// ── 일용근로소득세 원천징수 공식 (소득세법 시행령 제201조) ──
// 1) 비과세: 1일 150,000원(오래전부터 고정, 2026년 8월 기준 변동 없음)
// 2) 과세표준 = max(0, 일당 - 150,000)
// 3) 산출세액 = 과세표준 × 6%
// 4) 근로소득세액공제 55% 적용 → 결정세액(소득세) = 산출세액 × 45%, 10원 미만 절사
// 5) 지방소득세(소득분) = 소득세 × 10%, 10원 미만 절사
//
// ── 4대보험 ──
// - 산재보험: 100% 사업주 부담, 근로자 공제 없음(계산에서 제외)
// - 고용보험(근로자 부담, 실업급여 요율): 일당 × 0.9%
// - 국민연금·건강보험: 건설일용직은 원칙적으로 "월 8일 이상 & 1개월 이상 계속근로 예정"인
//   경우에만 가입 대상이라 짧은 단기 근무는 대부분 미가입. 그래서 기본값은 OFF이고,
//   토글을 켰을 때만 아래 개략 요율로 추가 공제한다(요율은 매년 바뀌므로 참고용).
//   · 국민연금 근로자부담 4.5%, 건강보험 근로자부담 3.545% + 장기요양보험료(건강보험료의 12.95%)

export const DAILY_NONTAXABLE = 150_000;
export const INCOME_TAX_RATE = 0.06;
export const INCOME_TAX_CREDIT_RATE = 0.55; // 세액공제율 → 실부담은 45%
export const LOCAL_TAX_RATE = 0.10;
export const EMPLOYMENT_INSURANCE_RATE = 0.009;
export const NATIONAL_PENSION_RATE = 0.045;
export const HEALTH_INSURANCE_RATE = 0.03545;
export const LONG_TERM_CARE_RATE = 0.1295; // 건강보험료 대비 비율

/** 10원 미만 절사(원천징수 세액 계산 관례) */
function truncateTen(n: number): number {
  return Math.floor(n / 10) * 10;
}

export interface DailyNetPayInput {
  dailyWage: number;
  /** 국민연금·건강보험 추가 가입 여부(1개월 이상·월 8일 이상 근로 예정인 경우) */
  includePensionHealth: boolean;
}

export interface DailyNetPayResult {
  dailyWage: number;
  incomeTax: number;
  localTax: number;
  employmentInsurance: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  totalDeduction: number;
  netPay: number;
}

/** 입력 일당을 음수·소수 없는 안전한 정수로 정리한다(최대 1000만원 상한). */
export function sanitizeWage(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 10_000_000);
}

export function calcDailyNetPay(input: DailyNetPayInput): DailyNetPayResult {
  const dailyWage = sanitizeWage(input.dailyWage);

  const taxableBase = Math.max(0, dailyWage - DAILY_NONTAXABLE);
  const calculatedTax = taxableBase * INCOME_TAX_RATE;
  const incomeTax = truncateTen(calculatedTax * (1 - INCOME_TAX_CREDIT_RATE));
  const localTax = truncateTen(incomeTax * LOCAL_TAX_RATE);

  const employmentInsurance = Math.floor(dailyWage * EMPLOYMENT_INSURANCE_RATE);

  let nationalPension = 0;
  let healthInsurance = 0;
  let longTermCare = 0;
  if (input.includePensionHealth) {
    nationalPension = Math.floor(dailyWage * NATIONAL_PENSION_RATE);
    healthInsurance = Math.floor(dailyWage * HEALTH_INSURANCE_RATE);
    longTermCare = Math.floor(healthInsurance * LONG_TERM_CARE_RATE);
  }

  const totalDeduction =
    incomeTax + localTax + employmentInsurance + nationalPension + healthInsurance + longTermCare;

  return {
    dailyWage,
    incomeTax,
    localTax,
    employmentInsurance,
    nationalPension,
    healthInsurance,
    longTermCare,
    totalDeduction,
    netPay: dailyWage - totalDeduction,
  };
}

// ── 이번달 실수령액 합산 (건설 일용직은 한 달에 여러 현장을 옮겨 다니는 경우가 흔하다) ──

export interface MonthlyWorkEntry {
  id: string;
  label: string;
  dailyWage: number;
  days: number;
}

export function sanitizeDays(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 31);
}

export interface MonthlySummary {
  totalDays: number;
  totalGross: number;
  totalNet: number;
  totalDeduction: number;
}

export function calcMonthlySummary(
  entries: MonthlyWorkEntry[],
  includePensionHealth: boolean,
): MonthlySummary {
  let totalDays = 0;
  let totalGross = 0;
  let totalNet = 0;
  let totalDeduction = 0;

  for (const entry of entries) {
    const wage = sanitizeWage(entry.dailyWage);
    const days = sanitizeDays(entry.days);
    if (wage <= 0 || days <= 0) continue;
    const perDay = calcDailyNetPay({ dailyWage: wage, includePensionHealth });
    totalDays += days;
    totalGross += wage * days;
    totalNet += perDay.netPay * days;
    totalDeduction += perDay.totalDeduction * days;
  }

  return { totalDays, totalGross, totalNet, totalDeduction };
}
