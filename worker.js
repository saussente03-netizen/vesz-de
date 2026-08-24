// ============================================================
// VÉSZ auf Deutsch – Backend Worker
// Holt ungarische Notfallmeldungen (BM OKF RSS), übersetzt neue
// Ereignisse per KI und stellt sie unter /api/events als JSON bereit.
// Quelle der Rohdaten: BM Országos Katasztrófavédelmi Főigazgatóság (BM OKF)
// ============================================================

const NATIONAL_RSS = "https://www.katasztrofavedelem.hu/10466/RSS_VESZ";

const COUNTY_FEEDS = [
  { name: "Bács-Kiskun", url: "https://bacs.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Baranya", url: "https://baranya.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Borsod-Abaúj-Zemplén", url: "https://baz.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Békés", url: "https://bekes.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Budapest", url: "https://fovaros.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Csongrád-Csanád", url: "https://csongrad.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Fejér", url: "https://fejer.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Győr-Moson-Sopron", url: "https://gyor.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Hajdú-Bihar", url: "https://hajdu.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Heves", url: "https://heves.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Jász-Nagykun-Szolnok", url: "https://jasz.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Komárom-Esztergom", url: "https://komarom.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Nógrád", url: "https://nograd.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Pest", url: "https://pest.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Somogy", url: "https://somogy.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Szabolcs-Szatmár-Bereg", url: "https://szabolcs.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Tolna", url: "https://tolna.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Vas", url: "https://vas.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Veszprém", url: "https://veszprem.katasztrofavedelem.hu/10466/RSS_VESZ" },
  { name: "Zala", url: "https://zala.katasztrofavedelem.hu/10466/RSS_VESZ" }
];

const MAX_ITEMS = 400;

const SYSTEM_PROMPT =
  "Du bist ein präziser Übersetzer für amtliche ungarische Notfall- und Katastrophenschutzmeldungen. " +
  "Übersetze Titel und Beschreibung sachlich und exakt ins Deutsche, ohne Fakten hinzuzufügen oder wegzulassen. " +
  "Behalte Ortsnamen und Straßennamen im ungarischen Original bei. " +
  "Antworte NUR mit einem JSON-Objekt in der Form {\"title\":\"...\",\"description\":\"...\"}, " +
  "ohne Markdown-Codeblock, ohne zusätzlichen Text.";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/events") {
      return handleEventsApi(env);
    }

    if (url.pathname === "/api/admin-stats") {
      return handleAdminStats(request, env);
    }

    // 🆕 24.8.: Einfacher Seitenaufrufe-Zähler fürs Melovista-Admin-Dashboard
    // (siehe handleAdminStats() unten). Zählt nur echte Seitenaufrufe
    // (HTML-Seiten), nicht jede JS/CSS/Bild-Anfrage. Läuft über
    // ctx.waitUntil() im Hintergrund - verzögert die eigentliche
    // Seitenauslieferung also nicht.
    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      ctx.waitUntil(recordPageview(env));
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateEvents(env));
  }
};

// ------------------------------------------------------------
// Seitenaufrufe-Zähler (für Melovista-Admin-Dashboard)
// ------------------------------------------------------------
// Bewusst einfach gehalten: KV ist nicht atomar, unter hoher
// Gleichzeitigkeit können einzelne Zählungen verloren gehen - für die
// erwartete Nutzerzahl dieser Nebenprojekt-App unkritisch, es geht um
// eine grobe Größenordnung, nicht um Abrechnungsgenauigkeit.
async function recordPageview(env) {
  try {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    const totalRaw = await env.VESZ_KV.get("pageviews:total");
    const total = (parseInt(totalRaw, 10) || 0) + 1;
    await env.VESZ_KV.put("pageviews:total", String(total));

    const dailyRaw = await env.VESZ_KV.get("pageviews:daily", { type: "json" });
    const daily = dailyRaw || {};
    daily[today] = (daily[today] || 0) + 1;

    // Auf die letzten 30 Tage begrenzen, damit der KV-Wert nicht unbegrenzt wächst
    const days = Object.keys(daily).sort();
    while (days.length > 30) {
      delete daily[days.shift()];
    }

    await env.VESZ_KV.put("pageviews:daily", JSON.stringify(daily));
  } catch (e) {
    // Zähler ist nice-to-have, darf die eigentliche Seitenauslieferung
    // nie beeinträchtigen.
    console.log("Pageview-Zähler-Fehler:", e);
  }
}

