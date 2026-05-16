// BWIAA 2026 — Service Worker for Push Notifications
const CACHE_NAME = 'bwiaa-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── Push event — fires when a push notification arrives ──────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;

  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'BWIAA', body: e.data.text() }; }

  const options = {
    body:    data.body    ?? 'You have a new notification',
    icon:    data.icon    ?? '/icons/web-app-manifest-192x192.png',
    badge:   data.badge   ?? '/icons/web-app-manifest-192x192.png',
    image:   data.image   ?? undefined,
    tag:     data.tag     ?? 'bwiaa-notif',
    data:    { url: data.url ?? '/' },
    actions: data.actions ?? [],
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction ?? false,
  };

  e.waitUntil(
    self.registration.showNotification(data.title ?? 'BWIAA 2026', options)
  );
});

// ── Notification click — open the app at the right page ─────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();

  const url = e.notification.data?.url ?? '/members/dashboard';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── Notification close ───────────────────────────────────────────────────────
self.addEventListener('notificationclose', e => {
  // Could log dismissals here in future
});
