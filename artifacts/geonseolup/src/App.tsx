import { Switch, Route, Router as WouterRouter, useLocation } from 'wouter';
import { useEffect, useRef } from 'react';
import Header from '@/components/Header';
import Home from '@/pages/Home';
import Detail from '@/pages/Detail';
import Post from '@/pages/Post';
import Admin from '@/pages/Admin';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import Contact from '@/pages/Contact';
import Info from '@/pages/Info';
import Toon from '@/pages/Toon';
import ToonDetail from '@/pages/ToonDetail';
import News from '@/pages/News';
import NewsDetail from '@/pages/NewsDetail';
import Shop from '@/pages/Shop';
import InfoDetail from '@/pages/InfoDetail';
import Wages from '@/pages/Wages';
import RetirementFundCalculator from '@/pages/RetirementFundCalculator';
import NetPayCalculator from '@/pages/NetPayCalculator';
import SeverancePayCalculator from '@/pages/SeverancePayCalculator';
import LaborContractGenerator from '@/pages/LaborContractGenerator';
import VisitorWidget from '@/components/VisitorWidget';
import { fbOnJobs, fbCheckAndPublishReserved, type Job } from '@/lib/firebase';

// ── 관리자가 저장한 head 코드를 <head>에 동적으로 주입 ──────────────────────
function injectHeadCode(raw: string) {
  // 이전에 주입된 요소 모두 제거
  document.querySelectorAll('[data-admin-head]').forEach((el) => el.remove());

  const code = raw.trim();
  if (!code) return;

  // DOMParser로 파싱 후 각 노드 처리
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<html><head>${code}</head></html>`, 'text/html');

  for (const node of Array.from(doc.head.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;

    if (el.tagName === 'SCRIPT') {
      // innerHTML로 추가된 script는 실행되지 않으므로 createElement로 새로 생성
      const script = document.createElement('script');
      Array.from(el.attributes).forEach((a) => script.setAttribute(a.name, a.value));
      script.textContent = el.textContent || '';
      script.setAttribute('data-admin-head', '');
      document.head.appendChild(script);
    } else {
      const clone = document.importNode(el, true) as Element;
      clone.setAttribute('data-admin-head', '');
      document.head.appendChild(clone);
    }
  }
}

function useHeadInjection() {
  useEffect(() => {
    function apply() {
      // 1) 범용 head 삽입 코드
      const headCode = localStorage.getItem('cj_head_inject') || '';
      injectHeadCode(headCode);

      // 2) 구글 서치 콘솔 단독 메타 태그 (head 코드에 포함되지 않은 경우 유지)
      const gVerify = localStorage.getItem('cj_google_verify') || '';
      const hasGVerify = document.querySelector('meta[name="google-site-verification"]');
      if (gVerify && !hasGVerify) {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'google-site-verification');
        meta.setAttribute('content', gVerify);
        meta.setAttribute('data-admin-head', '');
        document.head.appendChild(meta);
      }
    }

    apply();
    window.addEventListener('head-inject-updated', apply);
    window.addEventListener('google-verify-updated', apply);
    return () => {
      window.removeEventListener('head-inject-updated', apply);
      window.removeEventListener('google-verify-updated', apply);
    };
  }, []);
}

// ── 예약 공고 자동 발행 스케줄러 ────────────────────────────────────────────
// 전체 앱에서 1개만 실행 (App에 마운트). 1분마다 예약 시간이 지난 공고를 active로 전환.
function useReservationScheduler() {
  const jobsRef = useRef<Job[]>([]);

  useEffect(() => {
    // 예약 발행은 서버 스케줄러(api-server)가 상시 처리한다.
    // 클라이언트 스케줄러는 "관리자 로그인 세션"에서만 보조로 동작 → 일반 방문자
    // 브라우저마다 전체 컬렉션 실시간 구독 + 60초 폴링이 도는 것을 막아 Firestore
    // 읽기 쿼터(무료 일일 50,000회) 소진을 방지. (방문자 N명 × 매분 전체조회 = 쿼터 폭증)
    let isAdmin = false;
    try { isAdmin = !!localStorage.getItem('cj_admin_auth'); } catch { /* localStorage 접근 불가 */ }
    if (!isAdmin) return;

    // Firestore 실시간 구독 → 최신 jobs 항상 보유
    const unsub = fbOnJobs((jobs) => { jobsRef.current = jobs; });

    async function tick() {
      const reserved = jobsRef.current.filter((j) => j.status === 'reserved');
      if (reserved.length === 0) return;
      try {
        const { published, retried } = await fbCheckAndPublishReserved(jobsRef.current);
        if (published > 0) console.log(`[Scheduler] ${published}개 공고 발행 완료`);
        if (retried  > 0) console.log(`[Scheduler] ${retried}개 공고 재시도`);
      } catch (e) {
        console.warn('[Scheduler] 예약 발행 오류:', e);
      }
    }

    // 마운트 즉시 1회 실행 (이미 시간 지난 예약 즉시 처리)
    const initTimer = setTimeout(tick, 3000);
    // 이후 60초마다 반복
    const interval = setInterval(tick, 60000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
      unsub();
    };
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────

function NotFound() {
  // 실제 렌더링에 쓰이는 유일한 404 컴포넌트 (pages/not-found.tsx는 어디서도 import되지
  // 않는 죽은 코드였다 — 2026-08-26 정리, 삭제).
  useEffect(() => {
    document.title = '페이지를 찾을 수 없습니다 — 건설UP';
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>
      <div className="text-center text-gray-500">
        <div className="text-6xl mb-4">😔</div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">페이지를 찾을 수 없습니다</h2>
        <p className="text-sm text-gray-400 mb-4">주소가 잘못되었거나 삭제된 페이지일 수 있습니다.</p>
        <div className="flex items-center justify-center gap-3">
          <a href="/" className="text-white bg-[#f97316] font-bold no-underline px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">홈으로 이동</a>
          <a href="/info" className="text-[#1e3a5f] font-semibold no-underline px-4 py-2 rounded-lg border border-gray-200 hover:border-[#f97316] transition-colors">건설꿀팁 보기</a>
        </div>
      </div>
    </div>
  );
}

// 페이지 이동 시 항상 맨 위부터 보이게 (목록에서 스크롤한 위치가 상세로 넘어가는 것 방지)
function ScrollToTop() {
  const [pathname] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Header />
        <Home />
      </Route>
      <Route path="/detail/:id">
        {(params) => (
          <>
            <DetailHeader />
            <Detail id={params.id} />
          </>
        )}
      </Route>
      <Route path="/jobs/:region/:job">
        {(params) => (
          <>
            <Header />
            <Home
              initialRegion={decodeURIComponent(params.region)}
              initialJob={decodeURIComponent(params.job)}
            />
          </>
        )}
      </Route>
      <Route path="/post">
        <Header />
        <Post />
      </Route>
      <Route path="/admin">
        <Admin />
      </Route>
      <Route path="/shop">
        <Header />
        <Shop />
      </Route>
      <Route path="/info">
        <Info />
      </Route>
      <Route path="/info/:slug">
        {(params) => <InfoDetail slug={params.slug} />}
      </Route>
      <Route path="/toon">
        <Toon />
      </Route>
      <Route path="/toon/:slug">
        {(params) => <ToonDetail slug={params.slug} />}
      </Route>
      <Route path="/news">
        <News />
      </Route>
      <Route path="/news/:slug">
        {(params) => <NewsDetail slug={params.slug} />}
      </Route>
      <Route path="/wages">
        <Wages />
      </Route>
      <Route path="/retirement-fund-calculator">
        <RetirementFundCalculator />
      </Route>
      <Route path="/net-pay-calculator">
        <NetPayCalculator />
      </Route>
      <Route path="/severance-pay-calculator">
        <SeverancePayCalculator />
      </Route>
      <Route path="/labor-contract-template">
        <LaborContractGenerator />
      </Route>
      <Route path="/terms">
        <Terms />
      </Route>
      <Route path="/privacy">
        <Privacy />
      </Route>
      <Route path="/contact">
        <Contact />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function DetailHeader() {
  return (
    <header
      className="sticky top-0 z-[200] text-white shadow-lg"
      style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5282 100%)' }}
    >
      <div className="max-w-[860px] mx-auto px-4 py-[13px] flex items-center gap-3">
        <button
          className="bg-white/15 border border-white/30 text-white px-3.5 py-[7px] rounded-lg text-[13px] font-semibold cursor-pointer hover:bg-white/28 transition-colors font-[inherit] whitespace-nowrap"
          onClick={() => window.history.back()}
        >
          ← 뒤로
        </button>
        <div className="flex-1">
          <a href="/" className="text-base font-bold text-white no-underline">건설UP</a>
        </div>
        <a
          href="/post"
          className="text-xs font-extrabold text-white no-underline px-3 py-1.5 rounded-lg"
          style={{ background: '#f97316' }}
        >
          ✏️ 구인 등록
        </a>
      </div>
    </header>
  );
}

function App() {
  useHeadInjection();
  useReservationScheduler();
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ScrollToTop />
      <Router />
      <VisitorWidget />
    </WouterRouter>
  );
}

export default App;