// ------------------------------------------------------------
// Admin-Stats-Endpunkt (für Melovista-Admin-Dashboard)
// ------------------------------------------------------------
// Diese App hat bewusst kein eigenes Login-System (siehe Übergabe-Doku).
// Schutz hier deshalb über ein gemeinsames Geheimnis (ADMIN_STATS_SECRET
// als Cloudflare-Secret bei DIESEM Worker), das der Melovista-Worker beim
// Abfragen mitschicken muss - selbst gewählter, zufälliger String, kein
// Melovista-Passwort wiederverwenden.
async function handleAdminStats(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!env.ADMIN_STATS_SECRET || key !== env.ADMIN_STATS_SECRET) {
    return new Response(JSON.stringify({ error: "not_authorized" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  const totalRaw = await env.VESZ_KV.get("pageviews:total");
  const total = parseInt(totalRaw, 10) || 0;

  const dailyRaw = await env.VESZ_KV.get("pageviews:daily", { type: "json" });
  const daily = dailyRaw || {};

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = daily[today] || 0;

  // Letzte 7 Tage aufsummieren (inkl. heute) für einen groben Trend
  const days = Object.keys(daily).sort().slice(-7);
  const last7Days = days.reduce((sum, d) => sum + (daily[d] || 0), 0);

  return new Response(JSON.stringify({
    totalPageviews: total,
    todayPageviews: todayCount,
    last7DaysPageviews: last7Days,
    daily
  }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

// ------------------------------------------------------------
// API-Antwort
// ------------------------------------------------------------
async function handleEventsApi(env) {
  const index = (await env.VESZ_KV.get("index", { type: "json" })) || [];
  return new Response(JSON.stringify(index), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": "*"
    }
  });
}

// ------------------------------------------------------------
// Haupt-Update-Routine (läuft per Cron alle 10 Minuten)
// ------------------------------------------------------------
async function updateEvents(env) {
  const existingIndex = (await env.VESZ_KV.get("index", { type: "json" })) || [];
  const indexMap = new Map(existingIndex.map((entry) => [entry.id, entry]));

  // Nationalen Feed laden
  let nationalItems = [];
  try {
    const res = await fetch(NATIONAL_RSS);
    if (res.ok) nationalItems = parseRSS(await res.text());
  } catch (e) {
    console.log("Fehler beim Laden des nationalen Feeds:", e);
  }

  // Alle Vármegye-Feeds parallel laden (Fehler einzelner Feeds stoppen nichts)
  const countyResults = await Promise.allSettled(
    COUNTY_FEEDS.map((county) => fetchCountyItems(county))
  );

  // Kombinierte Sammlung: national + alle Landkreise, dedupliziert nach Ereignis-ID.
  // Wichtig: Manche Ereignisse werden nur lokal (in einem Landkreis-Feed) gemeldet
  // und schaffen es nie in den Nationalfeed. Damit die nicht verloren gehen, zählen
  // sie hier genauso als "aktuell" wie nationale Meldungen.
  const allItemsById = new Map(); // id -> { item, county }

  for (const item of nationalItems) {
    const id = extractEventId(item.link);
    if (!allItemsById.has(id)) allItemsById.set(id, { item, county: null });
  }

  for (const result of countyResults) {
    if (result.status !== "fulfilled") continue;
    const { name, items } = result.value;
    for (const item of items) {
      const id = extractEventId(item.link);
      const existing = allItemsById.get(id);
      if (existing) {
        if (!existing.county) existing.county = name;
      } else {
        allItemsById.set(id, { item, county: name });
      }
    }
  }

  const currentIds = new Set();

  for (const [id, { item, county }] of allItemsById) {
    currentIds.add(id);

    if (indexMap.has(id)) {
      // Bereits bekannt -> nur als aktiv markieren, County ggf. nachtragen
      const existing = indexMap.get(id);
      existing.active = true;
      if (county && existing.county === "Landesweit") {
        existing.county = county;
      }
      continue;
    }

    // Neues Ereignis -> übersetzen
    const category = categorize(item.title, item.description);
    const translated = await translateEvent(item.title, item.description, env);

    indexMap.set(id, {
      id,
      link: item.link,
      pubDate: item.pubDate,
      title_hu: item.title,
      description_hu: item.description,
      title_de: translated.title,
      description_de: translated.description,
      category,
      county: county || "Landesweit",
      active: true,
      firstSeen: new Date().toISOString()
    });
  }

  // Ereignisse, die nirgends mehr auftauchen -> archivieren
  for (const [id, entry] of indexMap) {
    if (!currentIds.has(id)) entry.active = false;
  }

  const newIndex = Array.from(indexMap.values())
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, MAX_ITEMS);

  await env.VESZ_KV.put("index", JSON.stringify(newIndex));
}

async function fetchCountyItems(county) {
  try {
    const res = await fetch(county.url);
    if (!res.ok) return { name: county.name, items: [] };
    return { name: county.name, items: parseRSS(await res.text()) };
  } catch (e) {
    return { name: county.name, items: [] };
  }
}

// ------------------------------------------------------------
// Übersetzung per OpenRouter
// ------------------------------------------------------------
async function translateEvent(titleHu, descriptionHu, env) {
  const model = env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Titel: ${titleHu}\nBeschreibung: ${descriptionHu}` }
        ]
      })
    });

    if (!res.ok) {
      console.log("OpenRouter Fehler:", res.status, await res.text());
      return { title: titleHu, description: descriptionHu };
    }

    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim();
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      title: parsed.title || titleHu,
      description: parsed.description || descriptionHu
    };
  } catch (e) {
    console.log("Übersetzungsfehler:", e);
    return { title: titleHu, description: descriptionHu };
  }
}

// ------------------------------------------------------------
// Kategorisierung (Typ des Ereignisses anhand des Textes)
// ------------------------------------------------------------
function categorize(title, description) {
  const text = `${title} ${description}`.toLowerCase();

  if (/(tűz|égett|égés|lángol|kigyulladt|gyulladt)/.test(text)) return "feuer";
  if (/(baleset|karambol|ütközött|gázolás|árokba|felborult|borult)/.test(text)) return "unfall";
  if (/(riasztás|meteorológ|hőség|vihar|árvíz|jégeső|hóhelyzet)/.test(text)) return "wetter";
  return "sonstiges";
}

// ------------------------------------------------------------
// Einfacher RSS-Parser (kein XML-DOM nötig, da Feed einfach aufgebaut ist)
// ------------------------------------------------------------
function parseRSS(xml) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const block of blocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate");
    if (title && link) items.push({ title, link, description, pubDate });
  }

  return items;
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return "";
  let value = match[1].trim();

  const cdata = value.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (cdata) value = cdata[1];

  return decodeEntities(value);
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractEventId(link) {
  const match = link.match(/\/esemeny\/(\d+)/);
  return match ? match[1] : link;
}
