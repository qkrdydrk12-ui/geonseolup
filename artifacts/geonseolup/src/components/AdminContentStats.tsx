import { useEffect, useState } from 'react';
import { getToken } from '@/lib/adminAuth';
import { sortByStat, summarizeStats, getCounts, isLowPerformer, type SortKey, type CountsMap } from '@/lib/contentStats';
import AdminSortToggle from './AdminSortToggle';
import AdminStatsSummaryBar from './AdminStatsSummaryBar';
import AdminContentTable, { type AdminContentTableRow } from './AdminContentTable';

type ContentType = 'blog' | 'news' | 'toon';

const TYPE_LABEL: Record<ContentType, string> = { blog: '건설 꿀팁', news: '현장 소식', toon: '노가다툰' };
const TYPE_BADGE_CLASS: Record<ContentType, string> = {
  blog: 'bg-orange-50 text-[#f97316]',
  news: 'bg-blue-50 text-blue-600',
  toon: 'bg-purple-50 text-purple-600',
};

interface UnifiedRow {
  type: ContentType;
  key: string;
  title: string;
  slug: string | null;
  dateMs: number;
  editTab: 'blog' | 'news' | 'toon';
}

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

// 블로그(건설 꿀팁)·현장소식·노가다툰을 한 목록으로 합쳐서 조회수·좋아요 랭킹을 한눈에 보여주는 탭.
// 각 콘텐츠 타입의 개별 관리(등록/수정/삭제)는 여전히 각자의 탭에서 하고, 여기는 "성과 비교" 전용이다.
export default function AdminContentStats({ onGoToTab }: { onGoToTab: (tab: 'blog' | 'news' | 'toon') => void }) {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [counts, setCounts] = useState<CountsMap>({});
  const [loading, setLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [typeFilter, setTypeFilter] = useState<ContentType | 'all'>('all');
  const [range, setRange] = useState('');

  // 글 목록(제목/날짜 등) — 기간과 무관하니 마운트 시 한 번만.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [blogList, newsList, toonList] = await Promise.all([
          apiFetch('/api/blog-articles/all'),
          apiFetch('/api/site-news/all'),
          apiFetch('/api/toon/all'),
        ]);

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
        ];
        setRows(unified);
      } catch {
        // 조용히 무시 — 통계 탭은 부가 정보라 실패해도 다른 탭 사용엔 지장 없음
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 조회수·좋아요 — 기간 선택(range)이 바뀔 때마다 다시 불러온다.
  useEffect(() => {
    (async () => {
      setCountsLoading(true);
      try {
        const qs = range ? `&range=${range}` : '';
        const [blogCounts, newsCounts, toonCounts] = await Promise.all([
          apiFetch(`/api/admin/content-views?type=blog${qs}`),
          apiFetch(`/api/admin/content-views?type=news${qs}`),
          apiFetch(`/api/admin/content-views?type=toon${qs}`),
        ]);
        const mergedCounts: CountsMap = {};
        for (const src of [blogCounts, newsCounts, toonCounts]) {
          for (const r of src.rows ?? []) mergedCounts[r.contentId] = { views: r.views, likes: r.likes };
        }
        setCounts(mergedCounts);
      } catch {
        // 조용히 무시 — 통계 탭은 부가 정보라 실패해도 다른 탭 사용엔 지장 없음
      } finally {
        setCountsLoading(false);
      }
    })();
  }, [range]);

  const filteredRows = typeFilter === 'all' ? rows : rows.filter((r) => r.type === typeFilter);
  const sortedRows = sortByStat(filteredRows, counts, (r) => r.slug, sortKey);
  const statsSummary = summarizeStats(filteredRows, counts, (r) => r.slug);

  const tableRows: AdminContentTableRow[] = sortedRows.map((r) => {
    const c = getCounts(counts, r.slug);
    return {
      key: r.key,
      title: r.title,
      badges: [{ label: TYPE_LABEL[r.type], className: TYPE_BADGE_CLASS[r.type] }],
      metaLine: new Date(r.dateMs).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' }),
      views: c.views,
      likes: c.likes,
      lowView: !!r.slug && isLowPerformer(c.views, r.dateMs),
      onEdit: () => onGoToTab(r.editTab),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3 flex-wrap gap-2">
          <h3 className="text-sm font-extrabold text-gray-700">콘텐츠 성과 ({filteredRows.length})</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">
              {([
                { key: 'all', label: '전체' },
                { key: 'blog', label: '건설 꿀팁' },
                { key: 'news', label: '현장 소식' },
                { key: 'toon', label: '노가다툰' },
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
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">조회수는 선택한 기간 기준, 좋아요는 항상 전체 누적입니다.</p>
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
