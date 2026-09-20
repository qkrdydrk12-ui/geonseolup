import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

interface MeUser {
  id: number;
  nickname: string;
}

export default function MyPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="flex-1 max-w-[860px] mx-auto w-full px-4 py-10">
        {loading ? (
          <div className="text-center text-gray-400 py-20">불러오는 중...</div>
        ) : user ? (
          <>
            <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">마이페이지</h1>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 text-sm text-gray-700">
              <p><b className="text-[#1e3a5f]">{user.nickname}</b>님, 환영합니다.</p>
              <p className="mt-2 text-gray-500">공수표 기능은 준비 중입니다.</p>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-700 mb-6">로그인이 필요한 페이지입니다.</p>
            <a
              href="/api/auth/kakao/login"
              className="inline-block text-sm font-semibold px-5 py-2.5 rounded-lg no-underline"
              style={{ background: '#FEE500', color: '#181600' }}
            >
              카카오로 시작하기
            </a>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
