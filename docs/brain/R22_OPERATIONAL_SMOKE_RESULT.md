# R22 — Operational Smoke Result

**Date:** 2026-05-07  
**Task:** TASK 3 — Automated Smoke Where Possible

---

## User JWT Status

`CONSULTX_SMOKE_USER_JWT`: **NOT_SET**

Full live Advisory mode smoke is not possible without a user session. Service_role was not used to forge one (prohibited).

---

## Automated Checks Performed (No JWT Required)

### 1. Edge Function Reachability (CORS Preflight)

```bash
curl -X OPTIONS -H "Origin: https://consultx.app" \
  -H "Access-Control-Request-Method: POST" \
  https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat
```

**Result: HTTP 200** ✅ — Edge function reachable, CORS configured.

### 2. B2 Flags All ON

```
ADVISORY_BRAIN_B2_ENABLED          = 6b86b273...  (SHA256 of "1") ✅
ADVISORY_BRAIN_B2_EVIDENCE_ENABLED = 6b86b273...  ✅
ADVISORY_BRAIN_B2_ROUTER_ENABLED   = 6b86b273...  ✅
ADVISORY_DYNAMIC_THINKING_ENABLED  = 6b86b273...  ✅
```

### 3. Production Site Reachable

```
GET https://consultx.app  →  HTTP 307 → 200  ✅
```

### 4. Service Worker Version

```
GET https://consultx.app/sw.js
→  const CACHE_NAME = 'consultx-v3';  ✅
```

SW v3 is live on production. Mobile browsers will get fresh bundle on next activation.

### 5. Automated Test Suite

```
validate_r17_dynamic_thinking_sse.cjs  →  17/17 PASS  ✅
validate_advisory_brain_b2.cjs         →  22/22 PASS  ✅
validate_r22_dynamic_thinking_visibility.cjs  →  25/25 PASS  ✅
npx tsc --noEmit                       →  clean  ✅
```

### 6. Frontend Bundle (Pre-Vercel-Redeploy)

At time of check, the bundle `assets/index-W5b-0r0S.js` (668KB) was still being served — Vercel was rebuilding from the new `95a9034` push. The new bundle will contain `thinking_status` handler + timing fix.

---

## BLOCKED_NO_USER_SESSION

The following checks require a real user JWT and are pending owner smoke:

| Check | Status |
|-------|--------|
| `package_loaded=true nodes=440` in Supabase logs | ⏳ BLOCKED_NO_USER_SESSION |
| `router domain=occupant_load` log | ⏳ BLOCKED_NO_USER_SESSION |
| `thinking_status` events visible in DevTools Network | ⏳ BLOCKED_NO_USER_SESSION |
| Dynamic thinking message in UI during load | ⏳ BLOCKED_NO_USER_SESSION |

---

## Owner Manual Smoke (After Vercel Deploy)

Send in Advisory mode:
```
ما متطلبات الحمل الإشغالي لمحل تجاري؟
```

Expected (confirmed working in R21):
- No red toast ✅
- Correct answer with occupant load table ✅

Expected (new with R22):
- Dynamic thinking message appears in loading spinner immediately
- Example: "أربط المساحة بجدول الحمل الإشغالي وأفصل بين النص والحساب..."

Supabase logs check (Functions → fire-safety-chat → Logs):
```
[AdvisoryBrainB2] flag=on package_loaded=true nodes=440 edges=278
[ThinkingB2] Emitting 3 thinking_status events before advisory response
```
