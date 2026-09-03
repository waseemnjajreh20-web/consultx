/**
 * ruleEngine.ts — deterministic evaluator for the SBC fire/life-safety rule
 * layer (RASE: Requirement-Applicability-Selection-Exception). Pure,
 * framework-free TypeScript: no React, no Supabase client, no network I/O,
 * no `eval()`. Safe to import from tests, the browser, or an edge function.
 *
 * Why this exists: numeric SBC requirements (egress travel distance, common
 * path, occupant load factors, sprinkler thresholds, fire-resistance
 * ratings, corridor/exit/door widths, ...) must never be guessed by an LLM.
 * This module loads a hand-validated rules/*.json file and evaluates one or
 * many rules against a bag of building/query parameters, returning a verdict
 * that always carries the rule's provenance back to the SBC PDF.
 *
 * Guiding invariants (see docs/launch/rule-engine-notes.md for the full
 * write-up):
 *  - never guess: a missing parameter yields "insufficient_data", not a
 *    default value.
 *  - a single definite applicability mismatch yields "not_applicable" even
 *    if other applicability parameters are also missing (one hard "no" is
 *    conclusive regardless of what else is unknown).
 *  - an exception only fires when ALL of its conditions are definitively
 *    true; an exception with an unresolved (missing-data) condition is
 *    treated as NOT applying, so evaluation falls through to the stricter
 *    base requirement instead of silently assuming relief.
 *  - a table_lookup row whose printed cell is "Not Permitted" always
 *    produces "violates" the moment that row is matched - there is nothing
 *    to compare, the configuration itself is disallowed.
 */

import type {
  Rule,
  RuleFile,
  RuleParams,
  RuleStatus,
  Condition,
  ConditionValue,
  Requirement,
  TableRow,
  RuleException,
  EvaluationResult,
  Verdict,
} from "./ruleEngine.types";
import {
  SBC_CODES,
  RULE_STATUSES,
  VERDICTS,
  COMPARISON_OPERATORS,
  THRESHOLD_COMPARATORS,
  UNITS,
} from "./ruleEngine.types";

// ─────────────────────────────────────────────────────────────────────────────
// Hand-written schema validator (no new deps - mirrors rules/schema.json)
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationOutcome {
  ok: boolean;
  errors: string[];
  rules?: Rule[];
}

const ID_PATTERN = /^[A-Z0-9]+-[A-Za-z0-9.()_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pushErr(errors: string[], path: string, message: string): void {
  errors.push(`${path}: ${message}`);
}

function validateCondition(c: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(c)) {
    pushErr(errors, path, "must be an object");
    return;
  }
  if (typeof c.parameter !== "string" || c.parameter.length === 0) {
    pushErr(errors, `${path}.parameter`, "must be a non-empty string");
  }
  if (typeof c.operator !== "string" || !(COMPARISON_OPERATORS as readonly string[]).includes(c.operator)) {
    pushErr(errors, `${path}.operator`, `must be one of ${COMPARISON_OPERATORS.join(", ")}`);
    return;
  }
  if (c.operator === "exists") {
    if ("value" in c && c.value !== undefined) {
      pushErr(errors, `${path}.value`, "'exists' takes no value");
    }
    return;
  }
  if (!("value" in c) || c.value === undefined) {
    pushErr(errors, `${path}.value`, `required for operator '${c.operator}'`);
    return;
  }
  if (c.operator === "in" && !(Array.isArray(c.value) && c.value.length >= 1)) {
    pushErr(errors, `${path}.value`, "'in' requires a non-empty array");
  }
  if (c.operator === "between" && !(Array.isArray(c.value) && c.value.length === 2 && c.value.every((n) => typeof n === "number"))) {
    pushErr(errors, `${path}.value`, "'between' requires a [min, max] numeric pair");
  }
  if (["gt", "gte", "lt", "lte"].includes(c.operator) && typeof c.value !== "number") {
    pushErr(errors, `${path}.value`, `'${c.operator}' requires a numeric value`);
  }
}

