/**
 * Hybrid retrieval for fire-safety-chat (wave 1 item B1b): fuses the existing
 * pgvector cosine-similarity signal with Postgres full-text search over an
 * Arabic-normalized `tsv` column, via Reciprocal Rank Fusion. SQL side:
 * docs/db/20260903_hybrid_retrieval.sql (public.match_sbc_hybrid,
 * public.sbc_normalize_ar, public.sbc_to_tsvector_simple — apply that file
 * first; every function here fails open when it has not been applied yet).
 *
 * Pure data + pure logic, plus ONE small I/O function that takes its
 * Supabase client as a parameter instead of constructing one — so, like
 * ./retrievalPolicy.ts, ./chapterIndex.ts, ./promptContract.ts,
 * ./geminiResilience.ts and ./graphExpansion.ts, this file has no Deno APIs
 * of its own (no `Deno.env`, no `createClient`, no top-level `fetch`) and can
 * be unit-tested from src/__tests__ AND imported safely by the Edge
 * Function. fetchSBCContextHybrid's `client` parameter is exactly what makes
 * it testable without a real database: src/__tests__/hybridRetrieval.test.ts
 * passes a fake object satisfying SupabaseRpcLike.
 *
 * ---------------------------------------------------------------------------
 * STATUS AS OF THIS FILE — UNWIRED, exactly like graphExpansion.ts was at G0
 * ---------------------------------------------------------------------------
 * index.ts does not import this module. Nothing in this file runs today. It
 * is provisioned ahead of a separate, surgical wiring change (wave-2
 * integrator, per docs/launch/next-wave-progress.md) that will call
 * fetchSBCContextHybrid from fetchSBCContextVector or its caller, behind
 * ADVISORY_HYBRID_RETRIEVAL_ENABLED (Section 1 below). Do not read "this
 * module exists" as "hybrid retrieval is live" — see
 * docs/launch/hybrid-retrieval-notes.md for the gate that must pass first.
 *
 * ---------------------------------------------------------------------------
 * THE FAIL-OPEN CONTRACT
 * ---------------------------------------------------------------------------
 * fetchSBCContextHybrid returns `null` — not a thrown error, not an empty
 * HybridRetrievalResult — whenever hybrid retrieval could not produce a
 * result for any reason: the SQL migration has not been applied yet
 * (`match_sbc_hybrid` does not exist — the expected state until the owner
 * runs docs/db/20260903_hybrid_retrieval.sql), any other RPC error, or the
 * RPC succeeding with zero rows. `null` means exactly one thing to the
 * caller: "keep whatever retrieval path you were already going to use"
 * (today that is fetchSBCContextVector's own vector call, or the keyword
 * path) — mirroring fetchSBCContextVector's own `!primaryMatches?.length`
 * fallback trigger in index.ts. This file never decides what the fallback
 * IS; it only ever declines to override it. A bug in this module can
 * therefore degrade retrieval quality, never break the chat response.
 *
 * ---------------------------------------------------------------------------
 * WHY THE QUERY IS NORMALIZED ON BOTH SIDES
 * ---------------------------------------------------------------------------
 * sbcNormalizeAr (Section 2) is a byte-for-byte TS mirror of the SQL
 * function public.sbc_normalize_ar. fetchSBCContextHybrid normalizes
 * `query` client-side BEFORE sending it as `query_text`, even though
 * match_sbc_hybrid ALSO normalizes query_text again internally in SQL. That
 * is deliberate double coverage, not a bug: sbc_normalize_ar is idempotent
 * by construction (re-normalizing normalized text is a no-op — proven in
 * the test file), so applying it twice is harmless, and it means the exact
 * text sent over the wire is provable in a unit test without a live
 * database, rather than trusting the SQL-side transform alone.
 *
 * ---------------------------------------------------------------------------
 * THE RRF MERGE FUNCTION IS NOT ON fetchSBCContextHybrid's CALL PATH
 * ---------------------------------------------------------------------------
 * reciprocalRankFusion (Section 3) is exported and independently tested
 * because it pins, in TypeScript, the exact fusion algorithm
 * match_sbc_hybrid implements in SQL (score = sum of 1/(k+rank) per list a
 * document appears in, tie-broken id ascending) — so the algorithm's
 * ordering/tie-break properties are provable without a live database, and
 * so it is available if a future need ever arises to fuse two already-
 * fetched candidate lists in TS (e.g. a caller that already has vector
 * results and wants to merge in a plain keyword list without a round trip
 * through match_sbc_hybrid). fetchSBCContextHybrid itself does NOT call it —
 * the SQL RPC already returns pre-fused rows (rrf_score/vector_rank/
 * fts_rank/fts_score), so there is nothing left to fuse in TS on that path.
 */

