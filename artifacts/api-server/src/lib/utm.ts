// geonseolup.com 링크에 ?utm_source=<채널>(이미 ?가 있으면 &utm_source=<채널>)를
// 붙이는 공통 함수. 방문자 통계(visit_sources/visit_attributions)가 이 파라미터로
// 채널별 유입을 구분하므로, 외부 채널에 게시되는 링크는 예외 없이 이 함수를 거쳐야 한다.
// (2026-08-14 사용자 지시로 "utm 절대 금지" 규칙이 뒤집혔고, 2026-08-30 채널 확장 —
// Threads만 자동 부착되고 나머지 채널은 referrer가 앱 인앱브라우저에서 종종 사라져
// "출처 미확인"으로 새는 문제가 확인돼 전 채널로 넓힘.)
export function withUtm(url: string, source: string): string {
  if (!url || url.includes("utm_source=")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}utm_source=${source}`;
}

/** @deprecated withUtm(url, "threads")를 대신 쓴다. 기존 호출부 호환용으로 남겨둠. */
export function withThreadsUtm(url: string): string {
  return withUtm(url, "threads");
}