function validateProvenance(p: unknown, path: string, errors: string[], requireQuote: boolean): void {
  if (!isPlainObject(p)) {
    pushErr(errors, path, "must be an object");
    return;
  }
  if (typeof p.code !== "string" || !(SBC_CODES as readonly string[]).includes(p.code)) {
    pushErr(errors, `${path}.code`, `must be one of ${SBC_CODES.join(", ")}`);
  }
  if (typeof p.section !== "string" || p.section.length === 0) {
    pushErr(errors, `${path}.section`, "must be a non-empty string");
  }
  if (p.section && String(p.section).includes("\u00A7")) {
    pushErr(errors, `${path}.section`, 'must not use the section-sign symbol - write "Section"/"القسم"');
  }
  if (p.page !== undefined && (typeof p.page !== "number" || p.page < 1 || !Number.isInteger(p.page))) {
    pushErr(errors, `${path}.page`, "must be a positive integer when present");
  }
  if (p.quote !== undefined && (typeof p.quote !== "string" || p.quote.length > 300)) {
    pushErr(errors, `${path}.quote`, "must be a string of at most 300 characters");
  }
  if (requireQuote && (p.quote === undefined || p.quote === "") && (p.source_note === undefined || p.source_note === "")) {
    pushErr(errors, path, "needs either a verbatim quote or an explicit source_note explaining its absence");
  }
  if (typeof p.extracted_by !== "string" || p.extracted_by.length === 0) {
    pushErr(errors, `${path}.extracted_by`, "must be a non-empty string");
  }
  if (typeof p.extracted_at !== "string" || !DATE_PATTERN.test(p.extracted_at)) {
    pushErr(errors, `${path}.extracted_at`, "must be an ISO date (YYYY-MM-DD)");
  }
}

function validateTableRow(row: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(row)) {
    pushErr(errors, path, "must be an object");
    return;
  }
  if (typeof row.id !== "string" || row.id.length === 0) {
    pushErr(errors, `${path}.id`, "must be a non-empty string");
  }
  if (!Array.isArray(row.match) || row.match.length === 0) {
    pushErr(errors, `${path}.match`, "must be a non-empty array of conditions");
  } else {
    row.match.forEach((c, i) => validateCondition(c, `${path}.match[${i}]`, errors));
  }
  const okValue = typeof row.value === "number" || row.value === "NP";
  if (!okValue) {
    pushErr(errors, `${path}.value`, "must be a number or the literal string 'NP'");
  }
  if (row.unit !== undefined && !(UNITS as readonly string[]).includes(row.unit as string)) {
    pushErr(errors, `${path}.unit`, `must be one of ${UNITS.join(", ")}`);
  }
  if (row.provenance !== undefined) {
    validateProvenance(row.provenance, `${path}.provenance`, errors, false);
  }
}

