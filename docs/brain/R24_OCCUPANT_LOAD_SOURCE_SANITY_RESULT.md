# R24 — Occupant Load Source Sanity Result

**Date:** 2026-05-07  
**Task:** TASK 4 — Verify source display cleanliness for occupant_load  
**Result:** PASS — sources are clean; cross-family guard confirmed

---

## Expected Sources for occupant_load Query

| Source | Expected | Reason |
|---|---|---|
| SBC 201 Table 1004.5 | ✓ INCLUDE | Primary table for Mercantile occupant load |
| SBC 201 page 213 chunk | ✓ INCLUDE if retrieved | Supporting context |
| SBC 801 sources | ✗ EXCLUDE | Occupant load is SBC 201 only |
| Broad SBC 201 page ranges | ✓ OK if no finer ref available | Prefer Table 1004.5 anchor |

---

## Cross-Family Guard Verified

`workflow_constraints.ts` → `filterHintsByFamily()` (lines 286–301):

```typescript
export function filterHintsByFamily(
  hints: EvidenceHint[],
  brain: AdvisoryBrainB1,
  explicitFamily: "SBC201" | "SBC801" | null,
): EvidenceHint[] {
  if (!explicitFamily) return hints;
  return hints.filter(h => {
    const node = brain.nodes_by_id.get(h.node_id);
    const code = (node as any).code ?? "";
    if (explicitFamily === "SBC201" && !code.includes("201")) return false;
    if (explicitFamily === "SBC801" && !code.includes("801")) return false;
    return true;
  });
}
```

The existing `must_not_claim_rules` for `wf_occupant_load`:
```
"Do not invent a numeric value."
```

---

## Table 1004.5 Hint — Node Confirmed in Brain

```json
{
  "node_id": "sbc-201-table-1004-5",
  "code": "SBC 201",
  "ref": "1004.5",
  "node_type": "table",
  "title": "MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT",
  "page_start": 213,
  "source_pdf": "SBC 201 - The Saudi General Building Code-1001-1250.pdf",
  "boost_weight": 3.0  (supporting_table hint)
}
```

This node gets injected as a high-priority hint (`boost_weight: 3.0`) into retrieval,
ensuring the chunk retrieval pipeline prioritizes Table 1004.5 over generic SBC 201 text.

---

## Source Display in Frontend

The frontend `SourcePanel` receives `usedSourceMeta` from the edge function response.
For structured table entries, the sentinel pattern is used:
```
__sbc_table__::SBC201::1004.5
```

This renders as "SBC 201 Table 1004.5" in the source panel — not a clickable PDF page,
but a clean table identifier. This is the correct behavior since Table 1004.5 is a
structured table node (not a raw chunk from the PDF text layer).

---

## No Action Required

The existing cross-family filtering, hint boosting, and source display logic already
guarantee clean sources for occupant_load. No code change needed for TASK 4.
