# R18 — Deploy Result

**Date:** 2026-05-06  
**Task:** TASK 8 — Deploy

---

## Edge Function Deploy

```bash
npx supabase functions deploy fire-safety-chat --project-ref hrnltxmwoaphgejckutk
```

Result:
```
Uploading asset (fire-safety-chat): supabase/functions/fire-safety-chat/index.ts
Uploading asset (fire-safety-chat): supabase/functions/fire-safety-chat/brain_b1_types.ts
Uploading asset (fire-safety-chat): supabase/functions/fire-safety-chat/thinking_ux_emitter.ts
Uploading asset (fire-safety-chat): supabase/functions/fire-safety-chat/workflow_constraints.ts
Uploading asset (fire-safety-chat): supabase/functions/fire-safety-chat/workflow_router.ts
Uploading asset (fire-safety-chat): supabase/functions/fire-safety-chat/brain_b1_loader.ts
Deployed Functions on project hrnltxmwoaphgejckutk: fire-safety-chat
```

| Field | Value |
|-------|-------|
| Function | `fire-safety-chat` |
| Status | ACTIVE |
| Version | **148** (post-R18 deploy) |
| Change | Source precision downgrade: spans > 100 pages → `chunk_range_only` |

## Flags — No Changes

All 4 flags remain ON (SHA256 = `6b86b273...` = "1"):
- `ADVISORY_BRAIN_B2_ENABLED` ✅
- `ADVISORY_BRAIN_B2_ROUTER_ENABLED` ✅
- `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED` ✅
- `ADVISORY_DYNAMIC_THINKING_ENABLED` ✅

## Frontend Deploy (Vercel) — Still Pending Branch Merge

Frontend changes in this branch:
- `public/sw.js` — CACHE_NAME bumped to `consultx-v3`
- `src/utils/sourceMetadata.ts` — formatSourceLabel precision guard
- `src/components/SourcePanel.tsx` — page row guard + structured table UX

These will deploy automatically when the branch is merged to `main`.

## What Is Live Now

| Change | Status |
|--------|--------|
| Source precision: broad spans → `chunk_range_only` | ✅ LIVE (v148) |
| Dynamic thinking SSE emission | ✅ LIVE (from v147) |
| B2 router + evidence + loader | ✅ LIVE (from prior deploys) |
| SW cache v3, SourcePanel fixes, formatSourceLabel guard | ⏳ pending branch merge → Vercel |
