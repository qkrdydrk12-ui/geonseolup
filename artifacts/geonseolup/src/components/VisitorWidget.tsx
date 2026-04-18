import { useState, useEffect, useCallback } from 'react';

const ADMIN_KEY = 'cj_admin_auth';

interface VisitorStats {
  total: number;
  today: number;
  yesterday: number;
  week: number;
}

async function postVisit(): Promise<VisitorStats | null> {
  try {
    const res = await fetch('/api/visit', { method: 'POST' });
    if (!res.ok) return null;
    return await res.json() as VisitorStats;
  } catch {
    return null;
  }
}

async function fetchStats(): Promise<VisitorStats | null> {
  try {
    const res = await fetch('/api/stats/visitors');
    if (!res.ok) return null;
    return await res.json() as VisitorStats;
  } catch {
    return null;
  }
}

async function resetStats(): Promise<boolean> {
  try {
    const res = await fetch('/api/stats/visitors/reset', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export default function VisitorWidget() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(ADMIN_KEY));
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<VisitorStats>({ total: 0, today: 0, yesterday: 0, week: 0 });
  const [loading, setLoading] = useState(false);

  const refreshStats = useCallback(async () => {
    setLoading(true);
    const s = await fetchStats();
    if (s) setStats(s);
    setLoading(false);
  }, []);

  // 방문 기록 (페이지 최초 로드 시 1회)
  useEffect(() => {
    postVisit().then((s) => {
      if (s) setStats(s);
    });
  }, []);

  // 어드민 로그인 감지
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === ADMIN_KEY) {
        const loggedIn = !!e.newValue;
        setAuthed(loggedIn);
        if (loggedIn) {
          setOpen(true);
          refreshStats();
        } else {
          setOpen(false);
        }
      }
    }
    function onAdminLogin() {
      setAuthed(true);
      setOpen(true);
      refreshStats();
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('admin-login', onAdminLogin);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('admin-login', onAdminLogin);
    };
  }, [refreshStats]);

  useEffect(() => {
    if (authed) {
      setOpen(true);
      refreshStats();
    }
  }, [authed, refreshStats]);

  async function handleReset() {
    if (!confirm('방문자 통계를 초기화하시겠습니까?\n(오늘 및 누적 통계가 0으로 초기화됩니다)')) return;
    const ok = await resetStats();
    if (ok) {
      setStats({ total: 0, today: 0, yesterday: 0, week: 0 });
    } else {
      alert('초기화에 실패했습니다.');
    }
  }

  if (!authed) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9000] font-[inherit]">
      {!open ? (
        <button
          onClick={() => { setOpen(true); refreshStats(); }}
          className="flex items-center gap-2 bg-[#1e3a5f] text-white px-4 py-2.5 rounded-2xl shadow-lg text-sm font-bold cursor-pointer hover:bg-[#2d5282] transition-colors border-none"
        >
          📊 방문자 통계
        </button>
      ) : (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-[220px] overflow-hidden">
          <div className="flex items-center justify-between bg-[#1e3a5f] px-4 py-2.5">
            <span className="text-white text-sm font-bold flex items-center gap-1.5">
              📊 방문자 통계
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshStats}
                disabled={loading}
                title="새로고침"
                className="text-white/70 hover:text-white text-sm cursor-pointer bg-transparent border-none"
              >
                {loading ? '⌛' : '🔄'}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-white/70 hover:text-white text-lg leading-none cursor-pointer bg-transparent border-none font-bold"
              >
                −
              </button>
            </div>
          </div>
          <div className="px-4 py-3 grid gap-2">
            {[
              { icon: '👥', label: '누적 방문', value: stats.total },
              { icon: '📅', label: '오늘', value: stats.today },
              { icon: '📅', label: '어제', value: stats.yesterday },
              { icon: '📅', label: '이번 주', value: stats.week },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center gap-1.5">
                  <span>{row.icon}</span> {row.label}
                </span>
                <strong className="text-[#f97316] text-base">
                  {loading ? '…' : row.value.toLocaleString()}
                </strong>
              </div>
            ))}
          </div>
          <div className="px-4 pb-3">
            <button
              onClick={handleReset}
              className="w-full text-xs text-gray-400 border border-gray-200 rounded-lg py-1.5 cursor-pointer hover:bg-gray-50 hover:text-gray-600 transition-colors bg-white font-[inherit]"
            >
              🗑️ 통계 초기화
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
