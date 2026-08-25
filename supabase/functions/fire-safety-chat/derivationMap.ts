/**
 * Derivation map for fire-safety-chat (P6, reasoning layer).
 *
 * Pure curated data + pure logic (no Deno-specific APIs, no I/O) so it can be
 * unit-tested from vitest and imported safely by the Edge Function — same
 * pattern as ./queryAnalysis.ts, ./retrievalPolicy.ts and ./chapterIndex.ts.
 *
 * Created 2026-08-25 (P6). Provenance corrected 2026-08-25 (P6 review).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * DERIVATION_MAP is a curated set of RETRIEVAL-TARGETING HINTS: "if the
 * question looks like X, the section(s) that usually answer it are worth
 * pulling into context." It is NOT a citation source, NOT a statement of what
 * the code requires, and NOT text to quote to a user. Every `why` below is
 * written as a reason to RETRIEVE a section, never as an assertion that the
 * section requires anything — no thresholds, no ratings, no dimensions are
 * asserted here. The answer still comes from the retrieved code text.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE — where each section number and each code attribution comes from
 * ---------------------------------------------------------------------------
 * Curated from two in-repo sources, both read directly during curation:
 *
 *   (a) The three decision trees under
 *       data/consultx_brain/full_corpus/synthesis/decision_trees/
 *       (mirrored at generated/consultx_brain_full/synthesis/decision_trees/):
 *         - sprinkler-required-decision.json  (id sprinkler-required-decision-tree)
 *         - egress-design-checklist.json      (id egress-design-checklist-tree)
 *         - group-m-fire-protection.json      (id group-m-fire-protection-decision-tree)
 *       Each tree carries `not_legal_source: true` and its own header note
 *       saying the code text must still be cited verbatim from sources. Their
 *       `source_refs` / `relation_refs` arrays are what this map treats as
 *       CONFIRMED: those ids name BOTH the section number AND the code volume
 *       (e.g. "sbc-801-section-903.2.7", "sbc-201-section-309").
 *
 *   (b) The eight conflict-trigger lines in promptContract.ts
 *       (getAnalysisPrompt, Section VI trigger list). Only one of those lines
 *       names a code volume explicitly ("SBC 201 Section 403.1"); the rest
 *       give a bare number, so they confirm the NUMBER but not the CODE.
 *
 * CODE ATTRIBUTION IS LOAD-BEARING AND WAS THE MAIN CURATION DEFECT FIXED IN
 * REVIEW. Both codes contain a chapter 9 (fire protection) and a chapter 10
 * (means of egress) — see chapterIndex.ts — so a section number alone does not
 * identify the volume. The repo's own decision-tree corpus attributes every
 * 903.x / 907.x sprinkler-and-alarm trigger and every chapter-10 egress
 * section to SBC 801, and the occupancy-classification (chapter 3), special-
 * occupancy (chapter 4) and heights-and-areas (chapter 5) sections to SBC 201.
 * This map now follows that attribution. An earlier draft filed the chapter 9
 * and chapter 10 entries under SBC 201 while citing these same trees as
 * CONFIRMED; that was wrong and is corrected here.
 *
 * The per-occupancy sprinkler trigger subsections ARE recoverable from
 * sprinkler-required-decision.json's relation ids and are used directly:
 *   903.2.1 assembly, 903.2.3 educational, 903.2.4 factory,
 *   903.2.5 high-hazard, 903.2.6 institutional, 903.2.7 mercantile,
 *   903.2.8 residential, 903.2.9 storage, 903.2.10 underground,
 *   903.2.11 high-rise.
 * That corpus lists no Group B occupancy trigger subsection, so the Group B
 * entry points at the parent 903.2 rather than guessing a child.
 *
 * Every chapter number implied by every section below was checked against the
 * measured chapter sets in chapterIndex.ts (SBC 201: 1-33 and 35; SBC 801:
 * 1-12, 20-39, 50-51, 53-67 and 80). src/__tests__/derivationMap.test.ts
 * re-runs that check against an independent fixture on every test run.
 *
 * THIS MAP REQUIRES HUMAN ENGINEERING REVIEW BEFORE ADVISORY_QUERY_DERIVATION_ENABLED
 * SHIPS ON. Entries marked "not independently confirmed" are extrapolations
 * from the numbering pattern, not measurements. Ship-readiness requires a
 * licensed engineer to spot-check each targetSections entry against the actual
 * SBC 201 / SBC 801 text before the flag is turned on in any environment a
 * real user can reach.
 */

// ===========================================================================
// 1. FLAG
// ===========================================================================

