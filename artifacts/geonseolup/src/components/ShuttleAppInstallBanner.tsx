import { useEffect, useState } from 'react';
import { getDeferredInstallPrompt, consumeDeferredInstallPrompt } from '@/lib/pwaInstall';

// 셔틀시간표 페이지 전용 "앱 설치" 배너.
//
// ⚠️ 2026-09-27 수정 기록(중요 — 이 파일을 다시 고칠 때 아래 사고들을 반복하지 말 것):
// 1차: 처음엔 브라우저 자동 설치신호(beforeinstallprompt)가 떴을 때만 배너를 보여줬는데, 이 신호는
//      크롬 참여도 휴리스틱을 통과해야만 뜨고 특히 데스크톱에서는 거의 안 떠서 배너 자체가 안 보이는
//      사고가 있었다 — 이제 항상 배너를 보여준다(설치 안 한 사람에게만, standalone이면 아래에서 숨김).
// 2차: 크롬은 같은 origin에 이미 관련 앱(건설UP)이 설치돼 있으면 이 페이지 전용 manifest에 대한
//      beforeinstallprompt를 다시 안 띄워주는 경우가 있다 — 플랫폼 제약이라 "새 아이콘을 하나 더
//      강제로 뜨게" 만들 방법이 없다. 한때 이걸 우회하려고 "클릭 시 localStorage에 시작페이지를
//      저장 → 앱(standalone) 실행 시 그 페이지로 강제 리다이렉트"를 시도했는데, 아이콘이 하나뿐인
//      기기에서는 결국 "기존 건설UP 앱을 열어도 무조건 셔틀시간표로만 가고 홈으로 못 감" 사고로
//      이어졌다("일반 건설 앱 눌렀는데 평택 셔틀버스페이지로 가짐"). **이 리다이렉트 우회책은 완전히
//      제거했다(main.tsx도 함께 확인) — 다시 추가하지 말 것.** 새 아이콘이 뜨는 건 관련 앱이 아직
//      없는 신규 방문자뿐이고, 그 경우엔 아래 beforeinstallprompt 경로가 정상 동작한다. 이미 앱이
//      설치된 사람에게는 "브라우저에서 홈 화면에 추가"를 다시 안내하는 것 이상은 해줄 수 있는 게 없다.
// 3차: 이미 앱이 설치된 사람(standalone으로 이 페이지를 보고 있는 경우)한테도 큰 배너가 그대로
//      보여서 "화면을 너무 많이 가린다"는 지적을 받았다 — 배너는 오직 "아직 설치 안 한" 사람에게만
//      보인다(standalone이면 조용히 숨김, 아무것도 저장하지 않음).
interface Props {
  manifestHref: string;
  appName: string;
  accentColor: string;
  icon: string;
}

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

export default function ShuttleAppInstallBanner({ manifestHref, appName, accentColor, icon }: Props) {
  const [standalone, setStandalone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);
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
        if (choice.outcome === 'accepted') setInstalled(true);
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
    // 자동 설치신호가 없을 때(이미 건설UP이 설치돼 있어 크롬이 재제안을 억제한 경우가 가장 흔함,
    // 또는 데스크톱/휴리스틱 미충족) — 수동 설치 방법을 안내한다.
    setGenericHelp((v) => !v);
  }

  // 이미 앱이 설치돼 있어 이 페이지를 standalone으로 보고 있는 경우 — 배너를 아예 숨긴다
  // (화면을 많이 가린다는 지적, 2026-09-27).
  if (standalone) return null;

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
        <p className="text-[11.5px] sm:text-xs text-gray-500 mt-0.5">홈 화면에 설치하면 클릭 한 번으로 바로 시간표를 볼 수 있어요</p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="shrink-0 px-4 py-2 rounded-full text-[12.5px] sm:text-[13px] font-extrabold text-white cursor-pointer border-none transition-transform hover:-translate-y-px disabled:opacity-60"
        style={{ background: accentColor, boxShadow: `0 3px 10px ${accentColor}55` }}
      >
        {installed ? '✅ 설치됨' : '📲 설치하기'}
      </button>

      {iosHelp && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[300] w-[270px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-gray-800 text-xs leading-relaxed">
          <p className="font-bold text-sm mb-2">홈 화면에 추가하기</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>하단 공유 버튼(⬆️) 탭</li>
            <li>아래로 스크롤 후 '홈 화면에 추가' 선택</li>
          </ol>
        </div>
      )}
      {samsungHelp && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[300] w-[270px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-xs leading-relaxed">
          <p className="font-bold text-sm mb-2">홈 화면에 추가하기</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>하단 메뉴(☰ 또는 ⋮) 탭</li>
            <li>'홈 화면에 추가' 선택 (또는 '페이지 추가' 하위 메뉴에서 선택)</li>
          </ol>
        </div>
      )}
      {genericHelp && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[300] w-[280px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 text-xs leading-relaxed">
          {isAndroidDevice() ? (
            <>
              <p className="font-bold text-sm mb-2">앱처럼 설치하기</p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>우측 상단 브라우저 메뉴(⋮) 탭</li>
                <li>'앱 설치' 또는 '홈 화면에 추가' 선택</li>
              </ol>
            </>
          ) : (
            <>
              <p className="font-bold text-sm mb-2">앱처럼 설치하기</p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>주소창 오른쪽의 설치 아이콘(⊕ 또는 화면 모양 아이콘)을 클릭</li>
                <li>안 보이면 브라우저 메뉴(⋮) → '앱 설치'를 선택</li>
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
