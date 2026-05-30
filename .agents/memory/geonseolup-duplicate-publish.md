---
name: Geonseolup 예약 발행 중복 (dual publisher race)
description: 예약 공고가 중복으로 게시되던 치명적 버그의 근본 원인과 해결 패턴
---

# 근본 원인
예약(reserved) 공고를 게시하는 **발행 주체가 둘 이상** 존재했다:
1. 클라이언트 `useReservationScheduler`(App.tsx) — 앱이 열린 **모든 브라우저 탭/기기**에서 각각 1분마다 `fbCheckAndPublishReserved` 실행
2. 서버 `scheduler.ts runSchedulerOnce` 인터벌 — 배포가 **autoscale**이라 인스턴스 다중 가능

여러 주체가 동일 reserved 문서를 동시에 게시했고, 결정적으로 `repeatDays>0` 반복예약이 **발행마다 새 reserved 문서를 복제**해서 매 주기 중복이 증식했다.

**Why 두 스케줄러를 둘 다 유지하나:** 클라이언트만 쓰면 아무도 페이지를 안 열면 발행이 멈추고, 서버만 쓰면 autoscale이 0으로 스케일다운될 때 발행이 멈춘다. 둘 다 두되 **발행을 원자적으로** 만들어 중복만 차단하는 것이 안전.

# 해결 패턴 — 원자적 발행(claim)
- **클라이언트**: `fbPublishReservedJob`를 `runTransaction`으로. 트랜잭션 내 재조회 후 `status==='reserved'`일 때만 active 전환, 아니면 null 반환(=경쟁 패배). 반복예약 복제는 claim 성공 시 **트랜잭션 스냅샷 데이터** 기준으로만 생성(caller의 stale job 금지). 호출부는 false면 카운트/로그 건너뜀.
- **서버**: Firestore REST PATCH에 `currentDocument.updateTime` 선조건(낙관적 동시성). `updateDocumentGuarded`가 updateTime 불일치 시 false. updateTime은 `docToObject`가 `_updateTime`으로 노출(runQuery 결과에 포함). 충돌 HTTP 코드는 **409/412/400(FAILED_PRECONDITION)** 모두 처리. updateTime 미확보 시 비원자 발행 대신 **이번 주기 건너뛰고 다음 주기 재시도**.

**How to apply:** 새 발행/상태전이 경로를 추가할 때마다 동일한 원자적 claim을 적용할 것. 비원자 update로 status 전이 + 복제 생성하는 경로를 절대 만들지 말 것.

# 운영 메모
- 기존에 쌓인 중복 데이터는 코드 수정과 별개로 수동 정리 필요(Firestore 직접 삭제 또는 관리자 패널 삭제 버튼).
- Firestore 무료 티어 read 쿼터가 자주 소진됨. 전체 컬렉션 반복 조회(pageSize 큰 루프)를 남발하면 429가 지속되니, 정리 작업은 **최소 조회 + 배치 삭제**로.