/** Same shape as Deno.env.get — injected so this module never touches Deno. */
export type EnvReader = (key: string) => string | undefined;

export const DERIVATION_FLAG_ENV = "ADVISORY_QUERY_DERIVATION_ENABLED";

/** True only for the exact string "1". Anything else — unset, "0", "true" — is OFF. */
export function isDerivationEnabled(env: EnvReader): boolean {
  return env(DERIVATION_FLAG_ENV) === "1";
}

// ===========================================================================
// 2. TYPES
// ===========================================================================

export interface DerivationEntry {
  occupancy: string | "*";
  questionTypes: string[];
  targetSections: { code: "SBC201" | "SBC801"; section: string; why: string }[];
}

export interface DerivedSection {
  code: string;
  section: string;
  why: string;
}

// ===========================================================================
// 3. DERIVATION_MAP
// ===========================================================================
//
// Ordered deliberately: occupancy-specific entries first (in the order below;
// see deriveTargetSections for how order becomes priority), then wildcard
// ("*") entries.
//
// Occupancy classification numbers: 309 = Mercantile is CONFIRMED
// (sbc-201-section-309) and 302 is CONFIRMED (sbc-201-section-302). The
// sibling group numbers (303 A, 304 B, 305 E, 306 F, 307 H, 308 I, 310 R,
// 311 S) extrapolate the Chapter 3 sequence around those two anchors and are
// flagged per-entry as not independently confirmed.

const QT = {
  design: "completed_design_review",
  audit: "drawing_compliance_audit",
  specific: "specific_code_question",
  classification: "occupancy_classification_query",
  noncompliance: "non_compliance_investigation",
} as const;

