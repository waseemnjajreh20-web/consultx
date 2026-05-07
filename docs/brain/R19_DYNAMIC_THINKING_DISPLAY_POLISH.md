# R19 — Dynamic Thinking Display Polish

**Date:** 2026-05-07  
**Sprint:** R19 Mobile Advisory UX Polish

---

## Problem

Dynamic thinking messages (B2 Stage 4) can be long Arabic text like:
- "تحديد الأنظمة المطلوبة... ⏳"
- "جاري استخلاص حقائق التصميم والاشتراطات... 📐"

The thinking row used `flex items-center gap-3` with no wrapping:
```tsx
<div className="flex items-center gap-3">
  <TypingIndicator ... />
  <span className="text-muted-foreground text-sm animate-fade-in">{getLoadingMessage()}</span>
</div>
```

On narrow screens (320-375px), the TypingIndicator (dots animation) + text can overflow horizontally.

---

## Fix Applied (ChatInterface.tsx)

```tsx
// Before
<div className="flex items-center gap-3">
  <TypingIndicator ... />
  <span className="text-muted-foreground text-sm animate-fade-in" ...>{getLoadingMessage()}</span>
</div>

// After — R19
<div className="flex items-center gap-2 flex-wrap min-w-0">
  <TypingIndicator ... />
  <span className="text-muted-foreground text-sm animate-fade-in break-words min-w-0" ...>{getLoadingMessage()}</span>
</div>
```

Changes:
- `gap-3` → `gap-2` (8px, slightly tighter)
- `flex-wrap` added — if text doesn't fit, it wraps to next line
- `min-w-0` on both container and span — ensures flex children can shrink below content size
- `break-words` on span — prevents long Arabic/English strings from overflowing

---

## Retry Message Cleanup

**Before:** `{t("retrying")} ({retryCount}/{MAX_RETRIES})...`  
This shows alarming `(1/3)`, `(2/3)` counts to users.

**After:** `{language === "ar" ? "الرجاء الانتظار..." : "Please wait..."}`
- Calm, non-technical
- No count
- RTL/LTR aware

---

## Dynamic Thinking Behavior Preserved

- `getLoadingMessage()` returns `dynamicThinkingMsg` when B2 thinking events arrive (R22+ path)
- Falls back to static stage messages (`connecting` → `thinking` → `writing`)
- No CoT, no diagnostics, no JSON exposed
- Progress bar still shows stages
- `key={dynamicThinkingMsg || loadingStage}` triggers re-animation on message change ✓

---

## What Was NOT Changed

- `TypingIndicator` component: unchanged
- `getLoadingMessage()` logic: unchanged
- Dynamic thinking SSE pipeline (R22/R23/R24): unchanged
- Progress bar: unchanged
