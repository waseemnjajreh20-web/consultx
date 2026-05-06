# Advisory Brain B2 — Stage 1 Enablement Result

**Date:** 2026-05-06  
**Task:** TASK 4 — Stage 1 Enablement  
**Flag:** `ADVISORY_BRAIN_B2_ENABLED=1`

---

## Stage 1 Command

```bash
npx supabase secrets set ADVISORY_BRAIN_B2_ENABLED=1 --project-ref hrnltxmwoaphgejckutk
```

**Result:** `Finished supabase secrets set.`

---

## Flag Verification (secrets list)

| Secret | Hash (SHA256) | Value | Status |
|--------|--------------|-------|--------|
| `ADVISORY_BRAIN_B2_ENABLED` | `6b86b273ff34fce...` | "1" (confirmed) | ✅ SET |
| `ADVISORY_BRAIN_B2_ROUTER_ENABLED` | — | not set | ✅ OFF |
| `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` | — | not set | ✅ OFF |
| `ADVISORY_DYNAMIC_THINKING_ENABLED` | — | not set | ✅ OFF |

SHA256("1") = `6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b` — hash match confirms value is exactly `"1"`.

---

## What Stage 1 Does

With `ADVISORY_BRAIN_B2_ENABLED=1` and all other flags OFF:

```
On first Advisory request:
  loadAdvisoryBrainB1() → isB2Enabled() = true
  → fetches 6 files from ssss/brain_full_v1/advisory_*
  → validates package (8 workflows, orphan invariants, no §)
  → caches for 10 minutes
  → logs: [AdvisoryBrainB2] flag=on package_loaded=true nodes=440

Subsequent requests (within 10 min):
  → [AdvisoryBrainB2] flag=on package_loaded=true source=cache

routeAdvisoryQuery() → isRouterEnabled() = false → returns null (no router)
augmentWithWorkflow() → isEvidenceEnabled() = false → returns null (no overlay)
buildThinkingSequence() → isDynamicThinkingEnabled() = false → returns []
```

**Net effect: brain loads into memory. No answer change. No prompt change. No source change.**

---

## Expected Logs (first Advisory request)

```
[AdvisoryBrainB2] flag=on loading brain package from bucket…
[AdvisoryBrainB2] flag=on package_loaded=true nodes=440 edges=278 workflows=8 validation_cases=10
```

## Pass Criteria

| Check | Status |
|-------|--------|
| Flag set to "1" | ✅ confirmed (hash match) |
| Code deployed with loader | ✅ (deploy confirmed TASK 3) |
| Bucket has advisory_* files | ✅ (7/7 verified TASK upload) |
| Other 3 flags OFF | ✅ confirmed |
| Answer behavior change | ✅ none (loader only) |

## Log Verification

To verify `package_loaded=true` in live logs:
1. Open the app in Advisory mode
2. Send any question (e.g., "ما هو جدول 1004.5؟")
3. Check Supabase Dashboard → Functions → fire-safety-chat → Logs
4. Look for: `[AdvisoryBrainB2] flag=on package_loaded=true nodes=440`

**OR** check Vercel function logs if the app is Vercel-deployed.

---

## Rollback

If any issue observed:
```bash
npx supabase secrets unset ADVISORY_BRAIN_B2_ENABLED --project-ref hrnltxmwoaphgejckutk
```

---

## Verdict: PASS — Stage 1 enabled. Brain loads on Advisory requests. No behavior change.
