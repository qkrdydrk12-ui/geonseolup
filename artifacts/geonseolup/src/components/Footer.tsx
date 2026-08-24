import { Link } from 'wouter';

export default function Footer() {
  const footerTitle = localStorage.getItem('cj_footer_title') || '건설UP — 전국 건설 현장 일자리 정보';
  const footerJobs = localStorage.getItem('cj_footer_jobs') || '배관 · 용접 · 조공 · 화기감시자 · 형틀 · 철근 · 미장 · 도장';
  const footerNotice = localStorage.getItem('cj_footer_notice') || '게재된 일자리 정보는 등록자 제공으로, 지원 전 근로 조건을 직접 확인해야 합니다.';

  return (
    <footer className="mt-auto border-t border-gray-200 bg-white">
      <div className="max-w-[860px] mx-auto px-4 py-6 flex flex-col items-center gap-4 text-center text-sm text-gray-500">
        <div className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row sm:text-left">
          <span className="font-semibold text-[#1e3a5f]">건설UP</span>
        <nav aria-label="운영 및 정책 안내" className="grid grid-cols-2 items-center justify-center gap-x-5 gap-y-3 sm:flex sm:flex-wrap">
          <Link href="/about" className="min-h-11 inline-flex items-center justify-center hover:text-[#f97316] transition-colors">
            건설UP 소개
          </Link>
          <Link href="/terms" className="min-h-11 inline-flex items-center justify-center hover:text-[#f97316] transition-colors">
            이용약관
          </Link>
          <Link href="/privacy" className="min-h-11 inline-flex items-center justify-center hover:text-[#f97316] transition-colors">
            개인정보처리방침
          </Link>
          <Link href="/contact" className="min-h-11 inline-flex items-center justify-center hover:text-[#f97316] transition-colors">
            문의하기
          </Link>
        </nav>
          <span className="text-xs text-gray-400">© {new Date().getFullYear()} 건설UP</span>
        </div>
        <div className="w-full border-t border-gray-100 pt-4">
          <p className="font-semibold text-[#1e3a5f]">{footerTitle}</p>
          <p className="mt-1 text-xs text-gray-500">{footerJobs}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">※ {footerNotice}</p>
        </div>
      </div>
    </footer>
  );
}
