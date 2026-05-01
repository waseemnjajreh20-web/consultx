---
record_id: sbc-801-section-806
code_family: SBC 801
edition: '2024'
section_id: '806'
page_type: section
authority_level: STRUCTURED_FACT
status: PARTIAL_STRUCTURED
source_files:
  - "SBC 801 - The Saudi Fire Protection Code (3)-401-600.pdf"
source_pages: "pp. 411–412 (PDF pp. 41–42)"
dependencies:
  - section: '903'
    reason: "الرش التلقائي يُسمح بالأشجار في بعض الإشغالات"
  - section: '907'
    reason: "كاشفات الدخان"
tags: [decorative-vegetation, trees, ch8, seasonal]
related_sections: [801, 807, 903, 907]
last_reviewed: '2026-04-19'
---
# Section 806 — Decorative Vegetation / النباتات الزخرفية

---

## 📋 نص الكود الحرفي / Canonical Code Text
> **[CANONICAL_SOURCE — SBC 801-CC-2024, Section 806, PDF pp. 41–42 (Doc pp. 411–412)]**

**806.1 Natural cut trees.** Natural cut trees, where allowed by this section, shall have the trunk bottoms cut off not less than 13 mm above the original cut and shall be placed in a support device complying with Section 806.1.2.

**806.1.1 Restricted occupancies.** Natural cut trees shall be prohibited within ambulatory care facilities and Group A, E, I-1, I-2, I-3, I-4, M, R-1, R-2 and R-4 occupancies.

**Exceptions:**
1. Trees located in areas protected by an approved automatic sprinkler system installed in accordance with Section 903.3.1.1 or 903.3.1.2 shall not be prohibited in Groups A, E, M, R-1 and R-2.
2. Trees shall be allowed within dwelling units in Group R-2 occupancies.

**806.1.2 Support devices.** The support device that holds the tree in an upright position shall be of a type that is stable and that meets all of the following criteria:
1. The device shall hold the tree securely and be of adequate size to avoid tipping over of the tree.
2. The device shall be capable of containing a minimum two-day supply of water.
3. The water level, when full, shall cover the tree stem not less than 50 mm. The water level shall be maintained above the fresh cut and checked not less than once daily.

**806.1.3 Dryness.** The tree shall be removed from the building whenever the needles or leaves fall off readily when a tree branch is shaken or if the needles are brittle and break when bent between the thumb and index finger. The tree shall be checked daily for dryness.

**806.1.4 Fire-retardant treatments for natural cut trees.** Where fire-retardant treatments are applied to natural cut trees, the fire-retardant treatment shall be tested by an approved agency and shall comply with both Test Method 1 and Test Method 2 of ASTM E3082.

**806.2 Obstruction of means of egress.** The required width of any portion of a means of egress shall not be obstructed by decorative vegetation. Natural cut trees shall not be located within an exit, corridor, or a lobby or vestibule.

**806.3 Open flame.** Candles and open flames shall not be used on or near decorative vegetation. Natural cut trees shall be kept a distance from heat vents and any open flame or heat-producing devices at least equal to the height of the tree.

**806.4 Electrical fixtures and wiring.** The use of unlisted electrical wiring and lighting on natural vegetation, including natural cut trees, shall be prohibited.

> ⚠️ ما فوق هو النص الحرفي من الكود. ما يليه هو تحليل هندسي (LLM_SYNTHESIS).

---

## 💡 التعليق الهندسي / Engineering Commentary
> **[LLM_SYNTHESIS]** — هذا تحليل، ليس نصاً من الكود

القسم 806 يتعامل مع خطر النباتات الزخرفية الطبيعية (خاصة أشجار عيد الميلاد) التي تُعد وقوداً سريع الاشتعال. المنطق:
- الأشجار الجافة تحترق بسرعة هائلة — flashover في أقل من 90 ثانية
- استثناء الرش التلقائي: يُسمح في A, E, M, R-1, R-2 فقط عند وجود رش
- فحص الجفاف يوميًا إلزامي

---

## 📊 المتطلبات التقنية المُهيكَلة / Structured Technical Requirements
> **[STRUCTURED_FACT — Source: Section 806, SBC 801-CC-2024, PDF pp. 41–42 (Doc pp. 411–412)]**

### متطلبات قطع الأشجار الطبيعية / Natural Cut Tree Requirements

| المعيار | القيمة |
|---------|--------|
| قطع الجذع | ≥ 13 mm فوق القطع الأصلي |
| تغطية الماء للساق | ≥ 50 mm |
| سعة الماء | إمداد يومين كحد أدنى |
| فحص الجفاف | يوميًا |
| فحص مستوى الماء | مرة واحدة يوميًا على الأقل |

### الإشغالات المحظورة / Restricted Occupancies

| مجموعة الإشغال | بدون رش | مع رش |
|---------------|---------|-------|
| Ambulatory Care | ❌ محظور | ❌ محظور |
| A, E, M, R-1, R-2 | ❌ محظور | ✅ مسموح |
| I-1, I-2, I-3, I-4 | ❌ محظور | ❌ محظور |
| R-2 (وحدات سكنية) | ✅ مسموح | ✅ مسموح |
| R-4 | ❌ محظور | ❌ محظور |

### المسافة عن اللهب والحرارة / Clearance from Heat

| المعيار | القيمة |
|---------|--------|
| المسافة عن اللهب/الحرارة | ≥ ارتفاع الشجرة |
| الشموع واللهب المكشوف | ❌ ممنوعة على أو بالقرب |
| الأسلاك الكهربائية | يجب أن تكون Listed |

### مواقع محظورة داخل المبنى / Prohibited Locations

| الموقع | الحكم |
|--------|-------|
| المخرج (Exit) | ❌ محظور |
| الممر (Corridor) | ❌ محظور |
| الردهة/المدخل (Lobby/Vestibule) | ❌ محظور |
| أي جزء من مسار الإخلاء | ❌ لا عرقلة |

---

## 🔗 الأقسام المرتبطة / Cross-References

| القسم | العلاقة | نوع التبعية |
|-------|---------|------------|
| [[sbc-801-section-807]] | المواد الزخرفية الأخرى | يُكمِّل |
| [[sbc-801-section-903]] | الرش التلقائي يُسمح بالأشجار | يُعدِّل |

---

## ⚠️ نقاط الانتباه الهندسي / Engineering Watch Points
> **[LLM_SYNTHESIS]** — مستنبطة من تحليل النص والتطبيق العملي

1. **الفحص اليومي للجفاف**: إلزامي — كثير من المنشآت تهمله
2. **المسافة = ارتفاع الشجرة**: قاعدة عملية سهلة التطبيق
3. **الرش لا يُبيح كل شيء**: I-1, I-2, I-3, I-4 محظورة حتى مع الرش
4. **الأشجار الاصطناعية**: تخضع للقسم 807 وليس 806
5. **موسم الأعياد**: أكثر فترة حرجة — يُنصح بخطة تفتيش خاصة

---

## ⚡ التعارضات المعروفة / Known Conflicts
> لا توجد تعارضات معروفة مع الطبعة الحالية

---

*المصدر: SBC 801-CC-2024, Section 806, PDF pp. 41–42 (Doc pp. 411–412)*
*تاريخ الاستيعاب: 2026-04-19*
