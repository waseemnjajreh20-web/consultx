# R20 — Advisory Brain Flags Final State

**Date:** 2026-05-06  
**Task:** TASK 4 — Flags Final State

---

## Verification Method

```bash
npx supabase secrets list --project-ref hrnltxmwoaphgejckutk
```

Values are not printed — verified by SHA256 digest only.

`SHA256("1") = 6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b`

## Flag State

| Flag | Digest | Value |
|------|--------|-------|
| `ADVISORY_BRAIN_B2_ENABLED` | `6b86b273...` | ✅ "1" — ON |
| `ADVISORY_BRAIN_B2_ROUTER_ENABLED` | `6b86b273...` | ✅ "1" — ON |
| `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` | `6b86b273...` | ✅ "1" — ON |
| `ADVISORY_DYNAMIC_THINKING_ENABLED` | `6b86b273...` | ✅ "1" — ON |

Also present (not a B2 flag):
- `ADVISORY_PDF_LOOKUP_ENABLED`: `5feceb66...` = "0" — OFF (expected, not part of B2)

## No Changes Made

All 4 required flags were already ON. No `supabase secrets set` commands needed.

## Flag Semantics

| Flag | Controls |
|------|---------|
| `ADVISORY_BRAIN_B2_ENABLED` | `isDynamicThinkingEnabled()` check + brain_b1_loader init |
| `ADVISORY_BRAIN_B2_ROUTER_ENABLED` | workflow_router.ts — classifies domain |
| `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` | workflow_constraints.ts — augments prompt with evidence nodes |
| `ADVISORY_DYNAMIC_THINKING_ENABLED` | thinking_ux_emitter.ts — emits thinking_status SSE frames |

## Rollback (disable thinking without full redeploy)

```bash
npx supabase secrets unset ADVISORY_DYNAMIC_THINKING_ENABLED --project-ref hrnltxmwoaphgejckutk
```

Frontend falls back to static timer messages instantly. No broken UX.

## Verdict

All 4 Advisory Brain B2 flags confirmed ON. No changes required.
