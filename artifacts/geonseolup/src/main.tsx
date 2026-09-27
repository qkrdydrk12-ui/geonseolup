import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ⚠️ 2026-09-27: 여기 한때 "standalone 실행 + '/'에 있으면 저장해둔 시작페이지로 리다이렉트"하는
// 로직이 있었다(셔틀시간표 페이지 전용 앱 설치 우회책). 그런데 크롬이 같은 origin에 이미 설치된
// 관련 앱이 있으면 새 설치를 안 띄워주는 경우, 결국 기존 건설UP 앱(딱 하나뿐인 아이콘)의 시작화면
// 자체가 셔틀시간표로 바뀌어버리는 사고가 났다("일반 건설 앱 눌렀는데 평택 셔틀버스로 가짐") —
// 아이콘이 하나뿐이라 "이 아이콘은 셔틀용, 저 아이콘은 홈용"으로 분리할 수 없어서 생긴 문제.
// 완전히 제거했다 — 앱 아이콘은 항상 manifest의 start_url("/") 그대로 홈으로 연다. 셔틀시간표는
// 신규 설치(관련 앱이 아직 없는 사용자)일 때만 그 페이지 전용 manifest로 별도 아이콘이 설치된다.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);

document.getElementById("app-loading")?.remove();
