import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { fbGetSetting } from '@/lib/firebase';
import { DEFAULT_ROUTES, type ShuttleCompanyGroup, type ShuttleRoute } from '@/lib/shuttleSchedulePyeongtaekSamsung';

const BLUE = '#1428A0';
const BLUE_DARK = '#0E1D70';

function loadCache(): ShuttleCompanyGroup[] {
  try {
    const raw = localStorage.getItem('cj_shuttle_schedule_pyeongtaek_samsung');
    if (!raw) return DEFAULT_ROUTES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ROUTES;
  } catch {
    return DEFAULT_ROUTES;
  }
}

function RouteCard({ route }: { route: ShuttleRoute }) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const [day, setDay] = useState<'weekday' | 'weekend'>('weekday');
  const [copied, setCopied] = useState(false);

  const hasWeekend = route.weekendCommuteIn.length > 0 || route.weekendCommuteOut.length > 0;
  const times = day === 'weekday'
    ? (dir === 'in' ? route.commuteIn : route.commuteOut)
    : (dir === 'in' ? route.weekendCommuteIn : route.weekendCommuteOut);

  function handleCopyAddress(e: React.MouseEvent, address: string | null) {
    e.stopPropagation();
    if (!address) return;
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white transition-shadow" style={open ? { boxShadow: '0 4px 20px rgba(20,40,160,0.08)' } : undefined}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="shrink-0 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md" style={{ background: '#eef0fb', color: BLUE }}>
              {route.routeNumber}번
            </span>
            <p className="font-extrabold text-[15px] text-gray-900 truncate">{route.name}</p>
            {route.isExpress && (
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">직행</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-[11px] text-gray-400 truncate">{route.origin.name} → {route.destination.name}</p>
          </div>
        </div>
        <span
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs transition-transform duration-200"
          style={{ background: open ? BLUE : '#f3f4f6', color: open ? '#fff' : '#9ca3af', transform: open ? 'rotate(180deg)' : undefined }}
        >
          ▼
        </span>
      </div>

      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* 경로 상세 */}
          <div className="mb-4 space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: BLUE }}>출</span>
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <p className="text-[12px] text-gray-700 truncate">{route.origin.name}</p>
                {route.origin.address && (
                  <button type="button" onClick={(e) => handleCopyAddress(e, route.origin.address)} className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md border text-gray-400 border-gray-200 hover:text-gray-600 cursor-pointer">복사</button>
                )}
              </div>
            </div>
            {route.stops.map((s, i) => (
              <div key={`${s.name}-${i}`} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center text-[9px] text-gray-300">·</span>
                <p className="text-[12px] text-gray-400 truncate">{s.name}</p>
              </div>
            ))}
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: BLUE_DARK }}>도</span>
              <p className="text-[12px] text-gray-700 truncate">{route.destination.name}</p>
            </div>
          </div>

          {route.contractor && (
            <p className="text-[11px] text-gray-400 mb-3">운영: {route.contractor}</p>
          )}

          {hasWeekend && (
            <div className="flex gap-2 mb-2.5">
              <button
                type="button"
                onClick={() => setDay('weekday')}
                className="flex-1 py-1.5 rounded-lg text-[12px] font-bold border-[1.5px] transition-colors cursor-pointer"
                style={day === 'weekday' ? { background: '#eef0fb', borderColor: BLUE, color: BLUE } : { background: '#fff', borderColor: '#e5e7eb', color: '#9ca3af' }}
              >
                평일
              </button>
              <button
                type="button"
                onClick={() => setDay('weekend')}
                className="flex-1 py-1.5 rounded-lg text-[12px] font-bold border-[1.5px] transition-colors cursor-pointer"
                style={day === 'weekend' ? { background: '#eef0fb', borderColor: BLUE, color: BLUE } : { background: '#fff', borderColor: '#e5e7eb', color: '#9ca3af' }}
              >
                주말
              </button>
            </div>
          )}

          <div className="flex gap-2 mb-3.5">
            <button
              type="button"
              onClick={() => setDir('in')}
              className="flex-1 py-2 rounded-xl text-[13px] font-bold border-[1.5px] transition-colors cursor-pointer"
              style={dir === 'in' ? { background: BLUE, borderColor: BLUE, color: '#fff' } : { background: '#fff', borderColor: '#e5e7eb', color: '#9ca3af' }}
            >
              출근 시간표
            </button>
            <button
              type="button"
              onClick={() => setDir('out')}
              className="flex-1 py-2 rounded-xl text-[13px] font-bold border-[1.5px] transition-colors cursor-pointer"
              style={dir === 'out' ? { background: BLUE, borderColor: BLUE, color: '#fff' } : { background: '#fff', borderColor: '#e5e7eb', color: '#9ca3af' }}
            >
              퇴근 시간표
            </button>
          </div>
          {times.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {times.map((t, i) => (
                <div key={`${t}-${i}`} className="rounded-xl border border-gray-200 py-2.5 text-center bg-gray-50">
                  <p className="font-extrabold text-[14px] text-gray-900 tabular-nums">{t}</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">{dir === 'in' ? '출근' : '퇴근'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-3 text-center">정보가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ShuttleSchedulePyeongtaekSamsung() {
  const [groups, setGroups] = useState<ShuttleCompanyGroup[]>(loadCache);

  useEffect(() => {
    document.title = '평택 삼성 셔틀버스 시간표 — 삼성 기술인 통근버스 노선 20곳 | 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '평택 삼성 셔틀버스(삼성 기술인 통근버스) 노선 20곳 출근·퇴근·주말 시간표를 한눈에. 노선을 눌러서 바로 확인하세요.';

    fbGetSetting('shuttle_schedule_pyeongtaek_samsung').then((v) => {
      if (Array.isArray(v) && v.length > 0) {
        setGroups(v as ShuttleCompanyGroup[]);
        localStorage.setItem('cj_shuttle_schedule_pyeongtaek_samsung', JSON.stringify(v));
      }
    }).catch(() => {});
  }, []);

  const totalRoutes = groups.reduce((n, g) => n + g.routes.length, 0);

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fb' }}>
      <Header />
      <main className="max-w-[820px] mx-auto px-4 py-6 sm:py-8">
        {/* 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
          <Link href="/" className="hover:text-[#f97316] no-underline transition-colors">홈</Link>
          <span>›</span>
          <span className="text-gray-600 font-medium">평택삼성 셔틀시간표</span>
        </div>

        {/* 히어로 배너 */}
        <div className="relative rounded-2xl overflow-hidden mb-6" style={{ aspectRatio: '16/7' }}>
          <img
            src="/images/shuttle-pyeongtaek-samsung-hero.jpg"
            alt="평택 셔틀버스 - 삼성 반도체 현장 통근버스"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(14,29,112,0.25) 0%, ${BLUE_DARK}cc 100%)` }} />
          <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7">
            <h1 className="text-white font-extrabold text-xl sm:text-[28px] leading-tight mb-1.5">
              평택 셔틀버스 시간표<br />삼성 기술인 통근버스
            </h1>
            <p className="text-white/70 text-xs sm:text-sm">노선 {totalRoutes}개 · 출근·퇴근·주말 전체 시간 정리</p>
          </div>
        </div>

        {/* 안내 배지 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-[12px] font-bold px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600">
            평일 · <span style={{ color: BLUE }}>주말 별도 시간표 있음</span>
          </span>
          <span className="text-[12px] font-bold px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-400">
            노선별로 운영사가 다름
          </span>
        </div>

        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          노선을 눌러서 그 자리에서 출근·퇴근 시간표를 바로 확인하세요. 노선에 따라 주말 시간표가 따로 있으니
          평일/주말 탭을 확인하고, 정류장이 여러 곳이면 경유 순서도 같이 참고하세요.
        </p>

        {/* 회사별 그룹 */}
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-3">
                <h2 className="text-[15px] font-extrabold text-gray-900 shrink-0 whitespace-nowrap">{group.title}</h2>
                <span className="text-xs text-gray-400 basis-full sm:basis-auto">노선 {group.routes.length}개</span>
              </div>
              <div className="space-y-2.5">
                {group.routes.map((route) => (
                  <RouteCard key={route.id} route={route} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* 구인 목록 CTA */}
        <div
          className="mt-8 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
          style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
        >
          <div className="text-white flex-1">
            <p className="font-bold text-sm mb-0.5">지금 바로 건설 일자리를 찾아보세요</p>
            <p className="text-xs text-white/70">전국 건설 현장 실시간 구인 정보</p>
          </div>
          <Link
            href="/"
            className="shrink-0 px-4 py-2 rounded-lg text-xs font-extrabold no-underline transition-colors hover:opacity-90"
            style={{ background: '#f97316', color: '#fff' }}
          >
            구인 목록 보기 →
          </Link>
        </div>

        <div className="text-center mt-5">
          <Link href="/info" className="text-sm text-gray-500 hover:text-[#f97316] transition-colors no-underline">
            ← 목록으로 돌아가기
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
