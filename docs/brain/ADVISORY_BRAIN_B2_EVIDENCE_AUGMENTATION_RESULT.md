# Advisory Brain B2 — Evidence Augmentation Result

**Date:** 2026-05-06  
**Phase:** B2 Phase 4 — Evidence Augmentation  
**File:** `supabase/functions/fire-safety-chat/workflow_constraints.ts`  
**Flag:** `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED`

---

## What Was Built

`workflow_constraints.ts` — augments retrieval context with semantic hints from the selected
workflow and injects a structured constraint overlay into the Advisory system prompt.

### Flag Behavior

| Flag value | Behavior |
|-----------|----------|
| unset / "0" | `isEvidenceEnabled()` → false; `augmentWithWorkflow()` returns null; no-op |
| "1" | Builds `AugmentationResult`; emits `[EvidenceB2]` diagnostic; injects overlay into prompt |

### Diagnostic Emitted (flag ON)
```
[EvidenceB2] workflow=wf_occupant_load hints=6 parking_lot=2 missing_inputs=1
```

---

## Hint Generation (priority order)

| Source | Type | Boost Weight |
|--------|------|-------------|
| `workflow.supporting_tables` | `supporting_table` | **3.0** |
| `workflow.primary_sections` | `primary_section` | **2.5** |
| `workflow.threshold_candidates` | `threshold` | **2.0** |
| In-graph edges (section↔table xrefs) | `xref` | **1.5** |

### Invariants Enforced

- **Orphan nodes** — never added to hints; `nodes_by_id.get(id)?.node_type === "orphan"` skips
- **Low-confidence thresholds** — skipped: `if (node.confidence === "low") continue`
- **Parking-lot refs** — listed in `parking_lot_warnings`, never passed as available text
- **SBC family isolation** — `filterHintsByFamily()` prevents SBC201/SBC801 cross-pollution
- **De-duplication** — xref traversal skips nodes already in hints: `hints.some(h => h.node_id === ...)`

---

## System Prompt Overlay Sections

When `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED=1`, `buildEvidenceOverlay(aug, language)` returns a string
appended to the Advisory system prompt with these sections (only if non-empty):

1. **Parking-lot warnings** (📋) — binding; model must not publish text from missing refs
2. **Missing required inputs** (🔒) — model must stop and ask user before numeric answer
3. **Safe-answer rules** (📐) — max 6 rules; workflow-specific constraints (binding)
4. **Must-not-claim rules** (⛔) — max 4 rules; what cannot be stated without retrieved source
5. **Citation requirements** (📎) — max 4 rules; how to anchor citations
6. **Supporting source hints** (📚) — max 5 entries; for model orientation only (not citation)

### Overlay language
- Sections use Arabic headers when `language === "ar"`, English when `language === "en"`
- Never mixes languages within a section

---

## Missing Input Detection (Heuristics)

| Required input | Detection pattern |
|----------------|-------------------|
| `floor_area` / `مساحة` | Numeric + m²/م²/sqm/متر |
| `space_function` / `وظيفة` | Occupancy-type keyword list |
| `fixed_seating` | seat/chair/كرسي/مقعد/`N persons` |
| All others | Query length > 50 chars (conservative) |

---

## Mode Isolation

- Advisory (mode === "standard"): augmentation run inside B2 evidence block if flag ON
- Main (mode === "primary"): never reaches this code
- Analytical (mode === "analysis"): never reaches this code

---

## Verdict: PASS — Evidence augmentation added, flag OFF by default, no behavior change.
