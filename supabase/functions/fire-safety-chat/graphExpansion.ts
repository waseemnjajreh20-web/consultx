/**
 * Cross-reference graph expansion for fire-safety-chat: one hop of citation
 * traversal over `sbc_xref_edges`, composed into the model context as a
 * separate labelled block after the existing vector/keyword seed block.
 *
 * Pure data + pure logic (no Deno APIs, no I/O) so it can be unit-tested from
 * src/__tests__ and imported safely by the Edge Function — the same pattern
 * as ./retrievalPolicy.ts, ./chapterIndex.ts, ./promptContract.ts and
 * ./geminiResilience.ts.
 *
 * Created 2026-08-25 (P4, wave 1 — design/build only; wave 2, same day, wires
 * it in). index.ts's fetchSBCContextVector now imports this module and, when
 * retrievalEngine === "vector" and isGraphExpansionEnabled(Deno.env.get) is
 * true, runs selectExpansionTargets / composeContext against a real
 * `sbc_xref_edges` + `sbc_xref_indegree` + `sbc_documents` round trip built
 * from buildExpansionQuerySpec's output. That query, and everything
 * downstream of it, is wrapped in its own try/catch that fails OPEN to the
 * unexpanded seed-only context on any error — including the "relation does
 * not exist" error these tables produce in production today, since neither
 * table is provisioned there yet. See VectorRetrievalResult /
 * GRAPH_EXPANSION_HEADER in index.ts for the response-header contract.
 *
 * Provenance: docs/audits/graphrag-design-20260823.md, Sections 2.6-2.6.4
 * ("2.6 التركيب مع المسار المتجهي — لا استبداله" through
 * "2.6.4 عرض السياق — الفصل الصريح شرط سلامة"). Every constant, the hub-damp
 * formula, the score formula, the tie-break rule and the two block headers
 * below are copied from that document verbatim; none are invented here.
 *
 * ---------------------------------------------------------------------------
 * THE TWO INVARIANTS (design doc Section 2.6.3)
 * ---------------------------------------------------------------------------
 * Invariant 1 (budget — testable per query):
 *   total_context_chars(flag ON) <= total_context_chars(flag OFF)
 *   Enforced here by construction: the flag-OFF budget is
 *   PIPELINE_MAX_TOTAL_CONTEXT_CHARS (120,000, matching index.ts's existing
 *   `contextLimit`), and the flag-ON budget is carved out of the SAME total
 *   (SEED_BUDGET_CHARS 90,000 + EXPANSION_BUDGET_CHARS 30,000 = 120,000), not
 *   added on top. assertBudgetInvariants() below enforces the arithmetic at
 *   module load; composeContext() enforces the character-count ceiling at
 *   call time, defensively, even though the arithmetic guarantees it.
 *
 * Invariant 2 (score — mathematical property, not a single test case):
 *   score(expanded) = DECAY * similarity(parent seed) * hub_damp(target)
 *   Since DECAY (0.6) < 1 and 0 <= hub_damp(t) <= 1 for every t, and the
 *   formula is only ever evaluated for a parent similarity in (0, 1],
 *   score(expanded) < score(parent seed) ALWAYS. An expanded section can
 *   never outrank — and can therefore never displace — the seed that reached
 *   it. See selectExpansionTargets and the property-based test in
 *   src/__tests__/graphExpansion.test.ts.
 *
 *   The design doc states the hub_damp range as (0, 1]; this implementation
 *   widens the LOWER bound to 0 for one degenerate input only — a corrupt
 *   in_degree of +Infinity, where the formula's limit is 0 (see hubDamp).
 *   That widening cannot weaken Invariant 2: a score of 0 is still strictly
 *   below any parent similarity, which is always > 0 here.
 *
 *   IEEE-754 footnote: `DECAY * s < s` is exact real-number arithmetic, but in
 *   doubles it fails in one degenerate corner — when s is within a few ULPs of
 *   Number.MIN_VALUE (~5e-324), 0.6 * s rounds back UP to s. pgvector
 *   similarities never live there, but "mathematically always" must mean
 *   always, so selectExpansionTargets carries an explicit post-condition that
 *   drops any candidate whose computed score is not strictly below its parent
 *   seed's similarity. Invariant 2 therefore holds for every double, not just
 *   for realistic ones.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FLAG NAME IS SEPARATE FROM ADVISORY_VECTOR_RETRIEVAL_ENABLED
 * ---------------------------------------------------------------------------
 * Graph expansion is a hop taken AFTER seeds are already chosen, by whichever
 * engine chose them (design doc 2.6.1: "البذرة قد تكون متجهية أو مفتاحية...
 * لا يعتمد هذا التصميم على تهيئة لم تُنجَز بعد" — the seed may be vector or
 * keyword; expansion does not depend on retrievalPolicy's vector rollout
 * having landed). A single combined flag would couple two independently
 * reversible decisions. This flag's own kill switch stays exact-string-"1"
 * for the same life-safety reason retrievalPolicy.ts states for its flag: a
 * typo in an env var must never silently enable a path that changes what
 * gets put in front of the model.
 */

