---
name: Geonseolup contact safety net
description: 건설UP 공고 카드 contact(전화번호) 자동보강 안전망은 어디서/언제 적용해야 하는지
---

# 규칙
공고의 `contact` 필드가 빈 문자열일 때 `originalText`에 010 패턴이 있으면 자동 추출하여 보강한다. 이 안전망은 **저장 경로 전부 + 발행 경로 전부**에 중복 적용한다.

**Why:** 사용자가 카카오 원문을 붙여넣을 때 자동 파싱이 contact를 못 잡는 케이스가 잦다(헤더/꼬리/괄호 안 번호 등). 한 곳만 보강하면 다른 경로(예약 vs 즉시, 클라이언트 발행 vs 서버 발행)로 우회되어 "번호없음" 카드가 계속 생긴다. 실제로 클라이언트 저장 안전망만 있던 시점에 `handleReserve`(일반 예약)와 서버 스케줄러 publish 경로가 누락되어 잔여 카드 7개가 contact="" 로 발행됨.

**How to apply:**
- 클라이언트 저장 경로 모두에 적용: `handleAddJob`, `handleReserve`, `handleQuickReserve`, `handleApprovePending`, `Post.tsx fbAddJob`
- 발행(publish) 경로에도 적용: 클라이언트 `fbPublishReservedJob`(firebase.ts) + 서버 `scheduler.ts` publish 직전
- 추출 정규식: `/01[016789][-.\s]*\d{3,4}[-.\s]*\d{4}/` 후 `.replace(/[\s.]/g,'-').replace(/-+/g,'-')` 로 정규화
- 안전망 신규 배포 시 **기존 reserved 상태의 잔여 contact="" 카드는 자동 복구되지 않음** — Firestore REST PATCH로 일괄 복구 필요(원문에서 추출 후 contact 필드만 updateMask로 PATCH)
- 새 저장/발행 경로를 추가할 때마다 동일 안전망을 잊지 말고 복제할 것
