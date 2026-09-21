import { useEffect, useState } from 'react';
import { calcDailyNetPay, sanitizeWage } from '@/lib/dailyNetPay';
import { calcRegularEmployeeMonthlyNetPay, sanitizeMonthlyWage, sanitizeDependents } from '@/lib/regularEmployeeTax';

interface WorkRecord {
  id: number;
  work_date: string;
  gongsu_type: string;
  daily_wage: number | null;
}

function todayMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export default function GongsuWageSummary({ refreshKey, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const [wageInput, setWageInput] = useState('');
  const [monthlyWageInput, setMonthlyWageInput] = useState('');
  const [dependentsInput, setDependentsInput] = useState('1');
  const [taxMode, setTaxMode] = useState<'daily' | 'regular'>('daily');
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editGongsu, setEditGongsu] = useState('');
  const [editWage, setEditWage] = useState('');
  const [loading, setLoading] = useState(true);

  function loadRecords() {
    const { from, to } = todayMonthRange();
    setLoading(true);
    fetch(`/api/work-records?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => setRecords((data.records ?? []).filter((r: WorkRecord) => r.gongsu_type !== 'absent')))
      .finally(() => setLoading(false));
  }

  function loadTaxSettings() {
    fetch('/api/auth/tax-settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.taxMode === 'regular' || data.taxMode === 'daily') setTaxMode(data.taxMode);
        if (typeof data.dependents === 'number') setDependentsInput(String(data.dependents));
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadRecords();
    loadTaxSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function saveTaxSettings(mode: 'daily' | 'regular', deps: number) {
    await fetch('/api/auth/tax-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxMode: mode, dependents: deps }),
    }).catch(() => {});
  }

  function selectTaxMode(mode: 'daily' | 'regular') {
    setTaxMode(mode);
    saveTaxSettings(mode, sanitizeDependents(dependentsInput));
  }

  function changeDependents(value: string) {
    setDependentsInput(value);
    const deps = sanitizeDependents(value);
    saveTaxSettings(taxMode, deps);
  }

  const wage = sanitizeWage(wageInput);
  const dailyResult = wage > 0 ? calcDailyNetPay({ dailyWage: wage, includePensionHealth: false }) : null;

  const monthlyWage = sanitizeMonthlyWage(monthlyWageInput);
  const dependents = sanitizeDependents(dependentsInput);
  const regularResult =
    monthlyWage > 0 ? calcRegularEmployeeMonthlyNetPay({ monthlyWage, dependents }) : null;

  function startEdit(r: WorkRecord) {
    setEditingId(r.id);
    setEditGongsu(r.gongsu_type);
    setEditWage(r.daily_wage != null ? String(r.daily_wage) : '');
  }

  async function saveEdit(id: number) {
    const wageNum = Number(editWage);
    const res = await fetch(`/api/work-records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gongsuType: editGongsu, ...(wageNum > 0 ? { dailyWage: wageNum } : {}) }),
    });
    if (res.ok) {
      setEditingId(null);
      loadRecords();
      onChanged?.();
    }
  }

  async function deleteRecord(id: number) {
    const res = await fetch(`/api/work-records/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadRecords();
      onChanged?.();
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mt-4">
      <h2 className="font-semibold text-[#1e3a5f] mb-3">실수령액 계산기</h2>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => selectTaxMode('daily')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold border-[1.5px] ${
            taxMode === 'daily' ? 'text-white border-[#1e3a5f] bg-[#1e3a5f]' : 'border-gray-300 text-gray-500 bg-white'
          }`}
        >
          일용직
        </button>
        <button
          type="button"
          onClick={() => selectTaxMode('regular')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold border-[1.5px] ${
            taxMode === 'regular' ? 'text-white border-[#1e3a5f] bg-[#1e3a5f]' : 'border-gray-300 text-gray-500 bg-white'
          }`}
        >
          상용직
        </button>
      </div>

      {taxMode === 'daily' ? (
        <>
          <input
            type="text"
            inputMode="numeric"
            value={wageInput}
            onChange={(e) => setWageInput(e.target.value)}
            placeholder="오늘 일당 (원)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          />
          {dailyResult && (
            <div className="text-sm text-gray-700 space-y-1 mb-4">
              <div className="flex justify-between">
                <span className="text-gray-500">세전 일당</span>
                <span>{dailyResult.dailyWage.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">소득세+지방세</span>
                <span>{(dailyResult.incomeTax + dailyResult.localTax).toLocaleString()}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">고용보험료</span>
                <span>{dailyResult.employmentInsurance.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between font-semibold text-[#1e3a5f] pt-1 border-t border-gray-100">
                <span>실수령액</span>
                <span>{dailyResult.netPay.toLocaleString()}원</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <input
            type="text"
            inputMode="numeric"
            value={monthlyWageInput}
            onChange={(e) => setMonthlyWageInput(e.target.value)}
            placeholder="월 급여액 (원)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
          />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm text-gray-500 shrink-0">부양가족 수(본인 포함)</span>
            <input
              type="text"
              inputMode="numeric"
              value={dependentsInput}
              onChange={(e) => changeDependents(e.target.value)}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
            />
          </div>
          {regularResult && (
            <div className="text-sm text-gray-700 space-y-1 mb-2">
              <div className="flex justify-between">
                <span className="text-gray-500">소득세+지방세</span>
                <span>{(regularResult.incomeTax + regularResult.localTax).toLocaleString()}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">4대보험(국민연금·건강·요양·고용)</span>
                <span>
                  {(
                    regularResult.nationalPension +
                    regularResult.healthInsurance +
                    regularResult.longTermCare +
                    regularResult.employmentInsurance
                  ).toLocaleString()}
                  원
                </span>
              </div>
              <div className="flex justify-between font-semibold text-[#1e3a5f] pt-1 border-t border-gray-100">
                <span>월 실수령액(추정)</span>
                <span>{regularResult.netPay.toLocaleString()}원</span>
              </div>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mb-4">
            * 국세청 근로소득 간이세액표를 근사 계산한 추정치입니다. 실제 원천징수액과 다소 차이 날 수 있습니다.
          </p>
        </>
      )}

      <div className="mt-6 pt-5 border-t border-gray-200">
        <h3 className="text-sm font-bold text-gray-500 mb-3">이번 달 기록 관리</h3>
        {!loading && records.length === 0 && (
          <p className="text-xs text-gray-400">이번 달 기록이 없습니다.</p>
        )}
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 w-16 shrink-0">{r.work_date.slice(5)}</span>
              {editingId === r.id ? (
                <>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editGongsu}
                    onChange={(e) => setEditGongsu(e.target.value)}
                    className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editWage}
                    onChange={(e) => setEditWage(e.target.value)}
                    placeholder="일당(원)"
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900"
                  />
                  <button onClick={() => saveEdit(r.id)} className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: '#f97316' }}>
                    저장
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 text-gray-400">
                    취소
                  </button>
                </>
              ) : (
                <>
                  <span className="text-gray-700 flex-1">
                    {r.gongsu_type}공수{r.daily_wage ? ` · ${r.daily_wage.toLocaleString()}원` : ''}
                  </span>
                  <button onClick={() => startEdit(r)} className="text-xs text-gray-400 hover:text-[#1e3a5f]">
                    ✎
                  </button>
                  <button onClick={() => deleteRecord(r.id)} className="text-xs text-gray-400 hover:text-red-500">
                    🗑
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
