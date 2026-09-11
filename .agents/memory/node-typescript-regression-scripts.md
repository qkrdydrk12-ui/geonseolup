---
name: Node TypeScript regression scripts
description: geonseolup에서 의존성 없는 TypeScript 회귀 스크립트를 실행하는 환경 제약
---

`tsx`는 잠금 파일에 간접 의존성으로 남아 있어도 작업공간 실행 파일로 사용할 수 없을 수 있다. 외부 패키지가 필요 없는 `.test.ts` 스크립트는 `node --experimental-strip-types`로 실행하고, 테스트 안의 상대 모듈 경로에는 `.ts` 확장자를 명시한다.

**Why:** 기본 Node ESM 해석은 확장자 없는 TypeScript 상대 경로를 찾지 못하고, `pnpm exec tsx`도 실행 파일이 없으면 실패한다.

**How to apply:** 새 테스트 도구를 설치하지 않아야 하는 작은 순수 함수 회귀 검사는 Node 내장 `assert`와 위 실행 방식을 우선 사용한다. 브라우저 별칭이나 외부 모듈이 필요한 테스트는 별도의 기존 테스트 도구를 먼저 확인한다.