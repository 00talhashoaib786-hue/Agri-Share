/*
  Agri-Share: current Pakistan fuel prices (PKR per litre) for diesel and transport estimates.
  Vercel Serverless Function.

  GET /api/fuel-rates
    -> { ok: true, diesel: 357, petrol: 322, updatedAt: "2026-11-21", source: "psopk.com" }
       (if no source could be read: the verified fallback below, with fallback: true)

  The response is cached on Vercel's CDN for 12 hours (s-maxage=43200) and served stale for up to
  a day while it refreshes in the background, so prices update about twice a day without making
  the app wait. Sources are tried in order; a price is accepted only between PKR 150 and 600 per litre.
  If a source changes its page layout, the parser simply finds nothing and the next source / the
  fallback is used. Update FALLBACK after each fortnightly OGRA / Finance Division notification.
*/
const FALLBACK = { diesel: 357, petrol: 322, updatedAt: "2026-11-21", source: "fallback (last verified notification)" };
const MIN = 150, MAX = 600;
const TIMEOUT_MS = 6000;

// public pages that list Pakistan's notified petrol (Super / PMG) and high-speed diesel (HSD) prices
const SOURCES = [
  { name: "psopk.com", url: "https://psopk.com/en/product-and-services/product-prices/pol" },
  { name: "hamariweb.com", url: "https://hamariweb.com/finance/petrol_prices/" },
  { name: "urdupoint.com", url: "https://www.urdupoint.com/business/petrol-prices-in-pakistan.html" },
];

const inRange = (n) => Number.isFinite(n) && n >= MIN && n <= MAX;

// Strip tags so "<td>High Speed Diesel</td><td>Rs. 357.00</td>" becomes plain text
function toText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

// First realistic price (150 to 600) that appears within ~120 characters after a label
function priceAfter(text, labels) {
  for (const label of labels) {
    const re = new RegExp(label + "[^0-9]{0,120}?(?<!\\d)(\\d{3}(?:[.,]\\d{1,2})?)(?!\\d)", "gi");
    let m;
    while ((m = re.exec(text))) {
      const n = Number(m[1].replace(",", "."));
      if (inRange(n)) return Math.round(n * 100) / 100;
    }
  }
  return null;
}

function parse(html) {
  const text = toText(html);
  const diesel = priceAfter(text, ["High[\\s-]*Speed[\\s-]*Diesel", "\\bHSD\\b", "\\bDiesel\\b"]);
  const petrol = priceAfter(text, ["Premier[\\s-]*Motor[\\s-]*Gasoline", "Super\\s*Petrol", "\\bPetrol\\s*\\(Super\\)", "\\bPMG\\b", "\\bMotor\\s*Spirit\\b", "\\bPetrol\\b", "\\bSuper\\b"]);
  return { diesel, petrol };
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; AgriShareFuelRates/1.0)", Accept: "text/html,application/xhtml+xml" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=86400");
  res.setHeader("CDN-Cache-Control", "public, s-maxage=43200, stale-while-revalidate=86400");
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const tried = [];
  for (const src of SOURCES) {
    try {
      const { diesel, petrol } = parse(await fetchText(src.url));
      // diesel drives every estimate in the app, so a source must give a valid diesel price
      if (inRange(diesel)) {
        return res.status(200).json({
          ok: true,
          diesel,
          petrol: inRange(petrol) ? petrol : FALLBACK.petrol,
          updatedAt: new Date().toISOString().slice(0, 10),
          source: src.name,
          ...(inRange(petrol) ? {} : { petrolFallback: true }),
        });
      }
      tried.push(`${src.name}: no price found`);
    } catch (e) {
      tried.push(`${src.name}: ${e && e.name === "AbortError" ? "timeout" : (e && e.message) || "error"}`);
    }
  }
  console.warn("[api/fuel-rates] using fallback:", tried.join(" | "));
  // shorter cache for the fallback so a recovered source is picked up sooner
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.setHeader("CDN-Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json({ ok: true, ...FALLBACK, fallback: true });
}

export { parse }; // for local tests