function validateRequirement(req: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(req)) {
    pushErr(errors, path, "must be an object");
    return;
  }
  const kind = req.kind;
  if (typeof kind !== "string" || !["threshold", "table_lookup", "boolean", "formula"].includes(kind)) {
    pushErr(errors, `${path}.kind`, "must be one of threshold, table_lookup, boolean, formula");
    return;
  }
  if (kind === "threshold") {
    if (typeof req.parameter !== "string" || req.parameter.length === 0) pushErr(errors, `${path}.parameter`, "required");
    if (typeof req.comparator !== "string" || !(THRESHOLD_COMPARATORS as readonly string[]).includes(req.comparator)) {
      pushErr(errors, `${path}.comparator`, `must be one of ${THRESHOLD_COMPARATORS.join(", ")}`);
    }
    if (typeof req.value !== "number") pushErr(errors, `${path}.value`, "must be a number");
    if (typeof req.unit !== "string" || !(UNITS as readonly string[]).includes(req.unit)) {
      pushErr(errors, `${path}.unit`, `must be one of ${UNITS.join(", ")}`);
    }
  } else if (kind === "table_lookup") {
    if (!Array.isArray(req.keys) || req.keys.length === 0) pushErr(errors, `${path}.keys`, "must be a non-empty string array");
    if (!isPlainObject(req.compare) || typeof req.compare.parameter !== "string" || !(THRESHOLD_COMPARATORS as readonly string[]).includes(req.compare.comparator as string)) {
      pushErr(errors, `${path}.compare`, "must be { parameter: string, comparator: ThresholdComparator }");
    }
    if (!Array.isArray(req.rows) || req.rows.length === 0) {
      pushErr(errors, `${path}.rows`, "must be a non-empty array");
    } else {
      req.rows.forEach((r, i) => validateTableRow(r, `${path}.rows[${i}]`, errors));
    }
    if (req.no_match_verdict !== undefined && !["not_applicable", "insufficient_data"].includes(req.no_match_verdict as string)) {
      pushErr(errors, `${path}.no_match_verdict`, "must be not_applicable or insufficient_data");
    }
  } else if (kind === "boolean") {
    if (typeof req.parameter !== "string" || req.parameter.length === 0) pushErr(errors, `${path}.parameter`, "required");
    if (typeof req.equals !== "boolean") pushErr(errors, `${path}.equals`, "must be a boolean");
  } else if (kind === "formula") {
    if (typeof req.expression !== "string" || req.expression.length === 0) pushErr(errors, `${path}.expression`, "required");
    if (!isPlainObject(req.compare) || typeof req.compare.parameter !== "string" || !(THRESHOLD_COMPARATORS as readonly string[]).includes(req.compare.comparator as string)) {
      pushErr(errors, `${path}.compare`, "must be { parameter: string, comparator: ThresholdComparator }");
    }
  }
}

function validateException(exc: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(exc)) {
    pushErr(errors, path, "must be an object");
    return;
  }
  if (typeof exc.id !== "string" || exc.id.length === 0) pushErr(errors, `${path}.id`, "required");
  if (!Array.isArray(exc.conditions) || exc.conditions.length === 0) {
    pushErr(errors, `${path}.conditions`, "must be a non-empty array");
  } else {
    exc.conditions.forEach((c, i) => validateCondition(c, `${path}.conditions[${i}]`, errors));
  }
  if (exc.effect !== "override" && exc.effect !== "waive") {
    pushErr(errors, `${path}.effect`, "must be 'override' or 'waive'");
  }
  if (exc.effect === "override" && !(VERDICTS as readonly string[]).includes(exc.override_verdict as string)) {
    pushErr(errors, `${path}.override_verdict`, "required (one of complies, violates, not_applicable, insufficient_data) when effect is 'override'");
  }
  if (typeof exc.note_ar !== "string" || exc.note_ar.length === 0) pushErr(errors, `${path}.note_ar`, "required");
  validateProvenance(exc.provenance, `${path}.provenance`, errors, false);
}

