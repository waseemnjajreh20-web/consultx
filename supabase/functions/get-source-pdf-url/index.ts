import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey, getPublishableKey } from "../_shared/supabaseKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Allow-list: public-style source path -> private-bucket object path ─────
// The 18 SBC PDFs live in TWO Supabase Storage buckets under COMPLETELY
// DIFFERENT naming schemes:
//   - "source-pdfs" (public, being made private): sbc/sbc-201/SBC 201 - The
//     Saudi General Building Code-{start}-{end}.pdf
//   - "sbc_pdfs_private" (private, service-role only): SBC{201|801}/pp_
//     {start:04d}-{end:04d}.pdf
// This is a hardcoded, explicit map — not string munging/translation of
// caller input — so that a path outside this exact set of 18 keys can never
// reach `createSignedUrl`. That is the security property this function
// exists to provide: no traversal into "index/", "text_pages/", or any
// other object in the private bucket is reachable, by construction, no
// matter what the caller sends. Verified against production storage
// listings (`supabase storage ls`) on 2026-08-23; cross-checked against
// scripts/source-map.json's 36 chunk-source entries -> 18 distinct pdf_path
// values.
//
// A Map (not a plain object) on purpose: a plain-object lookup like
// `obj[path]` also resolves inherited Object.prototype members, so a caller
// sending `{"path":"constructor"}` or `{"path":"toString"}` would get a
// truthy, function-typed result back from a naive `Record<string,string>`
// lookup — an allow-list bypass reaching `createSignedUrl` with
// attacker-controlled, non-string input. `Map.get` has no prototype chain to
// leak through, and the `typeof === "string"` check below is a second,
// independent guard against the same class of bug.
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
  // SBC 501 (Mechanical, 2024). The whole code is ONE private object; all three
  // retrieval-volume public paths map to it. page_start in sbc_documents /
  // X-SBC-Source-Meta is an ABSOLUTE 1-based PDF page, so the frontend's
  // `#page=N` (no offset) lands correctly regardless of which volume was cited.
  ["sbc/sbc-501/SBC501_CC2024_17-304.pdf", "SBC501/SBC501_CC2024.pdf"],
  ["sbc/sbc-501/SBC501_CC2024_305-509.pdf", "SBC501/SBC501_CC2024.pdf"],
  ["sbc/sbc-501/SBC501_CC2024_510-695.pdf", "SBC501/SBC501_CC2024.pdf"],
  // SBC 401 (Electrical, 2024) — four retrieval volumes -> one private object.
  ["sbc/sbc-401/SBC401_CR2024_39-248.pdf", "SBC401/SBC401_CR2024.pdf"],
  ["sbc/sbc-401/SBC401_CR2024_249-450.pdf", "SBC401/SBC401_CR2024.pdf"],
  ["sbc/sbc-401/SBC401_CR2024_451-655.pdf", "SBC401/SBC401_CR2024.pdf"],
  ["sbc/sbc-401/SBC401_CR2024_656-772.pdf", "SBC401/SBC401_CR2024.pdf"],
]);

const PRIVATE_BUCKET = "sbc_pdfs_private";

// 300s: long enough for someone to actually open and read a PDF (including a
// slow connection loading a multi-hundred-page file into a viewer/iframe),
// short enough that a leaked/logged URL is worthless within a few minutes.
const SIGNED_URL_TTL_SECONDS = 300;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = getSecretKey();
    const anonKey     = getPublishableKey();

    // ── 1. Authenticate caller ──────────────────────────────────────────────
    // Any authenticated ConsultX user may read SBC code PDFs — there is no
    // per-row authorization to check here, unlike get-case-document-url's
    // is_active_case_member check. Authentication alone (not authorization)
    // is the full access-control requirement for this function.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    // ── 2. Parse input ─────────────────────────────────────────────────────
    let body: { path?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { path } = body;
    if (!path || typeof path !== "string") {
      return json({ error: "path required" }, 400);
    }

    // ── 3. Allow-list lookup (no caller input reaches createSignedUrl) ─────
    // Map.get has no prototype chain, and the explicit typeof check is a
    // second guard: only a real string value looked up from the allow-list
    // can ever reach createSignedUrl below.
    const privatePath = ALLOWED_PDF_PATHS.get(path);
    if (typeof privatePath !== "string") {
      return json({ error: "Unknown source path" }, 404);
    }

    // ── 4. Generate short-lived signed URL from the private bucket ─────────
    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: signed, error: signError } = await serviceClient.storage
      .from(PRIVATE_BUCKET)
      .createSignedUrl(privatePath, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      console.error("Signed URL error:", signError?.message);
      return json({ error: "Could not generate download link" }, 500);
    }

    return json({ url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
  } catch (err) {
    console.error("Unhandled:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
