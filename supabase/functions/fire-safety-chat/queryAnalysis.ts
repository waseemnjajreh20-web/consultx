/**
 * Query analysis for fire-safety-chat (P6, reasoning layer).
 *
 * Pure data + pure logic (no Deno-specific APIs, no I/O, no model calls) so it
 * can be unit-tested from vitest and imported safely by the Edge Function —
 * same pattern as ./retrievalPolicy.ts, ./chapterIndex.ts and
 * ./promptContract.ts. The model call itself (sending buildQueryAnalysisPrompt
 * output to Gemini and reading the response back through parseQueryFacts) is
 * NOT wired here — that happens in index.ts, using the existing
 * geminiResilience.ts retry/fallback machinery, in a later sequential step.
 * This module only prepares the prompt and validates whatever comes back.
 *
 * Created 2026-08-25 (P6).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DOES AND DOES NOT DO
 * ---------------------------------------------------------------------------
 * A small model call extracts structured QueryFacts (occupancy, dimensions,
 * explicit code references, ...) from the user's raw question, in whatever
 * language they typed it. Those facts are then rendered into a short,
 * clearly-labelled "MACHINE-EXTRACTED" block that index.ts can prepend to the
 * existing prompt context.
 *
 * This is a RETRIEVAL AND CONTEXT AID, not a new source of truth:
 *   - parseQueryFacts is FAIL-OPEN — any parsing or validation problem
 *     degrades to `null`, and the caller is expected to fall back to the
 *     unmodified pipeline (byte-identical to today) rather than block on it.
 *   - buildMachineFactsBlock's own text tells the model these are hints for
 *     the diagnostic protocol's Step 1 (see promptContract.ts), not a
 *     replacement for it — the clarify-first gate in that protocol still
 *     applies. Nothing here authorizes skipping it. The block is declarative
 *     throughout: it states facts and says to confirm them. It contains no
 *     instruction that could relax, reorder, or short-circuit the protocol,
 *     and that is a property to preserve if the wording is ever edited.
 *   - The VALUES inside that block are untrusted. They are echoed back from
 *     the user's own question by the extraction model, so a user could try to
 *     smuggle prompt text through occupancy_group / systems / en_search_terms.
 *     parseQueryFacts flattens every such value to a single line and clamps
 *     its length (see sanitizeValue), so a value cannot forge an extra bullet
 *     or append lines after the block's closing instruction.
 *   - buildQueryAnalysisPrompt instructs the extraction model to report only
 *     what the user actually said and to omit anything it is not sure of;
 *     the AR->EN aliasing table is there to help it recognize the *English*
 *     retrieval term for a concept the user named in Arabic, not to let it
 *     guess unstated values.
 *
 * Everything in this file ships behind ADVISORY_QUERY_ANALYSIS_ENABLED,
 * default OFF, exact-string-"1" semantics (see ./retrievalPolicy.ts for the
 * origin of that idiom). With the flag off, or unset, or wired but never
 * called, this module has zero effect on production behaviour.
 */

// ===========================================================================
// 1. FLAG
// ===========================================================================

/** Same shape as Deno.env.get — injected so this module never touches Deno. */
export type EnvReader = (key: string) => string | undefined;

export const ADVISORY_QUERY_ANALYSIS_FLAG_ENV = "ADVISORY_QUERY_ANALYSIS_ENABLED";

/** True only for the exact string "1". Anything else — unset, "0", "true" — is OFF. */
export function isQueryAnalysisEnabled(env: EnvReader): boolean {
  return env(ADVISORY_QUERY_ANALYSIS_FLAG_ENV) === "1";
}

// ===========================================================================
// 2. QUESTION-TYPE TAXONOMY
// ===========================================================================
//
// Mirrors the Step 0 classification in the ANALYTICAL MODE prompt
// (promptContract.ts, getAnalysisPrompt) verbatim, translated to snake_case
// identifiers, plus a "general_information" fallback for anything that does
// not fit those five buckets (e.g. a plain definitional question).
//
//   مراجعة تصميم منجز              -> completed_design_review
//   مراجعة امتثال مخطط مرفوع        -> drawing_compliance_audit
//   سؤال تقني عن اشتراط محدد        -> specific_code_question
//   استفسار تصنيف إشغال            -> occupancy_classification_query
//   تحقيق في عدم مطابقة            -> non_compliance_investigation
//   (fallback, not in the source taxonomy) -> general_information

