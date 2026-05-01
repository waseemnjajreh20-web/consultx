---
record_id: sbc-801-section-808
code_family: SBC 801
edition: '2024'
section_id: '808'
page_type: section
authority_level: STRUCTURED_FACT
status: PARTIAL_STRUCTURED
source_files:
  - "SBC 801 - The Saudi Fire Protection Code (3)-401-600.pdf"
source_pages: "pp. 418–420 (PDF pp. 48–50)"
dependencies:
  - section: '803'
    reason: "الخزائن القابلة للاحتراق تُعتبر تشطيباً داخلياً"
  - code: SBC 201
    section: '509'
    reason: "غرف جمع النفايات والكتان"
tags: [waste-containers, signs, lockers, play-structures, ch8]
related_sections: [801, 803, 805]
last_reviewed: '2026-04-19'
---
# Section 808 — Furnishings Other Than Upholstered Furniture and Mattresses / أثاث آخر غير المفروش والمراتب

---

## 📋 نص الكود الحرفي / Canonical Code Text
> **[CANONICAL_SOURCE — SBC 801-CC-2024, Section 808, PDF pp. 48–50 (Doc pp. 418–420)]**

**808.1 Wastebaskets and linen containers in Group I-1, I-2 and I-3 occupancies.** Wastebaskets, linen containers and other waste containers, including their lids, located in Group I-1, I-2 and I-3 occupancies and Group B ambulatory care facilities shall be constructed of noncombustible materials or of materials that meet a peak rate of heat release not exceeding 300 kW/m² when tested in accordance with ASTM E1354 at an incident heat flux of 50 kW/m² in the horizontal orientation. Metal wastebaskets and other metal waste containers with a capacity of 75 L or more shall be listed in accordance with UL 1315 and shall be provided with a noncombustible lid. Portable containers exceeding 120 L shall be stored in an area classified as a waste and linen collection room and constructed in accordance with Table 509.1 of SBC 201.

**Exception:** Recycling containers complying with Section 808.1.2 are not required to be stored in waste and linen collection rooms.

**808.1.1 Capacity density.** The average capacity density of containers located in an individual room or space, other than waste and linen collection rooms, shall not be greater than 20 L/m².

**808.1.2 Recycling clean waste containers.** Recycling clean waste containers, including their lids, shall not exceed an individual capacity of 360 L.

**808.2 Waste containers with a capacity of 75 L or more in Group R-2 college and university dormitories.** Waste containers, including their lids, located in Group R-2 college and university dormitories, and with a capacity of 75 L or more, shall be constructed of noncombustible materials or of materials that meet a peak rate of heat release not exceeding 300 kW/m² when tested in accordance with ASTM E1354 at an incident heat flux of 50 kW/m² in the horizontal orientation. Metal wastebaskets and other metal waste containers with a capacity of 75 L or more shall be listed in accordance with UL 1315 and shall be provided with a noncombustible lid. Portable containers exceeding 120 L shall be stored in an area classified as a waste and linen collection room constructed in accordance with Table 509 of SBC 201.

**808.3 Signs.** Foam plastic signs that are not affixed to interior building surfaces shall have a maximum heat release rate of 150 kW when tested in accordance with UL 1975, or when tested in accordance with NFPA 289 using the 20-kW ignition source.

**Exception:** Where the aggregate area of foam plastic signs is less than 10 percent of the floor area or wall area of the room or space in which the signs are located, whichever is less, subject to the approval of the Fire official.

**808.4 Combustible lockers.** Where lockers constructed of combustible materials are used, the lockers shall be considered to be interior finish and shall comply with Section 803.

**Exception:** Lockers constructed entirely of wood and noncombustible materials shall be permitted to be used wherever interior finish materials are required to meet a Class C classification in accordance with Section 803.1.2.

**808.5 Play structures added to existing buildings.** Where play structures that exceed 3 m in height or 14 m² in area are added inside an existing building, they shall comply with Section 424 of SBC 201.

> ⚠️ ما فوق هو النص الحرفي من الكود. ما يليه هو تحليل هندسي (LLM_SYNTHESIS).

---

## 💡 التعليق الهندسي / Engineering Commentary
> **[LLM_SYNTHESIS]** — هذا تحليل، ليس نصاً من الكود