// ===========================================================================
// 1. ADVISORY GRAPH EXPANSION FLAG (default OFF; nothing reads it yet)
// ===========================================================================

export const ADVISORY_GRAPH_FLAG_ENV = "ADVISORY_GRAPH_EXPANSION_ENABLED";

/**
 * Response header index.ts emits when — and only when — graph expansion
 * actually ran for this request (flag on, no fail-open fallback triggered).
 * Value is `on:<n>` where n is the number of expansion entries actually
 * composed into the context (composeContext's `expansionEntries`). Absent
 * entirely when the flag is off or the attempt fell back, matching
 * RETRIEVAL_ENGINE_HEADER's pattern in ./retrievalPolicy.ts.
 */
export const GRAPH_EXPANSION_HEADER = "X-Graph-Expansion";

export type EnvReader = (key: string) => string | undefined;

/**
 * True only for the exact string "1". Everything else — unset, "", "0",
 * "true", "TRUE", "yes", a trailing/leading space — is OFF. Identical
 * semantics to retrievalPolicy.ts's isAdvisoryVectorEnabled, deliberately: a
 * typo cannot enable a life-safety retrieval path.
 */
export function isGraphExpansionEnabled(env: EnvReader): boolean {
  return env(ADVISORY_GRAPH_FLAG_ENV) === "1";
}

// ===========================================================================
// 2. DESIGN CONSTANTS (graphrag-design-20260823.md Sections 2.6.2 - 2.6.3, verbatim)
// ===========================================================================

/** How many citation hops are followed. G1 ships 1; a 2nd hop is G2, behind its own flag and gate (design doc 2.6.2). */
export const HOP_MAX = 1;

/** Of the retrieved seeds, only the top N (by similarity) are used as expansion sources. */
export const SEEDS_EXPANDED = 6;

/** Per seed, at most this many `section_ref` edges are followed. */
export const PER_SEED_EDGES = 4;

/** Across ALL seeds combined, at most this many distinct target sections are admitted as expansions. */
export const GLOBAL_EXPANSION_CAP = 8;

/** score(expanded) = DECAY * similarity(parent seed) * hub_damp(target). */
export const DECAY = 0.6;

/** SEED_K when the flag is ON (down from 25 OFF) — part of the budget carve, not an addition. */
export const SEED_K_EXPANDED = 18;

/** Seed block budget when the flag is ON: 75% of the total, in characters. */
export const SEED_BUDGET_CHARS = 90_000;

/** Expansion block budget when the flag is ON: 25% of the total, in characters. */
export const EXPANSION_BUDGET_CHARS = 30_000;

/** SEED_BUDGET_CHARS + EXPANSION_BUDGET_CHARS. The flag-ON total context budget — no larger than flag-OFF. */
export const TOTAL_BUDGET_CHARS = 120_000;

/**
 * The existing, un-flagged pipeline's total context budget — index.ts:1803's
 * `contextLimit`. TOTAL_BUDGET_CHARS must equal this exactly: graph expansion
 * carves the existing budget, it does not enlarge it (Invariant 1).
 */
export const PIPELINE_MAX_TOTAL_CONTEXT_CHARS = 120_000;

/**
 * Runtime proof that the budget constants above are still internally
 * consistent. Exported so tests can call it directly; also invoked once at
 * module load (below) so any future edit that desyncs these constants fails
 * closed — at import time, for every importer — rather than shipping a
 * silently widened context budget.
 */
