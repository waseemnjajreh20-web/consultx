---
record_id: sbc-801-section-907
code_family: SBC 801
edition: '2024'
section_id: '907'
page_type: section
authority_level: STRUCTURED_FACT
status: PARTIAL_STRUCTURED
source_files:
  - "SBC 801 - Part 5.pdf"
source_pages: "pp. 531–588"
dependencies:
  - section: '901'
    reason: "المتطلبات العامة للاختبار والصيانة تنطبق على أنظمة الإنذار"
  - section: '903'
    reason: "وجود الرش يؤثر على نوع الإنذار المطلوب"
  - section: '1203'
    reason: "أنظمة الإنذار تحتاج طاقة احتياطية"
tags: [fire-alarm-systems, detection-systems, manual-alarm-boxes, smoke-detectors, occupant-notification, nfpa-72, high-rise-buildings, assembly-occupancies]
related_sections: [901, 903, 905, 906, 908, 909, 1203]
last_reviewed: '2026-04-14'
---
# Section 907 — أنظمة الإنذار والكشف عن الحريق / FIRE ALARM AND DETECTION SYSTEMS

## 📋 نص الكود الحرفي / Canonical Code Text
> **[CANONICAL_SOURCE — SBC 801-2024, Section 907.1–907.2.1, pp. 531–545]**

### 907.1 General
This section covers the application, installation, performance and maintenance of fire alarm systems and their components in new and existing buildings and structures. The requirements of Section 907.2 are applicable to new buildings and structures. The requirements of Section 907.9 are applicable to existing buildings and structures.

### 907.1.2 Fire Alarm Shop Drawings
Shop drawings for fire alarm systems shall be prepared in accordance with NFPA 72 and submitted for review and approval prior to system installation.

### 907.1.3 Equipment
Systems and components shall be listed and approved for the purpose for which they are installed.

### 907.2 Where Required — New Buildings and Structures
An approved fire alarm system installed in accordance with the provisions of this code and NFPA 72 shall be provided in new buildings and structures in accordance with Sections 907.2.1 through 907.2.23 and provide occupant notification in accordance with Section 907.5, unless other requirements are provided by another section of this code.

### 907.2.1 Group A — Assembly Occupancies
A manual fire alarm system that activates the occupant notification system in accordance with Section 907.5 shall be installed in Group A occupancies where the occupant load due to the assembly occupancy is 300 or more, or where the Group A occupant load is more than 100 persons above or below the lowest level of exit discharge.

## 💡 التعليق الهندسي / Engineering Commentary

أنظمة الإنذار والكشف عن الحريق تشمل عادة نظامين متكاملين:

1. **أنظمة الإنذار اليدوية** (Manual Fire Alarm Systems) — صناديق محطات الإنذار اليدوية التي يمكن للموظفين الضغط عليها لتفعيل جرس الإنذار
2. **أنظمة الكشف التلقائي** (Automatic Fire Detection Systems) — كواشف دخان وحرارة وسخام توفر تنبيهاً تلقائياً عند اكتشاف النار

**المقصد من القسم 907**: تحديد أين وتحت أي ظروف يجب توفير أنظمة إنذار وكشف الحريق. تعتمد المتطلبات على:
- فئة الإشغال (Occupancy Group)
- عدد شاغلي المبنى (Occupant Load)
- ارتفاع المبنى
- القدرات الخاصة بالشاغلين (الأطفال والمسنين والمعوقين)

### متطلبات الكشف حسب نوع الإشغال:

