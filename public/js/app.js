const API_URL = '/api/events';
const SETTINGS_KEY = 'vesz-settings';
const DEFAULT_SETTINGS = { unfall: true, feuer: true, wetter: true, sonstiges: true };
const TIME_ZONE = 'Europe/Budapest'; // Ereignisse sind in ungarischer Ortszeit, unabhängig vom Standort des Geräts
const SPRITE = '/assets/icons/sprite.svg';

const $ = (id) => document.getElementById(id);

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function getCountyFilter() {
  return new URLSearchParams(window.location.search).get('county');
}

function updateFilterBanner(countyFilter) {
  const banner = $('county-filter-banner');
  if (!banner) return;
  if (countyFilter) {
    banner.hidden = false;
    banner.querySelector('.filter-text').textContent = `Gefiltert: ${countyFilter}`;
  } else {
    banner.hidden = true;
  }
}

const categoryMeta = {
  unfall:    { label: 'Verkehrsunfall',  icon: '🚗',  className: 'cat-unfall' },
  feuer:     { label: 'Feuer',           icon: '🔥',  className: 'cat-feuer' },
  wetter:    { label: 'Wetterwarnung',   icon: '🌩️', className: 'cat-wetter' },
  sonstiges: { label: 'Sonstiges',       icon: '⚠️',  className: 'cat-sonstiges' }
};

let hasData = false;      // schon einmal erfolgreich geladen? (dann bleibt bei einem Fehler die alte Liste stehen)
let isLoading = false;
let lastLoadAt = 0;

function setSub(parts) {
  const sub = $('sub');
  if (!sub) return;
  sub.textContent = '';
  parts.forEach((p, i) => {
    if (i > 0) sub.appendChild(document.createTextNode(' · '));
    if (typeof p === 'string') {
      sub.appendChild(document.createTextNode(p));
    } else {
      const span = document.createElement('span');
      span.className = p.className;
      span.textContent = p.text;
      sub.appendChild(span);
    }
  });
}

function formatClock(date) {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }) + ' Uhr';
}

function showError(err) {
  const box = $('loading');
  box.className = 'state err';
  box.hidden = false;
  box.textContent = '';
  const h = document.createElement('h3');
  h.textContent = 'Ereignisse konnten nicht geladen werden';
  const p1 = document.createElement('p');
  p1.textContent = 'Wahrscheinlich ist gerade keine Internetverbindung da oder der Server antwortet nicht. ' +
    'Tippe oben auf „Aktualisieren“, um es erneut zu versuchen.';
  const p2 = document.createElement('p');
  p2.textContent = 'Technische Meldung: ' + (err && err.message ? err.message : String(err));
  box.append(h, p1, p2);
}

async function loadEvents() {
  if (isLoading) return;
  isLoading = true;
  const box = $('loading');
  const btn = $('refresh-btn');
  btn.classList.add('spin');
  if (!hasData) {
    box.className = 'state';
    box.hidden = false;
    box.textContent = 'Lade Ereignisse…';
  }

  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Serverfehler ' + res.status);
    const events = await res.json();
    if (!Array.isArray(events)) throw new Error('Unerwartete Antwort vom Server');

    const activeCount = renderEvents(events);
    hasData = true;
    lastLoadAt = Date.now();
    box.hidden = true;

    if (res.headers.get('X-VESZ-Cache') === 'offline') {
      const stamp = new Date(res.headers.get('date') || '');
      setSub([
        { className: 'off', text: 'Offline' },
        isNaN(stamp.getTime()) ? 'zuletzt geladene Meldungen' : 'Stand ' + formatClock(stamp)
      ]);
    } else {
      setSub(['Stand ' + formatClock(new Date()), activeCount === 1 ? '1 aktiv' : activeCount + ' aktiv']);
    }
  } catch (e) {
    console.error(e);
    if (hasData) {
      // Liste bleibt stehen, nur der Hinweis oben ändert sich
      setSub([{ className: 'off', text: 'Aktualisierung fehlgeschlagen' }, 'letzter Stand bleibt sichtbar']);
    } else {
      showError(e);
      setSub([{ className: 'off', text: 'Keine Daten' }]);
    }
  } finally {
    btn.classList.remove('spin');
    isLoading = false;
  }
}

