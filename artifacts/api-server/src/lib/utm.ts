// Threads로 나가는 geonseolup.com 링크에 항상 ?utm_source=threads(이미 ?가 있으면
// &utm_source=threads)를 붙이는 공통 함수. 방문자 통계가 이 파라미터로 Threads
// 유입을 구분하므로, Threads에 게시되는 링크는 예외 없이 이 함수를 거쳐야 한다.
// (2026-08-14 사용자 지시 — 그 전엔 반대로 "utm 파라미터를 절대 붙이지 않는다"가
// 확정 규칙이었으나, 유입 경로 분석을 위해 이번에 뒤집혔다.)
export function withThreadsUtm(url: string): string {
  if (!url || url.includes("utm_source=")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}utm_source=threads`;
}
