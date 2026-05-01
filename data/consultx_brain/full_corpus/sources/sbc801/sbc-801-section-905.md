---
record_id: sbc-801-section-905
code_family: SBC 801
edition: '2024'
section_id: '905'
page_type: section
authority_level: STRUCTURED_FACT
status: PARTIAL_STRUCTURED
source_files:
  - "SBC 801 - Part 5.pdf"
source_pages: "pp. 491–530"
dependencies:
  - section: '901'
    reason: "المتطلبات العامة للاختبار والصيانة تنطبق على الأنابيب الرأسية"
  - section: '913'
    reason: "مضخات الحريق تُزوِّد الأنابيب الرأسية بالضغط"
  - section: '912'
    reason: "وصلات الإطفاء مرتبطة بالأنابيب الرأسية"
tags: [fire-protection, standpipe-systems, water-supply, class-i, class-ii, class-iii, high-rise, manual-wet, automatic-wet, dry-pipe]
related_sections: [901, 903, 907, 912, 913, 1007]
last_reviewed: '2026-04-14'
---
# Section 905 — أنظمة الأنابيب الرأسية / STANDPIPE SYSTEMS

## 📋 نص الكود الحرفي / Canonical Code Text
> **[CANONICAL_SOURCE — SBC 801-2024, Section 905.1–905.3.1, pp. 491–495]**

### 905.1 General
Standpipe systems shall be provided in new buildings and structures in accordance with Sections 905.2 through 905.10. In buildings used for high-piled combustible storage, standpipe systems are installed in exit passageways in accordance with Chapter 32.

### 905.2 Installation Standard
Standpipe systems shall be installed in accordance with this section and NFPA 14. Fire department connections for standpipe systems shall be in accordance with Section 912.

### 905.3 Required Installations
Standpipe systems shall be installed where required by Sections 905.3.1 through 905.3.8. Standpipe systems are allowed to be combined with automatic sprinkler systems.

**Exception**: Standpipe systems are not required in Group R-3 occupancies.

### 905.3.1 Height
Class III standpipe systems shall be installed throughout buildings where any of the following conditions exist:

1. Four or more stories are above or below grade plane.
2. The floor level of the highest story is located more than 9 m above the lowest level of the fire department vehicle access.
3. The floor level of the lowest story is located more than 9 m below the highest level of fire department vehicle access.

## 💡 التعليق الهندسي / Engineering Commentary

أنظمة الأنابيب الرأسية (Standpipe Systems) هي أنظمة توفر مصدراً سريعاً وآمناً للماء في المباني المرتفعة والعميقة حيث يكون من غير العملي أن تمد فرق الإطفاء خطوط الخراطيم الخاصة بها مباشرة من سيارات الإطفاء. يُستخدم الحد الأدنى للارتفاع 9 أمتار كمعيار لأن هذا هو الحد الأقصى الذي يمكن لفرق الإطفاء العادية أن تمد خطوطها عملياً دون استخدام نظام رأسي.

### أنواع الأنظمة والفئات:

**الفئات الثلاث**:
- **Class I**: اتصالات 65 ملم (2.5 بوصة) لاستخدام فرق الإطفاء فقط. يُستخدم في المباني المرتفعة جداً
- **Class II**: اتصالات 40 ملم (1.5 بوصة) لاستخدام الأشخاص المدربين والموظفين (لا يُستخدم للعامة)
- **Class III**: تركيبة من اتصالات 65 ملم و 40 ملم لاستخدام فرق الإطفاء والأشخاص المدربين

**أنواع الأنظمة**:
- **Automatic Wet** — معروضة دائماً بالماء تحت الضغط (الأكثر شيوعاً وموصى به)
- **Manual Wet** — تحتاج يدوياً إلى كسر صمام للمياه
- **Automatic Dry** — مملوءة بالهواء أو النيتروجين، تملأ بالماء تلقائياً عند التفعيل
- **Manual Dry** — تحتاج يدوياً إلى توصيل مصدر مياه
- **Semiautomatic Dry** — مرتبطة بنظام تلقائي لتوفير المياه

## ⚙️ المتطلبات التقنية / Technical Requirements

### جدول متطلبات الأنظمة الرأسية حسب الارتفاع والاستخدام:

| الحالة | متطلب الفئة | النوع الموصى | ملاحظات |
|-------|-----------|-------------|---------|
| **ارتفاع 4+ طوابق** | Class III | Automatic Wet | إذا لم تكن هناك استثناءات |
| **ارتفاع > 9 م فوق مستوى وصول سيارات الإطفاء** | Class III | Automatic Wet | المراجع الأساسي: مسافة 9 م الحد الأقصى للعمليات اليدوية |
| **عمق > 9 م تحت مستوى وصول سيارات الإطفاء** | Class III | Automatic Wet | نفس منطق الارتفاع ينطبق على الأماكن العميقة |
| **مباني مرشوشة بالكامل (Fully Sprinklered)** | Class I كافية | Automatic Wet | استثناء: يسمح بـ Class I فقط |
| **مباني المجموعات B و E** | Class I كافية | Manual أو Automatic | استثناء: خطوط استخدام الموظفين ليست ضرورية |
| **مواقف السيارات (Parking Garages)** | Class I كافية | Manual أو Automatic | الأنابيب موجودة لاستخدام فرق الإطفاء فقط |
| **الطوابق السفلية المرشوشة** | Class I كافية | Automatic Wet | استثناء: فقط في الطابق السفلي |
| **المجموعة R-3 (السكن الفردي)** | غير مطلوبة | N/A | استثناء: لا توجد حاجة في الوحدات السكنية الصغيرة |

