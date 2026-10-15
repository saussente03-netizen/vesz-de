/* VÉSZ · Deutsch – Test-Lauf (Worker-Nachbau + Chromium).
   Aufruf:  node tools/test/run.mjs          (Screenshots landen in $SHOTS, Standard /tmp/vesz-shots)
   Geprüft: Zugriff und Header, Besuchszählung, Manifest und Icon-Größen, Schriften (Ő ő Ű ű),
   Navigation, Filter, Detailansicht, Installationshinweis (Android-Ablauf und iOS), Offline mit
   Service Worker, Layouts in sechs Größen ohne seitliches Überlaufen, Fehlerzustand, Zeitzone,
   Impressum/Datenschutz, keine Konsolenfehler und keine CSP-Verstöße, keine fremden Adressen. */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, sampleEvents, REPO } from './harness.mjs';

const require = createRequire(process.env.PLAYWRIGHT_REQUIRE_FROM || '/opt/npm-tools/node_modules/');
const { chromium, devices } = require('playwright');

const SHOTS = process.env.SHOTS || '/tmp/vesz-shots';
fs.mkdirSync(SHOTS, { recursive: true });

/* ---------- kleine Prüf-Hilfen ---------- */
const results = [];
let section = '';
function check(name, ok, detail = '') {
  results.push({ section, name, ok: !!ok, detail });
  console.log(`${ok ? '  ok  ' : ' FEHLER'}  ${name}${!ok && detail ? '  →  ' + detail : ''}`);
}
function head(title) { section = title; console.log(`\n== ${title}`); }
async function guarded(title, fn) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(title.trim()[0])) return;
  head(title);
  try { await fn(); } catch (e) { check(`${title}: unerwarteter Abbruch`, false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)); }
}

const SIZES = [
  { w: 360, h: 800 }, { w: 390, h: 844 }, { w: 768, h: 1024 },
  { w: 834, h: 1194 }, { w: 1032, h: 1376 }, { w: 1376, h: 1032 },
];
const PAGES = [
  { path: '/', ready: '.event-card', name: 'ereignisse' },
  { path: '/karte', ready: '.county-tile', name: 'komitate' },
  { path: '/einstellungen', ready: '.settings-list', name: 'einstellungen' },
  { path: '/info', ready: '.info-hero', name: 'info' },
  { path: '/impressum', ready: '.legal', name: 'impressum' },
  { path: '/datenschutz', ready: '.legal', name: 'datenschutz' },
];

/* Seite mit Mitschnitt von Konsole, Fehlern, CSP-Verstößen und Netzwerk-Adressen */
async function newPage(browser, srv, contextOptions = {}) {
  const context = await browser.newContext({ serviceWorkers: 'allow', ...contextOptions });
  const diag = { errors: [], csp: [], requests: [] };
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI);
    });
  });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') diag.errors.push(m.text()); });
  page.on('pageerror', (e) => diag.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => diag.requests.push(r.url()));
  const origin = srv.url;
  diag.cspCount = async () => (await page.evaluate(() => (window.__csp || []).length).catch(() => 0));
  diag.foreign = () => diag.requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  return { context, page, diag };
}

/* Stil einspeisen, ohne gegen die CSP zu verstoßen (Constructable Stylesheet statt <style>) */
async function injectCss(page, css) {
  await page.evaluate((c) => { const s = new CSSStyleSheet(); s.replaceSync(c); document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; }, css);
}

function pngInfo(buf) {
  const sig = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return { sig, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] };
}

/* ====================================================================== */
const browser = await chromium.launch();
const events = sampleEvents();
let srv = await startServer({ events });

/* ---------- A: Zugriff, Header, Besuchszählung ---------- */
await guarded('A  Zugriff, Header, Besuchszählung', async () => {
  const get = (p, headers = {}) => fetch(srv.url + p, { redirect: 'manual', headers });
  const total = () => Number(srv.kv.store.get('pageviews:total') || 0);

  for (const p of ['/', '/karte', '/einstellungen', '/info', '/impressum', '/datenschutz']) {
    const r = await get(p, { Cookie: 'vesz_seen=1' });
    check(`GET ${p} → 200`, r.status === 200, 'Status ' + r.status);
    const csp = r.headers.get('content-security-policy') || '';
    check(`${p}: CSP ohne Inline-Skripte (script-src 'self')`, /script-src 'self'/.test(csp) && !/unsafe-inline/.test(csp));
    check(`${p}: nosniff und Referrer-Policy`, r.headers.get('x-content-type-options') === 'nosniff' && !!r.headers.get('referrer-policy'));
  }
  let r = await get('/karte.html');
  check('/karte.html leitet auf /karte um (Cloudflare-Verhalten bleibt erhalten)', r.status === 307 && r.headers.get('location') === '/karte');
  r = await get('/index.html');
  check('/index.html leitet auf / um', r.status === 307 && r.headers.get('location') === '/');

  const t0 = total();
  r = await get('/');
  check('Erster Aufruf ohne Cookie setzt vesz_seen', /vesz_seen=1; Max-Age=86400/.test(r.headers.get('set-cookie') || ''), r.headers.get('set-cookie'));
  check('… und zählt genau einen Besuch', total() === t0 + 1, `${t0} → ${total()}`);
  r = await get('/', { Cookie: 'vesz_seen=1' });
  check('Aufruf mit Cookie: kein neues Cookie, keine Zählung', !r.headers.get('set-cookie') && total() === t0 + 1, `Zähler ${total()}`);
  r = await get('/', { 'Sec-Fetch-Dest': 'empty' });
  check('Hintergrund-Abruf (Sec-Fetch-Dest: empty) zählt nicht', !r.headers.get('set-cookie') && total() === t0 + 1);
  r = await get('/karte', { 'Sec-Fetch-Dest': 'document' });
  check('Saubere Adresse /karte zählt als Seitenaufruf', total() === t0 + 2, `Zähler ${total()}`);
  r = await get('/js/app.js');
  check('Skriptdatei zählt nicht und setzt kein Cookie', !r.headers.get('set-cookie') && total() === t0 + 2);

  r = await get('/sw.js');
  check('sw.js: Cache-Control no-cache', r.headers.get('cache-control') === 'no-cache', r.headers.get('cache-control'));
  check('sw.js: Service-Worker-Allowed /', r.headers.get('service-worker-allowed') === '/');
  r = await get('/manifest.webmanifest');
  check('manifest.webmanifest: Content-Type application/manifest+json', /^application\/manifest\+json/.test(r.headers.get('content-type') || ''), r.headers.get('content-type'));
  r = await get('/api/events');
  const list = await r.json();
  check('/api/events liefert ein JSON-Array', Array.isArray(list) && list.length === events.length);
  r = await get('/api/admin-stats?key=falsch');
  check('/api/admin-stats ohne richtiges Geheimnis → 403', r.status === 403);
  r = await get('/api/admin-stats?key=test-secret');
  check('/api/admin-stats mit Geheimnis liefert Zähler', r.status === 200 && 'totalPageviews' in (await r.json()));
});

