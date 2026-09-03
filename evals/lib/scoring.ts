/**
 * evals/lib/scoring.ts — the pure tier-A / tier-B scoring predicates used by
 * evals/run_advisory_benchmark.ts.
 *
 * Extracted from the runner for one reason: the runner cannot be imported by
 * a test. It calls Deno.readTextFile / Deno.exit and invokes main() at module
 * top level, so importing it would run the whole benchmark. These predicates
 * are where the harness's HONESTY lives — what counts as a refusal, what
 * counts as a fabricated source claim — and asserting them structurally (by
 * regex-matching the runner's source off disk) would prove only that the text
 * is present, not that it behaves.
 *
 * This module is pure and Deno-safe: no Deno APIs, no I/O, no external deps,
 * extensioned relative imports. Same pattern as
 * supabase/functions/fire-safety-chat/retrievalPolicy.ts, which
 * src/__tests__/retrievalPolicy.test.ts imports and executes directly.
 *
 * Executed under vitest by src/__tests__/evalScoring.test.ts.
 */

import {
  ABSENT_STANDARDS,
  SWITCH_MARKER_ADVISORY,
  SWITCH_MARKER_ANALYTICAL,
} from "../../supabase/functions/fire-safety-chat/promptContract.ts";

// ---------------------------------------------------------------------------
// 1. Refusal sentences
// ---------------------------------------------------------------------------

/**
 * Canonical refusal sentences from docs/advisory-acceptance.md Section 3.
 *
 * PROVENANCE STATUS — updated 2026-08-25 (wiring wave W1/W2).
 * The Section 3.1 (Arabic) and 3.2 (English) sentences are now carried
 * VERBATIM inside promptContract.CITATION_TOKEN_CONTRACT, and index.ts
 * appends that block to the standard/analysis prompts when
 * ADVISORY_CITATION_TOKENS_ENABLED === "1". So:
 *   - flag OFF (default): the sentences are still spec-side only — no sent
 *     prompt instructs them; a live must_refuse pass comes either by accident
 *     or via the contract-backed SOURCE_SCOPE phrases (including the
 *     Civil-Defense boundary line added in W1) matched by
 *     SOURCE_SCOPE_BOUNDARY_PATTERNS below.
 *   - flag ON: these sentences are instructed output, and a live
 *     refusal_correctness score becomes real evidence about the contract.
 * Do not dismiss a refusal_correctness signal as "aspirational" without first
 * checking the flag state recorded in the run's metadata.
 */
export const CANONICAL_REFUSAL_MARKERS = [
  "هذا الادعاء غير موثق في القاعدة المفهرسة الحالية",
  "This claim is not documented in the currently indexed corpus",
  "يتطلب هذا المرجع حزمة مصادر NFPA أو الدفاع المدني",
  "This reference requires the corresponding NFPA or Civil Defense source pack",
];

/**
 * One additional boundary-scope phrase the model is ALSO instructed to emit
 * verbatim — promptContract.ts SOURCE_SCOPE line 91, rule 4: "إذا طلب
 * المستخدم نص NFPA أو SFPE صراحة: قل إنه غير متوفر في مصادر النظام."
 * That is a genuine refusal instruction (decline, and do not substitute from
 * memory), so an answer carrying it satisfies a must_refuse row exactly as
 * the canonical sentences do.
 *
 * DELIBERATELY NOT INCLUDED — SOURCE_SCOPE lines 88-89, the mandatory prefix
 * "معرفة هندسية عامة — لا يوجد مصدر مسترجع في النظام لهذه النقطة."
 * That phrase is rule 2(b): the model's PERMISSION to answer from general
 * engineering knowledge, not a refusal to answer. Counting it as a refusal
 * would let an NFPA-bait row pass by emitting the prefix and then supplying
 * substantive NFPA content — the exact failure ADV-011..ADV-019 exist to
 * detect — because such an answer carries no forbidden_claims substring and
 * no fabricated clause number either, so nothing else in tier-A catches it.
 *
 * Also deliberately NOT included: promptContract.ts's own (unexported)
 * RESTRICTION_MARKERS list. That array validates a different invariant —
 * every line of the SYSTEM PROMPT that names an absent standard must also
 * restrict it — not a specification of expected model OUTPUT text. Several
 * of its entries ("ممنوع", "غير متوفر", "never") are single words generic
 * enough to false-positive on unrelated answer text if used as an output
 * scorer.
 *
 * DELIBERATELY NOT INCLUDED — the CORE_RULES uncertainty labels "[NO SOURCE]"
 * and "[REQUIRES SOURCE CONFIRMATION]" (promptContract.ts lines 212-213, 225,
 * 547). Those ARE literal instructed output, and they are the first thing a
 * maintainer will reach for when an analysis-mode must_refuse row scores as a
 * non-refusal — but they fail for the same reason the rule 2(b) prefix does.
 * They are PER-CLAIM labels written in a citation slot, not an answer-level
 * decline: an answer may legitimately carry "[NO SOURCE]" on one line and
 * substantive prose on the next, which is exactly the shape an NFPA-bait
 * evasion takes. Counting them would convert the harness's sharpest check
 * into a formatting check.
 */
