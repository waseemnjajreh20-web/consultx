/**
 * sourcePdfUrl.ts — signed PDF URL resolution (2026-08-23)
 *
 * Split out of sourceMetadata.ts on purpose: sourceMetadata.ts's
 * `resolveSourceMeta` must stay 100% pure and side-effect-free (no top-level
 * work at all, not even constructing a client), because it and its callers
 * (resolveAllSources, SourcePanel, ChatInterface) run in contexts — including
 * the vitest/node test environment — that don't have `localStorage`. The
 * Supabase client (`@/integrations/supabase/client`) calls `createClient(...,
 * { auth: { storage: localStorage } })` at module top level, so importing it
 * from sourceMetadata.ts made importing sourceMetadata.ts itself throw
 * outside a browser — which killed every test file that imports it
 * (src/__tests__/sourceMetadata.test.ts and src/__tests__/citationRouting.test.ts)
 * at collection time. Keeping the supabase-client dependency confined to this
 * separate file means sourceMetadata.ts has zero side-effectful imports again.
 *
 * The "source-pdfs" Supabase Storage bucket that used to serve these SBC PDFs
 * publicly is being retired (see
 * supabase/migrations/20260823000010_source_pdfs_private.sql); PDFs now live
 * in the private "sbc_pdfs_private" bucket and are only reachable through a
 * short-lived signed URL minted by the get-source-pdf-url edge function.
 *
 * NOTE on the client import: `@/integrations/supabase/client` calls
 * `createClient(..., { auth: { storage: localStorage } })` at module TOP
 * LEVEL, which throws outside a browser (no global `localStorage` in the
 * vitest/node environment this repo's tests run in). So the client is
 * imported LAZILY, inside `fetchSignedPdfUrl`, via a dynamic `import()` —
 * never at this module's top level. That keeps `KNOWN_SBC_PDF_PATHS` and
 * `isKnownSbcPdfPath` (the parts a test needs) importable and testable from
 * plain Node, while `fetchSignedPdfUrl` itself still only ever runs in the
 * browser where it's actually called from (SourcePanel).
 */

/**
 * The exact 18 `pdfPath` values `resolveSourceMeta` (sourceMetadata.ts) can
 * ever produce. Duplicated here (rather than derived) as a cheap,
 * synchronous, local front-line check before ever calling the edge function
 * — the edge function's own hardcoded allow-list
 * (supabase/functions/get-source-pdf-url/index.ts) is the actual security
 * boundary and is authoritative; this set only lets the frontend fail fast
 * on a bad path without a network round trip. Kept in sync manually; both
 * are generated from the same confirmed production storage listing
 * (2026-08-23).
 */
export const KNOWN_SBC_PDF_PATHS: ReadonlySet<string> = new Set([
  "sbc/sbc-201/SBC 201 - The Saudi General Building Code-1-250.pdf",
  "sbc/sbc-201/SBC 201 - The Saudi General Building Code-251-500.pdf",
  "sbc/sbc-201/SBC 201 - The Saudi General Building Code-501-1000.pdf",
  "sbc/sbc-201/SBC 201 - The Saudi General Building Code-1001-1250.pdf",
  "sbc/sbc-201/SBC 201 - The Saudi General Building Code-1251-1500.pdf",
  "sbc/sbc-201/SBC 201 - The Saudi General Building Code-1501-1750.pdf",
  "sbc/sbc-201/SBC 201 - The Saudi General Building Code-1751-2000.pdf",
  "sbc/sbc-201/SBC 201 - The Saudi General Building Code-2001-2200.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1-200.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-201-400.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-401-600.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-601-800.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-801-1000.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1001-1200.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1201-1400.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1401-1600.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1601-1800.pdf",
  "sbc/sbc-801/SBC 801 - The Saudi Fire Protection Code (3)-1801-2061.pdf",
  // SBC 501 (Mechanical, 2024) — one uploaded PDF per code; each retrieval
  // volume gets its own path here (keeps source chips distinct) but the edge
  // allow-list maps all three to the same private object. Page numbers are
  // ABSOLUTE 1-based PDF pages, so the viewer's `#page=N` needs no offset.
  "sbc/sbc-501/SBC501_CC2024_17-304.pdf",
  "sbc/sbc-501/SBC501_CC2024_305-509.pdf",
  "sbc/sbc-501/SBC501_CC2024_510-695.pdf",
]);

/** Pure, synchronous membership check against the 18-path allow-list. */
export function isKnownSbcPdfPath(pdfPath: string | null | undefined): boolean {
  return typeof pdfPath === "string" && KNOWN_SBC_PDF_PATHS.has(pdfPath);
}

export interface SignedPdfUrlResult {
  url: string;
  expiresIn: number;
}

/**
 * Fetch a short-lived signed URL for a mappable SBC source PDF by invoking
 * the get-source-pdf-url edge function.
 *
 * `pdfPath` must be a `SourceMeta.pdfPath` produced by `resolveSourceMeta`
 * (i.e. a value from KNOWN_SBC_PDF_PATHS). Anything else is rejected locally
 * without a network call; the edge function enforces the same allow-list
 * server-side regardless, so this is defense-in-depth, not the actual
 * boundary.
 *
 * Returns null on any failure (unknown path, network error, auth failure,
 * server error) — callers (SourcePanel) are expected to show their existing
 * loading/error UI rather than throw.
 */
export async function fetchSignedPdfUrl(pdfPath: string | null | undefined): Promise<SignedPdfUrlResult | null> {
  if (!isKnownSbcPdfPath(pdfPath)) return null;
  try {
    // Lazy import — see file header note. Constructing the client is what
    // needs a browser; importing this module does not.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke("get-source-pdf-url", {
      body: { path: pdfPath },
    });
    if (error || !data?.url) return null;
    return { url: data.url as string, expiresIn: (data.expires_in as number) ?? 300 };
  } catch {
    return null;
  }
}
