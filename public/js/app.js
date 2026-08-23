const API_URL = '/api/events';
const SETTINGS_KEY = 'vesz-settings';
const DEFAULT_SETTINGS = { unfall: true, feuer: true, wetter: true, sonstiges: true };

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
  const banner = document.getElementById('county-filter-banner');
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

async function loadEvents() {
  const loading = document.getElementById('loading');
  loading.hidden = false;
  loading.textContent = 'Lade Ereignisse…';

  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Serverfehler ' + res.status);
    const events = await res.json();
    renderEvents(events);
    loading.hidden = true;
  } catch (e) {
    console.error(e);
    loading.textContent = 'Fehler: ' + (e && e.message ? e.message : String(e));
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
}

function byDateDesc(a, b) {
  return new Date(b.pubDate) - new Date(a.pubDate);
}

function renderList(listId, emptyId, items) {
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
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
        <span class="event-category">${meta.label}</span>
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

function openDetail(item) {
  const meta = categoryMeta[item.category] || categoryMeta.sonstiges;
  const content = document.getElementById('detail-content');
  content.innerHTML = `
    <div class="detail-badge-row">
      <span class="detail-icon" aria-hidden="true">${meta.icon}</span>
      <div>
        <div class="detail-category">${meta.label}</div>
        <div class="detail-county">${escapeHtml(item.county)}</div>
      </div>
    </div>
    <time class="detail-date">${formatDate(item.pubDate)}</time>
    <h2 class="detail-title">${escapeHtml(item.title_de)}</h2>
    <p class="detail-desc">${escapeHtml(item.description_de)}</p>
    <p class="detail-note">Genaue Kartenposition liegt in den Ausgangsdaten nicht vor.</p>
    <a class="detail-link" href="${item.link}" target="_blank" rel="noopener">Original auf katasztrofavedelem.hu ansehen ↗</a>
  `;
  document.getElementById('detail-overlay').hidden = false;
}

function closeDetail() {
  document.getElementById('detail-overlay').hidden = true;
}

function formatDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.getElementById('refresh-btn').addEventListener('click', loadEvents);

document.getElementById('detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'detail-overlay') closeDetail();
});

document.querySelectorAll('.nav-item.disabled').forEach(el => {
  el.addEventListener('click', (e) => e.preventDefault());
});

loadEvents();
setInterval(loadEvents, 3 * 60 * 1000); // Auto-Refresh alle 3 Minuten