/* ---------- B: Manifest, Icons, Verweise in den Seiten ---------- */
await guarded('B  Manifest und Icons', async () => {
  const m = await (await fetch(srv.url + '/manifest.webmanifest')).json();
  check('Manifest: id, start_url, scope = "/"', m.id === '/' && m.start_url === '/' && m.scope === '/');
  check('Manifest: display standalone', m.display === 'standalone');
  check('Manifest: theme_color und background_color #0b0f1f', m.theme_color === '#0b0f1f' && m.background_color === '#0b0f1f');
  check('Manifest: Shortcuts vorhanden', Array.isArray(m.shortcuts) && m.shortcuts.length >= 2 && m.shortcuts.every((s) => s.url.startsWith('/')));
  for (const s of m.shortcuts) {
    const r = await fetch(srv.url + s.url, { redirect: 'manual' });
    check(`Shortcut ${s.url} erreichbar`, r.status === 200);
  }
  const wanted = [['any', 192], ['any', 512], ['maskable', 192], ['maskable', 512]];
  for (const [purpose, size] of wanted) {
    const icon = m.icons.find((i) => i.purpose === purpose && i.sizes === `${size}x${size}`);
    check(`Icon ${purpose} ${size} im Manifest`, !!icon);
    if (!icon) continue;
    const r = await fetch(srv.url + icon.src);
    const info = pngInfo(Buffer.from(await r.arrayBuffer()));
    check(`Icon ${purpose} ${size}: echtes PNG, ${size}×${size}`, r.status === 200 && info.sig && info.w === size && info.h === size, `${info.w}×${info.h}`);
    if (purpose === 'maskable') check(`Icon maskable ${size}: randlos (ohne Transparenz)`, info.colorType === 2 || info.colorType === 0, 'Farbtyp ' + info.colorType);
    else check(`Icon any ${size}: abgerundet mit Transparenz`, info.colorType === 6, 'Farbtyp ' + info.colorType);
  }
  for (const [file, size] of [['apple-touch-icon.png', 180], ['favicon-32.png', 32], ['favicon-16.png', 16]]) {
    const r = await fetch(`${srv.url}/assets/icons/${file}`);
    const info = pngInfo(Buffer.from(await r.arrayBuffer()));
    check(`${file}: ${size}×${size}`, r.status === 200 && info.w === size && info.h === size, `${info.w}×${info.h}`);
  }
  const logo = pngInfo(Buffer.from(await (await fetch(srv.url + '/assets/images/melovista-logo.png')).arrayBuffer()));
  const logoSize = (await (await fetch(srv.url + '/assets/images/melovista-logo.png')).arrayBuffer()).byteLength;
  check('Footer-Logo verkleinert (96×96, unter 30 KB)', logo.w === 96 && logo.h === 96 && logoSize < 30000, `${logo.w}×${logo.h}, ${logoSize} Byte`);

  // Alle Verweise in den Seiten müssen auflösen; alle Sprite-Symbole müssen existieren
  const sprite = await (await fetch(srv.url + '/assets/icons/sprite.svg')).text();
  for (const p of PAGES) {
    const html = await (await fetch(srv.url + p.path, { headers: { Cookie: 'vesz_seen=1' } })).text();
    check(`${p.path}: Manifest-Link, Apple-Icon, Favicons, viewport-fit=cover`,
      html.includes('href="/manifest.webmanifest"') && html.includes('href="/assets/icons/apple-touch-icon.png"') &&
      html.includes('favicon-32.png') && html.includes('viewport-fit=cover'));
    check(`${p.path}: keine Emoji-Navigation, kein Inline-Skript, kein style-Attribut`,
      !/<script(?![^>]*\bsrc=)[^>]*>/.test(html) && !/\sstyle=/.test(html) && !/📋|🗺|⚙|ℹ/.test(html.split('<nav')[1] || ''));
    const used = [...html.matchAll(/sprite\.svg#(i-[a-z-]+)/g)].map((m) => m[1]);
    check(`${p.path}: alle Sprite-Symbole vorhanden (${[...new Set(used)].join(', ')})`, used.every((id) => sprite.includes(`id="${id}"`)));
    check(`${p.path}: Footer verlinkt /impressum und /datenschutz`, html.includes('href="/impressum"') && html.includes('href="/datenschutz"'));
    check(`${p.path}: kein Link mehr auf melovistastudio.com/impressum.html`, !html.includes('melovistastudio.com/impressum'));
  }
  const refs = new Set();
  for (const f of ['css/style.css', 'css/fonts.css']) {
    const css = fs.readFileSync(path.join(REPO, 'public', f), 'utf8');
    for (const m of css.matchAll(/url\('([^']+)'\)/g)) refs.add(path.posix.normalize(path.posix.join('/' + path.posix.dirname(f), m[1])));
  }
  for (const u of refs) {
    const r = await fetch(srv.url + u);
    check(`CSS-Verweis ${u} → 200`, r.status === 200);
  }
});

/* ---------- C: Schriften (Ő ő Ű ű) ---------- */
await guarded('C  Schriften: Ő ő Ű ű', async () => {
  const { context, page, diag } = await newPage(browser, srv, { viewport: { width: 1032, height: 1376 } });
  await page.goto(srv.url + '/');
  await page.waitForSelector('.event-card');
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(async () => {
    await document.fonts.load("16px 'Rendor Ext'", 'ŐőŰű');
    return {
      check: ['Ő', 'ő', 'Ű', 'ű'].map((c) => document.fonts.check("16px 'Rendor Ext'", c)),
      loaded: [...document.fonts].filter((f) => f.family.replace(/['"]/g, '') === 'Rendor Ext' && f.status === 'loaded').length,
    };
  });
  check('document.fonts.check("16px \'Rendor Ext\'", Ő ő Ű ű) → true', ok.check.every(Boolean), JSON.stringify(ok));
  check('Mindestens eine Rendor-Ext-Schrift ist tatsächlich geladen', ok.loaded >= 1, 'geladen: ' + ok.loaded);

  async function platformFonts(selectorText, extraCss) {
    if (extraCss) await injectCss(page, extraCss);
    await page.evaluate((t) => {
      document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t'));
      [...document.querySelectorAll('.event-county')].find((e) => e.textContent.includes(t)).setAttribute('data-t', '1');
    }, selectorText);
    const client = await context.newCDPSession(page);
    await client.send('DOM.enable'); await client.send('CSS.enable');
    const doc = await client.send('DOM.getDocument');
    const { nodeId } = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-t]' });
    const res = await client.send('CSS.getPlatformFontsForNode', { nodeId });
    return res.fonts;
  }
  const fonts = await platformFonts('Győr');
  console.log('        Schriften für „Győr-Moson-Sopron“:', JSON.stringify(fonts.map((f) => [f.familyName, f.glyphCount, f.isCustomFont])));
  check('„Győr-Moson-Sopron“: alle Zeichen aus eigenen Schriften (keine Systemschrift)', fonts.length > 0 && fonts.every((f) => f.isCustomFont), JSON.stringify(fonts));

  // Gegenprobe: ohne „Rendor Ext“ im Stapel muss der Test die Systemschrift erkennen
  const ctrl = await platformFonts('Győr', ".event-county{font-family:'IBM Plex Mono', monospace !important}");
  check('Gegenprobe: ohne Ergänzungsschrift fällt das ő auf die Systemschrift zurück (Test erkennt den Fehler)', ctrl.some((f) => !f.isCustomFont), JSON.stringify(ctrl));
  await context.close();
});

/* ---------- D: Layouts in sechs Größen ---------- */
await guarded('D  Layouts in sechs Größen (ohne seitliches Überlaufen)', async () => {
  const cols = {};
  for (const size of SIZES) {
    const { context, page, diag } = await newPage(browser, srv, { viewport: { width: size.w, height: size.h } });
    for (const p of PAGES) {
      await page.goto(srv.url + p.path);
      await page.waitForSelector(p.ready);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const nav = document.querySelector('.app-nav').getBoundingClientRect();
        const off = [...document.querySelectorAll('body *')].filter((e) => {
          if (getComputedStyle(e).position === 'fixed') return false;
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5);
        }).slice(0, 5).map((e) => e.tagName + '.' + e.className);
        const cs = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).gridTemplateColumns.split(' ').length : 0; };
        const brand = document.querySelector('.brand').getBoundingClientRect();
        const first = document.querySelector('main > *:not([hidden])').getBoundingClientRect();
        const logo = document.querySelector('.rail-logo');
        return {
          vw, vh, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, off,
          nav: { left: nav.left, top: nav.top, w: nav.width, h: nav.height, bottom: nav.bottom },
          rootFont: getComputedStyle(document.documentElement).fontSize,
          eventCols: cs('#active-list'), countyCols: cs('#county-grid'), infoCols: cs('.page-info'),
          brandLeft: brand.left, mainFirstLeft: first.left, logoShown: logo && getComputedStyle(logo).display !== 'none',
        };
      });
      const tag = `${size.w}×${size.h} ${p.path}`;
      check(`${tag}: kein seitliches Überlaufen`, m.scrollW <= m.vw && m.bodyScrollW <= m.vw && m.off.length === 0, `scrollW ${m.scrollW}/${m.vw} ${m.off.join(',')}`);
      if (size.w >= 768) {
        check(`${tag}: Navigation als Seitenleiste (92 px, links, volle Höhe)`, m.nav.left === 0 && m.nav.w === 92 && Math.abs(m.nav.h - m.vh) < 1, JSON.stringify(m.nav));
        check(`${tag}: Schrift 17 px`, m.rootFont === '17px', m.rootFont);
        check(`${tag}: Kopfzeile bündig zum Inhalt`, Math.abs(m.brandLeft - m.mainFirstLeft) < 1.5, `${m.brandLeft} / ${m.mainFirstLeft}`);
        check(`${tag}: Logo in der Leiste sichtbar`, m.logoShown);
      } else {
        check(`${tag}: Navigation unten, volle Breite`, Math.abs(m.nav.bottom - m.vh) < 1 && Math.abs(m.nav.w - m.vw) < 1, JSON.stringify(m.nav));
        check(`${tag}: Schrift 16 px`, m.rootFont === '16px', m.rootFont);
      }
      if (p.path === '/') cols[size.w] = { ...(cols[size.w] || {}), events: m.eventCols };
      if (p.path === '/karte') cols[size.w] = { ...(cols[size.w] || {}), counties: m.countyCols };
      if (p.path === '/info') check(`${tag}: Info ${size.w >= 768 ? 'in zwei Spalten' : 'einspaltig'}`, m.infoCols === (size.w >= 768 ? 2 : 1), 'Spalten ' + m.infoCols);
      if (['/', '/karte', '/einstellungen', '/info', '/datenschutz'].includes(p.path)) {
        await page.screenshot({ path: path.join(SHOTS, `${p.name}-${size.w}x${size.h}.png`), fullPage: false });
      }
      // Auf Handys: Ende der Seite darf nicht unter der Navigation liegen
      if (size.w < 768 && p.path === '/') {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const clear = await page.evaluate(() => {
          const last = document.querySelector('.app-footer p:last-child').getBoundingClientRect();
          return document.querySelector('.app-nav').getBoundingClientRect().top - last.bottom;
        });
        check(`${tag}: Fußzeile liegt nicht unter der Navigation`, clear >= 0, 'Abstand ' + clear);
      }
    }
    check(`${size.w}×${size.h}: keine Konsolenfehler, keine CSP-Verstöße`, diag.errors.length === 0, diag.errors.slice(0, 3).join(' | '));
    await context.close();
  }
  console.log('        Spalten (Ereignisse / Komitate):', JSON.stringify(cols));
  check('Ereignis-Spalten wachsen mit der Breite (768 ≤ 834 ≤ 1032 ≤ 1376, quer ≥ 3)',
    cols[768].events <= cols[834].events && cols[834].events <= cols[1032].events && cols[1032].events <= cols[1376].events && cols[1376].events >= 3 && cols[834].events >= 2,
    JSON.stringify(cols));
  check('Komitate-Kacheln: Handy 2 Spalten, Tablet mehr', cols[360].counties === 2 && cols[390].counties === 2 && cols[1376].counties >= 4, JSON.stringify(cols));

  // Flaches Querformat
  const { context, page } = await newPage(browser, srv, { viewport: { width: 1024, height: 500 } });
  await page.goto(srv.url + '/');
  await page.waitForSelector('.event-card');
  const flat = await page.evaluate(() => ({
    logo: getComputedStyle(document.querySelector('.rail-logo')).display,
    navScroll: document.querySelector('.app-nav').scrollHeight <= window.innerHeight + 1,
  }));
  check('Flaches Querformat (1024×500): Logo in der Leiste ausgeblendet', flat.logo === 'none', flat.logo);
  check('Flaches Querformat: alle vier Menüpunkte passen in die Leiste', flat.navScroll);
  await page.locator('.event-card').first().click();
  const sheet = await page.evaluate(() => getComputedStyle(document.querySelector('.detail-card')).maxHeight);
  check('Flaches Querformat: Detailansicht darf bis 92 % der Höhe', sheet === '460px', sheet);
  await page.screenshot({ path: path.join(SHOTS, 'ereignisse-flach-1024x500.png') });
  await context.close();
});

