import { Switch, Route, Router as WouterRouter } from 'wouter';
import Header from '@/components/Header';
import Home from '@/pages/Home';
import Detail from '@/pages/Detail';
import Post from '@/pages/Post';
import Admin from '@/pages/Admin';
import VisitorWidget from '@/components/VisitorWidget';

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
      </Route>
      <Route path="/detail/:id">
        {(params) => (
          <>
            <DetailHeader />
            <Detail id={params.id} />
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
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Router />
      <VisitorWidget />
    </WouterRouter>
  );
}

export default App;
