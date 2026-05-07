# R26 — Occupant Load Regression Deploy Result

**Date:** 2026-05-07
**Sprint:** R26 Emergency Regression Fix

---

## Edge Function Deployment

```
npx supabase functions deploy fire-safety-chat --project-ref hrnltxmwoaphgejckutk
```

**Result:** ✓ Deployed

Files uploaded:
- `supabase/functions/fire-safety-chat/index.ts` (source pollution fix: restrictToSBC201, getTargetChapters cross-ref, buildEvidenceOverlay workflowId)
- `supabase/functions/fire-safety-chat/workflow_constraints.ts` (R26 mandatory protocol block)
- `supabase/functions/fire-safety-chat/workflow_router.ts` (unchanged — verified)
- `supabase/functions/fire-safety-chat/brain_b1_loader.ts` (unchanged)
- `supabase/functions/fire-safety-chat/brain_b1_types.ts` (unchanged)
- `supabase/functions/fire-safety-chat/thinking_ux_emitter.ts` (unchanged)

Dashboard: `https://supabase.com/dashboard/project/hrnltxmwoaphgejckutk/functions`

---

## CORS Preflight Check

```
curl -X OPTIONS https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat
→ HTTP 200 ✓
```

---

## Flags Verification (All 4 Still ON)

| Flag | Status |
|---|---|
| ADVISORY_BRAIN_B2_ENABLED | ✓ ON |
| ADVISORY_BRAIN_B2_ROUTER_ENABLED | ✓ ON |
| ADVISORY_BRAIN_B2_EVIDENCE_ENABLED | ✓ ON |
| ADVISORY_DYNAMIC_THINKING_ENABLED | ✓ ON |

No flags were disabled or modified.

---

## Frontend — No Deploy Needed

R26 modifies only the edge function. Frontend (`ChatInterface-CTvhjiv8.js`) is unchanged.
No Vercel deploy required.

---

## Production URLs

- App: `https://consultx.app`
- Edge function: `https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat`
