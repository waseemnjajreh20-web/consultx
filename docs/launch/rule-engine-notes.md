# ملاحظات الإطلاق — B-rule: طبقة القواعد الحتمية لمتطلبات كود البناء الرقمية (v0)

**التاريخ:** 2026-09-03 · **الفرع:** recovery/stabilization-2026-08-23
**الحالة:** الطبقة النقية (schema + 34 قاعدة draft + محرّك تقييم + 72 اختباراً) جاهزة وموثّقة أدناه.
لم يُلمس أي من: `src/components/**`، `supabase/functions/**`، `src/App.tsx` — التوصيل موصوف في القسم 6 فقط، لم يُنفَّذ.

## لماذا هذه الطبقة

الأرقام الحرجة في كود البناء السعودي (مسافة الانتقال، مسار الخروج المشترك،
معاملات حمل الشاغلين، حدود اشتراط الرشاشات، تصنيفات مقاومة الحريق، عروض
الممرات/الأبواب) **يجب ألا يخمّنها نموذج لغوي أبداً**. هذه الطبقة تستخرج تلك
الأرقام من ملفات SBC الأصلية بإسناد مصدر (code/section/page/quote) حرفي،
ثم تقيّمها بمحرّك حتمي (لا LLM) يرجع دائماً واحداً من أربعة أحكام: `complies`
/ `violates` / `not_applicable` / `insufficient_data` — **لا يخمّن قيمة ناقصة
أبداً**، بل يرجع `insufficient_data` ويسمّي الحقل الناقص.

## الملفات المُسلَّمة

| الملف | الدور |
|---|---|
| `rules/schema.json` | JSON Schema 2020-12 لشكل ملف القواعد |
| `rules/sbc-fire-life-safety-v0.json` | 34 قاعدة `draft`، كل واحدة بإسناد مصدر |
| `rules/README.md` | مرجع سريع للمجلد |
| `src/lib/ruleEngine.types.ts` | الأنواع (Rule/Condition/Requirement/...) |
| `src/lib/ruleEngine.ts` | مدقّق schema يدوي + `loadRules`/`evaluate`/`evaluateAll` |
| `src/__tests__/ruleEngine.test.ts` | 72 اختباراً (قبول/رفض schema، كل نوع اشتراط، استثناءات، بيانات ناقصة، حتمية، 16 سيناريو من القواعد الحقيقية) |

## 1) ملخص Schema

كل قاعدة: `id, code (SBC201|SBC801|SBC401|SBC501), section, title_ar/en,
status (draft|engineer_validated|live), applicability.conditions[],
requirement (kind: threshold|table_lookup|boolean|formula), exceptions[]?,
outputs.explanation_ar, provenance {code, section, page?, quote?<=300 حرف,
extracted_by, extracted_at, source_note?}, validation? (إلزامي إن لم تكن
draft), notes?`.

`Condition = {parameter, operator (eq|in|gt|gte|lt|lte|between|exists),
value?}`. المعامِلات المسمّاة من التكليف: `occupancy_group, stories,
height_m, gross_area_m2, floor_area_m2, sprinklered, construction_type,
occupant_load, story_of_discharge` — إضافةً إلى معامِلات محلية بحسب القاعدة
(`corridor_width_mm, travel_distance_m, element_rating_hours,
incidental_room_type, ...`) موثّقة في `explanation_ar`/`notes` كل قاعدة.

`table_lookup.rows[].value` رقم، أو الحرفية `"NP"` (يعني الكود يمنع هذا
التوليف صراحةً — يُرجِع المحرّك `violates` فور مطابقة الصف بلا حاجة لمقارنة).

## 2) القواعد المصاغة — العدد والتوزيع

**34 قاعدة**، كلها `status: "draft"` (لا واحدة تصل لواجهة الإجابة بعد — انظر
القسم 4). توزيع نوع الاشتراط: `table_lookup` 21، `threshold` 6، `boolean` 6،
`formula` 2. 6 قواعد تحمل استثناءات (`exceptions`، 7 استثناءات إجمالاً: بديل
الرشاش لغرف 509.1، استثناءا مسافة فصل 705.5).

