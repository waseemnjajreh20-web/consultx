/**
 * analyticalBenchmark.ts
 *
 * Curated benchmark cases for ConsultX Analytical Mode.
 *
 * Each case documents a realistic engineering scenario and its expected
 * behavior across five dimensions:
 *   routing      — which sbc_code_tables IDs must be fetched
 *   classification — occupancy group or problem type Analytical mode should identify
 *   governingCode  — which SBC document + chapter drives the answer
 *   verdictBehavior — "hard-stop" | "conditional" | "can-conclude"
 *   requiresClarification — whether 1+ targeted clarification question is mandatory
 *
 * Verdict behavior definitions:
 *   hard-stop       No partial analysis; model must stop and ask for critical inputs
 *   conditional     Partial analysis possible but final verdict must be withheld/qualified
 *   can-conclude    All required data is present; a deterministic answer is expected
 *
 * This file is intentionally NOT a test file.
 * It is imported by analyticalRouting.test.ts which validates routing behavior,
 * and serves as the living specification for manual LLM quality review.
 */

export interface BenchmarkCase {
  id: string;
  description: string;
  query: string;                     // User input (English or Arabic)
  language: "en" | "ar";
  // Routing expectations
  mustHitTableIds: string[];         // At least these IDs must be returned by extractTableIds
  mustNotHitTableIds?: string[];     // These IDs must NOT be returned (prevents false-positives)
  // Analytical mode behavioral expectations
  expectedClassification: string;   // E.g., "Occupancy Classification Query" or "Group A-2"
  expectedGoverningCode: string;     // E.g., "SBC 201 Ch. 3, Table 303"
  expectedVerdictBehavior: "hard-stop" | "conditional" | "can-conclude";
  requiresClarification: boolean;
  criticalMissingInputs?: string[];  // Named data gaps that should trigger hard-stop
  expectedConflicts?: string[];      // Known conflicts the model should detect
  structuredPathExpected: boolean;   // True if DB table fetch must occur (not pure RAG)
  notes?: string;
}

// ── CHAPTER 3 — Occupancy Classification ─────────────────────────────────

export const CASE_OC_01: BenchmarkCase = {
  id: "OC-01",
  description: "Open occupancy classification query — no building data provided",
  query: "ما هو تصنيف الإشغال الصحيح لمطعم بمساحة 400 متر مربع يستوعب 180 شخصاً؟",
  language: "ar",
  mustHitTableIds: ["302", "303"],
  expectedClassification: "Occupancy Classification Query",
  expectedGoverningCode: "SBC 201 Ch. 3, Table 303",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  structuredPathExpected: true,
  notes: "Restaurant with fixed seating >50 → A-2. Table 303 provides assembly occupancy thresholds.",
};

export const CASE_OC_02: BenchmarkCase = {
  id: "OC-02",
  description: "Mixed-use building — office + retail, needs classification of both",
  query: "A 10-storey building has floors 1–3 as retail shops and floors 4–10 as open-plan offices. What occupancy groups apply and how should mixed occupancy be handled?",
  language: "en",
  mustHitTableIds: ["304", "309", "508", "508.4", "508.5"],
  expectedClassification: "Occupancy Classification Query + Mixed Occupancy",
  expectedGoverningCode: "SBC 201 Ch. 3 (Tables 304, 309) + Ch. 5 Section 508",
  expectedVerdictBehavior: "conditional",
  requiresClarification: true,
  criticalMissingInputs: ["total floor area per occupancy", "separation barriers installed?"],
  structuredPathExpected: true,
  notes: "B occupancy (offices) + M occupancy (retail) on same structure = mixed occupancy. Verdict conditioned on whether separated or nonseparated approach chosen.",
};

export const CASE_OC_03: BenchmarkCase = {
  id: "OC-03",
  description: "Hard-stop: no occupancy data at all, just 'building'",
  query: "هل يحتاج هذا المبنى إلى رشاشات؟",
  language: "ar",
  mustHitTableIds: ["903.2"],
  expectedClassification: "Occupancy Classification Query",
  expectedGoverningCode: "SBC 801 Ch. 9, Table 903.2",
  expectedVerdictBehavior: "hard-stop",
  requiresClarification: true,
  criticalMissingInputs: ["occupancy group", "building height / stories", "floor area"],
  structuredPathExpected: true,
  notes: "Sprinkler requirement depends on occupancy + height + area. Hard-stop mandatory.",
};

// ── CHAPTER 4 — Special Occupancies ──────────────────────────────────────

