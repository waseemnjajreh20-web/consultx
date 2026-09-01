import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { getSecretKey, getPublishableKey } from "../_shared/supabaseKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // x-region is consumed by the platform to pin execution near storage/DB
  // (src/lib/functionRegion.ts) — must be allowed or the preflight fails.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Why this function exists ────────────────────────────────────────────────
// The source PDFs are whole codes: 31 MB (SBC 201 volume) to 50 MB (SBC 501).
// Measured in the browser on 2026-08-31 against production: the FIRST ranged
// read of any of them takes ~6 s (tail/xref fetch), and pdf.js needs several
// sequential reads before it can paint a page — so the citation preview stalled
// long enough to fall back to the <iframe>, which then also failed on a file
// that size. That is what produced the UI "تعذّر تحميل PDF داخل اللوحة".
//
// Fix: serve only what the viewer actually shows. This function cuts a small
// window of pages (default +/-2 around the cited page) out of the full PDF with
// pdf-lib and caches the slice in the private bucket, so the second request for
// the same window is a plain signed-URL hit. A 5-page slice measures 391-578 KB
// versus 42-50 MB — the viewer opens effectively instantly and the live
// highlight still has a real text layer to search.
//
// Security: the caller never names a storage object. It sends the SAME public
// -style path the citation UI already uses, which must be present in
// ALLOWED_PDF_PATHS (the identical allow-list get-source-pdf-url enforces), and
// a page number. Nothing attacker-controlled reaches storage: the source object
// comes from the map, and the cache key is built from the mapped object id plus
// two integers.
const ALLOWED_PDF_PATHS: ReadonlyMap<string, string> = new Map([
  ["sbc/sbc-201/SBC 201 - The Saudi General Building Code-1-250.pdf", "SBC201/pp_0001-0250.pdf"],
  ["sbc/sbc-201/SBC 201 - The Saudi General Building Code-251-500.pdf", "SBC201/pp_0251-0500.pdf"],
  ["sbc/sbc-201/SBC 201 - The Saudi General Building Code-501-1000.pdf", "SBC201/pp_0501-1000.pdf"],
  ["sbc/sbc-201/SBC 201 - The Saudi General Building Code-1001-1250.pdf", "SBC201/pp_1001-1250.pdf"],
  ["sbc/sbc-201/SBC 201 - The Saudi General Building Code-1251-1500.pdf", "SBC201/pp_1251-1500.pdf"],
  ["sbc/sbc-201/SBC 201 - The Saudi General Building Code-1501-1750.pdf", "SBC201/pp_1501-1750.pdf"],
  ["sbc/sbc-201/SBC 201 - The Saudi General Building Code-1751-2000.pdf", "SBC201/pp_1751-2000.pdf"],
  ["sbc/sbc-201/SBC 201 - The Saudi General Building Code-2001-2200.pdf", "SBC201/pp_2001-2200.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1-200.pdf", "SBC801/pp_0001-0200.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-201-400.pdf", "SBC801/pp_0201-0400.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-401-600.pdf", "SBC801/pp_0401-0600.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-601-800.pdf", "SBC801/pp_0601-0800.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-801-1000.pdf", "SBC801/pp_0801-1000.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1001-1200.pdf", "SBC801/pp_1001-1200.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1201-1400.pdf", "SBC801/pp_1201-1400.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1401-1600.pdf", "SBC801/pp_1401-1600.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1601-1800.pdf", "SBC801/pp_1601-1800.pdf"],
  ["sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1801-2061.pdf", "SBC801/pp_1801-2061.pdf"],
  ["sbc/sbc-501/SBC501_CC2024_17-304.pdf", "SBC501/SBC501_CC2024.pdf"],
  ["sbc/sbc-501/SBC501_CC2024_305-509.pdf", "SBC501/SBC501_CC2024.pdf"],
  ["sbc/sbc-501/SBC501_CC2024_510-695.pdf", "SBC501/SBC501_CC2024.pdf"],
  ["sbc/sbc-401/SBC401_CR2024_39-248.pdf", "SBC401/SBC401_CR2024.pdf"],
  ["sbc/sbc-401/SBC401_CR2024_249-450.pdf", "SBC401/SBC401_CR2024.pdf"],
  ["sbc/sbc-401/SBC401_CR2024_451-655.pdf", "SBC401/SBC401_CR2024.pdf"],
  ["sbc/sbc-401/SBC401_CR2024_656-772.pdf", "SBC401/SBC401_CR2024.pdf"],
]);

