/**
 * sourceSignals.ts — pure formatting helpers for two P5 (Advisory Brain)
 * honesty features wired into fire-safety-chat/index.ts's STANDARD/ADVISORY
 * TEXT PIPELINE:
 *
 *   1. Structured-table source sentinels. When fetchStructuredTables() (in
 *      index.ts) matches a sbc_code_tables row, that row's provenance was
 *      being injected into the PROMPT but never surfaced to the client — the
 *      X-SBC-Sources / X-SBC-Source-Meta response headers only ever carried
 *      PDF-chunk filenames. buildTableSourceSignals() formats the
 *      `__sbc_table__::SBC-201::<table_id>` sentinel that
 *      src/utils/sourceMetadata.ts's resolveSourceMeta() (~116-141) already
 *      knows how to parse (that parser shipped ahead of any writer — Step
 *      4.1), so appending these entries to usedFiles/usedSourceMeta is what
 *      finally makes structured-table evidence show up in SourcePanel like
 *      any other source.
 *
 *   2. External-standard honesty lines. The retrieved SBC document text
 *      routinely cites external standards (NFPA/ASTM/UL/ASME/ANSI/ISO/API/
 *      AWS/ICC) ConsultX does not hold the text of. formatExternalRefsBlock()
 *      turns public.sbc_external_refs rows (see supabase/migrations/
 *      20260824100005_sbc_external_refs.sql) into a short, clearly labelled,
 *      negative-phrased block the caller appends to the system prompt AFTER
 *      the retrieved text, so the model cannot imply it can quote or verify
 *      against a standard it has no text for. THAT TABLE DOES NOT EXIST IN
 *      PRODUCTION YET — every caller of the query feeding this function MUST
 *      wrap it in try/catch and fail open; this module has no I/O of its own
 *      and cannot enforce that, it only formats rows it is handed.
 *
 * Pure — no Deno APIs, no Supabase client, no I/O — the same pattern as
 * ./retrievalPolicy.ts, ./contextBudget.ts and ./promptContract.ts, so this
 * file is unit-testable from src/__tests__ and safely importable by the Edge
 * Function.
 */

// ===========================================================================
// 1. Structured-table source sentinels
// ===========================================================================

/** Minimal shape this module needs from a sbc_code_tables row. */
export interface StructuredTableSourceRow {
  table_id: string;
  source_code?: string | null;
}

/**
 * Shape pushed into X-SBC-Source-Meta for a structured-table entry. Matches
 * index.ts's local `SourcePageMeta` type structurally (page_range /
 * chunk_range_only / unavailable) without importing across the module
 * boundary — table sentinels never carry page data, so precision is always
 * "unavailable".
 */
export interface TableSourceMetaEntry {
  file: string;
  pageStart: number | null;
  pageEnd: number | null;
  precision: "unavailable";
}

/**
 * Normalise a sbc_code_tables.source_code value into the hyphenated family
 * code the sentinel — and src/utils/sourceMetadata.ts's parser regex
 * `^__sbc_table__::(SBC-(?:201|801))::(.+)$` — require.
 *
 * MEASURED: supabase/migrations/20260410000002_sbc_structured_tables.sql
 * line 12 declares `source_code text NOT NULL, -- "SBC 201" | "SBC 801"`
 * (space-separated) and every seed row in
 * supabase/migrations/20260410000003_sbc_tables_seed.sql stores it that way.
 * The sentinel format is hyphenated ("SBC-201"), so this function is the one
 * place that bridges the two spellings.
 *
 * Returns null for any value that does not recognisably mean SBC 201/801
 * (including a missing/empty value) — the caller must skip the row rather
 * than emit a sentinel the frontend parser cannot match.
 */
export function normalizeTableSourceCode(
  sourceCode: string | null | undefined,
): "SBC-201" | "SBC-801" | null {
  if (!sourceCode) return null;
  const compact = sourceCode.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (compact === "SBC201") return "SBC-201";
  if (compact === "SBC801") return "SBC-801";
  return null;
}

/**
 * Build the `__sbc_table__::SBC-XXX::<table_id>` sentinel for one matched
 * structured-table row. Returns null when the row's source_code cannot be
 * normalised or table_id is missing — the caller must drop the row from both
 * usedFiles and usedSourceMeta rather than emit a malformed sentinel.
 */
export function formatTableSentinel(row: StructuredTableSourceRow): string | null {
  const code = normalizeTableSourceCode(row.source_code);
  if (!code || !row.table_id) return null;
  return `__sbc_table__::${code}::${row.table_id}`;
}