**التغطية:**
- **SBC 201 Ch.5** (ارتفاع/طوابق/مساحة/فصل/استخدامات عرضية): جداول 504.3،
  504.4، 506.2، 508.4، 509.1 (7 قواعد فرعية لـ509.1: فرن، تبريد، محرقة×2،
  دهان، غسيل، هيدروجين).
- **SBC 201 Ch.6/7** (مقاومة الحريق): جدول 601 (5 قواعد: هيكل رئيسي، جدران
  حاملة خارجية/داخلية، أرضية [بتحفّظ موثّق]، قواطع داخلية غير حاملة)، جدول
  705.5 (جدار خارجي حسب مسافة الفصل).
- **SBC 201 Ch.10** (الخروج): 1004.5 (معامل حمل الشاغلين ×2 formula)، 1006.2.1
  (مسار مشترك)، 1006.3.3 (أدنى عدد مخارج)، 1006.3.4(1)/(2) (طوابق بمخرج
  واحد)، 1010.3.1(1)/(2) (سرعة الباب الدوّار)، 1017.2 (مسافة انتقال — محور
  إنذار السلامة 2026-08-23)، 1020.2 (تصنيف حريق الممر)، 1020.3 (عرض الممر
  الأدنى).
- **SBC 801 Ch.9** (اشتراط الرشاشات): 903.2.5 (H)، 903.2.6 (I-1/I-3، I-2)،
  903.2.8 (R — **القاعدة "الرائدة"** المطلوبة صراحة)، 903.2.11.3 (محفّز
  ارتفاع 16.5 م عن مستوى وصول الدفاع المدني).

**قائمة المعرّفات الـ34 كاملة** (للمراجعة الهندسية، بترتيب الملف):

```
SBC201-504.3-height-nonsprinklered-IIB-IIIB   SBC201-504.3-table
SBC201-504.4-table                             SBC201-506.2-table
SBC201-508.4-table                             SBC201-509.1-furnace-room
SBC201-509.1-refrigerant-machinery-room        SBC201-509.1-incinerator-room-rating
SBC201-509.1-incinerator-room-sprinkler        SBC201-509.1-paint-shop
SBC201-509.1-laundry-room                      SBC201-509.1-hydrogen-fuel-gas-room
SBC201-601-primary-structural-frame            SBC201-601-bearing-walls-exterior
SBC201-601-bearing-walls-interior              SBC201-601-floor-construction
SBC201-601-nonbearing-interior-partitions      SBC201-705.5-exterior-wall-rating
SBC201-1004.5-business-occupant-load           SBC201-1004.5-mercantile-groundfloor-occupant-load
SBC201-1006.2.1-common-path                    SBC201-1006.3.3-min-exits
SBC201-1006.3.4-1-single-exit-r2-dwelling      SBC201-1006.3.4-2-single-exit-other-occupancies
SBC201-1010.3.1-1-revolving-door-manual-speed  SBC201-1010.3.1-2-revolving-door-power-speed
SBC201-1017.2-exit-access-travel-distance      SBC201-1020.2-corridor-fire-rating
SBC201-1020.3-corridor-width                   SBC801-903.2.5-group-h-sprinkler-mandate
SBC801-903.2.6-group-i1-i3-sprinkler-mandate   SBC801-903.2.6-group-i2-sprinkler-mandate
SBC801-903.2.8-group-r-sprinkler-mandate       SBC801-903.2.11.3-height-trigger
```

### مصدر الأرقام (مهم لموثوقية المراجعة)

الغالبية العظمى (29 من 34) مأخوذة حرفياً من `docs/audits/code-tables-rebuild-20260823.sql`
— 16 جدولاً أعاد بناءها المنظّم بتاريخ 2026-08-23 من ملفات SBC 201 الأصلية
عبر pdfplumber مع 5 عمليات تحقق لكل جدول (إعادة قراءة، استخراج مستقل خلية
بخلية، فحص انعكاس الرشاش، وحدات كما طُبعت، تناقض داخلي). القواعد الأربع
لمجموعة SBC 801 (903.2.5/903.2.6×2/903.2.8) مصدرها حواشٍ مطبوعة على تلك
الجداول نفسها (اقتباس حرفي)، مُعزَّزة باستخراج مباشر لهذا الوكيل عبر
pdfplumber من مجلّد SBC 801-CC-2024 (تعليق تجاري يحوي نص الكود الكامل) —
انظر التبرير الكامل داخل حقل `provenance.source_note` لكل قاعدة من هذه
الأربع. قاعدة 903.2.11.3 (محفّز 16.5 م) مصدرها تعليق شرح شكل (Commentary
FIGURE) وليس الفقرة التشغيلية الكاملة بعد — موثّق صراحةً في `notes` الخاصة
بها، وتبقى `draft` حتى تُستخرَج الفقرة كاملة.

