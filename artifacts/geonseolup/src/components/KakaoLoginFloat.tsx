import { useEffect, useState } from 'react';
import { fetchAuthUser } from '@/lib/authUser';

interface MeUser {
  id: number;
  nickname: string;
}

export default function KakaoLoginFloat() {
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState<MeUser | null>(null);

  useEffect(() => {
    fetchAuthUser().then(setUser).finally(() => setChecked(true));
  }, []);

  if (!checked || user) return null;

  return (
    <a
      href="/api/auth/kakao/login"
      className="fixed bottom-5 right-5 z-[9001] flex flex-col items-center justify-center w-14 h-14 rounded-full shadow-lg cursor-pointer no-underline"
      style={{ background: '#FEE500' }}
      title="카카오 로그인"
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="#391B1B">
        <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.58 1.72 4.85 4.32 6.14-.19.71-.69 2.58-.79 2.98-.12.5.18.49.38.36.16-.1 2.55-1.73 3.58-2.44.82.12 1.67.19 2.51.19 5.523 0 10-3.477 10-7.23S17.523 3 12 3z" />
      </svg>
    </a>
  );
}
