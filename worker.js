// ============================================================
// VÉSZ auf Deutsch – Backend Worker
// Holt ungarische Notfallmeldungen (BM OKF RSS), übersetzt neue
// Ereignisse per KI und stellt sie unter /api/events als JSON bereit.
// Quelle der Rohdaten: BM Országos Katasztrófavédelmi Főigazgatóság (BM OKF)
// ============================================================

const NATIONAL_RSS = "https://www.katasztrofavedelem.hu/10466/RSS_VESZ";

const COUNTY_NAMES = [
  "Bács-Kiskun", "Baranya", "Borsod-Abaúj-Zemplén", "Békés",
  "Csongrád-Csanád", "Fejér", "Győr-Moson-Sopron", "Hajdú-Bihar",
  "Heves", "Jász-Nagykun-Szolnok", "Komárom-Esztergom", "Nógrád",
  "Pest", "Somogy", "Szabolcs-Szatmár-Bereg", "Tolna", "Vas",
  "Veszprém", "Zala"
];

// Bekannte Städte/größere Orte -> Landkreis (Auszug aus offizieller KSH-Ortschaftsliste
// + bekannte Großstädte). Nicht vollständig (3.178 Ortschaften insgesamt in Ungarn),
// deckt aber Städte und größere Orte ab, die realistisch in Meldungen vorkommen.
const SETTLEMENT_COUNTY = {
  "Szigetszentmiklós": "Pest",
  "Hódmezővásárhely": "Csongrád-Csanád",
  "Kiskunfélegyháza": "Bács-Kiskun",
  "Törökszentmiklós": "Jász-Nagykun-Szolnok",
  "Baktalórántháza": "Szabolcs-Szatmár-Bereg",
  "Hajdúböszörmény": "Hajdú-Bihar",
  "Mosonmagyaróvár": "Győr-Moson-Sopron",
  "Sátoraljaújhely": "Borsod-Abaúj-Zemplén",
  "Badacsonytomaj": "Veszprém",
  "Balassagyarmat": "Nógrád",
  "Balatonföldvár": "Somogy",
  "Berettyóújfalu": "Hajdú-Bihar",
  "Biharkeresztes": "Hajdú-Bihar",
  "Hajdúszoboszló": "Hajdú-Bihar",
  "Székesfehérvár": "Fejér",
  "Kunszentmiklós": "Bács-Kiskun",
  "Mezőkovácsháza": "Békés",
  "Balatonalmádi": "Veszprém",
  "Balatonboglár": "Somogy",
  "Balatonkenese": "Veszprém",
  "Balmazújváros": "Hajdú-Bihar",
  "Bátonyterenye": "Nógrád",
  "Kazincbarcika": "Borsod-Abaúj-Zemplén",
  "Vásárosnamény": "Szabolcs-Szatmár-Bereg",
  "Pilisvörösvár": "Pest",
  "Zalaszentgrót": "Zala",
  "Balatonfüred": "Veszprém",
  "Balatonfűzfő": "Veszprém",
  "Balatonlelle": "Somogy",
  "Bélapátfalva": "Heves",
  "Borsodnádasd": "Borsod-Abaúj-Zemplén",
  "Csanádpalota": "Csongrád-Csanád",
  "Dunaharaszti": "Pest",
  "Fehérgyarmat": "Szabolcs-Szatmár-Bereg",
  "Tiszaújváros": "Borsod-Abaúj-Zemplén",
  "Tiszavasvári": "Szabolcs-Szatmár-Bereg",
  "Zalaegerszeg": "Zala",
  "Abaújszántó": "Borsod-Abaúj-Zemplén",
  "Dunaföldvár": "Tolna",
  "Dunaújváros": "Fejér",
  "Dunavarsány": "Pest",
  "Hajdúhadház": "Hajdú-Bihar",
  "Nagykanizsa": "Zala",
  "Nyíregyháza": "Szabolcs-Szatmár-Bereg",
  "Salgótarján": "Nógrád",
  "Szombathely": "Vas",
  "Kiskunhalas": "Bács-Kiskun",
  "Tiszakécske": "Bács-Kiskun",
  "Kiskunmajsa": "Bács-Kiskun",
  "Szentlőrinc": "Baranya",
  "Martonvásár": "Fejér",
  "Pannonhalma": "Győr-Moson-Sopron",
  "Szigethalom": "Pest",
  "Törökbálint": "Pest",
  "Abádszalók": "Jász-Nagykun-Szolnok",
  "Albertirsa": "Pest",
  "Békéscsaba": "Békés",
  "Biatorbágy": "Pest",
  "Budakalász": "Pest",
  "Celldömölk": "Vas",
  "Füzesabony": "Heves",
  "Hajdúdorog": "Hajdú-Bihar",
  "Hajdúnánás": "Hajdú-Bihar",
  "Jászberény": "Jász-Nagykun-Szolnok",
  "Mezőkövesd": "Borsod-Abaúj-Zemplén",
  "Szentendre": "Pest",
  "Jánoshalma": "Bács-Kiskun",
  "Sárospatak": "Borsod-Abaúj-Zemplén",
  "Tiszafüred": "Jász-Nagykun-Szolnok",
  "Mátészalka": "Szabolcs-Szatmár-Bereg",
  "Bácsalmás": "Bács-Kiskun",
  "Budakeszi": "Pest",
  "Dévaványa": "Békés",
  "Dunakeszi": "Pest",
  "Dunavecse": "Bács-Kiskun",
  "Esztergom": "Komárom-Esztergom",
  "Kecskemét": "Bács-Kiskun",
  "Keszthely": "Zala",
  "Nagykőrös": "Pest",
  "Szeghalom": "Békés",
  "Szekszárd": "Tolna",
  "Szigetvár": "Baranya",
  "Tatabánya": "Komárom-Esztergom",
  "Várpalota": "Veszprém",
  "Mórahalom": "Csongrád-Csanád",
  "Sárbogárd": "Fejér",
  "Kunhegyes": "Jász-Nagykun-Szolnok",
  "Oroszlány": "Komárom-Esztergom",
  "Nagykálló": "Szabolcs-Szatmár-Bereg",
  "Nyírbátor": "Szabolcs-Szatmár-Bereg",
  "Zalakaros": "Zala",
  "Bátaszék": "Tolna",
  "Battonya": "Békés",
  "Csongrád": "Csongrád-Csanád",
  "Debrecen": "Hajdú-Bihar",
  "Demecser": "Szabolcs-Szatmár-Bereg",
  "Derecske": "Hajdú-Bihar",
  "Devecser": "Veszprém",
  "Dombóvár": "Tolna",
  "Gyöngyös": "Heves",
  "Kaposvár": "Somogy",
  "Kisvárda": "Szabolcs-Szatmár-Bereg",
  "Orosháza": "Békés",
  "Veszprém": "Veszprém",
  "Kiskőrös": "Bács-Kiskun",
  "Szerencs": "Borsod-Abaúj-Zemplén",
  "Mezőcsát": "Borsod-Abaúj-Zemplén",
  "Kistelek": "Csongrád-Csanád",
  "Szécsény": "Nógrád",
  "Nagykáta": "Pest",
  "Nagyatád": "Somogy",
  "Bábolna": "Komárom-Esztergom",
  "Balkány": "Szabolcs-Szatmár-Bereg",
  "Berhida": "Veszprém",
  "Bonyhád": "Tolna",
  "Budaörs": "Pest",
  "Csákvár": "Fejér",
  "Csepreg": "Vas",
  "Csorvás": "Békés",
  "Dombrád": "Szabolcs-Szatmár-Bereg",
  "Edelény": "Borsod-Abaúj-Zemplén",
  "Gárdony": "Fejér",
  "Gödöllő": "Pest",
  "Kalocsa": "Bács-Kiskun",
  "Komárom": "Komárom-Esztergom",
  "Körmend": "Vas",
  "Marcali": "Somogy",
  "Mezőtúr": "Jász-Nagykun-Szolnok",
  "Miskolc": "Borsod-Abaúj-Zemplén",
  "Szarvas": "Békés",
  "Szentes": "Csongrád-Csanád",
  "Szolnok": "Jász-Nagykun-Szolnok",
  "Tapolca": "Veszprém",
  "Szikszó": "Borsod-Abaúj-Zemplén",
  "Kapuvár": "Győr-Moson-Sopron",
  "Túrkeve": "Jász-Nagykun-Szolnok",
  "Ráckeve": "Pest",
  "Solymár": "Pest",
  "Kemecse": "Szabolcs-Szatmár-Bereg",
  "Letenye": "Zala",
  "Bicske": "Fejér",
  "Bodajk": "Fejér",
  "Cegléd": "Pest",
  "Cigánd": "Borsod-Abaúj-Zemplén",
  "Csorna": "Győr-Moson-Sopron",
  "Csurgó": "Somogy",
  "Enying": "Fejér",
  "Fonyód": "Somogy",
  "Hatvan": "Heves",
  "Ibrány": "Szabolcs-Szatmár-Bereg",
  "Karcag": "Jász-Nagykun-Szolnok",
  "Kőszeg": "Vas",
  "Mohács": "Baranya",
  "Sárvár": "Vas",
  "Siófok": "Somogy",
  "Sopron": "Győr-Moson-Sopron",
  "Szeged": "Csongrád-Csanád",
  "Sellye": "Baranya",
  "Siklós": "Baranya",
  "Putnok": "Borsod-Abaúj-Zemplén",
  "Sarkad": "Békés",
  "Kisbér": "Komárom-Esztergom",
  "Rétság": "Nógrád",
  "Pásztó": "Nógrád",
  "Vecsés": "Pest",
  "Tamási": "Tolna",
  "Vasvár": "Vas",
  "Abony": "Pest",
  "Adony": "Fejér",
  "Aszód": "Pest",
  "Barcs": "Somogy",
  "Békés": "Békés",
  "Beled": "Győr-Moson-Sopron",
  "Bugac": "Bács-Kiskun",
  "Dabas": "Pest",
  "Diósd": "Pest",
  "Dorog": "Komárom-Esztergom",
  "Gyula": "Békés",
  "Heves": "Heves",
  "Hévíz": "Zala",
  "Kecel": "Bács-Kiskun",
  "Komló": "Baranya",
  "Monor": "Pest",
  "Sümeg": "Veszprém",
  "Lenti": "Zala",
  "Ajka": "Veszprém",
  "Baja": "Bács-Kiskun",
  "Bóly": "Baranya",
  "Eger": "Heves",
  "Elek": "Békés",
  "Emőd": "Borsod-Abaúj-Zemplén",
  "Encs": "Borsod-Abaúj-Zemplén",
  "Gönc": "Borsod-Abaúj-Zemplén",
  "Gyál": "Pest",
  "Győr": "Győr-Moson-Sopron",
  "Makó": "Csongrád-Csanád",
  "Paks": "Tolna",
  "Pápa": "Veszprém",
  "Pécs": "Baranya",
  "Tata": "Komárom-Esztergom",
  "Zirc": "Veszprém",
  "Sásd": "Baranya",
  "Aba": "Fejér",
  "Ács": "Komárom-Esztergom",
  "Érd": "Pest",
  "Mór": "Fejér",
  "Ózd": "Borsod-Abaúj-Zemplén",
  "Vác": "Pest",
  "Tét": "Győr-Moson-Sopron",
  "Tab": "Somogy",
  "Vép": "Vas"

};

