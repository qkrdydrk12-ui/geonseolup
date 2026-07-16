---
name: parseJob 파싱 회귀 테스트 방법
description: 건설UP 자동파싱(parseJob.ts) 버그 리포트를 빠르게 재현·검증하는 방법
---
User reports parse bugs by pasting the raw job-post text. Fastest verification: copy `src/lib/parseJob.ts` to /tmp with the `@/lib/firebase` import replaced by `type Job = any;` and `@/lib/utils` WELD_SUBS inlined, then run a small tsx script calling `parseJobText(text)` and printing salary/lodging/region/candidates.
**Why:** parseJob.ts uses `@/` Vite aliases so it can't run under tsx directly; this stub approach reproduces exact behavior without touching the app.
**How to apply:** whenever the user says "파싱이 X로 나옴" — reproduce first with this harness, fix, re-run before typecheck. Salary misparses usually come from NOISE_PATS gaps (e.g. spaced time "17 :00 ~ 19 : 30" matched as ~19만 until the time regex allowed spaces around the colon).
