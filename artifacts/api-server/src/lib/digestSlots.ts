// 구독 알림(푸시·이메일) 공통 발송 시간표 — 한국시간(KST) 기준 하루 3회.
// 새 공고는 즉시 발송하지 않고 큐에 모았다가, 아래 시각에 취합해서 1건으로 발송한다.
//   오전 6:00  — TBM(오전 7시) 전 당일 급구 확인 시간
//   오전 11:30 — 점심 시간
//   저녁 19:00 — 다음날 일자리 찾는 시간
export const DIGEST_SLOTS_KST: { h: number; m: number }[] = [
  { h: 6, m: 0 },
  { h: 11, m: 30 },
  { h: 19, m: 0 },
];

const KST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 24 * 3600_000;

// 다음 발송 시각까지 남은 밀리초를 계산한다.
export function msUntilNextSlot(now: number = Date.now()): number {
  const kst = now + KST_OFFSET_MS;
  const dayStart = Math.floor(kst / DAY_MS) * DAY_MS; // KST 자정
  let best = Infinity;
  for (const s of DIGEST_SLOTS_KST) {
    let t = dayStart + (s.h * 60 + s.m) * 60_000;
    if (t <= kst) t += DAY_MS; // 이미 지난 시각이면 내일
    if (t < best) best = t;
  }
  return best - kst;
}

// 발송 시각마다 fn을 실행하는 타이머 체인을 시작한다 (중복 시작 방지는 호출측 책임).
export function scheduleAtSlots(fn: () => void): void {
  const arm = () => {
    setTimeout(() => {
      try {
        fn();
      } finally {
        arm();
      }
      // +1초 여유: 타이머 오차로 같은 슬롯이 두 번 잡히는 것 방지
    }, msUntilNextSlot() + 1000);
  };
  arm();
}