export function assertBudgetInvariants(): true {
  if (SEED_BUDGET_CHARS + EXPANSION_BUDGET_CHARS !== TOTAL_BUDGET_CHARS) {
    throw new Error(
      `graphExpansion budget invariant violated: SEED_BUDGET_CHARS (${SEED_BUDGET_CHARS}) + ` +
        `EXPANSION_BUDGET_CHARS (${EXPANSION_BUDGET_CHARS}) !== TOTAL_BUDGET_CHARS (${TOTAL_BUDGET_CHARS})`,
    );
  }
  if (TOTAL_BUDGET_CHARS !== PIPELINE_MAX_TOTAL_CONTEXT_CHARS) {
    throw new Error(
      `graphExpansion budget invariant violated: TOTAL_BUDGET_CHARS (${TOTAL_BUDGET_CHARS}) !== ` +
        `PIPELINE_MAX_TOTAL_CONTEXT_CHARS (${PIPELINE_MAX_TOTAL_CONTEXT_CHARS}) — flag ON would exceed flag OFF`,
    );
  }
  return true;
}

assertBudgetInvariants();

// ===========================================================================
// 3. HUB DAMPING (design doc Section 2.6.2 — "كبح المراكز")
// ===========================================================================

/**
 * hub_damp(t) = 1 / (1 + ln(1 + in_degree(t)))
 *
 * Applied ONLY to expansion candidates, never to seeds: a heavily-cited
 * section (Section 903.3.1.1 measured in_degree = 159) stays fully reachable
 * as a seed with no damping at all — it is very likely the right answer to a
 * sprinkler question. What this damps is its ability to get pulled in as an
 * EXPANSION on an unrelated question just because many other sections cite
 * it. Design doc 2.6.2: "لا نُخفي المركز؛ نمنع جاذبيته العمياء."
 *
 * Guards, and why they point in two different directions — NaN never
 * propagates into a score that feeds an ORDER BY, but the two malformed
 * inputs do not mean the same thing:
 *  - NaN, a negative degree, or -Infinity means "this row is unreadable". The
 *    safe reading is "unknown", which degrades to 0 (undamped): the candidate
 *    competes on its parent's similarity alone, exactly as an uncited target
 *    would. Failing OPEN here at most admits a normal candidate.
 *  - +Infinity means "cited by unboundedly many sections" — the mega-hub case
 *    this damping exists to contain. Reading THAT as "undamped" would hand a
 *    corrupt row the maximum pull, the precise opposite of the rule's intent
 *    ("لا نُخفي المركز؛ نمنع جاذبيته العمياء"). It therefore takes the
 *    formula's own limit, 1/(1+ln(1+inf)) = 0: still reachable as a seed,
 *    with zero blind pull as an expansion. Invariant 2 is unaffected — see
 *    the range note in the file header.
 *
 * Reference points from the design doc: hub_damp(1) ~= 0.59,
 * hub_damp(10) ~= 0.29, hub_damp(159) ~= 0.16, hub_damp(0) = 1.
 */
export function hubDamp(inDegree: number): number {
  if (!Number.isFinite(inDegree)) {
    return inDegree === Number.POSITIVE_INFINITY ? 0 : 1;
  }
  const safeDegree = inDegree > 0 ? inDegree : 0;
  return 1 / (1 + Math.log(1 + safeDegree));
}

// ===========================================================================
// 4. TYPES
// ===========================================================================

/**
 * sbc_documents.id. Modelled as `number` (not `bigint`): this corpus has
 * ~4,630 rows, far inside Number.MAX_SAFE_INTEGER, and every other pure
 * module in this Edge Function (see the digest's match-object shape in
 * index.ts) treats it the same way.
 */
export type DocId = number;

/**
 * Mirrors the vector match object index.ts builds context from
 * (index.ts:1797-1828 — file_name, section_number, page_start, page_end,
 * content — plus similarity, the score input). `id` is the doc's
 * sbc_documents.id: the only key graph expansion traverses on, regardless of
 * whether this seed came from the vector or the keyword engine (design doc
 * 2.6.1).
 */
export interface SeedMatch {
  id: DocId;
  file_name: string;
  section_number: string | null;
  page_start: number | null;
  page_end: number | null;
  /** May be absent for a keyword-engine seed; expansion degrades gracefully — see selectExpansionTargets. */
  similarity?: number | null;
  content: string;
}

/**
 * One row of `sbc_xref_edges` (design doc Section 2.7's proposed schema).
 * `edge_kind` mirrors the table's CHECK constraint; `cue` is free text in the
 * schema (no CHECK), documented there as one of: 'in_accordance_with' |
 * 'see' | 'comply_with' | 'required_by' | 'specified_in' | 'bare'.
 */