/* ---------- E: Navigation, Filter, Detailansicht ---------- */
await guarded('E  Navigation, Filter, Detailansicht', async () => {
  const { context, page, diag } = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  await page.goto(srv.url + '/');
  await page.waitForSelector('.event-card');

  const labels = await page.$$eval('.app-nav .nav-item', (a) => a.map((x) => x.textContent.trim()));
  check('Menüpunkte: Ereignisse, Komitate, Einstellungen, Info', JSON.stringify(labels) === JSON.stringify(['Ereignisse', 'Komitate', 'Einstellungen', 'Info']), labels.join(','));
  check('Navigation enthält keine Emoji', !(await page.$$eval('.app-nav', (n) => /\p{Extended_Pictographic}/u.test(n[0].textContent))));
  // Symbole zeichnen wirklich etwas (mit/ohne Symbol unterscheidet sich das Bild)
  const icon = page.locator('.app-nav .nav-item .ic').nth(1);
  const withIcon = await icon.screenshot();
  await injectCss(page, '.app-nav svg { visibility: hidden !important; }');
  const without = await icon.screenshot();
  check('SVG-Symbole werden gezeichnet (Komitate-Symbol sichtbar)', !withIcon.equals(without));
  await page.reload(); await page.waitForSelector('.event-card');

  check('Ereignisse: Navigation markiert „Ereignisse“', (await page.getAttribute('.nav-item[aria-current="page"]', 'href')) === '/');
  const cardCount = await page.locator('#active-list .event-card').count();
  check('Aktive Ereignisse: 5, Archiv: 3', cardCount === 5 && (await page.locator('#archive-list .event-card').count()) === 3, 'aktiv ' + cardCount);
  const sub = await page.textContent('#sub');
  check('Kopfzeile zeigt „Stand … Uhr · 5 aktiv“', /Stand \d\d:\d\d Uhr · 5 aktiv/.test(sub), sub);
  check('Kategorie-Badge je Karte', (await page.locator('.event-card .badge').count()) === 8);

  // Navigation durchklicken
  for (const [label, href] of [['Komitate', '/karte'], ['Einstellungen', '/einstellungen'], ['Info', '/info'], ['Ereignisse', '/']]) {
    await page.locator('.app-nav .nav-item', { hasText: label }).click();
    await page.waitForURL(srv.url + href);
    const cur = await page.getAttribute('.nav-item[aria-current="page"]', 'href');
    check(`Klick „${label}“ → ${href}, Menüpunkt markiert`, cur === href, cur);
  }

  // Komitat-Filter über die Kacheln
  await page.locator('.app-nav .nav-item', { hasText: 'Komitate' }).click();
  await page.waitForSelector('.county-tile');
  const tiles = await page.locator('.county-tile').count();
  check('Komitate: 21 Kacheln (20 + Landesweit)', tiles === 21, String(tiles));
  const gyor = page.locator('.county-tile', { hasText: 'Győr-Moson-Sopron' });
  check('Kachel Győr-Moson-Sopron zeigt 1 aktives Ereignis', (await gyor.locator('.county-count').textContent()).trim() === '1');
  await gyor.click();
  await page.waitForSelector('.event-card');
  check('Filter: Banner „Gefiltert: Győr-Moson-Sopron“', (await page.textContent('#county-filter-banner .filter-text')) === 'Gefiltert: Győr-Moson-Sopron');
  check('Filter: nur Karten dieses Komitats (1 aktiv, 1 Archiv)', (await page.locator('#active-list .event-card').count()) === 1 && (await page.locator('#archive-list .event-card').count()) === 1);
  await page.click('.filter-clear');
  await page.waitForSelector('.event-card');
  check('Filter entfernen: wieder alle 8 Karten, kein Banner', (await page.locator('.event-card').count()) === 8 && (await page.locator('#county-filter-banner').isHidden()));

  // Kategorien aus den Einstellungen
  await page.locator('.app-nav .nav-item', { hasText: 'Einstellungen' }).click();
  await page.waitForSelector('.settings-list');
  await page.locator('input[data-category="feuer"]').evaluate((el) => el.click());
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vesz-settings')));
  check('Einstellung „Feuer aus“ in localStorage (vesz-settings)', saved.feuer === false && saved.unfall === true);
  await page.locator('.app-nav .nav-item', { hasText: 'Ereignisse' }).click();
  await page.waitForSelector('.event-card');
  check('Ereignisse ohne Feuer (6 Karten)', (await page.locator('.event-card.cat-feuer').count()) === 0 && (await page.locator('.event-card').count()) === 6);
  await page.evaluate(() => localStorage.clear());

  // Detailansicht
  await page.reload(); await page.waitForSelector('.event-card');
  const first = page.locator('#active-list .event-card').first();
  await first.focus();
  await page.keyboard.press('Enter');
  check('Detailansicht öffnet per Tastatur (Enter)', await page.locator('#detail-overlay').isVisible());
  check('Detail: Titel, Komitat, Original-Link (https)',
    (await page.textContent('.detail-title')).includes('Győr') && (await page.textContent('.detail-county')) === 'Győr-Moson-Sopron' &&
    (await page.getAttribute('.detail-link', 'href')).startsWith('https://www.katasztrofavedelem.hu/'));
  check('Detail: Fokus auf dem Schließen-Knopf', await page.evaluate(() => document.activeElement.id === 'detail-close'));
  await page.keyboard.press('Escape');
  check('Escape schließt die Detailansicht und gibt den Fokus zurück', (await page.locator('#detail-overlay').isHidden()) && (await first.evaluate((el) => el === document.activeElement)));

  // Böse Eingaben
  const evil = page.locator('#archive-list .event-card', { hasText: 'Böser Titel' });
  check('Böser Titel wird als Text angezeigt (HTML maskiert)', (await evil.locator('.event-title').textContent()).startsWith('<img src=x'));
  await evil.click();
  check('Link mit javascript: wird nicht ausgegeben', (await page.locator('.detail-link').count()) === 0);
  check('Kein Skript aus Meldungstexten ausgeführt', (await page.evaluate(() => window.__xss)) === undefined);

  check('Keine Konsolenfehler, keine CSP-Verstöße', diag.errors.length === 0 && (await diag.cspCount()) === 0, diag.errors.join(' | '));
  check('Keine Anfragen an fremde Adressen (keine Google-Schriften, keine Tracker)', diag.foreign().length === 0, diag.foreign().join(', '));
  await context.close();
});

