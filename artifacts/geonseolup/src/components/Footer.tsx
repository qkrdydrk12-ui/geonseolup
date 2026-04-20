import { Link } from 'wouter';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white">
      <div className="max-w-[860px] mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
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
    </footer>
  );
}
