# Advisory Brain B2 — Safe Answer Rules Result

**Date:** 2026-05-06  
**Phase:** B2 Phase 5 — Safe Answer Constraints  
**Source:** `workflows_compact.json` → `workflow_constraints.ts` → `buildEvidenceOverlay()`  
**Flag:** `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` (same as Phase 4; delivered in the same overlay)

---

## What Was Built

Safe-answer rules are embedded in each workflow object in `workflows_compact.json` and injected
into the Advisory system prompt via `buildEvidenceOverlay()` when the evidence flag is ON.

Three constraint layers per workflow:

| Field | Purpose | Max injected |
|-------|---------|--------------|
| `safe_answer_rules` | What the model MAY say and HOW | 6 rules |
| `must_not_claim_rules` | What the model MUST NOT claim without retrieval | 4 rules |
| `citation_requirements` | How to anchor citations (page, ref, code) | 4 rules |

---

## Coverage by Workflow

| Workflow | safe_answer_rules | must_not_claim_rules | citation_requirements |
|----------|------------------|--------------------|----------------------|
| wf_occupancy_classification | present | present | present |
| wf_occupant_load | present | present | present |
| wf_egress | present | present | present |
| wf_sprinkler | present | present | present |
| wf_fire_alarm | present | present | present |
| wf_fire_pump | present | present | present |
| wf_standpipe | present | present | present |
| wf_smoke_control | present | present | present |

---

## Design Constraints Enforced

- Rules are stored as plain Arabic/English strings — no U+00A7 (§) character, verified by invariant
  check in `brain_b1_loader.ts` load validation and `validate_advisory_brain_b2.cjs`
- Rules sourced from B1 brain package (`workflows_compact.json`), not hardcoded in TS
- Max-slice on injection (6 / 4 / 4) prevents system prompt bloat
- Rules injected only when evidence flag is ON; no rule injection when flag is OFF

---

## Overlay Injection Point

```
Advisory system prompt
  ├── [existing base prompt]
  ├── [BrainFullV1 retrieval context — unchanged]
  └── [B2 overlay — only when ADVISORY_BRAIN_B2_EVIDENCE_ENABLED=1]
        ├── 📋 Parking-lot warnings
        ├── 🔒 Missing inputs
        ├── 📐 safe_answer_rules (max 6)
        ├── ⛔ must_not_claim_rules (max 4)
        ├── 📎 citation_requirements (max 4)
        └── 📚 Supporting source hints (max 5)
```

---

## Verdict: PASS — Safe-answer rules embedded in B1 package and injected via evidence overlay. Flag OFF by default.