### التصميم والتركيب:

| المتطلب | القيمة / الوصف |
|--------|-----------------|
| **معيار التصميم الرئيسي** | NFPA 14 — Standard for the Installation of Standpipe and Hose Systems |
| **معايير الصيانة** | NFPA 25 — Inspection, Testing and Maintenance of Water-Based Fire Protection Systems |
| **توصيلات جهة الإطفاء (FDC)** | يجب أن تكون متوافقة مع خيوط سيارات الإطفاء المحلية (Section 912) |
| **مصدر المياه** | توفير كاف من الماء تحت الضغط المناسب (عادة 500-2000 جالون/دقيقة) |
| **ضغط التشغيل** | لا يقل عن 50 PSI و لا يزيد عن 175 PSI في الاتصالات |
| **اختبار التسرب** | اختبار هيدروستاتيكي بضغط 200 PSI قبل التشغيل |
| **الموقع والعزل** | يجب عزل الأنابيب لحمايتها من الضرر، خاصة في المباني المرتفعة جداً (> 128 م) |

## 🔗 الأقسام المرتبطة / Cross-References

- [[sbc-801-section-901]] — المتطلبات العامة والإدارية لأنظمة الحماية من الحريق
- [[sbc-801-section-903]] — أنظمة الرش التلقائي (يمكن دمجها مع الأنظمة الرأسية)
- [[sbc-801-section-912]] — توصيلات جهة الإطفاء والمتطلبات الفنية
- [[sbc-801-section-913]] — مضخات الحريق (Fire Pumps) — ضرورية للمباني العالية جداً
- [[sbc-801-section-1007]] — فصل الأنابيب الرأسية في المباني المرتفعة (>128 م)
- [[sbc-201-section-402.7]] — متطلبات الأنظمة الرأسية في SBC 201

## ⚠️ نقاط الانتباه الهندسي / Engineering Watch Points

1. **حساب مسافة الارتفاع بشكل صحيح**: الـ 9 أمتار تُقاس من "مستوى وصول سيارات الإطفاء" وليس من مستوى الأرض. في المباني على منحدرات أو مع طوابق سفلية متعددة، قد يكون لديك مستويات وصول متعددة، وتُستخدم الأكثر تقييداً.

2. **الاستثناءات المهمة**:
   - المباني المرشوشة بالكامل تحتاج فقط Class I (اتصال واحد 65 ملم)
   - المجموعات B و E لا تحتاج خطوط استخدام الموظفين
   - المجموعة R-3 (المنازل والفلل) معفية تماماً

3. **الأنظمة المشتركة**: يمكن لنفس الأنابيب أن تعمل كنظام رش وأنظمة رأسية في نفس الوقت، لكن يجب توفير صمامات تحكم بقطع الرش عند كل طابق لضمان استمرار عمل الأنظمة الرأسية.

4. **الأنابيب المزدوجة في المباني المرتفعة جداً** (> 128 م): يجب توفير رأسيتين على الأقل في مناطق مختلفة بحيث لو تعطلت إحدى الرأسيتين، تستطيع الثانية تغطية الطوابق البديلة. هذا يزيد من الموثوقية في الحالات الطارئة.

5. **الاختبار الدوري والصيانة**: يجب اختبار الأنابيب الرأسية سنوياً على الأقل وتسجيل جميع الاختبارات. الصيانة يجب أن تتم وفق NFPA 25.

6. **التوافق مع معايير الإطفاء المحلية**: خيوط الاتصالات يجب أن تكون متوافقة مع ما تستخدمه جهات الإطفاء المحلية (تختلف من منطقة لأخرى).

7. **المواد والحماية من التآكل**: الأنابيب قد تكون من الفولاذ الكربوني أو الفولاذ المجلفن. في البيئات الساحلية أو الرطبة، يجب توفير حماية إضافية من التآكل.

## 📊 حالة التوليف / Synthesis Status

- **التطبيق**: 
  - **مطلوب** في المباني بـ 4+ طوابق أو حيث يتجاوز الارتفاع 9 أمتار عن مستوى وصول سيارات الإطفاء
  - **مطلوب** في مباني التخزين المرتفع (High-Piled Storage) في ممرات الخروج
  - **مطلوب** في المراحل العميقة (مستودعات تحت الأرض) حيث يتجاوز العمق 9 أمتار
  - **معفي** في المجموعة R-3 والمباني ذات الارتفاع المحدود

- **المتغيرات المُشغِّلة**: 
  - ارتفاع المبنى والمسافة الرأسية من مستوى وصول سيارات الإطفاء
  - مجموعة الإشغال (Occupancy Group)
  - وجود نظام رش تلقائي (يؤثر على فئة النظام المطلوب)
  - عمق الطوابق السفلية تحت مستوى الشارع

- **الآثار اللاحقة**: 
  - يتطلب مضخات حريق في المباني المرتفعة جداً (القسم 913)
  - يؤثر على توثيق الاتصالات وتوصيل جهات الإطفاء (القسم 912)
  - يتطلب صيانة دورية وفق معايير NFPA 25
  - يؤثر على توجيه ومسارات الأنابيب في الهياكل الإنشائية الكبرى

*المصدر: SBC 801-CC-2024, Chapter 9, Section 905*
