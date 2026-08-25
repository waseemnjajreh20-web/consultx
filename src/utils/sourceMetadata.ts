/**
 * sourceMetadata.ts — pure resolver (no React, no side effects, no
 * side-effectful imports)
 *
 * Maps chunk/JSON source filenames emitted by the fire-safety-chat edge function
 * to their canonical uploaded PDFs, which live in the PRIVATE "sbc_pdfs_private"
 * Supabase Storage bucket (the "source-pdfs" bucket that used to serve these
 * publicly is being retired — see supabase/migrations/20260823000010_source_pdfs_private.sql).
 *
 * Mapping rule (100% deterministic, no ambiguity):
 *   "{base}_extracted_chunks.json"  → "{base}.pdf"
 *   "{base}_extracted.json"         → "{base}.pdf"
 *   SBC 201 filenames               → sbc/sbc-201/{base}.pdf
 *   SBC 801 filenames               → sbc/sbc-801/{base}.pdf
 *
 * ── pdfUrl / pdfPath contract (2026-08-23 signed-URL refactor) ─────────────
 * `resolveSourceMeta` MUST stay pure and synchronous — SourcePanel calls it
 * (via resolveAllSources) on every render and relies on it never throwing,
 * never awaiting, and never changing `pdfPath` (it's the dedup key in
 * resolveAllSources and a React `key` in SourcePanel). This module
 * deliberately imports NOTHING that constructs a Supabase client or touches
 * `localStorage` at load time — that dependency lives in the separate
 * `./sourcePdfUrl.ts` module instead, precisely so this file (and every test
 * that imports it) keeps working outside a browser.
 *
 * Because of that purity requirement, `pdfUrl` can NO LONGER hold a real,
 * fetchable public URL — minting one now requires an authenticated call to
 * the get-source-pdf-url edge function, which is async. Instead:
 *   - `pdfUrl` is a synchronous, non-null MARKER for mappable sources (it is
 *     currently set equal to `pdfPath`, the storage-relative path) and stays
 *     `null` for anything that can't be mapped to a PDF. SourcePanel keeps
 *     using its truthiness exactly as before for clickability, disabled
 *     state, colour, filtering and index lookup — none of that logic needs a
 *     real URL, only "is this mappable".
 *   - To get an actual, short-lived, authenticated URL suitable for an
 *     <iframe src> or a download link, call `fetchSignedPdfUrl(pdfPath)`
 *     from `./sourcePdfUrl.ts`.
 */

import sourceRegistry from "../data/sourceRegistry.json";

const registryMap = new Map(
  sourceRegistry.map((r) => [r.source_id, r]),
);

export type AuthorityLevel = "normative" | "commentary" | "informative" | "unknown";

/** How precise the page number we can offer is */
export type SourcePrecision = "page_range" | "chunk_range_only" | "unavailable";

/** Confidence level emitted by the edge function for the section_ref label. */
export type SectionConfidence = "high" | "medium" | "low" | "ambiguous" | null;

/**
 * Per-file chunk page metadata as emitted by the edge function in X-SBC-Source-Meta.
 * page_range   → chunk had page_start/page_end from DB or JSON; min/max across selected chunks
 * chunk_range_only → only the filename's overall page range is known
 * unavailable  → no page data at all
 *
 * Step 3 added optional sectionRef / sectionConfidence; older edge function
 * builds will omit them and the UI falls back to the filename + page-range
 * display unchanged.
 */
export interface ChunkPageMeta {
  file: string;
  pageStart: number | null;
  pageEnd: number | null;
  precision: SourcePrecision;
  sectionRef?: string | null;
  sectionConfidence?: SectionConfidence;
}

export type SourceOrigin = "pdf_chunk" | "structured_table";