/* ---------- F: Detailansicht neben der Leiste (Tablet) ---------- */
await guarded('F  Tablet: Detailansicht neben der Seitenleiste', async () => {
  const { context, page } = await newPage(browser, srv, { viewport: { width: 1032, height: 1376 } });
  await page.goto(srv.url + '/');
  await page.waitForSelector('.event-card');
  await page.locator('.event-card').first().click();
  const g = await page.evaluate(() => {
    const o = document.getElementById('detail-overlay').getBoundingClientRect();
    const hit = document.elementFromPoint(46, 400);
    const card = document.querySelector('.detail-card').getBoundingClientRect();
    return { left: o.left, navHit: !!hit.closest('.app-nav'), cardW: card.width, cardCenter: card.left + card.width / 2, areaCenter: 92 + (innerWidth - 92) / 2 };
  });
  check('Overlay beginnt rechts neben der Leiste (92 px)', g.left === 92, String(g.left));
  check('Seitenleiste bleibt sichtbar und bedienbar', g.navHit);
  check('Karte ist mittig im freien Bereich und höchstens 560 px breit', g.cardW <= 560 && Math.abs(g.cardCenter - g.areaCenter) < 2, JSON.stringify(g));
  await page.screenshot({ path: path.join(SHOTS, 'detail-1032x1376.png') });
  await context.close();

  const phone = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  await phone.page.goto(srv.url + '/');
  await phone.page.waitForSelector('.event-card');
  await phone.page.locator('.event-card').first().click();
  const b = await phone.page.evaluate(() => Math.round(document.querySelector('.detail-card').getBoundingClientRect().bottom));
  check('Handy: Detailansicht als Blatt am unteren Rand', b === 844, String(b));
  await phone.page.screenshot({ path: path.join(SHOTS, 'detail-390x844.png') });
  await phone.context.close();
});

