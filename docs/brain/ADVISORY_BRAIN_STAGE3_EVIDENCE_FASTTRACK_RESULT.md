# Advisory Brain — Stage 3 Evidence Fast-Track Result

**Date:** 2026-05-06  
**Task:** TASK 4 — Enable Stage 3 (Evidence Augmentation)

---

## Secret Set

```bash
npx supabase secrets set ADVISORY_BRAIN_B2_EVIDENCE_ENABLED=1 --project-ref hrnltxmwoaphgejckutk
# Output: Finished supabase secrets set.
```

## Verification

| Flag | Hash (SHA256) | Expected |
|------|---------------|----------|
| `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` | `6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b` | SHA256("1") ✅ |

## What Stage 3 Does

- Activates `augmentWithWorkflow()` + `buildEvidenceOverlay()` in `workflow_constraints.ts`
- Builds `EvidenceHint[]` from workflow primary_sections, supporting_tables, threshold_candidates, in-graph edges
- Orphan guard: nodes with `node_type === "orphan"` are never promoted to hints
- `filterHintsByFamily()` prevents SBC201/SBC801 cross-pollution
- `buildEvidenceOverlay()` injects prompt overlay with:
  - parking-lot warnings for missing refs
  - missing inputs checklist
  - safe_answer_rules
  - must_not_claim_rules
  - citation_requirements
  - source hints (section references)
- **No change to retrieval pipeline or streaming format**

## Hint Weights

| Type | Weight |
|------|--------|
| supporting_table | 3.0 |
| primary_section | 2.5 |
| threshold_candidate | 2.0 |
| xref | 1.5 |

## Rollback

```bash
npx supabase secrets unset ADVISORY_BRAIN_B2_EVIDENCE_ENABLED --project-ref hrnltxmwoaphgejckutk
```

## Verdict: PASS — Stage 3 Evidence Augmentation LIVE