// ===========================================================================
// SECTION 1 — ADVISORY_HYBRID_RETRIEVAL_ENABLED flag (default OFF)
// ===========================================================================
// Same exact-string-"1" house pattern as every ADVISORY_* flag in
// ./retrievalPolicy.ts and ./graphExpansion.ts — a typo in an env var must
// never silently enable a different retrieval path for a life-safety answer.
// Declared here, not imported from retrievalPolicy.ts: this codebase's own
// convention (see ./graphExpansion.ts's identical local EnvReader/flag-style
// declaration) is that each pure retrieval module owns its own flag reader
// rather than cross-importing one, so modules built in parallel (this wave
// has nine) never fight over a shared file.

export type EnvReader = (key: string) => string | undefined;

export const HYBRID_RETRIEVAL_FLAG_ENV = "ADVISORY_HYBRID_RETRIEVAL_ENABLED";

/** True only for the exact string "1". Everything else — unset, "", "0", "true", "TRUE", "yes", a stray space — is OFF. */
export function isHybridRetrievalEnabled(env: EnvReader): boolean {
  return env(HYBRID_RETRIEVAL_FLAG_ENV) === "1";
}

// Tuning knobs added 2026-09-03 after the first live gate failed — see
// docs/db/20260903b_hybrid_retrieval_tuning.sql for the measured mechanism.
// The DEFAULTS here are the tuned values, not the SQL function's own
// pre-tuning defaults (1.0 / 0): the caller passes them explicitly, so
// turning the flag on gets the tuned behaviour, and the untuned behaviour is
// still reachable by setting the env overrides to 1 and 0.

export const HYBRID_FTS_WEIGHT_ENV = "SBC_HYBRID_FTS_WEIGHT";
/** Halves a lexical-only row's ability to outrank vector evidence; recall unchanged. */
export const HYBRID_FTS_WEIGHT_DEFAULT = 0.5;

export const HYBRID_VECTOR_QUOTA_RATIO_ENV = "SBC_HYBRID_VECTOR_QUOTA_RATIO";
/** Fraction of match_count guaranteed to the (floored) vector leg — 15 of 25 rows in advisory/analysis, 6 of 10 in primary. */
export const HYBRID_VECTOR_QUOTA_RATIO_DEFAULT = 0.6;

// ===========================================================================
// SECTION 2 — sbcNormalizeAr: TS mirror of public.sbc_normalize_ar
// ===========================================================================
// Must stay behaviourally identical to the SQL function in
// docs/db/20260903_hybrid_retrieval.sql SECTION 2. Same five steps, same
// order:
//   1. strip combining diacritics U+064B-U+0652 (harakat + shadda + sukun)
//      and tatweel U+0640.
//   2. unify letter variants: alef-hamza-above/below/madda (أ/إ/آ) -> ا,
//      alef-maksura (ى) -> ي, ta-marbuta (ة) -> ه.
//   3. lower() — folds Latin case; a no-op on Arabic, which has none.
//   4. strip punctuation EXCEPT "." and "-", which section numbers use
//      ("903.2.11.3" dot-style; SBC 401's IEC-style "41-1.4" / "712-"
//      hyphen-style) and must stay intact for a literal section-number query
//      to match.
//   5. collapse whitespace runs to one space and trim.
// `\p{L}` / `\p{N}` (Unicode property escapes, hence the `u` flag) are the JS
// equivalent of the SQL side's `[:alnum:]` POSIX class — both are meant to
// admit any-script letters/digits, not ASCII-only ones.