/**
 * Build the usedFiles / usedSourceMeta entries to APPEND (never replace) for
 * every structured-table row fetchStructuredTables() matched this request.
 * Order follows the input row order. Rows whose source_code cannot be
 * normalised are silently skipped (see formatTableSentinel) rather than
 * emitting a sentinel the frontend cannot parse.
 *
 * DEDUPED BY SENTINEL, keeping first-occurrence order. sbc_code_tables.table_id
 * is NOT unique — index.ts's KNOWN_TABLE_IDS comment records the measured
 * production fact that "417" appears on two rows — and fetchStructuredTables()
 * matches it with `.in("table_id", ids)`, so two rows sharing a table_id AND a
 * source_code both reach this function and would otherwise emit the identical
 * sentinel twice into X-SBC-Sources and X-SBC-Source-Meta. A sentinel is fully
 * determined by (source_code, table_id), so a repeat carries no extra
 * information. This mirrors the `[...new Set(...)]` the vector path already
 * applies to its own usedFiles. The frontend's resolveAllSources /
 * resolveSourcesWithMeta dedupe again by sourceFile, so the duplicate never
 * reached the UI — but it did reach the response header and the persisted
 * message row, and it contradicted this module's own contract.
 */
export function buildTableSourceSignals(
  rows: StructuredTableSourceRow[],
): { files: string[]; sourceMeta: TableSourceMetaEntry[] } {
  const seen = new Set<string>();
  const files: string[] = [];
  const sourceMeta: TableSourceMetaEntry[] = [];
  for (const row of rows ?? []) {
    const sentinel = formatTableSentinel(row);
    if (!sentinel || seen.has(sentinel)) continue;
    seen.add(sentinel);
    files.push(sentinel);
    sourceMeta.push({ file: sentinel, pageStart: null, pageEnd: null, precision: "unavailable" });
  }
  return { files, sourceMeta };
}

// ===========================================================================
// 2. External-standard honesty lines (sbc_external_refs)
// ===========================================================================

/** Minimal shape this module needs from a sbc_external_refs row. */
export interface ExternalRefRow {
  standard: string;
  standard_ref?: string | null;
}

/**
 * Anchor phrase every emitted line contains. Exported so tests (and any
 * future caller checking the block for the honesty statement rather than
 * string-matching the whole template) have a stable, named substring to
 * assert against instead of re-typing the Arabic sentence.
 */
export const EXTERNAL_REF_ANCHOR_PHRASE = "غير متوفر في مصادر النظام";

/**
 * Exact line template — task-mandated wording, byte-for-byte, with only the
 * reference token substituted. Do not paraphrase or localise: this is a
 * negative/honesty statement (the standard is NOT available), not a citation,
 * so getting the wording exactly right matters the same way the refusal
 * sentences in promptContract.ts's CITATION_TOKEN_CONTRACT do.
 */
function formatExternalRefLine(ref: string): string {
  return `نص SBC المسترجع يُحيل إلى ${ref} — هذا المعيار غير متوفر في مصادر النظام ولا يمكن استرجاع نص بنوده.`;
}

/** Hard cap on how many distinct external-standard lines one block may carry. */
export const EXTERNAL_REFS_MAX_LINES = 5;

const EXTERNAL_REFS_HEADER =
  "\n\n=== EXTERNAL STANDARDS CITED BY THE RETRIEVED SBC TEXT (NOT HELD BY THIS SYSTEM) ===\n";
const EXTERNAL_REFS_FOOTER =
  "=== END EXTERNAL STANDARD REFERENCES ===\n";

/**
 * Build the labelled context block for sbc_external_refs rows. Pure — the
 * CALLER is responsible for the try/catch around the query itself (the table
 * does not exist in production yet — see the module header) and must only
 * call this after the query succeeded with at least one row; an empty/absent
 * `rows` argument returns "" and is always safe.
 *
 * Dedupes by standard_ref, falling back to `standard` (the family, e.g.
 * "NFPA") for rows whose standard_ref is null — the column is nullable by
 * design (supabase/migrations/20260824100005_sbc_external_refs.sql: "a
 * citation can name only the family... left NULL rather than inventing a
 * number the source text never stated"). Caps at EXTERNAL_REFS_MAX_LINES
 * distinct references so one heavily-cited chunk cannot balloon the prompt.
 */
export function formatExternalRefsBlock(rows: ExternalRefRow[]): string {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const row of rows ?? []) {
    const ref =
      (row.standard_ref && row.standard_ref.trim()) ||
      (row.standard && row.standard.trim()) ||
      "";
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
    if (refs.length >= EXTERNAL_REFS_MAX_LINES) break;
  }
  if (refs.length === 0) return "";

  let block = EXTERNAL_REFS_HEADER;
  for (const ref of refs) {
    block += formatExternalRefLine(ref) + "\n";
  }
  block += EXTERNAL_REFS_FOOTER;
  return block;
}
