import { useEffect, useState } from 'react';

interface MeUser {
  id: number;
  nickname: string;
}

export default function KakaoLoginFloat() {
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState<MeUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  }, []);

  if (!checked || user) return null;

  return (
    <a
      href="/api/auth/kakao/login"
      className="fixed bottom-24 right-5 z-[9000] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-bold cursor-pointer no-underline"
      style={{ background: '#FEE500', color: '#181600' }}
    >
      💬 카카오 로그인
    </a>
  );
}
