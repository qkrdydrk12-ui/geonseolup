---
name: Geonseolup 전화번호 공개 마스킹
description: 공개 응답에서 전화번호가 절대 나가면 안 되는 경로와 마스킹 규칙
---

규칙: 공개 API/HTML/RSS/SEO 어디에도 실제 전화번호가 나가면 안 된다. 서버 캐시(toPublic)가
sanitizePublicJob으로 번호를 완전 제거한 본을 담고(마스킹 숫자도 금지, 문구로 대체), 실번호는 GET /api/jobs/:id/contact(연락처 보기 버튼,
IP당 일일 한도)로만 나간다.

**Why:** 구인 등록자 전화번호는 개인정보 — 검색엔진/스크래퍼에 수집되면 안 됨 (사용자 요청).

**How to apply:**
- 새 공개 응답 경로(RSS류, 새 라우트, 크롤러용 HTML)를 추가할 때 반드시 sanitizePublicJob
  또는 maskPhonesInText를 거칠 것. jobsCache를 우회해 Firestore를 직접 읽는 라우트가 함정
  (rss.ts가 그랬음).
- 번호는 contact 필드만이 아니라 originalText/detail/title/manager/_phoneCandidates 등
  텍스트·파서 필드에도 섞여 있다 — 필드 단위가 아닌 재귀 마스킹(maskDeep)이 안전.
- 클라이언트 표시도 항상 lib/phone.ts 마스킹을 거친다 (로컬 캐시/Firestore 폴백에 원본이
  남아 있을 수 있음). 공개 리빌은 서버 우선, 네트워크 오류 시에만 로컬 폴백.
- 주의: Firestore 자체는 공개 읽기 규칙이라 원본 문서에 접근 가능 — 완전 차단하려면
  Firebase 보안 규칙 개편 필요(사용자가 콘솔에서 해야 함).
