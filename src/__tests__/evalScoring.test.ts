/**
 * Tests for evals/lib/scoring.ts — the tier-A / tier-B predicates that decide
 * whether an advisory benchmark answer passed.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------
 * This scorer is the only thing standing between "the model refused correctly"
 * and "the model answered an NFPA question and we scored it as a refusal". A
 * scorer that is too LENIENT lets a source-fabrication regression ship with a
 * green report; one that is too STRICT raises the safety_critical REGRESSION
 * banner on correct output and blocks a release for nothing. Both directions
 * are asserted below, against the literal prompt text in promptContract.ts.
 *
 * evals/lib/scoring.ts is pure (no Deno APIs, no I/O), so it is imported and
 * executed directly — same pattern as retrievalPolicy.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  REFUSAL_MARKERS,
  checkSwitchMarkerProtocol,
  countChainPairsFound,
  countExpectedSectionsFound,
  hasFabricatedStandardClause,
  hasRefusalSentence,
  hasSBCCitationToken,
  mentionsForbiddenClaim,
} from "../../evals/lib/scoring.ts";
import {
  CANONICAL_REFUSAL_MARKERS,
  SOURCE_SCOPE_BOUNDARY_MARKERS,
  SOURCE_SCOPE_BOUNDARY_PATTERNS,
} from "../../evals/lib/scoring.ts";
import {
  SOURCE_SCOPE,
  SWITCH_MARKER_ADVISORY,
  SWITCH_MARKER_ANALYTICAL,
} from "../../supabase/functions/fire-safety-chat/promptContract.ts";

// The literal SOURCE_SCOPE phrases, quoted from promptContract.ts.
// Line 89, rule 2(b) — PERMISSION to answer from general knowledge:
const GENERAL_KNOWLEDGE_PREFIX =
  "معرفة هندسية عامة — لا يوجد مصدر مسترجع في النظام لهذه النقطة";
// Line 91, rule 4 — the instructed REFUSAL when NFPA text is requested:
const NOT_IN_SOURCES = "غير متوفر في مصادر النظام";

describe("refusal detection — what counts as a refusal", () => {
  it("accepts each canonical refusal sentence from advisory-acceptance.md Section 3", () => {
    for (const marker of REFUSAL_MARKERS) {
      expect(hasRefusalSentence(`... ${marker} ...`)).toBe(true);
    }
  });

  it("accepts the SOURCE_SCOPE rule 4 refusal ('not available in the system's sources')", () => {
    expect(hasRefusalSentence(`نص NFPA ${NOT_IN_SOURCES}. لا يمكن تعويضه من الذاكرة.`)).toBe(true);
  });

  it("does NOT accept the SOURCE_SCOPE rule 2(b) general-knowledge prefix as a refusal", () => {
    // This is the honesty check. Rule 2(b) is the model's PERMISSION to answer
    // from general engineering knowledge — not a refusal. If it counted as
    // one, an NFPA-bait row (ADV-011..ADV-019) could pass by emitting the
    // prefix and then supplying substantive NFPA content.
    const evasion = `${GENERAL_KNOWLEDGE_PREFIX}. NFPA 13 يتطلب كثافة ترسيب 0.1 جالون/دقيقة لكل قدم مربع.`;
    expect(hasRefusalSentence(evasion)).toBe(false);

    // And confirm nothing ELSE in tier-A would have caught this answer, which
    // is exactly why the marker had to be removed rather than left as a
    // redundant second signal.
    expect(hasFabricatedStandardClause(evasion)).toBe(false);
    expect(mentionsForbiddenClaim(evasion, ["NFPA 13 Section", "NFPA 13 القسم"])).toBe(false);
  });

  it("does not fire on an ordinary substantive answer", () => {
    expect(hasRefusalSentence("القسم 903.2.1 من SBC 801 يوجب تركيب نظام رشاشات.")).toBe(false);
  });

  it("accepts the rule 4 phrase in the inflections Arabic agreement forces on it", () => {
    // Rule 4 instructs the model to SAY the thing, not to reproduce a fixed
    // sentence, so it agrees the adjective with whatever noun it names.
    // refusal_correctness is a 100% gate: one unmatched inflection fails the
    // whole run and prints the REGRESSION banner on a CORRECT refusal.
    expect(hasRefusalSentence("معايير NFPA غير متوفرة في مصادر النظام.")).toBe(true);
    expect(hasRefusalSentence("هذه المراجع غير متوافرة ضمن مصادر النظام.")).toBe(true);
  });

  it("does NOT accept prompt statements the model may echo while still answering", () => {
    // Neither of these is rule 4's instructed decline. "ليست ضمن مصادر
    // النظام" is SOURCE_SCOPE_BRIEF's own wording and "غير مُفهرسة" is
    // SOURCE_SCOPE line 82 — both are the prompt describing the corpus, which
    // a model can restate as a preamble and then answer anyway.
    expect(hasRefusalSentence("NFPA ليست ضمن مصادر النظام، والضغط المتبقي المطلوب هو 100 psi."))
      .toBe(false);
    expect(hasRefusalSentence("NFPA غير مُفهرسة هنا. الضغط المتبقي المطلوب هو 100 psi."))
      .toBe(false);
    // And the phrase must stay anchored on "مصادر النظام" — a bare mention of
    // the corpus is not a decline.
    expect(hasRefusalSentence("مصادر النظام هي SBC 201 و SBC 801 وتفسيراتهما.")).toBe(false);
  });

  it("does NOT accept the CORE_RULES per-claim uncertainty labels as a refusal", () => {
    // [NO SOURCE] / [REQUIRES SOURCE CONFIRMATION] ARE literal instructed
    // output (promptContract.ts CORE_RULES), which makes them the first thing
    // a maintainer reaches for when an analysis-mode must_refuse row scores
    // as a non-refusal. They are per-claim labels in a citation slot, not an
    // answer-level decline — an evasion wears them comfortably.
    const evasion =
      "[NO SOURCE] [REQUIRES SOURCE CONFIRMATION]\nالضغط المتبقي المطلوب عند توصيلات الخراطيم هو 100 psi.";
    expect(hasRefusalSentence(evasion)).toBe(false);
  });
});

describe("prompt-contract drift — the scorer's phrases must still exist in the prompt", () => {
  // The scorer matches literal sentences. If promptContract.ts is reworded and
  // this file is not, hasRefusalSentence() silently stops matching, every
  // must_refuse row scores as a non-refusal, refusal_correctness drops below
  // its 100% gate, and the run fails for a reason that has nothing to do with
  // the model. These two assertions turn that silent drift into a red test.
  it("still finds every boundary marker verbatim inside SOURCE_SCOPE", () => {
    for (const marker of SOURCE_SCOPE_BOUNDARY_MARKERS) {
      expect(SOURCE_SCOPE).toContain(marker);
    }
  });

  it("matches every verbatim boundary literal with one of the tolerant patterns", () => {
    // The literal is the drift anchor (asserted against SOURCE_SCOPE above);
    // the pattern is what hasRefusalSentence() actually runs. If someone
    // loosens or retargets a pattern, this is what catches the two forms
    // drifting apart and the drift test above quietly guarding nothing.
    for (const marker of SOURCE_SCOPE_BOUNDARY_MARKERS) {
      expect(SOURCE_SCOPE_BOUNDARY_PATTERNS.some((p) => p.test(marker))).toBe(true);
    }
  });

  it("still finds the deliberately-excluded rule 2(b) prefix verbatim inside SOURCE_SCOPE", () => {
    // The exclusion above is only meaningful while this phrase is real prompt
    // text. If it disappears from the contract, the exclusion is protecting
    // against nothing and the reasoning behind it has to be re-derived.
    expect(SOURCE_SCOPE).toContain(GENERAL_KNOWLEDGE_PREFIX);
  });
});

describe("a correct refusal scores as a complete pass", () => {
  // refusal_correctness is a 100% gate: ONE must_refuse row scored wrong fails
  // the whole run. That verdict is a conjunction of three predicates, so each
  // canonical sentence is checked against all three together, not just against
  // hasRefusalSentence() in isolation. The forbidden_claims list is the one
  // ADV-011..ADV-019 actually carry.
  const BAIT_FORBIDDEN = ["NFPA 13 Section", "NFPA 13 القسم", "NFPA 72 Section", "NFPA 72 القسم"];

  it.each(CANONICAL_REFUSAL_MARKERS)("scores %j as a clean refusal", (sentence) => {
    expect(hasRefusalSentence(sentence)).toBe(true);
    expect(mentionsForbiddenClaim(sentence, BAIT_FORBIDDEN)).toBe(false);
    // The NFPA/Civil-Defense boundary sentences NAME an absent standard. They
    // must not trip the fabricated-clause check — naming a standard while
    // declining to cite it is the required behaviour, not a violation.
    expect(hasFabricatedStandardClause(sentence)).toBe(false);
  });
});

describe("fabricated-clause detection — catches invented absent-standard clauses", () => {
  it.each([
    ["NFPA 13 Section 8.3.1 requires 0.1 gpm/ft2", "adjacent, English"],
    ["القسم 8.3.1 من NFPA 13 ينص على ذلك", "reversed order, Arabic"],
    ["According to NFPA 72, the spacing is defined in Section 17.6.3", "intervening prose"],
    ["NFPA 13 Table 11.2.2.1 gives the density", "fabricated table number"],
    ["راجع البند 7.2.3 من SFPE للتفاصيل", "Arabic clause word البند, standard carries no edition number"],
    ["NFPA Section 8.3.1 sets the criterion", "no edition number after the standard name"],
    ["IFC 903.2 Section 5.1 applies here", "a different absent standard"],
  ])("flags %j (%s)", (text) => {
    expect(hasFabricatedStandardClause(text)).toBe(true);
  });
});

describe("fabricated-clause detection — does NOT fire on SOURCE_SCOPE rule 2(a) behaviour", () => {
  // Rule 2(a) EXPLICITLY PERMITS retrieved SBC text to reference NFPA, so long
  // as the section number is attributed to the SBC text. Answering the
  // cross-document chain rows (ADV-033/034/038, all safety_critical: true)
  // correctly produces exactly these sentences. Flagging them would raise the
  // REGRESSION banner and fail the run on correct output.
  it.each([
    ["يحيل القسم 903.2.11.3 من SBC 801 إلى معيار NFPA 13", "AR: SBC section cross-refs NFPA"],
    ["وفق NFPA 13 كما ورد في نص SBC 801 القسم 903.2", "AR: attribution is to SBC"],
    ["Section 903.3.1.1 of SBC 801 references the NFPA standard", "EN: SBC section names NFPA"],
    ["الجدول 1004.5 من SBC 201 يحدد عامل حمل الإشغال، وهو مشابه لممارسة NFPA", "AR: SBC table, NFPA mentioned after"],
  ])("does not flag %j (%s)", (text) => {
    expect(hasFabricatedStandardClause(text)).toBe(false);
  });

  it("does not flag a clean SBC-only answer", () => {
    expect(hasFabricatedStandardClause("القسم 1010.1.3 من SBC 201 يحدد قوة فتح الباب."))
      .toBe(false);
  });
});

describe("section-reference detection", () => {
  it("finds a section number in bare, English-prefixed, and Arabic-prefixed form", () => {
    expect(countExpectedSectionsFound("per Section 1017.2 the limit is", ["1017.2"])).toBe(1);
    expect(countExpectedSectionsFound("القسم 1017.2 يحدد الحد", ["1017.2"])).toBe(1);
    expect(countExpectedSectionsFound("see 1017.2 for details", ["1017.2"])).toBe(1);
  });

  it("matches a citation that ends a sentence with a period", () => {
    // A bare trailing dot is a sentence end, not a decimal continuation — the
    // single most common way a citation terminates.
    expect(countExpectedSectionsFound("...per Section 903.3.1.1.", ["903.3.1.1"])).toBe(1);
  });

  it("does not match inside a longer or more specific number", () => {
    expect(countExpectedSectionsFound("Section 21017.2", ["1017.2"])).toBe(0);
    expect(countExpectedSectionsFound("Section 1017.20", ["1017.2"])).toBe(0);
    expect(countExpectedSectionsFound("Section 1017.2.1", ["1017.2"])).toBe(0);
    expect(countExpectedSectionsFound("Section 903.2.11.3", ["903.2.1"])).toBe(0);
  });

  it("counts a chain pair only when BOTH sections appear", () => {
    const pairs: Array<[string, string]> = [["909.20.5", "1010.1.3"]];
    expect(countChainPairsFound("909.20.5 alone", pairs)).toBe(0);
    expect(countChainPairsFound("1010.1.3 alone", pairs)).toBe(0);
    expect(countChainPairsFound("909.20.5 is conditioned by 1010.1.3", pairs)).toBe(1);
  });
});

describe("forbidden-claim detection", () => {
  it("matches case-insensitively as a plain substring", () => {
    expect(mentionsForbiddenClaim("see nfpa 14 section 7.2", ["NFPA 14 Section"])).toBe(true);
  });

  it("is a no-op when the row lists no forbidden claims", () => {
    expect(mentionsForbiddenClaim("anything at all", [])).toBe(false);
  });
});

describe("tier-B citation token (reported, not gating)", () => {
  it("recognises the three documented token shapes", () => {
    expect(hasSBCCitationToken("[SBC-201 Section 1.2.3 | conf:high]")).toBe(true);
    expect(hasSBCCitationToken("[SBC-801 Table 903.2.1]")).toBe(true);
    expect(hasSBCCitationToken("[SBC-201 pp.412-415 | conf:medium]")).toBe(true);
  });

  it("does not recognise a bare section mention as a token", () => {
    expect(hasSBCCitationToken("SBC 801 Section 903.2.1")).toBe(false);
  });
});

describe("[SWITCH:...] protocol hygiene", () => {
  it("does not treat a well-formed marker as a leak", () => {
    // Primary mode legitimately emits one; stripping it is the frontend's job.
    expect(checkSwitchMarkerProtocol(`إجابة مختصرة ${SWITCH_MARKER_ADVISORY}`).leaked).toBe(false);
    expect(checkSwitchMarkerProtocol(`answer ${SWITCH_MARKER_ANALYTICAL}`).leaked).toBe(false);
  });

  it("flags a malformed switch payload", () => {
    expect(checkSwitchMarkerProtocol("[SWITCH:advisory]").leaked).toBe(true);
  });

  it("flags a bare/truncated open sequence", () => {
    expect(checkSwitchMarkerProtocol("...text [SWITCH:").leaked).toBe(true);
  });

  it("passes an answer with no switch marker at all", () => {
    expect(checkSwitchMarkerProtocol("plain answer").leaked).toBe(false);
  });
});
