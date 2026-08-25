# مراجعة هندسية — DERIVATION_MAP (derivationMap.ts)

**التاريخ:** 2026-08-25
**الملف قيد المراجعة:** `supabase/functions/fire-safety-chat/derivationMap.ts` (للقراءة فقط — لم يُعدَّل بواسطة هذا التقرير)
**عدد الصفوف في جدول المراجعة:** 42 صفاً (يقابل 42 هدف استرجاع/Target Section موزعة على 18 إدخالاً — Entry — في `DERIVATION_MAP`)

---

## لماذا هذه المراجعة إلزامية

`DERIVATION_MAP` هو مصفوفة بيانات منسّقة يدوياً تُستخدم لتوجيه الاسترجاع (Retrieval-Targeting Hints) فقط — أي أنها تقترح أي أقسام من SBC 201 / SBC 801 يجب سحبها إلى السياق عند سؤال معين، ولا تُستخدم أبداً كمصدر استشهاد مباشر (انظر تعليق رأس الملف، الأسطر 11–19). العلم البرمجي الذي يُفعّل استخدام هذه الخريطة فعلياً هو:

```
ADVISORY_QUERY_DERIVATION_ENABLED
```

وهو اليوم **معطّل افتراضياً وبدون أي قارئ (zero readers) في `index.ts`** — أي أن تفعيله لا يزال بلا أثر تشغيلي حتى تاريخه. لكن حسب العقد الملزم في `docs/advisory-brain-runbook.md` (القسم 2، جدول حالة الأعلام)، هذا العلم **"awaits a licensed fire-protection engineer's review... before this flag is set anywhere a real user can reach"** — أي أن تفعيله في أي بيئة يصل إليها مستخدم حقيقي **يتطلب أولاً** إغلاق هذه المراجعة الهندسية بنتيجة "صحيح" لكل صف، أو تصحيح ما يثبت خطأه.

هذه الورقة هي أداة تلك المراجعة. **لا تُعتبر الخريطة جاهزة للتفعيل قبل أن يوقّع مهندس مرخّص على كل صف أدناه.**

## منهجية المراجعة المطلوبة من المراجع

لكل صف في الجدول:

1. افتح النص المطبوع الفعلي لـ **SBC 201** أو **SBC 801** (حسب عمود "Target section") عند رقم القسم المذكور تماماً.
2. تأكّد من أمرين منفصلين:
   - **رقم القسم صحيح** فعلاً ضمن الإصدار المُعتمد من الكود.
   - **حجم الكود (SBC201 مقابل SBC801) صحيح** — كلا الكودين يحتويان على Chapter 9 (الحماية من الحريق) و Chapter 10 (وسائل الخروج)، لذا رقم القسم وحده لا يكفي لتحديد أي كود ينتمي إليه (انظر تعليق رأس الملف، الأسطر 43–52، و`chapterIndex.ts`).
3. ضع علامة **[ ] صحيح** أو **[ ] خطأ** في عمود "مراجعة"، ودوّن أي ملاحظة (رقم قسم مختلف، كود مختلف، نص غير موجود أصلاً) في عمود "ملاحظات".
4. أي صف يُعلَّم "خطأ" يجب ألا يبقى ضمن `DERIVATION_MAP` بصياغته الحالية قبل أي تفعيل للعلم — أبلغ وسيم بالنتيجة ليقرر التصحيح أو الحذف.

## نقاط تستحق اهتماماً خاصاً

### 1. تسعة صفوف "امتداد افتراضي غير مؤكَّد للرقم" (Extrapolated — number not independently confirmed)

