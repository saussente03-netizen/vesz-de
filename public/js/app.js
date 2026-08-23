const API_URL = '/api/events';

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
    loading.textContent = 'Fehler beim Laden. Bitte später erneut versuchen.';
  }
}

function renderEvents(events) {
  const active = events.filter(e => e.active).sort(byDateDesc);
  const archive = events.filter(e => !e.active).sort(byDateDesc);

  renderList('active-list', 'active-empty', active);
  renderList('archive-list', 'archive-empty', archive);
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

  card.innerHTML = `
    <div class="event-icon" aria-hidden="true">${meta.icon}</div>
    <div class="event-body">
      <div class="event-meta">
        <span class="event-category">${meta.label}</span>
        <span class="event-county">${escapeHtml(item.county)}</span>
      </div>
      <time class="event-date">${formatDate(item.pubDate)}</time>
      <h3 class="event-title">${escapeHtml(item.title_de)}</h3>
      <p class="event-desc">${escapeHtml(item.description_de)}</p>
    </div>
  `;
  return card;
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

document.querySelectorAll('.nav-item.disabled').forEach(el => {
  el.addEventListener('click', (e) => e.preventDefault());
});

loadEvents();
setInterval(loadEvents, 3 * 60 * 1000); // Auto-Refresh alle 3 Minuten
