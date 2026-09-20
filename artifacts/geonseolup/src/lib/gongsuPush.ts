// 공수표 4단계 — 회원별 아침 알림 구독(기존 sw.js·web-push 방식 재사용).
function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function getGongsuPushStatus(): Promise<{ subscribed: boolean; reminderTime?: string }> {
  try {
    const res = await fetch('/api/gongsu-push/status');
    const data = await res.json();
    return { subscribed: !!data.subscribed, reminderTime: data.reminderTime };
  } catch {
    return { subscribed: false };
  }
}

export async function subscribeToGongsuReminder(reminderTime: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, error: 'permission_denied' };

  const keyRes = await fetch('/api/gongsu-push/vapid-public-key');
  if (!keyRes.ok) return { ok: false, error: 'not_configured' };
  const { publicKey } = (await keyRes.json()) as { publicKey: string };

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const res = await fetch('/api/gongsu-push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), reminderTime }),
  });
  if (!res.ok) return { ok: false, error: 'server_error' };
  return { ok: true };
}

export async function updateGongsuReminderTime(reminderTime: string): Promise<boolean> {
  const res = await fetch('/api/gongsu-push/reminder-time', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reminderTime }),
  });
  return res.ok;
}

export async function unsubscribeFromGongsuReminder(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await fetch('/api/gongsu-push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

export async function sendTestGongsuPush(): Promise<boolean> {
  const res = await fetch('/api/gongsu-push/test', { method: 'POST' });
  return res.ok;
}
