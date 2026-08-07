---
name: Geonseolup 시간 표기 및 info override 병합
description: 외부 업로드 공고의 KST-as-Z 날짜 버그와 관리자 info override가 이미지를 지우는 병합 문제
---

## 공고 날짜 KST-as-Z 버그
외부(Claude Code) 스크립트가 공고 `date`를 한국시간 벽시계 값에 `Z`를 붙여 저장 → 미래 시각으로 인식되어 목록에서 계속 "방금 전"으로 표시됨.
**Why:** formatDate는 음수 diff를 "방금 전"으로 처리. 2026-08-07에 11건 일괄 교정(-9h, firestoreClient.updateDocument 사용).
**How to apply:** "방금 전이 계속 떠요" 류 제보가 오면 `/api/jobs`에서 미래 시각 공고부터 확인. 근본 원인은 외부 업로드 스크립트 — 사용자가 그쪽에 전달해야 재발 방지.

## info 글 관리자 override가 이미지를 지움
Firestore에 저장되는 관리자 override의 body 블록에는 image 필드가 없어서, 원본과 통째로 병합하면 본문 이미지가 전부 사라짐.
**Why:** 관리자 편집기는 텍스트만 다루고 image 필드를 보존하지 않음.
**How to apply:** infoData.ts의 mergeWithOverride가 블록 수 일치 시 인덱스 기준으로 원본 이미지를 복원. 블록 추가/삭제 편집이 생기면 이 안전장치가 꺼지므로, 근본 해결은 override에 블록 ID/이미지 필드를 보존하는 것.
