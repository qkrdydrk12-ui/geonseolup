import { useState } from 'react';
import { Link } from 'wouter';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const email = (localStorage.getItem('cj_contact_email') || '').trim();
  const kakao = (localStorage.getItem('cj_contact_kakao') || '').trim();
  const label = (localStorage.getItem('cj_contact_label') || '').trim();

  if (!isOpen) return null;

  const kakaoHref = kakao.startsWith('http') ? kakao : `https://open.kakao.com/o/${kakao}`;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/52 backdrop-blur-sm" />
      <div
        className="relative z-10 bg-white rounded-2xl w-[min(92vw,360px)] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-[#1e3a5f] to-[#2d5282] text-white px-5 py-4 relative">
          <h3 className="text-base font-extrabold mb-1">📩 문의하기</h3>
          <p className="text-xs opacity-80 leading-relaxed m-0">
            {label || '구인/구직 관련 문의는 아래 연락처로 연락주세요.'}
          </p>
          <button
            className="absolute top-3 right-3.5 bg-white/20 border-none text-white w-7 h-7 rounded-full text-base leading-none cursor-pointer flex items-center justify-center hover:bg-white/35 transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="p-5 flex flex-col gap-2.5">
          {email && (
            <a
              className="flex items-center gap-3 px-4 py-3 rounded-xl border-[1.5px] border-gray-200 text-gray-800 no-underline hover:border-[#f97316] hover:bg-orange-50 transition-all cursor-pointer"
              href={`mailto:${email}`}
              target="_blank"
              rel="noopener"
            >
              <span className="text-[26px] leading-none">📧</span>
              <div className="flex-1 min-w-0">
                <strong className="block text-sm font-bold text-[#1e3a5f]">이메일로 문의</strong>
                <span className="block text-xs text-gray-500 mt-0.5 break-all">{email}</span>
              </div>
              <span className="text-base text-gray-400">›</span>
            </a>
          )}
          {kakao && (
            <a
              className="flex items-center gap-3 px-4 py-3 rounded-xl border-[1.5px] border-gray-200 text-gray-800 no-underline hover:border-[#f97316] hover:bg-orange-50 transition-all cursor-pointer"
              href={kakaoHref}
              target="_blank"
              rel="noopener"
            >
              <span className="text-[26px] leading-none">💛</span>
              <div className="flex-1 min-w-0">
                <strong className="block text-sm font-bold text-[#1e3a5f]">카카오톡으로 문의</strong>
                <span className="block text-xs text-gray-500 mt-0.5 break-all">{kakao}</span>
              </div>
              <span className="text-base text-gray-400">›</span>
            </a>
          )}
          {!email && !kakao && (
            <div className="text-center py-5 text-gray-500 text-sm leading-relaxed">
              📭 아직 문의 연락처가 설정되지 않았습니다.
              <br />
              <span className="text-xs">관리자 페이지 → 설정에서 추가할 수 있습니다.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Header() {
  const [contactOpen, setContactOpen] = useState(false);
  const siteName = localStorage.getItem('cj_site_name') || '건설UP';
  const siteSubtitle = localStorage.getItem('cj_site_subtitle') || '건설 현장 일자리 정보';

  async function doKakaoShare() {
    const url = location.href;
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

  return (
    <>
      <header
        className="sticky top-0 z-[200] text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5282 100%)' }}
      >
        <div className="max-w-[1100px] mx-auto px-4 py-[9px] flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-[7px] no-underline text-white">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-black shrink-0"
              style={{ background: '#f97316' }}
            >
              건
            </div>
            <div>
              <span className="text-[17px] font-bold tracking-tight block">{siteName}</span>
              <span className="text-[10px] opacity-70 block leading-none">{siteSubtitle}</span>
            </div>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/info"
              className="px-[11px] py-[5px] rounded-[7px] text-xs font-semibold text-white no-underline border border-white/30 bg-white/15 transition-colors hover:bg-white/28 hidden sm:block whitespace-nowrap"
            >
              📚 정보/꿀팁
            </Link>
            <Link
              href="/post"
              className="inline-flex items-center justify-center gap-1 px-[11px] py-[5px] rounded-[7px] text-xs font-extrabold text-white no-underline transition-all hover:-translate-y-px whitespace-nowrap shrink-0 leading-none"
              style={{
                background: '#f97316',
                boxShadow: '0 2px 8px rgba(249,115,22,0.30)',
              }}
            >
              <span className="whitespace-nowrap">✏️ 구인등록</span>
            </Link>

            <button
              className="inline-flex items-center justify-center gap-1 px-[11px] py-[5px] rounded-[7px] text-xs font-bold text-white border border-white/35 bg-white/18 cursor-pointer transition-all hover:bg-white/30 hover:-translate-y-px whitespace-nowrap shrink-0 leading-none"
              onClick={() => setContactOpen(true)}
            >
              <span className="whitespace-nowrap">📩 문의</span>
            </button>

            <button
              className="inline-flex items-center justify-center gap-1 px-[11px] py-[5px] rounded-[7px] text-xs font-bold border-none cursor-pointer transition-all hover:opacity-90 hover:-translate-y-px whitespace-nowrap shrink-0 leading-none"
              style={{ background: '#fee500', color: '#3c1e1e' }}
              onClick={doKakaoShare}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#3c1e1e">
                <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.632 5.08 4.1 6.52l-1.05 3.9 4.52-2.97A11.3 11.3 0 0 0 12 18.6c5.523 0 10-3.477 10-7.8S17.523 3 12 3z" />
              </svg>
              <span className="whitespace-nowrap">공유</span>
            </button>

            <Link
              href="/admin"
              className="inline-flex items-center justify-center px-[11px] py-[5px] rounded-[7px] text-xs font-semibold text-white no-underline border border-white/30 bg-white/15 transition-colors hover:bg-white/28 whitespace-nowrap shrink-0 leading-none"
            >
              ⚙️<span className="hidden sm:inline whitespace-nowrap"> 관리자</span>
            </Link>
          </div>
        </div>
      </header>

      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  );
}