export const QUESTION_TYPES = [
  "completed_design_review",
  "drawing_compliance_audit",
  "specific_code_question",
  "occupancy_classification_query",
  "non_compliance_investigation",
  "general_information",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

// ===========================================================================
// 3. QueryFacts
// ===========================================================================

export interface QueryFacts {
  language: "ar" | "en" | "mixed";
  question_type: string;
  occupancy_group?: string;
  storeys?: number;
  height_m?: number;
  area_m2?: number;
  sprinklered?: boolean;
  systems: string[];
  explicit_section_refs: string[];
  explicit_table_ids: string[];
  code_hint?: "SBC201" | "SBC801";
  en_search_terms: string[];
  audience_hint?: "engineer" | "decision_maker" | "project_owner" | "technician";
}

// Clamp limits — applied by parseQueryFacts regardless of what the model
// returns, so a runaway or adversarial response cannot blow up prompt size.
const MAX_SYSTEMS = 10;
const MAX_SEARCH_TERMS = 12;
const MAX_REFS = 10;

// Hard input bounds. These exist to keep parseQueryFacts cheap and total on a
// runaway or adversarial model response, not to validate meaning:
//   - MAX_RAW_LENGTH: fail-open (null) rather than parse a multi-megabyte body.
//   - MAX_ARRAY_INPUT: cap how many array elements are even inspected, so a
//     100k-element array costs a slice, not a full filter pass.
//   - MAX_VALUE_LENGTH: cap each free-text value that reaches the prompt.
const MAX_RAW_LENGTH = 100_000;
const MAX_ARRAY_INPUT = 200;
const MAX_VALUE_LENGTH = 120;

// 903, 903.2, 903.2.1, 1004.5, 1006.2.1, ... — 3 or 4 leading digits (SBC
// chapters run up to 4-digit section numbers, e.g. 1020.1), then any number
// of dotted numeric groups. No letters, no "Section" prefix, no whitespace.
const SECTION_REF_REGEX = /^[0-9]{3,4}(\.[0-9]+)*$/;

// Table ids follow the same shape but may carry one trailing letter, e.g. a
// table split into "1004.5A" / "1004.5B" variants.
const TABLE_ID_REGEX = /^[0-9]{3,4}(\.[0-9]+)*[A-Za-z]?$/;

const AUDIENCE_HINTS = ["engineer", "decision_maker", "project_owner", "technician"] as const;
const CODE_HINTS = ["SBC201", "SBC801"] as const;

// ===========================================================================
// 4. PROMPT
// ===========================================================================
//
// Representative Arabic -> English aliasing pairs, curated from
// routing-notes.md. These are examples for the extraction model, not an
// exhaustive dictionary — the model is expected to generalize the pattern
// (Arabic engineering term -> the English fire-code retrieval term) to
// concepts not listed here, the same way routing-notes.md's own normalization
// rules describe aliasing rather than an exhaustive lookup table.
const AR_EN_ALIAS_PAIRS: Array<[string, string]> = [
  ["اشغال / تصنيف الاشغال", "occupancy / occupancy classification"],
  ["اشغال مختلط", "mixed occupancy"],
  ["مسارات الخروج / مخارج الهروب", "means of egress"],
  ["حاجز حريق", "fire barrier"],
  ["نظام الرش الالي / شبكة الرش", "sprinkler system"],
  ["مقاومة الحريق", "fire-resistance rating"],
  ["التحكم بالدخان", "smoke control"],
  ["مسافة السفر", "travel distance"],
  ["حمل الإشغال", "occupant load"],
  ["عرض الممر", "corridor width"],
  ["باب الخروج", "exit door"],
  ["الدرج / السلم", "stairway / stair"],
  ["مركز قيادة الحريق", "fire command center"],
  ["نظام الإنذار", "fire alarm system"],
  ["كاشف الدخان", "smoke detector"],
  ["مضخة الحريق", "fire pump"],
  ["أنبوب الوقوف (الستاندبايب)", "standpipe"],
  ["الارتفاع الإنشائي", "building height"],
  ["نوع الإنشاء", "construction type"],
  ["مبنى شاهق", "high-rise building"],
  ["طابق تحت الأرض / قبو", "basement"],
  ["باب مقاوم للحريق", "fire-rated door"],
  ["جدار فاصل", "separation wall"],
  ["مخرج الطوارئ", "emergency exit"],
  ["مسافة الوصول القصوى", "maximum travel distance"],
  ["طريق هروب مشترك", "common path of travel"],
  ["لافتة الخروج", "exit sign"],
  ["إضاءة الطوارئ", "emergency lighting"],
];

/**
 * Builds the extraction prompt sent to the small model. English throughout
 * (the model reasons over Arabic and English user text either way; the
 * instructions themselves do not need to be bilingual).
 */
export function buildQueryAnalysisPrompt(userQuery: string): string {
  const aliasLines = AR_EN_ALIAS_PAIRS.map(([ar, en]) => `- ${ar}  ->  ${en}`).join("\n");

  return `You are a fact-extraction step for a Saudi Building Code (SBC 201 / SBC 801) fire-safety advisory system. Read the user's question below and extract ONLY the facts the user actually stated. Do not infer, guess, or fill in a plausible value for anything they did not say — an unstated variable must be left out of your JSON entirely, never approximated.

CRITICAL RULES:
1. Never invent values. If the user did not state a number, a system, an occupancy group, or a code reference, omit that field. Do not default height_m, storeys, area_m2, occupancy_group, sprinklered, code_hint, or audience_hint to a guessed value.
2. Extract "en_search_terms": English fire-code retrieval terms for the question's key concepts. If the user wrote in Arabic, translate the engineering concept to the English term the SBC 201 / SBC 801 text would use for it — use the aliasing examples below as a guide, and generalize the same pattern to concepts not listed.
3. Respond with a single JSON object only. No markdown code fences, no prose before or after, no trailing comments.

Representative Arabic -> English fire-code term aliasing (examples, not exhaustive):
${aliasLines}

Return a JSON object with this shape (all fields except "language" and "question_type" are optional — omit any you cannot support from the user's actual words):

{
  "language": "ar" | "en" | "mixed",
  "question_type": one of ${QUESTION_TYPES.map((t) => `"${t}"`).join(" | ")},
  "occupancy_group": string (e.g. "I-2", "A-3") — only if the user stated it,
  "storeys": number — only if the user stated it,
  "height_m": number — only if the user stated it,
  "area_m2": number — only if the user stated it,
  "sprinklered": boolean — only if the user stated the sprinkler status,
  "systems": string[] — fire-protection systems the user mentioned (e.g. "sprinkler", "standpipe", "alarm"),
  "explicit_section_refs": string[] — code section numbers the user explicitly typed (e.g. "903.2.7"),
  "explicit_table_ids": string[] — table numbers the user explicitly typed,
  "code_hint": "SBC201" | "SBC801" — only if the user named the code or it is unambiguous from context,
  "en_search_terms": string[] — English retrieval terms for the question's key concepts,
  "audience_hint": "engineer" | "decision_maker" | "project_owner" | "technician" — only if inferable from how the user phrased the question
}

USER QUESTION:
${userQuery}`;
}

// ===========================================================================
// 5. PARSER  (fail-open)
// ===========================================================================

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  // Only run the fence regex when the string actually looks fenced on both
  // ends. Without this guard the lazy `([\s\S]*?)` between two `\s*` runs
  // backtracks quadratically over a long unfenced body that merely STARTS
  // with a fence — a cheap denial-of-service on an adversarial model reply.
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) return trimmed;
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Flattens one free-text value into a single safe prompt line.
 *
 * Values in `systems`, `en_search_terms` and `occupancy_group` originate in
 * the user's own question (the extraction model echoes them back), so they are
 * UNTRUSTED TEXT. buildMachineFactsBlock renders them into a bulleted block
 * inside a prompt; a value containing a newline could otherwise forge an extra
 * bullet, or close the block and append arbitrary instructions after it. Every
 * line break and control character is collapsed to a single space here, so a
 * value can only ever occupy the one line it was placed on.
 */
