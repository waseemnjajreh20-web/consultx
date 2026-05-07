# R25 — Advisory 503 Fix

**Date:** 2026-05-07  
**Sprint:** R25 Emergency Stabilization  
**File modified:** `supabase/functions/fire-safety-chat/index.ts`

---

## Fix Applied (Surgical — 3 changes)

### Change 1: Extend model fallback to include 503

**Before (line 5688):**
```typescript
if (!response.ok && geminiModel !== fallbackModel && (response.status === 429 || response.status === 404)) {
```

**After:**
```typescript
if (!response.ok && geminiModel !== fallbackModel && (response.status === 429 || response.status === 404 || response.status === 503)) {
```

**Effect:** When Advisory mode (`gemini-2.5-pro`) returns 503, the code immediately tries `gemini-2.5-flash` before giving up.

---

### Change 2: Add 503 retry-with-backoff block

**Added after the model-fallback block (new lines 5705–5724):**
```typescript
// ── R25: 503 retry-with-backoff ──────────────────────────────────────────────
// If the current model (after any fallback above) still returns 503, wait 1500ms
// and retry once. Gemini 503 = transient overload; a single retry clears most cases.
if (!response.ok && response.status === 503) {
  console.warn(`[Gemini] 503 from ${geminiModel} — waiting 1500ms then retrying once (R25)`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction, contents, generationConfig: { temperature: 0.7 } }),
    }
  );
  console.log(`[Gemini] 503 retry result: ${response.status} | Model: ${geminiModel}`);
}
```

**Effect:** Even if flash also 503s, one automatic retry after 1.5 seconds handles transient overloads without user action.

---

### Change 3: User-friendly 503 error message

**Added before the generic error handler (new lines 5734–5738):**
```typescript
if (response.status === 503) {
  return new Response(JSON.stringify({ error: "الخدمة مشغولة مؤقتًا، حاول مرة أخرى بعد لحظات. / Service temporarily busy, please try again in a moment." }), {
    status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

**Effect:** If all retries exhausted, user sees a friendly bilingual message instead of `"Service error: 503"`.

---

## Retry Logic — Full Flow

```
Advisory query → gemini-2.5-pro
    ↓ 503
Fallback → gemini-2.5-flash
    ↓ 503 (if flash also down)
R25 retry block: wait 1500ms → retry flash
    ↓ 503 (if persistent)
Return bilingual friendly message
```

For isolated/transient 503:
- Step 1 (flash fallback) resolves it immediately
- Step 2 (retry) resolves remaining cases
- Only truly sustained Gemini outages reach the friendly error

---

## What Was NOT Changed

- No B2 flags changed
- No brain package modified
- No workflow_constraints.ts touched
- No DB/bucket/migration
- No frontend changes
- No other error codes affected
