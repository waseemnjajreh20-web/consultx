# rules/ — SBC deterministic rule layer (v0)

Numeric SBC requirements (egress travel distance, occupant load factors,
sprinkler thresholds, fire-resistance ratings, corridor/exit/door widths,
standpipe triggers, ...) must never be guessed by an LLM. This directory is
the deterministic, provenance-carrying rule layer that guards those numbers.
Full write-up: `docs/launch/rule-engine-notes.md`.

## Files

- `schema.json` — JSON Schema 2020-12 for a rule file. Validates the shape
  every file in this directory must follow.
- `sbc-fire-life-safety-v0.json` — 34 draft rules covering SBC 201 Ch. 5/6/7/10
  (height/area/separation, fire-resistance ratings by construction type,
  means of egress) and SBC 801 Ch. 9 (sprinkler mandates by occupancy). Every
  rule carries `provenance` (code, section, printed page, a verbatim quote
  <=300 chars) back to the source PDF.
- Evaluator: `src/lib/ruleEngine.ts` (+ types in `src/lib/ruleEngine.types.ts`).
  Tests: `src/__tests__/ruleEngine.test.ts`.

## Lifecycle

`draft` -> `engineer_validated` -> `live`. **Every rule in this v0 file is
`draft`.** `selectValidatedRules()` in ruleEngine.ts filters to
`engineer_validated`/`live` only - nothing here should reach a user-facing
answer until a fire-safety engineer has reviewed it against the printed SBC
page cited in its `provenance`. See rule-engine-notes.md section 5 for the
per-rule review checklist and the full id list.

## Quick use

```ts
import { readFileSync } from "node:fs";
import { loadRules, evaluate, selectValidatedRules } from "@/lib/ruleEngine";

const rules = loadRules(JSON.parse(readFileSync("rules/sbc-fire-life-safety-v0.json", "utf8")));
const live = selectValidatedRules(rules); // empty today - v0 is all draft
const result = evaluate(rules[0], { occupancy_group: "R-2", construction_type: "II-B", sprinklered: false, height_m: 18 });
// -> { verdict: "violates" | "complies" | "not_applicable" | "insufficient_data", ... }
```

A missing parameter always yields `insufficient_data` - the engine never
guesses a value on the caller's behalf.