const MAX_ITEMS = 400;

const SETTLEMENT_NAMES = Object.keys(SETTLEMENT_COUNTY);

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

  const currentIds = new Set();

  for (const item of nationalItems) {
    const id = extractEventId(item.link);
    currentIds.add(id);

    if (indexMap.has(id)) {
      indexMap.get(id).active = true;
      continue;
    }

    // Neues Ereignis -> übersetzen
    const category = categorize(item.title, item.description);
    const locationHint = await fetchHelyszin(item.link);
    const county = guessCounty(item.title, item.description, locationHint);
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
      county,
      active: true,
      firstSeen: new Date().toISOString()
    });
  }

  // Ereignisse, die nicht mehr im aktuellen Feed sind -> archivieren
  for (const [id, entry] of indexMap) {
    if (!currentIds.has(id)) entry.active = false;
  }

  const newIndex = Array.from(indexMap.values())
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, MAX_ITEMS);

  await env.VESZ_KV.put("index", JSON.stringify(newIndex));
}

// ------------------------------------------------------------
// Landkreis-Erkennung anhand des Texts (BM OKF "Landkreis-Feeds" sind
// KEINE echten regionalen Feeds - sie spiegeln alle denselben
// landesweiten Datenstrom, deshalb bringt eine separate Abfrage keinen
// Mehrwert. Stattdessen: nach expliziter Nennung im Text suchen,
// ehrlich "Landesweit", wenn nichts gefunden wird.
// ------------------------------------------------------------
async function fetchHelyszin(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const match = text.match(/Helyszín:\s*([^,<]+)/i);
    return match ? match[1].trim() : null;
  } catch (e) {
    return null;
  }
}

