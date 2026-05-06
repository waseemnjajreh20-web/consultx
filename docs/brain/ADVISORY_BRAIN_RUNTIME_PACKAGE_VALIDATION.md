# Advisory Brain — Runtime Package Validation

**Date:** 2026-05-06  
**Package:** `generated/consultx_brain_full/v4/advisory_brain/runtime_package/`  
**Validator:** embedded in `scripts/build_advisory_brain_b2_runtime_package.cjs`

---

## Validation Checks Run

| # | Check | Method | Result |
|---|-------|--------|--------|
| 1 | No duplicate node IDs | Set-based dedup across all 440 nodes | PASS |
| 2 | No dangling edge from_node | from_node must be in known node set | PASS |
| 3 | No orphan in workflow primary_sections | orphan IDs cross-checked against all workflow primary_sections | PASS |
| 4 | No orphan in workflow supporting_tables | same cross-check for tables | PASS |
| 5 | Banned U+00A7 absent | JSON.stringify scan | PASS (0 occurrences) |
| 6 | No secret/credential patterns | regex scan for JWT / service_role / password / api_key | PASS |
| 7 | All 8 required workflows present | ID check against REQUIRED_WORKFLOWS constant | PASS |
| 8 | Orphans have do_not_promote: true | explicit flag set on all 11 orphan nodes | PASS |
| 9 | No unadopted promoted as required | no orphan node_id appears in any workflow primary/table list | PASS |
| 10 | Schema valid (all files parse) | JSON.parse on all 6 output files | PASS |

---

## Counts at Validation Time

```
sections:      94
subsections:   90
tables:        145
orphans:       11   (all do_not_promote: true)
thresholds:    100
total nodes:   440

in-graph edges:    278
external_xrefs:    405

workflows:     8
val cases:     10
```

---

## Parking-Lot Handling

Parking-lot references (14 in B1 workflows) are modeled in `missing_or_parking_lot_refs` arrays.
They are NOT in `primary_sections` or `supporting_tables`. No orphan ID appears in any
promoted position.

Parking-lot refs with high risk in validation: 2 (907.2.11 orphan + 903.2.7 parking lot).
Both handled by safe_answer_rules in their respective workflows.

---

## Final Gate

- All envelopes parse: ✅
- Banned U+00A7 absent: ✅
- No secret patterns: ✅
- No orphan promoted: ✅
- No unadopted promoted: ✅
- No dangling edges (from_node): ✅
- No duplicate node_id: ✅
- All 8 required workflows present: ✅

**Verdict: PASS — 0 errors, 0 warnings**