export interface XrefEdge {
  src_doc_id: DocId;
  tgt_doc_id: DocId;
  tgt_code: string;
  tgt_section: string;
  edge_kind: "section_ref" | "cross_code" | "table_ref" | "section_list";
  cue: string;
  /** The literal citation text the edge was extracted from (design doc 2.7: "ليس ترفاً"). */
  evidence: string;
}

/** `sbc_xref_indegree.doc_id -> in_degree`, computed once at build time (design doc 2.6.2), not per query. */
export type IndegreeMap = Map<DocId, number>;

/** One admitted expansion: a target section reached from a seed by exactly one citation edge. */
export interface ExpansionCandidate {
  docId: DocId;
  score: number;
  parentSeedId: DocId;
  parentSection: string | null;
  tgtSection: string;
  evidence: string;
}

/** The subset of a document's fields composeContext needs to render an expansion entry. */
export interface DocContent {
  file_name: string;
  section_number: string | null;
  page_start: number | null;
  page_end: number | null;
  content: string;
}

/** Lookup composeContext uses to resolve an ExpansionCandidate.docId to its renderable content. */
export type ContentById = Map<DocId, DocContent>;

export interface ComposeContextResult {
  contextText: string;
  totalChars: number;
  seedChars: number;
  expansionChars: number;
  /**
   * Count of expansion entries actually rendered into contextText — 0 whenever
   * expansionChars is 0 (no candidates, none resolvable, or none fit the
   * budget). Added for wave 2's wiring: index.ts reports this as the `<n>` in
   * the X-Graph-Expansion: "on:<n>" response header (see GRAPH_EXPANSION_HEADER
   * above). Purely additive — every existing caller that destructures only the
   * four original fields is unaffected.
   */
  expansionEntries: number;
}

/** The single-round-trip query index.ts will issue against sbc_xref_edges once wired (wave 2). */
export interface ExpansionQuerySpec {
  srcDocIds: DocId[];
  edgeKind: "section_ref";
}

// ===========================================================================
// 5. SEED RANKING (shared by selectExpansionTargets and buildExpansionQuerySpec)
// ===========================================================================

function usableSimilarity(seed: SeedMatch): number | null {
  const s = seed.similarity;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

/**
 * Similarity DESC, tie-break id ASC (design doc 2.6.3's tie-break rule,
 * applied here to seed selection as well as to final candidate ordering). A
 * seed with no usable similarity (keyword engine — see SeedMatch) sorts
 * after every seed that has one, but is NOT dropped: "top by similarity"
 * must still surface it if fewer than SEEDS_EXPANDED seeds carry a score.
 */
function compareSeedsForExpansion(a: SeedMatch, b: SeedMatch): number {
  const sa = usableSimilarity(a);
  const sb = usableSimilarity(b);
  if (sa === null && sb === null) return a.id - b.id;
  if (sa === null) return 1;
  if (sb === null) return -1;
  if (sb !== sa) return sb - sa;
  return a.id - b.id;
}

function topSeedsForExpansion(seeds: SeedMatch[]): SeedMatch[] {
  return [...seeds].sort(compareSeedsForExpansion).slice(0, SEEDS_EXPANDED);
}

// ===========================================================================
// 6. EXPANSION SELECTION (design doc Sections 2.6.2 - 2.6.3)
// ===========================================================================

/**
 * The design doc's deterministic tie-break, verbatim: `ORDER BY score DESC,
 * sbc_documents.id ASC` (2.6.3). Applied ONLY to the final, already-deduplicated
 * list, where docIds are distinct and scores are finite by construction (hubDamp
 * never returns NaN and parentSimilarity is checked finite) — so on that input it
 * is a total order and the result cannot depend on the input array's order.
 *
 * It is NOT total before deduplication: two edges from the same seed to the same
 * target score identically and share a docId. Everything upstream of the final
 * sort therefore uses compareCandidatesTotal below, not this.
 */
function compareCandidates(a: ExpansionCandidate, b: ExpansionCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.docId - b.docId;
}

/**
 * A TOTAL order over candidates, used everywhere a duplicate target is possible:
 * collapsing several edges into one target, both within a single seed and across
 * seeds.
 *
 * Why the extra keys past docId are load-bearing, not belt-and-braces:
 * `sbc_xref_edges`'s uniqueness is `UNIQUE (src_doc_id, tgt_doc_id, tgt_section,
 * edge_kind)` (migration 20260824100004_sbc_xref_graph.sql), NOT
 * `(src_doc_id, tgt_doc_id, edge_kind)`. Two rows may therefore share a source
 * AND a target while differing in `tgt_section` — which is the normal case, not
 * a corrupt one, because one chunk can define several nested sections
 * (`sbc_section_defs` is keyed `(doc_id, section)`), so a citation to 903.3.1
 * and a citation to 903.3.1.1 can resolve to the same target chunk. Both rows
 * carry a different literal `evidence`. Their scores are identical (hub_damp
 * depends on the target alone) and their docIds are equal, so score/docId alone
 * cannot decide which evidence string reaches the model. Postgres returns rows
 * in unspecified order without an ORDER BY, so without these last two keys the
 * composed context would not be reproducible across two identical queries —
 * breaking design doc 2.6.3's stated reason for having a tie-break at all
 * ("بلا هذا لا يوجد اختبار متطابق بايتاً").
 *
 * parentSeedId ASC comes first among the tie-breaks: because seeds were already
 * ordered similarity DESC, id ASC, it means "the better-ranked parent keeps the
 * target". tgtSection then evidence are compared by UTF-16 code unit (`<`), not
 * localeCompare — a locale-sensitive comparison would make the output depend on
 * the Edge runtime's ICU locale, which is exactly the kind of hidden input this
 * tie-break exists to eliminate.
 */
function compareCandidatesTotal(a: ExpansionCandidate, b: ExpansionCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.docId !== b.docId) return a.docId - b.docId;
  if (a.parentSeedId !== b.parentSeedId) return a.parentSeedId - b.parentSeedId;
  if (a.tgtSection !== b.tgtSection) return a.tgtSection < b.tgtSection ? -1 : 1;
  if (a.evidence !== b.evidence) return a.evidence < b.evidence ? -1 : 1;
  return 0;
}

