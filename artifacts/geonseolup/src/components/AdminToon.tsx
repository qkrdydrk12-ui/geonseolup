import { useState, useEffect, useRef } from 'react';
import { getToken } from '@/lib/adminAuth';

const inputCls = 'w-full py-2.5 px-3.5 border border-gray-300 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316] focus:ring-2 focus:ring-orange-100 transition-all bg-white';

const DEFAULT_DISCLAIMER = '이 이야기는 반도체 현장 실제 경험을 바탕으로 각색한 풍자 웹툰입니다. 등장인물 이름은 모두 허구입니다.';

interface ToonPanelRow { index: number; caption: string | null; imageUrl: string }

interface ToonEpisode {
  id: number;
  slug: string;
  title: string;
  description: string;
  disclaimer: string;
  episodeNumber: number;
  panelCount: number;
  coverImageUrl: string;
  published: boolean;
  scheduledAt: string | null;
  createdAt: string;
  createdBy?: string | null;
}

interface PanelDraft { imageDataUrl: string | null; existingUrl: string | null; caption: string }

interface EpisodeForm {
  slug: string;
  title: string;
  description: string;
  disclaimer: string;
  episodeNumber: number;
  published: boolean;
  scheduledAt: string;
}

function emptyForm(nextNumber: number): EpisodeForm {
  return { slug: '', title: '', description: '', disclaimer: DEFAULT_DISCLAIMER, episodeNumber: nextNumber, published: true, scheduledAt: '' };
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9가-힣\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
}

