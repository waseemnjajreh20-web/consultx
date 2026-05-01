---
record_id: sbc-801-section-1011
code_family: SBC 801
edition: '2024'
section_id: '1011'
page_type: section
authority_level: STRUCTURED_FACT
status: PARTIAL_STRUCTURED
source_files:
  - "SBC 801 - Part 6.pdf"
source_pages: "pp. 736–780"
dependencies:
  - section: '1006'
    reason: "عدد المخارج يُحدِّد عدد السلالم المطلوبة"
  - section: '1004'
    reason: "حمولة الشاغلين تُحدِّد عرض السلم"
  - section: '1023'
    reason: "سلالم المخارج تخضع لمتطلبات إضافية"
tags: [egress, ch10, stairways, stairs, treads, risers, handrails]
related_sections: [1006, 1010, 1012, 1014, 1015, 1019, 1023]
last_reviewed: '2026-04-14'
---
# Section 1011 — Stairways
# القسم 1011 — السلالم

## 📋 نص الكود الحرفي / Canonical Code Text
> **[CANONICAL_SOURCE — SBC 801-2024, Section 1011.1–1011.3, pp. 736–780]**

**SECTION 1011 STAIRWAYS**

**1011.1 General.** Stairways serving as means of egress shall be constructed in accordance with the provisions of this section. Open stairways complying with Section 1011 are permitted as exit access stairways. Stairways serving as exits shall comply with Section 1023.

**1011.2 Width of stairways.** The width of stairways shall be sufficient for the occupant load served. The minimum clear width of stairways, measured between handrails, at and below the handrail height shall be not less than the following:

| Stairway Type | Minimum Clear Width |
|---------------|-------------------|
| General (All occupancies) | 1100 mm |
| Accessible route in Group I-1, I-2, I-3, I-4 | 1200 mm |
| Emergency vertical exit system (exterior stairway) | 1200 mm |

**1011.3 Stair treads and risers.** The rise of each step shall be not less than 100 mm and not more than 180 mm. The tread depth shall be not less than 300 mm measured horizontally between the face of risers, exclusive of nosings. The tread depth shall be uniform throughout the flight.

| Dimension | Minimum | Maximum | Units |
|-----------|---------|---------|-------|
| Riser Height (R) | 100 mm | 180 mm | mm |
| Tread Depth (T) | 300 mm | — | mm |
| Run uniformity | ±6.35 mm | max variation | mm |
| Rise uniformity | ±6.35 mm | max variation | mm |

**Nosing Requirements:**
- Horizontal projection of nosing: 25–50 mm
- Underside slope: ≤ 1:2 (45 degrees)
- Nosing edges: beveled or sloped (no sharp corners)

**1011.4 Handrails.** Handrails shall be provided on at least one side of each stairway and, where the stairway has a width of more than 2200 mm, shall be provided on both sides. Handrails shall comply with Section 1014.

**1011.5 Change in elevation.** A flight of stairs shall comprise a series of steps with a minimum of three risers. A single step shall be located in an exit access or exit passageway and shall comply with the exceptions in Section 1005.2.

**1011.6 Stairway landings.** Stairway landings shall have a depth of not less than 1200 mm measured in the direction of travel. Stairway landings shall be not more than 500 mm higher or lower than the adjacent floor or landing.

**1011.7 Circular stairways.** Circular stairways and spiral stairways shall have a minimum of four occupants and the stairways shall be used only for one story or split story. Tread depth at the intersection with the inside railing shall not be less than 150 mm.

## 💡 التعليق الهندسي / Engineering Commentary

السلالم هي **العنصر الأساسي** الرأسي في منظومة الإخلاء. بناء السلم بشكل صحيح يعني إمكانية إخلاء المبنى بأمان حتى في ظروف الظلام والفزع.

**الحكمة الهندسية:**

### 1. الأبعاد القياسية (Rise & Tread)
السلم الآمن يتبع نسبة معروفة:
- **قانون الحركة**: 2R + T = 600–650 مم (يضمن خطوة طبيعية)
- مثال: R = 150 مم، T = 350 مم → 2(150) + 350 = 650 ✓
- مثال: R = 180 مم، T = 250 مم → 2(180) + 250 = 610 ✓
- مثال: R = 200 مم، T = 250 مم → 2(200) + 250 = 650 ✓