/** Keeps the single best candidate per distinct target doc, by compareCandidatesTotal. */
function collapseByTarget(candidates: Iterable<ExpansionCandidate>): ExpansionCandidate[] {
  const bestByTarget = new Map<DocId, ExpansionCandidate>();
  for (const c of candidates) {
    const existing = bestByTarget.get(c.docId);
    if (!existing || compareCandidatesTotal(c, existing) < 0) {
      bestByTarget.set(c.docId, c);
    }
  }
  return [...bestByTarget.values()];
}

/**
 * One hop of citation traversal from the top SEEDS_EXPANDED seeds, scored,
 * capped, and deduplicated to distinct target documents.
 *
 * Rules, each traced to the design doc:
 *  - only the top SEEDS_EXPANDED seeds (similarity DESC, id ASC) are used as
 *    expansion sources (2.6.2 SEEDS_EXPANDED).
 *  - only `edge_kind === 'section_ref'` edges are followed (2.6.1's scope for G1).
 *  - a seed with no usable similarity contributes NO expansions: the score
 *    formula has nothing to decay from, and inventing a value (e.g. 0) would
 *    make Invariant 2 ("score(expanded) < score(parent)") either vacuous or
 *    false at the boundary. This degrades gracefully rather than guessing.
 *  - per seed, at most PER_SEED_EDGES candidates survive, ranked by the SAME
 *    score/id ordering used for the final list (2.6.2 PER_SEED_EDGES). Several
 *    edges from one seed into the SAME target are collapsed to one BEFORE that
 *    cap is applied, so a seed that cites one chunk under four different
 *    section numbers does not spend all four of its slots on a single distinct
 *    section. The cap governs how much CONTEXT one seed may pull in, and
 *    context is spent per distinct chunk, not per edge row — 2.6.2 derives the
 *    value of 4 from exactly that budget argument ("يمنع مقطعاً واحداً بـ23
 *    حافة من ابتلاع الميزانية"). Collapsing after the cap instead would let a
 *    duplicated citation silently shrink the expansion set.
 *  - a target that is already one of the INPUT seeds (any of them, not just
 *    the top 6 used for traversal) is excluded — it would otherwise appear
 *    twice in the composed context, once as a seed and once as an expansion.
 *  - globally, at most GLOBAL_EXPANSION_CAP DISTINCT target docs are kept;
 *    when the same target is reached from more than one seed, the
 *    higher-scoring edge to it wins (2.6.2 GLOBAL_EXPANSION_CAP).
 *  - final ordering is score DESC, docId ASC — deterministic, matching
 *    `ORDER BY score DESC, sbc_documents.id ASC` (2.6.3).
 *
 * Exactly one hop is taken (HOP_MAX = 1): edges are read once, from the seed
 * ids only. A target admitted here is never used as a source for a further
 * traversal, so an edge chain seed -> A -> B can only ever surface A. A second
 * hop is G2, behind its own flag and gate (2.6.2).
 */
