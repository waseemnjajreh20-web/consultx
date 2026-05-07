# R25 — Advisory B2 Flags State Verification

**Date:** 2026-05-07  
**Sprint:** R25 Emergency Stabilization

---

## B2 Flags — All 4 Confirmed ON

| Flag | Env Var | Function | State |
|---|---|---|---|
| Brain B2 load | `ADVISORY_BRAIN_B2_ENABLED` | `isB2Enabled()` | ON ✓ |
| Router | `ADVISORY_BRAIN_B2_ROUTER_ENABLED` | (checked via router call in index.ts:5435) | ON ✓ |
| Evidence augmentation | `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` | (checked in index.ts:5536) | ON ✓ |
| Dynamic thinking | `ADVISORY_DYNAMIC_THINKING_ENABLED` | `isDynamicThinkingEnabled()` | ON ✓ |

Flags are set as Supabase edge function secrets and were confirmed ON by R24 deploy result.

---

## B2 Code Path — Not the Cause

All B2 code blocks are wrapped in try/catch (non-fatal):
- `loadAdvisoryBrainB1` (line 5431): caught at line 5432–5434
- `routeAdvisoryQuery` (line 5435): pure function, no async, no failure path
- `augmentWithWorkflow` (line 5547): caught at line 5563
- `buildThinkingSequence` (line 5572): pure function

R24 changes to `workflow_constraints.ts`:
- Added `safe_answer_rules` prepend for `wf_occupant_load`
- `AugmentationResult.safe_answer_rules` is `string[]` (not readonly) — reassignment valid
- Strings contain only valid UTF-8 (m² = U+00B2 is valid)
- **Cannot produce a Gemini 503**

**Conclusion:** Flags are ON and B2 pipeline is not the failure source.
