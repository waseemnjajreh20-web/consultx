/**
 * ruleEngine.types.ts — types for the deterministic SBC fire/life-safety rule
 * layer (RASE: Requirement-Applicability-Selection-Exception). Framework-free,
 * no React/Supabase — mirrors rules/schema.json exactly (JSON Schema 2020-12).
 * See docs/launch/rule-engine-notes.md for the lifecycle and integration plan.
 *
 * Purpose: numeric SBC requirements (travel distance, occupant load factors,
 * sprinkler thresholds, fire-resistance ratings, corridor/exit/door widths,
 * standpipe triggers, ...) must never be guessed by an LLM. This module is
 * the shared type contract between the rules data files and the evaluator
 * (ruleEngine.ts). Every rule carries provenance (code, section, page,
 * verbatim quote) back to the SBC PDF it was transcribed from.
 *
 * This file intentionally does NOT import from src/lib/buildingProfile.ts:
 * the two modules are being developed concurrently and must not couple to
 * each other's in-flight state. The occupancy-group / construction-type
 * value sets below are kept string-compatible with BuildingProfile's, with
 * ONE deliberate divergence flagged below (Type IV sub-types) - see notes.md.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared enums / value sets
// ─────────────────────────────────────────────────────────────────────────────

/** The four SBC volumes this engine (eventually) covers. v0 only ships SBC201/SBC801 rules. */
export const SBC_CODES = ["SBC201", "SBC801", "SBC401", "SBC501"] as const;
export type SBCCode = (typeof SBC_CODES)[number];

