import { useState, useEffect, useRef } from 'react';
import { getToken } from '@/lib/adminAuth';

const inputCls = 'w-full py-2.5 px-3.5 border border-gray-300 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316] focus:ring-2 focus:ring-orange-100 transition-all bg-white';

interface WageRate {
  id: number;
  region: string;
  job: string;
  wage: number;
  note: string;
  weekOf: string;
  createdAt: string;
  updatedAt: string;
}

interface WageForm {
  region: string;
  job: string;
  wage: string;
  note: string;
  weekOf: string;
}

/** 이번주 월요일(YYYY-MM-DD, 로컬 기준) */
function thisMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=일
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function emptyForm(weekOf: string): WageForm {
  return { region: '', job: '', wage: '', note: '', weekOf };
}

async function apiFetch(url: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `요청 실패 (${res.status})`);
  }
  return res.json();
}

export default function AdminWageRates({ showToast }: { showToast: (msg: string) => void }) {
  const currentWeek = thisMonday();
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>(currentWeek);
  const [rows, setRows] = useState<WageRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<WageForm>(emptyForm(currentWeek));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  async function reload(weekOf?: string) {
    setLoading(true);
    try {
      const q = weekOf ? `?weekOf=${weekOf}` : '';
      const data = await apiFetch(`/api/wage-rates${q}`);
      setWeeks(data.weeks ?? []);
      setRows(data.rows ?? []);
      if (data.weekOf) setSelectedWeek(data.weekOf);
    } catch {
      showToast('❌ 시세 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  function setField<K extends keyof WageForm>(key: K, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function startEdit(r: WageRate) {
    setEditingId(r.id);
    setForm({ region: r.region, job: r.job, wage: String(r.wage), note: r.note, weekOf: r.weekOf });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm(selectedWeek || currentWeek));
  }

  async function handleSave() {
    const region = form.region.trim();
    const job = form.job.trim();
    const wage = parseInt(form.wage.replace(/[^0-9]/g, ''), 10);
    const note = form.note.trim();
    const weekOf = form.weekOf;

    if (!region) { showToast('지역을 입력해주세요'); return; }
    if (!job) { showToast('직종을 입력해주세요'); return; }
    if (!wage || wage <= 0) { showToast('일당을 숫자로 입력해주세요'); return; }
    if (!weekOf) { showToast('기준 주를 선택해주세요'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await apiFetch(`/api/wage-rates/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ region, job, wage, note, weekOf }),
        });
        showToast('수정됐습니다');
      } else {
        await apiFetch('/api/wage-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ region, job, wage, note, weekOf }),
        });
        showToast('등록됐습니다');
      }
      cancelEdit();
      await reload(weekOf);
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : ''}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: WageRate) {
    if (!confirm(`"${r.region} · ${r.job}" 항목을 삭제할까요?`)) return;
    try {
      await apiFetch(`/api/wage-rates/${r.id}`, { method: 'DELETE' });
      if (editingId === r.id) cancelEdit();
      showToast('삭제됐습니다');
      await reload(selectedWeek);
    } catch {
      showToast('삭제 실패');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 등록/수정 폼 */}
      <div ref={formRef} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-extrabold text-gray-700 mb-4 border-b border-gray-100 pb-3">
          {editingId ? '일당 시세 수정' : '일당 시세 등록'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">기준 주(월요일) *</label>
            <input type="date" value={form.weekOf} onChange={(e) => setField('weekOf', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">지역 *</label>
            <input type="text" value={form.region} onChange={(e) => setField('region', e.target.value)} placeholder="예: 평택" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">직종 *</label>
            <input type="text" value={form.job} onChange={(e) => setField('job', e.target.value)} placeholder="예: 칸막이 조공" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">일당 (원) *</label>
            <input type="text" inputMode="numeric" value={form.wage} onChange={(e) => setField('wage', e.target.value.replace(/[^0-9]/g, ''))} placeholder="예: 150000" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-gray-600 mb-1">비고</label>
            <input type="text" value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="예: 숙식제공, 3식 포함 등" className={inputCls} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-[#f97316] text-white border-none px-6 py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors disabled:opacity-50 font-[inherit]"
          >
            {saving ? '저장 중...' : editingId ? '수정 저장' : '시세 추가'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="bg-white border-2 border-gray-200 text-gray-500 px-5 py-2 rounded-lg text-sm font-bold cursor-pointer hover:bg-gray-50 font-[inherit]">
              취소
            </button>
          )}
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4 border-b border-gray-100 pb-3">
          <h3 className="text-sm font-extrabold text-gray-700">시세 목록 ({rows.length})</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">기준 주</label>
            <select
              value={selectedWeek}
              onChange={(e) => reload(e.target.value)}
              className="py-1.5 px-2.5 border border-gray-300 rounded-lg text-xs outline-none bg-white font-[inherit]"
            >
              {!weeks.includes(currentWeek) && <option value={currentWeek}>{currentWeek} (신규)</option>}
              {weeks.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">이 주에 등록된 시세가 없습니다. 위에서 추가해보세요.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">지역</th>
                  <th className="py-2 pr-3 font-semibold">직종</th>
                  <th className="py-2 pr-3 font-semibold">일당</th>
                  <th className="py-2 pr-3 font-semibold">비고</th>
                  <th className="py-2 pr-3 font-semibold text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2.5 pr-3 font-semibold text-[#1e3a5f]">{r.region}</td>
                    <td className="py-2.5 pr-3">{r.job}</td>
                    <td className="py-2.5 pr-3 font-bold text-[#f97316]">{r.wage.toLocaleString('ko-KR')}원</td>
                    <td className="py-2.5 pr-3 text-gray-500">{r.note || '-'}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex gap-1.5 justify-end">
                        <button type="button" onClick={() => startEdit(r)} className="bg-white border border-blue-200 text-blue-600 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-blue-50 font-[inherit]">수정</button>
                        <button type="button" onClick={() => handleDelete(r)} className="bg-white border border-red-200 text-red-500 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-red-50 font-[inherit]">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
