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
    renderCounties(events);
    loading.hidden = true;
  } catch (e) {
    console.error(e);
    loading.textContent = 'Fehler beim Laden. Bitte später erneut versuchen.';
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
    tile.href = `index.html?county=${encodeURIComponent(county)}`;
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
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

loadCounties();
