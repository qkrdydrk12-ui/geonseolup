// 건설근로자 퇴직공제금 추정 계산 로직 (2026-08-31 신설)
//
// ⚠️ 이 값은 어디까지나 "추정치"다 — 실제 제도는 근로자가 일한 현장의 "입찰공고 시점" 단가가
// 그 현장 근무 기간 내내 그대로 적용되는 구조라(계약 단가 고정), 달력상 연도만으로는 100% 정확히
// 재현할 수 없다(2026-04-03 경향신문 보도: 아직도 1998년 단가 2,100원을 쓰는 현장 7곳 존재 확인됨).
// 아래 표는 "연도별로 인상된 표준 단가"를 기준으로 한 근사치이며, 페이지에도 이 한계를 명시한다.
//
// 또한 매일 납부되는 "퇴직공제부금"에는 근로자 개인 적립분(퇴직공제금)과 공제회 복지사업 재원인
// "부가금"이 합쳐져 있다 — 개인이 나중에 돌려받는 건 퇴직공제금 부분뿐이므로, 아래 단가는
// 부가금을 제외한 퇴직공제금 전용 단가를 쓴다(총 납부액 기준 단가보다 낮게 보일 수 있음, 정상).
//
// 단가 출처: 나무위키 "건설근로자공제회" 문서(변동 이력) + 2026년 인상분은 고용노동부·정책브리핑
// 등 다수 언론 보도(6,500→8,700원 "총액" 인상, 그중 개인 적립분은 6,200→8,200원, 부가금은 300→500원)
// 교차 검증. 오래된 구간(1998~2017)은 자료가 이보다 부정확할 수 있어 페이지에 재확인 안내를 둔다.

export interface RetirementFundBracket {
  key: string;
  label: string;
  sublabel: string;
  /** 1일당 개인 적립분(원) — 부가금 제외 */
  rate: number;
}

export const RETIREMENT_FUND_BRACKETS: RetirementFundBracket[] = [
  { key: 'b2026', label: '2026년 4월 이후', sublabel: '신규 입찰 현장 기준', rate: 8200 },
  { key: 'b2020', label: '2020년 5월 ~ 2026년 3월', sublabel: '', rate: 6200 },
  { key: 'b2018', label: '2018년 ~ 2020년 4월', sublabel: '', rate: 4800 },
  { key: 'b2008', label: '2008년 ~ 2017년', sublabel: '', rate: 4000 },
  { key: 'b2007', label: '2007년', sublabel: '', rate: 3000 },
  { key: 'b1998', label: '1998년 ~ 2006년', sublabel: '제도 시행 초기', rate: 2000 },
];

/** 퇴직공제금 수급을 위한 최소 적립일수 (예외: 65세 이상 신규 취업자 등은 별도 기준 적용될 수 있음) */
export const MIN_ELIGIBLE_DAYS = 252;

export interface RetirementFundBreakdownRow extends RetirementFundBracket {
  days: number;
  amount: number;
}

export interface RetirementFundResult {
  totalDays: number;
  /** 이자 미포함 원금 추정액 */
  totalAmount: number;
  breakdown: RetirementFundBreakdownRow[];
  eligible: boolean;
}

/** 입력값을 음수·소수 없는 안전한 정수로 정리한다(최대 20000일 = 약 55년 근무로 상한). */
export function sanitizeDays(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 20000);
}

export function calcRetirementFund(daysByBracket: Record<string, number>): RetirementFundResult {
  let totalDays = 0;
  let totalAmount = 0;
  const breakdown: RetirementFundBreakdownRow[] = RETIREMENT_FUND_BRACKETS.map((b) => {
    const days = sanitizeDays(daysByBracket[b.key]);
    const amount = days * b.rate;
    totalDays += days;
    totalAmount += amount;
    return { ...b, days, amount };
  });
  return { totalDays, totalAmount, breakdown, eligible: totalDays >= MIN_ELIGIBLE_DAYS };
}
