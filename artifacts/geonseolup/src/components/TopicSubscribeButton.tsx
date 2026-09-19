import { useState } from 'react';
import { subscribeToTopic, unsubscribeFromTopic, isTopicMarkedSubscribed } from '@/lib/push';

interface TopicSubscribeButtonProps {
  topic: 'tips' | 'news' | 'toon';
  label: string;
}

export default function TopicSubscribeButton({ topic, label }: TopicSubscribeButtonProps) {
  const [on, setOn] = useState(() => isTopicMarkedSubscribed(topic));
  const [busy, setBusy] = useState(false);

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        await unsubscribeFromTopic(topic);
        setOn(false);
      } else {
        const result = await subscribeToTopic(topic);
        if (result.ok) {
          setOn(true);
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
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={busy}
      title={`${label} 알림받기`}
      className={`px-1.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer border-[1.5px] transition-all ${
        on
          ? 'text-white border-[#f97316] bg-[#f97316]'
          : 'border-[#1e3a5f]/40 text-[#1e3a5f] bg-white hover:bg-[#1e3a5f] hover:text-white'
      } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
    >
      {on ? '🔔' : '🔕'}
    </button>
  );
}