| مجموعة الإشغال | حد العدد | متطلب الإنذار | متطلب الكشف |
|--------------|---------|-------------|-----------|
| **Group A (Assembly)** | 300+ أشخاص | نعم — إنذار يدوي | نعم — في المداخل والممرات الداخلية |
| **Group B (Business)** | 500+ في الإجمالي أو 100+ فوق/تحت | نعم — إنذار يدوي | نعم — في غرف محددة |
| **Group E (Educational)** | 50+ أشخاص | نعم — إنذار يدوي | نعم — في جميع المناطق |
| **Group F (Factory)** | متعددة الطوابق مع 500+ فوق | نعم — إنذار يدوي | قد يكون إلزامياً حسب الخطورة |
| **Group H (High-Hazard)** | جميع الحالات | نعم — إنذار يدوي | نعم — مطلوب |
| **Group I (Institutional)** | جميع الحالات | نعم — إنذار يدوي | نعم — في جميع المناطق |
| **Group M (Mercantile)** | 500+ أشخاص | نعم — إنذار يدوي | نعم — في المناطق المحددة |
| **Group R-1 (Hotels)** | جميع الحالات | نعم — إنذار يدوي | نعم — في الممرات والمشاعات |
| **Group R-2 (Multi-family)** | 3+ طوابق أو 16+ وحدة | نعم — إنذار يدوي | نعم — الكشف من الدخان في الوحدات |
| **Group R-4 (Residential Care)** | جميع الحالات | نعم — إنذار يدوي | نعم — في جميع المناطق |

## ⚙️ المتطلبات التقنية / Technical Requirements

### معايير التصميم والتركيب:

| المتطلب | الوصف |
|--------|-------|
| **معيار التصميم الأساسي** | NFPA 72 — National Fire Alarm and Signaling Code |
| **إرسال الرسومات (Shop Drawings)** | يجب تقديم رسومات تفصيلية قبل البدء في التركيب |
| **معايرة المكونات** | جميع المكونات يجب أن تكون معترف بها (Listed) ومعتمدة للاستخدام المقصود |
| **التوافقية (Compatibility)** | يجب أن تكون جميع مكونات النظام متوافقة مع بعضها البعض (خاصة كواشف الدخان والوحدات الرئيسية) |
| **صناديق الإنذار اليدوية** | يجب توفير صندوق إنذار يدوي واحد على الأقل إذا كان لديك كواشف آلية |
| **تفعيل الإخلاء** | يجب أن يفعّل الإنذار تلقائياً نظام إشعار الشاغلين (Occupant Notification System) |
| **الاتصال بسلطات الطوارئ** | يجب توصيل النظام بمحطة الإطفاء (مباشرة أو عبر مركز مراقبة) |

### متطلبات كواشف الدخان (Smoke Detection):

| الموقع / المنطقة | متطلب الكشف |
|-----------------|-----------|
| **ممرات الخروج (Exit Access Corridors)** | مطلوب في المجموعات B, E, I, R-2, R-4 |
| **الغرف الداخلية بدون نوافذ خارجية** | مطلوب حيث تتجاوز المسافة 10 أمتار |
| **الوحدات السكنية** | مطلوب في جميع وحدات المجموعات R-1, R-2, R-4 |
| **غرف الآلات والمعدات** | مطلوب في الأماكن ذات المخاطر (غرف المولدات، غرف التبريد، إلخ) |
| **الأتريوم (Atrium)** | مطلوب حول محيط Atrium على كل مستوى |
| **المساحات المفتوحة في المركز التجاري (Covered Mall)** | مطلوب في المنطقة العامة |
| **أماكن المعيشة المشتركة** | مطلوب في غرف المعيشة والطعام والمطابخ |

### موقع صناديق الإنذار اليدوية:

- يجب توفير وصول سهل وآمن (عادة على ارتفاع 100-150 سم)
- يجب أن تكون مرئية وموضحة بعلامات واضحة
- يجب تجنب الزوايا العمياء والمناطق المحجوبة
- يجب توفير واحد على كل طابق بالقرب من مخارج الطوارئ

## 🔗 الأقسام المرتبطة / Cross-References

- [[sbc-801-section-901]] — المتطلبات العامة لأنظمة الحماية من الحريق
- [[sbc-801-section-903]] — أنظمة الرش التلقائي (تفعيل الإنذار من كواشف تدفق الماء)
- [[sbc-801-section-905]] — أنظمة الأنابيب الرأسية
- [[sbc-801-section-906]] — أنظمة التحكم بالدخان (Smoke Control)
- [[sbc-801-section-908]] — أنظمة الحماية من أول أكسيد الكربون (Carbon Monoxide)
- [[sbc-801-section-909]] — أنظمة إدارة الدخان والحرارة
- [[sbc-801-section-1203]] — مصادر الكهرباء الاحتياطية (Battery Backup)
- [[sbc-201-chapter-9]] — متطلبات الإنذار والكشف في SBC 201

