import { useEffect, useState } from 'react';
import { getToken } from '@/lib/adminAuth';

interface CommentRow {
  id: number;
  contentType: 'blog' | 'news' | 'toon';
  contentId: string;
  author: string;
  body: string;
  hidden: boolean;
  createdAt: string;
}

const TYPE_LABEL: Record<CommentRow['contentType'], string> = {
  blog: '건설꿀팁',
  news: '현장소식',
  toon: '노가다툰',
};
const DETAIL_PATH: Record<CommentRow['contentType'], string> = {
  blog: '/info',
  news: '/news',
  toon: '/toon',
};

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
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `요청 실패 (${res.status})`);
  }
  return res.json();
}

// 댓글 관리(2026-09-10 신설) — 로그인 없이 익명으로 달리는 댓글이라 스팸/부적절한 글이 있으면
// 관리자가 숨기거나(복구 가능) 완전 삭제할 수 있게 한다. AdminBlogArticles.tsx와 동일한 apiFetch 패턴.
export default function AdminComments({ showToast }: { showToast: (msg: string) => void }) {
  const [rows, setRows] = useState<CommentRow[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'visible' | 'hidden'>('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function reload() {
    try {
      const data = await apiFetch('/api/admin/comments?limit=300');
      setRows(data.rows ?? []);
    } catch {
      showToast('❌ 댓글 목록을 불러오지 못했습니다');
      setRows([]);
    }
  }

  useEffect(() => { reload(); }, []);

  async function toggleHidden(row: CommentRow) {
    setBusyId(row.id);
    try {
      await apiFetch(`/api/admin/comments/${row.id}/hidden`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: !row.hidden }),
      });
      setRows((prev) => prev && prev.map((r) => (r.id === row.id ? { ...r, hidden: !r.hidden } : r)));
      showToast(row.hidden ? '✅ 다시 표시했습니다' : '✅ 숨겼습니다');
    } catch {
      showToast('❌ 처리 실패');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: CommentRow) {
    if (!confirm(`"${row.body.slice(0, 30)}" 댓글을 완전히 삭제할까요? (복구 불가)`)) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/api/admin/comments/${row.id}`, { method: 'DELETE' });
      setRows((prev) => prev && prev.filter((r) => r.id !== row.id));
      showToast('🗑 삭제됐습니다');
    } catch {
      showToast('❌ 삭제 실패');
    } finally {
      setBusyId(null);
    }
  }

  const filtered = (rows ?? []).filter((r) => {
    if (filter === 'visible') return !r.hidden;
    if (filter === 'hidden') return r.hidden;
    return true;
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-extrabold text-gray-700">댓글 관리 {rows && `(${rows.length})`}</h3>
        <div className="flex gap-1.5">
          {([
            { key: 'all', label: '전체' },
            { key: 'visible', label: '표시중' },
            { key: 'hidden', label: '숨김' },
          ] as const).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border font-[inherit] ${
                filter === f.key ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button type="button" onClick={reload} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer bg-gray-50 text-gray-500 border border-gray-200 font-[inherit]">
            새로고침
          </button>
        </div>
      </div>

      {rows === null && <p className="text-sm text-gray-400 text-center py-8">불러오는 중...</p>}
      {rows !== null && filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">댓글이 없습니다.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((r) => (
          <div
            key={r.id}
            className={`rounded-xl border p-3.5 ${r.hidden ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200'}`}
          >
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-white bg-gray-500 px-2 py-0.5 rounded-full">{TYPE_LABEL[r.contentType]}</span>
              <a
                href={`${DETAIL_PATH[r.contentType]}/${r.contentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11.5px] text-blue-600 hover:underline"
              >
                {r.contentId}
              </a>
              <span className="text-[11.5px] font-bold text-gray-700">{r.author}</span>
              <span className="text-[10.5px] text-gray-400">{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
              {r.hidden && <span className="text-[10.5px] font-bold text-red-500">숨김됨</span>}
            </div>
            <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap break-words mb-2">{r.body}</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => toggleHidden(r)}
                disabled={busyId === r.id}
                className="px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer bg-gray-100 text-gray-600 border-none disabled:opacity-50 font-[inherit]"
              >
                {r.hidden ? '다시 표시' : '숨기기'}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(r)}
                disabled={busyId === r.id}
                className="px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer bg-red-50 text-red-500 border-none disabled:opacity-50 font-[inherit]"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
