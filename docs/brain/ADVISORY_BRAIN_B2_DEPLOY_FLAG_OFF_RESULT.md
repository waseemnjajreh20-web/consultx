# Advisory Brain B2 — Deploy Flag-Off Verification

**Date:** 2026-05-06  
**Phase:** B2 Phase 8 — Deploy Flag-Off + Verify

---

## Flag Status at Deploy

| Flag | Location | Value | Effect |
|------|---------|-------|--------|
| `ADVISORY_BRAIN_B2_ENABLED` | Supabase secret (not set) | unset | `isB2Enabled()` → false; loader returns null |
| `ADVISORY_BRAIN_B2_ROUTER_ENABLED` | Supabase secret (not set) | unset | `isRouterEnabled()` → false; router returns null |
| `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` | Supabase secret (not set) | unset | `isEvidenceEnabled()` → false; augmenter returns null |
| `ADVISORY_DYNAMIC_THINKING_ENABLED` | Supabase secret (not set) | unset | `isDynamicThinkingEnabled()` → false; emitter returns [] |

None of the four flags appear in:
- `supabase/config.toml`
- Any `.env` file in the function directory
- Any hardcoded string in index.ts, brain_b1_loader.ts, workflow_router.ts, workflow_constraints.ts, or thinking_ux_emitter.ts

**Confirmed default:** all four flags read `Deno.env.get(...) === "1"` — any value that is not exactly
the string `"1"` (including unset / undefined / "0" / "false") resolves to false.

---

## Behavior at Deploy (all flags OFF)

### Advisory mode (mode === "standard")
```
loadAdvisoryBrainB1()   → returns null  (isB2Enabled() = false; no bucket fetch)
routeAdvisoryQuery()    → returns null  (isRouterEnabled() = false; no classification)
augmentWithWorkflow()   → returns null  (isEvidenceEnabled() = false; no hints, no overlay)
buildThinkingSequence() → returns []    (isDynamicThinkingEnabled() = false; no events)
```

System prompt: identical to pre-B2 (no overlay appended)  
Retrieval: unchanged (BrainFullV1 sidecar continues unchanged)  
Streaming: unchanged (no thinking events emitted)  
Diagnostics: `[AdvisoryBrainB2] flag=off package_loaded=false` only in loader

### Main mode (mode === "primary")
B2 bootstrap block is inside `if (mode === "standard")` — never reached.

### Analytical mode (mode === "analysis")
B2 bootstrap block is inside `if (mode === "standard")` — never reached.

---

## Rollback

If a flag is accidentally enabled in Supabase Secrets, rollback by unsetting it:
```bash
supabase secrets unset ADVISORY_BRAIN_B2_ENABLED --project-ref <ref>
supabase secrets unset ADVISORY_BRAIN_B2_ROUTER_ENABLED --project-ref <ref>
supabase secrets unset ADVISORY_BRAIN_B2_EVIDENCE_ENABLED --project-ref <ref>
supabase secrets unset ADVISORY_DYNAMIC_THINKING_ENABLED --project-ref <ref>
```

After unsetting, the function uses the previous code path automatically (no redeploy needed for
secret changes; Deno reads env at request time).

---

## Verdict: PASS — All four B2 flags are OFF at deploy time. No behavior change to any mode.
