import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { fbGetSetting } from '@/lib/firebase';
import { DEFAULT_STOPS, type ShuttleGroup, type ShuttleStop } from '@/lib/shuttleScheduleYonginSK';

const RED = '#EE1C25';
const RED_DARK = '#B3151B';
function isPastTime(t: string): boolean {
  const [h, m] = t.split(':').map(Number);
  const now = new Date();
  return h * 60 + m < now.getHours() * 60 + now.getMinutes();
}


function loadCache(): ShuttleGroup[] {
  try {
    const raw = localStorage.getItem('cj_shuttle_schedule_yongin_sk');
    if (!raw) return DEFAULT_STOPS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_STOPS;
  } catch {
    return DEFAULT_STOPS;
  }
}

// 정류장 주소를 복사하는 대신, 실제로 많이 쓰는 네이버지도·카카오맵으로 바로 길찾기 연결
// (2026-08-30 사용자 지시 — "복사하는 이유는 결국 길 찾으려는 거니 지도 링크가 더 낫다", 평택 페이지와 동일하게 반영).
function MapLinks({ address }: { address: string }) {
  const q = encodeURIComponent(address);
  return (
    <span className="shrink-0 inline-flex items-center gap-1">
      <a
        href={`https://map.naver.com/v5/search/${q}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border text-gray-400 border-gray-200 hover:text-gray-600"
      >
        네이버지도
      </a>
      <a
        href={`https://map.kakao.com/link/search/${q}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border text-gray-400 border-gray-200 hover:text-gray-600"
      >
        카카오맵
      </a>
    </span>
  );
}

function StopCard({ stop, expandSignal, highlighted }: { stop: ShuttleStop; expandSignal: { id: string; token: number } | null; highlighted: boolean }) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const times = dir === 'in' ? stop.commuteIn : stop.commuteOut;

  // 검색 결과에서 이 정류장이 선택되면(token이 바뀔 때마다) 이미 열려있어도 다시 펼친다.
  useEffect(() => {
    if (expandSignal && expandSignal.id === stop.name) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal?.token]);

  return (
    <div
      id={`stop-${encodeURIComponent(stop.name)}`}
      className="border rounded-2xl overflow-hidden bg-white transition-all scroll-mt-24"
      style={
        highlighted
          ? { borderColor: RED, borderWidth: 2, boxShadow: '0 0 0 4px rgba(238,28,37,0.12)' }
          : open ? { borderColor: '#e5e7eb', boxShadow: '0 4px 20px rgba(238,28,37,0.08)' } : { borderColor: '#e5e7eb' }
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
          <p className="font-extrabold text-[15px] text-gray-900 truncate">{stop.name}</p>
          {stop.address && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[11px] text-gray-400 truncate">{stop.address}</p>
              <MapLinks address={stop.address} />
            </div>
          )}
        </div>
        <span
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs transition-transform duration-200"
          style={{ background: open ? RED : '#f3f4f6', color: open ? '#fff' : '#9ca3af', transform: open ? 'rotate(180deg)' : undefined }}
        >
          ▼
        </span>
      </div>

      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-200">
          {stop.destination && (
            <p className="text-[11px] text-gray-400 mb-3">→ {stop.destination}</p>
          )}
          {stop.note && (
            <p className="text-[11px] font-bold mb-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: '#fff1f1', color: RED_DARK }}>
              ⚠ {stop.note}
            </p>
          )}
          <div className="flex gap-2 mb-3.5">
            <button
              type="button"
              onClick={() => setDir('in')}
              className="flex-1 py-2 rounded-xl text-[13px] font-bold border-[1.5px] transition-colors cursor-pointer"
              style={dir === 'in' ? { background: RED, borderColor: RED, color: '#fff' } : { background: '#fff', borderColor: '#e5e7eb', color: '#9ca3af' }}
            >
              출근 시간표
            </button>
            <button
              type="button"
              onClick={() => setDir('out')}
              className="flex-1 py-2 rounded-xl text-[13px] font-bold border-[1.5px] transition-colors cursor-pointer"
              style={dir === 'out' ? { background: RED, borderColor: RED, color: '#fff' } : { background: '#fff', borderColor: '#e5e7eb', color: '#9ca3af' }}
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

// 검색창에서 정류장을 선택하면 그 카드로 스크롤 + 자동 펼침(2026-09-25 신설, 사용자 요청).
interface StopMatch {
  stop: ShuttleStop;
  groupTitle: string;
}

export default function ShuttleScheduleYonginSK() {
  const [groups, setGroups] = useState<ShuttleGroup[]>(loadCache);
  const [query, setQuery] = useState('');
  const [expandSignal, setExpandSignal] = useState<{ id: string; token: number } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    document.title = '용인 셔틀버스 시간표 — SK 반도체 현장 통근버스 정류장 19곳 | 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '용인 셔틀버스(SK 반도체 현장 통근버스) 정류장 19곳 출근·퇴근 시간표를 한눈에. 용인 셔틀버스 시간표, 픽업 장소별로 눌러서 바로 확인하세요.';

    fbGetSetting('shuttle_schedule_yongin_sk').then((v) => {
      if (Array.isArray(v) && v.length > 0) {
        setGroups(v as ShuttleGroup[]);
        localStorage.setItem('cj_shuttle_schedule_yongin_sk', JSON.stringify(v));
      }
    }).catch(() => {});
  }, []);

  const totalStops = groups.reduce((n, g) => n + g.stops.length, 0);

  const q = query.trim().toLowerCase();
  const matches: StopMatch[] = q
    ? groups.flatMap((g) =>
        g.stops
          .filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              (s.destination || '').toLowerCase().includes(q) ||
              (s.address || '').toLowerCase().includes(q)
          )
          .map((s) => ({ stop: s, groupTitle: g.title }))
      ).slice(0, 8)
    : [];

  function goToStop(stop: ShuttleStop) {
    setQuery('');
    setHighlightId(stop.name);
    setExpandSignal({ id: stop.name, token: Date.now() });
    requestAnimationFrame(() => {
      document.getElementById(`stop-${encodeURIComponent(stop.name)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    window.setTimeout(() => {
      setHighlightId((cur) => (cur === stop.name ? null : cur));
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
          <span className="text-gray-600 font-medium">용인SK 셔틀시간표</span>
        </div>

        {/* 히어로 배너 */}
        <div className="relative rounded-2xl overflow-hidden mb-6" style={{ aspectRatio: '16/7' }}>
          <img
            src="/images/shuttle-yongin-sk-hero.jpg"
            alt="용인 셔틀버스 - SK 반도체 현장 통근버스"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,10,15,0.15) 0%, rgba(10,10,15,0.75) 100%)' }} />
          <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7">
            <h1 className="text-white font-extrabold text-xl sm:text-[28px] leading-tight mb-1.5">
              용인 셔틀버스 시간표<br />SK 반도체 현장 통근버스
            </h1>
            <p className="text-white/70 text-xs sm:text-sm">정류장 {totalStops}곳 · 출근·퇴근 전체 시간 정리</p>
          </div>
        </div>

        {/* 안내 배지 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-[12px] font-bold px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600">
            평일(월~금) · <span style={{ color: RED }}>토요일도 동일</span>
          </span>
          <span className="text-[12px] font-bold px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-400">
            일요일 운행 없음
          </span>
        </div>

        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          용인 셔틀버스 정류장을 눌러서 그 자리에서 출근·퇴근 시간표를 바로 확인하세요. 현장 바로 앞은 5~10분 간격으로 자주 오지만,
          멀어질수록 하루 몇 대뿐이니 놓치지 않게 미리 확인하는 게 좋습니다.
        </p>

        {/* 정류장 검색 — 2026-09-25 신설. 정류장명·행선지·주소로 검색하면 바로 그 카드로 이동+펼침 */}
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
                  goToStop(matches[0].stop);
                } else if (e.key === 'Escape') {
                  setQuery('');
                }
              }}
              placeholder="정류장 이름으로 검색 (예: 독성리, 양지, 백암)"
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 text-[14px] font-medium outline-none transition-colors placeholder:text-gray-400"
              style={{ borderColor: q ? RED : '#e5e7eb' }}
            />
          </div>
          {q && (
            <div className="absolute z-20 left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden max-h-80 overflow-y-auto">
              {matches.length > 0 ? (
                matches.map((m) => (
                  <button
                    key={m.stop.name}
                    type="button"
                    onClick={() => goToStop(m.stop)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-2.5 cursor-pointer"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-gray-900 truncate">{m.stop.name}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{m.groupTitle}{m.stop.destination ? ` · → ${m.stop.destination}` : ''}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-[13px] text-gray-400">일치하는 정류장이 없습니다.</div>
              )}
            </div>
          )}
        </div>

        {/* 정류장 그룹 */}
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-3">
                <h2 className="text-[15px] font-extrabold text-gray-900 shrink-0 whitespace-nowrap">{group.title}</h2>
                <span className="text-xs text-gray-400 basis-full sm:basis-auto">{group.desc}</span>
              </div>
              <div className="space-y-2.5">
                {group.stops.map((stop) => (
                  <StopCard
                    key={stop.name}
                    stop={stop}
                    expandSignal={expandSignal}
                    highlighted={highlightId === stop.name}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* 셔틀버스 이용 전 확인사항 */}
        <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-gray-900">
            용인 SK 셔틀버스 이용 전 확인사항
          </h2>

          <ol className="mt-4 space-y-4 text-sm leading-6 text-gray-600">
            <li>
              <strong className="block text-gray-900">① 정류장 찾는 순서</strong>
              위 목록에서 숙소 주변 정류장을 찾고, 정류장을 펼쳐 출근·퇴근 방향의 시간을 확인하세요.
              지도 위치와 실제 승차 위치가 맞는지 담당자에게 확인하세요.
            </li>
            <li>
              <strong className="block text-gray-900">② 출근·퇴근 계획</strong>
              숙소에서 정류장까지 이동, 버스 대기·탑승, 하차 후 집결 장소까지 걸리는 시간을 함께
              고려하세요. 조출·연장·주말 근무일에도 이용 가능한지는 해당 근무조 담당자에게 확인하세요.
            </li>
            <li>
              <strong className="block text-gray-900">③ 탑승 대상과 변경 공지</strong>
              이 페이지는 시간표 참고 안내입니다. 소속 업체별 탑승 가능 여부, 필요한 확인 절차, 운행
              변경 공지는 소속 업체 또는 현장 담당자에게 확인하세요.
            </li>
          </ol>

          <blockquote className="mt-5 rounded-lg border-l-4 border-[#EE1C25] bg-slate-50 px-4 py-3 text-sm leading-6 text-gray-700">
            용인 원삼 ○○현장 ○○근무조입니다. ○○정류장에서 이용 가능한 출근편과 퇴근편, 실제 승차
            위치를 알려주세요. 조출·연장·주말 이용 여부와 탑승 시 필요한 확인사항도 부탁드립니다.
          </blockquote>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-500">관련 안내</p>
            <div className="mt-2 flex flex-col items-start gap-2 text-sm">
              <Link
                href="/info/yongin-wonsam-housing-shortage-tips"
                className="text-[#EE1C25] hover:underline"
              >
                용인 원삼 숙소 확인사항 →
              </Link>
              <Link href="/info/guide5" className="text-[#EE1C25] hover:underline">
                숙식 제공 조건 체크리스트 →
              </Link>
              <div>
                <Link href="/" className="text-[#EE1C25] hover:underline">
                  용인 구인공고 찾아보기 →
                </Link>
                <span className="ml-1 text-xs text-gray-400">
                  홈에서 용인 또는 원삼을 검색하세요.
                </span>
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
