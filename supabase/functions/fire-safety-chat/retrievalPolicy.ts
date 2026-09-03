/**
 * Retrieval policy for fire-safety-chat: which engine serves a request, and
 * which vector matches are good enough to put in front of the model.
 *
 * Pure data + pure logic (no Deno APIs, no I/O) so it can be unit-tested from
 * src/__tests__ and imported safely by the Edge Function — the same pattern as
 * ./chapterIndex.ts, ./promptContract.ts and ./geminiResilience.ts.
 *
 * Created 2026-08-23 (B4) to carry two things index.ts cannot prove on its own:
 *   1. the reversible ADVISORY_VECTOR_RETRIEVAL_ENABLED flag that commit
 *      587fd5b deleted, restored DEFAULT OFF, and
 *   2. the similarity floor that risk R6 in
 *      docs/audits/advisory-retrieval-truth-20260823.md asks for.
 */

// ===========================================================================
// 1. ADVISORY VECTOR RETRIEVAL FLAG  (restored — deleted by commit 587fd5b)
// ===========================================================================
//
// History: 587fd5b ("fix(phase2): fix deno type regression and add production
// validation report") removed 3,142 lines, among them this flag and the
// X-Retrieval-Engine response header. Nothing about it was a type fix. The
// original lived inline in index.ts; it is restored here so its behaviour is
// provable by unit test rather than asserted in a comment.
//
// Semantics, deliberately identical to the pre-587fd5b original:
//   - the env var must be exactly the string "1" to enable. Anything else —
//     unset, "", "0", "true", "TRUE", "yes" — is OFF. A typo cannot silently
//     turn on a life-safety retrieval path.
//   - only the advisory/standard and analysis TEXT paths are governed, and
//     analysis needs a second key (see "TWO-KEY DESIGN" below). Primary mode
//     loads no documents; the image path calls the vector search
//     unconditionally and always did (see the note in section 2).
//
// Reversibility: unsetting the env var restores the keyword/storage path with
// no code change and no deploy.
//
// ---------------------------------------------------------------------------
// TWO-KEY DESIGN (P2, 2026-08-25): staging analysis behind its own sub-flag
// ---------------------------------------------------------------------------
// P2 extends vector retrieval from "standard" only to "standard" and
// "analysis", but the two modes do not earn trust on the same evidence: the
// standard rollout already has the R6 similarity floor and the fallback-on-
// empty behaviour proven in this file, while analysis TEXT retrieval has not
// been sent a single production request through the vector engine yet (the
// image path is a different call site and was already unconditional — see
// section 2). One flag cannot represent two different amounts of confidence,
// so there are two:
//
//   - the MASTER flag (ADVISORY_VECTOR_RETRIEVAL_ENABLED) is the switch this
//     file already had. OFF means every mode is byte-identical to HEAD,
//     exactly as before P2 — it is still the single kill switch for the
//     whole advisory text vector path.
//   - the ANALYSIS sub-flag (ADVISORY_VECTOR_ANALYSIS_FLAG_ENV) only matters
//     once the master is ON. It stages "analysis" behind its own soak period
//     instead of letting it ride in on standard's proof:
//       master ON,  sub unset/not "1" -> standard uses vector, analysis does not
//       master ON,  sub "1"           -> both standard and analysis use vector
//       master OFF, sub anything      -> nothing uses vector for either mode
//                                        (the sub-flag alone decides nothing)
//
// Rolling analysis back alone is one env var, not a deploy: turn the sub-flag
// off and standard keeps running on vector while analysis drops back to the
// keyword path, no code change on either side.

export const ADVISORY_VECTOR_FLAG_ENV = "ADVISORY_VECTOR_RETRIEVAL_ENABLED";

/**
 * The analysis-mode sub-flag (P2). Meaningless unless the master flag above
 * is also "1" — shouldUseVectorForAdvisory checks the master first and
 * returns false before this constant is ever read, so the sub-flag can never
 * enable analysis (or anything else) on its own.
 */
export const ADVISORY_VECTOR_ANALYSIS_FLAG_ENV = "ADVISORY_VECTOR_ANALYSIS_ENABLED";

export type EnvReader = (key: string) => string | undefined;

