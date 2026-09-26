import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { fbGetSetting } from '@/lib/firebase';
import { DEFAULT_ROUTES, type ShuttleCompanyGroup, type ShuttleRoute } from '@/lib/shuttleSchedulePyeongtaekSamsung';

const BLUE = '#1428A0';
const BLUE_DARK = '#0E1D70';
function isPastTime(t: string): boolean {
  const [h, m] = t.split(':').map(Number);
  const now = new Date();
  return h * 60 + m < now.getHours() * 60 + now.getMinutes();
}


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

// 정류장 주소를 복사하는 대신, 실제로 많이 쓰는 네이버지도·카카오맵으로 바로 길찾기 연결
// (2026-08-30 사용자 지시 — "복사하는 이유는 결국 길 찾으려는 거니 지도 링크가 더 낫다").
// lat/lng이 있으면(삼성 셔틀버스 운영사 공식 좌표) 카카오는 좌표로 정확히 핀을 찍는다
// (2026-08-30: 지번 주소만으로는 실제 정류장 위치와 살짝 어긋나는 경우가 있어 좌표로 정밀도 개선).
// ⚠️ 네이버는 좌표 검색 URL(map.naver.com/p/search/{lat},{lng})이 모바일 웹에서 "검색결과가 없습니다"로
// 뜨는 걸 확인함(2026-08-31, 데스크톱에서만 정상 동작) — 그래서 네이버는 좌표 대신, 그 좌표를 역지오코딩해서
// 얻은 정확한 도로명주소(address 필드, 59곳 전부 이 방식으로 갱신됨)로 텍스트 검색한다. 도로명주소 검색은
// 모바일·데스크톱 둘 다 정상 동작하고 좌표만큼 정확한 것까지 실측 확인됨.
function MapLinks({ name, address, lat, lng }: { name: string; address: string; lat?: number; lng?: number }) {
  const hasCoord = typeof lat === 'number' && typeof lng === 'number';
  const naverHref = `https://map.naver.com/v5/search/${encodeURIComponent(address)}`;
  const kakaoHref = hasCoord
    ? `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`
    : `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;
  return (
    <span className="shrink-0 inline-flex items-center gap-1">
      <a
        href={naverHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border text-gray-400 border-gray-200 hover:text-gray-600"
      >
        네이버지도
      </a>
      <a
        href={kakaoHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border text-gray-400 border-gray-200 hover:text-gray-600"
      >
        카카오맵
      </a>
    </span>
  );
}

function RouteCard({ route, expandSignal, highlighted }: { route: ShuttleRoute; expandSignal: { id: string; token: number } | null; highlighted: boolean }) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const [day, setDay] = useState<'weekday' | 'weekend'>('weekday');

  // 검색 결과에서 이 노선이 선택되면(token이 바뀔 때마다) 이미 열려있어도 다시 펼친다.
  useEffect(() => {
    if (expandSignal && expandSignal.id === route.id) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal?.token]);

  const hasWeekend = route.weekendCommuteIn.length > 0 || route.weekendCommuteOut.length > 0;
  const times = day === 'weekday'
    ? (dir === 'in' ? route.commuteIn : route.commuteOut)
    : (dir === 'in' ? route.weekendCommuteIn : route.weekendCommuteOut);

  return (
    <div
      id={`route-${route.id}`}
      className="border rounded-2xl overflow-hidden bg-white transition-all scroll-mt-24"
      style={
        highlighted
          ? { borderColor: BLUE, borderWidth: 2, boxShadow: '0 0 0 4px rgba(20,40,160,0.12)' }
          : open ? { borderColor: '#e5e7eb', boxShadow: '0 4px 20px rgba(20,40,160,0.08)' } : { borderColor: '#e5e7eb' }
      }
    >
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
                {route.origin.address && <MapLinks name={route.origin.name} address={route.origin.address} lat={route.origin.lat} lng={route.origin.lng} />}
              </div>
            </div>
            {route.stops.map((s, i) => (
              <div key={`${s.name}-${i}`} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center text-[9px] text-gray-300">·</span>
                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                  <p className="text-[12px] text-gray-400 truncate">{s.name}</p>
                  {s.address && <MapLinks name={s.name} address={s.address} lat={s.lat} lng={s.lng} />}
                </div>
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
                {times.map((t, i) => {
                  const past = isPastTime(t);
                  return (
                    <div key={`${t}-${i}`} className={`rounded-xl border py-2.5 text-center ${past ? 'border-gray-100 bg-gray-50/60' : 'border-gray-200 bg-gray-50'}`}>
                      <p className={`font-extrabold text-[14px] tabular-nums ${past ? 'text-gray-300' : 'text-gray-900'}`}>{t}</p>
                      <p className={`text-[9px] mt-0.5 ${past ? 'text-gray-300' : 'text-gray-400'}`}>{dir === 'in' ? '출근' : '퇴근'}</p>
                    </div>
                  );
                })}
        </div>
          ) : (
            <p className="text-xs text-gray-400 py-3 text-center">정보가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

// 검색창에서 노선을 선택하면 그 카드로 스크롤 + 자동 펼침(2026-09-25 신설, 사용자 요청).
interface RouteMatch {
  route: ShuttleRoute;
  groupTitle: string;
}

export default function ShuttleSchedulePyeongtaekSamsung() {
  const [groups, setGroups] = useState<ShuttleCompanyGroup[]>(loadCache);
  const [query, setQuery] = useState('');
  const [expandSignal, setExpandSignal] = useState<{ id: string; token: number } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

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

  const q = query.trim().toLowerCase();
  const matches: RouteMatch[] = q
    ? groups.flatMap((g) =>
        g.routes
          .filter(
            (r) =>
              r.name.toLowerCase().includes(q) ||
              r.routeNumber.toLowerCase().includes(q) ||
              r.origin.name.toLowerCase().includes(q) ||
              r.destination.name.toLowerCase().includes(q) ||
              r.stops.some((s) => s.name.toLowerCase().includes(q))
          )
          .map((r) => ({ route: r, groupTitle: g.title }))
      ).slice(0, 8)
    : [];

  function goToRoute(route: ShuttleRoute) {
    setQuery('');
    setHighlightId(route.id);
    setExpandSignal({ id: route.id, token: Date.now() });
    requestAnimationFrame(() => {
      document.getElementById(`route-${route.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    window.setTimeout(() => {
      setHighlightId((cur) => (cur === route.id ? null : cur));
    }, 2400);
  }

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

        {/* 노선 검색 — 2026-09-25 신설. 노선번호·정류장·출발지로 검색하면 바로 그 카드로 이동+펼침 */}
        <div className="relative mb-7">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[15px] pointer-events-none">🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches.length > 0) {
                  e.preventDefault();
                  goToRoute(matches[0].route);
                } else if (e.key === 'Escape') {
                  setQuery('');
                }
              }}
              placeholder="노선번호·정류장·출발지로 검색 (예: 1번, 독곡, 서정리역)"
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 text-[14px] font-medium outline-none transition-colors placeholder:text-gray-400"
              style={{ borderColor: q ? BLUE : '#e5e7eb' }}
            />
          </div>
          {q && (
            <div className="absolute z-20 left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden max-h-80 overflow-y-auto">
              {matches.length > 0 ? (
                matches.map((m) => (
                  <button
                    key={m.route.id}
                    type="button"
                    onClick={() => goToRoute(m.route)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-2.5 cursor-pointer"
                  >
                    <span className="shrink-0 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md" style={{ background: '#eef0fb', color: BLUE }}>
                      {m.route.routeNumber}번
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-gray-900 truncate">{m.route.name}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{m.groupTitle} · {m.route.origin.name} → {m.route.destination.name}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-[13px] text-gray-400">일치하는 노선이 없습니다.</div>
              )}
            </div>
          )}
        </div>

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
                  <RouteCard
                    key={route.id}
                    route={route}
                    expandSignal={expandSignal}
                    highlighted={highlightId === route.id}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* 셔틀버스 이용 전 확인사항 */}
        <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-gray-900">
            평택 기술인 셔틀버스 이용 전 확인사항
          </h2>

          <ol className="mt-4 space-y-4 text-sm leading-6 text-gray-600">
            <li>
              <strong className="block text-gray-900">① 노선 찾는 순서</strong>
              운영사와 승차장을 찾고 도착 게이트가 본인 집결 장소와 맞는지 확인하세요. 노선을 펼친 뒤
              출근·퇴근 방향과 평일·주말 표시를 구분하세요.
            </li>
            <li>
              <strong className="block text-gray-900">② 조출·연장 퇴근편</strong>
              주간 출근편이 있다고 조출이나 연장 후 퇴근편도 있는 것은 아닙니다. 해당 근무일과 근무조에
              이용할 수 있는 차량인지 담당자에게 확인하세요.
            </li>
            <li>
              <strong className="block text-gray-900">③ 탑승 대상과 준비사항</strong>
              이 페이지는 시간표 참고 안내입니다. 탑승 가능 대상, 필요한 확인 절차, 실제 승차 위치는
              소속 업체 또는 현장 담당자에게 확인하세요.
            </li>
          </ol>

          <blockquote className="mt-5 rounded-lg border-l-4 border-[#1428A0] bg-slate-50 px-4 py-3 text-sm leading-6 text-gray-700">
            평택 ○○현장 ○○근무조입니다. ○○정류장에서 탑승 가능한 노선과 출발 시각, 도착 게이트를
            알려주세요. 주말·조출·연장 후 퇴근편과 탑승 시 필요한 확인사항도 부탁드립니다.
          </blockquote>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-500">관련 안내</p>
            <div className="mt-2 flex flex-col items-start gap-2 text-sm">
              <Link
                href="/info/pyeongtaek-godeok-housing-guide"
                className="text-[#1428A0] hover:underline"
              >
                평택 숙소 확인사항 →
              </Link>
              <Link href="/info/guide5" className="text-[#1428A0] hover:underline">
                숙식 제공 조건 체크리스트 →
              </Link>
              <div>
                <Link href="/" className="text-[#1428A0] hover:underline">
                  평택 구인공고 찾아보기 →
                </Link>
                <span className="ml-1 text-xs text-gray-400">홈에서 ‘평택’을 검색하세요.</span>
              </div>
            </div>
          </div>
        </section>

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
