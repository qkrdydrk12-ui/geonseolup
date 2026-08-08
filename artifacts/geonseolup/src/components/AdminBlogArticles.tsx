import { useState, useEffect, useRef } from 'react';
import { getToken } from '@/lib/adminAuth';
import { INFO_ARTICLES, getArticleImage } from '@/lib/infoData';

const inputCls = 'w-full py-2.5 px-3.5 border border-gray-300 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316] focus:ring-2 focus:ring-orange-100 transition-all bg-white';

interface BodyBlock { subtitle?: string; text: string; image?: string }

interface BlogArticle {
  id: number;
  slug: string;
  title: string;
  description: string;
  emoji: string;
  body: BodyBlock[];
  imageUrl: string | null;
  published: boolean;
  createdAt: string;
}

interface ArticleForm {
  slug: string;
  title: string;
  description: string;
  emoji: string;
  published: boolean;
}

function emptyForm(): ArticleForm {
  return { slug: '', title: '', description: '', emoji: '📝', published: true };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

async function apiFetch(url: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

export default function AdminBlogArticles({ showToast }: { showToast: (msg: string) => void }) {
  const [rows, setRows] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ArticleForm>(emptyForm());
  const [blocks, setBlocks] = useState<BodyBlock[]>([{ subtitle: '', text: '' }]);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  async function reload() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/blog-articles/all');
      setRows(data.rows ?? []);
    } catch {
      showToast('❌ 건설 꿀팁 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  function setField<K extends keyof ArticleForm>(key: K, val: ArticleForm[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleTitleChange(title: string) {
    setField('title', title);
    if (!slugTouched && !editingId) setField('slug', slugify(title));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageDataUrl(await readFileAsDataUrl(file));
  }

  function updateBlock(i: number, key: keyof BodyBlock, val: string) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, [key]: val } : b)));
  }

  function addBlock() {
    setBlocks((prev) => [...prev, { subtitle: '', text: '' }]);
  }

  function removeBlock(i: number) {
    setBlocks((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function startEdit(r: BlogArticle) {
    setEditingId(r.id);
    setForm({ slug: r.slug, title: r.title, description: r.description, emoji: r.emoji, published: r.published });
    setBlocks(r.body.length ? r.body : [{ subtitle: '', text: '' }]);
    setExistingImageUrl(r.imageUrl);
    setImageDataUrl(null);
    setSlugTouched(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 코드에 내장된 기본 꿀팁 글을 수정 폼으로 불러온다.
  // 저장하면 같은 slug의 글이 DB에 새로 만들어지고, 사이트에서는 DB 글이 기본 글을 덮어쓴다.
  function startEditStatic(slug: string) {
    const a = INFO_ARTICLES.find((x) => x.slug === slug);
    if (!a) return;
    setEditingId(null);
    setForm({ slug: a.slug, title: a.title, description: a.description, emoji: a.emoji, published: true });
    setBlocks(a.body.length ? a.body.map((b) => ({ ...b })) : [{ subtitle: '', text: '' }]);
    setExistingImageUrl(getArticleImage(a.slug));
    setImageDataUrl(null);
    setSlugTouched(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setBlocks([{ subtitle: '', text: '' }]);
    setImageDataUrl(null);
    setExistingImageUrl(null);
    setSlugTouched(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSave() {
    const title = form.title.trim();
    const description = form.description.trim();
    const slug = form.slug.trim();
    const cleanBlocks = blocks
      .map((b) => ({ subtitle: (b.subtitle || '').trim() || undefined, text: b.text.trim(), image: b.image || undefined }))
      .filter((b) => b.text);

    if (!editingId && !slug) { showToast('slug를 입력해주세요'); return; }
    if (!title) { showToast('제목을 입력해주세요'); return; }
    if (!description) { showToast('설명을 입력해주세요'); return; }
    if (cleanBlocks.length === 0) { showToast('본문을 최소 한 문단 입력해주세요'); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title, description, emoji: form.emoji.trim() || '📝',
        body: cleanBlocks, published: form.published,
      };
      if (imageDataUrl) payload.imageBase64 = imageDataUrl;
      if (editingId) {
        await apiFetch(`/api/blog-articles/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('✅ 수정됐습니다');
      } else {
        payload.slug = slug;
        await apiFetch('/api/blog-articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('✅ 건설 꿀팁이 게시됐습니다');
      }
      cancelEdit();
      await reload();
    } catch (e) {
      showToast(`❌ 저장 실패: ${e instanceof Error ? e.message : ''}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: BlogArticle) {
    if (!confirm(`"${r.title}" 글을 삭제할까요?`)) return;
    try {
      await apiFetch(`/api/blog-articles/${r.id}`, { method: 'DELETE' });
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
      <div ref={formRef} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-extrabold text-gray-700 mb-4 border-b border-gray-100 pb-3">
          {editingId ? '건설 꿀팁 수정' : '건설 꿀팁 새 글 작성'}
        </h3>
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3.5">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">제목 *</label>
              <input type="text" value={form.title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="예: 일당 20만원인데 통장엔 왜 이만큼만" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">이모지</label>
              <input type="text" value={form.emoji} onChange={(e) => setField('emoji', e.target.value)} className={`${inputCls} w-20 text-center text-lg`} />
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
              placeholder="예: wage-tax-withholding-guide"
              className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">목록에 보일 요약 설명 *</label>
            <input type="text" value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="카드 목록에 짧게 보일 설명" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">대표 이미지 (16:9)</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className={inputCls} />
            {previewSrc && (
              <img src={previewSrc} alt="미리보기" className="mt-2 w-full max-w-[320px] aspect-video object-cover rounded-lg border border-gray-200" />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-600">본문 문단 *</label>
              <button type="button" onClick={addBlock} className="text-xs font-bold text-[#f97316] cursor-pointer bg-transparent border-none">+ 문단 추가</button>
            </div>
            <div className="flex flex-col gap-2.5">
              {blocks.map((b, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={b.subtitle ?? ''}
                      onChange={(e) => updateBlock(i, 'subtitle', e.target.value)}
                      placeholder="소제목 (선택)"
                      className={`${inputCls} text-xs font-bold`}
                    />
                    {blocks.length > 1 && (
                      <button type="button" onClick={() => removeBlock(i)} className="shrink-0 text-red-400 text-xs font-bold cursor-pointer bg-transparent border-none px-1">삭제</button>
                    )}
                  </div>
                  <textarea
                    value={b.text}
                    onChange={(e) => updateBlock(i, 'text', e.target.value)}
                    placeholder="본문 내용"
                    rows={3}
                    className={`${inputCls} resize-y leading-relaxed`}
                  />
                  {b.image && (
                    <div className="flex items-center gap-2">
                      <img src={b.image} alt="" className="w-24 rounded-md border border-gray-200" />
                      <span className="text-[11px] text-gray-400">문단 사진 (그대로 유지됩니다)</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <input type="checkbox" checked={form.published} onChange={(e) => setField('published', e.target.checked)} />
            바로 공개 (해제하면 비공개 초안으로 저장)
          </label>
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
        <h3 className="text-sm font-extrabold text-gray-700 mb-4 border-b border-gray-100 pb-3">전체 글 ({rows.length})</h3>
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">등록된 글이 없습니다. 위에서 작성해보세요.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.id} className="flex gap-3 border border-gray-100 rounded-xl p-3">
                {r.imageUrl && <img src={r.imageUrl} alt="" className="w-20 h-20 object-cover rounded-lg shrink-0 border border-gray-100" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{r.emoji}</span>
                    <span className="font-bold text-sm text-gray-900">{r.title}</span>
                    {!r.published && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">비공개</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{r.description}</p>
                  <p className="text-[11px] text-gray-400 mt-1">/info/{r.slug}</p>
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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-extrabold text-gray-700 mb-1 border-b border-gray-100 pb-3">
          기본 꿀팁 글 ({INFO_ARTICLES.filter((a) => !rows.some((r) => r.slug === a.slug)).length})
        </h3>
        <p className="text-[11px] text-gray-400 mb-4">사이트에 처음부터 들어있는 글입니다. "수정"을 누르고 저장하면 수정한 버전이 원래 글을 대신해서 보입니다.</p>
        <div className="flex flex-col gap-3">
          {INFO_ARTICLES.filter((a) => !rows.some((r) => r.slug === a.slug)).map((a) => (
            <div key={a.slug} className="flex gap-3 border border-gray-100 rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{a.emoji}</span>
                  <span className="font-bold text-sm text-gray-900">{a.title}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-500">기본 글</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.description}</p>
                <p className="text-[11px] text-gray-400 mt-1">/info/{a.slug}</p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button type="button" onClick={() => startEditStatic(a.slug)} className="bg-white border border-blue-200 text-blue-600 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-blue-50 font-[inherit]">수정</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
