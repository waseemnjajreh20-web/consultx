---
record_id: sbc-801-section-1020
code_family: SBC 801
edition: '2024'
section_id: '1020'
page_type: section
authority_level: STRUCTURED_FACT
status: PARTIAL_STRUCTURED
source_files:
  - "SBC 801 - Part 6.pdf"
source_pages: "pp. 870–910"
dependencies:
  - section: '1005'
    reason: "عروض الممرات تستند إلى المتطلبات العامة لمسارات الإخلاء"
  - section: '1006'
    reason: "عدد المخارج يُحدِّد ما إذا كان الممر مطلوباً"
  - section: '1017'
    reason: "مسافة السفر المسموحة تمر عبر الممرات"
  - section: '708'
    reason: "جدران الممرات المقاومة للحريق تخضع لـ SBC 201 Section 708"
tags: [egress, ch10, corridors, fire-rating, dead-ends, width]
related_sections: [1006, 1010, 1016, 1017, 1019, 1024, 708, 905]
last_reviewed: '2026-04-14'
---
# Section 1020 — Corridors
# القسم 1020 — الممرات

## 📋 نص الكود الحرفي / Canonical Code Text
> **[CANONICAL_SOURCE — SBC 801-2024, Section 1020.1–1020.3, pp. 870–910]**

**SECTION 1020 CORRIDORS**

**1020.1 General.** Corridors serving as an exit access component in a means of egress system shall comply with the requirements of Sections 1020.2 and 1020.7.

**1020.2 Construction.** Corridors shall be fire-resistance rated in accordance with Table 1020.2. The corridor walls required to be fire-resistance rated shall comply with Section 708 of SBC 201 for fire partitions.

### Table 1020.2 — Corridor Fire-Resistance Rating

| Occupancy | Sprinklered | Non-Sprinklered |
|-----------|-------------|-----------------|
| A, B, E, F, M, R, S, U | 0 hr | 1 hr |
| H | 2 hr | 2 hr |
| I-1, I-2, I-3, I-4 | 1 hr | 1 hr |

**Exceptions to Table 1020.2:**

1. A fire-resistance rating is not required for corridors in Group E where each room used for instruction has not less than one door opening directly to the exterior, and rooms for assembly purposes have not less than one-half of the required means of egress doors opening directly to the exterior. Exterior doors must be at ground level.

2. A fire-resistance rating is not required for corridors contained within a dwelling unit or sleeping unit in Groups I-1, I-2 and R.

3. A fire-resistance rating is not required for corridors in open parking garages.

4. A fire-resistance rating is not required for corridors in an occupancy in Group B that is a space requiring only a single means of egress complying with Section 1006.2.

**1020.3 Corridor width.** The minimum corridor width shall be in accordance with Section 1005.1. The minimum clear width of corridors shall be not less than 1050 mm (See Table 1020.3 for specific occupancies).

### Table 1020.3 — Minimum Corridor Width

| Occupancy | Minimum Width | Notes |
|-----------|---------------|-------|
| Groups A, B, E, F, M, R, S, U | 1050 mm | Standard corridor |
| Groups I-1, I-2, I-3, I-4 | 1500 mm | Institutional (wheelchairs, beds) |
| Open parking structures | 1050 mm | Vehicle access areas |

**1020.4 Dead-end corridors.** Dead-end corridors shall not be greater than 20 m in length. Where the occupancy is sprinklered, the dead-end length shall be permitted to be not greater than 30 m.

| Dead-End Type | Maximum Length | Sprinklered | Notes |
|---------------|-----------------|-------------|-------|
| Standard | 20 m | — | General rule |
| Sprinklered | 30 m | Yes | NFPA 13/13R |

**1020.5 Corridor continuity.** The fire-resistance rating of corridors shall be continuous to the underside of the floor or roof deck above, or at a smoke-limiting ceiling membrane in institutional settings.

**1020.6 Corridors in Group I-2.** In Group I-2 occupancies, corridors shall be continuous to the underside of the floor or roof deck above without penetrations unless protected in accordance with Section 713 of SBC 201.

**1020.7 Air movement in corridors.** Corridors shall not be used as a supply, return or exhaust air plenum for HVAC systems.

