# R22 — Dynamic Thinking Frontend Fix Result

**Date:** 2026-05-07  
**Task:** TASK 3 — SSE Parser Fix

---

## SSE Parser Assessment

The SSE parser in `src/components/ChatInterface.tsx` correctly handles `thinking_status` events (introduced in commit `c44396a`). No parser bug was found.

| Check | Result |
|-------|--------|
| Parser checks `parsed.type === "thinking_status"` | ✅ line 695 |
| Falls through to `onThinkingStatus?.(parsed.message)` | ✅ line 696 |
| Does NOT mix thinking content into `fullContent` / `onDelta` | ✅ separate branch |
| Same check in flush path | ✅ line 717-718 |
| `onThinkingStatus` wired: `setDynamicThinkingMsg(msg)` | ✅ line 1098 |
| `dynamicThinkingMsg` displayed via `getLoadingMessage()` | ✅ line 918 |
| `stopLoading()` clears `dynamicThinkingMsg` on answer done | ✅ line 945 |

---

## Timing Bug Found and Fixed

### Root cause

`getLoadingMessage()` had a guard:

```typescript
// BEFORE (buggy)
if (dynamicThinkingMsg && loadingStage !== "connecting") return dynamicThinkingMsg;
```

Thinking events arrive at ~200-500ms (they are the first SSE frames — emitted before Gemini tokens). At that point, `loadingStage === "connecting"` (the timer for "thinking" fires at 1000ms). The guard suppressed the message for the entire "connecting" phase, meaning messages set at 200-500ms were invisible until 1000ms — by which time Gemini streaming may already be well underway.

For responses that complete in under 1000ms (fast network, short answer), `stopLoading()` would be called before the guard lifted, so the message was **never visible at all**.

### Fix applied

```typescript
// AFTER (fixed)  — src/components/ChatInterface.tsx line 918
if (dynamicThinkingMsg) return dynamicThinkingMsg;
```

Removed the `loadingStage !== "connecting"` guard. As soon as the first thinking event sets `dynamicThinkingMsg`, the loading spinner shows the backend message immediately — regardless of which loading stage the timer-based system is in. The fallback text ("جاري الاتصال...", "جاري التفكير...", etc.) remains for when no dynamic message is available.

---

## Why the Guard Was Safe to Remove

`dynamicThinkingMsg` is initialized to `""` (falsy). It only becomes truthy after a `thinking_status` SSE event arrives. By the time an SSE frame arrives, the HTTP connection is confirmed. The guard's stated purpose ("suppress before connection confirmed") was already handled by the falsy check. The `loadingStage !== "connecting"` clause was redundant.

---

## Behaviour After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Thinking event at 300ms, answer at 8s | Shown at 1000ms (700ms gap) | Shown at 300ms immediately |
| Thinking event at 300ms, answer at 700ms | Never shown | Shown at 300ms for 400ms |
| No thinking events (flag OFF or non-advisory) | Falls through to static message | Falls through to static message |
| Main or Analytical mode | Unaffected | Unaffected |

---

## File Changed

| File | Line | Change |
|------|------|--------|
| `src/components/ChatInterface.tsx` | 919 | Removed `&& loadingStage !== "connecting"` from `getLoadingMessage` guard |
