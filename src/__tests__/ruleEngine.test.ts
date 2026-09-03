/**
 * Tests for src/lib/ruleEngine.ts + src/lib/ruleEngine.types.ts and, as an
 * integration check, rules/sbc-fire-life-safety-v0.json.
 *
 * Covers: the hand-written schema validator (accept/reject), every
 * requirement kind (threshold, table_lookup, boolean, formula), exceptions
 * (waive + override + "unknown condition does not grant relief"), missing
 * data (insufficient_data vs not_applicable), determinism, and >=10
 * rule-specific scenarios drawn from the real v0 rule set - including the
 * flagship "6-storey R-2 building at 18 m -> sprinkler required by the
 * height trigger" example from the build brief.
 *
 * This module is deliberately framework-free (no Supabase/network); the only
 * I/O here is reading the sibling rules/*.json fixture from disk, following
 * the same path.resolve(__dirname, "../../...") pattern already used by
 * src/__tests__/goldenSet.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  validateRuleFile,
  loadRules,
  evaluate,
  evaluateAll,
  selectValidatedRules,
  filterByStatus,
} from "../lib/ruleEngine";
import type { Rule, RuleParams } from "../lib/ruleEngine.types";

const RULES_PATH = path.resolve(__dirname, "../../rules/sbc-fire-life-safety-v0.json");

function loadRealRuleFile(): unknown {
  return JSON.parse(readFileSync(RULES_PATH, "utf8"));
}

function findRule(rules: Rule[], id: string): Rule {
  const r = rules.find((x) => x.id === id);
  if (!r) throw new Error(`test setup: rule '${id}' not found in rules/sbc-fire-life-safety-v0.json`);
  return r;
}

// A minimal, always-valid rule used as a base for the accept/reject and
// per-kind unit tests below, so each test only needs to override what it's
// actually exercising.
function minimalRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: "SBC201-000-test-rule",
    code: "SBC201",
    section: "000",
    title_ar: "قاعدة اختبار",
    title_en: "Test rule",
    status: "draft",
    applicability: { conditions: [] },
    requirement: { kind: "threshold", parameter: "height_m", comparator: "lte", value: 10, unit: "m" },
    outputs: { explanation_ar: "الارتفاع {height_m} م مقابل الحد {computed_value} م." },
    provenance: {
      code: "SBC201",
      section: "000",
      quote: "test fixture quote",
      extracted_by: "test-suite",
      extracted_at: "2026-09-03",
    },
    ...overrides,
  } as Rule;
}

function minimalFile(rules: unknown[]) {
  return {
    schema_version: "consultx-rule-engine-v0",
    code_family: "test fixture",
    generated_at: "2026-09-03",
    rules,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema validator: accept / reject
// ─────────────────────────────────────────────────────────────────────────────

describe("validateRuleFile — accept", () => {
  it("accepts a minimal well-formed rule", () => {
    const outcome = validateRuleFile(minimalFile([minimalRule()]));
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.rules).toHaveLength(1);
  });

  it("accepts every requirement kind", () => {
    const rules = [
      minimalRule({ id: "T-threshold", requirement: { kind: "threshold", parameter: "x", comparator: "gte", value: 1, unit: "m" } }),
      minimalRule({
        id: "T-table",
        requirement: {
          kind: "table_lookup",
          keys: ["occupancy_group"],
          compare: { parameter: "x", comparator: "lte" },
          rows: [{ id: "r1", match: [{ parameter: "occupancy_group", operator: "eq", value: "B" }], value: 10, unit: "m" }],
        },
      }),
      minimalRule({ id: "T-boolean", requirement: { kind: "boolean", parameter: "sprinklered", equals: true } }),
      minimalRule({ id: "T-formula", requirement: { kind: "formula", expression: "a / 2", compare: { parameter: "x", comparator: "gte" } } }),
    ];
    const outcome = validateRuleFile(minimalFile(rules));
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
  });

  it("accepts a rule with a well-formed exception (waive and override)", () => {
    const rules = [
      minimalRule({
        id: "T-exc",
        exceptions: [
          {
            id: "e1",
            conditions: [{ parameter: "sprinklered", operator: "eq", value: true }],
            effect: "waive",
            note_ar: "بديل الرشاش",
            provenance: { code: "SBC201", section: "000", extracted_by: "t", extracted_at: "2026-09-03" },
          },
          {
            id: "e2",
            conditions: [{ parameter: "occupancy_group", operator: "eq", value: "H-1" }],
            effect: "override",
            override_verdict: "violates",
            note_ar: "غير مسموح",
            provenance: { code: "SBC201", section: "000", extracted_by: "t", extracted_at: "2026-09-03" },
          },
        ],
      }),
    ];
    expect(validateRuleFile(minimalFile(rules)).ok).toBe(true);
  });

  it("accepts engineer_validated status when validation metadata is present", () => {
    const rules = [minimalRule({ status: "engineer_validated", validation: { engineer: "eng@example.com", validated_at: "2026-09-03" } })];
    expect(validateRuleFile(minimalFile(rules)).ok).toBe(true);
  });
});

describe("validateRuleFile — reject", () => {
  it("rejects a non-object root", () => {
    expect(validateRuleFile(null).ok).toBe(false);
    expect(validateRuleFile([1, 2, 3]).ok).toBe(false);
  });

  it("rejects an empty rules array", () => {
    const outcome = validateRuleFile(minimalFile([]));
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("rules"))).toBe(true);
  });

  it("rejects an unknown SBC code", () => {
    const outcome = validateRuleFile(minimalFile([minimalRule({ code: "SBC999" as never })]));
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("code"))).toBe(true);
  });

  it("rejects an unknown rule status", () => {
    const outcome = validateRuleFile(minimalFile([minimalRule({ status: "wip" as never })]));
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("status"))).toBe(true);
  });

  it("rejects status !== draft without validation metadata", () => {
    const outcome = validateRuleFile(minimalFile([minimalRule({ status: "live" })]));
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("validation"))).toBe(true);
  });

  it("rejects a condition with an unknown operator", () => {
    const outcome = validateRuleFile(
      minimalFile([minimalRule({ applicability: { conditions: [{ parameter: "x", operator: "matches" as never, value: 1 }] } })]),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("operator"))).toBe(true);
  });

  it("rejects 'in' with a non-array value", () => {
    const outcome = validateRuleFile(
      minimalFile([minimalRule({ applicability: { conditions: [{ parameter: "occupancy_group", operator: "in", value: "B" as never }] } })]),
    );
    expect(outcome.ok).toBe(false);
  });

  it("rejects 'between' without a [min, max] pair", () => {
    const outcome = validateRuleFile(
      minimalFile([minimalRule({ applicability: { conditions: [{ parameter: "stories", operator: "between", value: [1] as never }] } })]),
    );
    expect(outcome.ok).toBe(false);
  });

  it("rejects table_lookup with an empty rows array", () => {
    const outcome = validateRuleFile(
      minimalFile([
        minimalRule({
          requirement: { kind: "table_lookup", keys: ["x"], compare: { parameter: "x", comparator: "lte" }, rows: [] },
        }),
      ]),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("rows"))).toBe(true);
  });

  it("rejects a table row whose value is neither a number nor 'NP'", () => {
    const outcome = validateRuleFile(
      minimalFile([
        minimalRule({
          requirement: {
            kind: "table_lookup",
            keys: ["x"],
            compare: { parameter: "x", comparator: "lte" },
            rows: [{ id: "r1", match: [{ parameter: "x", operator: "eq", value: 1 }], value: "not permitted" as never }],
          },
        }),
      ]),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("value"))).toBe(true);
  });

  it("rejects boolean requirement missing 'equals'", () => {
    const outcome = validateRuleFile(minimalFile([minimalRule({ requirement: { kind: "boolean", parameter: "sprinklered" } as never })]));
    expect(outcome.ok).toBe(false);
  });

  it("rejects formula requirement missing 'compare'", () => {
    const outcome = validateRuleFile(minimalFile([minimalRule({ requirement: { kind: "formula", expression: "a + b" } as never })]));
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("compare"))).toBe(true);
  });

  it("rejects an 'override' exception missing override_verdict", () => {
    const outcome = validateRuleFile(
      minimalFile([
        minimalRule({
          exceptions: [
            {
              id: "e1",
              conditions: [{ parameter: "x", operator: "eq", value: 1 }],
              effect: "override",
              note_ar: "test",
              provenance: { code: "SBC201", section: "000", extracted_by: "t", extracted_at: "2026-09-03" },
            } as never,
          ],
        }),
      ]),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("override_verdict"))).toBe(true);
  });

  it("rejects a provenance quote longer than 300 characters", () => {
    const outcome = validateRuleFile(
      minimalFile([minimalRule({ provenance: { code: "SBC201", section: "000", quote: "x".repeat(301), extracted_by: "t", extracted_at: "2026-09-03" } })]),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("quote"))).toBe(true);
  });

  it("rejects the section-sign symbol in provenance.section", () => {
    const outcome = validateRuleFile(minimalFile([minimalRule({ provenance: { code: "SBC201", section: "\u00A7504.3", extracted_by: "t", extracted_at: "2026-09-03" } })]));
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.toLowerCase().includes("section-sign"))).toBe(true);
  });

  it("rejects duplicate rule ids", () => {
    const outcome = validateRuleFile(minimalFile([minimalRule({ id: "DUP-1" }), minimalRule({ id: "DUP-1" })]));
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects a rule id that fails the ID pattern", () => {
    const outcome = validateRuleFile(minimalFile([minimalRule({ id: "not a valid id!" })]));
    expect(outcome.ok).toBe(false);
  });
});

describe("loadRules", () => {
  it("returns the rule array on a valid file", () => {
    expect(loadRules(minimalFile([minimalRule()]))).toHaveLength(1);
  });

  it("throws with all accumulated error messages on an invalid file", () => {
    expect(() => loadRules(minimalFile([minimalRule({ code: "NOPE" as never })]))).toThrowError(/code/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluate() — one test per requirement kind
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluate — threshold", () => {
  const rule = minimalRule({ requirement: { kind: "threshold", parameter: "corridor_width_mm", comparator: "gte", value: 1100, unit: "mm" } });

  it("complies when the parameter satisfies the comparator", () => {
    expect(evaluate(rule, { corridor_width_mm: 1200 }).verdict).toBe("complies");
  });
  it("violates when it does not", () => {
    expect(evaluate(rule, { corridor_width_mm: 900 }).verdict).toBe("violates");
  });
  it("is insufficient_data when the parameter is missing - never guessed", () => {
    const res = evaluate(rule, {});
    expect(res.verdict).toBe("insufficient_data");
    expect(res.missing_parameters).toEqual(["corridor_width_mm"]);
  });
});

describe("evaluate — boolean", () => {
  const rule = minimalRule({ requirement: { kind: "boolean", parameter: "sprinklered", equals: true } });

  it("complies when the boolean matches", () => {
    expect(evaluate(rule, { sprinklered: true }).verdict).toBe("complies");
  });
  it("violates when it does not", () => {
    expect(evaluate(rule, { sprinklered: false }).verdict).toBe("violates");
  });
  it("is insufficient_data when missing", () => {
    expect(evaluate(rule, {}).verdict).toBe("insufficient_data");
  });
});

describe("evaluate — table_lookup", () => {
  const rule = minimalRule({
    requirement: {
      kind: "table_lookup",
      keys: ["occupancy_group", "sprinklered"],
      compare: { parameter: "travel_distance_m", comparator: "lte" },
      rows: [
        { id: "b-ns", match: [{ parameter: "occupancy_group", operator: "eq", value: "B" }, { parameter: "sprinklered", operator: "eq", value: false }], value: 60, unit: "m" },
        { id: "h1-ns", match: [{ parameter: "occupancy_group", operator: "eq", value: "H-1" }, { parameter: "sprinklered", operator: "eq", value: false }], value: "NP" },
      ],
    },
  });

  it("complies when the declared value satisfies the matched row", () => {
    const res = evaluate(rule, { occupancy_group: "B", sprinklered: false, travel_distance_m: 40 });
    expect(res.verdict).toBe("complies");
    expect(res.matched_row_id).toBe("b-ns");
    expect(res.computed_value).toBe(60);
  });

  it("violates when it does not", () => {
    const res = evaluate(rule, { occupancy_group: "B", sprinklered: false, travel_distance_m: 90 });
    expect(res.verdict).toBe("violates");
  });

  it("an 'NP' row always violates, regardless of the declared value", () => {
    const res = evaluate(rule, { occupancy_group: "H-1", sprinklered: false, travel_distance_m: 1 });
    expect(res.verdict).toBe("violates");
    expect(res.matched_row_id).toBe("h1-ns");
    expect(res.computed_value).toBe("NP");
  });

  it("is not_applicable when no row's conditions match at all", () => {
    const res = evaluate(rule, { occupancy_group: "U", sprinklered: false, travel_distance_m: 10 });
    expect(res.verdict).toBe("not_applicable");
  });

  it("is insufficient_data when row selection itself is missing data", () => {
    const res = evaluate(rule, { occupancy_group: "B", travel_distance_m: 10 }); // sprinklered unknown
    expect(res.verdict).toBe("insufficient_data");
    expect(res.missing_parameters).toContain("sprinklered");
  });

  it("is insufficient_data when a row matches but the compared parameter is missing", () => {
    const res = evaluate(rule, { occupancy_group: "B", sprinklered: false });
    expect(res.verdict).toBe("insufficient_data");
    expect(res.missing_parameters).toEqual(["travel_distance_m"]);
    expect(res.matched_row_id).toBe("b-ns");
  });
});

describe("evaluate — formula", () => {
  const rule = minimalRule({
    requirement: { kind: "formula", expression: "floor_area_m2 / 14", compare: { parameter: "occupant_load", comparator: "gte" } },
  });

  it("complies when the declared occupant load meets the computed minimum", () => {
    const res = evaluate(rule, { floor_area_m2: 140, occupant_load: 10 });
    expect(res.verdict).toBe("complies");
    expect(res.computed_value).toBe(10);
  });
  it("violates when the declared occupant load understates the computed minimum", () => {
    expect(evaluate(rule, { floor_area_m2: 140, occupant_load: 9 }).verdict).toBe("violates");
  });
  it("is insufficient_data when a formula input is missing", () => {
    const res = evaluate(rule, { occupant_load: 10 });
    expect(res.verdict).toBe("insufficient_data");
    expect(res.missing_parameters).toEqual(["floor_area_m2"]);
  });
  it("is insufficient_data when the compare-target parameter is missing", () => {
    const res = evaluate(rule, { floor_area_m2: 140 });
    expect(res.verdict).toBe("insufficient_data");
    expect(res.missing_parameters).toEqual(["occupant_load"]);
  });

  it("formula evaluator supports +, -, *, / and min()/max() with parameter references (engine capability, not just division)", () => {
    const minMaxRule = minimalRule({
      requirement: { kind: "formula", expression: "min(a, b) + max(c, d, e) * 2 - 1", compare: { parameter: "target", comparator: "eq" } },
    });
    // min(3,5) + max(1,9,2)*2 - 1 = 3 + 18 - 1 = 20
    const res = evaluate(minMaxRule, { a: 3, b: 5, c: 1, d: 9, e: 2, target: 20 });
    expect(res.verdict).toBe("complies");
    expect(res.computed_value).toBe(20);
  });

  it("formula evaluator rejects eval-style injection as a plain parse error - never executes anything", () => {
    const dangerous = minimalRule({
      requirement: { kind: "formula", expression: "require('node:fs')", compare: { parameter: "target", comparator: "eq" } },
    });
    // No eval(): a string literal argument is not valid syntax in this grammar
    // (only bare parameter references, numbers, +-*/ and min()/max() calls are
    // recognized), so this must fail as an ordinary thrown Error during
    // tokenizing/parsing - it must never reach Node's `require`.
    expect(() => evaluate(dangerous, { target: 1 })).toThrowError(/unexpected character/);
  });

  it("formula evaluator treats an unrecognized name as a bare (missing) parameter reference, not a call - and never throws for it", () => {
    const notAFunction = minimalRule({
      requirement: { kind: "formula", expression: "eval", compare: { parameter: "target", comparator: "eq" } },
    });
    // Only "min" and "max" are recognized as callable; "eval" on its own is
    // just an ordinary (here: unresolvable) parameter reference. The engine
    // must degrade gracefully to insufficient_data - it must never invoke
    // the real eval(), and a merely-unresolvable identifier must not crash
    // rule evaluation the way a genuine syntax error does.
    const res = evaluate(notAFunction, { target: 1 });
    expect(res.verdict).toBe("insufficient_data");
    expect(res.missing_parameters).toEqual(["eval"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Applicability: not_applicable vs insufficient_data
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluate — applicability", () => {
  const rule = minimalRule({
    applicability: { conditions: [{ parameter: "occupancy_group", operator: "eq", value: "R-2" }, { parameter: "sprinklered", operator: "eq", value: false }] },
    requirement: { kind: "threshold", parameter: "height_m", comparator: "lte", value: 16.5, unit: "m" },
  });

  it("is not_applicable on a definite applicability mismatch, even with other params also missing", () => {
    // occupancy_group is definitely "B" (not R-2); sprinklered is not provided at all.
    const res = evaluate(rule, { occupancy_group: "B", height_m: 20 });
    expect(res.verdict).toBe("not_applicable");
  });

  it("is insufficient_data when an applicability parameter is missing and nothing is definitely false", () => {
    const res = evaluate(rule, { occupancy_group: "R-2", height_m: 20 }); // sprinklered unknown
    expect(res.verdict).toBe("insufficient_data");
    expect(res.missing_parameters).toEqual(["sprinklered"]);
  });

  it("proceeds to the requirement once applicability fully resolves true", () => {
    const res = evaluate(rule, { occupancy_group: "R-2", sprinklered: false, height_m: 20 });
    expect(res.verdict).toBe("violates");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exceptions
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluate — exceptions", () => {
  const provenance = { code: "SBC201" as const, section: "Table 509.1", extracted_by: "t", extracted_at: "2026-09-03" };
  const rule = minimalRule({
    requirement: { kind: "threshold", parameter: "room_separation_hours", comparator: "gte", value: 1, unit: "hours" },
    exceptions: [
      {
        id: "sprinkler-alt",
        conditions: [{ parameter: "incidental_room_sprinklered", operator: "eq", value: true }],
        effect: "waive",
        note_ar: "بديل الرشاش يُغني عن الفصل",
        provenance,
      },
    ],
  });

  it("a waive exception overrides a base violation to complies and records applied_exception", () => {
    const res = evaluate(rule, { room_separation_hours: 0, incidental_room_sprinklered: true });
    expect(res.verdict).toBe("complies");
    expect(res.applied_exception).toBe("sprinkler-alt");
    expect(res.explanation_ar).toBe("بديل الرشاش يُغني عن الفصل");
  });

  it("falls through to the base requirement when the exception condition is false", () => {
    const res = evaluate(rule, { room_separation_hours: 0, incidental_room_sprinklered: false });
    expect(res.verdict).toBe("violates");
    expect(res.applied_exception).toBeUndefined();
  });

  it("an exception with UNRESOLVED (missing) conditions does NOT grant relief - falls through to the stricter base rule", () => {
    // incidental_room_sprinklered is not provided; the exception cannot be confirmed, so it must not fire.
    const res = evaluate(rule, { room_separation_hours: 0 });
    expect(res.applied_exception).toBeUndefined();
    expect(res.verdict).toBe("violates"); // base rule: 0 >= 1 is false
  });

  it("an override exception sets the verdict directly", () => {
    const overrideRule = minimalRule({
      requirement: { kind: "threshold", parameter: "exterior_wall_rating_hours", comparator: "gte", value: 1, unit: "hours" },
      exceptions: [
        {
          id: "group-u-private-garage",
          conditions: [{ parameter: "occupancy_group", operator: "eq", value: "U" }, { parameter: "fire_separation_distance_m", operator: "gte", value: 1.5 }],
          effect: "override",
          override_verdict: "not_applicable",
          note_ar: "لا يشترط تصنيف مقاومة حريق",
          provenance,
        },
      ],
    });
    const res = evaluate(overrideRule, { occupancy_group: "U", fire_separation_distance_m: 3, exterior_wall_rating_hours: 0 });
    expect(res.verdict).toBe("not_applicable");
    expect(res.applied_exception).toBe("group-u-private-garage");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Determinism
// ─────────────────────────────────────────────────────────────────────────────

describe("determinism", () => {
  it("evaluating the same rule against the same params repeatedly yields byte-identical results", () => {
    const rule = minimalRule({
      requirement: {
        kind: "table_lookup",
        keys: ["occupancy_group"],
        compare: { parameter: "height_m", comparator: "lte" },
        rows: [{ id: "r1", match: [{ parameter: "occupancy_group", operator: "eq", value: "B" }], value: 16.5, unit: "m" }],
      },
    });
    const params: RuleParams = { occupancy_group: "B", height_m: 18 };
    const first = JSON.stringify(evaluate(rule, params));
    for (let i = 0; i < 25; i++) {
      expect(JSON.stringify(evaluate(rule, params))).toBe(first);
    }
  });

  it("evaluateAll over the full real rule set is deterministic across repeated runs", () => {
    const rules = loadRules(loadRealRuleFile());
    const params: RuleParams = {
      occupancy_group: "R-2",
      construction_type: "II-B",
      sprinklered: false,
      height_m: 18,
      stories: 6,
      is_new_construction: true,
    };
    const first = JSON.stringify(evaluateAll(rules, params));
    const second = JSON.stringify(evaluateAll(rules, params));
    expect(second).toBe(first);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: rules/sbc-fire-life-safety-v0.json itself
// ─────────────────────────────────────────────────────────────────────────────

describe("rules/sbc-fire-life-safety-v0.json — file-level integrity", () => {
  it("passes the hand-written validator with at least 30 rules and no errors", () => {
    const outcome = validateRuleFile(loadRealRuleFile());
    expect(outcome.errors).toEqual([]);
    expect(outcome.ok).toBe(true);
    expect(outcome.rules!.length).toBeGreaterThanOrEqual(30);
  });

  it("every rule is status=draft and none are selected for the answer path yet (v0 lifecycle)", () => {
    const rules = loadRules(loadRealRuleFile());
    expect(filterByStatus(rules, "draft").length).toBe(rules.length);
    expect(selectValidatedRules(rules)).toEqual([]);
  });

  it("covers all four requirement kinds and at least one exception", () => {
    const rules = loadRules(loadRealRuleFile());
    const kinds = new Set(rules.map((r) => r.requirement.kind));
    expect(kinds).toEqual(new Set(["threshold", "table_lookup", "boolean", "formula"]));
    expect(rules.some((r) => (r.exceptions?.length ?? 0) > 0)).toBe(true);
  });

  it("every rule cites SBC201 or SBC801 and carries a page number or an explicit source_note", () => {
    const rules = loadRules(loadRealRuleFile());
    for (const r of rules) {
      expect(["SBC201", "SBC801"]).toContain(r.provenance.code);
      expect(r.provenance.page !== undefined || !!r.provenance.source_note).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// >=10 rule-specific scenarios drawn from the real v0 rules, incl. the
// flagship example from the build brief.
// ─────────────────────────────────────────────────────────────────────────────

describe("rule-specific scenarios (real v0 rules)", () => {
  const rules = loadRules(loadRealRuleFile());

  it("[flagship] 6-storey R-2 building at 18 m, Type II-B, unsprinklered: violates the 16.5 m height trigger (Table 504.3, Group R row)", () => {
    // SBC201-504.3-height-nonsprinklered-IIB-IIIB only covers the A/B/E/F/M/S/U
    // occupancy family (see its `notes`); Group R sits in the sibling
    // SBC201-504.3-table rule, which carries the same printed 16.5 m figure
    // for Group R under Type II-B/III-B unsprinklered - that is the rule the
    // build brief's R-2 example actually exercises.
    const rule = findRule(rules, "SBC201-504.3-table");
    const res = evaluate(rule, { occupancy_group: "R-2", construction_type: "II-B", sprinklered: false, height_m: 18, stories: 6 });
    expect(res.verdict).toBe("violates");
    expect(res.computed_value).toBe(16.5);
    expect(res.provenance.section).toBe("504.3");
  });

  it("...the same building adding sprinklers now complies under the sprinklered 23 m cap (same table, same rule)", () => {
    const rule = findRule(rules, "SBC201-504.3-table");
    const res = evaluate(rule, { occupancy_group: "R-2", construction_type: "II-B", sprinklered: true, height_m: 18, stories: 6 });
    expect(res.verdict).toBe("complies");
    expect(res.computed_value).toBe(23);
  });

  it("the dedicated ABEFMSU threshold rule shows the same 16.5 m/23 m pattern for a Group B building", () => {
    const rule = findRule(rules, "SBC201-504.3-height-nonsprinklered-IIB-IIIB");
    const unsprinklered = evaluate(rule, { occupancy_group: "B", construction_type: "II-B", sprinklered: false, height_m: 18 });
    expect(unsprinklered.verdict).toBe("violates");
    // Once sprinklered, this NS-only rule steps aside entirely (its applicability requires sprinklered=false) -
    // the sprinklered case is governed by SBC201-504.3-table instead, not by this rule reporting "complies".
    const sprinklered = evaluate(rule, { occupancy_group: "B", construction_type: "II-B", sprinklered: true, height_m: 18 });
    expect(sprinklered.verdict).toBe("not_applicable");
  });

  it("Group R sprinkler mandate (903.2.8): a new R-2 building without sprinklers violates", () => {
    const rule = findRule(rules, "SBC801-903.2.8-group-r-sprinkler-mandate");
    const res = evaluate(rule, { occupancy_group: "R-2", is_new_construction: true, sprinklered: false });
    expect(res.verdict).toBe("violates");
  });

  it("Group R sprinkler mandate (903.2.8): complies once sprinklered", () => {
    const rule = findRule(rules, "SBC801-903.2.8-group-r-sprinkler-mandate");
    const res = evaluate(rule, { occupancy_group: "R-2", is_new_construction: true, sprinklered: true });
    expect(res.verdict).toBe("complies");
  });

  it("903.2.11.3 height trigger: a building 16.5 m or more above fire department access must be sprinklered, regardless of occupancy", () => {
    const rule = findRule(rules, "SBC801-903.2.11.3-height-trigger");
    const tallUnsprinklered = evaluate(rule, { height_above_fd_access_m: 18, sprinklered: false });
    const tallSprinklered = evaluate(rule, { height_above_fd_access_m: 18, sprinklered: true });
    const shortBuilding = evaluate(rule, { height_above_fd_access_m: 10, sprinklered: false });
    expect(tallUnsprinklered.verdict).toBe("violates");
    expect(tallSprinklered.verdict).toBe("complies");
    expect(shortBuilding.verdict).toBe("not_applicable"); // below 16.5 m, this specific trigger does not apply
  });

  it("Table 1017.2 travel distance: Group H-1 unsprinklered is printed 'Not Permitted' -> violates regardless of the declared distance", () => {
    const rule = findRule(rules, "SBC201-1017.2-exit-access-travel-distance");
    const res = evaluate(rule, { occupancy_group: "H-1", sprinklered: false, travel_distance_m: 1 });
    expect(res.verdict).toBe("violates");
    expect(res.computed_value).toBe("NP");
  });

  it("Table 1017.2: Group I-1 unsprinklered uses the documented conservative reading (Not Permitted), not the 60 m combined-row figure", () => {
    const rule = findRule(rules, "SBC201-1017.2-exit-access-travel-distance");
    const res = evaluate(rule, { occupancy_group: "I-1", sprinklered: false, travel_distance_m: 10 });
    expect(res.verdict).toBe("violates");
    expect(res.matched_row_id).toBe("i1-conservative");
  });

  it("Table 1006.2.1 common path: Group U unsprinklered uses the conservative 23 m reading (not the conflicting 30 m row)", () => {
    const rule = findRule(rules, "SBC201-1006.2.1-common-path");
    const compliant = evaluate(rule, { occupancy_group: "U", sprinklered: false, occupant_load: 20, common_path_m: 23 });
    const violating = evaluate(rule, { occupancy_group: "U", sprinklered: false, occupant_load: 20, common_path_m: 25 });
    expect(compliant.verdict).toBe("complies");
    expect(violating.verdict).toBe("violates");
  });

  it("Table 601 floor construction: Type I-B uses the conservative (higher) value between the two conflicting printed rows", () => {
    const rule = findRule(rules, "SBC201-601-floor-construction");
    const res = evaluate(rule, { construction_type: "I-B", element_rating_hours: 1.5 });
    // conservative value for I-B is 2h (max of 2 and 1.5 printed); 1.5h provided does not meet it.
    expect(res.verdict).toBe("violates");
    expect(res.computed_value).toBe(2);
  });

  it("minimum corridor width: 1100 mm default is enforced (corrects the historical 914 mm production defect)", () => {
    const rule = findRule(rules, "SBC201-1020.3-corridor-width");
    const tooNarrow = evaluate(rule, { corridor_width_mm: 1000, corridor_use_case: "default" });
    const ok = evaluate(rule, { corridor_width_mm: 1100, corridor_use_case: "default" });
    expect(tooNarrow.verdict).toBe("violates");
    expect(ok.verdict).toBe("complies");
  });

  it("minimum corridor width: never silently assumes 'default' when corridor_use_case is unstated - insufficient_data instead", () => {
    // A missing corridor_use_case must not silently fall back to the 1100 mm default row:
    // the actual space might be a dwelling unit (900 mm) or a Group E corridor (1800 mm),
    // and guessing "default" could pass a corridor that is really under-width for its true use.
    const rule = findRule(rules, "SBC201-1020.3-corridor-width");
    const res = evaluate(rule, { corridor_width_mm: 1100 });
    expect(res.verdict).toBe("insufficient_data");
    expect(res.missing_parameters).toContain("corridor_use_case");
  });

  it("occupant load formula (business areas, 14 m2/person): a declared load below the computed minimum violates", () => {
    const rule = findRule(rules, "SBC201-1004.5-business-occupant-load");
    const res = evaluate(rule, { space_function: "business_area", floor_area_m2: 280, occupant_load: 15 });
    expect(res.verdict).toBe("violates");
    expect(res.computed_value).toBe(20);
  });

  it("furnace room >117 kW: sprinklering the room waives the 1-hour separation via the documented alternative", () => {
    const rule = findRule(rules, "SBC201-509.1-furnace-room");
    const res = evaluate(rule, { incidental_room_type: "furnace_room_gt_117kW", room_separation_hours: 0, incidental_room_sprinklered: true });
    expect(res.verdict).toBe("complies");
    expect(res.applied_exception).toBe("sprinkler-alternative");
  });

  it("incinerator room requires BOTH the 2-hour rating AND sprinklers as two independently-checkable rules", () => {
    const ratingRule = findRule(rules, "SBC201-509.1-incinerator-room-rating");
    const sprinklerRule = findRule(rules, "SBC201-509.1-incinerator-room-sprinkler");
    const params = { incidental_room_type: "incinerator_room", room_separation_hours: 2, incidental_room_sprinklered: false };
    expect(evaluate(ratingRule, params).verdict).toBe("complies");
    expect(evaluate(sprinklerRule, params).verdict).toBe("violates"); // sprinklers still missing - no OR alternative for this row
  });

  it("Table 508.4: Group H-1 next to any other listed occupancy is printed Not Permitted outright", () => {
    const rule = findRule(rules, "SBC201-508.4-table");
    const res = evaluate(rule, { occupancy_group: "H-1", adjacent_occupancy_group: "B", sprinklered: true, separation_hours: 4 });
    expect(res.verdict).toBe("violates");
    expect(res.computed_value).toBe("NP");
  });

  it("revolving door speed table: a manual 2.4 m door at 11 rpm exceeds the printed 10 rpm maximum", () => {
    const rule = findRule(rules, "SBC201-1010.3.1-1-revolving-door-manual-speed");
    const tooFast = evaluate(rule, { door_type: "revolving_manual", revolving_door_diameter_m: 2.4, revolving_door_speed_rpm: 11 });
    const ok = evaluate(rule, { door_type: "revolving_manual", revolving_door_diameter_m: 2.4, revolving_door_speed_rpm: 10 });
    expect(tooFast.verdict).toBe("violates");
    expect(ok.verdict).toBe("complies");
  });
});