function sanitizeValue(value: string): string {
  return value
    // C0/C1 control characters, including the ones JS \s does not cover.
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ")
    // Every remaining whitespace run (newline, tab, U+00A0, U+2028, ...) to one space.
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_VALUE_LENGTH);
}

function asStringArray(value: unknown, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const candidate of value.slice(0, MAX_ARRAY_INPUT)) {
    if (typeof candidate !== "string") continue;
    const cleaned = sanitizeValue(candidate);
    if (cleaned.length === 0) continue;
    out.push(cleaned);
    if (out.length >= maxLen) break;
  }
  return out;
}

function asValidatedStringArray(value: unknown, regex: RegExp, maxLen: number): string[] {
  // The regexes are fully anchored and reject whitespace, so sanitizeValue
  // cannot turn an invalid ref into a valid one — it only trims the noise that
  // would have been rejected anyway.
  return asStringArray(value, MAX_ARRAY_INPUT)
    .filter((s) => regex.test(s))
    .slice(0, maxLen);
}

/**
 * Parses and validates a raw model response into QueryFacts.
 *
 * FAIL-OPEN: unparseable JSON, an over-long body, or a missing/invalid
 * required field (language, question_type), returns null — the caller falls
 * back to the unmodified pipeline. An invalid or wrong-typed OPTIONAL field is
 * dropped silently; the rest of the object survives.
 *
 * TOTAL: this function must never throw, for any input, including one that is
 * not a string at all (the signature is advisory only — the value crosses an
 * untyped model-response boundary at the call site). Every value read off the
 * parsed object is type-checked before use, and JSON.parse is the only call
 * that can throw, which is why it is the only one inside a try.
 */