## 💡 التعليق الهندسي / Engineering Commentary

الممرات هي **الأوعية الدموية** لنظام الإخلاء — فهي توصل الشاغلين من مساحات العمل إلى السلالم والمخارج. الممر الآمن = ممر بدون دخان/نار.

**الحكمة الهندسية:**

### 1. تقييم النار (Fire-Resistance Rating)

الممرات **مصابة بـ حريق محتمل** من المساحات المجاورة (مكاتب، متاجر):
- **Sprinklered مباني** (رش تلقائي = رقابة النار) → لا تحتاج تقييم نار (0 hr)
- **Non-Sprinklered** → حد أدنى 1 hr fire partition (SBC 201 Section 708)
- **Group H** (مواد خطرة) → 2 hr حتى مع رش (الحريق أكثر شراسة)

### 2. العرض الأدنى (1050 مم أو 1500 مم)

- **1050 مم**: شخصان يمران بجانب بعضهما (ضيق لكن آمن)
- **1500 مم**: Group I (مستشفيات) = سرير/كرسي متحرك يحتاج عرض أكبر
- الاختناقات (narrower passages) = تأخير الإخلاء

### 3. الممرات المسدودة (Dead-End Corridors)

- **المشكلة**: إذا حدث حريق في نهاية الممر المسدود → الناس يركضون باتجاه الخطر
- **الحل**: طول أقصى 20 م (أو 30 م مع رش)
- **الرؤية**: من أي نقطة بالممر = يمكن رؤية مخرج آمن على الأقل

### 4. الاستمرارية (Continuity to Deck Above)

- جدران الممر يجب أن تمتد **حتى سقف الطابق العلوي** (لا space للدخان)
- استثناء: institutional settings = يسمح بـ "smoke-limiting ceiling membrane"
- هذا يضمن أن الدخان لا ينتشر أفقياً عبر المبنى

### 5. No HVAC Plenum في الممرات

- الممرات **لا يمكن أن تكون قناة هواء return** لنظام التهوية
- إذا الهواء الملوث يرجع عبر الممر = الدخان ينتشر أفقياً بسرعة
- النظام: الممر = مكان للمشي فقط، لا "plenum"

## ⚙️ المتطلبات التقنية / Technical Requirements

### جدول تقييم النار — Corridor Fire Rating

```
الحالة 1: Non-Sprinklered Building
┌──────────┬─────────────────────┐
│ Occupancy│ Fire Rating Required │
├──────────┼─────────────────────┤
│ A, B, E  │ 1-hour fire rating   │
│ F, M, R  │ 1-hour fire rating   │
│ S, U     │ 1-hour fire rating   │
│ H        │ 2-hour fire rating   │
│ I-1 to 4 │ 1-hour fire rating   │
└──────────┴─────────────────────┘

الحالة 2: Sprinklered Building (NFPA 13/13R)
┌──────────┬─────────────────────┐
│ Occupancy│ Fire Rating Required │
├──────────┼─────────────────────┤
│ A, B, E  │ 0 hours (NO RATING)  │
│ F, M, R  │ 0 hours (NO RATING)  │
│ S, U     │ 0 hours (NO RATING)  │
│ H        │ 2-hour fire rating   │
│ I-1 to 4 │ 1-hour fire rating   │
└──────────┴─────────────────────┘

** 1-hour rating = 60 minutes من التعريض للحريق القياسي (ASTM E119)
** 2-hour rating = 120 minutes **
```

### حساب عرض الممر

**الصيغة الأساسية**:
```
عرض الممر ≥ قيمة Section 1005.1 (محسوبة من occupant load)

الحد الأدنى: 1050 مم (معظم المباني)
الحد الأدنى: 1500 مم (Group I — مستشفيات)

مثال:
- مبنى تجاري (Group B): 1050 مم أدنى
- مستشفى (Group I-2): 1500 مم أدنى
```

### Dead-End Corridor Maximum Length

| الحالة | الطول الأقصى | الحكمة |
|-------|-------------|---------|
| نموذجي (non-sprinklered) | 20 م | أقصر مسافة بحيث يرى الشخص مخرج |
| مع رش تلقائي | 30 م | الرش = زمن أطول للهروب |
| Sprinklered + مخرج إضافي | تحسين إضافي | خروج بديل = مسافة أطول مقبولة |

