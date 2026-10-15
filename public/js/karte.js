const API_URL = '/api/events';

const COUNTIES = [
  'Bács-Kiskun', 'Baranya', 'Borsod-Abaúj-Zemplén', 'Békés', 'Budapest',
  'Csongrád-Csanád', 'Fejér', 'Győr-Moson-Sopron', 'Hajdú-Bihar', 'Heves',
  'Jász-Nagykun-Szolnok', 'Komárom-Esztergom', 'Nógrád', 'Pest', 'Somogy',
  'Szabolcs-Szatmár-Bereg', 'Tolna', 'Vas', 'Veszprém', 'Zala', 'Landesweit'
];

async function loadCounties() {
  const loading = document.getElementById('county-loading');
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Serverfehler ' + res.status);
    const events = await res.json();
    if (!Array.isArray(events)) throw new Error('Unerwartete Antwort vom Server');
    renderCounties(events);
    loading.hidden = true;
  } catch (e) {
    console.error(e);
    loading.className = 'state err';
    loading.textContent = '';
    const h = document.createElement('h3');
    h.textContent = 'Komitate konnten nicht geladen werden';
    const p = document.createElement('p');
    p.textContent = 'Wahrscheinlich ist gerade keine Internetverbindung da oder der Server antwortet nicht. ' +
      'Lade die Seite später noch einmal.';
    loading.append(h, p);
  }
}

function renderCounties(events) {
  const counts = {};
  for (const county of COUNTIES) counts[county] = 0;

  for (const event of events) {
    if (event.active && Object.prototype.hasOwnProperty.call(counts, event.county)) {
      counts[event.county]++;
    }
  }

  const grid = document.getElementById('county-grid');
  grid.innerHTML = '';

  for (const county of COUNTIES) {
    const count = counts[county];
    const tile = document.createElement('a');
    tile.href = `/?county=${encodeURIComponent(county)}`;
    tile.className = 'county-tile' + (count > 0 ? ' has-events' : '');
    tile.innerHTML = `
      <span class="county-name">${escapeHtml(county)}</span>
      <span class="county-count">${count}</span>
    `;
    grid.appendChild(tile);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

loadCounties();
