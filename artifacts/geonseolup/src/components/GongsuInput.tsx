import { useEffect, useState } from 'react';
import { HardHat } from 'lucide-react';

interface TodayRecord {
  id: number;
  gongsu_type: string;
}

const STEP = 0.1;
const MIN = 0.1;
const MAX = 3;

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export default function GongsuInput({ onSaved }: { onSaved?: () => void }) {
  const [wage, setWage] = useState('');
  const [gongsu, setGongsu] = useState(1);
  const [saving, setSaving] = useState(false);
  const [todayRecords, setTodayRecords] = useState<TodayRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadToday() {
    const t = todayStr();
    const res = await fetch(`/api/work-records?from=${t}&to=${t}`);
    const data = await res.json();
    setTodayRecords(data.records ?? []);
    setLoading(false);
  }

  async function loadLastWage() {
    const res = await fetch('/api/work-records/last-wage');
    const data = await res.json();
    if (data.dailyWage != null) {
      setWage(String(data.dailyWage));
    }
  }

  useEffect(() => {
    loadToday();
    loadLastWage();
  }, []);

  async function submit(gongsuType: string) {
    setSaving(true);
    try {
      const dailyWage = Number(wage);
      const res = await fetch('/api/work-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDate: todayStr(),
          gongsuType,
          ...(dailyWage > 0 ? { dailyWage } : {}),
        }),
      });
      if (res.ok) {
        setGongsu(1);
        await loadToday();
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-3xl shadow-[0_4px_24px_-6px_rgba(30,58,95,0.15)] p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
          <HardHat className="w-4 h-4 text-[#1e3a5f]" />
        </div>
        <h2 className="font-bold text-[#1e3a5f]">오늘 출근 기록</h2>
      </div>
      <input
        type="text"
        inputMode="numeric"
        value={wage}
        onChange={(e) => setWage(e.target.value)}
        placeholder="오늘 일당 (원)"
        className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-3 text-sm mb-5 outline-none transition-all focus:bg-white focus:border-[#1e3a5f] focus:ring-4 focus:ring-[#1e3a5f]/10"
      />
      <div className="flex items-center justify-center gap-5 mb-5">
        <button
          onClick={() => setGongsu((v) => Math.max(MIN, round1(v - STEP)))}
          disabled={saving}
          className="w-11 h-11 rounded-full text-lg font-bold text-white shadow-md shadow-[#1e3a5f]/25 active:scale-95 transition disabled:opacity-50"
          style={{ background: '#1e3a5f' }}
        >
          -
        </button>
        <div className="text-3xl font-black text-[#1e3a5f] w-16 text-center tabular-nums">{gongsu.toFixed(1)}</div>
        <button
          onClick={() => setGongsu((v) => Math.min(MAX, round1(v + STEP)))}
          disabled={saving}
          className="w-11 h-11 rounded-full text-lg font-bold text-white shadow-md shadow-[#1e3a5f]/25 active:scale-95 transition disabled:opacity-50"
          style={{ background: '#1e3a5f' }}
        >
          +
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => submit(gongsu.toFixed(1))}
          disabled={saving}
          className="py-3.5 rounded-xl font-bold text-sm text-white shadow-md shadow-orange-500/30 active:scale-[0.98] transition disabled:opacity-50"
          style={{ background: '#f97316' }}
        >
          기록하기
        </button>
        <button
          onClick={() => submit('absent')}
          disabled={saving}
          className="py-3.5 rounded-xl font-bold text-sm text-gray-500 bg-gray-100 active:scale-[0.98] transition disabled:opacity-50"
        >
          결근
        </button>
      </div>
      <div className="mt-4 text-sm text-gray-500 min-h-[20px] text-center">
        {loading ? null : todayRecords.length === 0 ? (
          <span className="text-gray-400">오늘 기록 없음</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#1e3a5f]">
            <span className="w-4 h-4 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center text-[10px]">✓</span>
            오늘 기록됨
          </span>
        )}
      </div>
    </div>
  );
}