تسعة صفوف من أصل 42 تحمل حرفياً عبارة **"not independently confirmed"** بخصوص **رقم القسم نفسه** (وليس فقط حجم الكود). هذه هي بالضبط المجموعة التي يشير إليها `docs/advisory-brain-runbook.md` بعبارة "9 entries are labelled extrapolations in their own why text". تم التحقق برمجياً من هذا العدد (9) مباشرة من نص الوحدة، وهو مطابق تماماً لما ورد في الـ runbook. هذه الصفوف مُعلَّمة في الجدول أدناه بـ **[خاص بالمراجعة]** وبعلامة الحالة `EXTRAPOLATED — number not independently confirmed`:

- الصفوف 1، 3، 5، 7، 9، 11 — أرقام تصنيف الإشغال SBC201 303/304/305/306/307/308 لمجموعات A/B/E/F/H/I (امتداد نمطي حول الرقمين المؤكَّدين 302 و309 ضمن تسلسل Chapter 3، انظر تعليق الأسطر 114–118).
- الصفوفان 22 و24 — SBC201 310 (R) و311 (S)، لنفس السبب.
- الصف 35 — SBC201 503 (الحدود الأساسية للارتفاع والمساحة حسب نوع الإنشاء).

**ملاحظة أمانة إضافية من هذه المراجعة:** يحمل 7 صفوف أخرى (34، 36، 37، 39، 40، 41، بالإضافة إلى الصف 13) تحفّظات مشابهة في الجوهر لكن بصياغة مختلفة قليلاً عن عبارة "not independently confirmed" الحرفية — إما لأن الرقم مذكور في `promptContract.ts` لكن **حجم الكود** غير مؤكَّد (SBC201 508/504.3/506.2)، أو لأن **لا الرقم ولا حجم الكود** مؤكَّدان من أي مصدر داخل المستودع (SBC801 909/905/913)، أو لأن الرقم مصدره الوحيد إشارة عابرة في `promptContract.ts` دون أي معرّف من شجرة القرار (SBC801 1020.1). هذه السبعة تستحق نفس درجة الفحص الدقيق التي يستحقها التسعة الأصليون، رغم أن تعليق رأس الملف لا يُدرجها تحت نفس العبارة الحرفية. راجع عمود "حالة المصدر" لكل صف.

### 2. سؤال نسب Chapter 10 (الأقسام 1020.x) بين SBC201 وSBC801 — إشغال I

الصفان 13 و14 (SBC801 1020.1 و1020.3، ضمن إدخال الإشغال I) يستحقان اهتماماً خاصاً لسبب مختلف تماماً عن الامتداد الرقمي: تعليق رأس الملف (الأسطر 43–52) يوثّق أن **مسودة سابقة** من هذه الخريطة كانت قد نسبت كل أقسام Chapter 9 وChapter 10 (بما فيها هذه الأقسام) إلى **SBC201** خطأً، رغم استشهادها بنفس أشجار القرار كمصدر "مؤكَّد" — وهو خطأ منسوخ (Curation Defect) تم تصحيحه في هذه النسخة إلى **SBC801**. بما أن كلا الكودين يحتويان Chapter 10 (وسائل الخروج)، فإن التحقق من أن **1020.1 و1020.3 فعلاً ضمن SBC801 وليس SBC201** — وليس فقط أن الرقم صحيح — هو بالضبط نوع الخطأ الذي أدّى لهذا التصحيح سابقاً، ويستحق تدقيقاً مضاعفاً من المراجع.

بالإضافة إلى ذلك، الصف 13 (SBC801 1020.1) يحمل حالة مصدر مختلفة عن أغلب الجدول: نص الـ `why` الخاص به لا يستشهد بأي معرّف مباشر من شجرة القرار (`sbc-801-section-1020.1` أو ما شابه) بل يكتفي بالإشارة إلى أن `promptContract.ts` "يُعلِّم" تصنيف الممرات في فئة I-2 كنقطة إغفال متكررة، وينص صراحة على قراءة القيمة من النص المسترجَع "rather than from this hint" — أي أن الوحدة نفسها تحذّر من الاعتماد على هذا التلميح. هذا الصف يستحق تدقيقاً أعلى من المعتاد.

