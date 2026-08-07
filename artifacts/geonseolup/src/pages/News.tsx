import { useEffect, useState } from 'react';
import Header from '@/components/Header';

interface SiteNews {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  sourceLabel: string;
  sourceUrl: string;
  publishedAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export default function News() {
  const [rows, setRows] = useState<SiteNews[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = '현장 소식 — 건설UP';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) {
      meta.content = '건설UP이 전하는 현장 안전 기준, 폭염·한파 대응, 업계 소식을 모아봅니다.';
    }
  }, []);

  useEffect(() => {
    fetch('/api/site-news')
      .then((res) => res.json())
      .then((d: { rows: SiteNews[] }) => setRows(d.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="max-w-[680px] mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-1">현장 소식</h1>
          <p className="text-sm text-gray-500">건설UP이 전하는 현장 안전 기준과 업계 소식입니다.</p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-200">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-200">아직 등록된 소식이 없습니다.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((r) => (
              <article key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {r.imageUrl && (
                  <img src={r.imageUrl} alt={r.title} className="w-full aspect-square object-cover" />
                )}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h2 className="text-base font-bold text-gray-900">{r.title}</h2>
                    {r.sourceLabel && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#f97316] shrink-0">{r.sourceLabel}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{r.body}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{formatDate(r.publishedAt)}</span>
                    {r.sourceUrl && (
                      <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#f97316] font-semibold no-underline">
                        원문 보기 →
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 leading-relaxed text-center">
          최신 구인공고는 <a href="/" className="text-[#f97316] font-semibold no-underline">건설UP 메인 페이지</a>에서 확인하세요.
        </p>
      </main>
    </div>
  );
}
