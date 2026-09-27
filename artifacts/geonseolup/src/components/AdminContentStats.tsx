import { useEffect, useState } from 'react';
import { getToken } from '@/lib/adminAuth';
import { sortByStat, summarizeStats, getCounts, isLowPerformer, type SortKey, type CountsMap } from '@/lib/contentStats';
import AdminSortToggle from './AdminSortToggle';
import AdminStatsSummaryBar from './AdminStatsSummaryBar';
import AdminContentTable, { type AdminContentTableRow } from './AdminContentTable';

// blog/news/toon은 글 단위 조회 API(content_view_events)로, 나머지(calc/shuttle/video/quality)는
// 사이트 전체 페이지 이동 기록(page_view_events)을 경로(path)별로 집계한 조회수를 쓴다.
type ContentType = 'blog' | 'news' | 'toon' | 'calc' | 'shuttle' | 'video' | 'quality';
type EditableTab = 'blog' | 'news' | 'toon';

const TYPE_LABEL: Record<ContentType, string> = {
  blog: '건설 꿀팁', news: '현장 소식', toon: '노가다툰',
  calc: '계산기', shuttle: '셔틀시간표', video: '동영상', quality: '품질기준',
};
const TYPE_BADGE_CLASS: Record<ContentType, string> = {
  blog: 'bg-orange-50 text-[#f97316]',
  news: 'bg-blue-50 text-blue-600',
  toon: 'bg-purple-50 text-purple-600',
  calc: 'bg-green-50 text-green-600',
  shuttle: 'bg-sky-50 text-sky-600',
  video: 'bg-pink-50 text-pink-600',
  quality: 'bg-gray-100 text-gray-600',
};

interface UnifiedRow {
  type: ContentType;
  key: string;
  title: string;
  slug: string | null; // 조회수 조회 키 — blog/news/toon은 slug, 나머지는 페이지 경로(예: /net-pay-calculator)
  dateMs: number;
  editTab: EditableTab | null; // 관리자 탭이 따로 없는 콘텐츠는 null(수정 버튼 없음)
  pagePath?: string; // 페이지 경로 기반 행이면 등록일 대신 이 경로를 메타 줄에 보여준다
}

// 글 목록 API가 없는 고정 페이지들 — 홈 상단 메뉴(계산기/셔틀시간표/동영상/품질기준)와 같은 구성.
const STATIC_PAGE_ROWS: UnifiedRow[] = [
  { type: 'calc', title: '실수령액 계산기', path: '/net-pay-calculator' },
  { type: 'calc', title: '퇴직금 계산기', path: '/severance-pay-calculator' },
  { type: 'calc', title: '퇴직공제금 계산기', path: '/retirement-fund-calculator' },
  { type: 'calc', title: '근로계약서 양식', path: '/labor-contract-template' },
  { type: 'shuttle', title: '용인SK 셔틀시간표', path: '/info/yongin-sk-shuttle-schedule' },
  { type: 'shuttle', title: '평택삼성 셔틀시간표', path: '/info/pyeongtaek-samsung-shuttle-schedule' },
  { type: 'video', title: '동영상 · 앱 설치 방법', path: '/guide?v=app-install' },
  { type: 'video', title: '동영상 · 공수표 알림 설정', path: '/guide?v=gongsu-alert' },
  { type: 'video', title: '동영상 · 복합동 설명영상', path: '/guide?v=bokhapdong' },
  { type: 'quality', title: '품질기준 목록', path: '/quality' },
].map((r) => ({
  type: r.type as ContentType, key: `page-${r.path}`, title: r.title, slug: r.path, dateMs: 0, editTab: null, pagePath: r.path,
}));

// [[job-views]]의 AdminJobViews.tsx와 동일한 패턴 (2026-09-08 추가) — range는 그대로
// /api/admin/content-views에 전달된다. ''(전체)은 기존 기본 동작(전체 누적) 그대로 유지.
const PERIODS = [
  { range: '', label: '전체' },
  { range: 'today', label: '오늘' },
  { range: 'yesterday', label: '어제' },
  { range: '7', label: '최근 7일' },
  { range: '14', label: '최근 14일' },
  { range: '30', label: '최근 30일' },
];

async function apiFetch(url: string) {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
  return res.json();
}