const DIACRITICS_AND_TATWEEL = /[ـً-ْ]/g;
const ALEF_VARIANTS = /[أإآ]/g; // أ إ آ
const ALEF_MAKSURA = /ى/g; // ى
const TA_MARBUTA = /ة/g; // ة
/** Everything except letters (any script), digits (any script), whitespace, "." and "-". */
const NON_SECTION_PUNCTUATION = /[^\p{L}\p{N}\s.\-]/gu;
const WHITESPACE_RUN = /\s+/g;

export function sbcNormalizeAr(input: string | null | undefined): string {
  const raw = input ?? "";
  const noDiacritics = raw.replace(DIACRITICS_AND_TATWEEL, "");
  const unified = noDiacritics
    .replace(ALEF_VARIANTS, "ا") // -> ا
    .replace(ALEF_MAKSURA, "ي") // -> ي
    .replace(TA_MARBUTA, "ه"); // -> ه
  const lowered = unified.toLowerCase();
  const noPunctuation = lowered.replace(NON_SECTION_PUNCTUATION, " ");
  return noPunctuation.replace(WHITESPACE_RUN, " ").trim();
}

// ===========================================================================
// SECTION 3 — Reciprocal Rank Fusion (pure; see file header for its role)
// ===========================================================================
// score(doc) = sum over {vector, fts} of 1/(k + rank_in_that_list), 0 for a
// list the doc is absent from. Final order: score DESC, id ASC — the same
// deterministic tie-break match_sbc_hybrid uses in SQL, so two items with
// equal fused scores (e.g. each present in exactly one list, at ranks that
// happen to produce the same score) do not depend on JS's non-guaranteed
// sort stability across engines.

export interface RrfInput {
  id: number;
}

export interface RrfFused<T extends RrfInput> {
  id: number;
  item: T;
  rrfScore: number;
  vectorRank: number | null;
  ftsRank: number | null;
}

export interface RrfOptions {
  /** RRF constant k. Default 60 — Cormack, Clarke & Buettcher (SIGIR 2009)'s own tuned value, matching match_sbc_hybrid's rrf_k default. */
  k?: number;
  /** Truncate the fused, sorted result to this many rows. Unset = return everything. */
  limit?: number;
}

/**
 * Fuse two already-ranked candidate lists (rank = array position, 1-based).
 * Each list may contain items the other does not — this is a full-outer-join
 * union on `id`, mirroring match_sbc_hybrid's `full outer join ... on v.id = f.id`.
 */
export function reciprocalRankFusion<T extends RrfInput>(
  vectorRanked: T[],
  ftsRanked: T[],
  opts: RrfOptions = {},
): RrfFused<T>[] {
  const k = opts.k ?? 60;

  const byId = new Map<number, T>();
  const vectorRankById = new Map<number, number>();
  const ftsRankById = new Map<number, number>();

  vectorRanked.forEach((item, index) => {
    byId.set(item.id, item);
    vectorRankById.set(item.id, index + 1);
  });
  ftsRanked.forEach((item, index) => {
    if (!byId.has(item.id)) byId.set(item.id, item);
    ftsRankById.set(item.id, index + 1);
  });

  const fused: RrfFused<T>[] = [];
  for (const [id, item] of byId) {
    const vectorRank = vectorRankById.get(id) ?? null;
    const ftsRank = ftsRankById.get(id) ?? null;
    const rrfScore =
      (vectorRank !== null ? 1 / (k + vectorRank) : 0) + (ftsRank !== null ? 1 / (k + ftsRank) : 0);
    fused.push({ id, item, rrfScore, vectorRank, ftsRank });
  }

  fused.sort((a, b) => (b.rrfScore !== a.rrfScore ? b.rrfScore - a.rrfScore : a.id - b.id));
  return opts.limit != null ? fused.slice(0, opts.limit) : fused;
}

// ===========================================================================
// SECTION 4 — row shape, context rendering (mirrors fetchSBCContextVector)
// ===========================================================================

/** Mirrors index.ts's module-private SourcePageMeta (index.ts:507) field-for-field. Declared locally because that type is not exported and index.ts cannot be imported here (it calls serve() at module scope — see src/__tests__/retrievalPolicy.test.ts's file-level doc comment for the same constraint on this codebase's other pure modules). */
export interface SourcePageMeta {
  file: string;
  pageStart: number | null;
  pageEnd: number | null;
  precision: "page_range" | "chunk_range_only" | "unavailable";
}

