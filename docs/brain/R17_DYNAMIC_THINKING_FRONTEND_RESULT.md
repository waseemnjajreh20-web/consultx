# R17 — Dynamic Thinking Frontend Result

**Date:** 2026-05-06  
**Task:** TASK 3 — Frontend Consumption Fix

---

## File Changed

`src/components/ChatInterface.tsx`

---

## Changes Made

### 1. New state variable (line 818)

```typescript
const [dynamicThinkingMsg, setDynamicThinkingMsg] = useState<string>("");
```

### 2. `stopLoading()` clears the dynamic message

```typescript
const stopLoading = useCallback(() => {
  setIsLoading(false);
  // ...
  setDynamicThinkingMsg("");   // ← added
  // ...
}, []);
```

### 3. `getLoadingMessage()` prefers dynamic message

```typescript
const getLoadingMessage = () => {
  // Use backend dynamic thinking message when available (B2 Stage 4).
  if (dynamicThinkingMsg && loadingStage !== "connecting") return dynamicThinkingMsg;
  switch (loadingStage) {
    case "thinking": return t("thinking");
    case "writing":  return t("writing");
    // ...
  }
};
```

### 4. `streamChat` signature — added `onThinkingStatus` callback

```typescript
onThinkingStatus?: (msg: string) => void;
```

### 5. SSE parse loop — detect `thinking_status` events

Both the main read loop and the flush fallback loop now handle the new event type:

```typescript
const parsed = JSON.parse(jsonStr);
if (parsed.type === "thinking_status" && typeof parsed.message === "string") {
  onThinkingStatus?.(parsed.message);
} else {
  const content = parsed.choices?.[0]?.delta?.content as string | undefined;
  if (content) {
    if (!firstChunkFired) { firstChunkFired = true; onFirstChunk?.(); }
    fullContent += content; onDelta(content);
  }
}
```

### 6. `streamChat` call site — wired `onThinkingStatus`

```typescript
await streamChat({
  // ...
  onThinkingStatus: (msg) => setDynamicThinkingMsg(msg),
  // ...
});
```

### 7. JSX span — key includes dynamic message for fade animation

```tsx
<span
  className="text-muted-foreground text-sm animate-fade-in"
  key={dynamicThinkingMsg || loadingStage}
>
  {getLoadingMessage()}
</span>
```

Each new thinking event triggers a fresh `animate-fade-in` cycle on mobile and desktop.

---

## Fallback Behavior

- If `ADVISORY_DYNAMIC_THINKING_ENABLED=0` → no `thinking_status` events emitted → `dynamicThinkingMsg` stays `""` → timer-based static messages display as before
- If events arrive → dynamic message shown → static timer messages suppressed
- After answer completes → `stopLoading()` clears `dynamicThinkingMsg` → ready for next question

## TypeScript Check

```
npx tsc --noEmit  →  (no output — clean)
```

## Verdict: Frontend now consumes `thinking_status` events and displays dynamic messages.