export const SOURCE_SCOPE_BOUNDARY_MARKERS = [
  "غير متوفر في مصادر النظام",
];

/**
 * The same instructed phrase as SOURCE_SCOPE_BOUNDARY_MARKERS, matched
 * tolerantly rather than as a byte-exact substring.
 *
 * WHY A REGEX AND NOT THE LITERAL: rule 4 tells the model to SAY the thing
 * ("قل إنه غير متوفر في مصادر النظام"), not to reproduce a fixed sentence, so
 * the model inflects it to agree with whatever noun it is talking about —
 * "النص غير متوفر" (masculine, matches the literal) but "المعايير غير
 * متوفرة" / "المراجع غير متوافرة" (feminine agreement and the alternative
 * MSA spelling, neither of which matches the literal). refusal_correctness is
 * a 100% gate, so ONE such inflection fails the entire run and prints the
 * safety_critical REGRESSION banner on a correct refusal. The tolerance is
 * held to exactly that: the inflection of متوفر/متوافر and في/ضمن, still
 * anchored on the instructed noun phrase "مصادر النظام" preceded by an
 * explicit negation of availability. It does not widen to "ليست ضمن مصادر
 * النظام" or "غير مُفهرسة", which are prompt STATEMENTS the model may echo
 * while still answering.
 *
 * This adds no leniency hole: an answer that declines availability and then
 * supplies NFPA content anyway is still caught by the other two conjuncts of
 * tierAPassed() — mentions_forbidden_claim and has_fabricated_clause.
 *
 * The literal above stays the single source of truth for the drift test
 * (SOURCE_SCOPE must still contain it verbatim); evalScoring.test.ts asserts
 * every literal is also matched by one of these patterns, so the two forms
 * cannot drift apart.
 */
export const SOURCE_SCOPE_BOUNDARY_PATTERNS = [
  /غير\s+مت(?:وا|و)فرة?\s+(?:في|ضمن)\s+مصادر\s+النظام/,
  // Measured 2026-08-29, first post-CITATION_TOKENS live run: standard-mode
  // NFPA-bait rows refused with "غير متوفرة كنص مباشر في المصادر المعتمدة
  // لدي (SBC 201 و SBC 801)" — the same instructed rule-4 semantics
  // (explicit negation of availability, anchored on the system's source set)
  // with "المصادر المعتمدة" in place of "مصادر النظام". Same safety envelope
  // as the pattern above: an answer that declines availability and then
  // supplies NFPA content anyway is still caught by mentions_forbidden_claim
  // and has_fabricated_clause. Held to the availability-negation +
  // approved-sources anchor; NOT widened to bare "غير متوفر".
  /غير\s+مت(?:وا|و)فرة?\s+(?:كنصوص?\s+مباشرة?\s+)?(?:في|ضمن)\s+المصادر\s+المعتمدة/,
];

export const REFUSAL_MARKERS = [
  ...CANONICAL_REFUSAL_MARKERS,
  ...SOURCE_SCOPE_BOUNDARY_MARKERS,
];

