// 전화번호 마스킹 유틸 — 공개 응답(목록/상세/SEO)에 실제 번호가 나가지 않게 한다.
// 실제 번호는 GET /api/jobs/:id/contact (연락처 보기)로만 조회 가능.

// 한국 전화번호 패턴 (010-1234-5678, 010 1234 5678, 01012345678, 지역번호 포함)
const PHONE_IN_TEXT_RE = /0\d{1,2}[-.\s()]*\d{3,4}[-.\s()]*\d{4}/g;

// 010-****-5678 형태로 마스킹 (마지막 4자리만 노출)
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-****-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-***-${d.slice(6)}`;
  if (d.length >= 7) return `${d.slice(0, 3)}-****`;
  return "***";
}

// 자유 텍스트(원문/비고 등) 안의 전화번호를 모두 마스킹.
// 급여(예: "250,000원")는 쉼표 구분이라 패턴에 걸리지 않는다.
export function maskPhonesInText(text: string): string {
  return text.replace(PHONE_IN_TEXT_RE, (m) => maskPhone(m));
}

// 공개용 공고 객체 생성: contact 원본 제거 → contactMasked/hasContact로 대체,
// 전화번호가 섞일 수 있는 텍스트 필드(원문/비고/제목/담당자)도 마스킹.
export function sanitizePublicJob<T extends Record<string, unknown>>(job: T): T {
  const out: Record<string, unknown> = { ...job };
  const contact = typeof out["contact"] === "string" ? (out["contact"] as string).trim() : "";
  delete out["contact"];
  out["hasContact"] = contact.length > 0;
  out["contactMasked"] = contact ? maskPhone(contact) : null;
  for (const field of ["originalText", "detail", "title", "manager"]) {
    if (typeof out[field] === "string") {
      out[field] = maskPhonesInText(out[field] as string);
    }
  }
  // 파서 내부 산출물 등 전화번호가 남을 수 있는 부가 필드는 통째로 제거
  delete out["_phoneCandidates"];
  // 안전망: 나머지 모든 필드의 문자열 값(중첩 배열/객체 포함)을 재귀적으로 마스킹.
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