export const CASE_SP_01: BenchmarkCase = {
  id: "SP-01",
  description: "High-rise classification and system trigger",
  query: "مبنى سكني شاهق ارتفاعه 68 متراً (20 طابقاً). ما هي الاشتراطات الإضافية التي تنطبق عليه؟",
  language: "ar",
  mustHitTableIds: ["403.1"],
  expectedClassification: "Completed Design Review / High-rise",
  expectedGoverningCode: "SBC 201 Section 403.1 + SBC 801 Section 903.2 + 907.2",
  expectedVerdictBehavior: "conditional",
  requiresClarification: true,
  criticalMissingInputs: ["sprinkler system installed?", "fire command center provided?"],
  structuredPathExpected: true,
  notes: ">55 ft (>16.8 m) = high-rise trigger. SBC 201 403.1 mandates sprinkler + alarm + FCC. Routing detects 'شاهق' for 403.1. 903.2/907.2 are inferred by LLM from 403.1 context.",
};

export const CASE_SP_02: BenchmarkCase = {
  id: "SP-02",
  description: "Hospital / I-2 occupancy special requirements",
  query: "Healthcare facility — I-2 occupancy, 4-storey hospital, fully sprinklered. What special requirements apply under SBC 201 Section 407?",
  language: "en",
  mustHitTableIds: ["407", "308"],
  expectedClassification: "Completed Design Review / I-2 Healthcare",
  expectedGoverningCode: "SBC 201 Section 407, Tables 308, 903.2, 907.2",
  expectedVerdictBehavior: "conditional",
  requiresClarification: true,
  criticalMissingInputs: ["number of care recipients", "smoke compartment size"],
  structuredPathExpected: true,
};

export const CASE_SP_03: BenchmarkCase = {
  id: "SP-03",
  description: "Atrium smoke control requirement",
  query: "The design includes a 4-storey atrium connecting all floors. Is a smoke control system required?",
  language: "en",
  mustHitTableIds: ["404", "909"],
  expectedClassification: "Specific Code Question — Atrium Smoke Control",
  expectedGoverningCode: "SBC 201 Section 404 + SBC 801 Section 909",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  expectedConflicts: ["Open atrium penetrates floor separations — smoke control mandatory per 404"],
  structuredPathExpected: true,
  notes: "Atrium ≥2 floors in height requires smoke control per Section 404. Can conclude without additional data.",
};

export const CASE_SP_04: BenchmarkCase = {
  id: "SP-04",
  description: "Covered mall building occupancy and egress",
  query: "مول تجاري مغطى مساحته 25,000 م². ما هي متطلبات الإخلاء الخاصة به؟",
  language: "ar",
  mustHitTableIds: ["402"],
  expectedClassification: "Covered Mall — Special Occupancy (SBC 201 402)",
  expectedGoverningCode: "SBC 201 Section 402 + Chapter 10 Egress",
  expectedVerdictBehavior: "conditional",
  requiresClarification: true,
  criticalMissingInputs: ["number of anchor stores", "anchor store occupant load calculations"],
  structuredPathExpected: true,
};

// ── CHAPTER 9 — Fire Protection Systems ──────────────────────────────────

export const CASE_FP_01: BenchmarkCase = {
  id: "FP-01",
  description: "Sprinkler requirement: correct table hit + occupancy/height needed",
  query: "An office building (Group B), 5 storeys, 4,500 m² per floor. Are sprinklers required?",
  language: "en",
  mustHitTableIds: ["903.2", "304"],
  expectedClassification: "Specific Code Question — Sprinkler Requirement",
  expectedGoverningCode: "SBC 801 Table 903.2 + SBC 201 Section 304",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  structuredPathExpected: true,
  notes: "Group B, 5 storeys, 22,500 m² total → sprinkler required under 903.2 thresholds.",
};

export const CASE_FP_02: BenchmarkCase = {
  id: "FP-02",
  description: "Standpipe class and location — specific code question",
  query: "A high-rise mixed-use building, 12 storeys. What class of standpipe system is required and where must hose connections be located?",
  language: "en",
  mustHitTableIds: ["905.3.1", "403.1"],
  expectedClassification: "Specific Code Question — Standpipe",
  expectedGoverningCode: "SBC 801 Section 905.3.1",
  expectedVerdictBehavior: "conditional",
  requiresClarification: true,
  criticalMissingInputs: ["occupancy group", "floor area per storey"],
  structuredPathExpected: true,
};