القسم 808 يغطي عناصر أثاث وتجهيزات لم تُغطَ في الأقسام السابقة:
1. **حاويات النفايات** — في المنشآت الصحية والسكن المؤسسي — خطر حريق الكتان والملوثات
2. **اللافتات الرغوية** — HRR ≤ 150 kW — خطر انتشار سريع
3. **الخزائن القابلة للاحتراق** — تُعامل كتشطيب داخلي
4. **هياكل اللعب** — إذا أضيفت لمبنى قائم وتتجاوز 3m أو 14m²

---

## 📊 المتطلبات التقنية المُهيكَلة / Structured Technical Requirements
> **[STRUCTURED_FACT — Source: Section 808, SBC 801-CC-2024, PDF pp. 48–50 (Doc pp. 418–420)]**

### حاويات النفايات / Waste Containers (I-1, I-2, I-3, B ambulatory)

| المعيار | القيمة |
|---------|--------|
| المادة | غير قابلة للاحتراق أو HRR ≤ 300 kW/m² |
| الاختبار | ASTM E1354 عند 50 kW/m² أفقي |
| ≥ 75 L معدنية | يجب UL 1315 + غطاء غير قابل للاحتراق |
| > 120 L محمولة | تُخزّن في غرفة جمع نفايات/كتان (SBC 201 Table 509.1) |
| كثافة السعة | ≤ 20 L/m² في الغرفة الواحدة |
| حاويات إعادة التدوير | ≤ 360 L فردي — معفاة من التخزين الخاص |

### حاويات النفايات في السكن الجامعي / R-2 Dormitory Waste Containers

| المعيار | القيمة |
|---------|--------|
| ≥ 75 L | نفس متطلبات I-1/I-2/I-3 |
| > 120 L محمولة | غرفة جمع نفايات (SBC 201 Table 509) |

### اللافتات الرغوية / Foam Plastic Signs

| المعيار | القيمة |
|---------|--------|
| HRR الأقصى | ≤ 150 kW (UL 1975 أو NFPA 289) |
| استثناء المساحة | < 10% من مساحة الأرضية أو الجدار (أيهما أقل) |
| الشرط | موافقة مسؤول الحريق |

### الخزائن القابلة للاحتراق / Combustible Lockers

| المعيار | الحكم |
|---------|-------|
| القاعدة | تُعتبر تشطيباً داخلياً (Section 803) |
| الاستثناء | خشبية بالكامل + مواد غير قابلة للاحتراق — مسموحة حيث Class C مطلوب |

### هياكل اللعب / Play Structures (مباني قائمة)

| المعيار | القيمة |
|---------|--------|
| الارتفاع | > 3 m |
| المساحة | > 14 m² |
| المتطلب | SBC 201 Section 424 |

---

## 🔗 الأقسام المرتبطة / Cross-References

| القسم | العلاقة | نوع التبعية |
|-------|---------|------------|
| [[sbc-801-section-803]] | الخزائن تُعتبر تشطيباً داخلياً | مرجع |
| [[sbc-801-section-805]] | الأثاث المفروش والمراتب | يُكمِّل |
| SBC 201 Section 509 | غرف جمع النفايات والكتان | مرجع |
| SBC 201 Section 424 | هياكل اللعب | مرجع |

---

## ⚠️ نقاط الانتباه الهندسي / Engineering Watch Points
> **[LLM_SYNTHESIS]** — مستنبطة من تحليل النص والتطبيق العملي

1. **حاويات 75 L+:** الغطاء غير القابل للاحتراق إلزامي — كثير من المنشآت تستخدم أغطية بلاستيكية
2. **كثافة السعة 20 L/m²:** تُحسب لكل غرفة على حدة — ليس للمساحة الكلية
3. **اللافتات الرغوية**: 150 kW HRR — أقل من الرغوة الزخرفية في Section 807 (100 kW) لأنها غير مثبتة
4. **الخزائن الخشبية**: استثناء عملي — مسموحة حيث Class C فقط (ليس A أو B)
5. **هياكل اللعب**: 3m أو 14m² — أي منهما يُشغِّل SBC 201 Section 424

---

## ⚡ التعارضات المعروفة / Known Conflicts
> لا توجد تعارضات معروفة مع الطبعة الحالية

---

*المصدر: SBC 801-CC-2024, Section 808, PDF pp. 48–50 (Doc pp. 418–420)*
*تاريخ الاستيعاب: 2026-04-19*