export const DERIVATION_MAP: DerivationEntry[] = [
  // --- Occupancy-specific: classification chapter + the confirmed sprinkler trigger ---
  {
    occupancy: "A",
    questionTypes: [QT.classification, QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC201", section: "303", why: "Retrieve for Group A (Assembly) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing." },
      { code: "SBC801", section: "903.2.1", why: "Retrieve the Group A automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-1-assembly-trigger in sprinkler-required-decision.json." },
    ],
  },
  {
    occupancy: "B",
    questionTypes: [QT.classification, QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC201", section: "304", why: "Retrieve for Group B (Business) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing." },
      { code: "SBC801", section: "903.2", why: "Retrieve the parent automatic-sprinkler trigger section; sprinkler-required-decision.json lists no Group B occupancy trigger subsection, so this points at the confirmed parent rather than guessing a child." },
    ],
  },
  {
    occupancy: "E",
    questionTypes: [QT.classification, QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC201", section: "305", why: "Retrieve for Group E (Educational) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing." },
      { code: "SBC801", section: "903.2.3", why: "Retrieve the Group E automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-3-educational-trigger in sprinkler-required-decision.json." },
    ],
  },
  {
    occupancy: "F",
    questionTypes: [QT.classification, QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC201", section: "306", why: "Retrieve for Group F (Factory/Industrial) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing." },
      { code: "SBC801", section: "903.2.4", why: "Retrieve the Group F automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-4-factory-trigger in sprinkler-required-decision.json." },
    ],
  },
  {
    occupancy: "H",
    questionTypes: [QT.classification, QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC201", section: "307", why: "Retrieve for Group H (High-Hazard) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing." },
      { code: "SBC801", section: "903.2.5", why: "Retrieve the Group H automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-5-high-hazard-trigger in sprinkler-required-decision.json." },
    ],
  },
  {
    occupancy: "I",
    questionTypes: [QT.classification, QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC201", section: "308", why: "Retrieve for Group I (Institutional) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing." },
      { code: "SBC801", section: "903.2.6", why: "Retrieve the Group I automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-6-institutional-trigger in sprinkler-required-decision.json." },
      { code: "SBC801", section: "1020.1", why: "Retrieve the corridor rating material; promptContract's conflict-trigger list flags I-2 corridor rating as a frequent miss, so pull the text and read the value from it rather than from this hint." },
      { code: "SBC801", section: "1020.3", why: "Retrieve the corridor subsection confirmed as sbc-801-section-1020.3 in egress-design-checklist.json; pull alongside 1020.1 whenever the question concerns corridors." },
    ],
  },
  {
    occupancy: "M",
    questionTypes: [QT.classification, QT.specific, QT.noncompliance, QT.design, QT.audit],
    targetSections: [
      { code: "SBC201", section: "309", why: "Retrieve for Group M (Mercantile) classification text; number and code volume confirmed as sbc-201-section-309 in group-m-fire-protection.json." },
      { code: "SBC201", section: "402", why: "Retrieve when the question mentions a covered or open mall; group-m-fire-protection.json names SBC 201 Section 402 as the mall provision its exception branches point at." },
      { code: "SBC801", section: "903.2.7", why: "Retrieve the Group M automatic-sprinkler trigger subsection; number and code volume confirmed as sbc-801-section-903.2.7 in group-m-fire-protection.json." },
      { code: "SBC801", section: "903.2.7.1", why: "Retrieve the Group M sprinkler sub-trigger; number and code volume confirmed as sbc-801-section-903.2.7.1 in group-m-fire-protection.json." },
      { code: "SBC801", section: "903.2.7.2", why: "Retrieve the Group M sprinkler sub-trigger reached from the upholstered-furniture branch; number and code volume confirmed as sbc-801-section-903.2.7.2 in group-m-fire-protection.json." },
      { code: "SBC801", section: "907.2.7", why: "Retrieve the Group M fire-alarm trigger subsection; number and code volume confirmed as sbc-801-section-907.2.7 in group-m-fire-protection.json." },
      { code: "SBC801", section: "907.2.7.1", why: "Retrieve the Group M fire-alarm sub-trigger; number and code volume confirmed as sbc-801-section-907.2.7.1 in group-m-fire-protection.json." },
    ],
  },
  {
    occupancy: "R",
    questionTypes: [QT.classification, QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC201", section: "310", why: "Retrieve for Group R (Residential) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing." },
      { code: "SBC801", section: "903.2.8", why: "Retrieve the Group R automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-8-residential-trigger in sprinkler-required-decision.json." },
    ],
  },
  {
    occupancy: "S",
    questionTypes: [QT.classification, QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC201", section: "311", why: "Retrieve for Group S (Storage) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing." },
      { code: "SBC801", section: "903.2.9", why: "Retrieve the Group S automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-9-storage-trigger in sprinkler-required-decision.json." },
    ],
  },

  // --- Wildcard: applies regardless of occupancy_group ---
  {
    occupancy: "*",
    questionTypes: [QT.specific, QT.noncompliance, QT.design, QT.audit],
    targetSections: [
      { code: "SBC201", section: "403.1", why: "Retrieve when the question involves building height near the high-rise threshold; promptContract's conflict-trigger list names SBC 201 Section 403.1 explicitly, code volume included." },
      { code: "SBC801", section: "903.2.11", why: "Retrieve the high-rise automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-11-high-rise-trigger in sprinkler-required-decision.json." },
      { code: "SBC801", section: "903.3.1.1", why: "Retrieve the sprinkler installation-standard subsection referenced by the alarm exception branch; number and code volume confirmed as Section 903.3.1.1 in group-m-fire-protection.json." },
    ],
  },
  {
    occupancy: "*",
    questionTypes: [QT.specific, QT.noncompliance, QT.design, QT.audit],
    targetSections: [
      { code: "SBC801", section: "1004.5", why: "Retrieve the occupant-load material that the rest of the egress chain reads from; confirmed as sbc-801-table-1004.5 in egress-design-checklist.json." },
      { code: "SBC801", section: "1005", why: "Retrieve the egress-sizing section; confirmed as sbc-801-section-1005 in egress-design-checklist.json. That corpus names no sizing sub-subsection beyond 1005.3.1/1005.3.2, so this points at the parent." },
      { code: "SBC801", section: "1006.2", why: "Retrieve the egress-count subsection for a space; confirmed as sbc-801-section-1006.2 in egress-design-checklist.json." },
      { code: "SBC801", section: "1006.3", why: "Retrieve the egress-count subsection for a story; confirmed as sbc-801-section-1006.3 in egress-design-checklist.json." },
      { code: "SBC801", section: "1017.2", why: "Retrieve the exit-access travel-distance material; confirmed as sbc-801-table-1017.2 in egress-design-checklist.json and flagged in promptContract's conflict-trigger list." },
    ],
  },
  {
    occupancy: "*",
    questionTypes: [QT.specific, QT.noncompliance, QT.classification],
    targetSections: [
      { code: "SBC201", section: "508", why: "Retrieve when the question describes more than one occupancy in one building; promptContract's conflict-trigger list names Section 508 without a code volume, and SBC 201's measured chapter 5 is where heights/areas/mixed-occupancy material sits — code attribution not independently confirmed." },
    ],
  },
  {
    occupancy: "*",
    questionTypes: [QT.specific, QT.noncompliance, QT.design],
    targetSections: [
      { code: "SBC201", section: "503", why: "Retrieve the base allowable height-and-area material for the stated construction type; SBC 201's measured chapter 5 is General Building Heights and Areas — number not independently confirmed." },
      { code: "SBC201", section: "504.3", why: "Retrieve the height-increase material; promptContract's conflict-trigger list names table 504.3 for construction-type-versus-height conflicts, without a code volume — attribution follows SBC 201's measured chapter 5." },
      { code: "SBC201", section: "506.2", why: "Retrieve the area-increase material; promptContract's conflict-trigger list names table 506.2 for construction-type-versus-area conflicts, without a code volume — attribution follows SBC 201's measured chapter 5." },
    ],
  },
  {
    occupancy: "*",
    questionTypes: [QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC801", section: "907.2", why: "Retrieve the parent fire-alarm trigger section; it is the parent of sbc-801-section-907.2.7 as confirmed in group-m-fire-protection.json, so use it when the occupancy-specific 907.2.x subsection is not yet known." },
    ],
  },
  {
    occupancy: "*",
    questionTypes: [QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC801", section: "909", why: "Retrieve as a starting point when the question mentions smoke control or smoke management; chapter 9 of SBC 801 is where the measured chapter index places that material, but this section number is not confirmed by any in-repo source." },
    ],
  },
  {
    occupancy: "*",
    questionTypes: [QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC801", section: "905", why: "Retrieve as a starting point when the question mentions standpipes; chapter 9 of SBC 801 is where the measured chapter index places that material, but this section number is not confirmed by any in-repo source." },
    ],
  },
  {
    occupancy: "*",
    questionTypes: [QT.specific, QT.noncompliance],
    targetSections: [
      { code: "SBC801", section: "913", why: "Retrieve as a starting point when the question mentions fire pumps or water-supply adequacy; chapter 9 of SBC 801 is where the measured chapter index places that material, but this section number is not confirmed by any in-repo source." },
    ],
  },
  {
    occupancy: "*",
    questionTypes: [QT.classification],
    targetSections: [
      { code: "SBC201", section: "302", why: "Retrieve the general classification section when the occupancy group has not been identified yet; number and code volume confirmed as sbc-201-section-302 in egress-design-checklist.json." },
    ],
  },
];

