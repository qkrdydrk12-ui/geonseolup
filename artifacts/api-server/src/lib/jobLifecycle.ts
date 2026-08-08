// 공고 수명주기 — 등록 시각(date) 기준으로 서버에서 일관되게 파생한다.
// (Firestore 문서를 변경하지 않으므로 별도 크론/스케줄러·쓰기 비용이 없다)
//
//   활성(active)   : 등록 후 48시간 동안 — 목록/알림/사이트맵에 노출, 지원 가능
//   마감(closed)   : 48시간 경과 ~ 90일 — 상세 페이지는 유지하되 "모집마감" 표시,
//                    목록/알림/사이트맵에서 제외, 전화·문자 지원 비활성화
//   만료(expired)  : 마감 후 90일 경과 — 상세 페이지도 410 Gone 처리
//
// JobPosting 구조화 데이터의 validThrough도 반드시 closesAt과 같은 값을 쓴다.

export const ACTIVE_HOURS = 48;
export const RETENTION_DAYS_AFTER_CLOSE = 90;

interface JobLike {
  date?: unknown;
  [key: string]: unknown;
}

/** 등록 시각. date가 없거나 못 읽으면 null. */
export function getPostedAt(job: JobLike): Date | null {
  const dateVal = typeof job.date === "string" ? job.date : undefined;
  if (!dateVal) return null;
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? null : d;
}

/** 모집 마감 시각 = 등록 + 48시간. 등록 시각을 모르면 null(항상 활성으로 취급). */
export function getClosesAt(job: JobLike): Date | null {
  const posted = getPostedAt(job);
  if (!posted) return null;
  return new Date(posted.getTime() + ACTIVE_HOURS * 3600_000);
}

/** 모집이 마감됐는가 (등록 48시간 경과). */
export function isJobClosed(job: JobLike, now: number = Date.now()): boolean {
  const closesAt = getClosesAt(job);
  return closesAt !== null && now >= closesAt.getTime();
}

/** 상세 페이지 유지 기간(마감 후 90일)도 지나 완전히 만료됐는가. */
export function isJobExpired(job: JobLike, now: number = Date.now()): boolean {
  const closesAt = getClosesAt(job);
  if (!closesAt) return false;
  return now >= closesAt.getTime() + RETENTION_DAYS_AFTER_CLOSE * 24 * 3600_000;
}
