# R20 — Advisory Brain Operational Readiness Decision

**Date:** 2026-05-06  
**Task:** TASK 7 — Final Product Readiness Decision

---

## Decision

### **B — OPERATIONAL_WITH_MANUAL_SMOKE_PENDING**

---

## Reasoning

| Gate | Status | Notes |
|------|--------|-------|
| Edge function deployed with all B2 modules | ✅ v148 ACTIVE | R17 + R18 changes live |
| All 4 B2 flags ON | ✅ | SHA256 verified |
| B2 package in bucket — all 7 files | ✅ | HTTP 200, hash verified |
| Manifest invariants PASS | ✅ | no_orphan_promoted, no_secrets, all pass |
| Automated tests: 39/39 PASS | ✅ | B2 + R17 suites |
| TypeScript: clean | ✅ | |
| Frontend consumer code written + tested | ✅ | 17/17 R17 tests |
| Frontend deployed to Vercel | ❌ | branch not merged to main |
| Live smoke (user session) | ❌ | CONSULTX_SMOKE_USER_JWT not set |

The only missing gates are:
1. **Frontend merge** — branch protection requires owner PR merge. Zero code issues.
2. **Live smoke** — no user JWT available for automated end-to-end test.

Both missing gates are **operational blockers for the user experience** but **not technical blockers** — the code is correct, the infrastructure is running, and the automated test suite covers the logic paths.

Because the frontend is not yet on Vercel, mobile users still see the old static loading indicator. The backend is fully operational but the UX improvement is pending merge.

---

## What Is Live Now

| Layer | Status |
|-------|--------|
| Edge function v148 | ✅ LIVE — B2 router, evidence, loader, dynamic thinking SSE |
| B2 package in bucket | ✅ LIVE — nodes=440, edges=278, workflows=8 |
| Flags | ✅ LIVE — all 4 ON |
| Source precision downgrade (span>100 → chunk_range_only) | ✅ LIVE |
| V4 corpus (612 chunks) | ✅ LIVE |

## What Users Currently See

- Advisory mode: backend routes queries through B2 semantic brain, augments with evidence nodes, emits `thinking_status` SSE events
- **But**: frontend still shows static timer messages ("جاري التفكير...") because the SSE consumer is not yet deployed to Vercel
- Source chips: still may show broad page ranges (frontend fix pending)
- SW cache: still `consultx-v2` (bump pending)

## After Branch Merge (Full Operational State)

- Dynamic thinking messages appear before Advisory answers
- Source chips show precise ranges only
- SW cache v3 ensures fresh frontend on mobile

---

## Known Parking Lot

| Item | Impact |
|------|--------|
| `advisory_validation_cases_compact.json` not loaded by brain_b1_loader (only 6 files loaded) | None — validation cases are for offline testing only |
| No live smoke test | Cannot confirm `package_loaded=true` in prod logs until owner runs Advisory question |
| SBC 801 Section 903.2.7 content not in V4 corpus | Parking-lot notice will show (by design) |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Package load fails in production (network, auth) | Low | All files HTTP 200, same bucket auth as corpus retrieval |
| B2 router misclassifies edge cases | Low | 22/22 router tests PASS, non_code fallback exists |
| Dynamic thinking SSE corrupts response | Very Low | Per-event try/catch, mode isolation tested |
| Mobile users get stale frontend | Medium until merge | SW v3 will force refresh on activation |

---

## Rollback Commands

**Disable dynamic thinking (instant, no deploy):**
```bash
npx supabase secrets unset ADVISORY_DYNAMIC_THINKING_ENABLED --project-ref hrnltxmwoaphgejckutk
```

**Disable full B2 routing (instant, no deploy):**
```bash
npx supabase secrets unset ADVISORY_BRAIN_B2_ROUTER_ENABLED --project-ref hrnltxmwoaphgejckutk
```

**Disable all B2 (instant, no deploy):**
```bash
npx supabase secrets unset ADVISORY_BRAIN_B2_ENABLED --project-ref hrnltxmwoaphgejckutk
```

---

## Next 3 Tasks (Owner)

1. **Merge PR** → `https://github.com/waseemnjajreh20-web/consultx/compare/main...claude/jolly-haibt-602657`  
   Vercel deploys in ~2 minutes.

2. **Run manual smoke** in Advisory mode:  
   Ask `ما متطلبات الحمل الإشغالي لمحل تجاري؟` → confirm dynamic thinking visible → confirm Supabase logs show `package_loaded=true nodes=440`

3. **Upgrade decision to A (OPERATIONAL_V1_READY)** once smoke passes → create git tag `advisory-brain-v1-operational`
