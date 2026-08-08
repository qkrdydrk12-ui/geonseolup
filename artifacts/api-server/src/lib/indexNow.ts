// IndexNow — Bing/Yandex/Seznam 등 IndexNow 참여 검색엔진에 새 글/수정된 글의 URL을
// 즉시 통지한다. 별도 계정 가입 없이, 사이트 소유를 증명하는 키 파일 하나만 루트에
// 올려두면 된다(구글은 IndexNow 미참여 — 대신 googleIndexing.ts의 Indexing API를 쓰고,
// 네이버는 공개 IndexNow/ping 엔드포인트가 없어 sitemap.xml/RSS 수집에 의존한다).
// https://www.indexnow.org/documentation
import { logger } from "./logger.js";

const SITE_URL = "https://geonseolup.com";
const HOST = "geonseolup.com";

// 자체 발급 키 — IndexNow는 계정 가입이 필요 없고, 이 키를
// https://geonseolup.com/{key}.txt 로 서빙하는 것 자체가 소유 확인이다.
export const INDEXNOW_KEY = "db6168f1330c2d40c718784e2330e55f";
const KEY_LOCATION = `${SITE_URL}/${INDEXNOW_KEY}.txt`;

const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_CALL = 10000; // IndexNow 규격상 한도(여유있게 훨씬 못 미치게 사용)

/**
 * 새로 발행되거나 수정된 URL들을 IndexNow에 통지한다. 실패해도 호출부의 흐름을
 * 막지 않도록 항상 조용히 처리한다(발행 자체는 이미 끝난 상태이므로).
 */
export async function notifyIndexNow(urls: string[]): Promise<void> {
  const cleanUrls = urls
    .filter((u) => typeof u === "string" && u.startsWith(SITE_URL))
    .slice(0, MAX_URLS_PER_CALL);
  if (cleanUrls.length === 0) return;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: KEY_LOCATION,
        urlList: cleanUrls,
      }),
    });
    logger.debug({ status: res.status, count: cleanUrls.length }, "[indexnow] 알림 완료");
  } catch (err) {
    logger.debug({ err }, "[indexnow] 알림 실패 (무시하고 진행)");
  }
}
