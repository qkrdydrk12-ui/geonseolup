<<<<<<< HEAD
// ── Google Indexing API 클라이언트 ──────────────────────────────────────────
// 서비스 계정(JWT RS256)으로 액세스 토큰을 발급받아 URL 색인 요청을 보낸다.
// 필요 환경변수:
//   GOOGLE_INDEXING_CLIENT_EMAIL — 서비스 계정 이메일 (env)
//   GOOGLE_INDEXING_PRIVATE_KEY  — 서비스 계정 개인키 (secret, \n 이스케이프 허용)
import { createSign } from "crypto";
import { logger } from "./logger";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INDEXING_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

let cachedToken: { token: string; expiresAt: number } | null = null;

function getCreds(): { clientEmail: string; privateKey: string } | null {
  const clientEmail = process.env["GOOGLE_INDEXING_CLIENT_EMAIL"];
  let privateKey = process.env["GOOGLE_INDEXING_PRIVATE_KEY"];
  if (!privateKey) return null;
  let emailFromJson: string | undefined;
  // 시크릿에 서비스 계정 JSON 전체가 저장된 경우 private_key 필드만 추출
  const trimmed = privateKey.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { private_key?: string; client_email?: string };
      if (parsed.private_key) privateKey = parsed.private_key;
      if (parsed.client_email) emailFromJson = parsed.client_email;
    } catch {
      // JSON 파싱 실패 시 원본 그대로 사용
    }
  }
  const email = clientEmail || emailFromJson;
  if (!email) return null;
  // 시크릿에 \n 이 문자 그대로 저장된 경우 실제 개행으로 변환
  privateKey = privateKey.replace(/\\n/g, "\n");
  return { clientEmail: email, privateKey };
}

export function isIndexingConfigured(): boolean {
  return getCreds() !== null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const creds = getCreds();
  if (!creds) throw new Error("Google Indexing 자격 증명이 설정되지 않았습니다");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: creds.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(creds.privateKey).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const resp = await fetch(TOKEN_URL, {
=======
// Google Indexing API 연동.
// 공식 문서: https://developers.google.com/search/apis/indexing-api/v3/quickstart
// 주의: 구글은 Indexing API를 JobPosting/BroadcastEvent 페이지에만 쓰도록 명시하고 있다.
// 이 사이트의 /detail/:id 페이지는 JobPosting schema.org 구조화 데이터를 갖고 있으므로
// (artifacts/api-server/src/routes/seo.ts 참고) 정책상 허용되는 사용 사례다.
//
// 필요한 환경변수 (Replit Secrets에 등록, 절대 코드/레포에 커밋하지 않는다):
//   GOOGLE_INDEXING_CLIENT_EMAIL — 서비스 계정 이메일
//   GOOGLE_INDEXING_PRIVATE_KEY  — 서비스 계정 비공개 키(PEM). 개행문자는 \n으로 이스케이프해서 저장.
//
// 서비스 계정은 Search Console 속성(geonseolup.com)에 "전체(소유자)" 권한으로
// 등록되어 있어야 한다 (사용자 및 권한 메뉴에서 확인/추가).

import { createSign } from "crypto";
import { logger } from "./logger.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUBLISH_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

interface TokenCache {
  accessToken: string;
  expiresAt: number; // ms epoch
}

let _tokenCache: TokenCache | null = null;

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isConfigured(): boolean {
  return Boolean(process.env["GOOGLE_INDEXING_CLIENT_EMAIL"] && process.env["GOOGLE_INDEXING_PRIVATE_KEY"]);
}

// 서비스 계정 자격증명으로 JWT를 만들어 서명한 뒤, OAuth 액세스 토큰으로 교환한다.
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.accessToken;
  }

  const clientEmail = process.env["GOOGLE_INDEXING_CLIENT_EMAIL"]!;
  // Replit Secrets 등 환경변수에 여러 줄 PEM을 저장할 때 흔히 \n으로 이스케이프되므로 복원한다.
  const privateKey = process.env["GOOGLE_INDEXING_PRIVATE_KEY"]!.replace(/\\n/g, "\n");

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(privateKey));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
>>>>>>> origin/main
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
<<<<<<< HEAD
      assertion,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`토큰 발급 실패 (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
=======
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth 토큰 발급 실패 [${res.status}]: ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  _tokenCache = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
>>>>>>> origin/main
  return data.access_token;
}

export type IndexingNotifyType = "URL_UPDATED" | "URL_DELETED";

<<<<<<< HEAD
export async function notifyGoogle(
  url: string,
  type: IndexingNotifyType
): Promise<{ ok: boolean; status: number; message?: string }> {
  const token = await getAccessToken();
  const resp = await fetch(INDEXING_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    logger.warn({ url, type, status: resp.status, body: text.slice(0, 200) }, "[indexing] 알림 실패");
    return { ok: false, status: resp.status, message: text.slice(0, 200) };
  }
  return { ok: true, status: resp.status };
=======
// 개별 URL의 색인 갱신/삭제를 구글에 알린다. 실패해도 예외를 던지지 않고 로그만 남긴다
// (색인 알림은 부가 기능이라, 실패했다고 공고 등록/삭제 같은 본 작업이 막히면 안 된다).
export async function notifyGoogleIndexing(url: string, type: IndexingNotifyType = "URL_UPDATED"): Promise<boolean> {
  if (!isConfigured()) {
    logger.debug("[google-indexing] GOOGLE_INDEXING_CLIENT_EMAIL/PRIVATE_KEY 미설정 — 건너뜀");
    return false;
  }
  try {
    const token = await getAccessToken();
    const res = await fetch(PUBLISH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url, type }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, text, url }, "[google-indexing] 색인 알림 실패");
      return false;
    }
    logger.info({ url, type }, "[google-indexing] 색인 알림 전송 성공");
    return true;
  } catch (err) {
    logger.warn({ err, url }, "[google-indexing] 색인 알림 중 오류");
    return false;
  }
>>>>>>> origin/main
}
