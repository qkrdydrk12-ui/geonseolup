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

export type GenerateImageResult =
  | { ok: true; image: GeneratedImage }
  | { ok: false; error: string };

export function isImageGenConfigured(): boolean {
  return Boolean(process.env["OPENAI_API_KEY"]);
}

// 실패해도 예외를 던지지 않는다 — 이미지 생성은 부가 기능이라, 실패했다고
// 텍스트 초안 생성 같은 본 작업이 막히면 안 된다. 대신 실패 사유를 그대로
// 반환해서 관리자 화면에서 바로 원인을 확인할 수 있게 한다.
export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    logger.debug("[image-gen] OPENAI_API_KEY 미설정 — 건너뜀");
    return { ok: false, error: "OPENAI_API_KEY가 설정되지 않았습니다" };
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
      return { ok: false, error: `OpenAI API 오류 [${res.status}]: ${text.slice(0, 300)}` };
    }

    const data = (await res.json()) as { data: { b64_json?: string; url?: string }[] };
    const item = data.data?.[0];
    if (!item) return { ok: false, error: "OpenAI 응답에 이미지 데이터가 없음" };

    if (item.b64_json) {
      return { ok: true, image: { data: Buffer.from(item.b64_json, "base64"), mime: "image/png" } };
    }
    if (item.url) {
      const imgRes = await fetch(item.url);
      if (!imgRes.ok) return { ok: false, error: `생성된 이미지 URL 다운로드 실패 [${imgRes.status}]` };
      const arrayBuf = await imgRes.arrayBuffer();
      return {
        ok: true,
        image: { data: Buffer.from(arrayBuf), mime: imgRes.headers.get("content-type") || "image/png" },
      };
    }
    return { ok: false, error: "OpenAI 응답 형식을 알 수 없음 (b64_json/url 둘 다 없음)" };
  } catch (err) {
    logger.warn({ err: String(err) }, "[image-gen] 이미지 생성 중 오류");
    return { ok: false, error: `네트워크/예외 오류: ${String(err)}` };
  }
}
