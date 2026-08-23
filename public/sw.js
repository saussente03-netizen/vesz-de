// Minimaler Service Worker – nur damit Chrome/Android die Seite als
// installierbar einstuft und den "App installieren"-Hinweis zeigt.
// Kein Offline-Caching, alle Anfragen gehen normal ans Netzwerk.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
