/* Lokaler Nachbau für Tests: worker.js hinter einem Node-HTTP-Server.
   - ASSETS: liest public/ und verhält sich wie Cloudflare mit html_handling "auto-trailing-slash"
     (/karte liefert karte.html mit 200, /karte.html leitet mit 307 auf /karte um, /index.html auf /)
   - VESZ_KV: einfacher Speicher im Arbeitsspeicher (get/put, type: 'json')
   Die Attrappen sind absichtlich schlicht; sie prüfen den Code, nicht Cloudflare selbst. */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
const PUBLIC = path.join(REPO, 'public');

// worker.js ist ein ES-Modul ohne package.json "type": als .mjs-Kopie laden
async function loadWorker() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesz-worker-'));
  const copy = path.join(tmp, 'worker.mjs');
  fs.copyFileSync(path.join(REPO, 'worker.js'), copy);
  return (await import(pathToFileURL(copy).href)).default;
}

// Absichtlich KEIN passender Typ für .webmanifest: der Worker muss ihn selbst setzen
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function makeAssets() {
  const exists = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
  const file = (p, status = 200) => {
    const buf = fs.readFileSync(p);
    return new Response(buf, {
      status,
      headers: {
        'content-type': MIME[path.extname(p)] || 'application/octet-stream',
        'cache-control': 'public, max-age=0, must-revalidate',
        etag: '"' + buf.length + '"',
      },
    });
  };
  return {
    async fetch(request) {
      const url = new URL(request.url);
      let p = decodeURIComponent(url.pathname);
      const redirect = (to) => new Response(null, { status: 307, headers: { location: to + url.search } });
      if (p === '/index.html') return redirect('/');
      if (p.endsWith('.html')) return redirect(p.slice(0, -5));
      if (p === '/') return file(path.join(PUBLIC, 'index.html'));
      const direct = path.join(PUBLIC, p);
      if (!direct.startsWith(PUBLIC)) return new Response('no', { status: 403 });
      if (exists(direct)) return file(direct);
      if (exists(direct + '.html')) return file(direct + '.html');
      return new Response('Nicht gefunden', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    },
  };
}

function makeKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(key, opts) {
      if (!store.has(key)) return null;
      const v = store.get(key);
      return opts && opts.type === 'json' ? JSON.parse(v) : v;
    },
    async put(key, value) { store.set(key, String(value)); },
  };
}

/* Startet den Server. options.events: Liste für /api/events; flags.failApi: API antwortet 500 */
export async function startServer({ events = [], port = 0 } = {}) {
  const worker = await loadWorker();
  const kv = makeKV({ index: JSON.stringify(events) });
  const flags = { failApi: false };
  const env = { ASSETS: makeAssets(), VESZ_KV: kv, ADMIN_STATS_SECRET: 'test-secret' };
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };

  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const origin = `http://${req.headers.host}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      const request = new Request(origin + req.url, {
        method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      let response;
      if (flags.failApi && new URL(request.url).pathname === '/api/events') {
        response = new Response('Interner Fehler', { status: 500 });
      } else {
        response = await worker.fetch(request, env, ctx);
      }
      await Promise.all(pending.splice(0));
      const out = {};
      response.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
      const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
      if (cookies.length) out['set-cookie'] = cookies;
      res.writeHead(response.status, out);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error('Harness-Fehler:', e);
      res.writeHead(500); res.end(String(e));
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const actualPort = server.address().port;
  return {
    url: `http://127.0.0.1:${actualPort}`,
    port: actualPort,
    kv, flags, events,
    async stop() { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); },
    // gleicher Port wieder aufmachen (Offline-Test)
    async restart() { return startServer({ events, port: actualPort }); },
  };
}

/* Beispiel-Ereignisse, bewusst mit Sonderfällen (ő, Sonderzeichen, sehr langer Text, böse Eingaben) */
export function sampleEvents(base = Date.parse('2026-10-15T18:00:00Z')) {
  const iso = (minAgo) => new Date(base - minAgo * 60000).toISOString();
  const ev = (id, o) => ({ id: String(id), link: `https://www.katasztrofavedelem.hu/${id}/esemeny`, pubDate: iso(o.ago),
    title_hu: 'Ungarischer Titel', description_hu: 'Ungarischer Text', firstSeen: iso(o.ago), ...o });
  return [
    ev(1, { ago: 20, category: 'unfall', county: 'Győr-Moson-Sopron', active: true,
      title_de: 'Verkehrsunfall bei Győr: zwei Fahrzeuge zusammengestoßen',
      description_de: 'Auf der Hauptstraße 1 bei Győr sind zwei Pkw zusammengestoßen. Die Berufsfeuerwehr sicherte die Unfallstelle, eine Person wurde verletzt ins Krankenhaus gebracht. Die Straße war zeitweise gesperrt.' }),
    ev(2, { ago: 45, category: 'feuer', county: 'Pest', active: true,
      title_de: 'Waldbrand in der Nähe von Szentendre',
      description_de: 'Ein Waldbrand auf etwa 2 Hektar wird von drei Löschzügen bekämpft. Anwohner müssen nicht evakuiert werden.' }),
    ev(3, { ago: 70, category: 'wetter', county: 'Landesweit', active: true,
      title_de: 'Gelbe Warnung vor Starkwind im ganzen Land',
      description_de: 'Für morgen werden Böen bis 70 km/h erwartet. Gegenstände im Freien sichern.' }),
    ev(4, { ago: 100, category: 'sonstiges', county: 'Szabolcs-Szatmár-Bereg', active: true,
      title_de: 'Technische Hilfeleistung: Baum auf Straße',
      description_de: 'Feuerwehr entfernt einen umgestürzten Baum von der Straße. ' + 'Überlangeswortohneleerzeichen'.repeat(6) }),
    ev(5, { ago: 160, category: 'feuer', county: 'Zala', active: true,
      title_de: 'Wohnungsbrand in Zalaegerszeg', description_de: 'Küchenbrand in einem Mehrfamilienhaus, alle Bewohner unverletzt.' }),
    ev(6, { ago: 300, category: 'unfall', county: 'Győr-Moson-Sopron', active: false,
      title_de: 'Alter Unfall (Archiv)', description_de: 'Bereits abgeschlossen.' }),
    ev(7, { ago: 600, category: 'wetter', county: 'Baranya', active: false,
      title_de: 'Starkregen in Pécs (Archiv)', description_de: 'Keller überflutet, Pumpeinsatz beendet.' }),
    ev(8, { ago: 900, category: 'sonstiges', county: 'Budapest', active: false,
      title_de: '<img src=x onerror="window.__xss=1"> Böser Titel', description_de: 'Text mit <b>HTML</b> & "Anführungszeichen"',
      link: 'javascript:window.__xss=2' }),
  ];
}
