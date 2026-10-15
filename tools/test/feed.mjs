/* Test: Kategorien-Erkennung und Verhalten bei Feed-Ausfall (ohne Netzwerk, Feed und KV sind Nachbauten).
   Aufruf: node tools/test/feed.mjs   (die Beispieltexte sind selbst geschrieben, keine echten Feed-Daten) */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vesz-feed-')), 'worker.mjs');
fs.copyFileSync(path.join(REPO, 'worker.js'), copy);
const worker = (await import(pathToFileURL(copy).href)).default;
const kvData = new Map();
const env = {
  VESZ_KV: { async get(k,o){const v=kvData.get(k); if(v===undefined) return null; return o&&o.type==='json'?JSON.parse(v):v;}, async put(k,v){kvData.set(k,v);} },
  OPENROUTER_API_KEY: ''
};
const mk = (id, t, d, active=true, cat='feuer') => ({id, link:`https://x/esemeny/${id}`, pubDate:'Wed, 15 Oct 2026 20:27:00 +0200', title_hu:t, description_hu:d, title_de:'T'+id, description_de:'D', category:cat, county:'Pest', active});
const samples = [
 ['1','Személygépkocsi ütközött egy parkoló autónak Budapest XV. kerületében','A helyszínre a Fővárosi Katasztrófavédelmi Igazgatóság tűzoltói is riasztva lettek.','unfall'],
 ['2','Árokba hajtott és felborult egy autó Debrecenben','A tűzoltók a helyszínen dolgoznak.','unfall'],
 ['3','Baleset Kecskeméten','Két személygépkocsi ütközött. A kecskeméti hivatásos tűzoltók áramtalanítottak.','unfall'],
 ['4','Raktár égett Szabadszálláson','A solti hivatásos tűzoltók és az önkéntes tűzoltók oltották.','feuer'],
 ['5','Vonat elgázolt egy embert Mélykúton','A tűzoltók a helyszínre értek.','unfall'],
 ['6','Műszaki mentés: fa dőlt az útra','A tűzoltók eltávolították a fát.','sonstiges'],
 ['7','Lakástűz Miskolcon','Tűzoltók oltják.','feuer'],
 ['8','Személyautó ütközött egy fának','Az autó kigyulladt.','unfall'],
 ['9','Autó kigyulladt az M0-son','Tűzoltók érkeztek.','feuer'],
 ['10','Sárga figyelmeztetés viharos szélre','Az ország egész területén.','wetter'],
];
env.VESZ_KV.put('index', JSON.stringify([...samples.map(s=>mk(s[0],s[1],s[2],false)), mk('99','Régi','Régi leírás',true)]));
let pass=0, fail=0;
async function run(label, fetchImpl){
  globalThis.fetch = fetchImpl;
  const ps=[]; await worker.scheduled({}, env, {waitUntil(p){ps.push(p);}}); await Promise.all(ps);
}
// Fall A: Feed liefert 503 -> aktive bleiben aktiv, Kategorien werden korrigiert
await run('503', async()=>new Response('err',{status:503}));
let idx = JSON.parse(kvData.get('index'));
for (const s of samples){ const e=idx.find(x=>x.id===s[0]); const ok=e.category===s[3]; ok?pass++:fail++; console.log(ok?'ok  ':'FAIL', s[0], e.category, '(erwartet', s[3]+')'); }
let a = idx.find(x=>x.id==='99'); (a.active===true)?pass++:fail++; console.log(a.active===true?'ok  ':'FAIL','503: aktives Ereignis bleibt aktiv');
let st = JSON.parse(kvData.get('feed_status')); (st.ok===false&&st.httpStatus===503)?pass++:fail++; console.log('status', JSON.stringify(st));
// Fall B: Feed ohne RSS (Fehlerseite mit 200)
await run('html', async()=>new Response('<html>blocked</html>',{status:200}));
idx = JSON.parse(kvData.get('index')); a = idx.find(x=>x.id==='99'); (a.active===true)?pass++:fail++; console.log(a.active===true?'ok  ':'FAIL','HTML statt RSS: bleibt aktiv');
// Fall C: gültiger, leerer Feed -> archivieren
await run('leer', async()=>new Response('<?xml version="1.0"?><rss><channel><title>x</title></channel></rss>',{status:200}));
idx = JSON.parse(kvData.get('index')); a = idx.find(x=>x.id==='99'); (a.active===false)?pass++:fail++; console.log(a.active===false?'ok  ':'FAIL','leerer gültiger Feed: archiviert');
st = JSON.parse(kvData.get('feed_status')); (st.ok===true&&st.itemsInFeed===0&&st.lastOk)?pass++:fail++; console.log('status', JSON.stringify(st));
// /api/feed-status
const r = await worker.fetch(new Request('https://x/api/feed-status'), env, {waitUntil(){}});
(r.status===200 && (await r.json()).ok===true)?pass++:fail++;
console.log(pass+' ok, '+fail+' fehlgeschlagen'); process.exit(fail?1:0);
