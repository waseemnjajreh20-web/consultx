# R19 — Loading / Retry UX Cleanup Result

**Date:** 2026-05-07  
**Sprint:** R19 Mobile Advisory UX Polish

---

## Changes Applied

### 1. Retry Count Hidden (ChatInterface.tsx)

**Before:**
```tsx
<span className="text-muted-foreground">{t("retrying")} ({retryCount}/{MAX_RETRIES})...</span>
```

**After:**
```tsx
<span className="text-muted-foreground text-sm">
  {language === "ar" ? "الرجاء الانتظار..." : "Please wait..."}
</span>
```

The count `(1/3)`, `(2/3)` was alarming — users see `(2/3)` and think it's close to failure.  
The calm "الرجاء الانتظار..." message is less anxious.  
The `animate-spin` RefreshCw icon still shows — users know something is happening.  
Error logs remain in console (unchanged).

---

### 2. 503 Frontend Handling (ChatInterface.tsx)

**Before:** 
Frontend showed the full bilingual edge-function string:
`"الخدمة مشغولة مؤقتًا، حاول مرة أخرى بعد لحظات. / Service temporarily busy, please try again in a moment."`

**After:**
```tsx
if (resp.status === 503) {
  onError(language === "en"
    ? "Service temporarily busy, please try again in a moment."
    : "الخدمة مشغولة مؤقتًا، حاول مرة أخرى بعد لحظات.");
  return;
}
```

- Language-aware (shows only the user's language, not bilingual)
- Clean toast message
- Does NOT hide from console/logs — the error is still logged

---

## Static Loading Stages (Preserved)

The static loading message sequence is still active for non-Advisory modes and as fallback:
```
"connecting" (0s) → t("connecting")
"thinking"   (1s) → t("thinking")  
"writing"    (3s) → t("writing")
```

B2 dynamic thinking messages override these when they arrive (R22/R23 path).

---

## Old Waiting Messages (Preserved)

The `getWaitingMessage()` function for long-wait states (>60s, >90s) remains unchanged:
```tsx
if (waitingLevel === 2) "جاري تحليل معمّق، يرجى الانتظار... 📚"
if (waitingLevel === 1) "تحديد الأنظمة والاشتراطات المطلوبة... ⏳"
```

These are intentionally descriptive and are correct for Advisory mode.

---

## Error Toast Behavior

| Error | Pre-R19 | Post-R19 |
|---|---|---|
| 429 Rate limit | "Daily message limit exceeded" | Unchanged |
| 503 Overloaded | Bilingual long string | Short Arabic OR English string |
| Other errors | Generic message | Unchanged |
| Retry in progress | "(1/3)..." | "الرجاء الانتظار..." |