---

## أعمدة الجدول ومفتاح رموز حالة المصدر

- **Occupancy** — رمز فئة الإشغال في `DERIVATION_MAP` (`*` = ينطبق بغض النظر عن فئة الإشغال).
- **Question types** — أنواع الأسئلة التي يُفعَّل عندها هذا الإدخال (`classification` / `specific` / `noncompliance` / `design` / `audit` — راجع كائن `QT` في الملف).
- **Target section** — الكود ورقم القسم المستهدَف للاسترجاع.
- **Line** — رقم السطر في `derivationMap.ts` حيث يظهر هذا الهدف حرفياً (للرجوع السريع أثناء المراجعة).
- **Why** — نص المبرر كما هو مكتوب حرفياً في الملف (لم يُعدَّل أو يُختصر).
- **حالة المصدر (Provenance status)** — مستخرجة من نص `why` والتعليقات المصاحبة:
  - `CONFIRMED — decision tree (...)`: الرقم وحجم الكود مؤكَّدان معاً من إحدى أشجار القرار الثلاث (المصدر (a) في تعليق رأس الملف) — إما عبر معرّف علاقة (`relation ...`) أو معرّف مصدر (`sbc-XXX-section-...`) أو تسمية مباشرة.
  - `CONFIRMED — promptContract (...)`: مؤكَّد من قائمة "conflict-trigger" في `promptContract.ts` (المصدر (b))؛ هذا المصدر يذكر حجم الكود صراحة في حالة واحدة فقط (403.1).
  - `EXTRAPOLATED — ...`: امتداد نمطي أو استنتاج من فهرس الفصول المقاس (`chapterIndex.ts`)، غير مؤكَّد بشكل مباشر من أي معرّف مصدر — إما في الرقم، أو في حجم الكود، أو في كليهما (انظر التفصيل لكل صف).
  - `HINT ONLY — ...`: الرقم مصدره إشارة عابرة فقط في `promptContract.ts` بلا أي معرّف من شجرة قرار، والملف نفسه يحذّر من الاعتماد على هذا التلميح.
- **مراجعة** — خانتا التدقيق: **[ ] صحيح** أو **[ ] خطأ** (يملؤهما المراجع بعد مطابقة النص المطبوع).
- **ملاحظات** — حقل حر للمراجع.

الصفوف المُعلَّمة **[خاص بالمراجعة]** هي التسعة الموصوفة في القسم أعلاه بالإضافة إلى صفَّي 1020.x.

---

## جدول المراجعة (42 صفاً)

