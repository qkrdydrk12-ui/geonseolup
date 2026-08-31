// 건설 일용직 근로계약서 자동 작성 로직 (2026-08-31 신설)
//
// 고용노동부 표준근로계약서(건설일용근로자용) 항목을 기반으로 하되, 건설현장 관행을
// 반영한 두 가지가 다르다:
// 1) "일용직"이어도 실제로는 하루하루 새 계약서를 쓰지 않고 계약기간을 "1개월"로 써서
//    그 안에서 매일 출근하는 방식이 흔하다(사용자 확인) — 그래서 계약기간 기본값을
//    "1개월(자동 갱신)"로 둔다. 이게 나중에 [[severancePay]] 계산기의 "계속근로" 인정
//    판단에도 유리한 근거가 된다(매일 새 계약보다 한 달 단위 반복 갱신이 계속근로로
//    보일 여지가 더 크다).
// 2) 임금은 "일급"이 아니라 "1공수 단가 × 공수"로 표기하는 게 실제 현장 관행과 맞다
//    (실수령액 계산기와 동일한 공수 개념 재사용).

export type ContractTermType = '1month' | 'untilCompletion' | 'custom';

export interface ContractInput {
  companyName: string;
  siteName: string;
  workerName: string;
  startDate: string; // YYYY-MM-DD
  termType: ContractTermType;
  customEndDate: string; // termType === 'custom'일 때만 사용
  jobType: string;
  unitWage: number;
  gongsu: string; // 문자열로 들고 있다가 미리보기 시점에만 숫자로 환산(소수 입력 대응)
  workStartTime: string; // HH:mm
  workEndTime: string;
  breakMinutes: number;
  payDay: string; // 예: "매월 10일"
  insuranceEmployment: boolean;
  insurancePension: boolean;
  insuranceHealth: boolean;
}

export function defaultContractInput(): ContractInput {
  return {
    companyName: '',
    siteName: '',
    workerName: '',
    startDate: '',
    termType: '1month',
    customEndDate: '',
    jobType: '',
    unitWage: 0,
    gongsu: '1',
    workStartTime: '08:00',
    workEndTime: '17:00',
    breakMinutes: 60,
    payDay: '매월 10일',
    insuranceEmployment: true,
    insurancePension: false,
    insuranceHealth: false,
  };
}

export function sanitizeWageAmount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 10_000_000);
}

export function sanitizeBreakMinutes(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 480);
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateKo(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 계약기간 문구를 만든다. "1개월" 선택 시 시작일+1개월 전날을 종료일로 계산해 보여준다
 *  (실제로는 자동 갱신되는 형태지만, 최초 계약서 상 종료일 표기 관행을 반영). */
export function formatContractTerm(input: Pick<ContractInput, 'startDate' | 'termType' | 'customEndDate'>): string {
  const start = parseDate(input.startDate);
  if (!start) return '근로개시일을 입력해주세요';

  if (input.termType === 'untilCompletion') {
    return `${formatDateKo(start)}부터 해당 공사(작업) 종료 시까지`;
  }
  if (input.termType === 'custom') {
    const end = parseDate(input.customEndDate);
    if (!end) return `${formatDateKo(start)}부터 (종료일 미입력)`;
    return `${formatDateKo(start)} ~ ${formatDateKo(end)}`;
  }
  // 1month
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1);
  return `${formatDateKo(start)} ~ ${formatDateKo(end)} (1개월, 이후 별도 통보 없으면 동일 조건으로 자동 갱신)`;
}

export function sanitizeGongsuText(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 100);
}

export function calcDailyWageFromContract(unitWage: number, gongsu: string): number {
  return Math.round(sanitizeWageAmount(unitWage) * sanitizeGongsuText(gongsu));
}