export function selectExpansionTargets(
  seeds: SeedMatch[],
  edges: XrefEdge[],
  indegree: IndegreeMap,
): ExpansionCandidate[] {
  const allSeedIds = new Set(seeds.map((s) => s.id));
  const topSeeds = topSeedsForExpansion(seeds);

  const perSeedCandidates: ExpansionCandidate[] = [];
  for (const seed of topSeeds) {
    const parentSimilarity = usableSimilarity(seed);
    if (parentSimilarity === null || parentSimilarity <= 0) continue;

    const seedEdges = edges.filter(
      (e) => e.src_doc_id === seed.id && e.edge_kind === "section_ref" && !allSeedIds.has(e.tgt_doc_id),
    );

    const scored: ExpansionCandidate[] = [];
    for (const e of seedEdges) {
      const score = DECAY * parentSimilarity * hubDamp(indegree.get(e.tgt_doc_id) ?? 0);
      // Invariant 2, enforced rather than assumed. In real arithmetic this can
      // never fail (DECAY < 1, hub_damp <= 1, parentSimilarity > 0); in
      // doubles it fails only for a parent similarity within a few ULPs of
      // Number.MIN_VALUE, where 0.6 * s rounds back up to s. Dropping such a
      // candidate is the only outcome that keeps "an expansion can never
      // outrank its parent seed" true for every representable input.
      if (!(score < parentSimilarity)) continue;
      scored.push({
        docId: e.tgt_doc_id,
        score,
        parentSeedId: seed.id,
        parentSection: seed.section_number,
        tgtSection: e.tgt_section,
        evidence: e.evidence,
      });
    }

    // Collapse this seed's duplicate edges into one candidate per distinct
    // target BEFORE the per-seed cap, so PER_SEED_EDGES bounds distinct
    // sections rather than raw edge rows (see the doc comment above).
    const distinct = collapseByTarget(scored);
    distinct.sort(compareCandidatesTotal);
    perSeedCandidates.push(...distinct.slice(0, PER_SEED_EDGES));
  }

  // Distinct target docs: keep the best-scoring edge into each target. When
  // two parents reach the same target with the SAME score (only possible when
  // both parents carry the same similarity, since hub_damp depends on the
  // target alone), the lower parentSeedId wins — stated explicitly rather than
  // left to fall out of iteration order, so the result cannot depend on the
  // order rows arrive from the database.
  const deduped = collapseByTarget(perSeedCandidates);

  return deduped.sort(compareCandidates).slice(0, GLOBAL_EXPANSION_CAP);
}

// ===========================================================================
// 7. CONTEXT COMPOSITION (design doc Section 2.6.4)
// ===========================================================================

/** Verbatim from index.ts:1802 (the digest). Unchanged so the seed block matches production byte-for-byte. */
export const SEED_BLOCK_HEADER = "\n=== SBC REFERENCE DOCUMENTS (Vector Search Results) ===\n";

/** Verbatim from graphrag-design-20260823.md Section 2.6.4. Exported so the test asserts the exact string, not a substring. */
export const EXPANSION_BLOCK_HEADER =
  "\n=== CROSS-REFERENCED SECTIONS (reached by citation from the passages above) ===\n";

/**
 * Ceiling on the literal citation text rendered in an expansion entry's
 * header line. Real evidence is a citation phrase of a few dozen characters
 * ("in accordance with Section 903.3.1.1"); this only bounds a malformed or
 * runaway `sbc_xref_edges.evidence` value so one row cannot spend the whole
 * expansion budget on its own header line.
 */
export const MAX_EVIDENCE_CHARS = 300;

