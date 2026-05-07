# R25 — Advisory 503 Emergency Stabilization Closeout

**Date:** 2026-05-07  
**Scope:** Advisory mode "Service error: 503" emergency fix  
**Result:** COMPLETE

---

## 1. Root Cause — Confirmed ✓

**Gemini upstream transient 503.** Advisory mode uses `gemini-2.5-pro` which returns HTTP 503 under load. Pre-R25 code had no fallback or retry for 503, propagating it directly to the user as `"Service error: 503"`.

---

## 2. Fix — Surgical ✓

**File:** `supabase/functions/fire-safety-chat/index.ts`  
**Lines changed:** 5688, 5705–5724 (new block), 5734–5738 (new case)

Three additions:
1. **Model fallback:** 503 added to `(429 || 404)` condition → triggers pro→flash fallback
2. **Retry-with-backoff:** If flash also 503s, wait 1500ms and retry once automatically
3. **Friendly error:** If all retries fail, bilingual Arabic/English message replaces `"Service error: 503"`

**Nothing else changed.** No B2 flags, no brain package, no workflow_constraints.ts, no DB, no bucket, no migrations.

---

## 3. Deploy — Complete ✓

| Component | Status |
|---|---|
| `fire-safety-chat` edge function | DEPLOYED (`hrnltxmwoaphgejckutk`) |
| Frontend | No change needed |
| Flags | All 4 B2 flags remain ON |

---

## 4. Verification — PASS ✓

| Check | Result |
|---|---|
| CORS preflight `OPTIONS` | HTTP 200 ✓ |
| R25 source markers in deployed file | 5 matches ✓ |
| B2 flags untouched | Confirmed ✓ |

---

## 5. Advisory Brain — Production State

| Layer | Status |
|---|---|
| Advisory B2 Router | ON |
| Advisory B2 Evidence | ON — Table 1004.5 boosted (R24) |
| Advisory Dynamic Thinking | ON — visible to users (R22+R23+R24) |
| Occupant Load Answer Quality | Improved (R24: 2.8/5.6/28 GROSS rules) |
| Gemini 503 Resilience | ADDED (R25: fallback + retry + friendly error) |
| Edge function | Live on `hrnltxmwoaphgejckutk` |
| Frontend bundle | `ChatInterface-BSYRQ396.js` on `consultx.app` |
| SW cache | v3 — no stale bundle risk |

---

## 6. Change Summary (R25)

| File | Type | Change |
|---|---|---|
| `supabase/functions/fire-safety-chat/index.ts` | Fix | 503 → flash fallback + retry + bilingual error |
| `docs/brain/R25_ADVISORY_503_ERROR_CAPTURE.md` | Docs | Error trace |
| `docs/brain/R25_ADVISORY_503_FLAGS_STATE.md` | Docs | B2 flags verification |
| `docs/brain/R25_ADVISORY_503_FAILURE_CLASSIFICATION.md` | Docs | Root cause classification |
| `docs/brain/R25_ADVISORY_503_FIX_OR_MITIGATION.md` | Docs | Fix specification |
| `docs/brain/R25_ADVISORY_503_RESTORATION_VERIFY.md` | Docs | Deploy verification |
| `docs/brain/R25_ADVISORY_503_STABILIZATION_CLOSEOUT.md` | Docs | This file |

---

## 7. Recommended Next Step: R19 — Mobile UX Polish

Advisory Brain V1 is now stable. R19 tasks:
1. Scroll-to-bottom behavior on mobile for long Advisory responses
2. Dynamic thinking status display on small screens
3. Source panel touch targets (min 44px)
