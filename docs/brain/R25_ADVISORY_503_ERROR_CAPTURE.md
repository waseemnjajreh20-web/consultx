# R25 — Advisory 503 Error Capture

**Date:** 2026-05-07  
**Sprint:** R25 Emergency Stabilization  
**Severity:** P0 — Advisory mode returning error on every query

---

## Error Observed

**User-visible message:** `"Service error: 503"`

**Trigger:** Any Advisory mode ("standard") query — "ما متطلبات الحمل الإشغالي لمحل تجاري؟" etc.

---

## Source Trace

### Frontend (ChatInterface.tsx line 655–661)
```typescript
if (!resp.ok) {
  const errorData = await resp.json().catch(() => ({}));
  if (resp.status === 429) { ... }
  onError(errorData.error || ...);   // ← shows "Service error: 503" as toast
}
```
The `errorData.error` field came from the edge function response body.

### Edge Function (index.ts line 5705–5716 — pre-R25)
```typescript
if (!response.ok) {
  const errorText = await response.text();
  console.error(`[Gemini] API error: ${response.status} | ...`);
  if (response.status === 429) { /* rate limit */ }
  return new Response(JSON.stringify({ error: `Service error: ${response.status}` }), {
    status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```
When Gemini API returned HTTP 503, the edge function propagated it directly to the client as `"Service error: 503"`.

---

## Root Cause

**Gemini API returned HTTP 503** (Service Unavailable / transient overload) for the `gemini-2.5-pro` model used in Advisory mode.

Existing fallback logic (lines 5688–5703) only handled **429** (quota) and **404** (deprecated model). A 503 fell through to the generic error handler with no retry attempt.

---

## CLI Logs Availability

`supabase functions logs` is **not available** in CLI v2.98.2. The 503 root cause was determined by:
1. Code path analysis of `index.ts` error handling
2. Matching `"Service error: 503"` pattern to line 5713 (`error: \`Service error: ${response.status}\``)
3. Confirming R24 code changes (wrapped in try/catch) cannot produce this error
4. Classifying Gemini 503 as transient overload (documented Gemini behavior)