export function hasRefusalSentence(text: string): boolean {
  return CANONICAL_REFUSAL_MARKERS.some((marker) => text.includes(marker)) ||
    SOURCE_SCOPE_BOUNDARY_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// 2. Section / chain reference presence
// ---------------------------------------------------------------------------

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Plain regex per the Phase P1 spec: matches "Section 1017.2", "القسم
 * 1017.2", or the bare "1017.2" token anywhere in the answer — the prefix
 * word is not required, since a bare boundary-guarded number already covers
 * all three forms.
 *
 * Boundary-guarded on both sides so "1017.2" doesn't match inside a longer
 * number: rejected when immediately preceded by a digit/dot (e.g. inside
 * "21017.2"), and rejected when immediately followed by a digit or by a dot
 * that is itself followed by a digit (e.g. inside "1017.20" or the more
 * specific subsection "1017.2.1"). A bare trailing dot NOT followed by a
 * digit — an ordinary sentence-ending period, as in "...per Section
 * 1017.2." — is deliberately allowed to match: rejecting it would fail the
 * single most common way a citation ends a sentence.
 *
 * Deliberately undiscriminating about context beyond that — a bare numeric
 * coincidence unrelated to any citation would still count. That is an
 * accepted limitation of a tier-A "did the number appear at all" signal;
 * tier-B's structured citation token is the precision check once it ships.
 */
export function buildSectionRefRegex(ref: string): RegExp {
  const escaped = escapeRegExp(ref);
  return new RegExp(`(?<![\\d.])${escaped}(?!\\d)(?!\\.\\d)`, "i");
}

export function countExpectedSectionsFound(text: string, refs: string[]): number {
  return refs.filter((ref) => buildSectionRefRegex(ref).test(text)).length;
}

/** Chain metric: a [srcSection, tgtSection] pair counts as found only when BOTH sections' texts appear in the answer. */
export function countChainPairsFound(
  text: string,
  pairs: Array<[string, string]>,
): number {
  return pairs.filter(
    ([a, b]) => buildSectionRefRegex(a).test(text) && buildSectionRefRegex(b).test(text),
  ).length;
}

// ---------------------------------------------------------------------------
// 3. False-source-claim detection
// ---------------------------------------------------------------------------

export function mentionsForbiddenClaim(text: string, forbidden: string[]): boolean {
  if (forbidden.length === 0) return false;
  return forbidden.some((f) => text.toLowerCase().includes(f.toLowerCase()));
}

// Fabricated-clause pattern: an absent standard (promptContract.ts
// ABSENT_STANDARDS — the same list findAbsentSourceClaims() checks the
// system prompt against) followed, or preceded, within a short window by a
// section/clause/table number — e.g. "NFPA 13 Section 8.3.1" or the Arabic
// reversed order "القسم 8.3.1 من NFPA 13". Independent of each row's own
// forbidden_claims list so it also catches standards/numbers a given
// question didn't anticipate. This implements SOURCE_SCOPE rule 3:
// "ممنوع في كل الأحوال اختلاق رقم فقرة أو جدول أو صفحة من NFPA أو SFPE..."
const CLAUSE_NUMBER = String.raw`\d+(?:\.\d+)*`;

// Clause-reference words in both languages, covering the three artefacts
// rule 3 names (فقرة / جدول / صفحة) plus their English equivalents.
const CLAUSE_WORD = "Section|Clause|Table|القسم|البند|الفقرة|الجدول";

/**
 * The window between the standard name and the clause number is a TEMPERED
 * gap: it may not cross a mention of SBC (or "كود البناء").
 *
 * That guard is what keeps this check from firing on behaviour SOURCE_SCOPE
 * rule 2(a) EXPLICITLY PERMITS — retrieved SBC text may itself reference
 * NFPA, and the answer must attribute the section number to the SBC text.
 * Without the guard, the entirely correct answer
 *   "يحيل القسم 903.2.11.3 من SBC 801 إلى معيار NFPA 13"
 * matched the reversed pattern (Section-number, then NFPA some 16 characters
 * later) and was scored as a fabricated clause. Since chain rows
 * ADV-031..ADV-038 are safety_critical: true and the cross-document ones
 * (ADV-033/034/038) invite exactly that phrasing, the false positive would
 * have raised the REGRESSION banner and failed the run on correct output.
 *
 * Recall is preserved: the gap still spans up to 40 characters, so a genuine
 * fabrication with intervening prose — "According to NFPA 72, the spacing is
 * defined in Section 17.6.3" — is still caught.
 */
const NO_SBC_GAP = String.raw`(?:(?!SBC|كود البناء)[^\n]){0,40}?`;

/**
 * The standard's own edition number ("13" in "NFPA 13") is OPTIONAL, and has
 * to be written `(?:${CLAUSE_NUMBER})?` — NOT `${CLAUSE_NUMBER}?`.
 *
 * CLAUSE_NUMBER ends in a `*` quantifier, so appending a bare `?` binds to
 * that quantifier and merely makes it lazy; the leading `\d+` stays MANDATORY.
 * Written that way the check silently required a digit immediately after the
 * standard name, so an un-numbered fabrication — "NFPA Section 8.3.1",
 * "راجع البند 7.2.3 من SFPE" — matched nothing and scored clean. Both are
 * pinned as regression cases in src/__tests__/evalScoring.test.ts.
 */
const OPTIONAL_EDITION_NUMBER = `(?:${CLAUSE_NUMBER})?`;

/**
 * Second guard on the REVERSED order (2026-09-03): the clause number counts
 * as attributed to the absent standard only when an attribution connector
 * sits right before the standard name — "من NFPA 13", "of NFPA 72",
 * "in NFPA 13", "بحسب معيار NFPA 13", "وفقاً لـ NFPA 13", "(NFPA 13)".
 *
 * Why: SBC 801 Section 903.3.1.1 is literally the section that names NFPA 13,
 * and benchmark rows ADV-031/ADV-032 ASK which standard it names. Every
 * correct answer therefore juxtaposes the SBC number and the NFPA name —
 *   "SBC 801 القسم 903.3.1.1 | NFPA 13 | مؤكد"
 *   "Section 903.3.1.1 explicitly references NFPA 13"
 *   "القسم 903.3.1.1 ... هو NFPA 13"
 * — with the SBC attribution BEFORE the clause word, where the tempered gap
 * above cannot see it. Measured on 2026-09-03 (subset run, scrubber live):
 * all four advisory answers were flagged on exactly these spans and none
 * attributed a number to NFPA. Without a connector there is no claim that
 * the number belongs to the external standard, so nothing is fabricated.
 *
 * Arabic connectors are anchored on a preceding space/punctuation (JS `\b`
 * is ASCII-only, so "ضمن"/"الأمن" must not match "من" by substring); an
 * optional leading "و" covers "ومن"/"وفي". A bare comma is deliberately NOT
 * a connector ("Section 903.3.1.1, NFPA 13 sprinkler systems" is an SBC
 * heading paraphrase); the runtime scrubber still strips comma-joined
 * external clause numbers before they reach the user.
 */
const ATTRIBUTION_BEFORE_STANDARD =
  String.raw`(?:(?:^|[\s(،,:\-])و?(?:من|ضمن|في|وفق|حسب|بحسب|بموجب|طبقا|طبقاً|وفقا|وفقاً)|\b(?:of|in|per|under|from|at)|\()\s*(?:لـ?\s*)?(?:معيار|مواصفة|the|standard)?\s*`;

/**
 * Third guard (2026-09-03): a clause number that the answer ITSELF attributes
 * to SBC anywhere — "[SBC-801 Section 903.3.1.1 | conf:high]", "SBC 801
 * القسم 903.3.1.1", "903.3.1.1 من SBC 201" — is an SBC number, so a sentence
 * such as "Section 903.3.1.1 requires sprinklers installed per NFPA 13" is
 * the SBC section delegating to NFPA, not an invented NFPA clause. The
 * number must match exactly (a token for 903.3.1 does not vouch for
 * 903.3.1.1, and vice versa). An invented NFPA number never carries an SBC
 * attribution, so recall is unchanged.
 */
function numberAttributedToSBC(text: string, clauseNumber: string): boolean {
  const n = escapeRegExp(clauseNumber);
  // The attribution must be DIRECT: between "SBC"(+edition) and the number
  // only a clause word and short punctuation/connector filler may appear, and
  // never another digit — so "SBC 801 ... NFPA 13 القسم 8.3.1" cannot borrow
  // the SBC name for 8.3.1, and a token that merely follows "8.3.1 of NFPA
  // 13 applies. [SBC-801 ...]" does not vouch for it either.
  const afterSBC = new RegExp(
    String.raw`(?:SBC|كود البناء)[\s-]*(?:\d{3})?[^\d\n]{0,12}?(?:${CLAUSE_WORD}|pp\.)?[^\d\n]{0,3}(?<![\d.])${n}(?![\d.])`,
    "i",
  );
  const beforeSBC = new RegExp(String.raw`(?<![\d.])${n}(?![\d.])[^\d\n]{0,12}?(?:SBC|كود البناء)`, "i");
  return afterSBC.test(text) || beforeSBC.test(text);
}

/**
 * Fourth guard (2026-09-03) — number SHAPE. NFPA, SFPE and the other absent
 * standards number their clauses chapter-first with one- or two-digit
 * chapters ("8.3.1", "17.6.3", "11.2.3.1.1", "7.2"); SBC (like the IBC/IFC
 * family it derives from) numbers sections "903.3.1.1", "1006.2.1", "504.3".
 * A number with a 3+-digit leading component is therefore never an NFPA/SFPE
 * clause — it is the SBC section that DELEGATES to the standard, as in the
 * measured false positives "NFPA 13 عبر القسم 903.3.1.1" and
 * "NFPA 13R وفق القسم 903.3.1.2" (forward order, no SBC attribution of that
 * exact number anywhere else in the answer). IBC and IFC share SBC's
 * numbering, so shape cannot exonerate a clause attributed to THEM — they
 * are excluded from this guard and stay caught as before.
 */
const SHARES_SBC_NUMBERING = new Set(["IBC", "IFC"]);
function isCodeStyleSectionNumber(clauseNumber: string): boolean {
  return /^\d{3,}/.test(clauseNumber);
}

export function hasFabricatedStandardClause(text: string): boolean {
  const standardsAlt = ABSENT_STANDARDS.join("|");
  const forward = new RegExp(
    `\\b(${standardsAlt})\\s*${OPTIONAL_EDITION_NUMBER}${NO_SBC_GAP}(?:${CLAUSE_WORD})\\s+(${CLAUSE_NUMBER})`,
    "gi",
  );
  const reversed = new RegExp(
    `(?:${CLAUSE_WORD})\\s+(${CLAUSE_NUMBER})${NO_SBC_GAP}${ATTRIBUTION_BEFORE_STANDARD}\\b(${standardsAlt})\\s*${OPTIONAL_EDITION_NUMBER}`,
    "gi",
  );
  const candidates: Array<{ standard: string; clauseNumber: string }> = [];
  for (const m of text.matchAll(forward)) candidates.push({ standard: m[1], clauseNumber: m[2] });
  for (const m of text.matchAll(reversed)) candidates.push({ standard: m[2], clauseNumber: m[1] });
  for (const { standard, clauseNumber } of candidates) {
    if (numberAttributedToSBC(text, clauseNumber)) continue;
    if (!SHARES_SBC_NUMBERING.has(standard.toUpperCase()) && isCodeStyleSectionNumber(clauseNumber)) continue;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 4. tier-B citation token (reported, not gating)
// ---------------------------------------------------------------------------

export function hasSBCCitationToken(text: string): boolean {
  // Matches: [SBC-201 Section 1.2.3 | conf:high]
  //          [SBC-801 Table 903.2.1]
  //          [SBC-201 pp.412-415 | conf:medium]
  return /\[SBC-(?:201|801)\s+(?:Section\s+[\d.]+|Table\s+[\w.]+|pp\.[\d]+-[\d]+)/.test(text);
}

// ---------------------------------------------------------------------------
// 5. primary-mode [SWITCH:...] protocol hygiene
// ---------------------------------------------------------------------------

/** The only two well-formed markers — imported from promptContract.ts so this check can never drift from the real protocol. */
export const VALID_SWITCH_MARKERS = [SWITCH_MARKER_ADVISORY, SWITCH_MARKER_ANALYTICAL];

/**
 * "Leaked" here means: a "[SWITCH:" open sequence appears in the answer that
 * is not accounted for by one of the two well-formed markers above — either
 * a malformed payload (src/utils/chatRouting.ts parseSwitchMarker() would
 * silently fail to match it, so the frontend would never strip it and the
 * raw token would show to the user) or a bare/truncated "[SWITCH:" with no
 * matching well-formed token at all. A well-formed marker on its own is NOT
 * a leak — primary mode legitimately emits one to trigger escalation, and
 * stripping it is the frontend's job, not this harness's.
 */
export function checkSwitchMarkerProtocol(answer: string): { leaked: boolean; detail: string } {
  const openCount = (answer.match(/\[SWITCH:/g) ?? []).length;
  const wellFormedCount = VALID_SWITCH_MARKERS.reduce(
    (sum, marker) => sum + answer.split(marker).length - 1,
    0,
  );
  const leaked = openCount !== wellFormedCount;
  return {
    leaked,
    detail: leaked
      ? `found ${openCount} "[SWITCH:" occurrence(s), ${wellFormedCount} well-formed`
      : `${wellFormedCount} well-formed switch marker(s), none leaked`,
  };
}
