---
name: Geonseolup homepage SSR routing
description: Why the homepage SSR route is reached through an exact-root web-server proxy.
---

홈페이지 초기 HTML은 웹 artifact의 서버가 정확한 `/` 요청만 API 서버의 SEO 라우트로 프록시하고, 나머지 정적 자산과 SPA 경로는 웹 서버가 처리한다.

**Why:** 정적 artifact가 루트 `/`를 직접 소유하면 Express의 홈페이지 라우트가 실행되지 않는다. 반대로 API artifact가 `/` 접두 경로를 소유하면 Vite 모듈과 정적 자산까지 API가 가로채 404가 된다.

**How to apply:** 홈페이지 SSR 라우팅을 바꿀 때는 exact-root 프록시를 유지하고, 홈페이지 HTML과 JS/CSS 자산을 함께 검증한다. SEO 템플릿은 공개 도메인이 아니라 현재 배포의 로컬 웹 서비스를 읽는다.