export interface SourceMeta {
  /** Original source filename as returned by the edge function */
  sourceFile: string;
  /** Human-readable title */
  title: string;
  /** Source registry document code (SBC-201, SBC-801, etc.) */
  documentCode: string;
  /** Edition year from source_registry, if known */
  editionYear: number | null;
  /** Authority level from source_registry: normative / commentary / informative */
  authorityLevel: AuthorityLevel;
  /** First page to show (chunk-level when available, otherwise from filename) */
  pageStart: number | null;
  /** Last page of displayed range */
  pageEnd: number | null;
  /**
   * Synchronous mappability marker — equal to `pdfPath` for mappable
   * sources, null if the source cannot be mapped to a PDF. NOT a fetchable
   * URL; call `fetchSignedPdfUrl(pdfPath)` to get one. See file header.
   */
  pdfUrl: string | null;
  /** Storage path within source-pdfs bucket */
  pdfPath: string | null;
  /** Quality of the page data */
  precision: SourcePrecision;
  /** SBC section number tied to this source, if known. Null when unknown. */
  sectionRef: string | null;
  /** Confidence in `sectionRef`. Null when no section data is available. */
  sectionConfidence: SectionConfidence;
  /** Step 4.1 — distinguish PDF-chunk sources from structured-table evidence. */
  origin?: SourceOrigin;
  /** Step 4.1 — table id when origin === "structured_table". */
  tableRef?: string | null;
}

/**
 * Resolve a single source filename → SourceMeta.
 * Never throws — returns a graceful fallback if filename doesn't match.
 */
export function resolveSourceMeta(sourceFile: string): SourceMeta {
  // ── Step 4.1 — Structured-table evidence sentinel ────────────────────────
  // Format emitted by the edge function: `__sbc_table__::SBC-201::309`
  // Non-clickable, no PDF, but documentCode is set so the Step 3.2 hard-stop
  // (availableFamilies) sees the family as present in the message.
  const tblSentinel = sourceFile.match(/^__sbc_table__::(SBC-(?:201|801))::(.+)$/);
  if (tblSentinel) {
    const documentCode = tblSentinel[1];
    const tableRef = tblSentinel[2];
    const registryEntry = registryMap.get(documentCode.replace("-", ""));
    const codeLabel = documentCode.replace("-", " ");
    return {
      sourceFile,
      title: `${codeLabel} — Table ${tableRef} (Structured DB Evidence)`,
      documentCode,
      editionYear: registryEntry?.edition_year ?? null,
      authorityLevel: (registryEntry?.authority_level as AuthorityLevel) ?? "unknown",
      pageStart: null,
      pageEnd: null,
      pdfUrl: null,
      pdfPath: null,
      precision: "unavailable",
      sectionRef: tableRef,
      sectionConfidence: "medium",
      origin: "structured_table",
      tableRef,
    };
  }

  // Strip _extracted_chunks.json or _extracted.json suffix → get bare base name
  const base = sourceFile
    .replace(/_extracted_chunks\.json$/i, "")
    .replace(/_extracted\.json$/i, "")
    .replace(/\.json$/i, "")
    .trim();

  // Detect document code
  const is201 = /^SBC\s*201\b/i.test(base);
  const is801 = /^SBC\s*801\b/i.test(base);

  if (!is201 && !is801) {
    // Unknown source — return graceful fallback, no PDF URL
    return {
      sourceFile,
      title: base || sourceFile,
      documentCode: "UNKNOWN",
      editionYear: null,
      authorityLevel: "unknown",
      pageStart: null,
      pageEnd: null,
      pdfUrl: null,
      pdfPath: null,
      precision: "unavailable",
      sectionRef: null,
      sectionConfidence: null,
    };
  }

  const documentCode = is201 ? "SBC-201" : "SBC-801";
  const registryEntry = registryMap.get(documentCode.replace("-", ""));
  const folder = is201 ? "sbc/sbc-201" : "sbc/sbc-801";

  // Extract page range from trailing "-{start}-{end}"
  const pageMatch = base.match(/-(\d+)-(\d+)$/);
  const pageStart = pageMatch ? parseInt(pageMatch[1], 10) : null;
  const pageEnd = pageMatch ? parseInt(pageMatch[2], 10) : null;

  // Build title
  const codeLabel = is201 ? "SBC 201" : "SBC 801";
  const pageLabel =
    pageStart !== null && pageEnd !== null
      ? ` (Pages ${pageStart}–${pageEnd})`
      : "";
  const title = `${codeLabel} — The Saudi ${is201 ? "General Building" : "Fire Protection"} Code${pageLabel}`;

  // Build storage path (this is the ALLOWED_PDF_PATHS key the edge function
  // validates against — see get-source-pdf-url/index.ts).
  const pdfFileName = `${base}.pdf`;
  const pdfPath = `${folder}/${pdfFileName}`;
  // `pdfUrl` is intentionally NOT a real, fetchable URL anymore (the bucket
  // it used to point at is private now). It is a synchronous, non-null
  // marker equal to `pdfPath`, kept so every existing truthiness check
  // ("is this source mappable to a PDF") across SourcePanel and
  // ChatInterface keeps working unchanged. Call `fetchSignedPdfUrl(pdfPath)`
  // to get a real, short-lived signed URL.
  const pdfUrl = pdfPath;

  return {
    sourceFile,
    title,
    documentCode,
    editionYear: registryEntry?.edition_year ?? null,
    authorityLevel: (registryEntry?.authority_level as AuthorityLevel) ?? "unknown",
    pageStart,
    pageEnd,
    pdfUrl,
    pdfPath,
    precision: pageStart != null ? "chunk_range_only" : "unavailable",
    sectionRef: null,
    sectionConfidence: null,
  };
}