/** One row of public.match_sbc_hybrid's result set (docs/db/20260903_hybrid_retrieval.sql SECTION 6). */
export interface HybridDocRow {
  id: number;
  content: string;
  metadata: unknown;
  code_type: string | null;
  section_number: string | null;
  chapter_number: string | null;
  page_start: number | null;
  page_end: number | null;
  file_name: string | null;
  similarity: number | null;
  rrf_score: number;
  vector_rank: number | null;
  fts_rank: number | null;
  fts_score: number | null;
}

export interface HybridRetrievalResult {
  context: string;
  files: string[];
  sourceMeta: SourcePageMeta[];
  docIds: number[];
  engine: "hybrid";
}

/**
 * Replicated from index.ts's exported codeFromFileName (index.ts:1225) — NOT
 * imported, for the same vitest-safety reason as SourcePageMeta above (and
 * per this task's own instruction to "import or replicate minimal helpers
 * without editing index.ts"). Keep in sync by hand if index.ts's version
 * changes; pinned by a test below against the same four code families.
 */
export function codeFromFileName(fileName: string | null | undefined): string {
  const f = String(fileName ?? "");
  if (/^SBC[\s_-]*201\b/i.test(f)) return "SBC-201";
  if (/^SBC[\s_-]*801\b/i.test(f)) return "SBC-801";
  if (/^SBC[\s_-]*501(?!\d)/i.test(f)) return "SBC-501";
  if (/^SBC[\s_-]*401(?!\d)/i.test(f)) return "SBC-401";
  return "UNKNOWN";
}

/** Same total budget as fetchSBCContextVector's `contextLimit` (index.ts). */
export const DEFAULT_HYBRID_CONTEXT_LIMIT = 120_000;

const HYBRID_CONTEXT_HEADER =
  "\n=== SBC REFERENCE DOCUMENTS (Hybrid Search: Vector + Full-Text, RRF-fused) ===\n";

/**
 * Maps match_sbc_hybrid's rows into exactly the shape fetchSBCContextVector
 * produces ({context, files, sourceMeta, docIds, engine}), engine fixed to
 * "hybrid". Per-entry header mirrors the vector path's grammar verbatim
 * (`Code:`, `Section:`, `Pages:`, `Similarity:` — index.ts:2399) and only
 * APPENDS an `RRF:` field, so anything that already expects the vector
 * path's block format keeps working unchanged. `Similarity:` reads "n/a"
 * rather than "NaN"/"undefined" for an FTS-only row with no embedding.
 *
 * Rows are assumed already ordered by the RPC (rrf_score DESC, id ASC) —
 * this function does not re-sort. contextLimit truncation behaviour
 * (stop appending once the NEXT entry would exceed the budget) is identical
 * to fetchSBCContextVector's loop.
 */
export function buildHybridContext(
  rows: HybridDocRow[],
  contextLimit: number = DEFAULT_HYBRID_CONTEXT_LIMIT,
): HybridRetrievalResult {
  const usedFiles = [...new Set(rows.map((r) => r.file_name).filter((f): f is string => !!f))];
  let context = HYBRID_CONTEXT_HEADER;

  const metaMap = new Map<string, { minPage: number | null; maxPage: number | null }>();
  for (const row of rows) {
    const fileName = row.file_name ?? "unknown";
    const similarityText = typeof row.similarity === "number" ? row.similarity.toFixed(3) : "n/a";
    const rrfText = row.rrf_score.toFixed(5);
    const entry =
      `\n=== ${fileName} | Code: ${codeFromFileName(row.file_name)} | Section: ${row.section_number || "N/A"} | ` +
      `Pages: ${row.page_start}-${row.page_end} | Similarity: ${similarityText} | RRF: ${rrfText} ===\n${row.content}\n`;
    if (context.length + entry.length > contextLimit) break;
    context += entry;

    const m = metaMap.get(fileName) ?? { minPage: null, maxPage: null };
    if (row.page_start != null) m.minPage = m.minPage == null ? row.page_start : Math.min(m.minPage, row.page_start);
    if (row.page_end != null) m.maxPage = m.maxPage == null ? row.page_end : Math.max(m.maxPage, row.page_end);
    metaMap.set(fileName, m);
  }

  const sourceMeta: SourcePageMeta[] = usedFiles.map((file) => {
    const m = metaMap.get(file);
    const hasPages = m != null && (m.minPage != null || m.maxPage != null);
    return {
      file,
      pageStart: m?.minPage ?? null,
      pageEnd: m?.maxPage ?? null,
      precision: hasPages ? "page_range" : "chunk_range_only",
    };
  });

  // Same bigint-as-string defensiveness as index.ts's docIds construction
  // (index.ts:2423-2431): sbc_documents.id is a Postgres bigint; PostgREST
  // normally serialises it as a JSON number, but a numeric string is
  // accepted too rather than silently dropping every id if a driver version
  // ever stringifies bigint columns.
  const docIds = [
    ...new Set(
      rows
        .map((r) => (typeof r.id === "number" ? r.id : Number(r.id)))
        .filter((id) => Number.isFinite(id)),
    ),
  ];

  return { context, files: usedFiles, sourceMeta, docIds, engine: "hybrid" };
}

