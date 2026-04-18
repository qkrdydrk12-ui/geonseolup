import { useState, useEffect, useCallback } from 'react';

const TOTAL_KEY = 'cj_visit_total';
const LOG_KEY = 'cj_visit_log';
const ADMIN_KEY = 'cj_admin_auth';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getStats() {
  const log: string[] = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  const today = todayStr();
  const yesterday = yesterdayStr();
  const week = weekStart();
  return {
    total: Number(localStorage.getItem(TOTAL_KEY) || 0),
    today: log.filter((d) => d === today).length,
    yesterday: log.filter((d) => d === yesterday).length,
    week: log.filter((d) => d >= week).length,
  };
}

function recordVisit() {
  const total = Number(localStorage.getItem(TOTAL_KEY) || 0);
  localStorage.setItem(TOTAL_KEY, String(total + 1));
  const log: string[] = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  log.push(todayStr());
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const trimmed = log.filter((d) => d >= cutoffStr);
  localStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
}

export default function VisitorWidget() {
  const isAdmin = useCallback(() => !!localStorage.getItem(ADMIN_KEY), []);
  const [open, setOpen] = useState(() => isAdmin());
  const [stats, setStats] = useState(getStats);

  useEffect(() => {
    recordVisit();
    setStats(getStats());
  }, []);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === ADMIN_KEY) {
        if (e.newValue) setOpen(true);
        setStats(getStats());
      }
    }
    function onAdminLogin() {
      setOpen(true);
      setStats(getStats());
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('admin-login', onAdminLogin);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('admin-login', onAdminLogin);
    };
  }, []);

  useEffect(() => {
    if (isAdmin()) setOpen(true);
  }, [isAdmin]);

  function resetStats() {
    if (!confirm('방문자 통계를 초기화하시겠습니까?')) return;
    localStorage.removeItem(TOTAL_KEY);
    localStorage.removeItem(LOG_KEY);
    setStats({ total: 0, today: 0, yesterday: 0, week: 0 });
  }

  return (
    <div className="fixed bottom-5 right-5 z-[9000] font-[inherit]">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
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
            <button
              onClick={() => setOpen(false)}
              className="text-white/70 hover:text-white text-lg leading-none cursor-pointer bg-transparent border-none font-bold"
            >
              −
            </button>
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
                <strong className="text-[#f97316] text-base">{row.value}</strong>
              </div>
            ))}
          </div>
          <div className="px-4 pb-3">
            <button
              onClick={resetStats}
              className="w-full text-xs text-gray-400 border border-gray-200 rounded-lg py-1.5 cursor-pointer hover:bg-gray-50 hover:text-gray-600 transition-colors bg-white font-[inherit]"
            >
              🔄 통계 초기화
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
