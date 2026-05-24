/**
 * CodexMobile PWA service worker：处理后台推送通知和通知点击跳转。
 *
 * Keywords: service-worker, pwa, notifications, push
 *
 * Exports:
 * - 无导出；由浏览器以 service worker 脚本加载。
 *
 * Inward: Service Worker runtime、Push API、Clients API。
 *
 * Outward: web-push-client 注册 `/codexmobile-sw.js`。
 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'CodexMobile', body: event.data?.text() || '' };
  }
  const title = payload.title || 'CodexMobile';
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'codexmobile-task',
    data: {
      url: payload.url || '/'
    },
    badge: '/codex-icon-192.png?v=20260518-codex-color',
    icon: '/codex-icon-192.png?v=20260518-codex-color'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client && client.url !== targetUrl) {
          await client.navigate(targetUrl);
        }
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
