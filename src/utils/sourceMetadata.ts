/**
 * sourceMetadata.ts — pure resolver (no React, no side effects)
 *
 * Maps chunk/JSON source filenames emitted by the fire-safety-chat edge function
 * to their canonical uploaded PDFs in the source-pdfs Supabase Storage bucket.
 *
 * Mapping rule (100% deterministic, no ambiguity):
 *   "{base}_extracted_chunks.json"  → "{base}.pdf"
 *   "{base}_extracted.json"         → "{base}.pdf"
 *   SBC 201 filenames               → sbc/sbc-201/{base}.pdf
 *   SBC 801 filenames               → sbc/sbc-801/{base}.pdf
 */

const SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co";
const PDF_BUCKET = "source-pdfs";

/** How precise the page number we can offer is */
export type SourcePrecision = "page_range" | "chunk_range_only" | "unavailable";

/**
 * Per-file chunk page metadata as emitted by the edge function in X-SBC-Source-Meta.
 * page_range   → chunk had page_start/page_end from DB or JSON; min/max across selected chunks
 * chunk_range_only → only the filename's overall page range is known
 * unavailable  → no page data at all
 */
export interface ChunkPageMeta {
  file: string;
  pageStart: number | null;
  pageEnd: number | null;
  precision: SourcePrecision;
}

export interface SourceMeta {
  /** Original source filename as returned by the edge function */
  sourceFile: string;
  /** Human-readable title */
  title: string;
  /** "SBC-201" | "SBC-801" | "UNKNOWN" */
  documentCode: string;
  /** First page to show (chunk-level when available, otherwise from filename) */
  pageStart: number | null;
  /** Last page of displayed range */
  pageEnd: number | null;
  /** Public PDF URL (null if source cannot be mapped) */
  pdfUrl: string | null;
  /** Storage path within source-pdfs bucket */
  pdfPath: string | null;
  /** Quality of the page data */
  precision: SourcePrecision;
}

/**
 * Resolve a single source filename → SourceMeta.
 * Never throws — returns a graceful fallback if filename doesn't match.
 */
export function resolveSourceMeta(sourceFile: string): SourceMeta {
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
      pageStart: null,
      pageEnd: null,
      pdfUrl: null,
      pdfPath: null,
      precision: "unavailable",
    };
  }

  const documentCode = is201 ? "SBC-201" : "SBC-801";
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

  // Build storage path and public URL
  const pdfFileName = `${base}.pdf`;
  const pdfPath = `${folder}/${pdfFileName}`;
  // URL-encode each path segment individually to handle spaces and parentheses
  const encodedPath = pdfPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const pdfUrl = `${SUPABASE_URL}/storage/v1/object/public/${PDF_BUCKET}/${encodedPath}`;

  return {
    sourceFile,
    title,
    documentCode,
    pageStart,
    pageEnd,
    pdfUrl,
    pdfPath,
    precision: pageStart != null ? "chunk_range_only" : "unavailable",
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
    if (cm && (cm.pageStart != null || cm.pageEnd != null)) {
      results.push({
        ...base,
        pageStart: cm.pageStart,
        pageEnd: cm.pageEnd,
        precision: cm.precision,
      });
    } else {
      results.push(base);
    }
  }
  return results;
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

  if (meta.pageStart !== null && meta.pageEnd !== null) {
    return lang === "en"
      ? `📖 ${code} — Pages ${meta.pageStart}–${meta.pageEnd}`
      : `📖 ${code} — صفحات ${meta.pageStart}–${meta.pageEnd}`;
  }
  return `📖 ${code}`;
}
