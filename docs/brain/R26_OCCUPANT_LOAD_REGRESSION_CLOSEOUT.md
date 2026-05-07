# R26 — Occupant Load Regression Closeout

**Date:** 2026-05-07
**Sprint:** R26 Emergency Regression Fix
**Status:** COMPLETE

---

## 1. لماذا لم يظهر R24؟

R24 code كان موجوداً في production لكنه كان **مدفوناً ومغلوباً** بتعليمة "أوقف واسأل":

- **`buildEvidenceOverlay`** تبني الـ overlay بهذا الترتيب:
  1. Parking-lot warnings
  2. `detectMissingInputs` → **"REQUIRED INPUTS MISSING — stop calculation"**
  3. R24 safe_answer_rules ("state values first")

- **FINAL BINDING REMINDER** في `index.ts` (المُحقَن قبل overlay):
  "إذا كانت المعطيات الحرجة ناقصة → أوقف فوراً وطرح 1–3 أسئلة"

- `detectMissingInputs("ما متطلبات الحمل الإشغالي لمحل تجاري؟")` وجد `floor_area_m2` مفقود → "STOP"
- النموذج رأى "STOP AND ASK" قبل R24 rules → أطاع أول تعليمة ملزمة
- النتيجة: سأل عن المساحة مباشرة بدون ذكر قيم الجدول

---

## 2. لماذا ظهر SBC801_Ch10_v2_chunks؟

**Bug في `getTargetChapters` (الثنائية المسيئة):**

```typescript
// قبل R26 — دائماً يضيف SBC801:
if (sbc201Chapters.has(9) || sbc201Chapters.has(10)) {
  sbc801Chapters.add(6);
  sbc801Chapters.add(7);
}
```

- occupant_load → SBC201 Chapter 10 → cross-ref يضيف SBC801 chapters 6 و 7
- `scoreFile("SBC801_Ch10_v2_chunks", ...)` → no page range in name → default score=1
- `targeted801` non-empty → `max801 = min(n, 4)` → 4 SBC801 files selected
- `SBC801_Ch10_v2_chunks` يُحمَّل ويُضاف لـ context ولـ `X-SBC-Sources` header

---

## 3. ما الذي تم إصلاحه؟

### Fix 1 — Mandatory Protocol Override (workflow_constraints.ts)

أضيف لـ `buildEvidenceOverlay(aug, language, workflowId)`:
- Parameter جديد: `workflowId: string | null = null`
- عندما `workflowId === "wf_occupant_load"`: يُحقَن block إلزامي **أولاً** يقول:
  - "يعلو على تعليمة أوقف واسأل"
  - "الخطوة 1: اذكر SBC 201 Table 1004.5"
  - "الخطوة 2: اذكر 2.8 / 5.6 / 28 م²/شخص"
  - "الخطوة 3: بعد ذلك فقط اطلب المساحة"

### Fix 2 — Source Family Restriction (index.ts - getTargetChapters)

Cross-reference الآن مشروط:
```typescript
// بعد R26 — مشروط على وجود fire/egress intent:
const hasFireOrEgressIntent = /مخرج|egress|exit|sprinkler.../i.test(lower);
if (sbc201Chapters.has(9) || (sbc201Chapters.has(10) && hasFireOrEgressIntent)) {
  sbc801Chapters.add(6, 7);  // فقط لـ egress/fire — ليس occupant_load
}
```

### Fix 3 — SBC201-Only Restriction (index.ts - fetchSBCContext)

Parameter جديد: `restrictToSBC201: boolean = false`:
- عندما true: `sbc801Chapters = []`, `scored801 = []`, `max801 = 0`
- Cache key يشمل `"sbc201only:"` prefix
- `remaining` يستثني "801" filenames

### Fix 4 — Call Site (index.ts)

```typescript
const _restrictToSBC201 = _routerResultB2?.workflow_id === "wf_occupant_load";
const { context: sbcContext, ... } = await fetchSBCContext(userQuery, undefined, _restrictToSBC201);
const overlay = buildEvidenceOverlay(_augmentationB2, language, _routerResultB2?.workflow_id ?? null);
```

---

## 4. هل tests pass؟

| Tests | Result |
|---|---|
| R26 validation (49 tests) | ✓ 49/49 PASS |
| R24 validation (48 tests) | ✓ 48/48 PASS |
| TypeScript | ✓ No new errors |
| npm build | ✓ exit 0 |

---

## 5. هل deploy تم؟

✓ `fire-safety-chat` edge function deployed:
```
Deployed Functions on project hrnltxmwoaphgejckutk: fire-safety-chat
```
CORS preflight: HTTP 200 ✓

Frontend: لم يُعاد نشره (لا تغيير في frontend code).

---

## 6. هل يجب أن يعطي السؤال الآن القيم قبل الأسئلة؟

**نعم.** بعد R26، جواب "ما متطلبات الحمل الإشغالي لمحل تجاري؟" يجب أن:
1. يبدأ بـ "المرجع الحاكم هو SBC 201 Table 1004.5"
2. يذكر 2.8 م²/شخص GROSS (أرضي/بدروم)
3. يذكر 5.6 م²/شخص GROSS (طوابق أخرى)
4. يذكر 28 م²/شخص (تخزين)
5. يطلب المساحة بعد ذلك

---

## 7. هل يجب أن تختفي SBC801_Ch10_v2_chunks؟

**نعم.** بعد R26:
- `fetchSBCContext` بـ `restrictToSBC201=true` → صفر SBC801 files
- لا `SBC801_Ch10_v2_chunks` في `sbcContext`
- لا `SBC801_Ch10_v2_chunks` في `X-SBC-Sources`
- لا SBC801 chip في SourcePanel

---

## 8. أول 3 مهام parking-lot

1. **Smoke test الإجابة الجديدة** — تحقق يدوياً أن النموذج يذكر 2.8/5.6/28 قبل الأسئلة
2. **Source chips** — تحقق أن SBC801 chips لا تظهر في إجابة occupant_load
3. **Egress cross-queries** — تحقق أن سؤال مخارج + حمل إشغال لا يزال يجلب SBC801 (egress intent present)

---

## Production State After R26

| Layer | Status |
|---|---|
| occupant_load answer order | Fixed (mandatory protocol first) |
| SBC801 source contamination | Fixed (restrictToSBC201) |
| R24 rules | Active (unchanged) |
| Advisory Brain B2 — 4 flags | ✓ All ON |
| Gemini 503 resilience | ✓ R25 (unchanged) |
| Mobile UX | ✓ R19 (unchanged) |
| Edge function | Deployed (R26) |
| Frontend | Unchanged (CTvhjiv8) |