function validateRule(rule: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(rule)) {
    pushErr(errors, path, "must be an object");
    return;
  }
  if (typeof rule.id !== "string" || !ID_PATTERN.test(rule.id)) {
    pushErr(errors, `${path}.id`, "must be a non-empty string matching ^[A-Z0-9]+-[A-Za-z0-9.()_-]+$");
  }
  if (typeof rule.code !== "string" || !(SBC_CODES as readonly string[]).includes(rule.code)) {
    pushErr(errors, `${path}.code`, `must be one of ${SBC_CODES.join(", ")}`);
  }
  if (typeof rule.section !== "string" || rule.section.length === 0) pushErr(errors, `${path}.section`, "required");
  if (typeof rule.title_ar !== "string" || rule.title_ar.length === 0) pushErr(errors, `${path}.title_ar`, "required");
  if (typeof rule.title_en !== "string" || rule.title_en.length === 0) pushErr(errors, `${path}.title_en`, "required");
  if (typeof rule.status !== "string" || !(RULE_STATUSES as readonly string[]).includes(rule.status)) {
    pushErr(errors, `${path}.status`, `must be one of ${RULE_STATUSES.join(", ")}`);
  }
  if (!isPlainObject(rule.applicability) || !Array.isArray(rule.applicability.conditions)) {
    pushErr(errors, `${path}.applicability`, "must be { conditions: Condition[] }");
  } else {
    rule.applicability.conditions.forEach((c, i) => validateCondition(c, `${path}.applicability.conditions[${i}]`, errors));
  }
  validateRequirement(rule.requirement, `${path}.requirement`, errors);
  if (rule.exceptions !== undefined) {
    if (!Array.isArray(rule.exceptions)) {
      pushErr(errors, `${path}.exceptions`, "must be an array when present");
    } else {
      rule.exceptions.forEach((e, i) => validateException(e, `${path}.exceptions[${i}]`, errors));
    }
  }
  if (!isPlainObject(rule.outputs) || typeof rule.outputs.explanation_ar !== "string" || rule.outputs.explanation_ar.length === 0) {
    pushErr(errors, `${path}.outputs`, "must be { explanation_ar: non-empty string, explanation_en?: string }");
  }
  validateProvenance(rule.provenance, `${path}.provenance`, errors, true);
  if (rule.status !== "draft" && rule.validation === undefined) {
    pushErr(errors, `${path}.validation`, "required once status is engineer_validated or live");
  }
  if (rule.validation !== undefined && !isPlainObject(rule.validation)) {
    pushErr(errors, `${path}.validation`, "must be an object when present");
  }
}

