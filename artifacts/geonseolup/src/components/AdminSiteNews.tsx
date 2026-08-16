import { useState, useEffect, useRef } from 'react';
import { getToken } from '@/lib/adminAuth';

const inputCls = 'w-full py-2.5 px-3.5 border border-gray-300 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316] focus:ring-2 focus:ring-orange-100 transition-all bg-white';

interface SiteNews {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  sourceLabel: string;
  sourceUrl: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface NewsForm {
  title: string;
  body: string;
  sourceLabel: string;
  sourceUrl: string;
  publishedAt: string; // datetime-local 문자열
}

function nowLocal(): string {
  const d = new Date(Date.now() + 9 * 3600000); // KST
  return d.toISOString().slice(0, 16);
}

function emptyForm(): NewsForm {
  return { title: '', body: '', sourceLabel: '', sourceUrl: '', publishedAt: nowLocal() };
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AdminSiteNews({ showToast }: { showToast: (msg: string) => void }) {
  const [rows, setRows] = useState<SiteNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<NewsForm>(emptyForm());
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null); // 새로 고른 이미지
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null); // 수정 중인 항목의 기존 이미지
  const [removeImage, setRemoveImage] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  async function reload() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/site-news/all');
      setRows(data.rows ?? []);
    } catch {
      showToast('❌ 현장 소식 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  function setField<K extends keyof NewsForm>(key: K, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setImageDataUrl(dataUrl);
    setRemoveImage(false);
  }

  function startEdit(r: SiteNews) {
    setEditingId(r.id);
    setForm({
      title: r.title,
      body: r.body,
      sourceLabel: r.sourceLabel,
      sourceUrl: r.sourceUrl,
      publishedAt: new Date(new Date(r.publishedAt).getTime() + 9 * 3600000).toISOString().slice(0, 16),
    });
    setExistingImageUrl(r.imageUrl);
    setImageDataUrl(null);
    setRemoveImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setImageDataUrl(null);
    setExistingImageUrl(null);
    setRemoveImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSave() {
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title) { showToast('제목을 입력해주세요'); return; }
    if (!body) { showToast('본문을 입력해주세요'); return; }

    setSaving(true);
    try {
      const publishedAtIso = form.publishedAt
        ? new Date(`${form.publishedAt}:00+09:00`).toISOString()
        : undefined;
      const payload: Record<string, unknown> = {
        title, body,
        sourceLabel: form.sourceLabel.trim(),
        sourceUrl: form.sourceUrl.trim(),
        publishedAt: publishedAtIso,
      };
      if (imageDataUrl) payload.imageBase64 = imageDataUrl;
      if (editingId) {
        if (removeImage) payload.removeImage = true;
        await apiFetch(`/api/site-news/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('✅ 수정됐습니다');
      } else {
        await apiFetch('/api/site-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('✅ 현장 소식이 게시됐습니다');
      }
      cancelEdit();
      await reload();
    } catch (e) {
      showToast(`❌ 저장 실패: ${e instanceof Error ? e.message : ''}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: SiteNews) {
    if (!confirm(`"${r.title}" 글을 삭제할까요?`)) return;
    try {
      await apiFetch(`/api/site-news/${r.id}`, { method: 'DELETE' });
      if (editingId === r.id) cancelEdit();
      showToast('🗑 삭제됐습니다');
      await reload();
    } catch {
      showToast('❌ 삭제 실패');
    }
  }

  const previewSrc = imageDataUrl || existingImageUrl;

  return (
    <div className="flex flex-col gap-5">
      {/* 등록/수정 폼 */}
      <div ref={formRef} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-extrabold text-gray-700 mb-4 border-b border-gray-100 pb-3">
          {editingId ? '현장 소식 수정' : '현장 소식 새 글 작성'}
        </h3>
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">제목 *</label>
            <input type="text" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="예: 오늘 같은 폭염, 작업중지 기준 아셨나요" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">본문 *</label>
            <textarea
              value={form.body}
              onChange={(e) => setField('body', e.target.value)}
              placeholder="Threads/Instagram에 올린 본문을 그대로 붙여넣으면 됩니다"
              rows={8}
              className={`${inputCls} resize-y leading-relaxed`}
            />
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-[11px] text-gray-500 leading-relaxed">
              <b className="text-gray-600">✨ 본문 꾸미기</b> — 아래 기호를 쓰면 글이 꾸며져서 보입니다<br />
              <b>## 소제목</b> → 파란 소제목 &nbsp;·&nbsp; <b>**굵게**</b> → <b>굵은 글씨</b> &nbsp;·&nbsp; {'{빨강:주의}'} → <span className="text-red-600 font-semibold">글자색</span> (빨강·파랑·초록·주황·회색)<br />
              줄 맨 앞에 <b>&gt;&nbsp;</b> → 인용 상자 &nbsp;·&nbsp; <b>---</b> 한 줄 → 짧은 구분선 &nbsp;·&nbsp; <b>===</b> 한 줄 → 긴 구분선
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">이미지</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className={inputCls} />
            {previewSrc && !removeImage && (
              <div className="mt-2 relative inline-block">
                <img src={previewSrc} alt="미리보기" className="max-w-[260px] rounded-lg border border-gray-200" />
                <button
                  type="button"
                  onClick={() => {
                    setImageDataUrl(null);
                    setExistingImageUrl(null);
                    setRemoveImage(true);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full w-6 h-6 text-xs font-bold text-gray-600 cursor-pointer hover:bg-gray-50"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">출처 라벨</label>
              <input type="text" value={form.sourceLabel} onChange={(e) => setField('sourceLabel', e.target.value)} placeholder="예: Threads" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">출처 링크</label>
              <input type="text" value={form.sourceUrl} onChange={(e) => setField('sourceUrl', e.target.value)} placeholder="https://www.threads.net/..." className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">게시 일시</label>
            <input type="datetime-local" value={form.publishedAt} onChange={(e) => setField('publishedAt', e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-[#f97316] text-white border-none px-6 py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors disabled:opacity-50 font-[inherit]"
          >
            {saving ? '저장 중...' : editingId ? '수정 저장' : '게시하기'}
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
        <h3 className="text-sm font-extrabold text-gray-700 mb-4 border-b border-gray-100 pb-3">전체 글 ({rows.length})</h3>
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">등록된 현장 소식이 없습니다. 위에서 작성해보세요.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.id} className="flex gap-3 border border-gray-100 rounded-xl p-3">
                {r.imageUrl && (
                  <img src={r.imageUrl} alt="" className="w-20 h-20 object-cover rounded-lg shrink-0 border border-gray-100" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-gray-900">{r.title}</span>
                    {r.sourceLabel && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#f97316]">{r.sourceLabel}</span>
                    )}
                    {new Date(r.publishedAt).getTime() > Date.now() && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">예약</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-line">{r.body}</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {new Date(r.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  </p>
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
