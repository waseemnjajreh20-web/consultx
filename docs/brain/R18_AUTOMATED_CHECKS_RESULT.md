# R18 — Automated Checks

**Date:** 2026-05-06  
**Task:** TASK 7 — Automated Checks

---

## TypeScript Check

```
npx tsc --noEmit
```

Result: **clean** (no output, exit 0)

Files checked include all R18 changes:
- `src/components/SourcePanel.tsx` (structured table UX + precision guard)
- `src/utils/sourceMetadata.ts` (formatSourceLabel precision guard)

## Advisory Brain B2 Validation

```
node scripts/validate_advisory_brain_b2.cjs
```

```
=== Advisory Brain B2 — Node Validation ===

--- Manifest integrity ---
  PASS  manifest exists and parses
  PASS  manifest: node counts correct (440 total)
  PASS  manifest: 278 in-graph edges
  PASS  manifest: 405 external xrefs
  PASS  manifest: 8 workflows
  PASS  manifest: all 8 workflow IDs present
  PASS  manifest: invariants all true

--- Orphans: do_not_promote invariant ---
  PASS  all orphan nodes have do_not_promote=true
  PASS  no orphan appears in workflow primary_sections

--- Banned characters ---
  PASS  no U+00A7 in nodes_compact
  PASS  no U+00A7 in workflows_compact

--- Router logic (ported to Node) ---
  PASS  Table 1004.5 → occupant_load
  PASS  Group M → occupancy_classification
  PASS  مخارج/egress → egress
  PASS  رشاشات/sprinkler → sprinkler
  PASS  إنذار/fire alarm → fire_alarm
  PASS  pump/مضخة → fire_pump
  PASS  standpipe → standpipe
  PASS  تحية/greeting → non_code

--- Validation cases ---
  PASS  10 validation cases in package
  PASS  vc_01 Table 1004.5 routes to occupant_load
  PASS  vc_02 min exits routes to egress

========================================
Results: 22 PASS, 0 FAIL
ALL TESTS PASS
```

## R17 Dynamic Thinking SSE Validation

```
node scripts/validate_r17_dynamic_thinking_sse.cjs
```

```
R17 Dynamic Thinking SSE Tests

--- Flag gate ---
  PASS  flag OFF → 0 thinking events emitted
  PASS  flag ON + advisory + workflow → N events built
  PASS  events converted to thinking_status SSE frames

--- Message safety ---
  PASS  no CoT / scoring / private paths in any MESSAGES entry
  PASS  no unsafe content in built SSE frames

--- Frontend parser ---
  PASS  thinking_status events captured by onThinkingStatus
  PASS  thinking_status events NOT sent to onDelta
  PASS  fullContent only accumulates choices[0].delta.content
  PASS  thinking messages never mixed into fullContent

--- Mode isolation ---
  PASS  Main mode: no thinking events (flag-gated inside standard block)
  PASS  Analytical mode: no thinking events (separate bufferingStream, no B2 path)

--- Static phrase exclusion ---
  PASS  FORBIDDEN_STATIC_PHRASES_AR loaded (6 entries)
  PASS  FORBIDDEN_STATIC_PHRASES_EN loaded (4 entries)
  PASS  no FORBIDDEN_STATIC_PHRASES_AR appear in MESSAGES matrix
  PASS  no FORBIDDEN_STATIC_PHRASES_EN appear in MESSAGES matrix

--- Message length ---
  PASS  all MESSAGES entries ≤ 80 chars
  PASS  no U+00A7 § in any MESSAGES entry

========================================
Results: 17 PASS, 0 FAIL
ALL TESTS PASS
```

## Summary

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ clean |
| `validate_advisory_brain_b2.cjs` | ✅ 22/22 PASS |
| `validate_r17_dynamic_thinking_sse.cjs` | ✅ 17/17 PASS |
| **Total** | **39/39 PASS, 0 FAIL** |
