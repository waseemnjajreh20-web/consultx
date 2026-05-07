# R26 — Occupant Load Constraint Enforcement Fix

**Date:** 2026-05-07
**Sprint:** R26 Emergency Regression Fix
**File:** `supabase/functions/fire-safety-chat/workflow_constraints.ts`

---

## Problem

R24 rules were injected via `buildEvidenceOverlay` into the system prompt **after** the FINAL BINDING REMINDER
which says "if critical variables missing → stop and ask immediately."

`buildEvidenceOverlay` order:
1. Parking-lot warnings
2. Missing required inputs → **"REQUIRED INPUTS MISSING — stop calculation"**
3. Safe-answer rules (R24: state values first)
4. Must-not-claim rules
5. Citation requirements

The model followed the first binding instruction it saw ("stop") and asked for area without stating table values.

---

## Fix Applied

Added `workflowId: string | null = null` parameter to `buildEvidenceOverlay`.

When `workflowId === "wf_occupant_load"`, inject a **mandatory protocol block FIRST** — before any parking-lot
or missing-inputs sections — that explicitly overrides the "stop and ask" instruction.

### New protocol block (injected first):

```
🏗️ بروتوكول حمل الإشغال الإلزامي (يعلو على قاعدة 'أوقف واسأل'):
⚠️ يعلو على تعليمة 'المعطيات الحرجة ناقصة → أوقف واسأل' لهذا الوورك فلو فقط.
الخطوة 1 — ابدأ بـ: 'المرجع الحاكم هو SBC 201 Table 1004.5' (إلزامي)
الخطوة 2 — اذكر القيم الثلاث فوراً:
  • مناطق البيع في البدروم أو الأرضي: 2.8 م²/شخص — GROSS area
  • مناطق البيع في الطوابق الأخرى: 5.6 م²/شخص — GROSS area
  • مناطق التخزين/المخزون/الشحن: 28 م²/شخص
الخطوة 3 — بعد ذكر القيم، اطلب: مساحة البيع الإجمالية + الطابق + مساحة التخزين
ممنوع: البدء بالأسئلة. ممنوع: 'net area'. ممنوع: SBC801. ممنوع: حساب نهائي بدون مساحة.
```

### Call site updated (index.ts):

```typescript
// Before:
const overlay = buildEvidenceOverlay(_augmentationB2, language as "ar" | "en");

// After (R26):
const overlay = buildEvidenceOverlay(
  _augmentationB2, 
  language as "ar" | "en", 
  _routerResultB2?.workflow_id ?? null
);
```

---

## Expected Behavior After Fix

للسؤال: "ما متطلبات الحمل الإشغالي لمحل تجاري؟"

الإجابة تبدأ بـ:
```
المرجع الحاكم هو SBC 201 Table 1004.5.

وفقاً لهذا الجدول، معامل الحمل الإشغالي لمناطق البيع التجارية (Mercantile):
- مناطق البيع في البدروم أو الطابق الأرضي: 2.8 م²/شخص (GROSS area)
- مناطق البيع في الطوابق الأخرى: 5.6 م²/شخص (GROSS area)
- مناطق التخزين/المخزون/الشحن: 28 م²/شخص

لذلك أحتاج إلى:
- مساحة منطقة البيع الإجمالية (gross m²)
- الطابق الذي تقع فيه منطقة البيع
- مساحة التخزين إن وجدت
```

---

## Constraints Not Violated

- لا DB write
- لا migrations
- لا bucket write
- لا B1 package changes
- لا تغيير في باقي workflows
- Desktop و Analytical و Main — غير متأثرة
- R24 R25 R23 code — غير متأثرة