const PRIVATE_BUCKET = "sbc_pdfs_private";
const SLICE_PREFIX = "slices";          // cached windows live under slices/
const SIGNED_URL_TTL_SECONDS = 300;
const WINDOW = 2;                        // pages either side of the cited page
const MAX_SOURCE_BYTES = 80 * 1024 * 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = getSecretKey();
    const anonKey = getPublishableKey();

    // 1. Authenticate (same contract as get-source-pdf-url: any signed-in user).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    // 2. Input
    let body: { path?: string; page?: number };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const { path } = body;
    if (!path || typeof path !== "string") return json({ error: "path required" }, 400);
    const page = Math.floor(Number(body.page));
    if (!Number.isFinite(page) || page < 1) return json({ error: "page must be a positive integer" }, 400);

    const privatePath = ALLOWED_PDF_PATHS.get(path);
    if (typeof privatePath !== "string") return json({ error: "Unknown source path" }, 404);

    const service = createClient(supabaseUrl, serviceKey);

    // 3. Cache key: mapped object + requested window. Only integers and the
    //    mapped id go into it, so it can never escape the slices/ prefix.
    const from = Math.max(1, page - WINDOW);
    const to = page + WINDOW;
    const slug = privatePath.replace(/[^A-Za-z0-9]+/g, "_");
    const slicePath = `${SLICE_PREFIX}/${slug}_p${from}-${to}.pdf`;

    const signSlice = async () => {
      const { data } = await service.storage.from(PRIVATE_BUCKET)
        .createSignedUrl(slicePath, SIGNED_URL_TTL_SECONDS);
      return data?.signedUrl ?? null;
    };

    // 3a. Cache hit → sign and return immediately.
    const cached = await signSlice();
    if (cached) {
      // pageInSlice lets the viewer jump/highlight without re-deriving the offset.
      return json({ url: cached, expires_in: SIGNED_URL_TTL_SECONDS,
                    page_in_slice: page - from + 1, from, to, cached: true });
    }

    // 3b. Miss → download the full source once, cut the window, cache it.
    const { data: blob, error: dlErr } = await service.storage.from(PRIVATE_BUCKET).download(privatePath);
    if (dlErr || !blob) return json({ error: "source unavailable" }, 500);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength > MAX_SOURCE_BYTES) return json({ error: "source too large" }, 500);

    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = src.getPageCount();
    if (page > total) return json({ error: `page ${page} out of range (1..${total})` }, 400);
    const lastIdx = Math.min(to, total) - 1;      // 0-based, clamped
    const firstIdx = from - 1;
    const indices: number[] = [];
    for (let i = firstIdx; i <= lastIdx; i++) indices.push(i);

    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, indices);
    for (const p of copied) out.addPage(p);
    const sliceBytes = await out.save();

    const { error: upErr } = await service.storage.from(PRIVATE_BUCKET)
      .upload(slicePath, sliceBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      // Caching is an optimisation, not a requirement — still serve this request.
      console.error("slice cache upload failed:", upErr.message);
    }

    const url = await signSlice();
    if (!url) return json({ error: "Could not generate slice link" }, 500);
    return json({ url, expires_in: SIGNED_URL_TTL_SECONDS,
                  page_in_slice: page - from + 1, from, to: Math.min(to, total), cached: false });
  } catch (err) {
    console.error("Unhandled:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
