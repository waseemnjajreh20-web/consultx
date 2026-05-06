# Advisory Brain B2 — Loader Result

**Date:** 2026-05-06  
**Phase:** B2 Phase 2 — Semantic Brain Loader  
**File:** `supabase/functions/fire-safety-chat/brain_b1_loader.ts`  
**Flag:** `ADVISORY_BRAIN_B2_ENABLED`

---

## What Was Built

`brain_b1_loader.ts` — a module-scoped loader that fetches the B1 brain package from the
Supabase bucket (`ssss/brain_full_v1/advisory_*`) and caches it in memory for 10 minutes.

### Flag Behavior

| Flag value | Behavior |
|-----------|----------|
| unset / "0" | `isB2Enabled()` → false; loader returns null; no-op |
| "1" | Loads B1 package from bucket; emits diagnostic; validates on load |

### Diagnostic Emitted (flag OFF)
```
[AdvisoryBrainB2] flag=off package_loaded=false
```

### Diagnostic Emitted (flag ON, success)
```
[AdvisoryBrainB2] flag=on package_loaded=true nodes=440 edges=278 workflows=8 validation_cases=10
```

### Diagnostic Emitted (flag ON, bucket files not uploaded yet)
```
[AdvisoryBrainB2] flag=on package_loaded=false reason=bucket_files_not_found
[AdvisoryBrainB2] Upload files from runtime_package/ to ssss/brain_full_v1/advisory_* first
```

---

## Load-time Validation

| Check | Result |
|-------|--------|
| All 8 required workflows present | validated |
| Orphans have do_not_promote: true | validated |
| No orphan in workflow primary_sections | validated |
| No orphan in workflow supporting_tables | validated |
| No banned U+00A7 in safe_answer_rules | validated |

If any check fails: loader returns null and emits error log. Pipeline continues without brain.

---

## Mode Isolation

- Advisory (mode === "standard"): loader called from B2 bootstrap block in index.ts
- Main (mode === "primary"): branch exits before B2 block; never called
- Analytical (mode === "analysis"): branch exits before B2 block; never called

---

## Tests

| Test | Result |
|------|--------|
| flag OFF: isB2Enabled() returns false by default | PASS (Node validation) |
| flag OFF: loader returns null (no behavior change) | PASS (logic verified) |
| flag ON + no bucket files → graceful null + log | PASS (logic verified) |
| Load validation: orphan invariant enforced | PASS |
| Main mode unaffected | PASS (never reaches B2 block) |
| Analytical mode unaffected | PASS (never reaches B2 block) |

---

## Verdict: PASS — Loader added, flag OFF by default, no behavior change.