/**
 * Resolve an array of source filenames, deduplicating by pdfPath so that
 * _extracted_chunks and _extracted variants of the same volume appear once.
 */
export function resolveAllSources(sourceFiles: string[]): SourceMeta[] {
  const seen = new Set<string>();
  const results: SourceMeta[] = [];
  for (const sf of sourceFiles) {
    const meta = resolveSourceMeta(sf);
    // Dedup key: pdfPath for mapped sources, sourceFile for unknowns
    const key = meta.pdfPath ?? meta.sourceFile;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(meta);
    }
  }
  return results;
}

/**
 * Resolve sources with chunk-level page precision from X-SBC-Source-Meta header.
 * When chunk metadata is available it overrides the filename-derived page range,
 * giving a tighter window within the volume (precision = "page_range").
 */
export function resolveSourcesWithMeta(
  sourceFiles: string[],
  chunkMeta: ChunkPageMeta[],
): SourceMeta[] {
  const chunkMap = new Map<string, ChunkPageMeta>();
  for (const cm of chunkMeta) chunkMap.set(cm.file, cm);

  const seen = new Set<string>();
  const results: SourceMeta[] = [];
  for (const sf of sourceFiles) {
    const base = resolveSourceMeta(sf);
    const key = base.pdfPath ?? base.sourceFile;
    if (seen.has(key)) continue;
    seen.add(key);

    const cm = chunkMap.get(sf);
    const sectionRef = (cm && typeof cm.sectionRef === "string" && cm.sectionRef.trim()) ? cm.sectionRef.trim() : null;
    const sectionConfidence: SectionConfidence = sectionRef ? (cm?.sectionConfidence ?? null) : null;
    if (cm && (cm.pageStart != null || cm.pageEnd != null)) {
      results.push({
        ...base,
        pageStart: cm.pageStart,
        pageEnd: cm.pageEnd,
        precision: cm.precision,
        sectionRef,
        sectionConfidence,
      });
    } else if (sectionRef) {
      // No tighter page data, but we still got a section label — preserve it.
      results.push({ ...base, sectionRef, sectionConfidence });
    } else {
      results.push(base);
    }
  }
  return results;
}