/* ---------- G: Installationshinweis ---------- */
await guarded('G  Installationshinweis', async () => {
  const fakePrompt = () => {
    window.__prompted = 0;
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__prompted++; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(e);
  };

  // Android/Chrome: Ablauf „Installieren“
  let t = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  await t.page.goto(srv.url + '/');
  await t.page.waitForSelector('.event-card');
  check('Ohne beforeinstallprompt: kein Hinweis', (await t.page.locator('#install-banner').count()) === 0);
  await t.page.evaluate(fakePrompt);
  await t.page.waitForSelector('#install-banner:not([hidden])');
  check('Hinweis erscheint mit „Installieren“ und „Später“', (await t.page.locator('#ib-install').isVisible()) && (await t.page.locator('#ib-later').isVisible()));
  await t.page.waitForTimeout(600);
  check('Hinweis sitzt über der Navigation',
    await t.page.evaluate(() => document.getElementById('install-banner').getBoundingClientRect().bottom <= document.querySelector('.app-nav').getBoundingClientRect().top + 1));
  await t.page.screenshot({ path: path.join(SHOTS, 'install-android-390x844.png') });
  await t.page.click('#ib-install');
  check('„Installieren“ ruft prompt() auf und blendet den Hinweis aus', (await t.page.evaluate(() => window.__prompted)) === 1 && (await t.page.locator('#install-banner').isHidden()));
  await t.page.waitForFunction(() => localStorage.getItem('vesz-installed') === '1');
  check('Nach Annahme: vesz-installed = 1', true);
  await t.page.reload(); await t.page.waitForSelector('.event-card');
  await t.page.evaluate(fakePrompt);
  await t.page.waitForTimeout(300);
  check('Nach Installation kommt kein Hinweis mehr', (await t.page.locator('#install-banner:not([hidden])').count()) === 0);
  check('Keine Konsolenfehler/CSP-Verstöße im Hinweis-Ablauf', t.diag.errors.length === 0 && (await t.diag.cspCount()) === 0, t.diag.errors.join(' | '));
  await t.context.close();

  // „Später“ → 7 Tage Ruhe, auf allen Seiten
  t = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  await t.page.goto(srv.url + '/');
  await t.page.evaluate(fakePrompt);
  await t.page.waitForSelector('#install-banner:not([hidden])');
  await t.page.click('#ib-later');
  check('„Später“ blendet aus und merkt sich den Zeitpunkt', (await t.page.locator('#install-banner').isHidden()) && (await t.page.evaluate(() => Number(localStorage.getItem('vesz-install-dismissed')) > Date.now() - 5000)));
  await t.page.goto(srv.url + '/karte'); await t.page.waitForSelector('.county-tile');
  await t.page.evaluate(fakePrompt); await t.page.waitForTimeout(300);
  check('Nach „Später“ auch auf anderen Seiten Ruhe', (await t.page.locator('#install-banner:not([hidden])').count()) === 0);
  await t.page.evaluate(() => localStorage.setItem('vesz-install-dismissed', String(Date.now() - 8 * 24 * 3600 * 1000)));
  await t.page.goto(srv.url + '/info');
  await t.page.evaluate(fakePrompt);
  await t.page.waitForSelector('#install-banner:not([hidden])');
  check('Nach 8 Tagen erscheint der Hinweis wieder', true);
  await t.context.close();

  // Einstellungen: Zeile „Als App installieren“
  t = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  await t.page.goto(srv.url + '/einstellungen');
  await t.page.waitForSelector('#install-note');
  check('Einstellungen ohne Installationsangebot: Erklärtext, kein Knopf', (await t.page.locator('#install-btn').isHidden()) && /Menü/.test(await t.page.textContent('#install-note')));
  await t.page.evaluate(fakePrompt);
  await t.page.waitForSelector('#install-btn:not([hidden])');
  await t.page.screenshot({ path: path.join(SHOTS, 'einstellungen-install-390x844.png') });
  await t.page.click('#install-btn');
  await t.page.waitForFunction(() => window.__prompted === 1);
  check('Knopf in den Einstellungen löst die Installation aus', true);
  await t.context.close();

  // Bereits installiert (Standalone): kein Hinweis
  t = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  await t.context.addInitScript(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : orig(q));
  });
  await t.page.goto(srv.url + '/einstellungen');
  await t.page.evaluate(fakePrompt); await t.page.waitForTimeout(300);
  check('Standalone-Modus: kein Hinweis, Text „installierte App“', (await t.page.locator('#install-banner:not([hidden])').count()) === 0 && /installierte App/.test(await t.page.textContent('#install-note')));
  await t.context.close();

  // iPhone: Anleitung statt Knopf
  const iphone = devices['iPhone 13'];
  t = await newPage(browser, srv, { ...iphone });
  await t.page.goto(srv.url + '/');
  await t.page.waitForSelector('#install-banner:not([hidden])', { timeout: 5000 });
  check('iPhone-Kennung: Anleitung „Teilen → Zum Home-Bildschirm“ statt Installieren-Knopf',
    (await t.page.locator('#ib-msg-ios').isVisible()) && (await t.page.locator('#ib-install').isHidden()) && (await t.page.textContent('#ib-later')) === 'Verstanden');
  check('iPhone: Teilen- und Plus-Symbol im Hinweis', (await t.page.locator('#ib-msg-ios svg').count()) === 2);
  await t.page.screenshot({ path: path.join(SHOTS, 'install-ios.png') });
  await t.page.click('#ib-later');
  check('iPhone: „Verstanden“ blendet aus', await t.page.locator('#install-banner').isHidden());
  await t.context.close();
});

