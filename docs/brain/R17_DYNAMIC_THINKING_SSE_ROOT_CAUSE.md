# R17 — Dynamic Thinking SSE Root Cause

**Date:** 2026-05-06  
**Task:** TASK 1 — SSE Protocol Inspection

---

## Where `_thinkingEventsB2` Is Built

`index.ts:5566`:
```typescript
_thinkingEventsB2 = buildThinkingSequence(
  _routerResultB2, hasMissingInputs, hasParkingLotHit, language as "ar" | "en"
);
if (_thinkingEventsB2.length > 0) {
  console.log(`[ThinkingB2] ${_thinkingEventsB2.length} thinking events built for workflow=${_routerResultB2.workflow_id}`);
}
```

The events are built correctly and logged. After that point, `_thinkingEventsB2` is **never referenced again** — it is discarded at the end of the request scope.

---

## Why Events Never Reach the Frontend

The Advisory SSE path (mode = `"standard"`) creates a `TransformStream` called `advisoryStream`:

```typescript
const advisoryStream = new TransformStream({
  transform(chunk, _controller) { /* buffer Gemini chunks */ },
  flush(controller) { /* verify citations → re-stream verified text → [DONE] */ },
});
return new Response(response.body!.pipeThrough(advisoryStream), { headers: sseHeaders });
```

This stream only handles the Gemini response body. There is no code path that:
- Enqueues thinking events before the Gemini body starts
- Adds a `thinking_status` event type to any SSE frame
- Calls `formatThinkingEvent()` anywhere outside of the test file

---

## Current Frontend SSE Parser

`ChatInterface.tsx` — `streamChat()` function:

```typescript
const parsed = JSON.parse(jsonStr);
const content = parsed.choices?.[0]?.delta?.content as string | undefined;
if (content) { onDelta(content); }
```

Anything that is not `choices[0].delta.content` is silently skipped.

---

## Current Frontend Thinking Display

Timer-based state machine (no SSE input):
```typescript
const timer1 = setTimeout(() => setLoadingStage("thinking"), 1000);
const timer2 = setTimeout(() => setLoadingStage("writing"),  3000);
const timer3 = setTimeout(() => setLoadingStage("processing"), 6000);
```

Displayed strings are hardcoded:
- `connecting` → `"جاري التواصل..."` / `"Connecting..."`
- `thinking`   → `"جاري التفكير..."` / `"Thinking..."`
- `writing`    → `"يجري كتابة التقرير..."` / `"Writing..."`

---

## Required Event Format

Chosen format (from task spec, compatible with existing `data:` line parser):

```json
data: {"type":"thinking_status","stage":"routing","message":"تحليل نوع الإشغال المطلوب...","workflow":"wf_occupant_load"}
```

No `event:` type line — stays within the existing `data: {...}` SSE format.  
Frontend already strips `choices` when `type` field is present; no format conflict.

---

## Does Frontend Need Change?

**Yes.** The frontend must:
1. Detect `parsed.type === "thinking_status"` in the SSE parse loop
2. Call `onThinkingStatus(parsed.message)` instead of `onDelta`
3. Store the message in `dynamicThinkingMsg` state
4. `getLoadingMessage()` must return `dynamicThinkingMsg` when set and stage ≠ `connecting`
5. Clear `dynamicThinkingMsg` in `stopLoading()`

Without frontend changes, the thinking events would be received and silently dropped.
