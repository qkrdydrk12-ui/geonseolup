// 공수표 3단계 — 실제 근무일 기록을 lib/retirementFund.ts의 공제부금 구간(RETIREMENT_FUND_BRACKETS)에
// 자동 배분해 추정 적립액을 계산한다. 기존 계산 로직/단가표는 그대로 재사용하고 여기서는 날짜→구간 매핑만 담당한다.
import { RETIREMENT_FUND_BRACKETS, calcRetirementFund, type RetirementFundResult } from "./retirementFund";

function bracketKeyForDate(workDate: string): string {
  if (workDate < "2007-01-01") return "b1998";
  if (workDate < "2008-01-01") return "b2007";
  if (workDate < "2018-01-01") return "b2008";
  if (workDate < "2020-05-01") return "b2018";
  if (workDate < "2026-04-01") return "b2020";
  return "b2026";
}

export function estimateRetirementFundFromWorkDates(workDates: string[]): RetirementFundResult {
  const daysByBracket: Record<string, number> = {};
  for (const b of RETIREMENT_FUND_BRACKETS) daysByBracket[b.key] = 0;
  for (const d of workDates) {
    const key = bracketKeyForDate(d);
    daysByBracket[key] = (daysByBracket[key] || 0) + 1;
  }
  return calcRetirementFund(daysByBracket);
}