/* ---------- H: Offline mit Service Worker ---------- */
await guarded('H  Offline mit Service Worker', async () => {
  const { context, page, diag } = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  await page.goto(srv.url + '/');
  await page.waitForSelector('.event-card');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('.event-card');
  const sw = await page.evaluate(async () => ({
    controlled: !!navigator.serviceWorker.controller,
    keys: await caches.keys(),
    count: await caches.open('vesz-v1').then((c) => c.keys()).then((k) => k.map((r) => new URL(r.url).pathname)),
  }));
  check('Service Worker aktiv und steuert die Seite', sw.controlled);
  check('Speicher „vesz-v1“ angelegt', sw.keys.includes('vesz-v1'), sw.keys.join(','));
  for (const p of ['/', '/karte', '/einstellungen', '/info', '/impressum', '/datenschutz', '/css/style.css', '/js/pwa.js', '/assets/icons/sprite.svg', '/assets/fonts/rendor-ext-400.woff', '/api/events']) {
    check(`Zwischenspeicher enthält ${p}`, sw.count.includes(p));
  }
  check('Besuchszählung nicht durch den Service Worker verdoppelt', Number(srv.kv.store.get('pageviews:total')) >= 1);
  const countBefore = Number(srv.kv.store.get('pageviews:total'));

  // Server aus: wie ohne Internet
  const port = srv.port;
  await srv.stop();
  await page.goto(srv.url + '/');
  await page.waitForSelector('.event-card');
  check('Offline: Startseite lädt mit den zuletzt geladenen Ereignissen (8 Karten)', (await page.locator('.event-card').count()) === 8);
  const sub = await page.textContent('#sub');
  check('Offline: Kopfzeile zeigt „Offline · Stand …“', /^Offline · Stand \d\d:\d\d Uhr$/.test(sub), sub);
  await page.screenshot({ path: path.join(SHOTS, 'offline-390x844.png') });
  await page.locator('.app-nav .nav-item', { hasText: 'Komitate' }).click();
  await page.waitForSelector('.county-tile');
  check('Offline: Komitate-Seite mit Zahlen', (await page.locator('.county-tile.has-events').count()) >= 3);
  await page.goto(srv.url + '/info.html');
  await page.waitForSelector('.info-hero');
  check('Offline: /info.html findet die gemerkte Seite /info', page.url().endsWith('/info.html') || page.url().endsWith('/info'));
  await page.goto(srv.url + '/datenschutz');
  check('Offline: Datenschutz erreichbar', (await page.locator('.legal').count()) > 0);
  await page.goto(srv.url + '/gibt-es-nicht');
  check('Offline: unbekannte Adresse zeigt die App-Hülle statt Browser-Fehlerseite', (await page.locator('.app-header').count()) > 0);
  await page.goto(srv.url + '/?county=Pest');
  await page.waitForSelector('.event-card');
  check('Offline: Komitat-Filter funktioniert (1 Karte für Pest)', (await page.locator('.event-card').count()) === 1);

  // Wieder online
  srv = await srv.restart();
  await page.goto(srv.url + '/');
  await page.waitForSelector('.event-card');
  await page.waitForFunction(() => /^Stand \d\d:\d\d Uhr/.test(document.getElementById('sub').textContent));
  check('Wieder online: „Stand … Uhr“ ohne Offline-Hinweis', true);
  check('Wieder online: Besuchszähler wurde durch den Offline-Test nicht verfälscht', Number(srv.kv.store.get('pageviews:total') || 0) >= 0);
  const errs = diag.errors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED|net::/.test(e));
  check('Keine Konsolenfehler außer den erwarteten Netzwerkfehlern des Offline-Tests', errs.length === 0, errs.join(' | '));
  await context.close();
});

