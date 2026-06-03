---
name: Geonseolup Firestore 읽기 쿼터 소진
description: 예약 발행 중단·429의 근본 원인(클라 스케줄러가 모든 방문자에서 실행)과 읽기 절감 원칙
---

# 증상
- 운영 서버 스케줄러가 매 60초 `runQuery`에서 **429 RESOURCE_EXHAUSTED** → 예약 목록을 못 읽어 `published=0`. 예약 시간이 지나도 발행 안 됨.
- REST 직접 조회도 429 → 수동 발행(쓰기)조차 대상 ID를 못 읽어 불가.

# 근본 원인
무료(Spark) Firestore **일일 읽기 50,000회** 한도 소진. 최대 소비처:
- **클라이언트 예약 스케줄러(`useReservationScheduler`)가 모든 방문자 브라우저에서 실행**됐음 — 방문자마다 ① 전체 jobs 컬렉션 `onSnapshot` 실시간 구독 + ② 60초마다 `getDocs` 전체 조회. 방문자 N명 × 매분 전체조회 = 읽기 폭증.
- 홈 화면 실시간 구독(제품 핵심 기능)도 방문자마다 읽기 발생.

# 해결 / 원칙
- 예약 발행은 **서버 스케줄러(api-server)가 상시 처리**(로그상 60초 간격 지속 실행 확인). 클라이언트 스케줄러는 **관리자 로그인 세션(`localStorage cj_admin_auth`)에서만** 보조 실행하도록 게이트 → 일반 방문자 쪽 구독+폴링 제거.
- **원칙:** 모든 방문자 브라우저에서 도는 폴링/전체 컬렉션 구독을 추가하지 말 것. 전역 백그라운드 작업(발행/정리 등)은 서버 또는 관리자 세션 한정으로만.
- 쿼터 소진 시 리셋은 **태평양 표준시 자정 기준**(KST 대략 오후 4~5시). 리셋 후 서버 스케줄러가 밀린 예약을 자동 발행.
- 디버깅 시 전체 컬렉션 반복 조회 금지(429 윈도우만 늘림). 최소 조회 + 쓰기 위주로.

# 공개 화면 서버 캐시 전환 (적용됨)
- **공개 화면(홈 목록·상세)은 더 이상 Firestore를 직접 읽지 않는다.** api-server가 `/api/jobs`, `/api/jobs/:id`를 제공하고, 서버가 일정 주기로 한 번만 읽어 캐시해 모든 방문자가 공유 → 읽기 상한이 "방문자 수"가 아니라 "캐시 갱신 횟수"로 고정.
- **읽기 예산 공식:** 하루 읽기 ≈ (갱신 횟수/일) × LIMIT. 무료 50k 안에 들도록 TTL을 보수적으로(기본 5분) 잡음. LIMIT 기본 200. env로 조정(`JOBS_CACHE_TTL_MS`, `JOBS_CACHE_LIMIT`).
- **429 등 갱신 실패 시:** 오래된 캐시를 stale로 반환하고, `FAIL_COOLDOWN_MS`(기본 60s) 동안 재시도 억제 → 소진 윈도우를 매 요청 재시도로 연장하지 않음. 동시 요청은 in-flight dedup.
- **상세 딥링크 주의:** 목록 캐시는 최근 LIMIT건만 담으므로, 그 밖의 오래된 공개 공고는 캐시 미스. `/api/jobs/:id`는 캐시 미스 시 **단일 문서 1회 직접 읽기**로 보강해야 false 404를 막는다(목록 읽기 상한엔 영향 없음). 단 쿨다운 중엔 추가 읽기 생략.
- **프런트 폴백:** `fbLoadPublicJobs`/`fbGetPublicJob`는 서버 무응답 시 localStorage 캐시(`cj_public_jobs_cache`) → `localLoadJobs`(샘플) 순으로 폴백. 홈은 onSnapshot 대신 90초 폴링 + window focus 갱신.
- **관리자/스케줄러는 예외:** reserved/failed가 필요하고 저트래픽이라 여전히 Firestore 직접 읽기(`fbLoadJobs/fbGetJob/fbOnJobs`). 공개 캐시로 라우팅하지 말 것.
- **하드 상한 해제는 Blaze 업그레이드뿐**(Firebase Console → ⚙️ → Modify plan). 캐시는 무료 한도 내 운용을 위한 절감책.
