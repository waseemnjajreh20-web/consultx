# R19C — Answer Layout Closeout

**Date:** 2026-05-08
**Sprint:** R19C Advisory Answer Layout & Final UX Polish
**Status:** COMPLETE

---

## 1. هل الردود الطويلة أصبحت أوضح؟

**نعم.** أربعة تغييرات متدرجة تحل مشكلة "الكتلة النصية":

| تغيير | قبل | بعد | الأثر |
|---|---|---|---|
| مسافة بين الأقسام | `space-y-1` (4px) | `space-y-3` (12px) | الأقسام منفصلة بوضوح |
| لفافة TextRenderer | `my-0.5` (2px) | `my-2` (8px) | تكتلات النص منفصلة |
| هامش الفقرة | `my-1` (4px) | `my-2` (8px) | الفقرات تتنفس |
| السطر الفارغ | `h-1.5` (6px) | `h-4` (16px) | السطر الفارغ مرئي فعلاً |

---

## 2. هل الجداول أفضل؟

**نعم — تحسين طفيف للموبايل.**

- `minWidth: 480px` → `400px`: الجداول على هاتف 390px تعرض محتوى أكثر قبل الـ scroll
- Scroll/overflow: لم يتغير (كان جيداً منذ R19)
- خلفية الرأس: لم تتغير (Zebra rows محافظة)

---

## 3. هل الهاتف والويب متأثران؟

**كلاهما يستفيد.** التغييرات CSS خالصة — لا breakpoints مختلفة. الموبايل يستفيد أكثر من:
- `minWidth: 400px` على الجداول
- سطر فارغ `h-4` = مساحة حقيقية بين الفقرات
- `border-s-2` للـ blockquote = اتجاه صحيح في RTL و LTR

الويب يستفيد من: ألوان العناوين المتكيفة مع الوضع (amber لـ advisory، crimson لـ analysis).

---

## 4. هل المصادر والأزرار منظمة؟

**نعم.**

- Chips المصدر: 🗂️ amber للجداول المنظمة، 📖 cyan لـ PDF chunks — متمايزان بصرياً
- SourcePanel: عرض مخصص للجداول المنظمة (R19B)
- UtilityBar: 44px touch target (R19B)، flex-wrap ✓

---

## 5. هل tests/build pass؟

| Check | Result |
|---|---|
| TypeScript (manual Node check) | ✓ No errors |
| R26 validation (49 tests) | ✓ 49/49 PASS |
| R24 validation (48 tests) | ✓ 48/48 PASS |
| npm build | ✓ Exit 0, 3m 2s |
| Bundle | `ChatInterface-CkssMoDm.js` 579.61 kB |

---

## 6. هل production deploy تم؟

✓ `git push origin main` → `1369efe..931b798`
✓ Vercel auto-deploy triggered
✓ Bundle: `ChatInterface-CkssMoDm.js`
✓ Edge function: Unchanged (R26)

---

## 7. ما بقي Parking Lot؟

- **Heading في وضع standard لا يظهر bold بشكل كافٍ على الهاتف** — العنوان `text-base font-semibold` بحجم ≈14px قد يكون صغيراً جداً. يمكن رفعه لـ `text-[15px]` أو استخدام `font-bold` على H2 في advisory mode. لكن هذا رأي مرئي يحتاج اختبار يدوي.
- **Table header text direction** — الجداول العربية تستخدم `text-right` على كل الخلايا. هذا صحيح بشكل عام لكن إذا كانت البيانات أرقاماً أو إنجليزية فقد يحتاج `text-center` أو `text-left`. يصعب حله أوتوماتيكياً بدون معرفة محتوى الخلية.
- **Accordion sections default `open`** — H3/H4 تفتح افتراضياً (`<details open>`). للإجابات الطويلة جداً (>5 أقسام)، قد يكون الافتراضي `closed` أفضل للموبايل. لكن هذا يؤثر على قابلية القراءة الأولية ويحتاج قرار UX.

---

## 8. أول 3 مهام Parking Lot

1. **اختبار يدوي على iOS** — أرسل سؤال "ما متطلبات الحمل الإشغالي لمحل تجاري؟" وتحقق أن:
   - العناوين amber واضحة
   - الجدول يُعرض بشكل جيد (scroll إذا لزم)
   - الـ chips مرتبة (amber 🗂️ + cyan 📖)

2. **ضبط H2 font size** — إذا H2 advisory يبدو صغيراً على الهاتف في الاختبار اليدوي، رفعه من `text-base` (14px) إلى `text-[15px]` أو `text-base sm:text-[15px]`.

3. **Accordion default state** — قيّم ذهنياً: هل إجابات SBC801 الطويلة (Section 903.2.7) تحتوي 5+ أقسام مطوية؟ إذا نعم، النظر في جعل الافتراضي `closed` للأقسام ≥ 3 في الإجابة.

---

## Production State After R19C

| Layer | Commit | Status |
|---|---|---|
| Answer readability polish | 931b798 | ✓ R19C |
| Source chips dedup + amber chips | 34a6a78 | ✓ R19B |
| SourcePanel structured_table view | 34a6a78 | ✓ R19B |
| UtilityBar 44px touch target | 34a6a78 | ✓ R19B |
| occupant_load mandatory protocol | dbbb204 | ✓ R26 |
| SBC801 source exclusion | dbbb204 | ✓ R26 |
| Advisory Brain B2 — 4 flags | — | ✓ All ON |
| Mobile UX baseline | 65b1804 | ✓ R19 |
| Gemini 503 resilience | 5f85e21 | ✓ R25 |