export const CASE_FP_03: BenchmarkCase = {
  id: "FP-03",
  description: "Fire alarm: where required, plus pull station placement",
  query: "ما هي المتطلبات التي تستوجب نظام إنذار حريق في مبنى تعليمي مدرسي مؤلف من 3 طوابق؟",
  language: "ar",
  mustHitTableIds: ["907.2", "305"],
  expectedClassification: "Specific Code Question — Fire Alarm, Educational Occupancy",
  expectedGoverningCode: "SBC 801 Table 907.2 + Section 907.4.2",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  structuredPathExpected: true,
  notes: "Group E = educational. 907.2 mandates fire alarm. 907.4.2 governs pull station placement.",
};

export const CASE_FP_04: BenchmarkCase = {
  id: "FP-04",
  description: "Conflict detection: sprinkler-exempt claim vs. occupancy trigger",
  query: "The architect claims the building is sprinkler-exempt. It is a 3-storey residential Group R-2 building with 80 dwelling units and total area of 8,000 m².",
  language: "en",
  mustHitTableIds: ["903.2", "310"],
  expectedClassification: "Non-compliance Investigation — Sprinkler Exemption Claim",
  expectedGoverningCode: "SBC 801 Table 903.2",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  expectedConflicts: [
    "R-2 residential, 80 units, 8,000 m² exceeds sprinkler-exempt thresholds under 903.2 — architect claim appears incorrect"
  ],
  structuredPathExpected: true,
  notes: "Model must detect the conflict between architect's claim and code trigger. Deterministic conflict verdict expected.",
};

// ── CHAPTER 10 — Egress ───────────────────────────────────────────────────

export const CASE_EG_01: BenchmarkCase = {
  id: "EG-01",
  description: "Travel distance — specific occupancy and sprinkler status",
  query: "What is the maximum travel distance for a Group A-2 assembly occupancy, restaurant use, with a sprinkler system?",
  language: "en",
  mustHitTableIds: ["1017.2", "303"],
  expectedClassification: "Specific Code Question — Travel Distance",
  expectedGoverningCode: "SBC 201 Table 1017.2",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  structuredPathExpected: true,
};

export const CASE_EG_02: BenchmarkCase = {
  id: "EG-02",
  description: "Number of exits: hard-stop when occupant load unknown",
  query: "كم عدد المخارج المطلوبة لهذا الطابق؟",
  language: "ar",
  mustHitTableIds: ["1021.2"],
  expectedClassification: "Specific Code Question — Number of Exits",
  expectedGoverningCode: "SBC 201 Table 1021.2",
  expectedVerdictBehavior: "hard-stop",
  requiresClarification: true,
  criticalMissingInputs: ["occupant load", "occupancy group", "floor area"],
  structuredPathExpected: true,
  notes: "Cannot determine number of exits without occupant load. Hard-stop mandatory.",
};

export const CASE_EG_03: BenchmarkCase = {
  id: "EG-03",
  description: "Corridor width and fire rating — complete data",
  query: "An I-2 healthcare facility corridor. The architect proposes 1.5 m width, unrated. Is this compliant?",
  language: "en",
  mustHitTableIds: ["1018.1", "1020.1", "407"],
  expectedClassification: "Drawing Compliance Audit — Corridor",
  expectedGoverningCode: "SBC 201 Tables 1018.1 and 1020.1 + Section 407",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  expectedConflicts: [
    "I-2 corridor requires minimum 2440 mm (8 ft) width — 1.5 m is non-compliant",
    "I-2 corridor fire rating must be 1 hour — unrated is non-compliant",
  ],
  structuredPathExpected: true,
};

export const CASE_EG_04: BenchmarkCase = {
  id: "EG-04",
  description: "Emergency lighting requirement — conditional on sprinkler status",
  query: "هل يُشترط إضاءة الطوارئ في سلالم مبنى سكني من 4 طوابق؟",
  language: "ar",
  mustHitTableIds: ["1008", "310"],
  expectedClassification: "Specific Code Question — Emergency Lighting",
  expectedGoverningCode: "SBC 201 Section 1008",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  structuredPathExpected: true,
};

// ── MIXED OCCUPANCY ───────────────────────────────────────────────────────

export const CASE_MX_01: BenchmarkCase = {
  id: "MX-01",
  description: "Separated vs nonseparated mixed occupancy — explicit code question",
  query: "What is the difference between separated and nonseparated mixed occupancies under SBC 201 Section 508? Which approach requires a fire barrier?",
  language: "en",
  mustHitTableIds: ["508.4", "508.5"],
  expectedClassification: "Specific Code Question — Mixed Occupancy",
  expectedGoverningCode: "SBC 201 Section 508.4 (nonseparated) and 508.5 (separated)",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  structuredPathExpected: true,
};

// ── CONSTRUCTION TYPE ─────────────────────────────────────────────────────

