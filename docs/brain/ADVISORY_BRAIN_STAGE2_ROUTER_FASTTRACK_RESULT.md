# Advisory Brain — Stage 2 Router Fast-Track Result

**Date:** 2026-05-06  
**Task:** TASK 3 — Enable Stage 2 (Workflow Router)

---

## Secret Set

```bash
npx supabase secrets set ADVISORY_BRAIN_B2_ROUTER_ENABLED=1 --project-ref hrnltxmwoaphgejckutk
# Output: Finished supabase secrets set.
```

## Verification

| Flag | Hash (SHA256) | Expected |
|------|---------------|----------|
| `ADVISORY_BRAIN_B2_ROUTER_ENABLED` | `6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b` | SHA256("1") ✅ |

## What Stage 2 Does

- Activates `routeAdvisoryQuery()` in `workflow_router.ts`
- Classifies every Advisory query into one of 10 domains:
  `occupancy_classification`, `occupant_load`, `egress`, `sprinkler`, `fire_alarm`,
  `fire_pump`, `standpipe`, `smoke_control`, `general_code_lookup`, `non_code`
- Scoring: explicit refs +3, Arabic keywords +2, English keywords +1
- **Diagnostics only** — no change to answer text, retrieval, or streaming
- Router result passed to Stage 3 (evidence augmentation) if `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED=1`

## Rollback

```bash
npx supabase secrets unset ADVISORY_BRAIN_B2_ROUTER_ENABLED --project-ref hrnltxmwoaphgejckutk
```

## Verdict: PASS — Stage 2 Router LIVE
