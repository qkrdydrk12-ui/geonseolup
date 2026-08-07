import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { getToken } from '@/lib/adminAuth';

interface VisitorStats {
  total: number;
  today: number;
  yesterday: number;
  week: number;
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchStats(): Promise<VisitorStats | null> {
  try {
    const res = await fetch('/api/stats/visitors', { headers: authHeaders() });
    if (!res.ok) return null;
    return await res.json() as VisitorStats;
  } catch {
    return null;
  }
}

async function resetStats(): Promise<boolean> {
  try {
    const res = await fetch('/api/stats/visitors/reset', {
      method: 'POST',
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function VisitorWidget() {
  // sessionStorage 토큰 기준으로 관리자 여부 판단
  const [isAdmin, setIsAdmin] = useState(() => !!getToken());
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<VisitorStats>({ total: 0, today: 0, yesterday: 0, week: 0 });
  const [loading, setLoading] = useState(false);

  const refreshStats = useCallback(async () => {
    if (!getToken()) return;
    setLoading(true);
    const s = await fetchStats();
    if (s) setStats(s);
    setLoading(false);
  }, []);

  // 방문 기록 (인증 불필요). 유입 경로(referrer/utm_source)도 함께 보낸다.
  // 관리자(내) 브라우저는 집계에서 제외 — 로그인 토큰이 있으면 기록 자체를 보내지 않는다.
  useEffect(() => {
    if (getToken()) return;
    const utmSource = new URLSearchParams(window.location.search).get('utm_source') ?? undefined;
    fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referrer: document.referrer || undefined, utmSource }),
    }).catch(() => {});
  }, []);

  // 관리자 로그인/로그아웃 이벤트 감지
  useEffect(() => {
    function onAdminLogin() {
      setIsAdmin(true);
      setOpen(true);
      refreshStats();
    }
    function onAdminLogout() {
      setIsAdmin(false);
      setOpen(false);
      setStats({ total: 0, today: 0, yesterday: 0, week: 0 });
    }

    // sessionStorage는 storage 이벤트가 발생하지 않으므로 커스텀 이벤트 사용
    window.addEventListener('admin-login', onAdminLogin);
    window.addEventListener('admin-logout', onAdminLogout);
    return () => {
      window.removeEventListener('admin-login', onAdminLogin);
      window.removeEventListener('admin-logout', onAdminLogout);
    };
  }, [refreshStats]);

  // 관리자 상태가 true로 바뀔 때 통계 불러오기
  useEffect(() => {
    if (isAdmin) refreshStats();
  }, [isAdmin, refreshStats]);

  async function handleReset() {
    if (!confirm('방문자 통계를 초기화하시겠습니까?\n(모든 방문 기록이 삭제됩니다)')) return;
    const ok = await resetStats();
    if (ok) {
      setStats({ total: 0, today: 0, yesterday: 0, week: 0 });
    } else {
      alert('초기화 실패 — 관리자 세션을 확인하세요.');
    }
  }

  // 관리자가 아니면 완전히 숨김
  if (!isAdmin) return null;

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
          <div className="px-4 pb-3 grid gap-1.5">
            <Link
              href="/admin"
              className="w-full text-center text-xs font-bold text-white bg-[#f97316] rounded-lg py-2 no-underline hover:bg-[#ea580c] transition-colors block"
            >
              ⚙️ 관리자 페이지
            </Link>
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
