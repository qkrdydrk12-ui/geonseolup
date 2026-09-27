import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// 홈 화면 설치 앱 아이콘으로 실행됐을 때, 마지막으로 "설치하기/시작화면 지정"을 누른 페이지로 바로
// 이동시킨다(예: ShuttleAppInstallBanner.tsx가 이 값을 저장). 크롬은 같은 origin에 이미 관련 앱이
// 설치돼 있으면 페이지 전용 manifest로 새 설치를 다시 제안하지 않는 경우가 있어(2026-09-27 실사용
// 확인) — 새 아이콘 대신 "기존 앱을 열면 원하는 페이지부터 보이게" 하는 우회책이다. standalone(앱)
// 실행이고 지금 "/"(시작화면)에 있을 때만 적용 — 사용자가 방금 직접 홈으로 이동한 게 아니라 앱을
// 방금 막 켜서 manifest의 start_url("/")로 진입한 시점에만 해당하므로 안전하다.
let redirectedToSavedStart = false;
try {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const savedStartPath = localStorage.getItem("cj_pwa_start_path");
  if (isStandalone && savedStartPath && savedStartPath !== "/" && window.location.pathname === "/") {
    redirectedToSavedStart = true;
    window.location.replace(savedStartPath);
  }
} catch {
  /* localStorage 사용 불가 시 그냥 정상 진행 */
}

if (!redirectedToSavedStart) {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  createRoot(document.getElementById("root")!).render(<App />);

  document.getElementById("app-loading")?.remove();
}