// 블로그(건설 꿀팁)·현장소식·노가다툰에 더해 계산기·셔틀시간표·동영상·품질기준까지 한 목록으로 합쳐서
// 조회수·좋아요 랭킹을 한눈에 보여주는 탭. 각 콘텐츠 타입의 개별 관리(등록/수정/삭제)는 여전히
// 각자의 탭에서 하고, 여기는 "성과 비교" 전용이다.
export default function AdminContentStats({ onGoToTab }: { onGoToTab: (tab: EditableTab) => void }) {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [counts, setCounts] = useState<CountsMap>({});
  const [loading, setLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [typeFilter, setTypeFilter] = useState<ContentType | 'all'>('all');
  const [range, setRange] = useState('');

  // 글 목록(제목/날짜 등) — 처음 마운트될 때 + reloadKey가 바뀔 때(새로고침 버튼) 다시 불러온다.
  // 2026-09-10: 예전엔 마운트 시 한 번만 불러왔는데, 이 탭을 오래 띄워둔 채로 있으면(다른 탭 안 갔다옴)
  // 새 글이 올라와도 숫자가 안 늘어나 보인다는 지적(사용자: "콘텐츠 성과 총 글이 112개로 업데이트가 안된거같아")
  // — 새로고침 버튼을 추가해서 페이지 리로드 없이도 최신 상태를 다시 불러올 수 있게 함.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 2026-09-15: Promise.all이었을 때 셋 중 하나(blog-articles/all)만 503으로 실패해도
        // 나머지 둘(news/toon)까지 통째로 버려져 "콘텐츠 성과 0건"으로 보이는 사고가 있었다
        // (blog-articles/all의 근본 원인은 blogArticles.ts에서 수정, 여기는 재발방지 차원의 방어).
        // allSettled로 바꿔서 일부만 실패해도 나머지는 정상 표시되게 한다.
        const [blogResult, newsResult, toonResult, qualityResult] = await Promise.allSettled([
          apiFetch('/api/blog-articles/all'),
          apiFetch('/api/site-news/all'),
          apiFetch('/api/toon/all'),
          apiFetch('/api/quality-topics'),
        ]);
        const blogList = blogResult.status === 'fulfilled' ? blogResult.value : { rows: [] };
        const newsList = newsResult.status === 'fulfilled' ? newsResult.value : { rows: [] };
        const toonList = toonResult.status === 'fulfilled' ? toonResult.value : { rows: [] };
        const qualityList = qualityResult.status === 'fulfilled' ? qualityResult.value : { rows: [] };
        for (const [label, r] of [['blog', blogResult], ['news', newsResult], ['toon', toonResult], ['quality', qualityResult]] as const) {
          if (r.status === 'rejected') console.error(`[ContentStats] ${label} 목록 조회 실패:`, r.reason);
        }

        const unified: UnifiedRow[] = [
          ...(blogList.rows ?? []).map((r: { id: number; slug: string; title: string; createdAt: string }) => ({
            type: 'blog' as const, key: `blog-${r.id}`, title: r.title, slug: r.slug, dateMs: new Date(r.createdAt).getTime(), editTab: 'blog' as const,
          })),
          ...(newsList.rows ?? []).map((r: { id: number; slug: string | null; title: string; publishedAt: string }) => ({
            type: 'news' as const, key: `news-${r.id}`, title: r.title, slug: r.slug, dateMs: new Date(r.publishedAt).getTime(), editTab: 'news' as const,
          })),
          ...(toonList.rows ?? []).map((r: { id: number; slug: string; title: string; episodeNumber: number; createdAt: string }) => ({
            type: 'toon' as const, key: `toon-${r.id}`, title: `${r.episodeNumber}화 ${r.title}`, slug: r.slug, dateMs: new Date(r.createdAt).getTime(), editTab: 'toon' as const,
          })),
          ...STATIC_PAGE_ROWS,
          // 품질기준 상세 페이지(/quality/슬러그)는 항목마다 조회수가 따로 쌓인다. 목록 API에 등록일이 없어 dateMs는 0.
          ...(qualityList.rows ?? []).map((r: { id: number; code: string; title: string; slug: string }) => ({
            type: 'quality' as const, key: `quality-${r.id}`, title: `${r.code} ${r.title}`, slug: `/quality/${r.slug}`, dateMs: 0, editTab: null, pagePath: `/quality/${r.slug}`,
          })),
        ];
        setRows(unified);
      } catch {
        // 조용히 무시 — 통계 탭은 부가 정보라 실패해도 다른 탭 사용엔 지장 없음
      } finally {
        setLoading(false);
      }
    })();
  }, [reloadKey]);

  // 조회수·좋아요 — 기간 선택(range)이 바뀔 때마다 다시 불러온다.
  useEffect(() => {
    (async () => {
      setCountsLoading(true);
      try {
        const qs = range ? `&range=${range}` : '';
        // 위 글 목록 로딩과 같은 이유로 allSettled — 조회수 API 하나가 실패해도 나머지 타입 숫자는 보여준다.
        const results = await Promise.allSettled([
          apiFetch(`/api/admin/content-views?type=blog${qs}`),
          apiFetch(`/api/admin/content-views?type=news${qs}`),
          apiFetch(`/api/admin/content-views?type=toon${qs}`),
          apiFetch(`/api/admin/content-views?type=page${qs}`), // 계산기·셔틀시간표·동영상·품질기준(경로별)
        ]);
        const mergedCounts: CountsMap = {};
        let guideNoQueryViews = 0;
        for (const r of results) {
          if (r.status !== 'fulfilled') { console.error('[ContentStats] 조회수 조회 실패:', r.reason); continue; }
          for (const row of r.value.rows ?? []) {
            if (row.contentId === '/guide') { guideNoQueryViews += row.views; continue; }
            mergedCounts[row.contentId] = { views: row.views, likes: row.likes };
          }
        }
        // 동영상 페이지는 ?v= 없이 들어오면 첫 영상(앱 설치 방법)이 재생되므로 그 조회수에 합친다.
        if (guideNoQueryViews > 0) {
          const k = '/guide?v=app-install';
          mergedCounts[k] = { views: (mergedCounts[k]?.views ?? 0) + guideNoQueryViews, likes: 0 };
        }
        setCounts(mergedCounts);
      } catch {
        // 조용히 무시 — 통계 탭은 부가 정보라 실패해도 다른 탭 사용엔 지장 없음
      } finally {
        setCountsLoading(false);
      }
    })();
  }, [range, reloadKey]);

  const filteredRows = typeFilter === 'all' ? rows : rows.filter((r) => r.type === typeFilter);
  const sortedRows = sortByStat(filteredRows, counts, (r) => r.slug, sortKey);
  const statsSummary = summarizeStats(filteredRows, counts, (r) => r.slug);

  const tableRows: AdminContentTableRow[] = sortedRows.map((r) => {
    const c = getCounts(counts, r.slug);
    const editTab = r.editTab;
    return {
      key: r.key,
      title: r.title,
      badges: [{ label: TYPE_LABEL[r.type], className: TYPE_BADGE_CLASS[r.type] }],
      // 페이지 경로 기반 행(계산기 등)은 등록일 개념이 없어 경로를 대신 보여준다.
      metaLine: r.pagePath ?? new Date(r.dateMs).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' }),
      views: c.views,
      likes: c.likes,
      lowView: !!r.slug && !r.pagePath && isLowPerformer(c.views, r.dateMs),
      onEdit: editTab ? () => onGoToTab(editTab) : undefined,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3 flex-wrap gap-2">
          <h3 className="text-sm font-extrabold text-gray-700">콘텐츠 성과 ({filteredRows.length})</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-wrap gap-1 bg-gray-100 rounded-2xl p-0.5">
              {([
                { key: 'all', label: '전체' },
                { key: 'blog', label: '건설 꿀팁' },
                { key: 'news', label: '현장 소식' },
                { key: 'toon', label: '노가다툰' },
                { key: 'calc', label: '계산기' },
                { key: 'shuttle', label: '셔틀시간표' },
                { key: 'video', label: '동영상' },
                { key: 'quality', label: '품질기준' },
              ] as const).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setTypeFilter(o.key)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full cursor-pointer font-[inherit] transition-colors ${
                    typeFilter === o.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.range}
                  type="button"
                  onClick={() => setRange(p.range)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full cursor-pointer font-[inherit] transition-colors ${
                    range === p.range ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {rows.length > 1 && <AdminSortToggle value={sortKey} onChange={setSortKey} />}
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading || countsLoading}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full cursor-pointer bg-gray-100 text-gray-500 border-none disabled:opacity-50 font-[inherit]"
            >
              ↻ 새로고침
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          조회수는 선택한 기간 기준, 좋아요는 항상 전체 누적입니다. 계산기·셔틀시간표·동영상·품질기준은 좋아요가 없고,
          같은 날 같은 방문자는 1회로 집계합니다(품질기준·동영상은 집계 시작일부터의 숫자).
        </p>
        <AdminStatsSummaryBar stats={statsSummary} />
        {loading || countsLoading ? (
          <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">등록된 글이 없습니다.</div>
        ) : (
          <AdminContentTable sortKey={sortKey} onSortChange={setSortKey} rows={tableRows} />
        )}
        <p className="text-[11px] text-gray-400 mt-3">"수정"을 누르면 해당 글이 있는 탭으로 이동합니다. 삭제는 각 탭에서 진행하세요.</p>
      </div>
    </div>
  );
}