export const CASE_CT_01: BenchmarkCase = {
  id: "CT-01",
  description: "Fire resistance rating for structural frame — conflict with proposed type",
  query: "A 6-storey Group B office building is proposed as Type III-B construction. The structural steel frame has no spray fireproofing. Is this acceptable?",
  language: "en",
  mustHitTableIds: ["601", "304"],
  expectedClassification: "Drawing Compliance Audit — Construction Type",
  expectedGoverningCode: "SBC 201 Table 601",
  expectedVerdictBehavior: "conditional",
  requiresClarification: true,
  criticalMissingInputs: ["allowable area per storey", "sprinkler system installed?"],
  expectedConflicts: [
    "Type III-B requires 0-hour structural frame — but height may trigger higher type requirement; needs area verification"
  ],
  structuredPathExpected: true,
};

// ── MULTIMODAL / DOCUMENT-INFORMED ───────────────────────────────────────

export const CASE_MM_01: BenchmarkCase = {
  id: "MM-01",
  description: "Document Intelligence Summary present — extraction confidence high",
  query: "Based on the attached floor plan (Group A-2 assembly occupancy restaurant, 350 m², 2 exits shown), verify egress compliance.",
  language: "en",
  mustHitTableIds: ["303"],
  expectedClassification: "Drawing Compliance Audit — Egress",
  expectedGoverningCode: "SBC 201 Ch. 10 Tables 1004.5, 1005.1, 1017.2, 1021.2",
  expectedVerdictBehavior: "conditional",
  requiresClarification: true,
  criticalMissingInputs: ["sprinkler system status (affects travel distance)", "actual occupant load calculation"],
  structuredPathExpected: true,
  notes: "When DIS block is present with high confidence, model should use extracted dimensions and not request re-upload. Extraction quality = high → analysis should proceed, not hard-stop.",
};

export const CASE_MM_02: BenchmarkCase = {
  id: "MM-02",
  description: "Document Intelligence Summary present — extraction confidence LOW",
  query: "Analyze this drawing for fire system compliance.",
  language: "en",
  mustHitTableIds: [],
  mustNotHitTableIds: [],
  expectedClassification: "Drawing Compliance Audit — Indeterminate (low confidence)",
  expectedGoverningCode: "Cannot determine — extraction quality insufficient",
  expectedVerdictBehavior: "hard-stop",
  requiresClarification: true,
  criticalMissingInputs: ["building type", "occupancy group", "floor area", "readable drawing required"],
  structuredPathExpected: false,
  notes: "When DIS block reports imageQuality=low or illegible, model must NOT fabricate extracted data. Must flag low confidence and request clarification.",
};

export const CASE_MM_03: BenchmarkCase = {
  id: "MM-03",
  description: "CSV schedule file provided — project data should be used in analysis",
  query: "I've uploaded the room data schedule (CSV). Based on this, determine the occupant load and number of exits required for Floor 2.",
  language: "en",
  mustHitTableIds: ["1004.5", "1021.2"],
  expectedClassification: "Completed Design Review — Occupant Load + Exit Count",
  expectedGoverningCode: "SBC 201 Tables 1004.5, 1021.2",
  expectedVerdictBehavior: "can-conclude",
  requiresClarification: false,
  structuredPathExpected: true,
  notes: "When USER-PROVIDED DOCUMENTS block contains CSV room schedule, model must USE that data as primary input rather than requesting it again.",
};

// ── FULL BENCHMARK REGISTRY ───────────────────────────────────────────────

export const ALL_BENCHMARK_CASES: BenchmarkCase[] = [
  CASE_OC_01, CASE_OC_02, CASE_OC_03,
  CASE_SP_01, CASE_SP_02, CASE_SP_03, CASE_SP_04,
  CASE_FP_01, CASE_FP_02, CASE_FP_03, CASE_FP_04,
  CASE_EG_01, CASE_EG_02, CASE_EG_03, CASE_EG_04,
  CASE_MX_01,
  CASE_CT_01,
  CASE_MM_01, CASE_MM_02, CASE_MM_03,
];

// Subset: cases where extractTableIds routing can be validated automatically
export const ROUTING_TESTABLE_CASES = ALL_BENCHMARK_CASES.filter(
  c => c.mustHitTableIds.length > 0
);

// Subset: cases where a hard-stop is mandatory
export const HARD_STOP_CASES = ALL_BENCHMARK_CASES.filter(
  c => c.expectedVerdictBehavior === "hard-stop"
);

// Subset: cases that must use the structured DB path
export const STRUCTURED_PATH_CASES = ALL_BENCHMARK_CASES.filter(
  c => c.structuredPathExpected
);
