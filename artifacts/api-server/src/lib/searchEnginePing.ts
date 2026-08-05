// 검색엔진에 sitemap 갱신을 능동적으로 알림.
// 구글은 2023년 6월 sitemap ping 엔드포인트를 폐지했고(대신 Indexing API 사용 —
// googleIndexing.ts), 네이버는 공개 ping 엔드포인트가 없다(서치어드바이저가
// RSS/사이트맵을 주기적으로 수집). Bing만 아직 지원하므로 그것만 핑한다.

import { logger } from "./logger.js";

const BING_PING_URL = "https://www.bing.com/ping?sitemap=";
const SITEMAP_URL = "https://geonseolup.com/sitemap.xml";

// 너무 잦은 핑을 막기 위한 최소 간격(부가 기능이라 실패해도 무시).
let _lastPingAt = 0;
const MIN_INTERVAL_MS = 5 * 60_000; // 5분

export async function pingSearchEngines(): Promise<void> {
  const now = Date.now();
  if (now - _lastPingAt < MIN_INTERVAL_MS) return;
  _lastPingAt = now;
  try {
    const res = await fetch(`${BING_PING_URL}${encodeURIComponent(SITEMAP_URL)}`);
    logger.debug({ status: res.status }, "[search-ping] Bing sitemap ping 완료");
  } catch (err) {
    logger.debug({ err: String(err) }, "[search-ping] Bing sitemap ping 실패 (무시)");
  }
}
