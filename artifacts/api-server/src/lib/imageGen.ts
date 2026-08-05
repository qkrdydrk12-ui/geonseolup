// Threads 홍보 이미지 자동 생성 — OpenAI Images API.
// 필요한 환경변수 (Replit Secrets, 레포에는 커밋하지 않음):
//   OPENAI_API_KEY — platform.openai.com에서 발급받은 API 키 (ChatGPT 로그인과는 별개 계정/과금)
//
// 비용 주의: 이미지 1장 생성마다 실비가 든다. threadsDrafts.ts의 isPromotable()이
// 이미 "숙식 둘 다 제공" 또는 "고급여" 공고만 걸러내므로 호출 빈도 자체는 낮게 유지된다.
// 미설정 시 조용히 건너뛰고 텍스트 초안만 생성 (기존 동작 그대로 유지).

import { logger } from "./logger.js";

const IMAGE_API_URL = "https://api.openai.com/v1/images/generations";

export interface GeneratedImage {
  data: Buffer;
  mime: string;
}

export function isImageGenConfigured(): boolean {
  return Boolean(process.env["OPENAI_API_KEY"]);
}

// 실패해도 예외를 던지지 않는다 — 이미지 생성은 부가 기능이라, 실패했다고
// 텍스트 초안 생성 같은 본 작업이 막히면 안 된다.
export async function generateImage(prompt: string): Promise<GeneratedImage | null> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    logger.debug("[image-gen] OPENAI_API_KEY 미설정 — 건너뜀");
    return null;
  }

  try {
    const res = await fetch(IMAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, text }, "[image-gen] 이미지 생성 API 실패");
      return null;
    }

    const data = (await res.json()) as { data: { b64_json?: string; url?: string }[] };
    const item = data.data?.[0];
    if (!item) return null;

    if (item.b64_json) {
      return { data: Buffer.from(item.b64_json, "base64"), mime: "image/png" };
    }
    if (item.url) {
      const imgRes = await fetch(item.url);
      if (!imgRes.ok) return null;
      const arrayBuf = await imgRes.arrayBuffer();
      return { data: Buffer.from(arrayBuf), mime: imgRes.headers.get("content-type") || "image/png" };
    }
    return null;
  } catch (err) {
    logger.warn({ err: String(err) }, "[image-gen] 이미지 생성 중 오류");
    return null;
  }
}
