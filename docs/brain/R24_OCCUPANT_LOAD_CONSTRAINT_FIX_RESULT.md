# R24 — Occupant Load Constraint Fix Result

**Date:** 2026-05-07  
**Task:** TASK 3 — Surgical answer constraint fix for occupant_load  
**File modified:** `supabase/functions/fire-safety-chat/workflow_constraints.ts`  
**Result:** APPLIED — 6 rules injected at code level

---

## Change Summary

### File: `workflow_constraints.ts`

**Location:** `augmentWithWorkflow()`, after `result` object is built, before `return result`

**Change 1: R24 occupant_load gross/net rules (lines added ~144–160)**

```typescript
// ── R24: Occupant-load Mercantile gross/net enforcement ─────────────────────
if (routerResult.workflow_id === "wf_occupant_load") {
  const r24Rules = [
    "Reference: SBC 201 Table 1004.5 — cite by full name.",
    "Mercantile (Group M) ground-floor / basement sales areas: 2.8 m²/person — GROSS area.",
    "Mercantile (Group M) sales areas on other floors: 5.6 m²/person — GROSS area.",
    "Storage, stock, and shipping areas (any occupancy): 28 m²/person.",
    "NEVER say 'net area' for Mercantile — Table 1004.5 explicitly specifies gross for all Mercantile rows.",
    "State the table values first; then ask for: gross sales-area m², floor level, storage area if any.",
  ];
  result.safe_answer_rules = [...r24Rules, ...result.safe_answer_rules];
}
```

**Change 2: Increased safe_answer_rules slice limit 6 → 10 in `buildEvidenceOverlay()`**

```typescript
// Before:
for (const rule of aug.safe_answer_rules.slice(0, 6)) {
// After:
for (const rule of aug.safe_answer_rules.slice(0, 10)) {
```

This ensures all 6 R24 rules PLUS the existing brain rules (up to 4 more) are injected.

---

## Why This Location

- `workflow_constraints.ts` is the correct layer for prompt-level constraints
- Injecting at code level (not bucket) means fix is immediate without bucket write
- Rules are prepended (highest priority) before brain-package rules
- Follows existing pattern of `safe_answer_rules` overlay injection
- No changes to corpus, B1 package, brain, flags, or index.ts

---

## Overlay Injected into Advisory System Prompt

When `wf_occupant_load` is routed, the system prompt gains:

```
📐 WORKFLOW SAFE-ANSWER RULES (binding):
- Reference: SBC 201 Table 1004.5 — cite by full name.
- Mercantile (Group M) ground-floor / basement sales areas: 2.8 m²/person — GROSS area.
- Mercantile (Group M) sales areas on other floors: 5.6 m²/person — GROSS area.
- Storage, stock, and shipping areas (any occupancy): 28 m²/person.
- NEVER say 'net area' for Mercantile — Table 1004.5 explicitly specifies gross for all Mercantile rows.
- State the table values first; then ask for: gross sales-area m², floor level, storage area if any.
- [existing brain safe_answer_rules follow...]
```

---

## Constraints Respected

- [x] No corpus change
- [x] No B1 package / bucket write
- [x] No brain rebuild
- [x] No flag change
- [x] No billing / enterprise / analytical change
- [x] No DB write or migration
- [x] Surgical: only `workflow_constraints.ts` modified
- [x] Advisory-only path (B2 evidence flag gates this)
- [x] Main (primary) mode unaffected
- [x] Analytical mode unaffected

---

## Expected Behavior After Fix

Query: "ما متطلبات الحمل الإشغالي لمحل تجاري؟"

The model will:
1. Cite SBC 201 Table 1004.5 by name
2. State 2.8 / 5.6 / 28 m²/person factors with GROSS qualifier
3. Explain floor-level dependency
4. Request: gross sales area, floor, storage area
5. NOT say "المساحة الصافية" for Mercantile
6. NOT mix SBC 801 sources