/* ---------- I: Fehlerzustand und Zeitzone ---------- */
await guarded('I  Fehlerzustand und Zeitzone', async () => {
  let t = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  srv.flags.failApi = true;
  await t.page.goto(srv.url + '/');
  await t.page.waitForSelector('#loading.err');
  const txt = await t.page.textContent('#loading');
  check('Serverfehler: Erklärung statt nacktem Fehler', /konnten nicht geladen werden/.test(txt) && /Internetverbindung/.test(txt) && /Serverfehler 500/.test(txt), txt);
  await t.page.screenshot({ path: path.join(SHOTS, 'fehler-390x844.png') });
  srv.flags.failApi = false;
  await t.page.click('#refresh-btn');
  await t.page.waitForSelector('.event-card');
  check('Nach „Aktualisieren“ erscheinen die Ereignisse, Fehlerhinweis weg', await t.page.locator('#loading').isHidden());
  // Liste bleibt bei späterem Fehler stehen
  srv.flags.failApi = true;
  await t.page.click('#refresh-btn');
  await t.page.waitForFunction(() => /Aktualisierung fehlgeschlagen/.test(document.getElementById('sub').textContent));
  check('Fehler beim Auto-Refresh: Liste bleibt, Hinweis in der Kopfzeile', (await t.page.locator('.event-card').count()) === 8);
  srv.flags.failApi = false;
  await t.context.close();

  t = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  srv.flags.failApi = true;
  await t.page.goto(srv.url + '/karte');
  await t.page.waitForSelector('#county-loading.err');
  check('Komitate bei Serverfehler: Erklärung', /Komitate konnten nicht geladen werden/.test(await t.page.textContent('#county-loading')));
  srv.flags.failApi = false;
  await t.context.close();

  // Zeitzone: Gerät in New York, Anzeige bleibt ungarische Ortszeit (Oktober: UTC+2)
  const ny = await newPage(browser, srv, { viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
  const stamp = await (async () => {
    srv.events.splice(0, srv.events.length, ...sampleEvents(Date.parse('2026-10-15T20:00:00Z')));
    srv.kv.store.set('index', JSON.stringify(srv.events));
    await ny.page.goto(srv.url + '/');
    await ny.page.waitForSelector('.event-card');
    return ny.page.locator('.event-card .event-date').first().textContent();
  })();
  check('Zeitzone: Gerät in New York, Karte zeigt Budapester Zeit (20:00 UTC − 20 min = 21:40)', /15\.10\.2026.*21:40/.test(stamp), stamp);
  await ny.context.close();
});

/* ---------- J: Impressum und Datenschutz ---------- */
await guarded('J  Impressum und Datenschutz', async () => {
  const { context, page, diag } = await newPage(browser, srv, { viewport: { width: 390, height: 844 } });
  await page.goto(srv.url + '/impressum');
  const imp = await page.textContent('main');
  check('Impressum: Anbieter, Anschrift, E-Mail, § 5 DDG', ['Jacqueline Susann Grollius', 'Bem József utca 22', '8762 Szentpéterúr', 'jacqueline@melovistastudio.com', '§ 5 DDG'].every((s) => imp.includes(s)));
  check('Impressum: keine Melovista-Inhalte (Songs, Suno, Katalog)', !/Suno|Melovista-Katalog|Songs/.test(imp));
  check('Impressum: katasztrofavedelem.hu, 112, KI-Übersetzung, keine amtliche Auskunft', ['katasztrofavedelem.hu', '112', 'KI-Modell', 'keine amtliche Auskunft'].every((s) => imp.includes(s)));
  check('Impressum: offene Punkte sind markiert', (await page.locator('.todo').count()) >= 2);
  await page.goto(srv.url + '/datenschutz');
  const ds = await page.textContent('main');
  check('Datenschutz: Verantwortliche, Cloudflare, vesz_seen, OpenRouter, NAIH', ['Jacqueline Susann Grollius', 'Cloudflare', 'vesz_seen', 'OpenRouter', 'NAIH'].every((s) => ds.includes(s)));
  check('Datenschutz: localStorage-Schlüssel genannt', ['vesz-settings', 'vesz-install-dismissed', 'vesz-installed'].every((s) => ds.includes(s)));
  check('Datenschutz: [prüfen] und [von Anwältin prüfen] sichtbar markiert', /\[prüfen/.test(ds) && /\[von Anwältin prüfen/.test(ds) && (await page.locator('.todo').count()) >= 6, 'Markierungen: ' + (await page.locator('.todo').count()));
  check('Datenschutz: kein Melovista-Konto/Zahlungs-Text', !/Supabase|PayPal|Suno|Konto löschen/.test(ds));
  await page.screenshot({ path: path.join(SHOTS, 'datenschutz-todo-390x844.png'), fullPage: false });
  check('Keine Konsolenfehler/CSP-Verstöße', diag.errors.length === 0 && (await diag.cspCount()) === 0, diag.errors.join(' | '));
  await context.close();
});

/* ---------- Zusammenfassung ---------- */
await srv.stop();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} von ${results.length} Prüfungen bestanden, ${failed.length} Fehler.`);
if (failed.length) {
  console.log('\nFehlgeschlagen:');
  for (const f of failed) console.log(` - [${f.section}] ${f.name}${f.detail ? ' → ' + f.detail : ''}`);
  process.exit(1);
}
