import { useEffect, useState } from 'react';
import { getDeferredInstallPrompt, consumeDeferredInstallPrompt } from '@/lib/pwaInstall';

// 셔틀시간표 페이지 전용 "앱 설치" 배너.
//
// ⚠️ 2026-09-27 두 차례 수정 기록(중요 — 이 파일을 다시 고칠 때 아래 두 사고를 반복하지 말 것):
// 1차: 처음엔 브라우저 자동 설치신호(beforeinstallprompt)가 떴을 때만 배너를 보여줬는데, 이 신호는
//      크롬 참여도 휴리스틱을 통과해야만 뜨고 특히 데스크톱에서는 거의 안 떠서 배너 자체가 안 보이는
//      사고가 있었다 — 이제 항상 배너를 보여준다.
// 2차(이번 수정): 그래도 "설치하기"를 눌렀을 때 자동신호가 없으면 그냥 수동 설치 방법만 안내하고
//      끝났는데, 사용자가 이미 건설UP 앱을 설치해둔 상태(사이트 소유자 본인 폰 등)라 크롬이 "같은
//      origin에 이미 관련 앱이 설치돼 있다"고 보고 이 페이지 전용 manifest에 대한 beforeinstallprompt를
//      아예 다시 안 띄워주는 경우가 실사용에서 나왔다("한방에 다운받는걸로 만들어야해"). 이건 코드 버그가
//      아니라 크롬의 플랫폼 제약(같은 origin·같은 scope에 이미 설치된 관련 앱이 있으면 두 번째 설치
//      제안을 억제)이라 "새 아이콘을 하나 더 강제로 뜨게" 만들 방법이 없다. 대신 아래 방식으로 우회한다:
//      클릭하는 모든 경로(신규 설치 수락/이미 설치됨/수동 안내 전부)에서 localStorage에 "이 페이지를
//      시작화면으로" 표시를 남기고, main.tsx가 앱(standalone) 실행 시 "/"에 있으면 이 값으로 즉시
//      리다이렉트한다 — 그러면 신규 방문자는 이 배너에서 바로 이 시간표용 아이콘이 설치되고(관련 앱이
//      없으니 크롬이 정상적으로 새 설치를 제안함), 이미 건설UP을 설치해둔 사람은 새 아이콘 대신 기존
//      건설UP 아이콘을 다시 열면 이 시간표부터 보이게 된다 — 두 경우 다 "한 번 조작하면 다음부터 바로
//      이 화면"이라는 실질 목표는 달성한다.
interface Props {
  manifestHref: string;
  startPath: string;
  appName: string;
  accentColor: string;
  icon: string;
}

const START_PATH_KEY = 'cj_pwa_start_path';

function isIOSDevice() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
function isSamsungBrowser() {
  return /SamsungBrowser/i.test(navigator.userAgent);
}
function isInAppBrowser() {
  return /KAKAOTALK|FBAN|FBAV|Instagram|NAVER\(|Line\/|; ?wv\)/i.test(navigator.userAgent);
}
function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
}
function isStandaloneNow() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
function saveStartPath(path: string) {
  try {
    localStorage.setItem(START_PATH_KEY, path);
  } catch {
    /* localStorage 사용 불가 시 무시 — 리다이렉트 안 되는 것 외엔 기능에 영향 없음 */
  }
}

