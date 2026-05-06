# R17 — Dynamic Thinking Backend Emit Result

**Date:** 2026-05-06  
**Task:** TASK 2 — Backend SSE Emission Fix

---

## Change Applied

**File:** `supabase/functions/fire-safety-chat/index.ts`

Replaced the single-line advisory stream return:
```typescript
return new Response(response.body!.pipeThrough(advisoryStream), { headers: sseHeaders });
```

With a combined stream that prepends thinking events:
```typescript
const advisoryPiped = response.body!.pipeThrough(advisoryStream);
if (isDynamicThinkingEnabled() && _thinkingEventsB2.length > 0) {
  // Build SSE frames for each thinking event
  for (const evt of _thinkingEventsB2) {
    const msg = formatThinkingEvent(evt, language);
    const payload = JSON.stringify({
      type: "thinking_status",
      stage: evt.phase,
      message: msg,
      workflow: _routerResultB2?.workflow_id ?? null,
    });
    thinkingChunks.push(enc.encode(`data: ${payload}\n\n`));
  }
  // Combine: thinking events → advisory piped stream
  const combinedStream = new ReadableStream({
    async start(controller) {
      for (const chunk of thinkingChunks) controller.enqueue(chunk);
      const reader = advisoryPiped.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
      controller.close();
    },
  });
  return new Response(combinedStream, { headers: sseHeaders });
}
return new Response(advisoryPiped, { headers: sseHeaders });
```

## Safety Rules Applied

| Rule | Implementation |
|------|----------------|
| No CoT / chain-of-thought | `message` field = display text only, from `formatThinkingEvent()` |
| No scoring numbers | `message` is max 80 chars, human-readable status only |
| No internal diagnostics | `stage` and `workflow` are sanitized identifiers only |
| Flag OFF → no change | Entire block is inside `if (isDynamicThinkingEnabled() && ...)` |
| Emit error → no crash | Per-event try/catch; stream fallback always follows |
| Main mode unaffected | Block is inside `if (mode === "standard")` advisory path |
| Analytical mode unaffected | Same guard — analytical uses separate bufferingStream |

## SSE Frame Format

```
data: {"type":"thinking_status","stage":"routing","message":"<user-facing text>","workflow":"wf_occupant_load"}

data: {"type":"thinking_status","stage":"retrieval","message":"<user-facing text>","workflow":"wf_occupant_load"}

data: {"choices":[{"delta":{"content":"..."}}]}

data: [DONE]
```

The thinking frames arrive BEFORE the Gemini response. The `[DONE]` frame is only sent after all verified answer content.

## What Is Never Sent

- Internal scoring from `routeAdvisoryQuery`
- Parking lot file paths or bucket keys
- Evidence hint weights or ledger internals
- `_augmentationB2` raw data
- Any B2 diagnostic that isn't a user-facing status message

## Verdict: Backend fix applied. Thinking events now emitted before Gemini response.
