import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// VAPID 공개키 — 공개돼도 되는 값이다. 짝이 되는 비공개키는 Edge Function 비밀값(VAPID_PRIVATE_KEY)에만 있다.
// 키를 바꾸면 기존 구독이 모두 무효가 되므로(서버가 410 받고 지움) 각 기기에서 알림을 다시 켜야 한다.
const VAPID_PUBLIC_KEY = 'BLe9hO647v9F2XpVsf7iUwM-_xono53DEIPOq8kWPtbGY3t0fZJyK_0e1twXf_r9tcIF2RhwnHkweVMQn-uMCz8';

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// 서비스워커 등록을 기다리되, 개발 서버처럼 등록 자체가 없으면 null (ready 는 영영 안 끝난다)
async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return navigator.serviceWorker.ready;
}

// status: 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'
// 구독(브라우저 단위)과 앱 계정은 별개라서, '켜짐'은 **이 계정의 행에 이 브라우저 구독이 있을 때**만.
// 공유 브라우저에서 다른 계정이 켜 둔 구독을 이 계정이 켠 것으로 보이지 않게 한다.
export function usePush(userId) {
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    if (isIOS() && !isStandalone()) { setStatus('ios-install'); return; }
    if (!('PushManager' in window) || !('Notification' in window)) { setStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setStatus('denied'); return; }
    const reg = await getRegistration();
    if (!reg) { setStatus('unsupported'); return; }
    const sub = await reg.pushManager.getSubscription();
    if (!sub || Notification.permission !== 'granted') { setStatus('off'); return; }
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', sub.endpoint)
      .limit(1);
    if (error) { console.error('[push status]', error); setStatus('off'); return; }
    setStatus(data?.length ? 'on' : 'off');
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setStatus(perm === 'denied' ? 'denied' : 'off'); return; }
      const reg = await getRegistration();
      if (!reg) { setStatus('unsupported'); return; }
      const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      const json = sub.toJSON();
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 300),
      }, { onConflict: 'user_id,endpoint' });
      if (error) {
        console.error('[push enable]', error);
        alert('알림 등록에 실패했어요. (push_subscriptions 테이블 마이그레이션을 실행했는지 확인)\n' + error.message);
        return;
      }
      setStatus('on');
    } catch (e) {
      console.error('[push enable]', e);
      alert('알림을 켜지 못했어요: ' + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [userId]);

  // 이 계정의 행만 지운다. 브라우저 구독은 남겨 둔다 — 같은 브라우저의 다른 계정이 쓰고 있을 수 있다.
  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        if (error) { console.error('[push disable]', error); alert('알림 끄기에 실패했어요: ' + error.message); return; }
      }
      setStatus('off');
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, enable, disable };
}