## ⚠️ نقاط الانتباه الهندسي / Engineering Watch Points

1. **التمييز بين الإنذار اليدوي والكشف التلقائي**: 
   - الإنذار اليدوي = صناديق يدويّة يضغط عليها الموظفون
   - الكشف التلقائي = كواشف دخان وحرارة
   - قد يتطلب المبنى أحدهما أو كليهما حسب نوع الإشغال

2. **حساب حمولة الشاغلين (Occupant Load)** بشكل صحيح:
   - يجب استخدام جداول SBC 201 الفصل 10
   - هذا الرقم حاسم في تحديد هل يلزم إنذار يدوي أو كشف تلقائي
   - قد يختلف الحد (300 للمجموعة A، 500 للمجموعة M، إلخ)

3. **الشهادات والتدريب**:
   - يجب أن يكون موظفو التثبيت معتمدين ومدربين على NFPA 72
   - يجب إجراء اختبار نهائي شامل قبل الموافقة على التشغيل
   - يجب عمل شهادة من المثبت تؤكد المطابقة

4. **الصيانة والاختبار الدوري**:
   - كواشف الدخان يجب أن تُنظف شهرياً
   - يجب إجراء اختبار عملي شامل سنوياً على الأقل
   - يجب استبدال كواشف الدخان كل 10 سنوات (حتى لو كانت تعمل)

5. **الاستثناءات المهمة**:
   - المباني المرشوشة بالكامل قد تكون معفية من بعض متطلبات الإنذار اليدوي
   - المجموعة R-3 (المنازل والفلل) قد تكون معفية في بعض الحالات
   - بعض الأماكن الخاصة (مثل المطابخ) قد تحتاج كواشف حرارة بدلاً من دخان

6. **التوافقية والعزلة الكهربائية**: 
   - كواشف الدخان ثنائية السلك قد تكون لها مشاكل توافقية مع وحدات التحكم الرئيسية
   - يجب التأكد من اختبار التوافقية من قبل مخبر معتمد

7. **الاتصال بمحطات الإطفاء**:
   - يجب أن تكون هناك وسيلة لنقل إشارة الإنذار إلى محطة الإطفاء
   - قد يكون هذا عبر خط مباشر أو عبر مركز مراقبة تابع لطرف ثالث
   - يجب توثيق أرقام الهواتف والاتصالات

## 📊 حالة التوليف / Synthesis Status

- **التطبيق**: 
  - **مطلوب إنذار يدوي**: في المجموعات A (300+ أشخاص)، B (500+ إجمالي)، E (50+ أشخاص)، و جميع المجموعات الأخرى حسب جداول محددة
  - **مطلوب كشف تلقائي**: في ممرات الخروج، الوحدات السكنية، الأماكن ذات المخاطر العالية
  - **مطلوب في كل الحالات**: في المجموعات H، I، والأتريوم، والمراحل العميقة

- **المتغيرات المُشغِّلة**: 
  - نوع مجموعة الإشغال (Occupancy Group)
  - عدد الشاغلين أو حمولة الإشغال المحسوبة
  - ارتفاع المبنى وعمق الطوابق السفلية
  - وجود نظام رش تلقائي (قد يقلل من بعض المتطلبات)
  - وجود أشخاص ذوي احتياجات خاصة

- **الآثار اللاحقة**: 
  - يؤثر على متطلبات الكهرباء والطاقة الاحتياطية (القسم 1203)
  - يتطلب توجيهاً للموظفين والشاغلين حول سياسات الإنذار
  - يؤثر على تصميم الممرات والمخارج (يجب أن تكون مسارات الإنذار واضحة)
  - قد يؤثر على متطلبات السلامة الأخرى مثل أنظمة الدعوة الحمراء (Emergency Phones)

*المصدر: SBC 801-CC-2024, Chapter 9, Section 907*