## 3) واجهة المُقيِّم (Evaluator API)

```ts
loadRules(json: unknown): Rule[]                          // يرمي خطأً بكل أخطاء التحقق مجمّعة
validateRuleFile(json: unknown): {ok, errors[], rules?}    // مدقّق يدوي بلا تبعيات جديدة
evaluate(rule: Rule, params: RuleParams): EvaluationResult // {verdict, missing_parameters[], applied_exception?, explanation_ar, provenance, matched_row_id?, computed_value?}
evaluateAll(rules: Rule[], params: RuleParams): EvaluationResult[]
selectValidatedRules(rules: Rule[]): Rule[]                // يُبقي engineer_validated|live فقط
```

**قواعد السلوك الحتمي** (مختبَرة صراحةً، انظر `ruleEngine.test.ts`):
- عدم انطباق مؤكَّد (شرط applicability كاذب قطعياً) يفوق أي بيانات ناقصة
  أخرى → `not_applicable` فوراً.
- شرط applicability أو مطابقة صف مفقود القيمة → `insufficient_data` مع اسم
  الحقل الناقص — **لا افتراض إطلاقاً**.
- عامل `exists` لا يُرجِع أبداً `false` عند غياب القيمة (يُرجِع `unknown` →
  `insufficient_data`) — تصحيح تصميمي مهم اكتُشف أثناء الاختبار: معاملة
  الغياب كـ"معلوم أنه لا ينطبق" كانت ستُخفي فجوة بيانات حقيقية خلف حكم واثق
  زائف. موثّق في تعليق الشيفرة أعلى `matchCondition`.
- استثناء (`exceptions[]`) لا يُطبَّق إلا إذا تحقّقت **كل** شروطه يقيناً؛
  شرط استثناء مجهول (بيانات ناقصة) **لا يمنح تخفيفاً** — يتابع التقييم إلى
  الاشتراط الأساسي الأشد تحفظاً بدلاً من افتراض انطباق الاستثناء.
- صف `table_lookup` بقيمة `"NP"` → `violates` فوراً بلا حاجة لمقارنة (التوليف
  ممنوع بذاته).
- مُقيِّم `formula`: `+ - * / min() max()` ومراجع معامِلات فقط، بلا `eval()` —
  مُحلِّل نزولي متكرر يدوي؛ مرجع مفقود → `insufficient_data`؛ نص غير صالح
  (مثل محاولة حقن) → خطأ تحليل عادي، لا تنفيذ شيفرة إطلاقاً.

## 4) دورة حياة القاعدة + خطة التوصيل (لم تُنفَّذ)

`draft` (مصاغة، غير مراجَعة) → `engineer_validated` (راجعها مهندس سلامة
حريق مؤهَّل مقابل الصفحة المطبوعة المذكورة في `provenance`، وأضاف
`validation.engineer/validated_at`) → `live` (مفعَّلة في مسار الإجابة).
**اليوم: 34/34 draft، صفر تصل لمسار الإجابة.**

خطة التوصيل المقترحة (خلف علم جديد `RULE_ENGINE_ENABLED`، بنفس نمط
`BUILDING_PROFILE_ENABLED`/`CITATION_VERIFIER_ENABLED` القائمَين في
`supabase/functions/fire-safety-chat/index.ts`):

1. عند توفر `BuildingProfile` للمحادثة (`buildingProfile.ts`، C1a) ورسالة
   المستخدم تطابق نمط سؤال رقمي (كلمات مثل "أقصى"، "أدنى"، "مسافة"، "عرض")،
   استدعِ `evaluateAll(selectValidatedRules(rules), profileAsParams)`.