### متطلبات Continuity (المستمرية)

```
النموذج الصحيح (Continuous):
┌─────────────────────────────┐
│      Floor/Roof Deck        │
├─────────────────────────────┤
│ ╔═════════════════════════╗ │ ← جدران الممر تمتد
│ ║   CORRIDOR            ║ │   كاملاً حتى السقف
│ ║   (Fire-Rated Walls)  ║ │   (مفاصل معزولة)
│ ╚═════════════════════════╝ │
└─────────────────────────────┘

النموذج الخاطئ (Discontinuous — غير مسموح):
┌─────────────────────────────┐
│      Floor/Roof Deck        │
├──────────╔═══════════════════┤ ← gap في السقف
│          ║   CORRIDOR       │    = دخان ينتشر أفقياً
│          ║                 │
└──────────╚═══════════════════┘
```

### Fire Partition Design (جدران الممر)

جدران الممر يجب:
- تحقيق rating معين (1 hr أو 2 hr) ← SBC 201 Section 708
- إغلاق كامل (بدون فجوات) ← خاصة على الأطراف والزوايا
- Doors بـ self-closing + fire rating لنفس الدرجة
- مفاصل معزولة بـ sealant (منع الدخان)

## 🔗 الأقسام المرتبطة / Cross-References

- [[sbc-801-section-1005]] — **General Means of Egress**: عروض عامة (corridors جزء من ذلك)
- [[sbc-801-section-1006]] — **Number of Exits**: عدد المخارج = الممرات توصل إليها
- [[sbc-801-section-1010]] — **Doors**: أبواب الممر (يجب fire-rated)
- [[sbc-801-section-1016]] — **Exit Access**: الممرات = جزء من exit access
- [[sbc-801-section-1017]] — **Exit Access Travel Distance**: الممرات تُحتسب ضمن المسافة
- [[sbc-801-section-1019]] — **Exit Access Stairways**: السلالم في نهاية الممرات
- [[sbc-801-section-1024]] — **Exit Passageways**: extension من الممرات (fire-protected)
- [[sbc-201-section-708]] — **Fire Partitions**: تصميم جدران الممر من SBC 201
- [[sbc-801-section-905]] — **Sprinkler Systems**: الرش = تقليل متطلبات النار

## ⚠️ نقاط الانتباه الهندسي / Engineering Watch Points

### 1. الخطأ الشائع: تجاهل Fire Rating

❌ **خطأ**: "ممر بـ جدران عادية (drywall) = كافي"
✓ **صحيح**: 
- Non-sprinklered → 1-hour fire partition (SBC 201 Section 708)
- استثناء: جدران dwelling units / مباني مرشوشة

### 2. الممر كـ HVAC Plenum

❌ **خطأ**: "الهواء الراجع يمر عبر ceiling return في الممر"
✓ **صحيح**: ممنوع تماماً (Section 1020.7)
- الهواء الراجع يجب في ductwork منفصل
- الممر = نقل الناس، لا الهواء

### 3. طول Dead-End الممر

❌ **خطأ**: "ممر مسدود 50 متر = لا مشكلة"
✓ **صحيح**: 
- Non-sprinklered: ≤ 20 م أقصى
- Sprinklered: ≤ 30 م أقصى
- 50 متر = يجب عمل منعطف أو مخرج وسيط

### 4. الاستمرارية في السقف

❌ **خطأ**: "جدران الممر تنتهي عند السقف المعلق (drop ceiling)"
✓ **صحيح**: جدران يجب تمتد **حتى floor deck العلوي**:
```
✓ صحيح:
Floor above
   ↓
[══════════════════════════] ← Floor Deck
│ ╔════════════════════╗ │
│ ║   CORRIDOR        ║ │ جدران تمتد كاملاً
│ ║ (1-hr walls)      ║ │
│ ╚════════════════════╝ │
└─────────────────────────┘

✗ خطأ:
[════════════════════════] ← Floor Deck
 ══════════════════════════ ← Drop ceiling (plenum space!)
│ ╔════════════════════╗ │
│ ║   CORRIDOR        ║ │ جدران توقفت قبل الأوان
│ ║                  ║ │
│ ╚════════════════════╝ │
└─────────────────────────┘
  ↑ دخان ينتشر هنا!
```