/**
 * Corpus text is DATA, and it is being interpolated into the same
 * `=== ... ===` header grammar that separates the two labelled blocks Section
 * 2.6.4 requires. A section number, file name or citation snippet that itself
 * contains a newline or a run of "=" could therefore forge a block header and
 * make an expansion look like a seed — defeating the exact safety separation
 * the labelled blocks exist to provide (2.6.4, reason 1: an expanded passage
 * did not match the question semantically, and the model must be able to tell).
 *
 * Neutralised minimally, so the text stays the literal citation the design doc
 * asks for: any run of whitespace (newlines and tabs included) collapses to a
 * single space, and any run of three-or-more "=" collapses to "==", which can
 * never open or close a header. Ordinary evidence passes through untouched.
 */
function sanitizeHeaderField(value: string, maxChars: number): string {
  const flattened = value.replace(/\s+/g, " ").replace(/={3,}/g, "==").trim();
  return flattened.length > maxChars ? `${flattened.slice(0, maxChars)}…` : flattened;
}

/**
 * Verbatim from index.ts:1808 (the digest), including its
 * `similarity?.toFixed(3)` behaviour: when similarity is missing this
 * interpolates the literal string "undefined", exactly like production does
 * today. Reproduced on purpose so the seed block this function emits is
 * diffable against the real one, not merely similar to it — which is also why
 * sanitizeHeaderField is deliberately NOT applied here: the seed block must
 * stay byte-identical to the block production already emits.
 */
function seedEntryText(seed: SeedMatch): string {
  const section = seed.section_number || "N/A";
  const similarity = seed.similarity?.toFixed(3);
  return `\n=== ${seed.file_name} | Section: ${section} | Pages: ${seed.page_start}-${seed.page_end} | Similarity: ${similarity} ===\n${seed.content}\n`;
}

/**
 * Per Section 2.6.4: "كل واحدة تحمل: القسم المصدر، القسم الهدف، ونص الإحالة
 * الحرفي" — every expansion entry carries the source section, the target
 * section, and the literal evidence citation text.
 */
/**
 * True only when this candidate's target text can actually be shown. A
 * candidate whose `contentById` row is missing or blank — a doc deleted between
 * the edge query and the content fetch, or a corrupt chunk — would otherwise
 * render a fully-labelled "cross-referenced section" header with NOTHING under
 * it, asserting to the model that Section X was cited and is reproduced below
 * while showing it no text at all. That is the same failure composeContext
 * already refuses at block granularity (never emit an empty labelled block),
 * applied at entry granularity: silence is safer than an empty citation the
 * model may fill in for itself.
 */
function isRenderableExpansion(candidate: ExpansionCandidate, contentById: ContentById): boolean {
  const content = contentById.get(candidate.docId)?.content;
  return typeof content === "string" && content.trim().length > 0;
}

function expansionEntryText(candidate: ExpansionCandidate, doc: DocContent | undefined): string {
  const fileName = sanitizeHeaderField(doc?.file_name ?? "UNKNOWN", 200) || "UNKNOWN";
  const content = doc?.content ?? "";
  const tgtSection = sanitizeHeaderField(candidate.tgtSection, 100) || "N/A";
  const fromSection = sanitizeHeaderField(candidate.parentSection || "N/A", 100) || "N/A";
  const evidence = sanitizeHeaderField(candidate.evidence, MAX_EVIDENCE_CHARS);
  return `\n=== ${fileName} | Section: ${tgtSection} | Cited from Section: ${fromSection} | Evidence: "${evidence}" ===\n${content}\n`;
}

/**
 * Whole-entry-granularity truncation: an entry that would cross the budget is
 * dropped whole, never sliced mid-entry — same semantics as index.ts:1809. A
 * mid-entry slice would hand the model a passage cut off mid-sentence and
 * still labelled as a complete code section, so it is not done anywhere in
 * this module, not even on a defensive path.
 */
function buildBudgetedBlock(
  header: string,
  entries: string[],
  budgetChars: number,
): { text: string; entriesIncluded: number } {
  let text = header;
  let entriesIncluded = 0;
  for (const entry of entries) {
    if (text.length + entry.length > budgetChars) break;
    text += entry;
    entriesIncluded++;
  }
  return { text, entriesIncluded };
}

const EMPTY_BLOCK = { text: "", entriesIncluded: 0 };

