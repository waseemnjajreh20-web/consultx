# R16 — Edge Function and Flags State Audit

**Date:** 2026-05-06  
**Task:** TASK 2 — Edge Function State Audit

---

## 1. Deployed Function Version

```
Function:     fire-safety-chat
Status:       ACTIVE
Version:      146
Updated at:   2026-05-06 05:19:10 UTC
Project:      hrnltxmwoaphgejckutk
```

Note: Previous session documentation referenced version 141 — this was a documentation error. The correct deployed version is **146**.

## 2. Edge Code Modules Present

Confirmed present in `supabase/functions/fire-safety-chat/`:

| File | Status |
|------|--------|
| `index.ts` | ✅ present — B2 imports at lines 4-14 |
| `brain_b1_loader.ts` | ✅ present |
| `workflow_router.ts` | ✅ present |
| `workflow_constraints.ts` | ✅ present |
| `thinking_ux_emitter.ts` | ✅ present |
| `brain_b1_types.ts` | ✅ present |

B2 imports confirmed in `index.ts` lines 4-14:
```typescript
import { isB2Enabled, loadAdvisoryBrainB1 } from "./brain_b1_loader.ts";
import { isRouterEnabled, routeAdvisoryQuery } from "./workflow_router.ts";
import { isEvidenceEnabled, augmentWithWorkflow, buildEvidenceOverlay, filterHintsByFamily } from "./workflow_constraints.ts";
import { isDynamicThinkingEnabled, buildThinkingSequence, formatThinkingEvent, type ThinkingEvent } from "./thinking_ux_emitter.ts";
import type { AdvisoryBrainB1, RouterResult, AugmentationResult } from "./brain_b1_types.ts";
```

## 3. Supabase Secrets (Flags)

All 4 Advisory Brain flags are SET. Hash verification (no values printed):

| Flag | Hash (SHA256) | Expected SHA256("1") | Match |
|------|---------------|----------------------|-------|
| `ADVISORY_BRAIN_B2_ENABLED` | `6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b` | `6b86b273...` | ✅ |
| `ADVISORY_BRAIN_B2_ROUTER_ENABLED` | `6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b` | `6b86b273...` | ✅ |
| `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` | `6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b` | `6b86b273...` | ✅ |
| `ADVISORY_DYNAMIC_THINKING_ENABLED` | `6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b` | `6b86b273...` | ✅ |

## 4. Package Bucket Verification

Verified via REST `GET /storage/v1/object/info/public/ssss/brain_full_v1/{key}`:

| File | HTTP Status | Present |
|------|-------------|---------|
| `brain_full_v1/advisory_brain_manifest.json` | 200 | ✅ |
| `brain_full_v1/advisory_nodes_compact.json` | 200 | ✅ |
| `brain_full_v1/advisory_edges_compact.json` | 200 | ✅ |
| `brain_full_v1/advisory_workflows_compact.json` | 200 | ✅ |
| `brain_full_v1/advisory_validation_cases_compact.json` | 200 | ✅ |

## 5. Manifest Counts

From local `advisory_brain_manifest.json` (same files as uploaded):

| Count | Expected | Actual |
|-------|----------|--------|
| nodes | 440 | ✅ 440 (sections=184, tables=145, orphans=11, thresholds=100) |
| edges (in-graph) | 278 | ✅ 278 |
| external xrefs | 405 | ✅ 405 |
| workflows | 8 | ✅ 8 |
| validation_cases | 10 | ✅ 10 |

## 6. CORS Preflight

```
OPTIONS https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat
→ 200 (0.18s connect time)
```

## 7. Known Issue — Thinking Events Not Emitted

`_thinkingEventsB2` is built at index.ts:5566, logged at 5570, but **never enqueued into the SSE stream**.

The `advisoryStream` TransformStream (index.ts:5791) only handles buffering + re-streaming the Gemini response. No code path sends thinking events before the Gemini call.

This is a gap in the B2 implementation, not a deployment issue. The edge function is correctly deployed with B2 code; the B2 code simply does not emit thinking events to the client.

---

## Summary

| Check | Result |
|-------|--------|
| fire-safety-chat version | 146 ACTIVE |
| B2 modules in deployed function | ✅ all 6 present |
| All 4 flags ON | ✅ SHA256("1") confirmed |
| Package files in bucket | ✅ 5/5 HTTP 200 |
| Node/edge/workflow counts | ✅ 440/278/8 |
| CORS preflight | ✅ 200 |
| Thinking events emitted to stream | ❌ NOT emitted (implementation gap) |
