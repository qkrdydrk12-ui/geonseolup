import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";

interface WorkRecord {
  id: number;
  work_date: string;
  gongsu_type: string;
  daily_wage: number | null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function GongsuCalendar({
  refreshKey,
  onChanged,
}: {
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDate, setEditDate] = useState<string | null>(null);
  const [editGongsu, setEditGongsu] = useState("1");
  const [editWage, setEditWage] = useState("");
  const [saving, setSaving] = useState(false);

  function reloadMonth() {
    const from = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${pad(month)}-${pad(lastDay)}`;
    return fetch(`/api/work-records?from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((data) => setRecords(data.records ?? []));
  }

  useEffect(() => {
    setLoading(true);
    reloadMonth().finally(() => setLoading(false));
  }, [year, month, refreshKey]);

  const recordsByDate = useMemo(() => {
    const map = new Map<string, WorkRecord[]>();
    for (const r of records) {
      const list = map.get(r.work_date) ?? [];
      list.push(r);
      map.set(r.work_date, list);
    }
    return map;
  }, [records]);

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function prevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  }
  function nextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  }

  return (
    <div className="bg-white rounded-3xl shadow-[0_4px_24px_-6px_rgba(30,58,95,0.15)] p-4 sm:p-6 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
          <CalendarDays className="w-4 h-4 text-[#1e3a5f]" />
        </div>
        <h2 className="font-bold text-[#1e3a5f]">근무 캘린더</h2>
      </div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
        >
          ‹
        </button>
        <div className="font-bold text-[#1e3a5f]">
          {year}년 {month}월
        </div>
        <button
          onClick={nextMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 font-semibold mb-2">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dateStr = `${year}-${pad(month)}-${pad(d)}`;
          const dayRecords = recordsByDate.get(dateStr) ?? [];
          const isAbsent = dayRecords.some((r) => r.gongsu_type === "absent");
          const dayTotal = dayRecords.reduce((sum, r) => {
            if (r.gongsu_type === "absent") return sum;
            const wage = r.daily_wage ?? 0;
            return sum + wage * Number(r.gongsu_type);
          }, 0);
          return (
            <div
              key={i}
              onClick={() => {
                const rec = dayRecords[0];
                setEditDate(dateStr);
                setEditGongsu(rec ? rec.gongsu_type : "1");
                setEditWage(
                  rec && rec.daily_wage != null ? String(rec.daily_wage) : "",
                );
              }}
              className="aspect-square rounded-xl p-1 flex flex-col items-center justify-center hover:bg-gray-50 transition cursor-pointer"
            >
              <div className="text-xs text-gray-500">{d}</div>
              {isAbsent && (
                <div className="text-[9px] sm:text-[10px] font-bold mt-0.5 leading-none text-gray-400">
                  결근
                </div>
              )}
              {!isAbsent && dayTotal > 0 && (
                <div
                  className="text-[9px] sm:text-[10px] font-bold mt-0.5 leading-none"
                  style={{ color: "#f97316" }}
                >
                  {dayTotal >= 10000
                    ? `${Math.round(dayTotal / 1000) / 10}만`
                    : dayTotal.toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {editDate && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-[#1e3a5f]">
              {editDate.slice(5)} 기록 수정
            </div>
            <button
              onClick={() => setEditDate(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              닫기
            </button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setEditGongsu("absent")}
              className="flex-1 py-2 rounded-lg text-xs font-bold border"
              style={
                editGongsu === "absent"
                  ? {
                      background: "#1e3a5f",
                      color: "#fff",
                      borderColor: "#1e3a5f",
                    }
                  : {
                      background: "#fff",
                      color: "#64748b",
                      borderColor: "#e2e8f0",
                    }
              }
            >
              결근
            </button>
            <button
              onClick={() => setEditGongsu("1")}
              className="flex-1 py-2 rounded-lg text-xs font-bold border"
              style={
                editGongsu !== "absent"
                  ? {
                      background: "#f97316",
                      color: "#fff",
                      borderColor: "#f97316",
                    }
                  : {
                      background: "#fff",
                      color: "#64748b",
                      borderColor: "#e2e8f0",
                    }
              }
            >
              출근
            </button>
          </div>
          {editGongsu !== "absent" && (
            <input
              type="text"
              inputMode="decimal"
              value={editGongsu}
              onChange={(e) => setEditGongsu(e.target.value)}
              placeholder="공수 (예: 1.0)"
              className="w-full mb-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white outline-none focus:border-[#1e3a5f]"
            />
          )}
          <input
            type="text"
            inputMode="numeric"
            value={editWage}
            onChange={(e) => setEditWage(e.target.value)}
            placeholder="일당(원)"
            className="w-full mb-3 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white outline-none focus:border-[#1e3a5f]"
          />
          <div className="flex gap-2">
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const rec = recordsByDate.get(editDate)?.[0];
                  const wageNum = Number(editWage);
                  if (rec) {
                    await fetch(`/api/work-records/${rec.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        gongsuType: editGongsu,
                        ...(wageNum > 0 ? { dailyWage: wageNum } : {}),
                      }),
                    });
                  } else {
                    await fetch("/api/work-records", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        workDate: editDate,
                        gongsuType: editGongsu,
                        ...(wageNum > 0 ? { dailyWage: wageNum } : {}),
                      }),
                    });
                  }
                  setEditDate(null);
                  await reloadMonth();
                  onChanged?.();
                } finally {
                  setSaving(false);
                }
              }}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "#f97316" }}
            >
              저장
            </button>
            {recordsByDate.get(editDate)?.[0] && (
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const rec = recordsByDate.get(editDate)?.[0];
                    if (rec)
                      await fetch(`/api/work-records/${rec.id}`, {
                        method: "DELETE",
                      });
                    setEditDate(null);
                    await reloadMonth();
                    onChanged?.();
                  } finally {
                    setSaving(false);
                  }
                }}
                className="px-4 py-2.5 rounded-lg text-sm font-bold text-red-500 bg-red-50 disabled:opacity-50"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      )}
      {loading && (
        <div className="text-center text-gray-300 text-xs mt-2">
          불러오는 중...
        </div>
      )}
    </div>
  );
}