### 5. عرض الممر الفعلي

❌ **خطأ**: "الممر مرسوم 1200 مم على الرسم، لكن معدات بارزة تضيق العرض"
✓ **صحيح**: العرض **الفاتح الفعلي** يجب ≥ 1050 مم:
- معدات، أنابيب، معلقات = لا تبرز أكثر من 100 مم
- أبواب (عند الفتح) = تُحسب ضمن العرض

### 6. أبواب الممر (Doors)

❌ **خطأ**: "باب الممر = عادي (drywall + hinges عادي)"
✓ **صحيح**: يجب:
- نفس fire rating كـ جدار (1 hr أو 2 hr)
- self-closing (أغلاق تلقائي)
- labeled من قبل مختبر معتمد

### 7. Group I-2 خاص (Hospitals)

❌ **خطأ**: "Continuous ceiling في مستشفى = كافي"
✓ **صحيح**: يجب استمرارية حتى floor deck:
- المرضى الحرجين = دخان قد يكون مهلك بسرعة
- متطلبات أصعب من مباني عادية

## 📊 حالة التوليف / Synthesis Status

### متى يُطبَّق هذا القسم

1. **في التصميم**: 
   - اختيار fire rating للممرات
   - تحديد الأسقف والجدران
   - تخطيط أطوال dead-end

2. **في التنفيذ**:
   - اختبار continuity (أنت رائد النار يختبر)
   - تركيب جدران fire-rated
   - إغلاق جميع الفجوات

3. **للصيانة**:
   - التأكد من أبواب الممر تُغلق تلقائياً
   - فحص الجدران للشقوق
   - التأكد من عدم انسداد الممر

### المتغيرات المُفعِّلة

- **نوع الاحتلال** (Occupancy Group):
  - A, B, E, F, M, R, S, U = 1 hr (non-sprinklered)
  - H = 2 hr (دائماً)
  - I = 1 hr (أو continuous للمستشفيات)

- **وجود Sprinkler System**: 
  - مع رش = 0 hr (لا تحتاج fire rating)
  - بدون رش = 1 hr أدنى

- **طول الممر**:
  - ≤ 20 م = dead-end مقبول
  - 20–30 م = إذا مرشوش فقط
  - > 30 م = يجب exit إضافي

### الآثار اللاحقة

- **Section 1010** (Doors): أبواب الممر = نفس fire rating
- **Section 1016** (Exit Access): الممرات = مسار نحو exit
- **Section 1017** (Travel Distance): طول الممر = يحسب في المسافة الكلية
- **Section 1024** (Exit Passageways): extension من الممرات (مزيد حماية)
- **SBC 201 Section 708** (Fire Partitions): التصميم التفصيلي للجدران
- **Building Systems**: HVAC, electrical, plumbing = لا يمكن استخدام الممر

---

**مثال تطبيقي:**

```
مبنى مكاتب 4 طوابق — تصميم الممرات

السيناريو أ (بدون رش):
- Occupancy: Group B
- Fire rating: 1 hour (جدران fire partition SBC 201 Section 708)
- عرض: ≥ 1050 مم
- dead-ends: ≤ 20 متر أقصى
- جدران: تمتد من floor deck إلى floor deck
- أبواب: 1-hour rated + self-closing

السيناريو ب (مع رش NFPA 13):
- Occupancy: Group B
- Fire rating: 0 hours (لا حاجة لـ fire partition!)
- عرض: ≥ 1050 مم (للأمان)
- dead-ends: ≤ 30 متر مقبول
- جدران: عادي (drywall) — لا حاجة fire rating
- أبواب: عادي (لا self-closing مطلوب)
→ توفير كبير = الرش يستحق الاستثمار

الممر الفعلي:
- الرسم: 1500 مم
- المعدات البارزة: أنابيب + مخارج تهوية = 200 مم
- العرض الفاتح: 1500 - 200 = 1300 مم ✓
```