2. أي نتيجة `violates`/`complies` (وليس `not_applicable`/`insufficient_data`)
   تُحقن كـ**كتلة `system` منفصلة** قبل رسالة المستخدم — تحمل `explanation_ar`
   + `provenance` كاستشهاد بصيغة `[SBC-XXX Section YYY]` عبر خط أنابيب
   الاستشهاد الحالي (`inlineCitation.ts`)، موسومة بوضوح "نتيجة قاعدة حتمية
   مُتحقَّق منها هندسياً" — **ليست نص استرجاع**، ويُمنَع دمجها في نفس الحقل
   الذي يحمل مقاطع `sbc_documents` حتى لا تُخلَط مع النص المسترجَع (نفس مبدأ
   عزل `profileToPromptBlock` في building-profile-notes.md القسم 3).
3. `insufficient_data` **لا يُحقَن كحقيقة** — بل يتحوّل لسؤال توضيحي صريح
   للمستخدم (نفس نمط "التوضيح قبل الحساب" المستعمل في وضع Analytical حالياً)
   يسمّي الحقل الناقص بالعربية.
4. الفحص المطلوب قبل أي تفعيل: تعطيل العلم (الافتراضي) يعيد سلوكاً مطابقاً
   بايتاً، والفحص الثلاثي (`primary`/`standard`/`analysis`) بعد التفعيل على
   بيئة معاينة، طبقاً للقاعدة الثابتة في CLAUDE.md.

| العلم | الافتراضي | الأثر عند `"1"` |
|---|---|---|
| `RULE_ENGINE_ENABLED` | مطفأ | `fire-safety-chat` يحمّل `rules/sbc-fire-life-safety-v0.json` (مرشَّحة لـ`engineer_validated`/`live` فقط) ويحقن نتائج القواعد المطابقة كرسالة `system` منفصلة |

## 5) ما يجب أن يتحقق منه المهندس قبل ترقية أي قاعدة من draft