### 2. الانتظام (Uniformity ±6.35 مم)
- عقل الإنسان يتعلم أول درجتين
- إذا كانت الدرجة 3 مختلفة → سقوط محقق
- بخاصة أثناء الفزع والظلام (الناس تهرع بسرعة)
- الفارق 6.35 مم = حد أدنى يقبله الجسم دون سقوط

### 3. العرض الأدنى (1100 مم أو 1200 مم)
- عرض 1100 مم = شخصان يمران بجانب بعضهما (صعب لكن ممكن)
- مجموعات كبيرة = تحتاج أبواب متعددة أو سلالم أوسع
- Group I-2 = 1200 مم (حاجز كرسي متحرك/سرير طبي)

### 4. الهبوط (Landing Depth = 1200 مم)
- فرصة للراحة والتنفس (خاصة المسنين والأطفال)
- فرصة للتوقف والاستدارة
- منع الاندفاع المتسلسل من أسفل

### 5. الدرجات الحلزونية (Spiral Stairs) — محدودة جداً
- لا تسمح بـ wheelchairs أو stretchers
- تحتاج ≥ 150 مم عمق عند الجدار الداخلي
- محدودة على طابق واحد أو "split story" واحد

## ⚙️ المتطلبات التقنية / Technical Requirements

### جدول أبعاد السلالم المسموحة

```
الحد الأدنى للارتفاع (Rise) = 100 مم
الحد الأقصى للارتفاع (Rise) = 180 مم
الحد الأدنى للعمق (Tread) = 300 مم

أمثلة منطقية:
R = 100 + T = 400 → 2(100) + 400 = 600 ✓
R = 120 + T = 380 → 2(120) + 380 = 620 ✓
R = 150 + T = 350 → 2(150) + 350 = 650 ✓
R = 180 + T = 300 → 2(180) + 300 = 660 ✓
```

### حساب عدد الدرجات المطلوبة

**الصيغة**:
```
عدد الارتفاعات = الارتفاع الكلي ÷ ارتفاع الدرجة
الارتفاع الكلي = ارتفاع الطابق + سمك الأرضية

مثال: 
- ارتفاع الطابق: 3500 مم
- سمك الأرضية الثانية: 500 مم
- الارتفاع الكلي = 3500 + 500 = 4000 مم

مع R = 150 مم:
- عدد الارتفاعات = 4000 ÷ 150 = 26.67 → 27 درجة
- عدد الدرجات (Treads) = 27 - 1 = 26 درجة (الأخيرة هبوط الهبوط)
```

### متطلبات الهبوط (Landing)

| متطلب | القيمة | الملاحظات |
|-------|--------|-----------|
| عمق الهبوط | ≥ 1200 مم | في اتجاه السفر |
| أقل من 3 درجات | **لا يسمح** | يجب ≥ 3 درجات في الرحلة |
| فرق الارتفاع | ≤ 500 مم | بين الهبوط والأرضية المجاورة |
| درجة واحدة | مسموحة **فقط** | في exit access (Section 1005.2 exceptions) |

### تصميم الدرج الحلزوني (Spiral Stairway)

**متطلبات خاصة**:
- عمق التدرج عند الرail الداخلي = ≥ 150 مم
- **محدود لـ 4 أشخاص فقط** كحد أقصى!
- لا يمكن أن يخدم أكثر من طابق واحد
- لا يمكن استخدامه كـ exit (خروج طارئ) بل exit access فقط

## 🔗 الأقسام المرتبطة / Cross-References

- [[sbc-801-section-1006]] — **Number of Exits**: حمولة = عدد السلالم المطلوبة
- [[sbc-801-section-1010]] — **Doors**: الأبواب في قمة/أسفل السلم = 800 مم
- [[sbc-801-section-1012]] — **Ramps**: بديل السلالم (منحدرات) للمسار الرئيسي
- [[sbc-801-section-1014]] — **Handrails**: قضبان اليد = ارتفاع 840–1050 مم
- [[sbc-801-section-1015]] — **Guards**: درابزينات واقية على جانبي السلم
- [[sbc-801-section-1019]] — **Exit Access Stairways**: سلالم مفتوحة (قد لا تحتاج إغلاق)
- [[sbc-801-section-1023]] — **Exit Stairways**: سلالم الخروج النهائية (يجب إغلاقها بـ fire rating)
- [[sbc-201-section-405]] — **Accessible Routes**: متطلبات WCAG للسلالم المتاحة

## ⚠️ نقاط الانتباه الهندسي / Engineering Watch Points