export function parseQueryFacts(raw: string): QueryFacts | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  if (raw.length > MAX_RAW_LENGTH) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const language = obj.language;
  if (language !== "ar" && language !== "en" && language !== "mixed") return null;

  const questionType = obj.question_type;
  if (typeof questionType !== "string" || !(QUESTION_TYPES as readonly string[]).includes(questionType)) {
    return null;
  }

  const facts: QueryFacts = {
    language,
    question_type: questionType,
    systems: asStringArray(obj.systems, MAX_SYSTEMS),
    explicit_section_refs: asValidatedStringArray(obj.explicit_section_refs, SECTION_REF_REGEX, MAX_REFS),
    explicit_table_ids: asValidatedStringArray(obj.explicit_table_ids, TABLE_ID_REGEX, MAX_REFS),
    en_search_terms: asStringArray(obj.en_search_terms, MAX_SEARCH_TERMS),
  };

  if (typeof obj.occupancy_group === "string") {
    // Free text from the user's own question — sanitize like any other value
    // that reaches the prompt block (see sanitizeValue).
    const occupancyGroup = sanitizeValue(obj.occupancy_group);
    if (occupancyGroup.length > 0) facts.occupancy_group = occupancyGroup;
  }
  if (typeof obj.storeys === "number" && Number.isFinite(obj.storeys)) {
    facts.storeys = obj.storeys;
  }
  if (typeof obj.height_m === "number" && Number.isFinite(obj.height_m)) {
    facts.height_m = obj.height_m;
  }
  if (typeof obj.area_m2 === "number" && Number.isFinite(obj.area_m2)) {
    facts.area_m2 = obj.area_m2;
  }
  if (typeof obj.sprinklered === "boolean") {
    facts.sprinklered = obj.sprinklered;
  }
  if (typeof obj.code_hint === "string" && (CODE_HINTS as readonly string[]).includes(obj.code_hint)) {
    facts.code_hint = obj.code_hint as "SBC201" | "SBC801";
  }
  if (typeof obj.audience_hint === "string" && (AUDIENCE_HINTS as readonly string[]).includes(obj.audience_hint)) {
    facts.audience_hint = obj.audience_hint as QueryFacts["audience_hint"];
  }

  return facts;
}

// ===========================================================================
// 6. MACHINE FACTS BLOCK
// ===========================================================================

export const MACHINE_FACTS_LABEL = "MACHINE-EXTRACTED QUESTION FACTS (confirm before relying):";

