import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useQualityTopics } from '@/lib/useQualityTopics';

// 자주 찾을 만한 주제를 버튼으로 먼저 보여준다(검색창에 안 쳐도 바로 클릭). 실제 카테고리와
// 정확히 매칭 안 돼도 괜찮게, 클릭 시 검색어로 채워서 제목·요약·키워드 전체에서 느슨하게 찾는다.
const QUICK_TOPICS = ['용접', '배관', '전기', '방청도장', '보온', '덕트', '지지대', '플랜지', '접지'];

export default function Quality() {
  const { topics, loading } = useQualityTopics();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('전체');

  useEffect(() => {
    document.title = '건설 품질기준 — 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = '반도체 팹 건설현장 설비 시공 품질기준을 항목별로 검색해서 바로 확인하세요. 용접, 배관, 전기, 도장 등 주제별 정리.';
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    topics.forEach((t) => set.add(t.category));
    return ['전체', ...Array.from(set).sort()];
  }, [topics]);

  // "자주 찾는 항목" — 항목 수가 많은 상위 카테고리별로 대표 항목(그 카테고리의 첫 항목) 1개씩 뽑아
  // 검색 없이 바로 클릭해서 들어갈 수 있게 목록 맨 위에 따로 빼둔다.
  const featured = useMemo(() => {
    const byCategory = new Map<string, typeof topics>();
    topics.forEach((t) => {
      const arr = byCategory.get(t.category) ?? [];
      arr.push(t);
      byCategory.set(t.category, arr);
    });
    return Array.from(byCategory.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([, arr]) => arr[0]!);
  }, [topics]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return topics.filter((t) => {
      const matchesCategory = category === '전체' || t.category === category;
      if (!matchesCategory) return false;
      if (!q) return true;
      const haystack = [t.title, t.summary, t.category, t.code, ...(t.keywords || [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [topics, query, category]);

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <Header />

      {/* 히어로: 와디즈 스타일 — 큰 타이틀 + 핵심 숫자 강조 + 설명 */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5282 100%)' }}>
        <div className="max-w-[1000px] mx-auto px-4 pt-10 pb-8 text-center">
          <div className="inline-block px-3 py-1 rounded-full text-[11px] font-bold text-white bg-white/15 border border-white/25 mb-3">
            반도체 팹 건설현장 설비 시공 기준
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-3 leading-snug">
            "이렇게 하면 맞는 거야?" — 현장에서 바로 찾아보는 품질기준
          </h1>
          <p className="text-sm text-white/75 max-w-[600px] mx-auto mb-6">
            삼성 반도체 현장에서 9년간 일하며 모아온 자료를 분석해 172개 항목으로 정리했습니다. 용접·배관·전기·도장 등
            공종별로 적합/부적합 사진과 기준 수치를 현장에서 바로 쓰는 말로 풀어 담았어요.
          </p>
          <div className="flex items-center justify-center gap-6 text-white mb-6">
            <div>
              <div className="text-2xl font-extrabold">{topics.length || 161}</div>
              <div className="text-[11px] text-white/60">전체 항목</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div>
              <div className="text-2xl font-extrabold">{categories.length - 1}</div>
              <div className="text-[11px] text-white/60">공종 분류</div>
            </div>
          </div>
          {topics.length > 0 && (
            <Link
              href={`/quality/${topics[0]!.slug}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white no-underline border border-white/30 bg-white/10 hover:bg-white/20 transition-colors"
            >
              📖 처음부터 책으로 넘겨보기
            </Link>
          )}
        </div>
      </div>

      <main className="max-w-[1000px] mx-auto px-4 py-6">
        {/* 자주 찾는 항목 — 검색 없이 바로 클릭 */}
        {featured.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold text-[#1e3a5f] mb-2.5">⭐ 자주 찾는 항목</h2>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              {featured.map((t) => (
                <Link
                  key={t.slug}
                  href={`/quality/${t.slug}`}
                  className="shrink-0 w-[150px] sm:w-[170px] block no-underline bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div
                    className="relative h-[90px] flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
                  >
                    {t.thumbnail ? (
                      <img src={t.thumbnail} alt={t.title} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">📐</span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <span className="text-[9px] font-bold text-[#f97316] bg-orange-50 px-1.5 py-0.5 rounded">{t.category}</span>
                    <p className="text-[11px] font-bold text-[#1e3a5f] leading-snug mt-1 line-clamp-2">{t.title}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 검색창 */}
        <div className="sticky top-[56px] sm:top-[64px] z-[50] bg-[#f8fafc]/95 backdrop-blur pt-3 pb-3 -mx-4 px-4">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="궁금한 걸 검색해보세요 (예: 용접, 배관, 플랜지)"
              className="w-full rounded-xl border-2 border-gray-200 focus:border-[#f97316] outline-none px-4 py-3 text-sm bg-white shadow-sm"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm border-none bg-transparent cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* 빠른 주제 버튼 */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {QUICK_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => { setQuery(t); setCategory('전체'); }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-colors whitespace-nowrap ${
                  query === t
                    ? 'bg-[#f97316] border-[#f97316] text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-[#f97316] hover:text-[#f97316]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-gray-500">검색 결과가 없어요. 다른 단어로 찾아보세요.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">{filtered.length}개 항목 — 클릭하면 그 항목부터 이전/다음으로 이어볼 수 있어요</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((t) => (
                <Link key={t.slug} href={`/quality/${t.slug}`} className="block no-underline">
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer h-full flex gap-3 p-3">
                    <div
                      className="relative w-[84px] h-[84px] rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
                    >
                      {t.thumbnail ? (
                        <img src={t.thumbnail} alt={t.title} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">📐</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold text-[#f97316] bg-orange-50 px-1.5 py-0.5 rounded">{t.category}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{t.code.replace(/-v\d+$/, '')}</span>
                      </div>
                      <h2 className="text-[13px] font-bold text-[#1e3a5f] leading-snug mb-1 line-clamp-2">{t.title}</h2>
                      <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{t.summary}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
