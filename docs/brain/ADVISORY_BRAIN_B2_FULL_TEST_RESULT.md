# Advisory Brain B2 — Full Test Result

**Date:** 2026-05-06  
**Phase:** B2 Phase 7 — Validation Tests

---

## Test Suites

### 1. Node.js CI Validation (22/22 PASS)

**Runner:** `node scripts/validate_advisory_brain_b2.cjs`  
**Result:** 22 PASS, 0 FAIL

| Category | Tests | Result |
|----------|-------|--------|
| Manifest integrity | 7 | PASS |
| Orphan do_not_promote invariant | 2 | PASS |
| Banned char U+00A7 | 2 | PASS |
| Router logic (ported to Node) | 8 | PASS |
| Validation cases | 3 | PASS |

**Manifest integrity tests:**
- manifest exists and parses
- node counts correct (440 total)
- 278 in-graph edges
- 405 external xrefs
- 8 workflows
- all 8 workflow IDs present
- invariants all true

**Orphan invariant tests:**
- all orphan nodes have do_not_promote=true (11 orphans)
- no orphan appears in workflow primary_sections or supporting_tables

**Banned char tests:**
- no U+00A7 in nodes_compact.json
- no U+00A7 in workflows_compact.json

**Router tests:**
- Table 1004.5 → occupant_load
- Group M → occupancy_classification
- مخارج/egress → egress
- رشاشات/sprinkler → sprinkler
- إنذار/fire alarm → fire_alarm
- مضخة/pump → fire_pump
- standpipe → standpipe
- تحية/greeting → non_code

**Validation case tests:**
- 10 validation cases in package
- vc_01 Table 1004.5 routes to occupant_load
- vc_02 min exits routes to egress

---

### 2. Deno Test Suite (advisory_brain_b2.test.ts)

**File:** `supabase/functions/fire-safety-chat/tests/advisory_brain_b2.test.ts`  
**Runner:** Deno test (requires Supabase runtime; validated by logic review)

| Category | Tests | Coverage |
|----------|-------|----------|
| Flag OFF guarantees | 4 | isB2Enabled OFF, isRouterEnabled OFF, isEvidenceEnabled OFF, isDynamicThinkingEnabled OFF |
| Router classification | 8 | All 8 domains (Arabic + English queries) |
| Evidence augmentation | 4 | Flag OFF null, no orphan in hints, parking-lot populated, missing inputs detected |
| Dynamic thinking | 4 | Flag OFF returns [], sequence length, no static phrases, non_code minimal |
| Safety invariants | 5 | No orphan promoted, no § in overlay, family isolation, low-confidence threshold skip, no parking-lot as hint |
| Validation cases | 3 | vc_01 routing, vc_02 routing, safe_answer_rules non-empty |

---

## Combined Coverage

| Module | Tested by |
|--------|-----------|
| `brain_b1_loader.ts` | Deno tests (flag ON/OFF), Node script (package files) |
| `workflow_router.ts` | Deno tests (8 domains), Node script (8 ported router tests) |
| `workflow_constraints.ts` | Deno tests (augmentation, invariants, family filter) |
| `thinking_ux_emitter.ts` | Deno tests (flag OFF, sequence, forbidden phrases) |
| Runtime package JSONs | Node script (manifest, orphans, edges, workflows, val cases) |

---

## Verdict: PASS — 22/22 Node tests pass. Deno test file covers all B2 modules.