1. **افتح الصفحة المطبوعة** في `provenance.page` من ملف PDF الأصلي (مسارات
   `raw/sbc201/*` و`raw/sbc801/*` تحت `D:\SBC-CC-201-801\`) وقارن
   `provenance.quote` حرفياً.
2. **لكل صف `table_lookup`**، تأكّد أن قيمة الرشاشات (أو التصنيف الأعلى) لا
   تقل أبداً عن قيمة عدم الرشاشات لنفس الصف (فحص انعكاس الرشاش الذي كشف
   الخلل الأصلي في production — انظر `docs/audits/SAFETY-ALERT-code-tables-20260823.md`).
3. **راجع التحفّظات الموثّقة صراحةً** في `notes` قبل القبول:
   - **جدول 601** (`SBC201-601-floor-construction`): صف "Floor construction"
     مطبوع مرتين بقيمتين متعارضتين في SBC 201 صفحة 505، ولا طبعة ثانية في
     SBC 801 تحسم الخلاف. اعتُمدت القيمة الأعلى (الأشد تحفظاً) لكل عمود.
   - **جدول 1006.2.1**: مجموعة U مطبوعة مرتين (23 م مقابل 30 م بلا رشاشات).
     اعتُمدت 23 م.
   - **جدول 1017.2**: مجموعة I-1 مطبوعة مرتين (60 م مقابل "غير مسموح" بلا
     رشاشات). اعتُمد "غير مسموح".
   - **1020.3 (عرض الممر)**: SBC 201 يطبع جدولين مختلفين بنفس الرقم "TABLE
     1020.2" في صفحتين متتاليتين (تصنيف حريق الممر، وعرض الممر) — SBC 801
     يفصلهما كـ1020.2/1020.3؛ اتُّبعت تسمية SBC 801 هنا بانتظار قرار المالك
     (انظر `code-tables-rebuild-20260823.md` القسم 6.1).
   - **508.4**: العنوان المطبوع فعلياً "REQUIRED SEPARATION OF OCCUPANCIES"،
     يختلف عن عنوان صف production القديم "Nonseparated Occupancies" — قرار
     مالك مطلوب سابقاً، هذه القاعدة تتّبع العنوان المطبوع.
4. **القواعد الأربع لـSBC 801 (903.2.x)** مصدرها حواشٍ/تعليق لا الفقرة
   التشغيلية المباشرة بعد (انظر القسم 2 أعلاه) — استخرج الفقرة الأصلية أولاً.
5. **جداول جزئية التغطية عمداً** (504.3/504.4/506.2/508.4/705.5/1010.3.1(2)):
   القاعدة تغطي صفوفاً مختارة فقط؛ الجدول الكامل في
   `docs/audits/code-tables-rebuild-20260823.sql`. أكمل الصفوف الناقصة قبل
   `engineer_validated` إن كانت مطلوبة لحالات استخدام حقيقية.

## 6) نقاط مفتوحة صريحة (لم تُحسم، لم تُخترَع)

- **SBC 401/501 (كهربائي/ميكانيكي):** خارج نطاق هذه الدفعة تماماً — لم
  تُستخرَج جداول مُتحقَّق منها بنفس المستوى بعد؛ `rules/schema.json` يدعم
  الكودين (`enum` يشملهما) تحسّباً لموجة قادمة.
- **عرض/ارتفاع الباب الصافي (1010.1.1):** بحث عنه هذا الوكيل في نص SBC 201
  الخام (pdfplumber) ولم يُعثر على الفقرة التشغيلية بثقة كافية ضمن ميزانية
  الجلسة؛ استُعيض عنه بجدولَي سرعة الباب الدوّار (1010.3.1) المُتحقَّق
  منهما بالكامل. لا تُخترَع قيمة عرض الباب — يُضاف في دفعة لاحقة بعد استخراج
  مباشر.
- **تعارض `CONSTRUCTION_TYPES` مع `src/lib/buildingProfile.ts`:** قائمة
  buildingProfile.ts الحالية (9 قيم، "IV" بلا تفريع) **لا تطابق** ما تطبعه
  جداول SBC 201-CC-2024 المُتحقَّق منها فعلياً (12 عموداً: IV-A/B/C/HT
  منفصلة — مؤكَّد من محتوى جداول 504.3/504.4/506.2/601 نفسها). طبقة القواعد
  هنا تستعمل قائمتها المحلية الصحيحة (12 قيمة) عمداً لتبقى معزولة عن
  buildingProfile.ts أثناء تطويره المتزامن (انظر تعليق ملف
  `ruleEngine.types.ts`) — **يحتاج قرار مالك**: إما تحديث buildingProfile.ts
  لاحقاً، أو توثيق أن IV-A/B/C/HT تُطوى يدوياً إلى "IV" عند التكامل.
- **مستويات NFPA 13R/13D الوسيطة لمجموعة R** (ارتفاع 18 م بين حدَّي 16.5 م
  وS الكاملة 23 م في جدول 504.3): غير مُدرَجة كمعامل مستقل في v0 — يحتاج
  معامل `sprinkler_system_type` (NFPA13|NFPA13R|NFPA13D) يُضاف في توسعة لاحقة.
- **نطاق `docs/audits/`**: كل رقم استُعمِل هنا يُمكن تتبّعه لأحد ملفين مصدر
  رئيسيَّين — `code-tables-rebuild-20260823.sql` (الأغلبية، مُتحقَّق منه
  خماسياً بتاريخ 2026-08-23) واستخراج pdfplumber مباشر أجراه هذا الوكيل
  (4 قواعد SBC 801). لا رقم في هذا الملف مصدره الذاكرة أو الاستدلال العام
  لنموذج لغوي.

## 7) التحقق المُنفَّذ

```
npx tsc --noEmit -p tsconfig.app.json     → نظيف (صفر أخطاء)
npx vitest run src/__tests__/ruleEngine.test.ts --pool=threads
  → 72/72 ناجحاً (Test Files 1 passed, Tests 72 passed)
```

لم يُشغَّل `npm run build` (خارج نطاق التحقق المطلوب لهذه المهمة الفرعية
تحديداً). لم يُلمَس أي ملف خارج القائمة المصرَّح بها.
