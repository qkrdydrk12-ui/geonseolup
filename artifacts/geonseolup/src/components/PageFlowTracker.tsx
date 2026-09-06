import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { isOwnerBrowser, recordPageEnter, sendPageDuration } from '@/lib/pageFlowTracking';

// 라우트가 바뀔 때마다(SPA 내부 이동 포함) "이전 페이지 체류시간 마감 → 새 페이지 진입 기록"을
// 반복해서 체류시간·이탈률 통계를 쌓는다. App.tsx 루트에 한 번만 마운트한다.
export default function PageFlowTracker() {
  const [pathname] = useLocation();
  const currentRef = useRef<{ id: number | null; enteredAt: number }>({ id: null, enteredAt: Date.now() });

  useEffect(() => {
    if (isOwnerBrowser()) return;
    const prev = currentRef.current;
    if (prev.id != null) sendPageDuration(prev.id, prev.enteredAt);

    const enteredAt = Date.now();
    currentRef.current = { id: null, enteredAt };
    recordPageEnter(pathname).then((id) => {
      // 응답이 오는 사이 페이지가 또 바뀌었으면(빠른 연속 이동) 이 결과는 버린다.
      if (currentRef.current.enteredAt === enteredAt) currentRef.current.id = id;
    });
  }, [pathname]);

  // 탭을 닫거나 다른 탭으로 전환할 때 마지막 페이지의 체류시간을 마감한다.
  useEffect(() => {
    if (isOwnerBrowser()) return;
    function finalizeCurrent() {
      const cur = currentRef.current;
      sendPageDuration(cur.id, cur.enteredAt);
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') finalizeCurrent();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', finalizeCurrent);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', finalizeCurrent);
    };
  }, []);

  return null;
}
