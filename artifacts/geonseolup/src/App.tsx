import { Switch, Route, Router as WouterRouter } from 'wouter';
import { useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Home from '@/pages/Home';
import Detail from '@/pages/Detail';
import Post from '@/pages/Post';
import Admin from '@/pages/Admin';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import Contact from '@/pages/Contact';
import VisitorWidget from '@/components/VisitorWidget';

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

// ─────────────────────────────────────────────────────────────────────────────

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>
      <div className="text-center text-gray-500">
        <div className="text-6xl mb-4">😔</div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">페이지를 찾을 수 없습니다</h2>
        <a href="/" className="text-[#f97316] font-semibold underline">홈으로 이동</a>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Header />
        <Home />
        <Footer />
      </Route>
      <Route path="/detail/:id">
        {(params) => (
          <>
            <DetailHeader />
            <Detail id={params.id} />
            <Footer />
          </>
        )}
      </Route>
      <Route path="/post">
        <Header />
        <Post />
        <Footer />
      </Route>
      <Route path="/admin">
        <Admin />
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
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Router />
      <VisitorWidget />
    </WouterRouter>
  );
}

export default App;
