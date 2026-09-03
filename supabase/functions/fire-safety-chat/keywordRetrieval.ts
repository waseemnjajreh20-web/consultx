/**
 * keywordRetrieval.ts — in-database keyword retrieval (wave item D3, 2026-09-03).
 *
 * WHAT IT REPLACES. fetchSBCContext's keyword path lists the storage bucket,
 * scores and picks up to 12 chunk-JSON files, downloads them over the network,
 * parses every chunk in the isolate and scores each one in TypeScript.
 * Measured on production: 0.6-3.8s per request, median ~1.1s — and it is the
 * path most heavy-mode requests actually take, because vector retrieval falls
 * back to it whenever its similarity floor rejects the result set. The same
 * chunks already sit in `public.sbc_documents` behind a GIN-indexed,
 * Arabic-normalized `tsv` column, where the whole job is one indexed query:
 * measured at 33ms against the live corpus.
 *
 * WHY IT TAKES TERMS, NOT THE QUESTION. The corpus is English — measured
 * 2026-09-03, "مرشات" matches 0 of 5,553 rows through tsv while
 * "travel distance" matches 290 and the section number "1017.2" matches 41.
 * The caller already builds a keyword list for its own scorer (buildQueryKeywords
 * + buildQueryMeta: the question's tokens, English search terms, recognised
 * section numbers), so that list is what gets OR-ed here.
 *
 * SAME SHAPE AS THE PATH IT REPLACES. buildKeywordContext returns
 * {context, files, sourceMeta} with the identical per-source grouping, the
 * identical header line, and the identical page-range derivation as the
 * storage path's own tail, so nothing downstream can tell which one ran except
 * by timing.
 *
 * FAIL-OPEN, like ./hybridRetrieval.ts: any error, a missing RPC, or zero rows
 * returns null and the caller keeps the storage path it was already going to
 * use. A bug here degrades latency, never the answer.
 */

export type EnvReader = (key: string) => string | undefined;

export const KEYWORD_FTS_FLAG_ENV = "SBC_KEYWORD_FTS_ENABLED";

/** Exact string "1" only — the house rule for every retrieval flag here. */
export function isKeywordFtsEnabled(env: EnvReader): boolean {
  return env(KEYWORD_FTS_FLAG_ENV) === "1";
}

/** Mirrors index.ts's module-private SourcePageMeta field for field. */
export interface SourcePageMeta {
  file: string;
  pageStart: number | null;
  pageEnd: number | null;
  precision: "page_range" | "chunk_range_only" | "unavailable";
}

/** One row of public.match_sbc_keywords (docs/db/20260903c_keyword_fts.sql). */
export interface KeywordDocRow {
  id: number;
  content: string;
  code_type: string | null;
  section_number: string | null;
  page_start: number | null;
  page_end: number | null;
  file_name: string | null;
  score: number | null;
}

export interface KeywordRetrievalResult {
  context: string;
  files: string[];
  sourceMeta: SourcePageMeta[];
  docIds: number[];
}

export interface SupabaseRpcLike {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

/** Same budget the storage path applies (MAX_TOTAL_CONTEXT in index.ts). */
export const DEFAULT_KEYWORD_CONTEXT_LIMIT = 120_000;

/**
 * A term is worth sending when it can actually match text: at least two
 * characters, and not pure punctuation. Sending junk terms is harmless (the
 * SQL side normalizes and drops them too) but it makes the log line honest
 * about what was searched.
 */
export function usableTerms(terms: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of terms) {
    const t = String(raw ?? "").trim();
    if (t.length < 2) continue;
    if (!/[\p{L}\p{N}]/u.test(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Group rows by source file and render them exactly as the storage path's tail
 * does — same header, same "=== file (N relevant sections) ===" line, same
 * "\n---\n" separator — so the assembled prompt is indistinguishable.
 */
export function buildKeywordContext(
  rows: KeywordDocRow[],
  contextLimit: number = DEFAULT_KEYWORD_CONTEXT_LIMIT,
): KeywordRetrievalResult {
  const bySource = new Map<string, string[]>();
  const pageBySource = new Map<string, { minPage: number | null; maxPage: number | null }>();
  const docIds: number[] = [];
  let used = 0;

  for (const row of rows) {
    const file = row.file_name ?? "unknown";
    const text = String(row.content ?? "");
    if (!text) continue;
    // Same early-termination rule as the storage path: stop once the next
    // chunk would exceed the budget, rather than truncating mid-corpus.
    if (used + text.length > contextLimit) break;
    used += text.length;

    if (!bySource.has(file)) bySource.set(file, []);
    bySource.get(file)!.push(text);

    const m = pageBySource.get(file) ?? { minPage: null, maxPage: null };
    if (row.page_start != null) m.minPage = m.minPage == null ? row.page_start : Math.min(m.minPage, row.page_start);
    if (row.page_end != null) m.maxPage = m.maxPage == null ? row.page_end : Math.max(m.maxPage, row.page_end);
    pageBySource.set(file, m);

    const id = typeof row.id === "number" ? row.id : Number(row.id);
    if (Number.isFinite(id) && !docIds.includes(id)) docIds.push(id);
  }

  const files = [...bySource.keys()];
  let context = "\n\n📚 SBC REFERENCE DOCUMENTS (MOST RELEVANT SECTIONS SELECTED):\n";
  for (const [source, texts] of bySource) {
    context += `\n=== ${source} (${texts.length} relevant sections) ===\n${texts.join("\n---\n")}`;
  }

  const sourceMeta: SourcePageMeta[] = files.map((file) => {
    const m = pageBySource.get(file);
    const hasPages = m != null && (m.minPage != null || m.maxPage != null);
    return {
      file,
      pageStart: m?.minPage ?? null,
      pageEnd: m?.maxPage ?? null,
      precision: hasPages ? "page_range" : "chunk_range_only",
    };
  });

  return { context: files.length > 0 ? context : "", files, sourceMeta, docIds };
}

const MISSING_FUNCTION_MARKERS = ["does not exist", "pgrst202", "schema cache"];

function isMissingFunctionError(message: string | null | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return MISSING_FUNCTION_MARKERS.some((marker) => m.includes(marker));
}

/**
 * Run the RPC and render its rows. Returns null on ANY non-success outcome —
 * RPC absent, RPC error, no usable terms, zero rows — which means exactly
 * "keep the retrieval path you were already going to use".
 */
export async function fetchSBCContextKeywordFts(
  terms: Array<string | null | undefined>,
  codes: string[] | null,
  matchCount: number,
  client: SupabaseRpcLike,
  contextLimit: number = DEFAULT_KEYWORD_CONTEXT_LIMIT,
): Promise<KeywordRetrievalResult | null> {
  const clean = usableTerms(terms);
  if (clean.length === 0) return null;

  try {
    const { data, error } = await client.rpc("match_sbc_keywords", {
      terms: clean,
      match_count: matchCount,
      filter_codes: codes && codes.length > 0 ? codes : null,
    });

    if (error) {
      if (isMissingFunctionError(error.message)) {
        console.warn(`[Keyword FTS] match_sbc_keywords not provisioned (${error.message}) — keeping the storage path`);
      } else {
        console.error(`[Keyword FTS] RPC error: ${error.message}`);
      }
      return null;
    }

    const rows = (Array.isArray(data) ? data : []) as KeywordDocRow[];
    if (rows.length === 0) return null;

    const result = buildKeywordContext(rows, contextLimit);
    return result.files.length > 0 ? result : null;
  } catch (err) {
    console.error(`[Keyword FTS] fatal: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
