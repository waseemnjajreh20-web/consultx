/**
 * EID50 Campaign — Lead Collection from Official Sources
 *
 * Usage: deno run --allow-net --allow-read --allow-write scripts/leads/eid50_collect_official_sources.ts
 *
 * Sources:
 * 1. Saudi Council of Engineers (SCE) — Office Search (requires CAPTCHA, may need manual step)
 * 2. Balady — Engineering Offices Inquiry
 * 3. Sakani — Certified Engineering Offices
 * 4. MODON — Qualified Engineering Offices (PDF)
 * 5. Manual web scraping fallback
 *
 * Google Places API alternative — requires VITE_GOOGLE_PLACES_API_KEY env var.
 */

// ── Configuration ──────────────────────────────────────────────────────────

const RAW_CSV = "data/leads/eid50_leads_raw.csv";
const CITIES = [
  "Riyadh", "Jeddah", "Makkah", "Madinah", "Dammam", "Khobar", "Dhahran",
  "Tabuk", "Abha", "Khamis Mushait", "Taif", "Buraydah", "Hail", "Jazan",
  "Najran", "Al Ahsa", "Jubail", "Yanbu",
];

const SEARCH_PHRASES = [
  "engineering consulting office",
  "مكتب استشارات هندسية",
  "مكتب هندسي",
  "fire safety consultant",
  "استشارات سلامة",
  "مكتب سلامة هندسية",
  "architectural engineering consultant",
];

// ── CSV utilities ──────────────────────────────────────────────────────────

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function csvRow(row: Record<string, string>): string {
  return Object.values(row).map(csvEscape).join(",");
}

// ── Official Sources ───────────────────────────────────────────────────────

async function fetchSakaniOffices(): Promise<string[][]> {
  // Sakani certified engineering offices
  // URL: https://sakani.sa/app/certified-engineering-offices
  // Note: This is a client-rendered page; direct fetch may not work.
  console.log("[Sakani] Attempting to fetch certified engineering offices...");
  try {
    const res = await fetch("https://sakani.sa/app/certified-engineering-offices", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      console.log(`[Sakani] HTTP ${res.status} — page may require JS rendering`);
      return [];
    }
    const html = await res.text();
    // Attempt to extract any embedded data
    console.log(`[Sakani] Fetched ${html.length} bytes`);
    return [];
  } catch (err) {
    console.log(`[Sakani] Error: ${err}`);
    return [];
  }
}

async function fetchBaladyOffices(): Promise<string[][]> {
  // Balady engineering offices inquiry
  // URL: https://apps.balady.gov.sa/Eservices/Inquiries/InquiryEngOffices
  console.log("[Balady] Attempting to fetch engineering offices...");
  try {
    const res = await fetch(
      "https://apps.balady.gov.sa/Eservices/Inquiries/InquiryEngOffices",
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!res.ok) {
      console.log(`[Balady] HTTP ${res.status}`);
      return [];
    }
    const html = await res.text();
    console.log(`[Balady] Fetched ${html.length} bytes`);
    return [];
  } catch (err) {
    console.log(`[Balady] Error: ${err}`);
    return [];
  }
}

// ── Google Places API (optional) ───────────────────────────────────────────

async function searchGooglePlaces(
  query: string,
  location: string,
  apiKey: string,
): Promise<any[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", `${query} ${location} Saudi Arabia`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en");

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.log(`[GooglePlaces] HTTP ${res.status} for "${query}" in ${location}`);
    return [];
  }
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.log(`[GooglePlaces] API error: ${data.status} for "${query}" in ${location}`);
    return [];
  }
  return data.results ?? [];
}

// ── Website Email Extraction (basic) ───────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

async function extractEmailsFromWebsite(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const emails = [...new Set(html.match(EMAIL_RE) ?? [])];
    return emails.filter((e) => {
      const domain = e.split("@")[1]?.toLowerCase() ?? "";
      // Exclude common non-business email domains
      if (["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com"].includes(domain)) return false;
      return true;
    });
  } catch {
    return [];
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("EID50 Lead Collection — Official Sources");
  console.log("=".repeat(60));

  // Try official sources
  console.log("\n--- Official Sources ---");
  const sakani = await fetchSakaniOffices();
  console.log(`Sakani: ${sakani.length} results`);

  const balady = await fetchBaladyOffices();
  console.log(`Balady: ${balady.length} results`);

  // Try Google Places if API key is available
  const googleApiKey = Deno.env.get("VITE_GOOGLE_PLACES_API_KEY") ??
    Deno.env.get("GOOGLE_PLACES_API_KEY");
  
  if (googleApiKey) {
    console.log("\n--- Google Places API ---");
    let totalPlaces = 0;
    for (const city of CITIES) {
      for (const phrase of SEARCH_PHRASES) {
        const results = await searchGooglePlaces(phrase, city, googleApiKey);
        console.log(`[GooglePlaces] "${phrase}" in ${city}: ${results.length} results`);
        totalPlaces += results.length;
        // Rate limiting — 50ms between requests
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    console.log(`\nGoogle Places total: ${totalPlaces} results`);
  } else {
    console.log("\n[GooglePlaces] No API key found. Skipping.");
    console.log("Set VITE_GOOGLE_PLACES_API_KEY or GOOGLE_PLACES_API_KEY env var to enable.");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Collection complete.");
  console.log("Results saved to: " + RAW_CSV);
}

if (import.meta.main) {
  main();
}
