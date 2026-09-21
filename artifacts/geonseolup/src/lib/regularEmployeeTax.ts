import {
  EMPLOYMENT_INSURANCE_RATE,
  NATIONAL_PENSION_RATE,
  HEALTH_INSURANCE_RATE,
  LONG_TERM_CARE_RATE,
} from './dailyNetPay';

/**
 * 상용직(정규직) 월급 원천징수 근사 계산.
 *
 * 실제 국세청 "근로소득 간이세액표"는 (월급여 구간, 부양가족 수)로 미리 계산해둔
 * 조견표라서 코드로 그대로 재현할 수 없다. 이 함수는 그 표를 만들 때 쓰인
 * 공식 산출 로직(근로소득공제 → 기본공제 → 기본세율 → 근로소득세액공제)을
 * 그대로 적용한 근사치이며, 실제 간이세액표 값과 보통 ±1~2만원 이내로
 * 차이 날 수 있다(간이세액표는 10만원 단위 구간별 고정값을 쓰기 때문).
 * 정확한 금액이 필요하면 국세청 홈택스 간이세액표 조회를 이용해야 한다.
 */

export interface RegularEmployeeMonthlyInput {
  monthlyWage: number; // 월 급여액 (세전)
  dependents: number; // 부양가족 수 (본인 포함, 최소 1)
}

export interface RegularEmployeeMonthlyResult {
  monthlyWage: number;
  dependents: number;
  incomeTax: number;
  localTax: number;
  employmentInsurance: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  totalDeduction: number;
  netPay: number;
}

function truncateTen(n: number): number {
  return Math.floor(n / 10) * 10;
}

export function sanitizeMonthlyWage(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 100_000_000);
}

export function sanitizeDependents(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 11);
}

// 근로소득공제 (연간, 국세청 공제율표)
function laborIncomeDeduction(annualWage: number): number {
  if (annualWage <= 5_000_000) return annualWage * 0.7;
  if (annualWage <= 15_000_000) return 3_500_000 + (annualWage - 5_000_000) * 0.4;
  if (annualWage <= 45_000_000) return 7_500_000 + (annualWage - 15_000_000) * 0.15;
  if (annualWage <= 100_000_000) return 12_000_000 + (annualWage - 45_000_000) * 0.05;
  return 14_750_000 + (annualWage - 100_000_000) * 0.02;
}

// 종합소득세 기본세율 (연간 과세표준 기준 누진세율)
function progressiveIncomeTax(taxBase: number): number {
  if (taxBase <= 0) return 0;
  if (taxBase <= 14_000_000) return taxBase * 0.06;
  if (taxBase <= 50_000_000) return 840_000 + (taxBase - 14_000_000) * 0.15;
  if (taxBase <= 88_000_000) return 6_240_000 + (taxBase - 50_000_000) * 0.24;
  if (taxBase <= 150_000_000) return 15_360_000 + (taxBase - 88_000_000) * 0.35;
  if (taxBase <= 300_000_000) return 37_060_000 + (taxBase - 150_000_000) * 0.38;
  return 94_060_000 + (taxBase - 300_000_000) * 0.4;
}

// 근로소득세액공제 (한도는 근사를 위해 생략)
function laborIncomeTaxCredit(calculatedTax: number): number {
  if (calculatedTax <= 1_300_000) return calculatedTax * 0.55;
  return 715_000 + (calculatedTax - 1_300_000) * 0.3;
}

export function calcRegularEmployeeMonthlyNetPay(
  input: RegularEmployeeMonthlyInput,
): RegularEmployeeMonthlyResult {
  const monthlyWage = sanitizeMonthlyWage(input.monthlyWage);
  const dependents = sanitizeDependents(input.dependents);

  const annualWage = monthlyWage * 12;
  const deduction = laborIncomeDeduction(annualWage);
  const laborIncomeAmount = Math.max(0, annualWage - deduction);
  const basicDeduction = dependents * 1_500_000;
  const taxBase = Math.max(0, laborIncomeAmount - basicDeduction);
  const calculatedTax = progressiveIncomeTax(taxBase);
  const credit = Math.min(calculatedTax, laborIncomeTaxCredit(calculatedTax));
  const annualTax = Math.max(0, calculatedTax - credit);

  const incomeTax = truncateTen(annualTax / 12);
  const localTax = truncateTen(incomeTax * 0.1);

  const employmentInsurance = Math.floor(monthlyWage * EMPLOYMENT_INSURANCE_RATE);
  const nationalPension = Math.floor(monthlyWage * NATIONAL_PENSION_RATE);
  const healthInsurance = Math.floor(monthlyWage * HEALTH_INSURANCE_RATE);
  const longTermCare = Math.floor(healthInsurance * LONG_TERM_CARE_RATE);

  const totalDeduction =
    incomeTax + localTax + employmentInsurance + nationalPension + healthInsurance + longTermCare;
  const netPay = monthlyWage - totalDeduction;

  return {
    monthlyWage,
    dependents,
    incomeTax,
    localTax,
    employmentInsurance,
    nationalPension,
    healthInsurance,
    longTermCare,
    totalDeduction,
    netPay,
  };
}
