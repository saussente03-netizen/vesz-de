/* VÉSZ · Deutsch – Service Worker.
   Zweck: installierbar sein und mit den zuletzt geladenen Meldungen auch offline starten.
   - Seiten (Navigation) und /api/events: erst Netzwerk, bei Ausfall die letzte gespeicherte Fassung
     (so bleibt auch die Besuchszählung des Servers erhalten, sie läuft über echte Seitenaufrufe)
   - Dateien (CSS, JS, Schriften, Bilder): aus dem Zwischenspeicher, im Hintergrund aktualisiert
   - Alles andere (POST, /api/admin-*, andere Adressen) geht unverändert ans Netzwerk
   Bei Änderungen an Dateien VERSION erhöhen, dann räumt der Worker alte Speicher auf. */

const VERSION = 'vesz-v1';

const PAGES = ['/', '/karte', '/einstellungen', '/info', '/impressum', '/datenschutz'];

const FILES = [
  '/css/fonts.css',
  '/css/style.css',
  '/js/app.js',
  '/js/karte.js',
  '/js/einstellungen.js',
  '/js/pwa.js',
  '/manifest.webmanifest',
  '/assets/icons/icon-192.png',
  '/assets/icons/sprite.svg',
  '/assets/images/melovista-logo.png',
  '/assets/fonts/space-grotesk-v22-latin-500.woff2',
  '/assets/fonts/space-grotesk-v22-latin-700.woff2',
  '/assets/fonts/inter-v20-latin-regular.woff2',
  '/assets/fonts/inter-v20-latin-500.woff2',
  '/assets/fonts/inter-v20-latin-600.woff2',
  '/assets/fonts/ibm-plex-mono-v20-latin-regular.woff2',
  '/assets/fonts/ibm-plex-mono-v20-latin-500.woff2',
  '/assets/fonts/rendor-ext-400.woff',
  '/assets/fonts/rendor-ext-500.woff',
  '/assets/fonts/rendor-ext-600.woff',
  '/assets/fonts/rendor-ext-700.woff',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // Einzelne Fehlschläge (z. B. kein Zugang) dürfen die Installation nicht verhindern
      await Promise.all(
        PAGES.concat(FILES).map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
            if (res.ok && !res.redirected) await cache.put(url, res);
          } catch (e) { /* offline beim Installieren: wird später nachgeholt */ }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    event.respondWith(navigation(req, url));
    return;
  }
  if (url.pathname === '/api/events') {
    event.respondWith(apiEvents(req));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(staticFile(event, req));
});

// Gleiche Seite, gleicher Schlüssel: /karte.html und /karte, /index.html und /, mit oder ohne ?county=…
function pageKey(url) {
  let p = url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (p === '') p = '/';
  return url.origin + p;
}

async function navigation(req, url) {
  const cache = await caches.open(VERSION);
  const key = pageKey(url);
  try {
    const res = await fetch(req);
    // Nur echte, direkt ausgelieferte Seiten merken (keine Weiterleitungen, keine Fehlerseiten)
    if (res.ok && !res.redirected && res.type !== 'opaqueredirect') await cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(key)) || (await cache.match(url.origin + '/'));
    if (hit) return hit;
    throw e;
  }
}

async function apiEvents(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put('/api/events', res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match('/api/events');
    if (!hit) throw e;
    // Kennzeichnen, damit die Seite „Offline, Stand von …“ anzeigen kann
    const headers = new Headers(hit.headers);
    headers.set('X-VESZ-Cache', 'offline');
    return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
  }
}

async function staticFile(event, req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then(async (res) => {
      if (res.ok) await cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    // Hintergrund-Aktualisierung darf den Worker nicht vorzeitig beenden
    event.waitUntil(refresh);
    return hit;
  }
  const res = await refresh;
  if (res) return res;
  return new Response('', { status: 504, statusText: 'Offline' });
}