| # | Occupancy | Question types | Target section | Line | Why (verbatim from `derivationMap.ts`) | Provenance status | مراجعة | ملاحظات |
|---|---|---|---|---|---|---|---|---|
| 1 | A — Assembly | classification, specific, noncompliance | **SBC201 303** | 134 | Retrieve for Group A (Assembly) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing. | EXTRAPOLATED — number not independently confirmed **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 2 | A — Assembly | classification, specific, noncompliance | **SBC801 903.2.1** | 135 | Retrieve the Group A automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-1-assembly-trigger in sprinkler-required-decision.json. | CONFIRMED — decision tree (relation id) | [ ] صحيح  [ ] خطأ | |
| 3 | B — Business | classification, specific, noncompliance | **SBC201 304** | 142 | Retrieve for Group B (Business) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing. | EXTRAPOLATED — number not independently confirmed **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 4 | B — Business | classification, specific, noncompliance | **SBC801 903.2** | 143 | Retrieve the parent automatic-sprinkler trigger section; sprinkler-required-decision.json lists no Group B occupancy trigger subsection, so this points at the confirmed parent rather than guessing a child. | CONFIRMED — decision tree (parent; no child subsection exists in corpus) | [ ] صحيح  [ ] خطأ | |
| 5 | E — Educational | classification, specific, noncompliance | **SBC201 305** | 150 | Retrieve for Group E (Educational) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing. | EXTRAPOLATED — number not independently confirmed **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 6 | E — Educational | classification, specific, noncompliance | **SBC801 903.2.3** | 151 | Retrieve the Group E automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-3-educational-trigger in sprinkler-required-decision.json. | CONFIRMED — decision tree (relation id) | [ ] صحيح  [ ] خطأ | |
| 7 | F — Factory/Industrial | classification, specific, noncompliance | **SBC201 306** | 158 | Retrieve for Group F (Factory/Industrial) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing. | EXTRAPOLATED — number not independently confirmed **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 8 | F — Factory/Industrial | classification, specific, noncompliance | **SBC801 903.2.4** | 159 | Retrieve the Group F automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-4-factory-trigger in sprinkler-required-decision.json. | CONFIRMED — decision tree (relation id) | [ ] صحيح  [ ] خطأ | |
| 9 | H — High-Hazard | classification, specific, noncompliance | **SBC201 307** | 166 | Retrieve for Group H (High-Hazard) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing. | EXTRAPOLATED — number not independently confirmed **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 10 | H — High-Hazard | classification, specific, noncompliance | **SBC801 903.2.5** | 167 | Retrieve the Group H automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-5-high-hazard-trigger in sprinkler-required-decision.json. | CONFIRMED — decision tree (relation id) | [ ] صحيح  [ ] خطأ | |
| 11 | I — Institutional | classification, specific, noncompliance | **SBC201 308** | 174 | Retrieve for Group I (Institutional) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing. | EXTRAPOLATED — number not independently confirmed **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 12 | I — Institutional | classification, specific, noncompliance | **SBC801 903.2.6** | 175 | Retrieve the Group I automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-6-institutional-trigger in sprinkler-required-decision.json. | CONFIRMED — decision tree (relation id) | [ ] صحيح  [ ] خطأ | |
| 13 | I — Institutional | classification, specific, noncompliance | **SBC801 1020.1** | 176 | Retrieve the corridor rating material; promptContract's conflict-trigger list flags I-2 corridor rating as a frequent miss, so pull the text and read the value from it rather than from this hint. | HINT ONLY — no decision-tree id; module cautions against relying on this hint for the value **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 14 | I — Institutional | classification, specific, noncompliance | **SBC801 1020.3** | 177 | Retrieve the corridor subsection confirmed as sbc-801-section-1020.3 in egress-design-checklist.json; pull alongside 1020.1 whenever the question concerns corridors. | CONFIRMED — decision tree (relation id) **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 15 | M — Mercantile | classification, specific, noncompliance, design, audit | **SBC201 309** | 184 | Retrieve for Group M (Mercantile) classification text; number and code volume confirmed as sbc-201-section-309 in group-m-fire-protection.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 16 | M — Mercantile | classification, specific, noncompliance, design, audit | **SBC201 402** | 185 | Retrieve when the question mentions a covered or open mall; group-m-fire-protection.json names SBC 201 Section 402 as the mall provision its exception branches point at. | CONFIRMED — decision tree (named directly, not relation-id format) | [ ] صحيح  [ ] خطأ | |
| 17 | M — Mercantile | classification, specific, noncompliance, design, audit | **SBC801 903.2.7** | 186 | Retrieve the Group M automatic-sprinkler trigger subsection; number and code volume confirmed as sbc-801-section-903.2.7 in group-m-fire-protection.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 18 | M — Mercantile | classification, specific, noncompliance, design, audit | **SBC801 903.2.7.1** | 187 | Retrieve the Group M sprinkler sub-trigger; number and code volume confirmed as sbc-801-section-903.2.7.1 in group-m-fire-protection.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 19 | M — Mercantile | classification, specific, noncompliance, design, audit | **SBC801 903.2.7.2** | 188 | Retrieve the Group M sprinkler sub-trigger reached from the upholstered-furniture branch; number and code volume confirmed as sbc-801-section-903.2.7.2 in group-m-fire-protection.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 20 | M — Mercantile | classification, specific, noncompliance, design, audit | **SBC801 907.2.7** | 189 | Retrieve the Group M fire-alarm trigger subsection; number and code volume confirmed as sbc-801-section-907.2.7 in group-m-fire-protection.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 21 | M — Mercantile | classification, specific, noncompliance, design, audit | **SBC801 907.2.7.1** | 190 | Retrieve the Group M fire-alarm sub-trigger; number and code volume confirmed as sbc-801-section-907.2.7.1 in group-m-fire-protection.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 22 | R — Residential | classification, specific, noncompliance | **SBC201 310** | 197 | Retrieve for Group R (Residential) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing. | EXTRAPOLATED — number not independently confirmed **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 23 | R — Residential | classification, specific, noncompliance | **SBC801 903.2.8** | 198 | Retrieve the Group R automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-8-residential-trigger in sprinkler-required-decision.json. | CONFIRMED — decision tree (relation id) | [ ] صحيح  [ ] خطأ | |
| 24 | S — Storage | classification, specific, noncompliance | **SBC201 311** | 205 | Retrieve for Group S (Storage) use-and-occupancy classification text; number extrapolated from the Chapter 3 sequence, not independently confirmed — verify against the retrieved text before citing. | EXTRAPOLATED — number not independently confirmed **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 25 | S — Storage | classification, specific, noncompliance | **SBC801 903.2.9** | 206 | Retrieve the Group S automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-9-storage-trigger in sprinkler-required-decision.json. | CONFIRMED — decision tree (relation id) | [ ] صحيح  [ ] خطأ | |
| 26 | * — wildcard (any occupancy) | specific, noncompliance, design, audit | **SBC201 403.1** | 215 | Retrieve when the question involves building height near the high-rise threshold; promptContract's conflict-trigger list names SBC 201 Section 403.1 explicitly, code volume included. | CONFIRMED — promptContract names code volume + number explicitly | [ ] صحيح  [ ] خطأ | |
| 27 | * — wildcard (any occupancy) | specific, noncompliance, design, audit | **SBC801 903.2.11** | 216 | Retrieve the high-rise automatic-sprinkler trigger subsection; number and code volume confirmed by relation rel-sbc801-903-2-11-high-rise-trigger in sprinkler-required-decision.json. | CONFIRMED — decision tree (relation id) | [ ] صحيح  [ ] خطأ | |
| 28 | * — wildcard (any occupancy) | specific, noncompliance, design, audit | **SBC801 903.3.1.1** | 217 | Retrieve the sprinkler installation-standard subsection referenced by the alarm exception branch; number and code volume confirmed as Section 903.3.1.1 in group-m-fire-protection.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 29 | * — wildcard (any occupancy) | specific, noncompliance, design, audit | **SBC801 1004.5** | 224 | Retrieve the occupant-load material that the rest of the egress chain reads from; confirmed as sbc-801-table-1004.5 in egress-design-checklist.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 30 | * — wildcard (any occupancy) | specific, noncompliance, design, audit | **SBC801 1005** | 225 | Retrieve the egress-sizing section; confirmed as sbc-801-section-1005 in egress-design-checklist.json. That corpus names no sizing sub-subsection beyond 1005.3.1/1005.3.2, so this points at the parent. | CONFIRMED — decision tree (parent; no sizing sub-subsection in corpus) | [ ] صحيح  [ ] خطأ | |
| 31 | * — wildcard (any occupancy) | specific, noncompliance, design, audit | **SBC801 1006.2** | 226 | Retrieve the egress-count subsection for a space; confirmed as sbc-801-section-1006.2 in egress-design-checklist.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 32 | * — wildcard (any occupancy) | specific, noncompliance, design, audit | **SBC801 1006.3** | 227 | Retrieve the egress-count subsection for a story; confirmed as sbc-801-section-1006.3 in egress-design-checklist.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |
| 33 | * — wildcard (any occupancy) | specific, noncompliance, design, audit | **SBC801 1017.2** | 228 | Retrieve the exit-access travel-distance material; confirmed as sbc-801-table-1017.2 in egress-design-checklist.json and flagged in promptContract's conflict-trigger list. | CONFIRMED — decision tree, cross-referenced in promptContract | [ ] صحيح  [ ] خطأ | |
| 34 | * — wildcard (any occupancy) | specific, noncompliance, classification | **SBC201 508** | 235 | Retrieve when the question describes more than one occupancy in one building; promptContract's conflict-trigger list names Section 508 without a code volume, and SBC 201's measured chapter 5 is where heights/areas/mixed-occupancy material sits — code attribution not independently confirmed. | EXTRAPOLATED — number named in promptContract; code volume not independently confirmed | [ ] صحيح  [ ] خطأ | |
| 35 | * — wildcard (any occupancy) | specific, noncompliance, design | **SBC201 503** | 242 | Retrieve the base allowable height-and-area material for the stated construction type; SBC 201's measured chapter 5 is General Building Heights and Areas — number not independently confirmed. | EXTRAPOLATED — number not independently confirmed **[خاص بالمراجعة]** | [ ] صحيح  [ ] خطأ | |
| 36 | * — wildcard (any occupancy) | specific, noncompliance, design | **SBC201 504.3** | 243 | Retrieve the height-increase material; promptContract's conflict-trigger list names table 504.3 for construction-type-versus-height conflicts, without a code volume — attribution follows SBC 201's measured chapter 5. | EXTRAPOLATED — number named in promptContract; code volume attribution inferred, not independently confirmed | [ ] صحيح  [ ] خطأ | |
| 37 | * — wildcard (any occupancy) | specific, noncompliance, design | **SBC201 506.2** | 244 | Retrieve the area-increase material; promptContract's conflict-trigger list names table 506.2 for construction-type-versus-area conflicts, without a code volume — attribution follows SBC 201's measured chapter 5. | EXTRAPOLATED — number named in promptContract; code volume attribution inferred, not independently confirmed | [ ] صحيح  [ ] خطأ | |
| 38 | * — wildcard (any occupancy) | specific, noncompliance | **SBC801 907.2** | 251 | Retrieve the parent fire-alarm trigger section; it is the parent of sbc-801-section-907.2.7 as confirmed in group-m-fire-protection.json, so use it when the occupancy-specific 907.2.x subsection is not yet known. | CONFIRMED — decision tree (parent of a confirmed child id) | [ ] صحيح  [ ] خطأ | |
| 39 | * — wildcard (any occupancy) | specific, noncompliance | **SBC801 909** | 258 | Retrieve as a starting point when the question mentions smoke control or smoke management; chapter 9 of SBC 801 is where the measured chapter index places that material, but this section number is not confirmed by any in-repo source. | EXTRAPOLATED — neither number nor code volume confirmed by any in-repo source | [ ] صحيح  [ ] خطأ | |
| 40 | * — wildcard (any occupancy) | specific, noncompliance | **SBC801 905** | 265 | Retrieve as a starting point when the question mentions standpipes; chapter 9 of SBC 801 is where the measured chapter index places that material, but this section number is not confirmed by any in-repo source. | EXTRAPOLATED — neither number nor code volume confirmed by any in-repo source | [ ] صحيح  [ ] خطأ | |
| 41 | * — wildcard (any occupancy) | specific, noncompliance | **SBC801 913** | 272 | Retrieve as a starting point when the question mentions fire pumps or water-supply adequacy; chapter 9 of SBC 801 is where the measured chapter index places that material, but this section number is not confirmed by any in-repo source. | EXTRAPOLATED — neither number nor code volume confirmed by any in-repo source | [ ] صحيح  [ ] خطأ | |
| 42 | * — wildcard (any occupancy) | classification | **SBC201 302** | 279 | Retrieve the general classification section when the occupancy group has not been identified yet; number and code volume confirmed as sbc-201-section-302 in egress-design-checklist.json. | CONFIRMED — decision tree (source id) | [ ] صحيح  [ ] خطأ | |