### 1. الخطأ الشائع: تجاهل معايير Uniformity

❌ **خطأ**: "درج بارتفاعات متفاوتة = طالما الكل بين 100-180 مم"
✓ **صحيح**: **كل الدرجات يجب أن تكون موحدة ±6.35 مم**
- السقوط يحدث عند التغيير المفاجئ (خاصة الدرجة الأخيرة!)

### 2. حساب الارتفاع الكلي

❌ **خطأ**: "الطابق 3.5 متر → 3500 ÷ 150 = 23 درجة"
✓ **صحيح**: أضف سمك الأرضية العلوية:
- 3500 + 500 = 4000 مم كلي
- 4000 ÷ 150 = 26.67 → 27 ارتفاع → 26 درجة

### 3. عمق التدرج (Tread Depth)

❌ **خطأ**: "عمق 250 مم = كافي" (أقل من الحد الأدنى)
✓ **صحيح**: ≥ 300 مم على الأقل

### 4. الدرجات الحلزونية — محدودة جداً

❌ **خطأ**: "استخدام درج حلزوني للمخرج الرئيسي لـ 100 شخص"
✓ **صحيح**: 
- حد أقصى 4 أشخاص = لا تستخدم للإخلاء السريعة
- حد أقصى طابق واحد = لا يصل من الطابق 3 إلى الأرض

### 5. الدرجات المفردة (Single Step)

❌ **خطأ**: "درجة واحدة قريبة من الحائط = تحذير كافي"
✓ **صحيح**: درجات مفردة:
- محظورة في معظم مسارات الإخلاء
- استثناء **فقط** في exit access ضيقة (Section 1005.2)
- يجب أن تكون مضاءة وملحوظة بوضوح

### 6. الهبوط غير الكافي

❌ **خطأ**: "هبوط 800 مم = نزول مباشرة للباب"
✓ **صحيح**: ≥ 1200 مم = مسافة آمنة للفتح

### 7. فرق الارتفاع (Step Off Height)

❌ **خطأ**: "الهبوط 1000 مم فوق الأرضية = لا مشكلة"
✓ **صحيح**: ≤ 500 مم فقط = تجنب السقوط من ارتفاع خطير

## 📊 حالة التوليف / Synthesis Status

### متى يُطبَّق هذا القسم

1. **في التصميم**: حساب عدد الدرجات لكل ارتفاع طابق
2. **للتحقق**: قياس كل درجة (R و T) والتأكد من uniformity
3. **للصيانة**: هل الدرجات نظيفة وآمنة وموضحة بألوان التباين؟

### المتغيرات المُفعِّلة

- **ارتفاع الطابق** (من المخطط المعماري): يحدد عدد الدرجات
- **عرض المبنى** (حمولة من Section 1006): يحدد عدد السلالم المطلوبة
- **نوع الاستخدام** (Occupancy):
  - Group I-2 = 1200 مم (أسرة/كراسي متحركة)
  - غيره = 1100 مم
- **Handrail Placement** (Section 1014): يؤثر على العرض الفعلي

### الآثار اللاحقة

- **Section 1023** (Exit Stairways): إذا كانت السلم = exit → يجب تعليق النار
- **Section 1010** (Doors): الأبواب على مدخل/مخرج السلم = 800 مم
- **Section 1015** (Guards): درابزينات على الجانبين إذا كان height > 1.1 متر
- **Section 1019** (Exit Access Stairways): سلالم مفتوحة ← متطلبات أقل صرامة
- **Maintenance & Operations**: الإضاءة، التنظيف، الإشارات

---

**مثال تطبيقي:**

```
مبنى تجاري 5 طوابق — تصميم السلم

الطابق الأول → الثاني:
- ارتفاع الطابق: 3600 مم
- سمك الأرضية الثانية: 400 مم
- الارتفاع الكلي: 4000 مم

الاختيار: R = 160 مم، T = 330 مم
- التحقق: 2(160) + 330 = 650 ✓
- عدد الارتفاعات: 4000 ÷ 160 = 25 ارتفاع
- عدد الدرجات: 24 درجة (الـ 25 = الهبوط)

متطلبات إضافية:
- عرض ≥ 1100 مم (أو 1200 مم إذا Group I-2)
- handrail على الأقل جانب واحد ← ارتفاع 840–1050 مم
- هبوط ≥ 1200 مم في القمة والقاع
- guard (درابزين) ≥ 1050 مم ارتفاع على الجانبين المفتوحة
```
