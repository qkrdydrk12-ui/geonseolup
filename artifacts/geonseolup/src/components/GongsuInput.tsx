import { useEffect, useState } from 'react';

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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <input
        type="text"
        inputMode="numeric"
        value={wage}
        onChange={(e) => setWage(e.target.value)}
        placeholder="오늘 일당 (원)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
      />
      <div className="flex items-center justify-center gap-4 mb-4">
        <button
          onClick={() => setGongsu((v) => Math.max(MIN, round1(v - STEP)))}
          disabled={saving}
          className="w-10 h-10 rounded-full text-lg font-bold text-white disabled:opacity-50"
          style={{ background: '#1e3a5f' }}
        >
          -
        </button>
        <div className="text-2xl font-bold text-[#1e3a5f] w-16 text-center">{gongsu.toFixed(1)}</div>
        <button
          onClick={() => setGongsu((v) => Math.min(MAX, round1(v + STEP)))}
          disabled={saving}
          className="w-10 h-10 rounded-full text-lg font-bold text-white disabled:opacity-50"
          style={{ background: '#1e3a5f' }}
        >
          +
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => submit(gongsu.toFixed(1))}
          disabled={saving}
          className="py-3 rounded-lg font-semibold text-sm text-white disabled:opacity-50"
          style={{ background: '#f97316' }}
        >
          기록하기
        </button>
        <button
          onClick={() => submit('absent')}
          disabled={saving}
          className="py-3 rounded-lg font-semibold text-sm text-white disabled:opacity-50"
          style={{ background: '#9ca3af' }}
        >
          결근
        </button>
      </div>
      <div className="mt-4 text-sm text-gray-600 min-h-[20px]">
        {loading ? null : todayRecords.length === 0 ? (
          <span className="text-gray-400">오늘 기록 없음</span>
        ) : (
          <span className="text-[#1e3a5f]">✓ 오늘 기록됨</span>
        )}
      </div>
    </div>
  );
}