/** Hand-written validator for a whole rules/*.json file. No ajv, no new deps. */
export function validateRuleFile(data: unknown): ValidationOutcome {
  const errors: string[] = [];
  if (!isPlainObject(data)) {
    return { ok: false, errors: ["root: must be an object"] };
  }
  if (typeof data.schema_version !== "string" || data.schema_version.length === 0) {
    pushErr(errors, "schema_version", "required non-empty string");
  }
  if (typeof data.code_family !== "string" || data.code_family.length === 0) {
    pushErr(errors, "code_family", "required non-empty string");
  }
  if (typeof data.generated_at !== "string" || !DATE_PATTERN.test(data.generated_at)) {
    pushErr(errors, "generated_at", "required ISO date (YYYY-MM-DD)");
  }
  if (!Array.isArray(data.rules) || data.rules.length === 0) {
    pushErr(errors, "rules", "must be a non-empty array");
    return { ok: errors.length === 0, errors };
  }
  data.rules.forEach((r, i) => validateRule(r, `rules[${i}]`, errors));

  const ids = new Set<string>();
  (data.rules as unknown[]).forEach((r, i) => {
    if (isPlainObject(r) && typeof r.id === "string") {
      if (ids.has(r.id)) pushErr(errors, `rules[${i}].id`, `duplicate rule id '${r.id}'`);
      ids.add(r.id);
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], rules: data.rules as Rule[] };
}

/** Loads and validates a rules file; throws with all accumulated errors on failure. */
export function loadRules(json: unknown): Rule[] {
  const outcome = validateRuleFile(json);
  if (!outcome.ok || !outcome.rules) {
    throw new Error(`Invalid rule file (${outcome.errors.length} error(s)):\n${outcome.errors.join("\n")}`);
  }
  return outcome.rules;
}

/** Rules eligible to reach the user-facing answer path (see notes.md lifecycle). */
export function selectValidatedRules(rules: Rule[]): Rule[] {
  return rules.filter((r) => r.status === "engineer_validated" || r.status === "live");
}

export function filterByStatus(rules: Rule[], status: RuleStatus): Rule[] {
  return rules.filter((r) => r.status === status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tri-state condition matching: "true" | "false" | "unknown" (missing data)
// ─────────────────────────────────────────────────────────────────────────────

type Tri = "true" | "false" | "unknown";

function toNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function matchCondition(condition: Condition, params: RuleParams): Tri {
  const raw = params[condition.parameter];

  if (condition.operator === "exists") {
    // Deliberately never "false": an absent parameter is a data gap, not
    // positive evidence the rule doesn't apply. "exists" in applicability
    // means "this parameter is required to evaluate the rule" - when it's
    // missing, that is insufficient_data, not not_applicable. Only a
    // definite mismatch on a KNOWN value (eq/in/gt/.../between) should ever
    // short-circuit applicability to not_applicable.
    return raw !== undefined && raw !== null ? "true" : "unknown";
  }

  if (raw === undefined || raw === null) return "unknown";

  const value = condition.value as ConditionValue;

  switch (condition.operator) {
    case "eq":
      return raw === value ? "true" : "false";
    case "in": {
      const arr = Array.isArray(value) ? (value as (string | number)[]) : [];
      return arr.includes(raw as string | number) ? "true" : "false";
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toNumber(raw);
      const b = toNumber(value);
      if (a === undefined || b === undefined) return "unknown";
      if (condition.operator === "gt") return a > b ? "true" : "false";
      if (condition.operator === "gte") return a >= b ? "true" : "false";
      if (condition.operator === "lt") return a < b ? "true" : "false";
      return a <= b ? "true" : "false";
    }
    case "between": {
      const a = toNumber(raw);
      const pair = Array.isArray(value) ? (value as number[]) : undefined;
      if (a === undefined || !pair || pair.length !== 2) return "unknown";
      return a >= pair[0] && a <= pair[1] ? "true" : "false";
    }
    default:
      return "unknown";
  }
}

interface ConditionSetResult {
  result: Tri;
  unknownParameters: string[];
}

/** AND-combines a list of conditions with tri-state short-circuiting on any definite "false". */
function evalConditionSet(conditions: Condition[], params: RuleParams): ConditionSetResult {
  const unknownParameters: string[] = [];
  let sawUnknown = false;
  for (const c of conditions) {
    const r = matchCondition(c, params);
    if (r === "false") {
      return { result: "false", unknownParameters: [] };
    }
    if (r === "unknown") {
      sawUnknown = true;
      if (!unknownParameters.includes(c.parameter)) unknownParameters.push(c.parameter);
    }
  }
  return { result: sawUnknown ? "unknown" : "true", unknownParameters };
}

function compareThreshold(a: number, comparator: string, b: number): boolean {
  switch (comparator) {
    case "eq": return a === b;
    case "ne": return a !== b;
    case "lt": return a < b;
    case "lte": return a <= b;
    case "gt": return a > b;
    case "gte": return a >= b;
    default: return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula evaluator: + - * / min() max() and parameter references. No eval().
// ─────────────────────────────────────────────────────────────────────────────

export class FormulaMissingParameterError extends Error {
  constructor(public parameter: string) {
    super(`missing parameter '${parameter}' required by formula`);
  }
}

type Token =
  | { t: "num"; v: number }
  | { t: "ident"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "(" | ")" | "," };

function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const numStr = expr.slice(i, j);
      const num = Number(numStr);
      if (!Number.isFinite(num)) throw new Error(`invalid number literal '${numStr}' in formula`);
      tokens.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      tokens.push({ t: "ident", v: expr.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/(),".includes(ch)) {
      tokens.push({ t: "op", v: ch as "+" | "-" | "*" | "/" | "(" | ")" | "," });
      i++;
      continue;
    }
    throw new Error(`unexpected character '${ch}' in formula`);
  }
  return tokens;
}

const FORMULA_FUNCTIONS = new Set(["min", "max"]);

/** Recursive-descent parser + evaluator over a safe expression subset. Throws FormulaMissingParameterError. */
function evaluateFormula(expression: string, params: RuleParams): number {
  const tokens = tokenizeFormula(expression);
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }
  function next(): Token {
    const tok = tokens[pos];
    if (!tok) throw new Error("unexpected end of formula");
    pos++;
    return tok;
  }

  function parseExpr(): number {
    let value = parseTerm();
    for (;;) {
      const tok = peek();
      if (tok && tok.t === "op" && (tok.v === "+" || tok.v === "-")) {
        next();
        const rhs = parseTerm();
        value = tok.v === "+" ? value + rhs : value - rhs;
      } else break;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      const tok = peek();
      if (tok && tok.t === "op" && (tok.v === "*" || tok.v === "/")) {
        next();
        const rhs = parseFactor();
        value = tok.v === "*" ? value * rhs : value / rhs;
      } else break;
    }
    return value;
  }

  function parseFactor(): number {
    const tok = next();
    if (tok.t === "op" && tok.v === "-") {
      return -parseFactor();
    }
    if (tok.t === "op" && tok.v === "(") {
      const value = parseExpr();
      const close = next();
      if (!(close.t === "op" && close.v === ")")) throw new Error("expected ')' in formula");
      return value;
    }
    if (tok.t === "num") return tok.v;
    if (tok.t === "ident") {
      if (FORMULA_FUNCTIONS.has(tok.v)) {
        const open = next();
        if (!(open.t === "op" && open.v === "(")) throw new Error(`expected '(' after ${tok.v}`);
        const args: number[] = [parseExpr()];
        for (;;) {
          const maybeComma = peek();
          if (maybeComma && maybeComma.t === "op" && maybeComma.v === ",") {
            next();
            args.push(parseExpr());
          } else break;
        }
        const close = next();
        if (!(close.t === "op" && close.v === ")")) throw new Error(`expected ')' closing ${tok.v}(...)`);
        return tok.v === "min" ? Math.min(...args) : Math.max(...args);
      }
      // bare parameter reference
      const raw = params[tok.v];
      const n = toNumber(raw);
      if (n === undefined) throw new FormulaMissingParameterError(tok.v);
      return n;
    }
    throw new Error("unexpected token in formula");
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("unexpected trailing input in formula");
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Explanation template rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, key: string) => {
    const v = context[key];
    return v === undefined || v === null ? whole : String(v);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// evaluate() / evaluateAll()
// ─────────────────────────────────────────────────────────────────────────────

function insufficientData(rule: Rule, missing: string[], extra?: Partial<EvaluationResult>): EvaluationResult {
  return {
    rule_id: rule.id,
    verdict: "insufficient_data",
    missing_parameters: Array.from(new Set(missing)),
    explanation_ar: `تعذّر تقييم هذا الاشتراط: بيانات ناقصة (${missing.join("، ")}). لا يجوز افتراض قيمة لها.`,
    provenance: rule.provenance,
    ...extra,
  };
}

function notApplicable(rule: Rule): EvaluationResult {
  return {
    rule_id: rule.id,
    verdict: "not_applicable",
    missing_parameters: [],
    explanation_ar: `هذا الاشتراط (${rule.section}) لا ينطبق على المعطيات المُدخلة.`,
    provenance: rule.provenance,
  };
}

function evaluateRequirement(rule: Rule, requirement: Requirement, params: RuleParams): EvaluationResult {
  const base = { rule_id: rule.id, provenance: rule.provenance };

  if (requirement.kind === "threshold") {
    const raw = params[requirement.parameter];
    const value = toNumber(raw);
    if (value === undefined) return insufficientData(rule, [requirement.parameter]);
    const complies = compareThreshold(value, requirement.comparator, requirement.value);
    return {
      ...base,
      verdict: complies ? "complies" : "violates",
      missing_parameters: [],
      explanation_ar: renderTemplate(rule.outputs.explanation_ar, { ...params, computed_value: requirement.value }),
      computed_value: requirement.value,
    };
  }

  if (requirement.kind === "boolean") {
    const raw = params[requirement.parameter];
    if (raw === undefined || raw === null) return insufficientData(rule, [requirement.parameter]);
    const complies = Boolean(raw) === requirement.equals;
    return {
      ...base,
      verdict: complies ? "complies" : "violates",
      missing_parameters: [],
      explanation_ar: renderTemplate(rule.outputs.explanation_ar, params as Record<string, unknown>),
    };
  }

  if (requirement.kind === "formula") {
    let computed: number;
    try {
      computed = evaluateFormula(requirement.expression, params);
    } catch (err) {
      if (err instanceof FormulaMissingParameterError) return insufficientData(rule, [err.parameter]);
      throw err;
    }
    const declaredRaw = params[requirement.compare.parameter];
    const declared = toNumber(declaredRaw);
    if (declared === undefined) return insufficientData(rule, [requirement.compare.parameter]);
    const complies = compareThreshold(declared, requirement.compare.comparator, computed);
    return {
      ...base,
      verdict: complies ? "complies" : "violates",
      missing_parameters: [],
      explanation_ar: renderTemplate(rule.outputs.explanation_ar, { ...params, computed_value: computed }),
      computed_value: computed,
    };
  }

  // table_lookup
  const unknownParams: string[] = [];
  let matched: TableRow | undefined;
  for (const row of requirement.rows) {
    const r = evalConditionSet(row.match, params);
    if (r.result === "true") {
      matched = row;
      break;
    }
    if (r.result === "unknown") {
      for (const p of r.unknownParameters) if (!unknownParams.includes(p)) unknownParams.push(p);
    }
  }

  if (!matched) {
    if (unknownParams.length > 0) return insufficientData(rule, unknownParams);
    const verdict: Verdict = requirement.no_match_verdict ?? "not_applicable";
    return verdict === "not_applicable"
      ? notApplicable(rule)
      : insufficientData(rule, requirement.keys);
  }

  const rowProvenance = matched.provenance ?? rule.provenance;

  if (matched.value === "NP") {
    return {
      ...base,
      provenance: rowProvenance,
      verdict: "violates",
      missing_parameters: [],
      matched_row_id: matched.id,
      computed_value: "NP",
      explanation_ar: renderTemplate(rule.outputs.explanation_ar, { ...params, computed_value: "غير مسموح (NP)" }),
    };
  }

  const declaredRaw = params[requirement.compare.parameter];
  const declared = toNumber(declaredRaw);
  if (declared === undefined) {
    return insufficientData(rule, [requirement.compare.parameter], { matched_row_id: matched.id, provenance: rowProvenance });
  }
  const complies = compareThreshold(declared, requirement.compare.comparator, matched.value);
  return {
    ...base,
    provenance: rowProvenance,
    verdict: complies ? "complies" : "violates",
    missing_parameters: [],
    matched_row_id: matched.id,
    computed_value: matched.value,
    explanation_ar: renderTemplate(rule.outputs.explanation_ar, { ...params, computed_value: matched.value }),
  };
}

/**
 * Evaluate one rule against a bag of parameters. Never guesses: a parameter
 * the rule needs but does not receive yields "insufficient_data". See the
 * file header for the applicability/exception tri-state semantics.
 */
export function evaluate(rule: Rule, params: RuleParams): EvaluationResult {
  const applicability = evalConditionSet(rule.applicability.conditions, params);
  if (applicability.result === "false") return notApplicable(rule);
  if (applicability.result === "unknown") return insufficientData(rule, applicability.unknownParameters);

  for (const exception of rule.exceptions ?? []) {
    const r = evalConditionSet(exception.conditions, params);
    if (r.result !== "true") continue; // "unknown" deliberately does NOT trigger the exception - see file header
    return buildExceptionResult(rule, exception);
  }

  return evaluateRequirement(rule, rule.requirement, params);
}

function buildExceptionResult(rule: Rule, exception: RuleException): EvaluationResult {
  const verdict: Verdict = exception.effect === "waive" ? "complies" : (exception.override_verdict as Verdict);
  return {
    rule_id: rule.id,
    verdict,
    missing_parameters: [],
    applied_exception: exception.id,
    explanation_ar: exception.note_ar,
    provenance: exception.provenance,
  };
}

/** Evaluate every rule in `rules` against `params`. Callers filter by status first if desired (selectValidatedRules). */
export function evaluateAll(rules: Rule[], params: RuleParams): EvaluationResult[] {
  return rules.map((rule) => evaluate(rule, params));
}

export type { RuleFile };