export const RULE_STATUSES = ["draft", "engineer_validated", "live"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const VERDICTS = ["complies", "violates", "not_applicable", "insufficient_data"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const COMPARISON_OPERATORS = ["eq", "in", "gt", "gte", "lt", "lte", "between", "exists"] as const;
export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

export const THRESHOLD_COMPARATORS = ["eq", "ne", "lt", "lte", "gt", "gte"] as const;
export type ThresholdComparator = (typeof THRESHOLD_COMPARATORS)[number];

/**
 * mm/m only for length per the operating contract. The remaining units cover
 * the non-length numeric outputs this v0 set actually needs (fire-resistance
 * hours, exit counts, revolving-door RPM); "" is for dimensionless/label rows.
 */
export const UNITS = ["mm", "m", "m2", "hours", "rpm", "count", "ratio", ""] as const;
export type Unit = (typeof UNITS)[number];

/**
 * SBC 201-CC-2024 occupancy groups. Matches buildingProfile.ts's 26-value list
 * (same strings), duplicated locally on purpose - see file header.
 */
export const OCCUPANCY_GROUPS = [
  "A-1", "A-2", "A-3", "A-4", "A-5",
  "B",
  "E",
  "F-1", "F-2",
  "H-1", "H-2", "H-3", "H-4", "H-5",
  "I-1", "I-2", "I-3", "I-4",
  "M",
  "R-1", "R-2", "R-3", "R-4",
  "S-1", "S-2",
  "U",
] as const;
export type OccupancyGroup = (typeof OCCUPANCY_GROUPS)[number];

/**
 * Construction types as actually PRINTED in SBC 201-CC-2024 Tables 504.3,
 * 504.4, 506.2 and 601 (12 columns: Type IV is split into IV-A/IV-B/IV-C/
 * IV-HT mass-timber sub-types). NOTE - this deliberately diverges from
 * buildingProfile.ts's CONSTRUCTION_TYPES (9 values, bare "IV"): that list
 * predates the 2024 mass-timber sub-types visible in the rebuilt tables this
 * rule set cites. Flagged in docs/launch/rule-engine-notes.md for the owner;
 * NOT fixed here (buildingProfile.ts is out of scope for this task).
 */
export const CONSTRUCTION_TYPES = [
  "I-A", "I-B", "II-A", "II-B", "III-A", "III-B", "IV-A", "IV-B", "IV-C", "IV-HT", "V-A", "V-B",
] as const;
export type ConstructionType = (typeof CONSTRUCTION_TYPES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Conditions (applicability / exceptions / table-row matching all reuse this)
// ─────────────────────────────────────────────────────────────────────────────

export type ConditionValue = string | number | boolean | (string | number)[] | [number, number] | null | undefined;

export interface Condition {
  /** Named parameter, e.g. occupancy_group, stories, height_m, gross_area_m2,
   *  floor_area_m2, sprinklered, construction_type, occupant_load,
   *  story_of_discharge, or a rule-scoped extra (e.g. corridor_width_mm). */
  parameter: string;
  operator: ComparisonOperator;
  value?: ConditionValue;
}

export interface Applicability {
  /** AND-combined. */
  conditions: Condition[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Provenance / validation
// ─────────────────────────────────────────────────────────────────────────────

export interface Provenance {
  code: SBCCode;
  /** Section or table number as printed, e.g. "504.3", "Table 601", "903.2.8". */
  section: string;
  /** Printed page number in the source PDF, when known. */
  page?: number;
  /** Verbatim excerpt, <=300 chars. */
  quote?: string;
  extracted_by: string;
  /** ISO date. */
  extracted_at: string;
  source_note?: string;
}

export interface ValidationMeta {
  engineer?: string;
  validated_at?: string;
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement kinds (discriminated union on "kind")
// ─────────────────────────────────────────────────────────────────────────────

export interface ThresholdRequirement {
  kind: "threshold";
  parameter: string;
  comparator: ThresholdComparator;
  value: number;
  unit: Unit;
}

export interface TableRow {
  id: string;
  /** AND-combined; row applies when every condition matches. */
  match: Condition[];
  /** Numeric looked-up value, or the literal "NP" (the code marks it Not Permitted outright). */
  value: number | "NP";
  unit?: Unit;
  notes?: string;
  /** Per-row provenance override; falls back to the rule-level provenance when absent. */
  provenance?: Provenance;
}

export interface TableLookupRequirement {
  kind: "table_lookup";
  /** Documents which parameters select a row; matching itself is driven by each row's own `match`. */
  keys: string[];
  /** How a declared/observed parameter is compared against the looked-up row value. */
  compare: { parameter: string; comparator: ThresholdComparator };
  rows: TableRow[];
  /** Verdict when no row's conditions match (default "not_applicable"). */
  no_match_verdict?: "not_applicable" | "insufficient_data";
}

export interface BooleanRequirement {
  kind: "boolean";
  parameter: string;
  equals: boolean;
}

export interface FormulaRequirement {
  kind: "formula";
  /** Safe subset only: + - * / min() max() and bare parameter references. No eval(). */
  expression: string;
  compare: { parameter: string; comparator: ThresholdComparator };
  unit?: Unit;
}

export type Requirement = ThresholdRequirement | TableLookupRequirement | BooleanRequirement | FormulaRequirement;

// ─────────────────────────────────────────────────────────────────────────────
// Exceptions
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleException {
  id: string;
  /** AND-combined; the exception applies only when ALL conditions are definitively true. */
  conditions: Condition[];
  effect: "override" | "waive";
  /** Required when effect === "override". */
  override_verdict?: Verdict;
  note_ar: string;
  note_en?: string;
  provenance: Provenance;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleOutputs {
  /** Arabic explanation template; {parameter} placeholders filled from params/computed values. */
  explanation_ar: string;
  explanation_en?: string;
}

export interface Rule {
  id: string;
  code: SBCCode;
  section: string;
  title_ar: string;
  title_en: string;
  status: RuleStatus;
  applicability: Applicability;
  requirement: Requirement;
  exceptions?: RuleException[];
  outputs: RuleOutputs;
  provenance: Provenance;
  validation?: ValidationMeta;
  /** Ambiguities in the printed code, partial-table coverage, interpretive expansions. */
  notes?: string;
}

export interface RuleFile {
  schema_version: string;
  code_family: string;
  generated_at: string;
  rules: Rule[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/** Loosely-typed bag of building/query facts the engine evaluates rules against. */
export type RuleParams = Record<string, string | number | boolean | undefined | null>;

export interface EvaluationResult {
  rule_id: string;
  verdict: Verdict;
  /** Parameters the engine needed but did not receive - never guessed. */
  missing_parameters: string[];
  applied_exception?: string;
  explanation_ar: string;
  provenance: Provenance;
  /** table_lookup only: which row matched. */
  matched_row_id?: string;
  /** table_lookup/formula only: the looked-up or computed value that drove the verdict. */
  computed_value?: number | string;
}