/** True only for the exact string "1". Everything else is OFF. */
export function isAdvisoryVectorEnabled(env: EnvReader): boolean {
  return env(ADVISORY_VECTOR_FLAG_ENV) === "1";
}

/**
 * The single decision point for the advisory/standard and analysis TEXT
 * pipelines (P2 two-key design; see "TWO-KEY DESIGN" above).
 *
 *   - master flag OFF -> false for every mode. This is what keeps flag-OFF
 *     behaviour byte-identical to the keyword-only path that shipped before
 *     any vector flag existed.
 *   - master flag ON, mode "standard" -> true unconditionally. Standard is
 *     the rollout this module's floor and fallback logic were proven against.
 *   - master flag ON, mode "analysis" -> true only if the analysis sub-flag
 *     is also exactly "1". Analysis shares the same floor and fallback code
 *     but is gated separately because it has not been soaked yet.
 *   - "primary" and any other mode -> always false; primary loads no
 *     documents at all.
 */
export function shouldUseVectorForAdvisory(mode: string, env: EnvReader): boolean {
  if (!isAdvisoryVectorEnabled(env)) return false;
  if (mode === "standard") return true;
  if (mode === "analysis") return env(ADVISORY_VECTOR_ANALYSIS_FLAG_ENV) === "1";
  return false;
}

/**
 * Which engine actually produced the context that was sent to the model.
 *
 * "hybrid" (added 2026-09-03, wave-2 wiring) means match_sbc_hybrid served the
 * request: FTS + pgvector fused by RRF inside one RPC — see
 * ./hybridRetrieval.ts. It is reported exactly like the other two (the
 * `engine` field of the {type:"sources"} event and the X-Retrieval-Engine
 * header), and it is only ever reachable while ADVISORY_HYBRID_RETRIEVAL_ENABLED
 * is exactly "1"; with the flag off no code path can produce it, so widening
 * the union here changes nothing observable on its own.
 */
export type RetrievalEngine = "vector" | "keyword" | "hybrid";

export const RETRIEVAL_ENGINE_HEADER = "X-Retrieval-Engine";

/**
 * Emitted ONLY when the vector path was attempted (flag on, eligible mode)
 * and fell back to keyword — names WHY, so a keyword row in the bench is
 * attributable ("below_floor" vs "embedding_http_429" vs "no_matches" ...)
 * instead of a silent fail-open. Absent on vector success, on primary mode,
 * and with the flag off (header absent = pre-2026-08-29 behaviour).
 * Added 2026-08-29: the first full live bench showed 6/43 standard rows on
 * keyword with no recorded reason — an observability gap flagged in review.
 */
export const RETRIEVAL_FALLBACK_HEADER = "X-Retrieval-Fallback";

