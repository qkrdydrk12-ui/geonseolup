import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { fbGetSetting } from '@/lib/firebase';
import { subscribeToPush, unsubscribeFromPush, isPushMarkedSubscribed } from '@/lib/push';

// 2026-08-29: 상단 헤더의 "문의" 팝업 버튼은 제거됨 — 푸터의 "문의하기"(/contact 페이지)와
// 중복이라 정리했다. 관련 팝업 UI(ContactModal)도 트리거가 사라져 함께 제거.

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pushOn, setPushOn] = useState(isPushMarkedSubscribed());
  const [pushBusy, setPushBusy] = useState(false);
  const siteName = localStorage.getItem('cj_site_name') || '건설UP';
  const siteSubtitle = localStorage.getItem('cj_site_subtitle') || '건설 현장 일자리 정보';

  // 2026-08-29: 홈 화면 필터 알림받기 줄에 있던 "브라우저 알림" 버튼을 상단 헤더로 이동.
  // 헤더는 모든 페이지에 공통으로 뜨고 특정 지역/직종 필터 상태가 없으므로, 전체 공고 기준으로 구독한다.
  async function handlePushToggle() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
      } else {
        const result = await subscribeToPush('전체', '전체');
        if (result.ok) {
          setPushOn(true);
        } else if (result.error === 'unsupported') {
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          alert(
            isIOS
              ? '아이폰에서는 사파리 하단의 공유 버튼 → "홈 화면에 추가"로 앱처럼 설치한 뒤 알림 구독이 가능해요.'
              : '이 브라우저는 푸시 알림을 지원하지 않아요.'
          );
        } else if (result.error === 'permission_denied') {
          alert('알림 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.');
        } else {
          alert('구독 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
        }
      }
    } finally {
      setPushBusy(false);
    }
  }

  // Firestore에서 오픈채팅 URL 동기화 (모든 기기에서 공유)
  useEffect(() => {
    fbGetSetting('openchat_url').then((v) => {
      if (typeof v === 'string' && v.trim()) {
        localStorage.setItem('cj_openchat_url', v.trim());
      }
    }).catch(() => {});
  }, []);

  // 오픈채팅 링크 — 1순위: cj_openchat_url, 2순위(하위호환): cj_contact_kakao
  function getOpenChatHref(): string {
    const dedicated = (localStorage.getItem('cj_openchat_url') || '').trim();
    if (dedicated) {
      return dedicated.startsWith('http') ? dedicated : `https://${dedicated}`;
    }
    const kakao = (localStorage.getItem('cj_contact_kakao') || '').trim();
    if (kakao && kakao.startsWith('http')) return kakao;
    return '';
  }

  function handleOpenChat() {
    setMenuOpen(false);
    const href = getOpenChatHref();
    if (!href) {
      alert('오픈채팅 주소가 설정되지 않았습니다.\n관리자 → 설정 → 카카오 오픈채팅 URL 설정에서 등록해주세요.');
      return;
    }
    window.open(href, '_blank', 'noopener');
  }

  async function handleShare() {
    setMenuOpen(false);
    const rawUrl = localStorage.getItem('cj_share_url') || location.href;
    const url = rawUrl.includes('utm_source=')
      ? rawUrl
      : `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}utm_source=kakao`;
    const title = `${siteName} - ${siteSubtitle}`;
    const desc = localStorage.getItem('cj_footer_text') || '배관·용접·조공·화기감시자 등 전국 건설 현장 구인 공고';

    if (navigator.share) {
      try {
        await navigator.share({ title, text: desc, url });
        return;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
    alert('링크가 복사됐습니다! 카카오톡에 붙여넣기 하세요.');
  }

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-openchat-menu]')) setMenuOpen(false);
    }
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [menuOpen]);

  return (
    <>
      <header
        className="sticky top-0 z-[200] text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5282 100%)' }}
      >
        <div className="max-w-[1100px] mx-auto px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {/* 상단: 로고 (모바일 첫 줄) */}
          <Link href="/" className="flex items-center gap-[7px] no-underline text-white shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-black shrink-0"
              style={{ background: '#f97316' }}
            >
              건
            </div>
            <div className="leading-tight">
              <span className="text-[16px] font-bold tracking-tight block">{siteName}</span>
              <span className="text-[10px] opacity-70 block">{siteSubtitle}</span>
            </div>
          </Link>

          {/* 하단: 버튼 그리드 (모바일 둘째 줄) — 4칸 균등, 네모 모양 */}
          <div className="grid grid-cols-4 gap-1.5 sm:flex sm:items-center sm:gap-2 sm:shrink-0">
            <Link
              href="/shop"
              className="shop-sparkle relative overflow-hidden flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 px-1 sm:px-[11px] py-1.5 sm:py-[5px] rounded-[8px] text-[10px] sm:text-xs font-semibold text-white no-underline border border-white/30 bg-white/15 transition-colors hover:bg-white/28 whitespace-nowrap leading-tight"
            >
              <span className="shop-sparkle-icon">🛒</span>
              <span className="whitespace-nowrap">건설 추천템</span>
              <span className="shop-sparkle-shine" aria-hidden="true"></span>
            </Link>
            <Link
              href="/post"
              className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 px-1 sm:px-[11px] py-1.5 sm:py-[5px] rounded-[8px] text-[10px] sm:text-xs font-extrabold text-white no-underline transition-all hover:-translate-y-px whitespace-nowrap leading-tight"
              style={{
                background: '#f97316',
                boxShadow: '0 2px 8px rgba(249,115,22,0.30)',
              }}
            >
              <span>✏️</span>
              <span className="whitespace-nowrap">구인등록</span>
            </Link>

            <button
              className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 px-1 sm:px-[11px] py-1.5 sm:py-[5px] rounded-[8px] text-[10px] sm:text-xs font-bold cursor-pointer transition-all hover:-translate-y-px whitespace-nowrap leading-tight ${
                pushOn
                  ? 'text-white border border-[#f97316] bg-[#f97316]'
                  : 'text-white border border-white/35 bg-white/18 hover:bg-white/30'
              } ${pushBusy ? 'opacity-60 pointer-events-none' : ''}`}
              onClick={handlePushToggle}
            >
              <span>{pushOn ? '🔔' : '🔕'}</span>
              <span className="whitespace-nowrap">{pushOn ? '구독중' : '알림받기'}</span>
            </button>

            <div className="relative" data-openchat-menu>
              <button
                className="w-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 px-1 sm:px-[11px] py-1.5 sm:py-[5px] rounded-[8px] text-[10px] sm:text-xs font-bold border-none cursor-pointer transition-all hover:opacity-90 hover:-translate-y-px whitespace-nowrap leading-tight"
                style={{ background: '#fee500', color: '#3c1e1e' }}
                onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
                title="오픈채팅 / 공유 메뉴"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#3c1e1e">
                  <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.632 5.08 4.1 6.52l-1.05 3.9 4.52-2.97A11.3 11.3 0 0 0 12 18.6c5.523 0 10-3.477 10-7.8S17.523 3 12 3z" />
                </svg>
                <span className="whitespace-nowrap flex items-center gap-0.5">
                  오픈채팅<span className="text-[8px] opacity-70">▼</span>
                </span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 sm:right-0 left-0 sm:left-auto top-[calc(100%+4px)] z-[300] min-w-full sm:min-w-[140px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-gray-800 hover:bg-yellow-50 border-none bg-transparent cursor-pointer text-left"
                    onClick={handleOpenChat}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#3c1e1e" className="shrink-0">
                      <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.632 5.08 4.1 6.52l-1.05 3.9 4.52-2.97A11.3 11.3 0 0 0 12 18.6c5.523 0 10-3.477 10-7.8S17.523 3 12 3z" />
                    </svg>
                    <span>오픈채팅 입장</span>
                  </button>
                  <div className="h-px bg-gray-100" />
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-gray-800 hover:bg-yellow-50 border-none bg-transparent cursor-pointer text-left"
                    onClick={handleShare}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#3c1e1e" className="shrink-0">
                      <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.632 5.08 4.1 6.52l-1.05 3.9 4.52-2.97A11.3 11.3 0 0 0 12 18.6c5.523 0 10-3.477 10-7.8S17.523 3 12 3z" />
                    </svg>
                    <span>링크 공유</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </header>
    </>
  );
}
