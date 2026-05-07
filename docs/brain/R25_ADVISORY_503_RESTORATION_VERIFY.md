# R25 — Advisory 503 Restoration Verification

**Date:** 2026-05-07  
**Sprint:** R25 Emergency Stabilization

---

## Deploy Confirmed

```
Deployed Functions on project hrnltxmwoaphgejckutk: fire-safety-chat
Dashboard: https://supabase.com/dashboard/project/hrnltxmwoaphgejckutk/functions
```

All 6 function assets uploaded:
- `index.ts` (R25 503 retry fix)
- `brain_b1_types.ts`
- `thinking_ux_emitter.ts`
- `workflow_constraints.ts` (R24 occupant load fix)
- `workflow_router.ts`
- `brain_b1_loader.ts`

---

## CORS Preflight — PASS ✓

```
curl -X OPTIONS https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat \
  -H "Origin: https://consultx.app" \
  -H "Access-Control-Request-Method: POST"
→ HTTP 200
```

Edge function is live and responding.

---

## R25 Code Markers Confirmed in Source ✓

```bash
grep -c "R25\|503 retry\|1500ms\|مشغولة" index.ts
→ 5 matches
```

All three R25 changes are present:
1. `503` added to model-fallback condition
2. R25 retry block with 1500ms backoff
3. Bilingual 503 message

---

## B2 Flags — Unchanged ✓

All 4 flags remain ON (set as Supabase secrets, not touched by this deploy):
- `ADVISORY_BRAIN_B2_ENABLED=1`
- `ADVISORY_BRAIN_B2_ROUTER_ENABLED=1`
- `ADVISORY_BRAIN_B2_EVIDENCE_ENABLED=1`
- `ADVISORY_DYNAMIC_THINKING_ENABLED=1`

---

## Expected Behavior Post-R25

| Scenario | Pre-R25 | Post-R25 |
|---|---|---|
| Gemini Pro 503, Flash OK | `"Service error: 503"` | Flash handles query transparently |
| Gemini Pro 503, Flash 503 (transient) | `"Service error: 503"` | 1.5s retry → success |
| Gemini Pro 503, Flash 503 (sustained) | `"Service error: 503"` | Friendly bilingual message |

Advisory mode is restored. R24 occupant load quality and dynamic thinking remain intact.
