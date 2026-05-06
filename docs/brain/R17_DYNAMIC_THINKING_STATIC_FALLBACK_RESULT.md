# R17 — Dynamic Thinking Static Fallback Result

**Date:** 2026-05-06  
**Task:** TASK 4 — Remove / Downgrade Robotic Static Status When Events Exist

---

## Behavior

### When `ADVISORY_DYNAMIC_THINKING_ENABLED=1` (events arrive)

`getLoadingMessage()` returns the dynamic message from the backend:

```typescript
if (dynamicThinkingMsg && loadingStage !== "connecting") return dynamicThinkingMsg;
```

The static strings (`"جاري التفكير..."`, `"يجري كتابة التقرير..."`) are **NOT returned** while dynamic events are arriving. The user sees domain-specific messages such as:

- `"تحليل نوع الإشغال وتحديد workflow المناسب..."` (routing)
- `"التحقق من المدخلات المطلوبة للمحل التجاري..."` (inputs_check)
- `"استرجاع أقسام SBC 201 المرتبطة بالحمل الإشغالي..."` (retrieval)
- `"تجميع الإجابة النهائية مع المراجع الدقيقة..."` (composition)

### When `ADVISORY_DYNAMIC_THINKING_ENABLED=0` (flag OFF)

No `thinking_status` events are emitted. `dynamicThinkingMsg` stays `""`. The condition `if (dynamicThinkingMsg && ...)` is false. Static messages return exactly as before:

- Stage `connecting` → `t("connecting")`
- Stage `thinking`   → `t("thinking")`
- Stage `writing`    → `t("writing")`
- Stage `processing` → `t("processing")`

### "connecting" Stage Is Always Static

Even when dynamic events exist, the `"connecting"` stage always returns the static connecting message. This is intentional — thinking events arrive only AFTER the fetch response is received, so the connecting stage (before any response) is always static.

---

## Summary

| Condition | Message Shown |
|-----------|--------------|
| Events present + stage ≠ connecting | Dynamic backend message ✅ |
| Events present + stage = connecting | Static `t("connecting")` (correct) |
| No events (flag OFF or Main/Analytical) | Static timer messages (unchanged) |
| Answer complete | `dynamicThinkingMsg` cleared → ready for next |

Old robotic strings are suppressed when B2 is active. Fallback is unchanged when B2 is inactive.
