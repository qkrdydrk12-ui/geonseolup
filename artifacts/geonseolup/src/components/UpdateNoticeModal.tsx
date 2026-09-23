import { useEffect, useState } from "react";
import { Link } from "wouter";

const STORAGE_KEY = "geonseolup_update_notice_v1";

export default function UpdateNoticeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
    } catch {}
    setVisible(true);
  }, []);

  function close() {
    setVisible(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.55)" }}
      onClick={close}
    >
      <div
        className="w-full max-w-[380px] bg-white rounded-3xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 pt-7 pb-8 text-white relative"
          style={{
            background:
              "linear-gradient(135deg, #1e3a5f 0%, #2d5282 60%, #f97316 140%)",
          }}
        >
          <button
            onClick={close}
            className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 border-none cursor-pointer text-lg"
          >
            ×
          </button>
          <div className="text-xs font-bold tracking-wider text-white/70 mb-2">
            UPDATE
          </div>
          <div className="text-xl font-bold leading-snug">
            건설UP 새 기능
            <br />
            업데이트 소식
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
              style={{ background: "#fff3e6" }}
            >
              📲
            </div>
            <div>
              <div className="font-bold text-[#1e3a5f] text-sm mb-0.5">
                앱처럼 설치하기
              </div>
              <div className="text-xs text-gray-500 leading-relaxed">
                홈 화면에 아이콘 추가하고 앱처럼 편하게 쓰세요.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 mb-6">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
              style={{ background: "#fff3e6" }}
            >
              ⏰
            </div>
            <div>
              <div className="font-bold text-[#1e3a5f] text-sm mb-0.5">
                공수표 알림 설정
              </div>
              <div className="text-xs text-gray-500 leading-relaxed">
                매일 아침 자동으로 출근 체크 알림을 받아보세요.
              </div>
            </div>
          </div>
          <Link
            href="/guide"
            onClick={close}
            className="block w-full text-center py-3.5 rounded-xl font-bold text-white no-underline"
            style={{
              background: "#f97316",
              boxShadow: "0 4px 12px rgba(249,115,22,0.35)",
            }}
          >
            영상으로 사용법 보기
          </Link>
          <button
            onClick={close}
            className="w-full text-center py-3 mt-2 text-xs text-gray-400 border-none bg-transparent cursor-pointer"
          >
            나중에 볼게요
          </button>
        </div>
      </div>
    </div>
  );
}
