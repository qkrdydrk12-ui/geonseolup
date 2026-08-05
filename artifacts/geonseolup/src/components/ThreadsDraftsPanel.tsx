import { useEffect, useState } from 'react';
import { getToken } from '@/lib/adminAuth';

interface ThreadsDraft {
  id: number;
  jobId: string;
  text: string;
  linkUrl: string;
  status: string;
  createdAt: string;
  imageStyle?: string | null;
  imageCopy?: string | null;
  imagePrompt?: string | null;
  hasImage?: boolean;
}

// 신규 공고 중 "홍보할 만한" 것이 뜨면 서버가 자동으로 초안을 만들어 큐에 쌓아둔다.
// 여기서는 그 초안을 보고 그대로/수정해서 발행하거나 버릴 수만 있다 —
// 실제 Threads 발행은 반드시 이 화면에서 "발행" 버튼을 눌러야만 일어난다.
export default function ThreadsDraftsPanel() {
  const [drafts, setDrafts] = useState<ThreadsDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ id: number; text: string; ok: boolean } | null>(null);

  // 자동 초안과 별개로, 직접 문구를 써서 즉시 발행 (테스트 + 자유 발행용)
  const [composeText, setComposeText] = useState('');
  const [composeLink, setComposeLink] = useState('');
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeMsg, setComposeMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleComposePublish() {
    if (!composeText.trim()) return;
    if (!confirm('이 문구를 실제로 Threads에 발행할까요? 발행 후에는 되돌릴 수 없어요.')) return;
    setComposeBusy(true);
    setComposeMsg(null);
    try {
      const res = await fetch('/api/admin/threads/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ text: composeText.trim(), linkUrl: composeLink.trim() || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      setComposeMsg({ text: data.ok ? '✅ 발행 완료!' : `❌ ${data.message || '발행 실패'}`, ok: data.ok });
      if (data.ok) { setComposeText(''); setComposeLink(''); }
    } catch (e) {
      setComposeMsg({ text: `❌ 네트워크 오류: ${String(e)}`, ok: false });
    } finally {
      setComposeBusy(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/threads/drafts', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = (await res.json()) as { ok: boolean; drafts?: ThreadsDraft[] };
      if (data.ok && data.drafts) setDrafts(data.drafts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handlePublish(id: number) {
    if (!confirm('이 초안을 실제로 Threads에 발행할까요? 발행 후에는 되돌릴 수 없어요.')) return;
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/threads/drafts/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ text: editing[id] }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      setMsg({ id, text: data.ok ? '✅ 발행 완료!' : `❌ ${data.message || '발행 실패'}`, ok: data.ok });
      if (data.ok) setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setMsg({ id, text: `❌ 네트워크 오류: ${String(e)}`, ok: false });
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: number) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/threads/drafts/${id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  // 자동으로 만들지 않고, 필요한 초안만 골라서 이미지를 생성한다 (비용은 여기서만 발생).
  async function handleGenerateImage(id: number) {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/threads/drafts/${id}/generate-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, hasImage: true } : d)));
      } else {
        setMsg({ id, text: `❌ ${data.message || '이미지 생성 실패'}`, ok: false });
      }
    } catch (e) {
      setMsg({ id, text: `❌ 네트워크 오류: ${String(e)}`, ok: false });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b-2 border-gray-100">
        <h2 className="text-lg font-bold text-[#1e3a5f]">🧵 Threads 홍보 초안</h2>
        <button
          className="text-xs font-bold text-gray-500 hover:text-[#f97316] cursor-pointer bg-transparent border-none"
          onClick={load}
        >
          🔄 새로고침
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        숙식 제공 또는 급여가 높은 신규 공고가 등록되면 자동으로 초안이 여기 쌓여요.
        내용을 확인·수정한 뒤 발행 버튼을 눌러야만 실제로 Threads에 올라갑니다 (자동 발행 아님).
      </p>

      {/* 직접 작성해서 발행 (테스트용 + 자유 발행) */}
      <div className="border border-dashed border-gray-300 rounded-lg p-4 mb-5 bg-gray-50">
        <p className="text-xs font-bold text-gray-600 mb-2">✍️ 직접 작성해서 바로 발행</p>
        <textarea
          value={composeText}
          onChange={(e) => setComposeText(e.target.value)}
          rows={3}
          placeholder="발행할 문구를 입력하세요 (링크·전화번호는 본문에 넣지 마세요)"
          className="w-full text-sm border border-gray-200 rounded-lg p-2.5 mb-2 outline-none focus:border-[#f97316] font-[inherit] bg-white"
        />
        <input
          value={composeLink}
          onChange={(e) => setComposeLink(e.target.value)}
          placeholder="댓글로 붙일 링크 (선택, 예: https://geonseolup.com)"
          className="w-full text-xs border border-gray-200 rounded-lg p-2 mb-2 outline-none focus:border-[#f97316] font-[inherit] bg-white"
        />
        <div className="flex items-center gap-2">
          <button
            disabled={composeBusy || !composeText.trim()}
            className="bg-[#f97316] text-white border-none px-4 py-2 rounded-lg text-xs font-bold cursor-pointer hover:bg-[#ea580c] disabled:opacity-60"
            onClick={handleComposePublish}
          >
            {composeBusy ? '처리 중…' : '🚀 발행하기'}
          </button>
          {composeMsg && (
            <span className={`text-xs font-semibold ${composeMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{composeMsg.text}</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">불러오는 중…</div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">자동 생성된 대기 초안은 없어요. 위에서 직접 작성해 발행할 수 있어요.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {drafts.map((d) => (
            <div key={d.id} className="border border-gray-200 rounded-lg p-4">
              <textarea
                value={editing[d.id] ?? d.text}
                onChange={(e) => setEditing((prev) => ({ ...prev, [d.id]: e.target.value }))}
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg p-2.5 mb-2 outline-none focus:border-[#f97316] font-[inherit]"
              />
              <p className="text-[11px] text-gray-400 mb-3">
                댓글로 자동 첨부될 링크: <span className="text-[#1e3a5f] font-semibold">{d.linkUrl}</span>
              </p>
              {d.imageStyle && (
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-3">
                  {d.hasImage && (
                    <img
                      src={`/api/threads-image/${d.id}`}
                      alt={d.imageStyle}
                      className="w-full max-w-xs rounded-lg mb-2 border border-orange-200"
                    />
                  )}
                  <p className="text-[11px] font-bold text-[#f97316] mb-1.5">
                    🎨 이번 게시글 이미지 스타일: {d.imageStyle} (최근 10개와 겹치지 않게 자동 로테이션됨)
                    {d.hasImage ? ' — 발행 시 이 이미지와 함께 올라갑니다' : ''}
                  </p>
                  {d.imageCopy && (
                    <p className="text-[11px] text-gray-600 mb-1">
                      이미지 문구: <span className="font-semibold text-gray-800">{d.imageCopy}</span>
                    </p>
                  )}
                  {d.imagePrompt && (
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      AI 이미지 프롬프트: {d.imagePrompt}
                    </p>
                  )}
                  {!d.hasImage && (
                    <button
                      disabled={busyId === d.id}
                      className="mt-2 bg-white text-[#f97316] border-[1.5px] border-[#f97316] px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer hover:bg-[#f97316] hover:text-white transition-all disabled:opacity-60"
                      onClick={() => handleGenerateImage(d.id)}
                    >
                      {busyId === d.id ? '이미지 생성 중…' : '🎨 이미지 생성 (필요할 때만 클릭 — 비용 발생)'}
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  disabled={busyId === d.id}
                  className="bg-[#f97316] text-white border-none px-4 py-2 rounded-lg text-xs font-bold cursor-pointer hover:bg-[#ea580c] disabled:opacity-60"
                  onClick={() => handlePublish(d.id)}
                >
                  {busyId === d.id ? '처리 중…' : '🚀 발행하기'}
                </button>
                <button
                  disabled={busyId === d.id}
                  className="bg-white text-gray-500 border-[1.5px] border-gray-200 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer hover:border-red-300 hover:text-red-500 disabled:opacity-60"
                  onClick={() => handleReject(d.id)}
                >
                  삭제
                </button>
                {msg?.id === d.id && (
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