export default function ShuttleAppInstallBanner({ manifestHref, startPath, appName, accentColor, icon }: Props) {
  const [standalone, setStandalone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const [samsungHelp, setSamsungHelp] = useState(false);
  const [genericHelp, setGenericHelp] = useState(false);

  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    const prevHref = link?.getAttribute('href') ?? '/manifest.json';
    if (link && prevHref !== manifestHref) link.setAttribute('href', manifestHref);
    return () => {
      if (link) link.setAttribute('href', prevHref);
    };
  }, [manifestHref]);

  useEffect(() => {
    setStandalone(isStandaloneNow());
  }, []);

  useEffect(() => {
    if (!iosHelp && !samsungHelp && !genericHelp) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-shuttle-install-help]')) {
        setIosHelp(false);
        setSamsungHelp(false);
        setGenericHelp(false);
      }
    }
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [iosHelp, samsungHelp, genericHelp]);

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  }

  async function handleClick() {
    // 이미 설치된 앱(홈 화면 아이콘) 안에서 이 페이지를 보고 있는 경우 — 새로 설치할 건 없고,
    // "다음에 아이콘을 열면 여기부터 보여주기"만 저장한다. 100% 확실하게 동작하는 경로다.
    if (standalone) {
      saveStartPath(startPath);
      flashSaved();
      return;
    }
    if (isIOSDevice()) {
      saveStartPath(startPath);
      setIosHelp((v) => !v);
      return;
    }
    if (busy) return;
    const promptEvent = consumeDeferredInstallPrompt() ?? getDeferredInstallPrompt();
    if (promptEvent) {
      setBusy(true);
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') {
          saveStartPath(startPath);
          flashSaved();
        }
      } catch {
        /* 사용자가 설치 선택창을 닫은 경우 등 — 무시 */
      } finally {
        setBusy(false);
      }
      return;
    }
    if (isSamsungBrowser()) {
      saveStartPath(startPath);
      setSamsungHelp((v) => !v);
      return;
    }
    if (isInAppBrowser()) {
      const target = window.location.host + window.location.pathname + window.location.search;
      window.location.href = `intent://${target}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    // 자동 설치신호가 없을 때(이미 건설UP이 설치돼 있어 크롬이 재제안을 억제한 경우가 가장 흔함,
    // 또는 데스크톱/휴리스틱 미충족) — 시작화면 지정은 지금 확정해두고, 수동 설치 방법도 안내한다.
    saveStartPath(startPath);
    setGenericHelp((v) => !v);
  }

  return (
    <div
      className="relative rounded-2xl border-2 p-4 sm:p-5 mb-6 flex items-center gap-3.5"
      style={{ borderColor: `${accentColor}33`, background: `${accentColor}0d` }}
      data-shuttle-install-help
    >
      <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: accentColor }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-extrabold text-[14px] sm:text-[15px]" style={{ color: accentColor }}>
          {appName} 앱
        </p>
        <p className="text-[11.5px] sm:text-xs text-gray-500 mt-0.5">
          {standalone
            ? '이 화면을 앱 시작화면으로 저장해두면 다음에 아이콘 누를 때 바로 여기부터 열려요'
            : '홈 화면에 설치하면 클릭 한 번으로 바로 시간표를 볼 수 있어요'}
        </p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="shrink-0 px-4 py-2 rounded-full text-[12.5px] sm:text-[13px] font-extrabold text-white cursor-pointer border-none transition-transform hover:-translate-y-px disabled:opacity-60"
        style={{ background: accentColor, boxShadow: `0 3px 10px ${accentColor}55` }}
      >
        {saved ? '✅ 저장됨' : standalone ? '📌 시작화면 지정' : '📲 설치하기'}
      </button>

      {iosHelp && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[300] w-[270px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-gray-800 text-xs leading-relaxed">
          <p className="font-bold text-sm mb-2">홈 화면에 추가하기</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>하단 공유 버튼(⬆️) 탭</li>
            <li>아래로 스크롤 후 '홈 화면에 추가' 선택</li>
          </ol>
          <p className="text-gray-400 mt-2">이미 건설UP 앱이 있다면, 그 앱을 다시 열어도 다음부터 이 화면이 먼저 떠요.</p>
        </div>
      )}
      {samsungHelp && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[300] w-[270px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-xs leading-relaxed">
          <p className="font-bold text-sm mb-2">홈 화면에 추가하기</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>하단 메뉴(☰ 또는 ⋮) 탭</li>
            <li>'홈 화면에 추가' 선택 (또는 '페이지 추가' 하위 메뉴에서 선택)</li>
          </ol>
          <p className="text-gray-400 mt-2">이미 건설UP 앱이 있다면, 그 앱을 다시 열어도 다음부터 이 화면이 먼저 떠요.</p>
        </div>
      )}
      {genericHelp && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[300] w-[280px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-xs leading-relaxed">
          <p className="font-bold text-sm mb-2">이미 건설UP 앱이 있다면</p>
          <p className="text-gray-600 mb-3">그 앱 아이콘을 다시 열면 다음부터 이 화면부터 바로 떠요 (지금 저장해뒀어요).</p>
          <p className="font-bold text-sm mb-2">아직 설치 전이라면</p>
          {isAndroidDevice() ? (
            <ol className="list-decimal list-inside space-y-1.5">
              <li>우측 상단 브라우저 메뉴(⋮) 탭</li>
              <li>'앱 설치' 또는 '홈 화면에 추가' 선택</li>
            </ol>
          ) : (
            <ol className="list-decimal list-inside space-y-1.5">
              <li>주소창 오른쪽의 설치 아이콘(⊕ 또는 화면 모양 아이콘)을 클릭</li>
              <li>안 보이면 브라우저 메뉴(⋮) → '앱 설치'를 선택</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