// ===========================================================================
// 4. deriveTargetSections
// ===========================================================================

/**
 * An entry's occupancy letter matches a fact occupancy_group if they are
 * equal, or if the fact is a subgroup of the entry's letter (e.g. entry "I"
 * matches fact "I-2"). Case-insensitive.
 */
function occupancyMatches(entryOccupancy: string, factOccupancy: string): boolean {
  const entry = entryOccupancy.toUpperCase();
  const fact = factOccupancy.toUpperCase();
  return entry === fact || fact.startsWith(`${entry}-`);
}

/** Numeric-aware comparison of dotted section numbers, e.g. "903.2.9" < "903.2.10". */
function compareSections(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const na = partsA[i] ?? 0;
    const nb = partsB[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Derives retrieval-targeting section hints for a question.
 *
 * Every entry (occupancy-specific or wildcard) must list facts.question_type
 * in its questionTypes to match at all. Among matches, occupancy-specific
 * entries are returned before wildcard ("*") entries; within each group,
 * DERIVATION_MAP's declaration order is the priority order, and each
 * matched entry's own targetSections are emitted in section-number order.
 * Results are deduplicated by code+section (first `why` wins) and capped at 8.
 */
export function deriveTargetSections(
  facts: { occupancy_group?: string; question_type: string },
): DerivedSection[] {
  const matchesQuestionType = (entry: DerivationEntry) => entry.questionTypes.includes(facts.question_type);

  const exactMatches = DERIVATION_MAP.filter(
    (entry) =>
      entry.occupancy !== "*" &&
      facts.occupancy_group !== undefined &&
      occupancyMatches(entry.occupancy, facts.occupancy_group) &&
      matchesQuestionType(entry),
  );
  const wildcardMatches = DERIVATION_MAP.filter((entry) => entry.occupancy === "*" && matchesQuestionType(entry));

  const ordered = [...exactMatches, ...wildcardMatches];

  const seen = new Set<string>();
  const result: DerivedSection[] = [];

  for (const entry of ordered) {
    const sortedSections = [...entry.targetSections].sort((a, b) => compareSections(a.section, b.section));
    for (const target of sortedSections) {
      const key = `${target.code}:${target.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ code: target.code, section: target.section, why: target.why });
      if (result.length >= 8) return result;
    }
  }

  return result;
}