// ===========================================================================
// 2. SIMILARITY FLOOR  (risk R6)
// ===========================================================================
//
// THE DEFECT. `match_sbc_documents` applies NO similarity threshold:
//
//   ORDER BY d.embedding <=> query_embedding
//   LIMIT match_count;
//
// (verified against pg_proc in production on 2026-08-23; the function's
// identity arguments are `query_embedding vector, match_count integer,
// filter_code text`). It returns the nearest `match_count` rows however far
// away they are. `match_count` is 25 for non-primary modes. The floor below is
// applied on the CALLER side; the SQL function is NOT modified, because
// changing it is a production schema change and therefore an owner action.
//
// ---------------------------------------------------------------------------
// MEASUREMENT (2026-08-23, read-only SQL against production, reproducible)
// ---------------------------------------------------------------------------
// All numbers below come from the 4,594 stored 768-dim gemini-embedding-001
// vectors in `sbc_documents`, using cosine similarity `1 - (a <=> b)`.
//
// (a) How compressed is this space? Similarity between corpus vectors:
//
//     population                  n        p50     p90     p95     p99
//     unrelated (cross-code)      77,760   0.6784  0.7436  0.7638  0.8092
//     same code, diff chapter     79,004   0.6856  0.7497  0.7680  0.8088
//     same code, same chapter      3,191   0.7766  0.8461  0.8689  0.9193
//
//     The 95th percentile of provably UNRELATED content (0.7638) sits BELOW
//     the median of genuinely related content (0.7766). An off-the-shelf
//     absolute cut of 0.70 or 0.75 would therefore be actively wrong here:
//     0.75 admits roughly 90% of random pairs.
//
// (b) What does an unthresholded k=25 actually admit? Nearest-neighbour
//     profile over 60 real corpus probes, self excluded:
//
//     rank    sim p10   sim p50      ratio to rank 1: p10     p50
//     1       0.8508    0.9246       —                        —
//     5       0.7881    0.8663       0.8959                   0.9522
//     10      0.7695    0.8452       0.8588                   0.9227
//     25      0.7564    0.8084       0.8340                   0.8806
//
//     Rank-25 median similarity (0.8084) is the 99th percentile of the
//     unrelated-pair distribution (0.8092), and rank-25 p10 (0.7564) falls
//     between the p90 and p95 of pure noise. CONFIRMED: with no threshold the
//     tail of the advisory result set is statistically indistinguishable from
//     randomly drawn chunks.
//
// ---------------------------------------------------------------------------
// WHY A RELATIVE FLOOR AND NOT ONLY AN ABSOLUTE ONE
// ---------------------------------------------------------------------------
// The measurement above uses DOCUMENT vectors as probes because no embedding
// API key was available in the measuring environment, so real query vectors
// could not be produced. Query-to-document similarity is systematically offset
// from document-to-document similarity (a short question against a ~4,000
// character chunk), and that offset — call it alpha — is UNKNOWN.
//
// The relative floor is chosen because it is scale-free: if the offset acts as
// a roughly common factor across a query's own top-k neighbourhood, then
// s_k / s_1 is preserved and the cut transfers, whereas an absolute cut would
// have to be rescaled by the unmeasured alpha. That common-factor property is
// a HYPOTHESIS about the geometry of this embedding space, NOT a measured
// fact, and it is recorded as such — it does not hold if a query vector
// compresses its neighbourhood non-uniformly.
//
// What does NOT depend on that hypothesis, and is the actual safety argument:
// when the floor removes every match, applySimilarityFloor returns an empty
// set and the caller falls back to fetchSBCContext. So the worst case of a
// mis-set floor is "degrades to today's keyword/storage path", never a wrong
// or thinner answer presented as complete.
//
// Both values are env-overridable so the owner can retune from measurement
// without a code deploy once query-side numbers exist.
// ---------------------------------------------------------------------------

/**
 * Keep a match only if its similarity is at least this fraction of the best
 * match's similarity.
 *
 * 0.85 chosen from the measured ratio distribution above: rank-10's p10 ratio
 * is 0.8588 (so the cut does not bite into the top 10 even in a 10th-
 * percentile-worst neighbourhood) while rank-25's p10 ratio is 0.8340 and its
 * p50 is 0.8806 (so it does trim the noise tail). For a median neighbourhood
 * (s_1 = 0.9246) the cut lands at 0.786, above the 95th percentile of the
 * unrelated-pair distribution (0.7638).
 */
export const VECTOR_MIN_SIMILARITY_REL = 0.85;

/**
 * Absolute noise floor. Nothing below this is admitted regardless of how weak
 * the best match was.
 *
 * 0.70 chosen from the measured unrelated-pair distribution: its median is
 * 0.6784 and its minimum 0.4677, so 0.70 sits just above the midpoint of pure
 * noise — while remaining 0.15 below the measured rank-1 p10 (0.8508), so it
 * cannot plausibly empty a healthy result set. Deliberately weak: in this
 * corpus the absolute axis has poor discriminative power (see (a) above), so
 * the absolute floor is a backstop and the relative floor does the work.
 */
export const VECTOR_MIN_SIMILARITY_ABS = 0.70;

export const VECTOR_MIN_SIMILARITY_REL_ENV = "SBC_VECTOR_MIN_SIMILARITY_REL";
export const VECTOR_MIN_SIMILARITY_ABS_ENV = "SBC_VECTOR_MIN_SIMILARITY_ABS";

