# R26 — Occupant Load Source Pollution Trace

**Date:** 2026-05-07
**Sprint:** R26 Emergency Regression Fix
**Pollutant:** `SBC801_Ch10_v2_chunks` appearing in occupant_load answers

---

## Root Cause: Cross-Reference Logic in `getTargetChapters`

**File:** `supabase/functions/fire-safety-chat/index.ts`
**Lines:** 1965–1973

```typescript
// Cross-referencing: always include both codes for fire/egress
if (sbc201Chapters.has(9) || sbc201Chapters.has(10)) {
  sbc801Chapters.add(6);
  sbc801Chapters.add(7);
}
if (sbc801Chapters.has(6) || sbc801Chapters.has(7)) {
  sbc201Chapters.add(9);
  sbc201Chapters.add(10);
}
```

**للسؤال** "ما متطلبات الحمل الإشغالي لمحل تجاري؟":
1. `getTargetChapters` يكتشف "occupant load" → `sbc201Chapters = {10}`
2. Cross-reference rule: `sbc201Chapters.has(10)` → `sbc801Chapters.add(6, 7)`
3. الآن `sbc801Chapters = {6, 7}` بدون أي سبب مشروع

---

## Cascade: SBC801 Files Get Selected

`selectTargetPageRanges([6, 7], SBC801_INDEX)` → `["201-400"]`

ثم في file selection:
- `sbc801Files` = كل ملفات SBC801 في الـ bucket
- `scoreFile("SBC801_Ch10_v2_chunks", ["201-400"])`:
  - اسم الملف لا يحتوي page range (`Ch10` ≠ `\d+-\d+`)
  - Default score = **1** (لا يساوي 0)
- `targeted801` = جميع SBC801 files بـ score=1 (غير صفر)
- `max801 = Math.min(targeted801.length, 4)` → تُختار 4 ملفات SBC801!
- `SBC801_Ch10_v2_chunks` يدخل ضمن أول 4 ملفات SBC801 → يُحمّل → يُضاف لـ context

---

## 1. هل detectExplicitCodeFamily لا يعتبر occupant_load = SBC201؟

`detectSourceFamily` في `workflow_router.ts` تفحص الـ query للنص الصريح "sbc 201" أو "sbc 801". 
للسؤال "ما متطلبات الحمل الإشغالي لمحل تجاري؟" لا يذكر أياً منهما → تعيد `"unspecified"`.

`filterHintsByFamily` مستوردة في `index.ts` لكن **غير مستخدمة مطلقاً** في أي مكان من الكود.

---

## 2. هل B2 evidence augmentation يضيف SBC801؟

**لا.** الـ hints في `augmentWithWorkflow` مبنية على `wf?.supporting_tables` وكلها من SBC201.
المشكلة ليست في B2 evidence — هي في `fetchSBCContext` نفسها.

---

## 3. هل source chips تأتي من retrieved candidates بدل used evidence؟

**نعم، جزئياً.** `usedFiles` يُبنى من `fetchSBCContext` وهو يشمل SBC801 بسبب الـ cross-reference. 
Frontend يعرض `X-SBC-Source-Meta` header وهو مبني من `usedSourceMeta` المُلوَّث.

---

## 4. هل source filtering لا يُطبَّق بعد semantic evidence؟

**صحيح.** `filterHintsByFamily` مستوردة في `index.ts` (السطر 8) لكن لا تُستدعى في أي مكان.
لا يوجد post-retrieval SBC801 filter لـ occupant_load workflow.

---

## 5. هل body "المصادر" يطبع sources غير مفلترة؟

**نعم.** النموذج يرى SBC801 content في الـ context (من `sbcContext`) ويستشهد به.
الـ frontend يعرض `X-SBC-Source-Meta` الذي يشمل SBC801_Ch10_v2_chunks.

---

## 6. هل sidecar `SBC801_Ch10_v2_chunks` يدخل prompt بسبب broad retrieval؟

**نعم.** هو من الـ bucket مباشرة عبر `fetchSBCContext`.
لا يأتي من Brain Full V1 sidecars — يأتي من keyword/storage retrieval.

---

## Pollution Path Summary

```
Query: "ما متطلبات الحمل الإشغالي لمحل تجاري؟"
  ↓
getTargetChapters:
  sbc201Chapters = {10}   ← occupant load keyword
  cross-ref: sbc201.has(10) → sbc801Chapters.add(6,7)
  ↓
selectTargetPageRanges([6,7], SBC801_INDEX) = ["201-400"]
  ↓
scoreFile("SBC801_Ch10_v2_chunks", ["201-400"]):
  no page range in name → default score = 1
  ↓
targeted801 has ALL sbc801 files (score=1)
max801 = min(n, 4) → 4 files selected
SBC801_Ch10_v2_chunks INCLUDED
  ↓
File downloaded → content injected into sbcContext
  ↓
SBC801 content in fullSystemPrompt
SBC801_Ch10_v2_chunks in X-SBC-Sources header
SBC801 chip shown in SourcePanel
```

---

## Fix Required

1. In `getTargetChapters`: Do NOT add SBC801 chapters 6/7 when query is occupant_load-only
2. In `fetchSBCContext`: Add `restrictToSBC201` param; when true, `scored801 = []`, `max801 = 0`
3. Call site (line 5446): pass `restrictToSBC201 = (_routerResultB2?.workflow_id === "wf_occupant_load")`
