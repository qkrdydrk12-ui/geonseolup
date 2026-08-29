import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { fbGetSetting } from '@/lib/firebase';
import { DEFAULT_STOPS, type ShuttleGroup, type ShuttleStop } from '@/lib/shuttleScheduleYonginSK';

const RED = '#EE1C25';
const RED_DARK = '#B3151B';

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

function StopCard({ stop }: { stop: ShuttleStop }) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const [copied, setCopied] = useState(false);
  const times = dir === 'in' ? stop.commuteIn : stop.commuteOut;

  function handleCopyAddress(e: React.MouseEvent) {
    e.stopPropagation();
    if (!stop.address) return;
    navigator.clipboard?.writeText(stop.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white transition-shadow" style={open ? { boxShadow: '0 4px 20px rgba(238,28,37,0.08)' } : undefined}>
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
              <button
                type="button"
                onClick={handleCopyAddress}
                title="주소 복사"
                className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border transition-colors cursor-pointer"
                style={copied ? { background: '#fff1f1', borderColor: RED, color: RED_DARK } : { background: '#fff', borderColor: '#e5e7eb', color: '#9ca3af' }}
              >
                {copied ? '복사됨' : '복사'}
              </button>
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

export default function ShuttleScheduleYonginSK() {
  const [groups, setGroups] = useState<ShuttleGroup[]>(loadCache);

  useEffect(() => {
    document.title = '용인 SK 반도체 현장 통근버스 시간표 — 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '용인 SK 반도체 현장 통근버스 19개 정류장 출근·퇴근 시간표를 한눈에. 픽업 장소별로 눌러서 바로 확인하세요.';

    fbGetSetting('shuttle_schedule_yongin_sk').then((v) => {
      if (Array.isArray(v) && v.length > 0) {
        setGroups(v as ShuttleGroup[]);
        localStorage.setItem('cj_shuttle_schedule_yongin_sk', JSON.stringify(v));
      }
    }).catch(() => {});
  }, []);

  const totalStops = groups.reduce((n, g) => n + g.stops.length, 0);

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
            alt="용인 SK 반도체 현장 통근버스"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,10,15,0.15) 0%, rgba(10,10,15,0.75) 100%)' }} />
          <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7">
            <span className="inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold mb-2.5" style={{ background: RED, color: '#fff' }}>
              🚍 용인SK 셔틀
            </span>
            <h1 className="text-white font-extrabold text-xl sm:text-[28px] leading-tight mb-1.5">
              용인 SK 반도체 현장<br />통근버스 시간표
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
          정류장을 눌러서 그 자리에서 출근·퇴근 시간표를 바로 확인하세요. 현장 바로 앞은 5~10분 간격으로 자주 오지만,
          멀어질수록 하루 몇 대뿐이니 놓치지 않게 미리 확인하는 게 좋습니다.
        </p>

        {/* 정류장 그룹 */}
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="flex items-baseline gap-2 mb-3">
                <h2 className="text-[15px] font-extrabold text-gray-900">{group.title}</h2>
                <span className="text-xs text-gray-400">{group.desc}</span>
              </div>
              <div className="space-y-2.5">
                {group.stops.map((stop) => (
                  <StopCard key={stop.name} stop={stop} />
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
