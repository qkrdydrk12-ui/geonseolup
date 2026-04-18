import { useState, useEffect, useRef } from 'react';
import type { Job } from '@/lib/firebase';
import { fbOnJobs } from '@/lib/firebase';
import { SAMPLE_JOBS } from '@/data/sampleJobs';
import { isAutoHidden, WELD_SUBS, isWeld } from '@/lib/utils';
import JobCard from '@/components/JobCard';

const DEFAULT_AUTO_HIDE = 0;

function getHomeSettings() {
  return {
    pageSize: parseInt(localStorage.getItem('cj_home_page_size') || '12') || 12,
    infeedEvery: parseInt(localStorage.getItem('cj_home_infeed_every') || '6') || 6,
    showPopular: localStorage.getItem('cj_home_show_popular') !== 'off',
    adTopHeight: parseInt(localStorage.getItem('cj_ad_top_height') || '90') || 90,
    adInfeedHeight: parseInt(localStorage.getItem('cj_ad_infeed_height') || '90') || 90,
    adBottomHeight: parseInt(localStorage.getItem('cj_ad_bottom_height') || '90') || 90,
    adMaxWidth: localStorage.getItem('cj_ad_max_width') || '100%',
  };
}

function getAutoHideHours(): number {
  try {
    const s = JSON.parse(localStorage.getItem('cj_dup_settings') || '{}');
    return typeof s.autoHideHours === 'number' ? s.autoHideHours : DEFAULT_AUTO_HIDE;
  } catch {
    return DEFAULT_AUTO_HIDE;
  }
}

function getImgAd(slotSuffix: string): { src: string; url: string } | null {
  const src = localStorage.getItem(`cj_imgad_${slotSuffix}_src`) || '';
  if (!src) return null;
  return { src, url: localStorage.getItem(`cj_imgad_${slotSuffix}_url`) || '' };
}

function AdSlot({ storageKey, minHeight, maxWidth }: { storageKey: string; minHeight?: number; maxWidth?: string }) {
  const slotSuffix = storageKey.replace('cj_ad_', '');
  const imgAd = getImgAd(slotSuffix);

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: maxWidth || '100%',
  };

  if (imgAd) {
    const inner = (
      <img
        src={imgAd.src}
        alt="광고"
        className="block rounded-lg"
        style={{
          width: '100%',
          height: 'auto',
          minHeight: minHeight ?? 60,
          maxHeight: 200,
          objectFit: 'cover',
          cursor: imgAd.url ? 'pointer' : 'default',
        }}
      />
    );
    return (
      <div className="w-full my-1 flex justify-center overflow-hidden">
        <div style={containerStyle}>
          {imgAd.url
            ? <a href={imgAd.url} target="_blank" rel="noopener noreferrer">{inner}</a>
            : inner}
        </div>
      </div>
    );
  }

  const code = localStorage.getItem(storageKey) || '';
  if (!code.trim()) return null;
  return (
    <div className="w-full my-1 flex justify-center overflow-hidden">
      <div style={containerStyle}>
        <div
          className="w-full rounded-lg border border-dashed border-gray-300 overflow-hidden"
          style={{ background: '#fffde7', minHeight: minHeight ?? 60 }}
          dangerouslySetInnerHTML={{ __html: code }}
        />
      </div>
    </div>
  );
}

interface AppState {
  keyword: string;
  region: string;
  job: string;
  weldSub: string;
  sort: string;
  page: number;
  allJobs: Job[];
  filtered: Job[];
}

const DEFAULT_REGIONS = ['전체', '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const DEFAULT_JOBS = ['전체', '조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비', '화기감시자', '유도원', '양중', '덕트', '비계', '안전담당자', '품질담당자', '공사담당자', '기타'];

function getRegions(): string[] {
  try {
    const stored = localStorage.getItem('cj_custom_regions');
    if (stored) {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr) && arr.length > 0) return ['전체', ...arr];
    }
  } catch {}
  return DEFAULT_REGIONS;
}

function getJobs(): string[] {
  try {
    const stored = localStorage.getItem('cj_custom_jobs');
    if (stored) {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr) && arr.length > 0) return ['전체', ...arr];
    }
  } catch {}
  return DEFAULT_JOBS;
}
const JOB_EMOJI: Record<string, string> = {
  조공: '🔨',
  배관: '🔧',
  용접: '🔩',
  형틀: '📐',
  철근: '🔩',
  미장: '🪣',
  도장: '🖌️',
  토공: '⛏️',
  전기: '⚡',
  설비: '🛠️',
  화기감시자: '🧯',
  유도원: '🚦',
  양중: '🏗️',
  덕트: '💨',
  비계: '🪜',
  안전담당자: '🦺',
  품질담당자: '📋',
  공사담당자: '🏢',
  기타: '📌',
};