/**
 * P5-R6 (near-term) — drift-honest labeling for section-number-only DB matches.
 *
 * sbc_documents.section_number drifts from the true first in-text heading in
 * 57.6%-73.1% of rows (reports/advisory-section-drift-summary.md). When the
 * citation-click handler in ChatInterface.tsx resolves a deep-link ONLY by
 * matching `section_number` in the DB (`.eq()` for the exact number, or
 * `.like()` against a parent prefix for a sibling anchor), the row's own
 * page numbers are NOT independent page evidence — the row's label is
 * exactly the field that drifts, so it cannot be presented as proof the
 * section is really at that page. Until the real fix ships
 * (sbc_section_defs, post-G0), any SourceMeta built from such a match must
 * degrade to plain page-range presentation:
 *   - `precision` is always "chunk_range_only" (never "page_range", the
 *     "exact" tier SourcePanel renders with a "دقيق"/"exact" badge) —
 *     `formatSourceLabel` already renders both precisions as the same plain
 *     "Pages X–Y" / "صفحات X–Y" text, so this alone is the degrade to
 *     page-range presentation.
 *   - `sectionConfidence` reuses the SAME "medium"/"ambiguous" values (and
 *     the SourcePanel styling paths already keyed off them) that the inline
 *     citation badges use for conf:medium / conf:ambiguous — no new UI.
 *
 * `kind`:
 *   "exact_number"   — the row matched the clicked section_number exactly.
 *                      Confidence: "medium" (right number, but the number
 *                      itself may be mislabeled in the DB).
 *   "sibling_anchor" — the row matched only a parent-prefix sibling (e.g.
 *                      "1014.%" for "1014.6"); the page is an anchor guess,
 *                      not even the requested section. Confidence:
 *                      "ambiguous".
 */
export type SectionOnlyMatchKind = "exact_number" | "sibling_anchor";

export function resolveSectionOnlyMatch(
  base: SourceMeta,
  sectionNum: string,
  pageStart: number,
  pageEnd: number,
  kind: SectionOnlyMatchKind,
): SourceMeta {
  return {
    ...base,
    pageStart,
    pageEnd,
    precision: "chunk_range_only",
    sectionRef: sectionNum,
    sectionConfidence: kind === "exact_number" ? "medium" : "ambiguous",
  };
}

/**
 * Format a SourceMeta as a short human-readable chip label.
 * Arabic: "📖 SBC 201 — صفحات 1–250"
 * English: "📖 SBC 201 — Pages 1–250"
 */
export function formatSourceLabel(meta: SourceMeta, lang: "ar" | "en" = "ar"): string {
  const code = meta.documentCode === "UNKNOWN"
    ? meta.title
    : meta.documentCode.replace("-", " ");

  // Step 4.1 — structured-table evidence: distinct label, no page range.
  if (meta.origin === "structured_table") {
    const tableLbl = meta.tableRef ?? meta.sectionRef ?? "—";
    return lang === "en"
      ? `🗂️ ${code} — Table ${tableLbl} (structured)`
      : `🗂️ ${code} — جدول ${tableLbl} (دليل منظم)`;
  }

  // R19B: show page range for ALL precisions (not just "page_range") so that
  // chunk-range-only files (e.g. SBC201-1001-1250) get a distinct label instead
  // of collapsing to the same bare "📖 SBC 201" as other chunk files.
  if (meta.pageStart !== null && meta.pageEnd !== null) {
    return lang === "en"
      ? `📖 ${code} — Pages ${meta.pageStart}–${meta.pageEnd}`
      : `📖 ${code} — صفحات ${meta.pageStart}–${meta.pageEnd}`;
  }
  return `📖 ${code}`;
}

// Signed PDF URL resolution (fetchSignedPdfUrl, KNOWN_SBC_PDF_PATHS,
// isKnownSbcPdfPath) lives in ./sourcePdfUrl.ts, not here — see file header.
