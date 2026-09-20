import { useEffect, useState } from 'react';
import {
  getGongsuPushStatus,
  subscribeToGongsuReminder,
  unsubscribeFromGongsuReminder,
  updateGongsuReminderTime,
  sendTestGongsuPush,
} from '@/lib/gongsuPush';

const DEFAULT_TIME = '06:55';

export default function GongsuReminderSettings() {
  const [subscribed, setSubscribed] = useState(false);
  const [reminderTime, setReminderTime] = useState(DEFAULT_TIME);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getGongsuPushStatus().then((status) => {
      setSubscribed(status.subscribed);
      if (status.reminderTime) setReminderTime(status.reminderTime);
      setLoading(false);
    });
  }, []);

  async function handleSubscribe() {
    setBusy(true);
    setMessage(null);
    const result = await subscribeToGongsuReminder(reminderTime);
    setBusy(false);
    if (result.ok) {
      setSubscribed(true);
      setMessage('알림이 설정되었습니다.');
    } else {
      setMessage(
        result.error === 'permission_denied' ? '브라우저 알림 권한이 거부되었습니다.' : '알림 설정에 실패했습니다.'
      );
    }
  }

  async function handleUnsubscribe() {
    setBusy(true);
    await unsubscribeFromGongsuReminder();
    setSubscribed(false);
    setBusy(false);
    setMessage('알림이 해제되었습니다.');
  }

  async function handleTimeChange(value: string) {
    setReminderTime(value);
    if (subscribed) {
      await updateGongsuReminderTime(value);
    }
  }

  async function handleTest() {
    setBusy(true);
    const result = await sendTestGongsuPush();
    setBusy(false);
    if (result.expired) {
      setSubscribed(false);
      setMessage('알림 구독이 만료되었습니다. 다시 설정해주세요.');
      return;
    }
    setMessage(result.ok ? '테스트 알림을 보냈습니다.' : '테스트 알림 발송에 실패했습니다.');
  }

  if (loading) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mt-4">
      <h2 className="font-semibold text-[#1e3a5f] mb-3">아침 알림</h2>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-gray-500">알림 시간</label>
        <input
          type="time"
          value={reminderTime}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900"
        />
      </div>
      {subscribed ? (
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={busy}
            className="text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50"
          >
            테스트 알림 보내기
          </button>
          <button
            onClick={handleUnsubscribe}
            disabled={busy}
            className="text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50"
          >
            알림 끄기
          </button>
        </div>
      ) : (
        <button
          onClick={handleSubscribe}
          disabled={busy}
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
          style={{ background: '#1e3a5f' }}
        >
          매일 아침 알림 받기
        </button>
      )}
      {message && <p className="text-xs text-gray-400 mt-2">{message}</p>}
    </div>
  );
}