function filterAndSort(jobs: Job[], state: AppState): Job[] {
  const autoHideHours = getAutoHideHours();
  let list = jobs.filter((j) => !j.hidden && !isAutoHidden(j.date, autoHideHours));

  if (state.keyword) {
    const kw = state.keyword.toLowerCase();
    list = list.filter(
      (j) =>
        (j.title || '').toLowerCase().includes(kw) ||
        (j.region || '').includes(kw) ||
        (j.job || '').includes(kw) ||
        (j.weldSub || '').includes(kw)
    );
  }

  if (state.region !== '전체') {
    list = list.filter((j) => (j.region || '').includes(state.region));
  }

  if (state.job !== '전체') {
    if (isWeld(state.job)) {
      if (state.weldSub !== '전체') {
        list = list.filter(
          (j) =>
            j.job === state.weldSub ||
            (j.weldSub || '') === state.weldSub
        );
      } else {
        list = list.filter((j) => isWeld(j.job));
      }
    } else {
      list = list.filter((j) => j.job === state.job);
    }
  }

  if (state.sort === 'salary_desc') {
    list.sort((a, b) => (b.salaryNum || 0) - (a.salaryNum || 0));
  } else if (state.sort === 'salary_asc') {
    list.sort((a, b) => (a.salaryNum || 0) - (b.salaryNum || 0));
  } else {
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  return list;
}

export default function Home() {
  const [state, setState] = useState<AppState>(() => {
    const initial = {
      keyword: '',
      region: '전체',
      job: '전체',
      weldSub: '전체',
      sort: 'newest',
      page: 1,
      allJobs: SAMPLE_JOBS,
      filtered: [],
    };
    initial.filtered = filterAndSort(SAMPLE_JOBS, initial);
    return initial;
  });
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [regionOpen, setRegionOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const filterRef = useRef<HTMLDivElement>(null);
  const jobsSectionRef = useRef<HTMLElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, type = '') {
    setToast({ msg, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let resolved = false;
    const unsub = fbOnJobs((firebaseJobs) => {
      const data = firebaseJobs && firebaseJobs.length > 0 ? firebaseJobs : SAMPLE_JOBS;
      resolved = true;
      setState((prev) => {
        const filtered = filterAndSort(data, { ...prev, allJobs: data });
        return { ...prev, allJobs: data, filtered };
      });
      setLoading(false);
    });
    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        setState((prev) => {
          const filtered = filterAndSort(SAMPLE_JOBS, { ...prev, allJobs: SAMPLE_JOBS });
          return { ...prev, allJobs: SAMPLE_JOBS, filtered };
        });
        setLoading(false);
      }
    }, 3000);
    return () => { unsub(); clearTimeout(fallbackTimer); };
  }, []);

  useEffect(() => {
    function updateOffset() {
      if (filterRef.current && jobsSectionRef.current) {
        jobsSectionRef.current.style.paddingTop = '0px';
      }
    }
    updateOffset();
    window.addEventListener('resize', updateOffset);
    return () => window.removeEventListener('resize', updateOffset);
  }, [state.job]);

  function applyFilter(newState: Partial<AppState>) {
    setState((prev) => {
      const merged = { ...prev, ...newState, page: 1 };
      const filtered = filterAndSort(merged.allJobs, merged);
      return { ...merged, filtered };
    });
  }

  function handleSearch() {
    applyFilter({ keyword: searchInput.trim() });
  }

  function handlePreset(preset: string) {
    setSearchInput('');
    if (preset === 'salary_top') {
      applyFilter({ keyword: '', region: '전체', job: '전체', weldSub: '전체', sort: 'salary_desc' });
      showToast('💰 급여 높은 순으로 정렬했습니다');
    } else if (preset === 'weld') {
      applyFilter({ keyword: '', region: '전체', job: '용접', weldSub: '전체', sort: 'newest' });
      showToast('🔩 용접 일자리를 필터했습니다');
    } else if (preset === 'fire_guard') {
      applyFilter({ keyword: '', region: '전체', job: '화기감시자', weldSub: '전체', sort: 'newest' });
      showToast('🧯 화기감시자 일자리를 필터했습니다');
    } else if (preset === 'meal_lodging') {
      setState((prev) => {
        const list = prev.allJobs
          .filter((j) => !j.hidden)
          .filter((j) => j.meal?.includes('제공') && j.lodging?.includes('제공'))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return { ...prev, keyword: '', region: '전체', job: '전체', weldSub: '전체', sort: 'newest', page: 1, filtered: list };
      });
      showToast('🏠 숙식 제공 일자리를 표시합니다');
    } else if (preset === 'new_today') {
      const HOT_MS = 24 * 3600000;
      setState((prev) => {
        const list = prev.allJobs
          .filter((j) => !j.hidden)
          .filter((j) => Date.now() - new Date(j.date).getTime() < HOT_MS)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return { ...prev, keyword: '', region: '전체', job: '전체', weldSub: '전체', sort: 'newest', page: 1, filtered: list };
      });
      showToast('🆕 오늘 올라온 공고를 표시합니다');
    }
  }

  function resetAll() {
    setSearchInput('');
    applyFilter({ keyword: '', region: '전체', job: '전체', weldSub: '전체', sort: 'newest' });
    showToast('🔄 필터가 초기화되었습니다');
  }

  const homeSettings = getHomeSettings();
  const PAGE_SIZE = homeSettings.pageSize;
  const INFEED_EVERY = homeSettings.infeedEvery;
  const REGIONS = getRegions();
  const JOBS = getJobs();

  const pageItems = state.filtered.slice(0, state.page * PAGE_SIZE);
  const hasMore = pageItems.length < state.filtered.length;
  const showWeld = state.job === '용접' || WELD_SUBS.includes(state.job);

  const hasActiveFilter =
    state.keyword || state.region !== '전체' || state.job !== '전체' || state.weldSub !== '전체';

  const infeedCode = localStorage.getItem('cj_ad_main_infeed') || '';
  const infeedImgAd = getImgAd('main_infeed');

  function buildGridItems() {
    const items: React.ReactNode[] = [];
    pageItems.forEach((job, idx) => {
      items.push(<JobCard key={job.id} job={job} />);
      const isLastItem = idx === pageItems.length - 1;
      const showInfeed = !isLastItem && (idx + 1) % INFEED_EVERY === 0;
      if (showInfeed && (infeedImgAd || infeedCode.trim())) {
        const imgStyle: React.CSSProperties = {
          width: '100%',
          height: 'auto',
          minHeight: homeSettings.adInfeedHeight,
          maxHeight: 200,
          objectFit: 'cover',
        };
        const infeedContent = infeedImgAd ? (
          infeedImgAd.url
            ? <a href={infeedImgAd.url} target="_blank" rel="noopener noreferrer">
                <img src={infeedImgAd.src} alt="광고" className="block rounded-lg" style={{ ...imgStyle, cursor: 'pointer' }} />
              </a>
            : <img src={infeedImgAd.src} alt="광고" className="block rounded-lg" style={imgStyle} />
        ) : (
          <div
            className="w-full rounded-lg border border-dashed border-gray-300 overflow-hidden"
            style={{ background: '#fffde7', minHeight: homeSettings.adInfeedHeight }}
            dangerouslySetInnerHTML={{ __html: infeedCode }}
          />
        );
        items.push(
          <div key={`infeed-${idx}`} className="col-span-full flex justify-center overflow-hidden">
            <div style={{ width: '100%', maxWidth: homeSettings.adMaxWidth }}>
              {infeedContent}
            </div>
          </div>
        );
      }
    });
    return items;
  }

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <div className="max-w-[1100px] mx-auto px-3.5 pt-2.5 pb-10">

        {/* ① 상단 배너 광고 */}
        <AdSlot storageKey="cj_ad_main_top" minHeight={homeSettings.adTopHeight} maxWidth={homeSettings.adMaxWidth} />

        {/* 추천 섹션 */}
        {homeSettings.showPopular && (<section className="mb-2.5">
          <div className="text-xs font-extrabold text-gray-500 mb-1.5 flex items-center gap-1 uppercase tracking-wide">
            🔥 지금 인기 있는 일자리
          </div>
          <div className="flex gap-[7px] overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            {[
              { preset: 'salary_top', emoji: '💰', title: '급여 높은 TOP 5', desc: '일당 높은 순' },
              { preset: 'meal_lodging', emoji: '🏠', title: '숙식 제공', desc: '숙박+식사 제공' },
              { preset: 'new_today', emoji: '🆕', title: '오늘 공고', desc: '24시간 이내' },
              { preset: 'fire_guard', emoji: '🧯', title: '화기감시자', desc: '전체 공고' },
            ].map((c) => (
              <button
                key={c.preset}
                className="shrink-0 bg-white border-[1.5px] border-gray-200 rounded-[10px] px-3 py-2 cursor-pointer hover:border-[#f97316] hover:shadow-sm hover:-translate-y-px transition-all flex items-center gap-2 min-w-[140px] max-w-[180px]"
                onClick={() => handlePreset(c.preset)}
              >
                <span className="text-[18px]">{c.emoji}</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-gray-800 leading-tight">{c.title}</div>
                  <div className="text-[10px] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">{c.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </section>)}

        {/* 검색 + 필터 (sticky) */}
        <section
          ref={filterRef}
          className="bg-white rounded-[10px] px-3.5 py-2.5 shadow-sm mb-0 sticky z-[100] border border-gray-200"
          style={{ top: 52 }}
        >
          <div className="flex gap-1.5 mb-2.5">
            <div className="flex-1 relative">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="지역·직종 키워드 검색 (예: 서울 TIG)"
                className="w-full py-[9px] pl-3 pr-10 border-[1.5px] border-gray-200 rounded-lg text-sm outline-none font-[inherit] transition-colors bg-gray-50 focus:border-[#f97316] focus:bg-white"
              />
              <span className="absolute right-[11px] top-1/2 -translate-y-1/2 text-[15px] pointer-events-none">🔍</span>
            </div>
            <button
              className="bg-[#f97316] text-white border-none py-[9px] px-4 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#ea580c] transition-colors min-w-16"
              onClick={handleSearch}
            >
              검색
            </button>
          </div>

          {hasActiveFilter && (
            <div className="flex flex-wrap gap-1 mb-[7px] py-[5px] px-2.5 bg-orange-50 rounded-lg border border-orange-200 items-center">
              <span className="text-[11px] font-bold text-[#f97316] mr-0.5">🔖 필터:</span>
              {state.keyword && (
                <button
                  className="inline-flex items-center gap-1 bg-[#f97316] text-white border-none rounded-full px-2.5 py-1 text-xs font-bold cursor-pointer hover:bg-[#ea580c]"
                  onClick={() => applyFilter({ keyword: '' })}
                >
                  🔍 {state.keyword} <span>✕</span>
                </button>
              )}
              {state.region !== '전체' && (
                <button
                  className="inline-flex items-center gap-1 bg-[#f97316] text-white border-none rounded-full px-2.5 py-1 text-xs font-bold cursor-pointer hover:bg-[#ea580c]"
                  onClick={() => applyFilter({ region: '전체' })}
                >
                  📍 {state.region} <span>✕</span>
                </button>
              )}
              {state.job !== '전체' && (
                <button
                  className="inline-flex items-center gap-1 bg-[#f97316] text-white border-none rounded-full px-2.5 py-1 text-xs font-bold cursor-pointer hover:bg-[#ea580c]"
                  onClick={() => applyFilter({ job: '전체', weldSub: '전체' })}
                >
                  🔧 {state.job} <span>✕</span>
                </button>
              )}
              {state.weldSub !== '전체' && (
                <button
                  className="inline-flex items-center gap-1 bg-[#f97316] text-white border-none rounded-full px-2.5 py-1 text-xs font-bold cursor-pointer hover:bg-[#ea580c]"
                  onClick={() => applyFilter({ weldSub: '전체' })}
                >
                  ⚙️ {state.weldSub} <span>✕</span>
                </button>
              )}
              <button
                className="ml-auto bg-white border-[1.5px] border-[#f97316] text-[#f97316] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer hover:bg-[#f97316] hover:text-white transition-all whitespace-nowrap"
                onClick={resetAll}
              >
                전체 초기화 ✕
              </button>
            </div>
          )}

          {/* ===== 지역 필터 ===== */}
          {/* 모바일: 아코디언 헤더 */}
          {isMobile ? (
            <button
              className="w-full flex items-center justify-between py-[7px] px-3 mb-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 cursor-pointer font-[inherit] hover:border-[#f97316] transition-colors"
              onClick={() => { setRegionOpen((o) => !o); setJobOpen(false); }}
            >
              <span className="flex items-center gap-1.5">
                <span>📍 지역 선택</span>
                {state.region !== '전체' && (
                  <span className="text-[#f97316] font-extrabold">— {state.region}</span>
                )}
              </span>
              <span
                className="text-gray-400 text-xs ml-1 inline-block transition-transform duration-300"
                style={{ transform: regionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >▼</span>
            </button>
          ) : (
            <div className="text-[10px] font-extrabold text-gray-500 mb-1 flex items-center gap-1 uppercase tracking-wide">
              📍 지역
            </div>
          )}
          {/* 지역 칩 목록 */}
          <div
            style={isMobile ? {
              maxHeight: regionOpen ? '160px' : '0px',
              overflow: 'hidden',
              transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
            } : {}}
          >
            <div className="flex flex-wrap gap-1 mb-[7px]">
              {REGIONS.map((r) => (
                <button
                  key={r}
                  className={`px-2.5 py-1 rounded-2xl border-[1.5px] text-xs font-semibold cursor-pointer transition-all whitespace-nowrap font-[inherit] ${
                    state.region === r
                      ? 'bg-[#f97316] border-[#f97316] text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-[#f97316] hover:text-[#f97316]'
                  }`}
                  onClick={() => {
                    applyFilter({ region: state.region === r && r !== '전체' ? '전체' : r });
                    if (isMobile) setRegionOpen(false);
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* ===== 직종 필터 ===== */}
          {/* 모바일: 아코디언 헤더 */}
          {isMobile ? (
            <button
              className="w-full flex items-center justify-between py-[7px] px-3 mb-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 cursor-pointer font-[inherit] hover:border-[#f97316] transition-colors"
              onClick={() => { setJobOpen((o) => !o); setRegionOpen(false); }}
            >
              <span className="flex items-center gap-1.5">
                <span>🔧 직종 선택</span>
                {state.job !== '전체' && (
                  <span className="text-[#f97316] font-extrabold">— {state.job}</span>
                )}
              </span>
              <span
                className="text-gray-400 text-xs ml-1 inline-block transition-transform duration-300"
                style={{ transform: jobOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >▼</span>
            </button>
          ) : (
            <div className="text-[10px] font-extrabold text-gray-500 mb-1 flex items-center gap-1 uppercase tracking-wide">
              🔧 직종
            </div>
          )}
          {/* 직종 칩 목록 + 용접 세부 */}
          <div
            style={isMobile ? {
              maxHeight: jobOpen ? '300px' : '0px',
              overflow: 'hidden',
              transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1)',
            } : {}}
          >
            <div className="flex flex-wrap gap-1 mb-[7px]">
              {JOBS.map((j) => (
                <button
                  key={j}
                  className={`px-2.5 py-1 rounded-2xl border-[1.5px] text-xs font-semibold cursor-pointer transition-all whitespace-nowrap font-[inherit] ${
                    state.job === j || (j === '용접' && isWeld(state.job) && state.job !== '전체')
                      ? 'bg-[#f97316] border-[#f97316] text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-[#f97316] hover:text-[#f97316]'
                  }`}
                  onClick={() => {
                    if (state.job === j && j !== '전체') {
                      applyFilter({ job: '전체', weldSub: '전체' });
                    } else {
                      applyFilter({ job: j, weldSub: '전체' });
                    }
                  }}
                >
                  {JOB_EMOJI[j] || ''} {j}
                  {j === '용접' && ' ▼'}
                </button>
              ))}
            </div>

            {showWeld && (
              <div>
                <div className="text-[10px] font-extrabold mb-1 flex items-center gap-1" style={{ color: '#7c3aed' }}>
                  ⚙️ 용접 세부종류
                </div>
                <div className="flex flex-wrap gap-1 mb-[7px]">
                  {['전체 용접', 'TIG', '아크', 'CO2', 'PVC'].map((w) => {
                    const val = w === '전체 용접' ? '전체' : w;
                    return (
                      <button
                        key={w}
                        className={`px-2.5 py-[3px] rounded-2xl border-[1.5px] text-[11px] font-semibold cursor-pointer transition-all whitespace-nowrap font-[inherit] ${
                          state.weldSub === val
                            ? 'text-white border-purple-700'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-purple-500 hover:text-purple-700'
                        }`}
                        style={state.weldSub === val ? { background: '#7c3aed', borderColor: '#7c3aed' } : {}}
                        onClick={() => applyFilter({ weldSub: val, job: val === '전체' ? '용접' : val })}
                      >
                        {w === '전체 용접' ? '⚡ 전체 용접' : w === 'TIG' ? '⚡ TIG' : w === '아크' ? '🌟 아크' : w === 'CO2' ? '💨 CO2' : '🟢 PVC'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 pt-1.5 border-t border-gray-100 flex-wrap">
            <span className="text-xs text-gray-500 font-semibold">정렬</span>
            <div className="relative inline-flex items-center">
              <select
                value={state.sort}
                onChange={(e) => applyFilter({ sort: e.target.value })}
                className="py-[5px] pl-[9px] pr-7 border-[1.5px] border-gray-200 rounded-lg text-xs outline-none cursor-pointer bg-white font-[inherit] transition-colors appearance-none focus:border-[#f97316]"
              >
                <option value="newest">최신순</option>
                <option value="salary_desc">급여 높은순</option>
                <option value="salary_asc">급여 낮은순</option>
              </select>
              <span className="absolute right-2 pointer-events-none text-[10px] text-gray-400">▼</span>
            </div>
            <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">
              총 <strong className="text-[#f97316] text-[13px]">{state.filtered.length}</strong>개
            </span>
          </div>
        </section>

        {/* 일자리 그리드 (② 인피드 광고 포함) */}
        <section ref={jobsSectionRef} className="relative z-[1] mt-2">
          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2.5 mt-0">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 h-48 animate-pulse" />
              ))}
            </div>
          ) : state.filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 col-span-full">
              <div className="text-5xl mb-3">🔍</div>
              <div className="text-lg font-bold text-gray-700 mb-1.5">검색 결과가 없습니다</div>
              <div className="text-sm">다른 키워드나 필터를 사용해 보세요</div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2.5 mt-0">
              {buildGridItems()}
            </div>
          )}

          {hasMore && !loading && (
            <div className="text-center mt-5">
              <button
                className={`bg-white border-2 border-[#f97316] text-[#f97316] px-10 py-3.5 rounded-xl text-[15px] font-bold cursor-pointer hover:bg-[#f97316] hover:text-white transition-all inline-flex items-center gap-2 ${loadMoreBusy ? 'opacity-60 pointer-events-none' : ''}`}
                onClick={() => {
                  setLoadMoreBusy(true);
                  setTimeout(() => {
                    setState((prev) => ({ ...prev, page: prev.page + 1 }));
                    setLoadMoreBusy(false);
                  }, 400);
                }}
              >
                {loadMoreBusy ? (
                  <span className="inline-block w-4 h-4 border-[2.5px] border-current border-t-transparent rounded-full animate-spin" />
                ) : null}
                더 보기 ({pageItems.length} / {state.filtered.length}) ↓
              </button>
            </div>
          )}
        </section>

        {/* ③ 하단 배너 광고 */}
        <AdSlot storageKey="cj_ad_main_bottom" minHeight={homeSettings.adBottomHeight} maxWidth={homeSettings.adMaxWidth} />

      </div>

      {/* 푸터 */}
      <footer style={{ background: '#1e3a5f' }} className="mt-4 py-6 text-center text-white">
        <div className="flex items-center justify-center gap-5 mb-3 text-sm">
          <a href="/" className="text-white/80 hover:text-white no-underline flex items-center gap-1 transition-colors">
            🏠 홈
          </a>
          <a href="/admin" className="text-white/80 hover:text-white no-underline flex items-center gap-1 transition-colors">
            ⚙️ 관리자
          </a>
        </div>
        <p className="text-sm font-bold mb-1">
          {localStorage.getItem('cj_footer_title') || '건설UP — 전국 건설 현장 일자리 정보'}
        </p>
        <p className="text-xs text-white/70 mb-2">
          {localStorage.getItem('cj_footer_jobs') || '배관 · 용접(TIG/아크/CO2/PVC) · 조공 · 화기감시자 · 형틀 · 철근 · 미장 · 도장'}
        </p>
        <p className="text-[11px] text-white/45">
          {localStorage.getItem('cj_footer_notice') || '※ 게재된 일자리 정보는 등록자 제공으로 정확성을 보장하지 않습니다.'}
        </p>
      </footer>

      {/* 스크롤 탑 */}
      <ScrollTopButton />

      {/* 토스트 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-semibold text-white shadow-lg z-[9999] whitespace-nowrap pointer-events-none ${
            toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-[#1e3a5f]'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ScrollTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const handler = () => setShow(window.scrollY > 400);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);
  if (!show) return null;
  return (
    <button
      className="fixed bottom-20 right-[18px] w-11 h-11 bg-[#1e3a5f] text-white border-none rounded-full text-lg cursor-pointer shadow-md z-[150] flex items-center justify-center hover:bg-[#f97316] hover:-translate-y-0.5 transition-all"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      ↑
    </button>
  );
}
