import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const VIDEOS = [
  { key: "app-install", label: "앱 설치 방법", file: "app-install.mp4" },
  { key: "gongsu-alert", label: "공수표 알림 설정", file: "gongsu-alert.mp4" },
];

export default function Guide() {
  const [selected, setSelected] = useState(VIDEOS[0].key);
  const current = VIDEOS.find((v) => v.key === selected) ?? VIDEOS[0];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f1f5f9" }}>
      <Header />
      <main className="flex-1 max-w-[640px] mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">건설UP 사용법 영상</h1>
        <p className="text-sm text-gray-500 mb-6">영상으로 쉽게 따라하세요.</p>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#1e3a5f] bg-white outline-none focus:border-[#f97316] mb-4"
          >
            {VIDEOS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
          <video
            key={current.file}
            src={`/api/media/${current.file}`}
            controls
            playsInline
            className="w-full rounded-xl bg-black"
            style={{ maxHeight: "70vh" }}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