// ===========================================================================
// SECTION 5 — fetchSBCContextHybrid (the one I/O function; client injected)
// ===========================================================================

/**
 * Minimal structural shape of the one supabase-js method this file calls.
 * `PromiseLike`, not `Promise`: supabase-js's `.rpc()` returns a thenable
 * PostgrestBuilder, not a literal Promise, so a caller can pass the real
 * `supabaseAdmin` client (created via `createClient(...)` in index.ts)
 * without a structural-typing mismatch. `error` is typed as a minimal
 * subset of PostgrestError — extra fields on the real object (details,
 * hint, code) are compatible by structural typing.
 */
export interface SupabaseRpcLike {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export interface FetchHybridOptions {
  /** RRF constant passed through to match_sbc_hybrid's rrf_k. Default 60 (the RPC's own default — omitted from the call unless overridden, so a future SQL-side default change is not silently shadowed here). */
  rrfK?: number;
  /** match_sbc_hybrid's candidate_pool. Default 40 (the RPC's own default — same omit-unless-overridden reasoning as rrfK). */
  candidatePool?: number;
  /** Passed through to buildHybridContext. Default DEFAULT_HYBRID_CONTEXT_LIMIT. */
  contextLimit?: number;
  /**
   * Weight on the FTS leg of the fusion (docs/db/20260903b_hybrid_retrieval_tuning.sql).
   * 1.0 is the RPC's own default and reproduces the equal-weight ranking whose
   * gate failed on 2026-09-03; below 1.0 a lexical-only row must rank
   * correspondingly higher in its own list to displace a vector row.
   */
  ftsWeight?: number;
  /** Guaranteed number of (floored) vector rows in the result, ordered first. 0 = the RPC's default = pure fused ranking. */
  vectorQuota?: number;
  /** Relative similarity floor on the VECTOR leg — fraction of this query's best similarity. Omit for no floor. */
  minSimilarityRel?: number;
  /** Absolute similarity floor on the VECTOR leg. Omit for no floor. */
  minSimilarityAbs?: number;
}

/**
 * Error messages/codes that mean "match_sbc_hybrid is not provisioned yet"
 * (docs/db/20260903_hybrid_retrieval.sql not applied) rather than a real
 * runtime failure. Matched case-insensitively, substring, against
 * error.message — PostgREST's actual wording for this case is
 * `Could not find the function public.match_sbc_hybrid(...) in the schema
 * cache` (code PGRST202); the underlying Postgres error if ever seen
 * directly is `function public.match_sbc_hybrid(...) does not exist`
 * (SQLSTATE 42883). Both are covered so this reads correctly whether the
 * error reaches this file through PostgREST (the normal path) or, in a
 * test, a stub client
 */
const MISSING_FUNCTION_MARKERS = ["does not exist", "pgrst202", "schema cache"];

function isMissingFunctionError(message: string | null | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return MISSING_FUNCTION_MARKERS.some((marker) => m.includes(marker));
}

/**
 * Call match_sbc_hybrid and map its rows into a HybridRetrievalResult.
 *
 * @param query        Raw user query text. Normalized internally via
 *                      sbcNormalizeAr before being sent as query_text (see
 *                      file header, "WHY THE QUERY IS NORMALIZED ON BOTH
 *                      SIDES").
 * @param embedding     Already-computed query embedding (768-dim, same model
 *                      fetchSBCContextVector uses — gemini-embedding-001).
 *                      This function does not embed text itself, matching
 *                      fetchSBCContextVector's separation of concerns: a
 *                      failed embedding is the CALLER's fallback decision,
 *                      made before this function is ever invoked.
 * @param codes         Code-type filter, ANY-match (SQL `filter_codes text[]`).
 *                      Pass `null` for no filter (search every code), or a
 *                      one-element array for parity with today's single-code
 *                      `filter_code` behaviour used elsewhere in index.ts. An
 *                      empty array is passed through as `null` (see below) —
 *                      an accidental `[]` must not silently mean "match
 *                      nothing", which is what an empty SQL array filter
 *                      would otherwise do.
 * @param matchCount    Final row cap (SQL `match_count`, no default — every
 *                      caller states it explicitly).
 * @param client        Object exposing `.rpc()` — the real supabaseAdmin
 *                      client in production, a fake in tests.
 *
 * @returns `null` on ANY non-success outcome (RPC not provisioned yet, any
 *          other RPC error, or zero rows) — see file header, "THE FAIL-OPEN
 *          CONTRACT". Otherwise a HybridRetrievalResult with `engine: "hybrid"`.
 */
export async function fetchSBCContextHybrid(
  query: string,
  embedding: number[],
  codes: string[] | null,
  matchCount: number,
  client: SupabaseRpcLike,
  opts: FetchHybridOptions = {},
): Promise<HybridRetrievalResult | null> {
  const normalizedQuery = sbcNormalizeAr(query);

  try {
    const args: Record<string, unknown> = {
      query_text: normalizedQuery,
      query_embedding: embedding,
      match_count: matchCount,
      filter_codes: codes && codes.length > 0 ? codes : null,
    };
    if (opts.rrfK !== undefined) args.rrf_k = opts.rrfK;
    if (opts.candidatePool !== undefined) args.candidate_pool = opts.candidatePool;
    if (opts.ftsWeight !== undefined) args.fts_weight = opts.ftsWeight;
    if (opts.vectorQuota !== undefined) args.vector_quota = opts.vectorQuota;
    if (opts.minSimilarityRel !== undefined) args.min_similarity_rel = opts.minSimilarityRel;
    if (opts.minSimilarityAbs !== undefined) args.min_similarity_abs = opts.minSimilarityAbs;

    const { data, error } = await client.rpc("match_sbc_hybrid", args);

    if (error) {
      if (isMissingFunctionError(error.message)) {
        console.warn(
          `[Hybrid Retrieval] match_sbc_hybrid not provisioned yet (${error.message}) — caller keeps its current retrieval path`,
        );
      } else {
        console.error(`[Hybrid Retrieval] RPC error: ${error.message}`);
      }
      return null;
    }

    const rows = (Array.isArray(data) ? data : []) as HybridDocRow[];
    if (rows.length === 0) {
      // Mirrors fetchSBCContextVector's `!primaryMatches?.length` fallback
      // trigger (index.ts) — an empty result is always a fallback signal
      // here too, never an "empty success".
      return null;
    }

    // Every row is lexical-only: with the vector-leg floor in play (SQL
    // min_similarity_rel/_abs) that means the whole vector candidate list was
    // measured to be noise for this query — the exact situation the non-hybrid
    // path answers with keywordFallback("below_floor"). Declining here hands
    // the decision back to the caller's own floor/fallback chain rather than
    // building a life-safety context out of lexical coincidence alone.
    if (!rows.some((r) => r.vector_rank !== null && r.vector_rank !== undefined)) {
      console.warn(
        `[Hybrid Retrieval] ${rows.length} rows, none with vector support (floor cut the whole vector leg) — caller keeps its current retrieval path`,
      );
      return null;
    }

    return buildHybridContext(rows, opts.contextLimit);
  } catch (err) {
    console.error(`[Hybrid Retrieval] fatal error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
