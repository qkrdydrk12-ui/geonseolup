import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GongsuReminderSettings from '@/components/GongsuReminderSettings';
import TopicSubscribeButton from '@/components/TopicSubscribeButton';
import { subscribeToPush, unsubscribeFromPush, isPushMarkedSubscribed } from '@/lib/push';

interface MeUser {
  id: number;
  nickname: string;
}

export default function AlertSettings() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null));
    setPushOn(isPushMarkedSubscribed());
  }, []);

  async function handlePushToggle() {
    setPushBusy(true);
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
      } else {
        await subscribeToPush();
        setPushOn(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="flex-1 max-w-[520px] mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">알림 설정</h1>

        <section className="mb-5 bg-white rounded-[14px] border-[1.5px] border-gray-200 px-4 py-4">
          <div className="text-sm font-bold text-gray-500 mb-3">아침 공수 알림</div>
          {user ? (
            <GongsuReminderSettings />
          ) : (
            <p className="text-sm text-gray-400">로그인하면 공수 알림을 설정할 수 있어요.</p>
          )}
        </section>

        <section className="bg-white rounded-[14px] border-[1.5px] border-gray-200 px-4 py-4">
          <div className="text-sm font-bold text-gray-500 mb-3">콘텐츠 알림</div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span>건설꿀팁</span>
              <TopicSubscribeButton topic="tips" label="건설꿀팁" />
            </div>
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span>현장소식</span>
              <TopicSubscribeButton topic="news" label="현장소식" />
            </div>
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span>노가다톤</span>
              <TopicSubscribeButton topic="toon" label="노가다톤" />
            </div>
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span>구인공고</span>
              <button
                type="button"
                onClick={handlePushToggle}
                disabled={pushBusy}
                title="구인공고 알림받기"
                className={`px-2 py-2 rounded-lg text-sm font-bold cursor-pointer border-[1.5px] transition-all ${pushOn ? 'text-white border-[#f97316] bg-[#f97316]' : 'border-[#1e3a5f]/40 text-[#1e3a5f] bg-white hover:bg-[#1e3a5f] hover:text-white'} ${pushBusy ? 'opacity-60 pointer-events-none' : ''}`}
              >
                {pushOn ? '🔔' : '🚫'}
              </button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