/**
 * Renders a labelled, human-readable context block from QueryFacts, listing
 * only the fields actually present (arrays only when non-empty). This block
 * is meant to be prepended to the existing prompt context for the diagnostic
 * protocol's Step 1 (promptContract.ts) — it never bypasses that step's
 * clarify-first gate, which is why the closing line says so explicitly.
 */
export function buildMachineFactsBlock(facts: QueryFacts): string {
  const lines: string[] = [MACHINE_FACTS_LABEL];

  lines.push(`- language: ${facts.language}`);
  lines.push(`- question_type: ${facts.question_type}`);
  if (facts.occupancy_group !== undefined) lines.push(`- occupancy_group: ${facts.occupancy_group}`);
  if (facts.storeys !== undefined) lines.push(`- storeys: ${facts.storeys}`);
  if (facts.height_m !== undefined) lines.push(`- height_m: ${facts.height_m}`);
  if (facts.area_m2 !== undefined) lines.push(`- area_m2: ${facts.area_m2}`);
  if (facts.sprinklered !== undefined) lines.push(`- sprinklered: ${facts.sprinklered}`);
  if (facts.systems.length > 0) lines.push(`- systems: ${facts.systems.join(", ")}`);
  if (facts.explicit_section_refs.length > 0) {
    lines.push(`- explicit_section_refs: ${facts.explicit_section_refs.join(", ")}`);
  }
  if (facts.explicit_table_ids.length > 0) {
    lines.push(`- explicit_table_ids: ${facts.explicit_table_ids.join(", ")}`);
  }
  if (facts.code_hint !== undefined) lines.push(`- code_hint: ${facts.code_hint}`);
  if (facts.en_search_terms.length > 0) lines.push(`- en_search_terms: ${facts.en_search_terms.join(", ")}`);
  if (facts.audience_hint !== undefined) lines.push(`- audience_hint: ${facts.audience_hint}`);

  lines.push(
    "These are extraction hints for the diagnostic protocol's Step 1 — confirm with the user when a critical variable is uncertain; they never bypass the clarify-first gate.",
  );

  return lines.join("\n");
}

// ===========================================================================
// 7. AUDIENCE RESOLUTION (P6, request-level — independent of both P6 flags)
// ===========================================================================
//
// Resolves which audience a standard/analysis text response should be
// written for. Precedence: an explicit, VALID request-level audience wins
// outright (including the literal "engineer" — an explicit "engineer"
// request is not "no audience", it is a request FOR the engineer default,
// and it still must outrank a facts.audience_hint the same way any other
// explicit value would); otherwise a valid facts.audience_hint (query-
// analysis extraction, ADVISORY_QUERY_ANALYSIS_ENABLED) is used; otherwise
// the default is "engineer".
//
// Both inputs are untrusted — the request body comes straight from the
// caller and the facts hint is echoed back from the user's own question by
// the extraction model (see the module header's note on QueryFacts values)
// — so both are typed `unknown` and validated against the exact
// AUDIENCE_HINTS set. An invalid, malformed, or adversarial value in EITHER
// slot degrades to "not provided" and falls through to the next tier; this
// function never throws and never resolves to anything outside the four
// known values.
//
// index.ts is the only caller: it appends promptContract.ts's
// getAudienceBlock(audience, language) to the system prompt when (and only
// when) the resolved value here is not "engineer" — that gate is what keeps
// index.ts's byte-identical-when-absent guarantee intact when no audience
// was requested and no hint was extracted. This resolution itself runs
// regardless of ADVISORY_QUERY_ANALYSIS_ENABLED / ADVISORY_QUERY_DERIVATION_ENABLED
// — an explicit request-level audience must work even with both flags off.
export type AudienceValue = (typeof AUDIENCE_HINTS)[number];

export function resolveAudience(requestAudience: unknown, factsHint?: unknown): AudienceValue {
  if (typeof requestAudience === "string" && (AUDIENCE_HINTS as readonly string[]).includes(requestAudience)) {
    return requestAudience as AudienceValue;
  }
  if (typeof factsHint === "string" && (AUDIENCE_HINTS as readonly string[]).includes(factsHint)) {
    return factsHint as AudienceValue;
  }
  return "engineer";
}
