// Service worker unico per tutti i preset: ognuno lo registra con uno scope
// proprio (/p/<slug>/), ottenendo così una push subscription isolata.
// Sta in public/ e non in una route perché la specifica Service Worker rifiuta
// uno script che risponde con un redirect, e trailingSlash: true ne creerebbe uno.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {};
  }

  const title = data.title || 'Notifica';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // Su iOS icon e badge vengono ignorati: contano quelli della PWA installata.
      // Restano qui perché su Android e desktop funzionano.
      icon: data.icon,
      badge: data.icon,
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