function guessCounty(title, description, locationHint) {
  const text = `${title} ${description}`;

  if (/f[őö]v[aá]rosi|budapest/i.test(text)) return "Budapest";

  // Zuerst das saubere "Helyszín"-Feld der Einzelseite prüfen, falls vorhanden
  // (zuverlässiger als der Fließtext: keine Fallendungen, keine Nebenerwähnungen)
  if (locationHint) {
    for (const settlement of SETTLEMENT_NAMES) {
      const pattern = new RegExp(`\\b${escapeRegex(settlement)}`, "i");
      if (pattern.test(locationHint)) return SETTLEMENT_COUNTY[settlement];
    }
  }

  // Zuerst nach bekannten Orten im Fließtext suchen (genauer als die vármegyei-Textsuche).
  // Nur linke Wortgrenze prüfen, da ungarische Fallendungen (-nál, -ban, -tól, ...)
  // direkt ohne Leerzeichen angehängt werden (z.B. "Hajdúnánásnál").
  for (const settlement of SETTLEMENT_NAMES) {
    const pattern = new RegExp(`\\b${escapeRegex(settlement)}`, "i");
    if (pattern.test(text)) return SETTLEMENT_COUNTY[settlement];
  }

  for (const name of COUNTY_NAMES) {
    const pattern = new RegExp(`${escapeRegex(name)}\\s+v[aá]rmegy`, "i");
    if (pattern.test(text)) return name;
  }

  return "Landesweit";
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
