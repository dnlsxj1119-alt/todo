// 푸시 알림 처리 — vite-plugin-pwa 가 만든 서비스워커가 importScripts 로 불러온다.
// 서버(Edge Function push-reminders)가 { title, body, tag, url } JSON 을 보낸다.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || '플로우', {
      body: data.body || '',
      // 같은 tag 면 새 알림이 이전 알림을 대체한다 → 매시간 알림이 쌓이지 않는다
      tag: data.tag || 'flow',
      renotify: true,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      if (open) return open.focus();
      return self.clients.openWindow(url);
    })
  );
});