async function apiFetch(url: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Uploader': encodeURIComponent('관리자화면'),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `요청 실패 (${res.status})`);
  }
  return res.json();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AdminToon({ showToast }: { showToast: (msg: string) => void }) {
  const [rows, setRows] = useState<ToonEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<EpisodeForm>(emptyForm(1));
  const [panels, setPanels] = useState<PanelDraft[]>([{ imageDataUrl: null, existingUrl: null, caption: '' }]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  async function reload() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/toon/all');
      setRows(data.rows ?? []);
      if (!editingId) {
        const maxNum = (data.rows ?? []).reduce((m: number, r: ToonEpisode) => Math.max(m, r.episodeNumber), 0);
        setForm((prev) => (prev.episodeNumber <= maxNum ? { ...prev, episodeNumber: maxNum + 1 } : prev));
      }
    } catch {
      showToast('❌ 노가다툰 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  function setField<K extends keyof EpisodeForm>(key: K, val: EpisodeForm[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleTitleChange(title: string) {
    setField('title', title);
    if (!slugTouched && !editingId) setField('slug', slugify(title));
  }

  async function handlePanelFile(i: number, file: File | undefined) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setPanels((prev) => prev.map((p, idx) => (idx === i ? { ...p, imageDataUrl: dataUrl } : p)));
  }

  function updateCaption(i: number, caption: string) {
    setPanels((prev) => prev.map((p, idx) => (idx === i ? { ...p, caption } : p)));
  }

  function addPanel() {
    setPanels((prev) => [...prev, { imageDataUrl: null, existingUrl: null, caption: '' }]);
  }

  function removePanel(i: number) {
    setPanels((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function movePanel(i: number, dir: -1 | 1) {
    setPanels((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function startEdit(r: ToonEpisode) {
    setEditingId(r.id);
    setForm({
      slug: r.slug, title: r.title, description: r.description, disclaimer: r.disclaimer || DEFAULT_DISCLAIMER,
      episodeNumber: r.episodeNumber, published: r.published,
      scheduledAt: r.scheduledAt ? new Date(new Date(r.scheduledAt).getTime() + 9 * 3600000).toISOString().slice(0, 16) : '',
    });
    // 패널 목록은 /api/toon/:slug에서 다시 받아온다 (목록 API엔 커버 1장만 있음)
    apiFetch(`/api/toon/${r.slug}`).then((data: { row?: { panels: ToonPanelRow[] } }) => {
      const p = data.row?.panels ?? [];
      setPanels(p.length ? p.map((x) => ({ imageDataUrl: null, existingUrl: x.imageUrl, caption: x.caption ?? '' })) : [{ imageDataUrl: null, existingUrl: null, caption: '' }]);
    }).catch(() => {
      setPanels([{ imageDataUrl: null, existingUrl: null, caption: '' }]);
    });
    setSlugTouched(true);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingId(null);
    const maxNum = rows.reduce((m, r) => Math.max(m, r.episodeNumber), 0);
    setForm(emptyForm(maxNum + 1));
    setPanels([{ imageDataUrl: null, existingUrl: null, caption: '' }]);
    setSlugTouched(false);
  }

  async function handleSave() {
    const title = form.title.trim();
    const description = form.description.trim();
    const slug = form.slug.trim();
    const disclaimer = form.disclaimer.trim() || DEFAULT_DISCLAIMER;

    if (!editingId && !slug) { showToast('slug를 입력해주세요'); return; }
    if (!title) { showToast('제목을 입력해주세요'); return; }
    if (!description) { showToast('설명을 입력해주세요'); return; }

    // 새 이미지가 있는 패널만 서버로 보낸다. 수정 시 이미지를 하나도 안 바꿨으면 패널은 그대로 유지(서버가 비어있으면 기존 유지).
    const allHaveImage = panels.every((p) => p.imageDataUrl || p.existingUrl);
    if (!editingId && !allHaveImage) { showToast('모든 컷에 이미지를 넣어주세요'); return; }

    const anyNewImage = panels.some((p) => p.imageDataUrl);
    if (editingId && anyNewImage && !allHaveImage) { showToast('일부 컷에만 새 이미지를 넣으면 안 됩니다 — 전체 컷을 다시 채워주세요'); return; }

    setSaving(true);
    try {
      const scheduledAtIso = form.scheduledAt ? new Date(`${form.scheduledAt}:00+09:00`).toISOString() : null;
      const payload: Record<string, unknown> = {
        title, description, disclaimer, episodeNumber: form.episodeNumber,
        published: form.published, scheduledAt: scheduledAtIso,
      };
      // 새 이미지가 하나라도 있으면(등록 시엔 항상) 패널 전체를 새로 보낸다 — 서버가 기존 패널을 통째로 교체.
      if (!editingId || anyNewImage) {
        payload.panels = panels.map((p) => ({ imageBase64: p.imageDataUrl || p.existingUrl, caption: p.caption.trim() || undefined }));
      }
      if (editingId) {
        await apiFetch(`/api/toon/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('✅ 수정됐습니다');
      } else {
        payload.slug = slug;
        await apiFetch('/api/toon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('✅ 노가다툰이 게시됐습니다');
      }
      cancelEdit();
      await reload();
    } catch (e) {
      showToast(`❌ 저장 실패: ${e instanceof Error ? e.message : ''}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: ToonEpisode) {
    if (!confirm(`"${r.title}" 화를 삭제할까요?`)) return;
    try {
      await apiFetch(`/api/toon/${r.id}`, { method: 'DELETE' });
      if (editingId === r.id) cancelEdit();
      showToast('🗑 삭제됐습니다');
      await reload();
    } catch {
      showToast('❌ 삭제 실패');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div ref={formRef} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-extrabold text-gray-700 mb-4 border-b border-gray-100 pb-3">
          {editingId ? '노가다툰 수정' : '노가다툰 새 화 등록'}
        </h3>
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3.5">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">제목 *</label>
              <input type="text" value={form.title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="예: 이름이 이슬이라길래 설렜다" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">화 번호</label>
              <input type="number" min={1} value={form.episodeNumber} onChange={(e) => setField('episodeNumber', Number(e.target.value) || 1)} className={`${inputCls} w-24 text-center`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">
              slug (URL, 영문/숫자/하이픈) {editingId && <span className="text-gray-400 font-normal">— 수정 불가</span>}
            </label>
            <input
              type="text"
              value={form.slug}
              disabled={!!editingId}
              onChange={(e) => { setSlugTouched(true); setField('slug', slugify(e.target.value)); }}
              placeholder="예: ep1-name-is-iseul"
              className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">목록에 보일 요약 설명 *</label>
            <input type="text" value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="카드 목록에 짧게 보일 설명" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">하단 안내 문구</label>
            <input type="text" value={form.disclaimer} onChange={(e) => setField('disclaimer', e.target.value)} className={inputCls} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-600">컷 이미지 * (순서대로)</label>
              <button type="button" onClick={addPanel} className="text-xs font-bold text-[#f97316] cursor-pointer bg-transparent border-none">+ 컷 추가</button>
            </div>
            <div className="flex flex-col gap-2.5">
              {panels.map((p, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 flex gap-3 items-start">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center mt-1">{i + 1}</span>
                  <div className="flex-1 flex flex-col gap-2">
                    <input type="file" accept="image/*" onChange={(e) => handlePanelFile(i, e.target.files?.[0])} className={inputCls} />
                    <input
                      type="text"
                      value={p.caption}
                      onChange={(e) => updateCaption(i, e.target.value)}
                      placeholder="캡션 (선택 — 이미지 안에 이미 자막이 있으면 비워두세요)"
                      className={`${inputCls} text-xs`}
                    />
                  </div>
                  {(p.imageDataUrl || p.existingUrl) && (
                    <img src={p.imageDataUrl || p.existingUrl || ''} alt="" className="w-16 aspect-[4/5] object-cover rounded-md border border-gray-200 shrink-0" />
                  )}
                  <div className="flex flex-col gap-1 shrink-0">
                    <button type="button" onClick={() => movePanel(i, -1)} disabled={i === 0} className="text-gray-400 text-xs disabled:opacity-30 bg-transparent border-none cursor-pointer">↑</button>
                    <button type="button" onClick={() => movePanel(i, 1)} disabled={i === panels.length - 1} className="text-gray-400 text-xs disabled:opacity-30 bg-transparent border-none cursor-pointer">↓</button>
                    {panels.length > 1 && (
                      <button type="button" onClick={() => removePanel(i)} className="text-red-400 text-xs font-bold cursor-pointer bg-transparent border-none">삭제</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">수정 시 이미지를 하나라도 새로 바꾸면 전체 컷 순서가 지금 화면 그대로 다시 저장됩니다.</p>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <input type="checkbox" checked={form.published} onChange={(e) => setField('published', e.target.checked)} />
            바로 공개 (해제하면 비공개 초안으로 저장)
          </label>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">예약 발행 시각 (비워두면 즉시 공개)</label>
            <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setField('scheduledAt', e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={handleSave} disabled={saving} className="bg-[#f97316] text-white border-none px-6 py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors disabled:opacity-50 font-[inherit]">
            {saving ? '저장 중...' : editingId ? '수정 저장' : '게시하기'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="bg-white border-2 border-gray-200 text-gray-500 px-5 py-2 rounded-lg text-sm font-bold cursor-pointer hover:bg-gray-50 font-[inherit]">취소</button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-extrabold text-gray-700 mb-4 border-b border-gray-100 pb-3">전체 화 ({rows.length})</h3>
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">등록된 화가 없습니다. 위에서 작성해보세요.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.id} className="flex gap-3 border border-gray-100 rounded-xl p-3">
                {r.coverImageUrl && <img src={r.coverImageUrl} alt="" className="w-16 aspect-[4/5] object-cover rounded-lg shrink-0 border border-gray-100" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#f97316]">{r.episodeNumber}화</span>
                    <span className="font-bold text-sm text-gray-900">{r.title}</span>
                    <span className="text-[10px] text-gray-400">{r.panelCount}컷</span>
                    {!r.published && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">비공개</span>}
                    {r.scheduledAt && new Date(r.scheduledAt).getTime() > Date.now() && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">예약</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{r.description}</p>
                  <p className="text-[11px] text-gray-400 mt-1">/toon/{r.slug}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button type="button" onClick={() => startEdit(r)} className="bg-white border border-blue-200 text-blue-600 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-blue-50 font-[inherit]">수정</button>
                  <button type="button" onClick={() => handleDelete(r)} className="bg-white border border-red-200 text-red-500 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-red-50 font-[inherit]">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