---

## ملخص إحصائي (مُستخرَج آلياً من نص الملف بتاريخ 2026-08-25)

| الفئة | العدد |
|---|---|
| إجمالي صفوف الاستهداف (Target sections) | 42 |
| إجمالي الإدخالات (DerivationEntry) في `DERIVATION_MAP` | 18 (9 خاصة بالإشغال + 9 شاملة `*`) |
| `CONFIRMED` — مؤكَّد من شجرة قرار (بما فيها حالات "parent") | 24 |
| `CONFIRMED` — مؤكَّد من `promptContract.ts` (رقم + حجم كود صراحة) | 1 |
| `EXTRAPOLATED` — الرقم نفسه غير مؤكَّد ("not independently confirmed" حرفياً) — **مطابق لعدد الـ 9 في الـ runbook** | 9 |
| `EXTRAPOLATED` — حجم الكود فقط غير مؤكَّد (الرقم مذكور في promptContract) | 3 |
| `EXTRAPOLATED` — لا الرقم ولا حجم الكود مؤكَّدان من أي مصدر داخل المستودع | 3 |
| `HINT ONLY` — بلا معرّف من شجرة قرار، والملف يحذّر من الاعتماد عليه | 1 |
| المجموع | 42 |

**23 من أصل 42 صفاً (~55%) تحمل حالة `CONFIRMED` بأحد نوعيها؛ 19 صفاً (~45%) تحمل تحفّظاً موثَّقاً في نص الملف نفسه.** هذه النسبة ليست حكماً على جودة العمل — الملف يوثّق تحفظاته بأمانة كاملة كما يتطلب هذا المستودع — لكنها توضح حجم العمل المطلوب من المراجع: يجب فحص كل الصفوف الـ 42، وليس فقط الـ 19 المُعلَّمة صراحة، لأن حتى الصفوف "المؤكَّدة" تعتمد على صحة أشجار القرار نفسها كمصدر، وهي مبنية على قراءة بشرية سابقة لتلك الأشجار وليست فحصاً آلياً للنص المطبوع.

