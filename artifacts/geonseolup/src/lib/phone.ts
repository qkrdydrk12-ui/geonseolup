// 전화번호 마스킹 유틸 (서버 contactMask.ts와 동일 규칙).
// 서버 API 응답은 이미 마스킹돼 오지만, 로컬 캐시/Firestore 폴백 등
// 원본 번호가 남아 있을 수 있는 경로의 "표시"도 항상 이 함수를 거친다.

const PHONE_IN_TEXT_RE = /0\d{1,2}[-.\s()]*\d{3,4}[-.\s()]*\d{4}/g;

export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-****-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-***-${d.slice(6)}`;
  if (d.length >= 7) return `${d.slice(0, 3)}-****`;
  return raw ? raw.slice(0, 3) + '****' : '번호없음';
}

export function maskPhonesInText(text: string): string {
  return text.replace(PHONE_IN_TEXT_RE, (m) => maskPhone(m));
}
