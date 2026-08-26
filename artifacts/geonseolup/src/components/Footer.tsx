import { Link } from 'wouter';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white">
      <div className="max-w-[860px] mx-auto px-4 py-6 flex flex-col items-center gap-3 text-sm text-gray-500">
        {/* 사이트 내 주요 섹션 링크 — 정적 텍스트 콘텐츠 페이지(약관 등)에서 다른 실제
            콘텐츠 섹션으로 이동할 경로가 없던 문제(내부 링크 강화) 보완 */}
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/" className="hover:text-[#f97316] transition-colors">
            구인공고
          </Link>
          <Link href="/info" className="hover:text-[#f97316] transition-colors">
            건설꿀팁
          </Link>
          <Link href="/news" className="hover:text-[#f97316] transition-colors">
            현장소식
          </Link>
          <Link href="/wages" className="hover:text-[#f97316] transition-colors">
            일당시세
          </Link>
        </nav>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full pt-3 border-t border-gray-100">
          <span className="font-semibold text-[#1e3a5f]">건설UP</span>
          <nav className="flex items-center gap-5">
            <Link href="/terms" className="hover:text-[#f97316] transition-colors">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-[#f97316] transition-colors">
              개인정보처리방침
            </Link>
            <Link href="/contact" className="hover:text-[#f97316] transition-colors">
              문의하기
            </Link>
          </nav>
          <span className="text-xs text-gray-400">© {new Date().getFullYear()} 건설UP</span>
        </div>
      </div>
    </footer>
  );
}