/**
 * What the floor is allowed to DO (2026-09-03).
 *
 * The floor has always had two jobs bundled together: decide whether the whole
 * result set is noise (all rows below the cut -> keyword fallback), and drop
 * the individual rows below the cut. The first job is what bounds the blast
 * radius of a bad query. The second was never measured until the model-free
 * retrieval gate existed — and it costs recall: over 40 benchmark questions it
 * drops about 5 of every 25 rows and, with them, 2 of 87 expected sections and
 * 2 of 40 complete section sets (73.6% -> 71.3%).
 *
 *   "drop" (default) — today's behaviour, both jobs.
 *   "gate"           — the fallback decision only; rows are passed through
 *                      whenever at least one of them clears the cut.
 *
 * Default stays "drop" until an answer-quality run says otherwise: the gate
 * measures which sections REACH the model, not what the model does with five
 * extra marginal chunks.
 */
export const VECTOR_FLOOR_MODE_ENV = "SBC_VECTOR_FLOOR_MODE";
export type VectorFloorMode = "drop" | "gate";

export function resolveFloorMode(env: EnvReader, fallback: VectorFloorMode = "drop"): VectorFloorMode {
  const raw = (env(VECTOR_FLOOR_MODE_ENV) ?? "").trim().toLowerCase();
  return raw === "gate" || raw === "drop" ? raw : fallback;
}

/**
 * Read an override from the environment. Only a finite number in [0, 1] is
 * accepted; anything else falls back to the measured default rather than
 * silently disabling the floor.
 */
export function resolveFloor(env: EnvReader, key: string, fallback: number): number {
  const raw = env(key);
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

export interface SimilarityScored {
  similarity?: number | null;
}

export interface SimilarityFloorResult<T> {
  kept: T[];
  droppedCount: number;
  /** The absolute similarity value the relative floor resolved to, or null when there was no usable top match. */
  effectiveFloor: number | null;
  topSimilarity: number | null;
}

/**
 * Apply the two floors to an ordered match list.
 *
 * Contract:
 *  - `matches` is assumed to be ordered by descending similarity, which is what
 *    `match_sbc_documents` returns (`ORDER BY embedding <=> query_embedding`).
 *    The top similarity is taken as the maximum, not as element 0, so an
 *    unordered list cannot silently produce a wrong floor.
 *  - a match with a missing/non-numeric similarity is KEPT. The floor exists to
 *    remove content that is measurably far away, not to discard content whose
 *    distance the RPC did not report.
 *  - the effective cut is max(abs floor, rel * topSimilarity).
 *  - an empty input returns an empty result; the caller must treat an empty
 *    `kept` as "vector retrieval produced nothing" and fall back.
 */
export function applySimilarityFloor<T extends SimilarityScored>(
  matches: T[],
  relFloor: number = VECTOR_MIN_SIMILARITY_REL,
  absFloor: number = VECTOR_MIN_SIMILARITY_ABS,
  mode: VectorFloorMode = "drop",
): SimilarityFloorResult<T> {
  if (!Array.isArray(matches) || matches.length === 0) {
    return { kept: [], droppedCount: 0, effectiveFloor: null, topSimilarity: null };
  }

  let top: number | null = null;
  for (const m of matches) {
    const s = m?.similarity;
    if (typeof s === "number" && Number.isFinite(s)) {
      top = top === null ? s : Math.max(top, s);
    }
  }

  // No usable similarity anywhere: keep everything rather than blindly drop it.
  if (top === null) {
    return { kept: [...matches], droppedCount: 0, effectiveFloor: null, topSimilarity: null };
  }

  const cut = Math.max(absFloor, relFloor * top);
  const above = matches.filter((m) => {
    const s = m?.similarity;
    if (typeof s !== "number" || !Number.isFinite(s)) return true;
    return s >= cut;
  });

  // "gate": the cut still decides whether this result set is noise — an empty
  // `above` means every row failed it, and the caller falls back exactly as
  // before — but as long as ONE row clears it, the whole set is passed on.
  // `droppedCount` stays honest (it reports what "drop" would have removed),
  // so the caller's log line still says how much the floor disagreed with.
  const kept = mode === "gate" && above.length > 0 ? [...matches] : above;

  return {
    kept,
    droppedCount: matches.length - above.length,
    effectiveFloor: cut,
    topSimilarity: top,
  };
}