---

## توقيع الاعتماد (Sign-off)

| الحقل | القيمة |
|---|---|
| اسم المراجع (مهندس مرخّص) | ______________________________ |
| رقم الترخيص / الجهة | ______________________________ |
| التاريخ | ______________________________ |
| عدد الصفوف المراجَعة من أصل 42 | ______________________________ |
| عدد الصفوف "خطأ" | ______________________________ |
| النتيجة الإجمالية | [ ] مقبول بالكامل — يمكن رفع توصية بتفعيل `ADVISORY_QUERY_DERIVATION_ENABLED` بعد استيفاء بقية بوابات `docs/advisory-brain-runbook.md` &nbsp; [ ] مقبول جزئياً — يتطلب تصحيح الصفوف المُعلَّمة "خطأ" أولاً &nbsp; [ ] مرفوض — لا يُعتمد بصيغته الحالية |
| توقيع | ______________________________ |

> تذكير: نتيجة هذه المراجعة وحدها **لا تكفي** لتفعيل العلم. حسب `docs/advisory-brain-runbook.md` القسم 1، أي تفعيل علم يتطلب أيضاً تشغيل حي (Live) لمقياس الأداء (Bench) قبله وبعده على النحو الموصوف هناك، ولا يوجد بعد بوابة أداء (Gate) مُعرَّفة لهذا العلم تحديداً (القسم 3 من نفس الوثيقة). هذه المراجعة الهندسية شرط ضروري، وليست شرطاً كافياً.
