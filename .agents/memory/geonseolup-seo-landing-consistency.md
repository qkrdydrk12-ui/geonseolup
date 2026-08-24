---
name: Geonseolup SEO landing consistency
description: 지역·직종 랜딩의 SSR/SPA 메타 정합성과 빈 결과·API 실패·로컬 캐시 처리 원칙
---

# 규칙

지역·직종 SEO 랜딩은 서버 HTML과 클라이언트 전환 후의 공고 집계, 제목, 설명, canonical, robots가 항상 같은 기준을 사용해야 한다. `noindex,follow`는 서버 API가 **성공적으로 빈 배열을 반환한 실제 0건**에만 적용한다.

**Why:** 클라이언트의 샘플·로컬 캐시 폴백이나 일시적 API 실패를 0건으로 처리하면, 서버가 내려준 `index,follow`가 브라우저에서 `noindex`로 뒤집힌다. 반대로 서버 0건이 오래된 로컬 공고로 되살아나면 빈 필터만 noindex라는 정책이 깨진다.

**How to apply:** SEO 랜딩에서는 샘플·localStorage 폴백을 금지하고 성공 빈 응답과 네트워크 실패를 구분한다. 실패 시 오류 UI만 표시하고 SSR 메타를 덮어쓰지 않는다. 필터 활성 기준·지역/용접 묶음·`전체` 제목 규칙과 운영 canonical 도메인도 서버와 클라이언트에서 함께 변경한다.