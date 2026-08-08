// 전화번호 비노출 유틸 (서버 contactMask.ts와 동일 규칙).
// 공개 화면에는 전화번호 숫자가 일부 마스킹된 형태로도 표시하지 않는다.
// 서버 API 응답에는 번호가 없지만, 로컬 캐시/Firestore 폴백 등 원본 번호가
// 남아 있을 수 있는 경로의 "표시"도 항상 이 함수를 거친다.
// 실제 번호는 '연락처 보기' 버튼 클릭 후에만 화면에 나타난다.

const PHONE_IN_TEXT_RE = /0\d{1,2}[-.\s()]*\d{3,4}[-.\s()]*\d{4}/g;

export const CONTACT_HIDDEN_NOTE = '(연락처는 건설UP에서 확인할 수 있습니다)';

export function maskPhonesInText(text: string): string {
  return text.replace(PHONE_IN_TEXT_RE, CONTACT_HIDDEN_NOTE);
}

// 공개 화면용 폴백 데이터(샘플/로컬 캐시/Firestore 직접 읽기) 정화 —
// contact 원본을 제거하고(hasContact 여부만 유지) 텍스트 필드 속 번호를 문구로 대체.
// 서버 sanitizePublicJob과 동일 원칙: 공개 렌더링 경로에는 번호 숫자가 아예 없어야 한다.
export function sanitizeClientJob<T extends { contact?: string; hasContact?: boolean }>(job: T): T {
  const out: Record<string, unknown> = { ...job };
  const contact = typeof out.contact === 'string' ? (out.contact as string).trim() : '';
  delete out.contact;
  if (out.hasContact === undefined) out.hasContact = contact.length > 0;
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string') out[k] = maskPhonesInText(v);
  }
  return out as T;
}
