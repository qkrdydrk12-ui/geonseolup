import { useEffect, useState } from 'react';
import { getToken } from '@/lib/adminAuth';

interface PendingComment {
  id: number;
  threadsPostId: string;
  commentId: string;
  commenterUsername: string | null;
  commentText: string | null;
  suggestedReply: string | null;
  status: string;
  createdAt: string;
}

// Threads 댓글은 10분마다 서버가 자동으로 감시하고, 새 댓글이 오면 AI 답글을
// 만들어 즉시 자동 발행한다. 자동 발행에 실패한 건만 여기 남아, 수정 후
// Threads에 답글이 달린다 — 절대 자동으로 나가지 않는다.
export default function ThreadsCommentsPanel() {
  const [comments, setComments] = useState<PendingComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ id: number; text: string; ok: boolean } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/threads/comments', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = (await res.json()) as { ok: boolean; comments?: PendingComment[] };
      if (data.ok && data.comments) setComments(data.comments);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handlePollNow() {
    setPolling(true);
    try {
      await fetch('/api/admin/threads/comments/poll-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      await load();
    } finally {
      setPolling(false);
    }
  }

  async function handleReply(id: number) {
    const text = editing[id];
    if (!text?.trim()) return;
    if (!confirm('이 답글을 실제로 Threads에 발행할까요?')) return;
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/threads/comments/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      setMsg({ id, text: data.ok ? '✅ 답글 발행 완료!' : `❌ ${data.message || '발행 실패'}`, ok: data.ok });
      if (data.ok) setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setMsg({ id, text: `❌ 네트워크 오류: ${String(e)}`, ok: false });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(id: number) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/threads/comments/${id}/dismiss`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm mt-5">
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b-2 border-gray-100">
        <h2 className="text-lg font-bold text-[#1e3a5f]">💬 Threads 댓글 답글</h2>
        <div className="flex items-center gap-2">
          <button
            disabled={polling}
            className="text-xs font-bold text-white bg-[#1e3a5f] px-3 py-1.5 rounded-lg cursor-pointer hover:bg-[#2d5282] disabled:opacity-60"
            onClick={handlePollNow}
          >
            {polling ? '확인 중…' : '🔍 지금 새 댓글 확인'}
          </button>
          <button
            className="text-xs font-bold text-gray-500 hover:text-[#f97316] cursor-pointer bg-transparent border-none"
            onClick={load}
          >
            🔄 새로고침
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        발행한 글에 달린 새 댓글을 10분마다 자동으로 확인해 AI 답글을 만들어 <b>바로 자동 발행</b>해요.
        자동 발행에 실패한 댓글만 여기 남으니, 내용을 확인·수정한 뒤 직접 발행해주세요.
      </p>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">불러오는 중…</div>
      ) : comments.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">대기 중인 댓글이 없어요.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => (
            <div key={c.id} className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">
                <span className="font-semibold text-gray-700">@{c.commenterUsername || '알 수 없음'}</span> 님의 댓글
              </p>
              <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-2.5 mb-3">{c.commentText || '(내용 없음)'}</p>
              <p className="text-[11px] text-gray-400 mb-1.5">제안된 답글 (수정 가능)</p>
              <textarea
                value={editing[c.id] ?? c.suggestedReply ?? ''}
                onChange={(e) => setEditing((prev) => ({ ...prev, [c.id]: e.target.value }))}
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg p-2.5 mb-2 outline-none focus:border-[#f97316] font-[inherit]"
              />
              <div className="flex items-center gap-2">
                <button
                  disabled={busyId === c.id}
                  className="bg-[#f97316] text-white border-none px-4 py-2 rounded-lg text-xs font-bold cursor-pointer hover:bg-[#ea580c] disabled:opacity-60"
                  onClick={() => handleReply(c.id)}
                >
                  {busyId === c.id ? '처리 중…' : '🚀 답글 발행'}
                </button>
                <button
                  disabled={busyId === c.id}
                  className="bg-white text-gray-500 border-[1.5px] border-gray-200 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer hover:border-red-300 hover:text-red-500 disabled:opacity-60"
                  onClick={() => handleDismiss(c.id)}
                >
                  무시
                </button>
                {msg?.id === c.id && (
                  <span className={`text-xs font-semibold ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{msg.text}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
