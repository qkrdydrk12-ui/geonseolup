// 체류시간·이탈률 추적 — 방문자가 사이트 안에서 페이지를 옮겨다니는 흐름을 기록한다.
// VisitorWidget의 /api/visit(첫 방문 1회만 기록)과 달리, 이건 세션(브라우저 탭 하나) 안의
// "모든" 페이지 이동을 기록해서 어디서 이탈했는지·얼마나 머물렀는지 계산할 수 있게 한다.
import { getToken } from './adminAuth';

const SESSION_KEY = 'geonseolup_pv_session';

// 관리자 자신의 브라우저는 집계하지 않는다 (VisitorWidget과 동일한 판단 기준).
export function isOwnerBrowser(): boolean {
  try {
    if (localStorage.getItem('geonseolup_owner') === '1') return true;
  } catch {
    /* localStorage 사용 불가 시 무시 */
  }
  return !!getToken();
}

// 세션 ID는 sessionStorage에 저장 — 같은 탭 안에서의 페이지 이동은 한 세션으로 묶이고,
// 새 탭/새 방문에서는 새로 생성된다(이게 곧 "이탈률"을 계산하는 세션 경계).
export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '');
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage 사용 불가 시 매 호출 새 세션(정확도는 떨어지지만 에러는 안 남)
    return crypto.randomUUID().replace(/-/g, '');
  }
}

export async function recordPageEnter(path: string): Promise<number | null> {
  try {
    const res = await fetch('/api/page-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getSessionId(), path }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: number };
    return typeof data.id === 'number' ? data.id : null;
  } catch {
    return null;
  }
}

// 페이지를 떠나는 시점(라우트 전환 또는 탭 닫기)에 호출 — sendBeacon은 페이지가 unload되는
// 순간에도 요청이 끊기지 않고 전송되도록 브라우저가 보장해준다.
export function sendPageDuration(id: number | null, enteredAt: number): void {
  if (id == null) return;
  const durationMs = Date.now() - enteredAt;
  if (durationMs <= 0) return;
  try {
    const blob = new Blob([JSON.stringify({ durationMs })], { type: 'application/json' });
    navigator.sendBeacon(`/api/page-view/${id}/duration`, blob);
  } catch {
    /* sendBeacon 미지원 브라우저는 그냥 포기 — 조회 이벤트 자체는 이미 기록됨 */
  }
}
