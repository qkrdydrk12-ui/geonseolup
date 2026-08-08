// 전화번호 비노출 유틸 — 공개 응답(목록/상세/SEO/RSS)에는 전화번호 숫자가
// 일부 마스킹된 형태로도 나가지 않는다 (검색엔진 색인에 번호 흔적 자체를 남기지 않기 위함).
// 실제 번호는 GET /api/jobs/:id/contact (연락처 보기 버튼 클릭)로만 조회 가능.

// 한국 전화번호 패턴 (010-1234-5678, 010 1234 5678, 01012345678, 지역번호 포함)
const PHONE_IN_TEXT_RE = /0\d{1,2}[-.\s()]*\d{3,4}[-.\s()]*\d{4}/g;

// 본문/원문 속 전화번호를 통째로 안내 문구로 대체 (숫자 일부도 남기지 않음).
export const CONTACT_HIDDEN_NOTE = "(연락처는 개인정보 보호를 위해 숨겨져 있습니다)";

export function maskPhonesInText(text: string): string {
  return text.replace(PHONE_IN_TEXT_RE, CONTACT_HIDDEN_NOTE);
}

// 공개용 공고 객체 생성: contact 원본 완전 제거 → hasContact 여부만 남기고,
// 전화번호가 섞일 수 있는 모든 텍스트 필드에서 번호를 안내 문구로 대체.
export function sanitizePublicJob<T extends Record<string, unknown>>(job: T): T {
  const out: Record<string, unknown> = { ...job };
  const contact = typeof out["contact"] === "string" ? (out["contact"] as string).trim() : "";
  delete out["contact"];
  delete out["contactMasked"]; // 과거 캐시 호환 — 마스킹 숫자도 더 이상 내보내지 않는다
  out["hasContact"] = contact.length > 0;
  // 파서 내부 산출물 등 전화번호가 남을 수 있는 부가 필드는 통째로 제거
  delete out["_phoneCandidates"];
  // 나머지 모든 필드의 문자열 값(중첩 배열/객체 포함)을 재귀적으로 치환.
  // 구조(wageBreakdowns 등)는 보존하고 문자열 리프만 바꾼다.
  for (const [k, v] of Object.entries(out)) {
    out[k] = maskDeep(v);
  }
  return out as T;
}

function maskDeep(v: unknown): unknown {
  if (typeof v === "string") return maskPhonesInText(v);
  if (Array.isArray(v)) return v.map(maskDeep);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = maskDeep(val);
    return o;
  }
  return v;
}