/**
 * Builds the full context string: the seed block first (existing format,
 * existing header), then — only if at least one expansion entry actually fits
 * — the cross-referenced block under its own labelled header, per Section
 * 2.6.4. Seeds are NEVER trimmed to make room for expansions; only the
 * expansion block is ever cut.
 *
 * The total ceiling is enforced BEFORE composing rather than by slicing the
 * result afterwards: the expansion block's budget is
 * min(EXPANSION_BUDGET_CHARS, TOTAL_BUDGET_CHARS - seedChars). With the
 * constants as designed that min is always EXPANSION_BUDGET_CHARS
 * (90,000 + 30,000 = 120,000 — see assertBudgetInvariants), so the second term
 * is defence against a future constant edit, not live behaviour. Doing it this
 * way keeps the ceiling entry-granular: the total can never exceed
 * TOTAL_BUDGET_CHARS, and no entry is ever emitted half-written.
 *
 * A labelled expansion header with nothing under it is never emitted: an empty
 * "cross-referenced sections" block tells the model a category exists and then
 * shows it nothing, which is worse than silence. The same rule applies per
 * entry — an expansion whose target text is missing or blank in `contentById`
 * is dropped rather than rendered as a headed, empty citation (see
 * isRenderableExpansion).
 *
 * ACCEPTED RESIDUAL RISK — the seed block is deliberately NOT sanitized.
 * seedEntryText must stay byte-identical to the block index.ts already emits,
 * so corpus text inside a SEED can still contain the `=== ... ===` grammar,
 * exactly as it can in production today. The asymmetry is safe in the only
 * direction it can act: the seed block is emitted FIRST, so a seed whose text
 * forges the expansion header can only make later SEED text read as
 * cross-referenced — labelling authoritative material as merely cited, the
 * conservative direction. It can never promote an expansion to a seed, because
 * expansions are emitted after the expansion header and every field they
 * interpolate is sanitized. Making the reverse direction impossible would mean
 * altering the production seed block, which is a change to index.ts's output,
 * not to this module.
 *
 * Pure: reads no env var. The caller decides whether to invoke this at all
 * (isGraphExpansionEnabled) — with the flag OFF, this function is simply
 * never called, so its behaviour cannot affect flag-OFF output.
 */
export function composeContext(
  seeds: SeedMatch[],
  expansions: ExpansionCandidate[],
  contentById: ContentById,
): ComposeContextResult {
  const seedBlock = buildBudgetedBlock(SEED_BLOCK_HEADER, seeds.map(seedEntryText), SEED_BUDGET_CHARS);

  const expansionBudget = Math.max(
    0,
    Math.min(EXPANSION_BUDGET_CHARS, TOTAL_BUDGET_CHARS - seedBlock.text.length),
  );

  // Candidates whose target text could not be resolved are dropped before the
  // block is built, so they cannot produce a headed-but-empty citation and
  // cannot cause an otherwise-empty labelled block to be emitted.
  const renderable = expansions.filter((c) => isRenderableExpansion(c, contentById));

  const expansionBlock =
    renderable.length > 0 && expansionBudget >= EXPANSION_BLOCK_HEADER.length
      ? buildBudgetedBlock(
          EXPANSION_BLOCK_HEADER,
          renderable.map((c) => expansionEntryText(c, contentById.get(c.docId))),
          expansionBudget,
        )
      : EMPTY_BLOCK;

  const expansionText = expansionBlock.entriesIncluded > 0 ? expansionBlock.text : "";
  const contextText = seedBlock.text + expansionText;

  return {
    contextText,
    totalChars: contextText.length,
    seedChars: seedBlock.text.length,
    expansionChars: expansionText.length,
    expansionEntries: expansionText.length > 0 ? expansionBlock.entriesIncluded : 0,
  };
}

// ===========================================================================
// 8. QUERY SPEC (for wave 2's wiring into index.ts — NOT executed here)
// ===========================================================================

/**
 * The single round-trip index.ts will issue against `sbc_xref_edges` once
 * this module is wired in (wave 2, out of scope for this file): one query,
 * `WHERE src_doc_id = ANY(srcDocIds) AND edge_kind = 'section_ref'`, covering
 * all SEEDS_EXPANDED sources at once rather than one query per seed. This
 * function only builds that spec; it performs no I/O itself.
 */
export function buildExpansionQuerySpec(seeds: SeedMatch[]): ExpansionQuerySpec {
  const ids = [...new Set(topSeedsForExpansion(seeds).map((s) => s.id))];
  return { srcDocIds: ids, edgeKind: "section_ref" };
}
