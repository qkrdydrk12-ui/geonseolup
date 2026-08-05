// 관리자 페이지의 "정보글 수정" 탭.
// 원본 글(infoData.ts) 목록을 보여주고, 선택한 글을 수정하면 서버에
// override로 저장된다. "원본으로 복원"을 누르면 override가 삭제된다.
import { useEffect, useState } from 'react';
import { INFO_ARTICLES, type InfoArticle, fetchInfoOverrides, clearInfoOverridesCache } from '@/lib/infoData';
import { apiSaveInfoOverride, apiResetInfoOverride } from '@/lib/adminAuth';

interface Props {
  showToast: (msg: string) => void;
}

interface EditState {
  title: string;
  description: string;
  emoji: string;
  body: { subtitle: string; text: string }[];
}

function toEditState(a: InfoArticle): EditState {
  return {
    title: a.title,
    description: a.description,
    emoji: a.emoji,
    body: a.body.map((b) => ({ subtitle: b.subtitle ?? '', text: b.text })),
  };
}

export default function InfoEditPanel({ showToast }: Props) {
  const [overrides, setOverrides] = useState<Record<string, InfoArticle>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOverrides = async () => {
    clearInfoOverridesCache();
    const o = await fetchInfoOverrides();
    setOverrides(o);
    return o;
  };

  useEffect(() => {
    loadOverrides();
  }, []);

  const openArticle = (slug: string, ov: Record<string, InfoArticle> = overrides) => {
    const base = INFO_ARTICLES.find((a) => a.slug === slug);
    if (!base) return;
    const merged = ov[slug] ? { ...base, ...ov[slug] } : base;
    setSelected(slug);
    setEdit(toEditState(merged));
  };

  const handleSave = async () => {
    if (!selected || !edit) return;
    if (!edit.title.trim()) { showToast('제목을 입력해주세요'); return; }
    if (edit.body.some((b) => !b.text.trim())) { showToast('비어 있는 문단이 있습니다. 내용을 채우거나 문단을 삭제해주세요.'); return; }
    setSaving(true);
    const res = await apiSaveInfoOverride({
      slug: selected,
      title: edit.title.trim(),
      description: edit.description.trim(),
      emoji: edit.emoji.trim() || '📄',
      body: edit.body.map((b) => (b.subtitle.trim() ? { subtitle: b.subtitle.trim(), text: b.text } : { text: b.text })),
    });
    setSaving(false);
    if (res.ok) {
      showToast('저장했습니다. 사이트에 바로 반영됩니다.');
      await loadOverrides();
    } else {
      showToast(res.message || '저장에 실패했습니다');
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    if (!confirm('이 글의 수정 내용을 모두 지우고 원본으로 복원할까요?')) return;
    setSaving(true);
    const res = await apiResetInfoOverride(selected);
    setSaving(false);
    if (res.ok) {
      showToast('원본으로 복원했습니다.');
      const o = await loadOverrides();
      openArticle(selected, o);
    } else {
      showToast(res.message || '복원에 실패했습니다');
    }
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#f97316]';

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-bold text-[#1e3a5f] mb-1 pb-2.5 border-b-2 border-gray-100">✍️ 정보글 수정</h2>
      <p className="text-xs text-gray-400 mb-4">정보/꿀팁 페이지의 글을 수정할 수 있습니다. 저장하면 사이트에 바로 반영되고, 언제든 원본으로 복원할 수 있습니다.</p>

      {!selected && (
        <div className="space-y-2">
          {INFO_ARTICLES.map((a) => (
            <button
              key={a.slug}
              onClick={() => openArticle(a.slug)}
              className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 hover:border-[#f97316] transition-colors bg-white cursor-pointer flex items-center gap-3"
            >
              <span className="text-xl">{(overrides[a.slug]?.emoji) ?? a.emoji}</span>
              <span className="flex-1 text-sm font-semibold text-[#1e3a5f]">
                {(overrides[a.slug]?.title) ?? a.title}
              </span>
              {overrides[a.slug] && (
                <span className="text-[10px] font-bold text-[#f97316] bg-orange-50 rounded-full px-2 py-0.5">수정됨</span>
              )}
              <span className="text-xs text-gray-400">수정 →</span>
            </button>
          ))}
        </div>
      )}

      {selected && edit && (
        <div className="space-y-4">
          <button onClick={() => { setSelected(null); setEdit(null); }} className="text-xs text-gray-500 hover:text-[#f97316] bg-transparent border-none cursor-pointer p-0">
            ← 글 목록으로
          </button>

          <div className="flex gap-3">
            <div className="w-20">
              <label className="block text-xs font-semibold text-gray-500 mb-1">이모지</label>
              <input className={inputCls} value={edit.emoji} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">제목</label>
              <input className={inputCls} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">설명 (목록·검색에 표시)</label>
            <textarea className={inputCls} rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">본문 문단</label>
            <div className="space-y-3">
              {edit.body.map((block, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-gray-400">문단 {i + 1}</span>
                    <div className="ml-auto flex gap-1">
                      <button
                        disabled={i === 0}
                        onClick={() => {
                          const body = [...edit.body];
                          [body[i - 1], body[i]] = [body[i], body[i - 1]];
                          setEdit({ ...edit, body });
                        }}
                        className="text-xs px-2 py-1 rounded border border-gray-200 bg-white cursor-pointer disabled:opacity-30"
                      >↑</button>
                      <button
                        disabled={i === edit.body.length - 1}
                        onClick={() => {
                          const body = [...edit.body];
                          [body[i + 1], body[i]] = [body[i], body[i + 1]];
                          setEdit({ ...edit, body });
                        }}
                        className="text-xs px-2 py-1 rounded border border-gray-200 bg-white cursor-pointer disabled:opacity-30"
                      >↓</button>
                      <button
                        disabled={edit.body.length <= 1}
                        onClick={() => {
                          if (!confirm(`문단 ${i + 1}을 삭제할까요?`)) return;
                          setEdit({ ...edit, body: edit.body.filter((_, j) => j !== i) });
                        }}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 bg-white cursor-pointer disabled:opacity-30"
                      >삭제</button>
                    </div>
                  </div>
                  <input
                    className={`${inputCls} mb-2`}
                    placeholder="소제목 (없으면 비워두세요)"
                    value={block.subtitle}
                    onChange={(e) => {
                      const body = [...edit.body];
                      body[i] = { ...body[i], subtitle: e.target.value };
                      setEdit({ ...edit, body });
                    }}
                  />
                  <textarea
                    className={inputCls}
                    rows={3}
                    placeholder="문단 내용"
                    value={block.text}
                    onChange={(e) => {
                      const body = [...edit.body];
                      body[i] = { ...body[i], text: e.target.value };
                      setEdit({ ...edit, body });
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => setEdit({ ...edit, body: [...edit.body, { subtitle: '', text: '' }] })}
              className="mt-2 text-xs font-semibold text-[#f97316] border border-dashed border-orange-300 rounded-lg px-3 py-2 bg-white cursor-pointer hover:bg-orange-50 w-full"
            >
              + 문단 추가
            </button>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-[#f97316] border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '💾 저장하기'}
            </button>
            {overrides[selected] && (
              <button
                onClick={handleReset}
                disabled={saving}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-500 bg-white border border-gray-200 cursor-pointer hover:border-gray-400 disabled:opacity-50"
              >
                원본으로 복원
              </button>
            )}
            <a href={`/info/${selected}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-gray-400 hover:text-[#f97316]">
              글 보러가기 ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
