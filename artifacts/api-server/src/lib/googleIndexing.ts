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
  if (!clientEmail || !privateKey) return null;
  // 시크릿에 \n 이 문자 그대로 저장된 경우 실제 개행으로 변환
  privateKey = privateKey.replace(/\\n/g, "\n");
  return { clientEmail, privateKey };
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
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
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
  return data.access_token;
}

export type IndexingNotifyType = "URL_UPDATED" | "URL_DELETED";

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
}