function renderEvents(events) {
  const settings = loadSettings();
  const countyFilter = getCountyFilter();

  let visible = events.filter(e => settings[e.category] !== false);
  if (countyFilter) {
    visible = visible.filter(e => e.county === countyFilter);
  }

  const active = visible.filter(e => e.active).sort(byDateDesc);
  const archive = visible.filter(e => !e.active).sort(byDateDesc);

  renderList('active-list', 'active-empty', active);
  renderList('archive-list', 'archive-empty', archive);
  updateFilterBanner(countyFilter);
  return active.length;
}

function byDateDesc(a, b) {
  return new Date(b.pubDate) - new Date(a.pubDate);
}

function renderList(listId, emptyId, items) {
  const list = $(listId);
  const empty = $(emptyId);
  list.innerHTML = '';

  if (items.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const item of items) {
    list.appendChild(buildCard(item));
  }
}

function buildCard(item) {
  const meta = categoryMeta[item.category] || categoryMeta.sonstiges;
  const card = document.createElement('article');
  card.className = `event-card ${meta.className}`;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  card.innerHTML = `
    <div class="event-icon" aria-hidden="true">${meta.icon}</div>
    <div class="event-body">
      <div class="event-meta">
        <span class="badge">${meta.label}</span>
        <span class="event-county">${escapeHtml(item.county)}</span>
      </div>
      <time class="event-date">${formatDate(item.pubDate)}</time>
      <h3 class="event-title">${escapeHtml(item.title_de)}</h3>
      <p class="event-desc">${escapeHtml(truncate(item.description_de, 140))}</p>
    </div>
  `;

  card.addEventListener('click', () => openDetail(item));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetail(item);
    }
  });

  return card;
}

function truncate(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '…';
}

// Nur echte Web-Adressen als Link zulassen (kein javascript: o. Ä.)
function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch (e) {
    return '';
  }
}

let lastFocused = null;

function openDetail(item) {
  const meta = categoryMeta[item.category] || categoryMeta.sonstiges;
  const link = safeUrl(item.link);
  const card = $('detail-card');
  card.className = `detail-card ${meta.className}`;
  $('detail-content').innerHTML = `
    <div class="detail-badge-row">
      <span class="detail-icon" aria-hidden="true">${meta.icon}</span>
      <div>
        <div class="detail-category">${meta.label}</div>
        <div class="detail-county">${escapeHtml(item.county)}</div>
      </div>
    </div>
    <time class="detail-date">${formatDate(item.pubDate)}</time>
    <h2 class="detail-title" id="detail-title">${escapeHtml(item.title_de)}</h2>
    <p class="detail-desc">${escapeHtml(item.description_de)}</p>
    <p class="detail-note">Genaue Kartenposition liegt in den Ausgangsdaten nicht vor.</p>
    ${link ? `<a class="detail-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">Original auf katasztrofavedelem.hu ansehen <svg class="i" aria-hidden="true"><use href="${SPRITE}#i-external"/></svg></a>` : ''}
  `;
  lastFocused = document.activeElement;
  $('detail-overlay').hidden = false;
  $('detail-close').focus();
}

function closeDetail() {
  $('detail-overlay').hidden = true;
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  lastFocused = null;
}

function formatDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: TIME_ZONE
  });
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

$('refresh-btn').addEventListener('click', loadEvents);

$('detail-close').addEventListener('click', closeDetail);
$('detail-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'detail-overlay') closeDetail();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('detail-overlay').hidden) closeDetail();
});

// Wieder online: sofort neu laden. Zurück im Vordergrund nach längerer Pause: ebenfalls.
window.addEventListener('online', loadEvents);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastLoadAt > 60 * 1000) loadEvents();
});

loadEvents();
setInterval(() => { if (!document.hidden) loadEvents(); }, 3 * 60 * 1000); // Auto-Refresh alle 3 Minuten
