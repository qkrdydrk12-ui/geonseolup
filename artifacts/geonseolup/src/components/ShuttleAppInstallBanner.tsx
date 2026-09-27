import { useEffect, useState } from 'react';
import { getDeferredInstallPrompt, consumeDeferredInstallPrompt } from '@/lib/pwaInstall';

// 셔틀시간표 페이지 전용 "앱 설치" 배너 — 헤더의 사이트 전체 설치 버튼(시작 화면이 항상 홈)과 달리,
// 이 배너는 페이지 전용 manifest(manifestHref)로 설치해서 "홈 화면 아이콘 → 바로 이 시간표"가 되게 한다.
// 원리: 이 manifest는 SSR(api-server/src/routes/seo.ts, /info/:slug 라우트)이 이미 <head>에
// 심어서 내려주므로(직접 방문·공유 링크·QR 등 실제 설치 대상 경로), 브라우저의 설치 가능 여부 판단이
// 이 시점에 이미 이 manifest 기준으로 이뤄진다. 아래 useEffect의 manifest 교체는 SPA 내부 이동으로
// 들어온 경우를 위한 안전망일 뿐이다(이땐 이미 한 번 평가가 끝난 뒤라 설치 배너가 없을 수 있음).
interface Props {
  manifestHref: string;
  appName: string;
  accentColor: string;
  icon: string;
}

function isIOSDevice() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
function isIOSStandalone() {
  return (navigator as unknown as { standalone?: boolean }).standalone === true;
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

export default function ShuttleAppInstallBanner({ manifestHref, appName, accentColor, icon }: Props) {
  // ⚠️ 2026-09-27: 처음엔 브라우저의 자동 설치신호(beforeinstallprompt)가 떴을 때만 배너를 보여줬는데,
  // 이 신호는 크롬의 재방문·참여도 휴리스틱을 통과해야만 뜨고 특히 데스크톱에서는 거의 안 떠서
  // 실사용자에게 배너 자체가 안 보이는 사고가 있었다("다운로드가 어디있냐"는 지적). 이제 항상 배너를
  // 보여주고, 클릭 시 자동신호가 있으면 그걸 쓰고 없으면 브라우저별 수동 설치 방법을 안내한다.
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
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
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setVisible(false);
      return;
    }
    if (isIOSDevice()) {
      setVisible(!isIOSStandalone());
      return;
    }
    function onInstalled() {
      setVisible(false);
    }
    window.addEventListener('pwa-app-installed', onInstalled);
    return () => window.removeEventListener('pwa-app-installed', onInstalled);
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

  async function handleClick() {
    if (isIOSDevice()) {
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
        if (choice.outcome === 'accepted') setVisible(false);
      } catch {
        /* 사용자가 설치 선택창을 닫은 경우 등 — 무시 */
      } finally {
        setBusy(false);
      }
      return;
    }
    if (isSamsungBrowser()) {
      setSamsungHelp((v) => !v);
      return;
    }
    if (isInAppBrowser()) {
      const target = window.location.host + window.location.pathname + window.location.search;
      window.location.href = `intent://${target}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    // 자동 설치신호가 아직 안 떴을 때(데스크톱 크롬/엣지, 또는 일반 안드로이드 크롬) — 직접 안내한다.
    setGenericHelp((v) => !v);
  }

  if (!visible) return null;

  return (
    <div className="relative rounded-2xl border-2 p-4 sm:p-5 mb-6 flex items-center gap-3.5" style={{ borderColor: `${accentColor}33`, background: `${accentColor}0d` }} data-shuttle-install-help>
      <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: accentColor }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-extrabold text-[14px] sm:text-[15px]" style={{ color: accentColor }}>
          {appName} 앱
        </p>
        <p className="text-[11.5px] sm:text-xs text-gray-500 mt-0.5">홈 화면에 설치하면 클릭 한 번으로 바로 시간표를 볼 수 있어요</p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="shrink-0 px-4 py-2 rounded-full text-[12.5px] sm:text-[13px] font-extrabold text-white cursor-pointer border-none transition-transform hover:-translate-y-px disabled:opacity-60"
        style={{ background: accentColor, boxShadow: `0 3px 10px ${accentColor}55` }}
      >
        📲 설치하기
      </button>

      {iosHelp && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[300] w-[260px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-gray-800 text-xs leading-relaxed">
          <p className="font-bold text-sm mb-2">홈 화면에 추가하기</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>하단 공유 버튼(⬆️) 탭</li>
            <li>아래로 스크롤 후 '홈 화면에 추가' 선택</li>
          </ol>
        </div>
      )}
      {samsungHelp && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[300] w-[260px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-xs leading-relaxed">
          <p className="font-bold text-sm mb-2">홈 화면에 추가하기</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>하단 메뉴(☰ 또는 ⋮) 탭</li>
            <li>'홈 화면에 추가' 선택 (또는 '페이지 추가' 하위 메뉴에서 선택)</li>
          </ol>
        </div>
      )}
      {genericHelp && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[300] w-[270px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-xs leading-relaxed">
          <p className="font-bold text-sm mb-2">앱처럼 설치하기</p>
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
          <p className="text-gray-400 mt-2">설치 아이콘이 안 보이면 잠시 후 다시 시도해주세요.</p>
        </div>
      )}
    </div>
  );
}
