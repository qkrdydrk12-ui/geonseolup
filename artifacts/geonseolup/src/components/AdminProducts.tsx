import { useState, useEffect, useRef } from 'react';
import {
  fbLoadProducts,
  fbAddProduct,
  fbUpdateProduct,
  fbDeleteProduct,
  fbReorderProducts,
  PRODUCT_CATEGORIES,
  type Product,
} from '@/lib/firebase';
import { getToken } from '@/lib/adminAuth';

const inputCls = 'w-full py-2.5 px-3.5 border border-gray-300 rounded-lg text-sm outline-none font-[inherit] focus:border-[#f97316] focus:ring-2 focus:ring-orange-100 transition-all bg-white';

interface ProductForm {
  name: string;
  category: string;
  price: string;
  rating: string;
  reviewCount: string;
  link: string;
  image: string;
}

const EMPTY_FORM: ProductForm = { name: '', category: PRODUCT_CATEGORIES[0], price: '', rating: '', reviewCount: '', link: '', image: '' };

/** 이미지 파일 → 축소된 JPEG data URL (최대 600px, 품질 0.75) */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas')); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => reject(new Error('image load'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('file read'));
    reader.readAsDataURL(file);
  });
}

export default function AdminProducts({ showToast }: { showToast: (msg: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('전체');
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [coupangUrl, setCoupangUrl] = useState('');
  const [coupangKeyword, setCoupangKeyword] = useState('');
  const [fetching, setFetching] = useState(false);

  async function reload() {
    setLoading(true);
    const items = await fbLoadProducts(true);
    setProducts(items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  function setField<K extends keyof ProductForm>(key: K, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleImageFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('이미지 파일만 업로드할 수 있습니다'); return; }
    setImgBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      if (dataUrl.length > 900_000) { showToast('이미지가 너무 큽니다. 다른 이미지를 사용해주세요'); return; }
      setField('image', dataUrl);
    } catch {
      showToast('이미지 처리에 실패했습니다');
    } finally {
      setImgBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category,
      price: p.price ? String(p.price) : '',
      rating: p.rating ? String(p.rating) : '',
      reviewCount: p.reviewCount ? String(p.reviewCount) : '',
      link: p.link || '',
      image: p.image || '',
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  /** 쿠팡 URL → API 조회 → 자동 등록 */
  async function handleCoupangImport() {
    const url = coupangUrl.trim();
    if (!url) { showToast('쿠팡 상품 URL을 붙여넣어 주세요'); return; }
    if (!/coupang\.com/i.test(url)) { showToast('쿠팡(coupang.com) 상품 링크만 등록할 수 있습니다'); return; }
    setFetching(true);
    try {
      const res = await fetch('/api/admin/coupang/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
        body: JSON.stringify({ url, keyword: coupangKeyword.trim() || undefined }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        partnerLink?: string;
        product?: { name: string; price: number; image: string; brand: string; category: string; link: string };
      };
      if (!res.ok || !data.ok || !data.product) {
        if (data.partnerLink) {
          setForm((prev) => ({
            ...prev,
            link: data.partnerLink || '',
            name: prev.name || coupangKeyword.trim(),
          }));
          showToast(`${data.message || '상품 조회 실패'} (파트너스 링크는 폼에 채워뒀습니다)`);
        } else {
          showToast(data.message || '❌ 상품 조회에 실패했습니다');
        }
        return;
      }
      const p = data.product;
      const maxOrder = products.reduce((mx, x) => Math.max(mx, x.order ?? 0), 0);
      await fbAddProduct({
        name: p.name,
        category: p.category,
        price: p.price || 0,
        rating: 0,
        reviewCount: 0,
        link: p.link,
        image: p.image || '',
        brand: p.brand || '',
        order: maxOrder + 1,
        hidden: false,
        createdAt: new Date().toISOString(),
      });
      setCoupangUrl('');
      setCoupangKeyword('');
      showToast(`✅ "${p.name.slice(0, 20)}${p.name.length > 20 ? '…' : ''}" 자동 등록 완료`);
      await reload();
    } catch {
      showToast('❌ 쿠팡 상품 조회에 실패했습니다');
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name) { showToast('상품명을 입력해주세요'); return; }
    const price = parseInt(form.price.replace(/[^0-9]/g, ''), 10) || 0;
    const rating = Math.max(0, Math.min(5, parseFloat(form.rating) || 0));
    const reviewCount = parseInt(form.reviewCount.replace(/[^0-9]/g, ''), 10) || 0;
    const link = form.link.trim();
    if (link && !/^https:\/\//i.test(link)) {
      showToast('링크는 https:// 로 시작하는 주소만 입력할 수 있습니다');
      return;
    }
    const image = form.image.trim();
    if (image && !image.startsWith('data:image/') && !/^https:\/\//i.test(image)) {
      showToast('이미지는 https:// URL 또는 업로드한 파일만 사용할 수 있습니다');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await fbUpdateProduct(editingId, { name, category: form.category, price, rating, reviewCount, link, image: form.image });
        showToast('✅ 상품이 수정됐습니다');
      } else {
        const maxOrder = products.reduce((mx, p) => Math.max(mx, p.order ?? 0), 0);
        await fbAddProduct({
          name, category: form.category, price, rating, reviewCount, link,
          image: form.image, order: maxOrder + 1, hidden: false,
          createdAt: new Date().toISOString(),
        });
        showToast('✅ 상품이 추가됐습니다');
      }
      cancelEdit();
      await reload();
    } catch {
      showToast('❌ 저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`"${p.name}" 상품을 삭제할까요?`)) return;
    try {
      await fbDeleteProduct(p.id);
      if (editingId === p.id) cancelEdit();
      showToast('🗑 삭제됐습니다');
      await reload();
    } catch {
      showToast('❌ 삭제에 실패했습니다');
    }
  }

  async function handleToggleHide(p: Product) {
    try {
      await fbUpdateProduct(p.id, { hidden: !p.hidden });
      await reload();
    } catch {
      showToast('❌ 변경에 실패했습니다');
    }
  }

  async function move(p: Product, dir: -1 | 1) {
    const sorted = [...products].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = sorted.findIndex((x) => x.id === p.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    // 스왑 후 1..N 순서를 원자적 배치 쓰기로 재부여
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    try {
      await fbReorderProducts(sorted.map((x) => x.id));
      await reload();
    } catch {
      showToast('❌ 순서 변경에 실패했습니다');
    }
  }

  const kw = search.trim().toLowerCase();
  const visible = products.filter((p) =>
    (filterCat === '전체' || p.category === filterCat) &&
    (!kw || p.name.toLowerCase().includes(kw))
  );

  return (
    <div className="flex flex-col gap-5">

      {/* 쿠팡 URL 자동 등록 */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-orange-200 p-5">
        <h3 className="text-sm font-extrabold text-gray-700 mb-1.5">🔗 쿠팡 URL 자동 등록</h3>
        <p className="text-xs text-gray-500 mb-3">쿠팡 상품 페이지 주소를 붙여넣으면 상품명·이미지·가격·카테고리·파트너스 링크를 자동으로 가져와 바로 등록합니다. 상품명 키워드를 함께 입력하면 자동 조회 성공률이 크게 올라갑니다.</p>
        <div className="flex gap-2 flex-col">
          <input
            type="url"
            value={coupangUrl}
            onChange={(e) => setCoupangUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCoupangImport(); }}
            placeholder="https://www.coupang.com/vp/products/... 또는 https://link.coupang.com/..."
            className={inputCls}
            disabled={fetching}
          />
          <div className="flex gap-2 flex-col sm:flex-row">
          <input
            type="text"
            value={coupangKeyword}
            onChange={(e) => setCoupangKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCoupangImport(); }}
            placeholder="상품명 키워드 (권장, 예: K2 안전화 6인치)"
            className={inputCls}
            disabled={fetching}
          />
          <button
            type="button"
            onClick={handleCoupangImport}
            disabled={fetching}
            className="shrink-0 bg-[#f97316] text-white border-none px-6 py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors disabled:opacity-50 font-[inherit]"
          >
            {fetching ? '가져오는 중...' : '⚡ 자동 등록'}
          </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">등록 후 아래 목록에서 별점·후기수 등을 수정할 수 있습니다.</p>
      </div>

      {/* 상품 추가/수정 폼 */}
      <div ref={formRef} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-extrabold text-gray-700 mb-4 border-b border-gray-100 pb-3">
          {editingId ? '✏️ 상품 수정' : '➕ 상품 추가'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-gray-600 mb-1">상품명 *</label>
            <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="예: K2 안전화 KV-609 6인치" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">카테고리 *</label>
            <select value={form.category} onChange={(e) => setField('category', e.target.value)} className={inputCls}>
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">가격 (원)</label>
            <input type="text" inputMode="numeric" value={form.price} onChange={(e) => setField('price', e.target.value.replace(/[^0-9]/g, ''))} placeholder="예: 89000" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">별점 (0~5)</label>
            <input type="text" inputMode="decimal" value={form.rating} onChange={(e) => setField('rating', e.target.value.replace(/[^0-9.]/g, ''))} placeholder="예: 4.7" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">후기 수</label>
            <input type="text" inputMode="numeric" value={form.reviewCount} onChange={(e) => setField('reviewCount', e.target.value.replace(/[^0-9]/g, ''))} placeholder="예: 1234" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-gray-600 mb-1">쿠팡파트너스 링크</label>
            <input type="url" value={form.link} onChange={(e) => setField('link', e.target.value)} placeholder="https://link.coupang.com/a/..." className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-gray-600 mb-1">상품 이미지</label>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="w-24 h-24 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                {form.image
                  ? <img src={form.image} alt="미리보기" className="w-full h-full object-cover" />
                  : <span className="text-2xl text-gray-300">🛠️</span>}
              </div>
              <div className="flex-1 min-w-[200px] flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" onChange={(e) => handleImageFile(e.target.files?.[0])} className="text-xs" />
                {imgBusy && <span className="text-xs text-gray-400">이미지 처리 중...</span>}
                <input type="url" value={form.image.startsWith('data:') ? '' : form.image} onChange={(e) => setField('image', e.target.value)} placeholder="또는 이미지 URL 직접 입력" className={inputCls} />
                {form.image && (
                  <button type="button" onClick={() => setField('image', '')} className="self-start text-xs text-red-500 font-semibold bg-transparent border-none cursor-pointer p-0">이미지 제거</button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || imgBusy}
            className="bg-[#f97316] text-white border-none px-6 py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors disabled:opacity-50 font-[inherit]"
          >
            {saving ? '저장 중...' : editingId ? '💾 수정 저장' : '➕ 상품 추가'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="bg-white border-2 border-gray-200 text-gray-500 px-5 py-2 rounded-lg text-sm font-bold cursor-pointer hover:bg-gray-50 font-[inherit]">
              취소
            </button>
          )}
        </div>
      </div>

      {/* 상품 목록 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4 border-b border-gray-100 pb-3">
          <h3 className="text-sm font-extrabold text-gray-700">📦 상품 목록 ({products.length})</h3>
          <div className="flex gap-2 flex-wrap">
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="py-1.5 px-2.5 border border-gray-300 rounded-lg text-xs outline-none bg-white font-[inherit]">
              {['전체', ...PRODUCT_CATEGORIES].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="상품명 검색" className="py-1.5 px-3 border border-gray-300 rounded-lg text-xs outline-none font-[inherit] focus:border-[#f97316]" />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            {products.length === 0 ? '등록된 상품이 없습니다. 위에서 첫 상품을 추가해보세요.' : '조건에 맞는 상품이 없습니다.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visible.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 border rounded-xl p-2.5 ${p.hidden ? 'opacity-50 bg-gray-50 border-gray-200' : 'border-gray-200'}`}>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button type="button" onClick={() => move(p, -1)} disabled={i === 0 || filterCat !== '전체' || !!kw} className="w-6 h-6 rounded border border-gray-200 bg-white text-[10px] cursor-pointer hover:bg-gray-50 disabled:opacity-30 disabled:cursor-default" title="위로">▲</button>
                  <button type="button" onClick={() => move(p, 1)} disabled={i === visible.length - 1 || filterCat !== '전체' || !!kw} className="w-6 h-6 rounded border border-gray-200 bg-white text-[10px] cursor-pointer hover:bg-gray-50 disabled:opacity-30 disabled:cursor-default" title="아래로">▼</button>
                </div>
                <div className="w-14 h-14 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden shrink-0 flex items-center justify-center">
                  {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <span className="text-xl text-gray-300">🛠️</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-gray-800 truncate">{p.name}</div>
                  <div className="text-xs text-gray-500 flex gap-2 flex-wrap mt-0.5">
                    <span className="text-[#f97316] font-semibold">{p.category}</span>
                    <span>{p.price ? `${p.price.toLocaleString('ko-KR')}원` : '가격 미입력'}</span>
                    <span>⭐ {p.rating || '-'} ({p.reviewCount || 0})</span>
                    {!p.link && <span className="text-red-500 font-semibold">링크 없음</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                  <button type="button" onClick={() => handleToggleHide(p)} className="bg-white border border-gray-200 text-gray-500 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-gray-50 font-[inherit]">
                    {p.hidden ? '👁 노출' : '🙈 숨김'}
                  </button>
                  <button type="button" onClick={() => startEdit(p)} className="bg-white border border-blue-200 text-blue-600 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-blue-50 font-[inherit]">✏️ 수정</button>
                  <button type="button" onClick={() => handleDelete(p)} className="bg-white border border-red-200 text-red-500 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-red-50 font-[inherit]">🗑 삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {(filterCat !== '전체' || kw) && visible.length > 0 && (
          <p className="text-[11px] text-gray-400 mt-2.5">※ 순서 변경(▲▼)은 전체 목록(검색·카테고리 필터 해제)에서만 가능합니다.</p>
        )}
      </div>
    </div>
  );
}
