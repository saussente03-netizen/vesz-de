/* VÉSZ · Deutsch – Icon-Generator.
   Zeichnet das App-Symbol (goldenes „É“ mit einem Akut in Warnkoralle auf tintenblauem Verlauf)
   als SVG und rendert daraus per Playwright/Chromium alle PNG-Größen nach public/assets/icons/.

   Aufruf (aus dem Repo-Ordner):  node tools/make-icons.mjs
   Voraussetzung: Playwright mit Chromium (NODE_PATH auf node_modules zeigen lassen, falls nötig). */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(process.env.PLAYWRIGHT_REQUIRE_FROM || '/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/icons');
mkdirSync(OUT, { recursive: true });

/* Gemeinsame Zeichnung auf einer 512×512-Fläche.
   rounded : abgerundete Ecken mit transparenten Rändern (Icon „any“, Favicon)
   scale   : Skalierung des Motivs um die Mitte (maskable ≈ 0,9, damit es in der Schutzzone bleibt)
   bold    : kräftigere Striche und kein Leuchten (kleine Favicons) */
function iconSvg({ rounded = true, scale = 1, bold = false } = {}) {
  const radius = rounded ? (bold ? 104 : 112) : 0;
  const stemW = bold ? 58 : 46;
  const acuteW = bold ? 48 : 38;
  const glow = bold ? '' : '<rect width="512" height="512" fill="url(#glow)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d2750"/>
      <stop offset="0.6" stop-color="#121936"/>
      <stop offset="1" stop-color="#0b0f1f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.86" r="0.55">
      <stop offset="0" stop-color="#e2624a" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#e2624a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f0cd6a"/>
      <stop offset="1" stop-color="#dcae3e"/>
    </linearGradient>
  </defs>
  <clipPath id="shape"><rect width="512" height="512" rx="${radius}" ry="${radius}"/></clipPath>
  <g clip-path="url(#shape)">
    <rect width="512" height="512" fill="url(#bg)"/>
    ${glow}
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M326 224H186V430H326M186 327H304" stroke="url(#gold)" stroke-width="${stemW}"/>
      <path d="${bold ? 'M322 74L280 146' : 'M320 86L276 160'}" stroke="#ec6a52" stroke-width="${acuteW}"/>
    </g>
  </g>
</svg>`;
}

const jobs = [
  { file: 'icon-192.png',          size: 192, svg: iconSvg({ rounded: true }),             alpha: true },
  { file: 'icon-512.png',          size: 512, svg: iconSvg({ rounded: true }),             alpha: true },
  { file: 'icon-192-maskable.png', size: 192, svg: iconSvg({ rounded: false, scale: 0.9 }), alpha: false },
  { file: 'icon-512-maskable.png', size: 512, svg: iconSvg({ rounded: false, scale: 0.9 }), alpha: false },
  { file: 'apple-touch-icon.png',  size: 180, svg: iconSvg({ rounded: false, scale: 0.94 }), alpha: false },
  { file: 'favicon-32.png',        size: 32,  svg: iconSvg({ rounded: true, scale: 1.1, bold: true }), alpha: true },
  { file: 'favicon-16.png',        size: 16,  svg: iconSvg({ rounded: true, scale: 1.1, bold: true }), alpha: true },
];

const browser = await chromium.launch();
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.size, height: job.size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">` +
      `<img id="i" width="${job.size}" height="${job.size}" style="display:block" ` +
      `src="data:image/svg+xml;base64,${Buffer.from(job.svg).toString('base64')}"></body></html>`
    );
    await page.waitForFunction(() => document.getElementById('i').complete);
    const buf = await page.screenshot({ omitBackground: job.alpha, type: 'png' });
    writeFileSync(path.join(OUT, job.file), buf);
    console.log('geschrieben:', job.file, job.size + '×' + job.size, buf.length + ' Byte');
    await page.close();
  }
  writeFileSync(path.join(OUT, 'icon.svg'), iconSvg({ rounded: true }));
  console.log('geschrieben: icon.svg');
} finally {
  await browser.close();
}
