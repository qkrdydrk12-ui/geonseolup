import { useState, useEffect, useMemo } from 'react';
import { fbLoadProducts, PRODUCT_CATEGORIES, type Product } from '@/lib/firebase';

function safeLink(link: string | undefined): string {
  return link && /^https:\/\//i.test(link) ? link : '';
}

function formatPrice(n: number): string {
  if (!n || n <= 0) return '가격 확인';
  return `${n.toLocaleString('ko-KR')}원`;
}

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, rating || 0));
  const pct = (r / 5) * 100;
  return (
    <span className="relative inline-block text-[13px] leading-none align-middle">
      <span className="text-gray-300 select-none">★★★★★</span>
      <span className="absolute left-0 top-0 overflow-hidden text-[#facc15] select-none whitespace-nowrap" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

function ProductCard({ p }: { p: Product }) {
  const link = safeLink(p.link);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all">
      <a
        href={link || '#'}
        target="_blank"
        rel="noopener noreferrer nofollow sponsored"
        className="block bg-gray-50 aspect-square overflow-hidden no-underline"
        onClick={(e) => { if (!link) e.preventDefault(); }}
      >
        {p.image ? (
          <img src={p.image} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl text-gray-300">🛠️</div>
        )}
      </a>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <span className="text-[10px] font-bold text-[#f97316] bg-orange-50 border border-orange-100 rounded px-1.5 py-0.5 self-start">{p.category}</span>
        <div className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2 min-h-[36px]">{p.name}</div>
        <div className="text-[16px] font-extrabold text-gray-900">{formatPrice(p.price)}</div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Stars rating={p.rating} />
          <span className="font-semibold text-gray-700">{p.rating ? p.rating.toFixed(1) : '-'}</span>
          <span className="text-gray-400">({(p.reviewCount || 0).toLocaleString('ko-KR')})</span>
        </div>
        <a
          href={link || '#'}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          onClick={(e) => { if (!link) e.preventDefault(); }}
          className="mt-auto block text-center bg-[#f97316] hover:bg-[#ea580c] text-white text-[13px] font-bold rounded-lg py-2 no-underline transition-colors"
        >
          제품 보러가기
        </a>
      </div>
    </div>
  );
}

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('전체');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    let alive = true;
    fbLoadProducts().then((items) => {
      if (!alive) return;
      setProducts(items.filter((p) => !p.hidden));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const visible = useMemo(() => {
    let list = products;
    if (category !== '전체') list = list.filter((p) => p.category === category);
    const kw = keyword.trim().toLowerCase();
    if (kw) list = list.filter((p) => p.name.toLowerCase().includes(kw) || p.category.toLowerCase().includes(kw));
    // 전체 보기: 카테고리 순서(안전화 → 생활물품 → …)대로 묶어서, 그 안에서 관리자 지정 순서
    const catIdx = (p: Product) => {
      const i = PRODUCT_CATEGORIES.indexOf(p.category);
      return i === -1 ? PRODUCT_CATEGORIES.length : i;
    };
    return [...list].sort((a, b) => catIdx(a) - catIdx(b) || (a.order ?? 0) - (b.order ?? 0));
  }, [products, category, keyword]);

  return (
    <div className="min-h-screen pb-16" style={{ background: '#eef2f7' }}>
      <div className="max-w-[1100px] mx-auto px-3 pt-3">

        <p className="text-center text-[13px] text-gray-600 font-medium leading-relaxed mb-4">
          이 페이지의 링크는 쿠팡 파트너스 활동의 일환으로,<br className="sm:hidden" /> 이에 따른 일정액의 수수료를 제공받을 수 있습니다.
        </p>

        <div className="text-center mb-5">
          <h1 className="text-2xl font-extrabold text-[#1e3a5f] mb-1.5">건설 추천템</h1>
          <p className="text-[13px] text-gray-500">99% 실사용 바탕으로 추천 장비·용품을 모았습니다</p>
        </div>

        {/* 검색 */}
        <div className="relative max-w-[480px] mx-auto mb-4">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="상품명 검색 (예: 안전화, 용접면)"
            className="w-full py-3 pl-4 pr-11 border border-gray-300 rounded-xl text-sm outline-none bg-white font-[inherit] focus:border-[#f97316] focus:ring-2 focus:ring-orange-100 transition-all"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        </div>

        {/* 카테고리 */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 -mx-3 px-3 sm:flex-wrap sm:overflow-visible" style={{ scrollbarWidth: 'none' }}>
          {['전체', ...PRODUCT_CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-bold border-[1.5px] cursor-pointer transition-all font-[inherit] whitespace-nowrap ${
                category === c
                  ? 'bg-[#f97316] border-[#f97316] text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-orange-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* 상품 그리드 */}
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">불러오는 중...</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">📦</div>
            <p className="text-sm text-gray-500 font-semibold">
              {products.length === 0 ? '아직 등록된 상품이 없습니다.' : '조건에 맞는 상품이 없습니다.'}
            </p>
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-500 mb-2.5 font-semibold">총 <span className="text-[#f97316] font-extrabold">{visible.length}</span>개</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
              {visible.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
