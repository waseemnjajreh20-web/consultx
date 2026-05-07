# R26 — Occupant Load Regression Trace

**Date:** 2026-05-07
**Sprint:** R26 Emergency Regression Fix
**Query under test:** "ما متطلبات الحمل الإشغالي لمحل تجاري؟"

---

## 1. هل fire-safety-chat يحتوي commit R24؟

**نعم.** كود R24 موجود في `workflow_constraints.ts` السطور 146–160:

```typescript
if (routerResult.workflow_id === "wf_occupant_load") {
  const r24Rules = [
    "Reference: SBC 201 Table 1004.5 — cite by full name.",
    "Mercantile (Group M) ground-floor / basement sales areas: 2.8 m²/person — GROSS area.",
    "Mercantile (Group M) sales areas on other floors: 5.6 m²/person — GROSS area.",
    "Storage, stock, and shipping areas (any occupancy): 28 m²/person.",
    "NEVER say 'net area' for Mercantile...",
    "State the table values first; then ask for...",
  ];
  result.safe_answer_rules = [...r24Rules, ...result.safe_answer_rules];
}
```

**المشكلة:** الكود موجود لكنه غير فعّال بسبب ترتيب التعليمات في prompt.

---

## 2. هل workflow_constraints.ts يحتوي قواعد occupant_load؟

**نعم.** كل القيم موجودة:
- Table 1004.5 ✓
- 2.8 m²/person gross ✓
- 5.6 m²/person gross ✓
- 28 m²/person ✓
- forbid net area ✓
- table values before asking inputs ✓

---

## 3. هل wf_occupant_load يُختار فعلاً؟

**نعم.** `workflow_router.ts` يحتوي:
- `"حمل إشغالي"` في AR keywords للـ occupant_load domain
- `refs: [/\b1004\b/, /\b1004\.5\b/]`
- `"occupant load"` في EN keywords

للسؤال "ما متطلبات الحمل الإشغالي لمحل تجاري؟":
- يطابق "حمل" → ["load", "occupant load"] → CHAPTER_KEYWORDS["occupant load"] → sbc201: [10]
- يطابق "حمل إشغال" مباشرة في AR keywords
- Router يختار `wf_occupant_load` بثقة medium/high

---

## 4. هل evidence overlay يصل إلى prompt؟

**نعم، لكنه مدفون بعد تعليمة "أوقف واسأل".**

ترتيب بناء `fullSystemPrompt` في `index.ts`:
1. `basePrompt` (system prompt الأساسي مع بروتوكول التشخيص)
2. `structuredTableContext`
3. `sbcContext` + citation rules
4. ⛔ **FINAL BINDING REMINDER** (السطر 5507): "إذا كانت المعطيات الحرجة ناقصة، يجب عليك التوقف فوراً وطرح 1–3 أسئلة"
5. Evidence ledger summary
6. Brain Full V1 sidecars
7. B2.3 overlay من `buildEvidenceOverlay` (يحتوي R24 rules)

**المشكلة:** R24 rules تأتي في الخطوة 7 بعد أن قيل في الخطوة 4 "أوقف واسأل". النموذج يتبع التعليمة الأقدم.

---

## 5. هل `safe_answer_rules` slice limit = 10؟

**نعم.** في `buildEvidenceOverlay` (السطر 252):
```typescript
for (const rule of aug.safe_answer_rules.slice(0, 10)) {
```
10 قواعد كافية — R24 يضيف 6 قواعد فقط.

---

## 6. هل R19/R25/R23 merge خرّب R24؟

**لا.** فحص `workflow_constraints.ts` يؤكد أن R24 block موجود كاملاً (lines 146–160). R19 وR25 غيّرا ملفات مختلفة:
- R19: `ChatInterface.tsx`, `SourcePanel.tsx`, `ChatMarkdownRenderer.tsx`
- R25: `index.ts` (Gemini retry logic فقط)
- R24: `workflow_constraints.ts` — لم يُمسّ

---

## 7. هل production edge active version هو آخر version؟

**نعم.** آخر deploy كان في R25 يوم 2026-05-07 ويشمل R24.
من جلسة R25: `supabase functions deploy fire-safety-chat --project-ref hrnltxmwoaphgejckutk`

---

## Root Cause Summary

| السبب | التفاصيل |
|---|---|
| R24 overlay مدفون | `buildEvidenceOverlay` يضع "missing inputs → STOP" قبل R24 rules |
| FINAL BINDING REMINDER يسبق R24 | تعليمة "أوقف واسأل" في الخطوة 4، R24 في الخطوة 7 |
| Overlay يقول "أوقف فوراً" | `detectMissingInputs` يجد `floor_area` مفقودة → "REQUIRED INPUTS MISSING — stop" |
| النموذج يتبع أول تعليمة | يرى "STOP AND ASK" أولاً فيسأل بدون ذكر القيم |

**الإصلاح المطلوب:** حقن mandatory protocol لـ occupant_load يعلو على FINAL BINDING REMINDER، يُحقن في نهاية الـ overlay كـ override صريح.
