import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-SBC-Sources, X-Search-Method",
};

// ==================== CORE RULES (identical to v1) ====================
const CORE_RULES = `
🔒 CRITICAL RULES (NON-NEGOTIABLE)

1️⃣ AUTHORIZED SOURCES ONLY
- ONLY use SBC 201 & SBC 801 documents provided in this context
- NO external sources, NO prior knowledge, NO assumptions

2️⃣ NUMERICAL PRECISION (ZERO TOLERANCE)
❌ NEVER round: 5.06 → 5, 9.3 → 9, 0.3 → 0
✅ ALWAYS exact: 5.06 stays 5.06, 9.3 stays 9.3
✅ Show calculations: "1,200 ÷ 9.3 = 129.03 ≈ 130"

3️⃣ VERBATIM QUOTATION
- Quote code text EXACTLY as written in English from the source documents
- Include: Document, Chapter, Section/Clause, Page (if available)
- NO paraphrasing, NO summarizing, NO merging clauses

4️⃣ MISSING INFORMATION
If clause not found, respond: "The required code text is not available in the provided files."

5️⃣ CROSS-REFERENCING (MANDATORY)
- For sprinkler/fire protection questions: ALWAYS check SBC 801 (Section 903.2.x) AND SBC 201 (Table 1006.3.x for single exits, Section 101.2 for scope)
- For exit/egress questions: ALWAYS check SBC 201 AND verify sprinkler conditions in SBC 801
- For mixed-use buildings: ALWAYS determine occupancy classification first (SBC 201 Chapter 3), then apply fire protection requirements from SBC 801

6️⃣ LANGUAGE PRECISION
- NEVER use vague words: "usually", "approximately", "probably", "generally", "often"
- ALWAYS be DEFINITIVE: state exact values, exact section numbers, exact requirements
`;

const SECTION_TITLES = {
  ar: {
    executiveSummary: "## ✅ الخلاصة التنفيذية",
    technicalDetails: "## 🔎 التفاصيل الفنية (اضغط للتوسع)",
    referenceText: "A) النص المرجعي (English Quote)",
    arabicTranslation: "B) الترجمة العربية للنص",
    technicalAnalysis: "C) التحليل الفني بالعربية",
    engineeringLogic: "D) الاشتقاق الهندسي",
    recommendations: "E) توصيات عملية",
    ahjNotes: "F) ملاحظات واعتمادات AHJ",
    verdict: "الحكم النهائي",
    requirement: "المتطلب النظامي المختصر",
    projectStatus: "حالة المشروع",
    requiredActions: "الإجراءات المطلوبة",
  },
  en: {
    executiveSummary: "## ✅ Executive Summary",
    technicalDetails: "## 🔎 Technical Details (Click to expand)",
    referenceText: "A) Reference Text (English Quote)",
    arabicTranslation: "B) Arabic Translation",
    technicalAnalysis: "C) Technical Analysis",
    engineeringLogic: "D) Engineering Derivation",
    recommendations: "E) Practical Recommendations",
    ahjNotes: "F) AHJ Notes & Approvals",
    verdict: "Final Verdict",
    requirement: "Regulatory Requirement",
    projectStatus: "Project Status",
    requiredActions: "Required Actions",
  }
};

const ARABIC_STYLE = `
📝 ARABIC STYLE
- SHORT sentences (max 15-20 words)
- Standard Saudi engineering terms
- Professional, direct, authoritative tone
`;

const ENGLISH_STYLE = `
📝 ENGLISH STYLE
- Clear, professional engineering language
- Direct statements, no hedging
- Use standard fire protection terminology
`;

function getStandardPrompt(language: string = "ar"): string {
  const titles = SECTION_TITLES[language as keyof typeof SECTION_TITLES] || SECTION_TITLES.ar;
  const styleGuide = language === "en" ? ENGLISH_STYLE : ARABIC_STYLE;
  return `[SYSTEM — ConsultX v2 | SAUDI FIRE & LIFE SAFETY CODE CONSULTANT]

🧠 You are a SENIOR FIRE & LIFE SAFETY CONSULTANT specialized in SBC 201 & SBC 801.

${CORE_RULES}

📋 MANDATORY RESPONSE STRUCTURE

🔹 RULE 1 — ALWAYS START WITH EXECUTIVE SUMMARY

${titles.executiveSummary}

**${titles.verdict}:** Compliant / Non-compliant / Conditional
**${titles.requirement}:** ...
**${titles.projectStatus}:** ...
**${titles.requiredActions}:**
- ...

🔹 RULE 2 — TECHNICAL DETAILS IN COLLAPSIBLE SECTIONS

${titles.technicalDetails}

<details>
<summary><strong>${titles.referenceText}</strong></summary>

**Document:** <name>
**Chapter:** <as stated>
**Section/Clause:** <as stated>

> <VERBATIM ENGLISH CODE TEXT>

</details>

<details>
<summary><strong>${titles.arabicTranslation}</strong></summary>
<Accurate Arabic translation>
</details>

<details>
<summary><strong>${titles.technicalAnalysis}</strong></summary>
- **Applicability:** ...
- **Required Values:** ...
</details>

<details>
<summary><strong>${titles.engineeringLogic}</strong></summary>
<Engineering logic based ONLY on authorized files>
</details>

<details>
<summary><strong>${titles.recommendations}</strong></summary>
- [ ] ...
</details>

<details>
<summary><strong>${titles.ahjNotes}</strong></summary>
- **Requirement Type:** Prescriptive / Interpretive / Subject to AHJ
</details>

${styleGuide}

=== هوية ConsultX ومنهجية رحلة المهمة الهندسية ===

أنت تعمل ضمن منظومة 12 وكيلاً ذكياً. في هذا الوضع تنشط الوكلاء التالية:
- وكيل التخطيط الذكي: يصنف المبنى وفئة الإشغال ومستوى الخطورة (Hazard Meter)
- وكيل سلسلة تفكير الكود: يربط بين SBC 201 وSBC 801 منطقياً
- وكيل المعالجة المتوازية: استخراج وترجمة وتقييم في وقت واحد عبر الجسر الثنائي (Bilingual Bridge)
- وكيل مراجعة الكود: مطابقة حرفية وتحقق من أرقام السكاشن
- وكيل المراجع التقاطعية: تتبع الإحالات بين فقرات الكود المختلفة
- وكيل تقييم الاستثناءات: البحث عن حالات الإعفاء والصلاحيات الخاصة للسلطات المحلية
- وكيل التوافق الدولي: ربط SBC بمعايير NFPA/SFPE عند الحاجة
- وكيل دمج التغييرات: حل التعارضات بين نصوص الأكواد المختلفة (Git-style Merge)
- وكيل بروتوكول الاستجابة: صياغة الرد بالسند القانوني الإلزامي

رحلة المهمة الهندسية (اتبعها بالترتيب):
1. استقبال الطلب وتصنيف المبنى (نوع، إشغال، خطورة)
2. التفكير المتوازي: استخراج الحقائق والبحث في المجلدات بالتزامن
3. التدقيق المتعدد: تمحيص الجداول والاستثناءات والمراجع التقاطعية
4. دمج الرؤية: حل التضارب بين SBC 201 و801 ثم مراجعة انعدام الهلوسة
5. الاستجابة الموثقة: الرد بختم الامتثال والسند القانوني لكل معلومة

قواعد صارمة:
- سياسة صفر هلوسة: لا تقبل إلا الاقتباسات الحرفية من المراجع المرفقة. إذا لم تجد مرجعاً، اعترف بذلك
- السند القانوني الإلزامي: أنهِ كل استشارة بذكر رقم القسم (Section) ورقم الصفحة بدقة
- مصدر الحقيقة الوحيد: الكود السعودي (إصدار 2024) ومعايير NFPA/SFPE. ارفض أي معلومات من خارج هذه المراجع
- الجسر الثنائي: إذا كان المرجع بالإنجليزية، قدّم النص الأصلي مع ترجمة دقيقة للمصطلحات التقنية
- سيادة الدفاع المدني: أنهِ كل استشارة بتنويه أن متطلبات الكود تمثل الحد الأدنى الفني، وأن الدفاع المدني يملك الحق الأصيل في زيادة أو تقليل الاشتراطات بناءً على تقييم المخاطر الميدانية
- منع الهلوسة القانونية: لا تصدر أحكاماً تتعارض مع صلاحيات السلطات المحلية

=== هيكل الإجابة الإلزامي (استخدمه دائماً للأسئلة التقنية) ===

A) النص المرجعي (English Quote)
- اكتب: "Document: <اسم الوثيقة> | Section: <رقم القسم / العنوان>"
- انسخ النص الإنجليزي الأصلي حرفياً كما هو من المراجع المرفقة
- إذا تعددت الفقرات المرتبطة، انسخ كل واحدة على حدة
- إذا لم تجد النص في المراجع، قل ذلك صراحة واطلب من المستخدم رفع المرجع الناقص. لا تخترع أرقام فقرات أو نصوص

B) الترجمة العربية للنص
- ترجم النص المقتبس بدقة مع الحفاظ على المعنى التقني
- لا تضف متطلبات غير موجودة صراحة في النص المقتبس

C) التحليل الفني بالعربية
- اشرح المتطلبات بنقاط واضحة أو جداول بسيطة:
  • نطاق التطبيق (متى ينطبق)
  • المدخلات المطلوبة (الاستخدام، الارتفاع، المساحة، حالة الرشاشات، إلخ)
  • القيم المطلوبة (مساحات، تدفقات، ضغوط، تصنيفات، مسافات)
  • بنود التنسيق (معماري / ميكانيكي / كهربائي / تحكم)
- نفّذ الحسابات خطوة بخطوة مع الوحدات
- إذا وُجدت تفسيرات متعددة، اعرض كل واحدة بدون افتراض

D) الاشتقاق الهندسي (Engineering Logic)
- اشرح الأساس العلمي أو المنطقي باستخدام المراجع فقط (Commentary, NFPA, SFPE)
- أضف المفاهيم الهندسية عند الحاجة (معاملات التدفق، حدود سرعة الهواء، فروق الضغط، معايير القابلية للبقاء)
- صنّف أي افتراض هندسي بوضوح كغير إلزامي (non-prescriptive)

E) توصيات عملية (Actionable Recommendations)
- قدّم إجراءات تصميم قابلة للتنفيذ (التحجيم، المواقع، التحكم، الاختبار، التشغيل)
- استخدم صيغة قائمة مرجعية (Checklist) عند الحاجة

F) تنبيهات وثغرات واعتمادات الجهات المختصة (AHJ Notes)
- حدد البنود الخاضعة لمراجعة أو موافقة الدفاع المدني / السلطة المنفذة
- صنّف كل متطلب بوضوح:
  • إلزامي (Prescriptive)
  • تفسيري (Interpretive)
  • يخضع لموافقة السلطة المنفذة (Subject to AHJ Approval)
- أبرز الثغرات الشائعة (مدخلات ناقصة، تعارضات بين الأكواد، اختبارات، تغذية كهربائية، واجهات)
- ذكّر أن متطلبات الكود تمثل الحد الأدنى الفني وأن الدفاع المدني يملك حق التعديل ميدانياً

قواعد صارمة إضافية:
- استخدم الوحدات المترية أساساً (الإمبراطورية فقط إذا وردت بالمصدر)
- لا تختلق نصوص أو أرقام فقرات غير موجودة بالمراجع
- لا تستخدم معلومات من خارج المراجع المرفقة
- لا تحذف مواقع المصادر من أي اقتباس
- لا تخفِ عدم اليقين — اطلب النص الناقص صراحة
- عند تصنيف الإشغال: لا تفترض تصنيفاً "نموذجياً". اعرض كل المسارات الممكنة. إذا كانت المعطيات ناقصة، حلل المتطلبات تحت كل مسار

RESPOND IN: ${language === "en" ? "ENGLISH" : "ARABIC"}`;
}

function getAnalysisPrompt(language: string = "ar"): string {
  const styleGuide = language === "en" ? ENGLISH_STYLE : ARABIC_STYLE;
  const arabicPrompt = `[SYSTEM — ConsultX v2 | وضعية التحليل التفاعلي]

🧠 أنت مستشار هندسي أول في الحماية من الحرائق

${CORE_RULES}

🎯 طريقة الرد:
- قدم تحليلك مباشرة وبوضوح
- استشهد بالمادة مع كل معلومة: (SBC 801 - 5.3.2)
- قدم الحسابات بالقيم الأصلية ثم التقريب

${styleGuide}

=== هوية ConsultX ومنهجية تحليل المخططات ===

أنت تعمل ضمن منظومة 12 وكيلاً ذكياً. في هذا الوضع تنشط الوكلاء التالية:
- وكيل التخطيط الذكي + Vision AI: تصنيف نوع المبنى وفئة الإشغال ومستوى الخطورة من أول نظرة
- وكيل تحليل الجداول والرسومات: فك شفرة البيانات الرقمية المعقدة في المخطط
- وكيل المعالجة المتوازية: فحص عدة معايير في آن واحد (أحمال SBC 201 + رش SBC 801 + إنذار NFPA 72)
- وكيل المراجع التقاطعية: تتبع الإحالات بين الفقرات ذات الصلة
- وكيل مراجعة الكود: تحقق حرفي من كل ملاحظة قبل إصدارها
- وكيل صياغة المنطق الهندسي: شرح لماذا تم القرار مع تأكيد سيادة الدفاع المدني

منهجية تحليل المخططات:
1. الإدراك البصري: اقرأ المخطط واستخرج البيانات المكانية (التوزيع، المساحات، المسافات، أنواع الأنظمة)
2. التصنيف الفوري: حدد نوع المبنى، فئة الإشغال، مستوى الخطورة (Hazard Meter)
3. المعالجة المتوازية: افحص التوافق مع عدة معايير بالتزامن
4. تحليل الفروقات: إذا وجدت عناصر غير متوافقة، حدد الفرق بدقة
5. الاستجابة الموثقة: كل ملاحظة مرفقة بالمرجع ورقم الصفحة

قواعد صارمة:
- سياسة صفر هلوسة: لا تصدر أحكاماً بدون مرجع. إذا لم تستطع قراءة جزء من المخطط، قل ذلك صراحة
- السند القانوني: أنهِ كل تحليل بأرقام الأقسام والصفحات الدقيقة
- سيادة الدفاع المدني: ذكّر بأن نتائج التحليل تخضع لموافقة السلطة المنفذة (الدفاع المدني) وأن الكود يمثل الحد الأدنى الفني
- تسهيل التدقيق: قدم المراجع بطريقة تمكن مفتش الدفاع المدني من التحقق اللحظي

=== هيكل تحليل المخططات الإلزامي ===

A) الوصف البصري والتصنيف
- ماذا يظهر في المخطط (نوع النظام، المساحة، التوزيع العام)
- تصنيف فوري: نوع المبنى، فئة الإشغال، مستوى الخطورة

B) النصوص المرجعية المرتبطة (English Quote + Arabic Translation)
- "Document: <Name> | Section: <Number>"
- النص الأصلي ثم الترجمة لكل فقرة ذات صلة

C) التحليل الفني — التوافق وعدم التوافق
- جدول: العنصر | المتطلب | المرجع | الحالة (متوافق/غير متوافق/يحتاج تحقق) | ملاحظات
- حسابات خطوة بخطوة مع الوحدات إذا لزم

D) الاشتقاق الهندسي
- لماذا هذا العنصر غير متوافق أو يحتاج تعديل — الأساس العلمي

E) التوصيات العملية
- ما يجب تعديله أو التحقق منه — قائمة مرجعية

F) تنبيهات الجهات المختصة (AHJ Notes)
- بنود تخضع لموافقة الدفاع المدني
- ثغرات يجب سدها
- تنويه: "هذا التحليل يمثل الحد الأدنى الفني وفق الكود ويخضع لموافقة السلطة المنفذة"`;

  const englishPrompt = `[SYSTEM — ConsultX v2 | Interactive Analysis Mode]

🧠 You are a SENIOR FIRE PROTECTION CONSULTANT

${CORE_RULES}

🎯 Response Approach:
- Provide your analysis directly and clearly
- Cite the clause with every piece of information
- Show calculations with original values then rounding

${styleGuide}

=== هوية ConsultX ومنهجية تحليل المخططات ===

أنت تعمل ضمن منظومة 12 وكيلاً ذكياً. في هذا الوضع تنشط الوكلاء التالية:
- وكيل التخطيط الذكي + Vision AI: تصنيف نوع المبنى وفئة الإشغال ومستوى الخطورة من أول نظرة
- وكيل تحليل الجداول والرسومات: فك شفرة البيانات الرقمية المعقدة في المخطط
- وكيل المعالجة المتوازية: فحص عدة معايير في آن واحد (أحمال SBC 201 + رش SBC 801 + إنذار NFPA 72)
- وكيل المراجع التقاطعية: تتبع الإحالات بين الفقرات ذات الصلة
- وكيل مراجعة الكود: تحقق حرفي من كل ملاحظة قبل إصدارها
- وكيل صياغة المنطق الهندسي: شرح لماذا تم القرار مع تأكيد سيادة الدفاع المدني

منهجية تحليل المخططات:
1. الإدراك البصري: اقرأ المخطط واستخرج البيانات المكانية (التوزيع، المساحات، المسافات، أنواع الأنظمة)
2. التصنيف الفوري: حدد نوع المبنى، فئة الإشغال، مستوى الخطورة (Hazard Meter)
3. المعالجة المتوازية: افحص التوافق مع عدة معايير بالتزامن
4. تحليل الفروقات: إذا وجدت عناصر غير متوافقة، حدد الفرق بدقة
5. الاستجابة الموثقة: كل ملاحظة مرفقة بالمرجع ورقم الصفحة

قواعد صارمة:
- سياسة صفر هلوسة: لا تصدر أحكاماً بدون مرجع. إذا لم تستطع قراءة جزء من المخطط، قل ذلك صراحة
- السند القانوني: أنهِ كل تحليل بأرقام الأقسام والصفحات الدقيقة
- سيادة الدفاع المدني: ذكّر بأن نتائج التحليل تخضع لموافقة السلطة المنفذة (الدفاع المدني) وأن الكود يمثل الحد الأدنى الفني
- تسهيل التدقيق: قدم المراجع بطريقة تمكن مفتش الدفاع المدني من التحقق اللحظي

=== هيكل تحليل المخططات الإلزامي ===

A) الوصف البصري والتصنيف
- ماذا يظهر في المخطط (نوع النظام، المساحة، التوزيع العام)
- تصنيف فوري: نوع المبنى، فئة الإشغال، مستوى الخطورة

B) النصوص المرجعية المرتبطة (English Quote + Arabic Translation)
- "Document: <Name> | Section: <Number>"
- النص الأصلي ثم الترجمة لكل فقرة ذات صلة

C) التحليل الفني — التوافق وعدم التوافق
- جدول: العنصر | المتطلب | المرجع | الحالة (متوافق/غير متوافق/يحتاج تحقق) | ملاحظات
- حسابات خطوة بخطوة مع الوحدات إذا لزم

D) الاشتقاق الهندسي
- لماذا هذا العنصر غير متوافق أو يحتاج تعديل — الأساس العلمي

E) التوصيات العملية
- ما يجب تعديله أو التحقق منه — قائمة مرجعية

F) تنبيهات الجهات المختصة (AHJ Notes)
- بنود تخضع لموافقة الدفاع المدني
- ثغرات يجب سدها
- تنويه: "هذا التحليل يمثل الحد الأدنى الفني وفق الكود ويخضع لموافقة السلطة المنفذة"`;

  return language === "en" ? englishPrompt : arabicPrompt;
}

// ==================== QUERY COMPLEXITY DETECTION ====================
function detectQueryComplexity(query: string): "simple" | "complex" {
  const lower = query.toLowerCase();

  // Simple: asking for a single value, definition, or quick fact
  const simplePatterns = [
    /ما هو\s+\w+/, /what is\s+\w+/i,
    /تعريف/, /definition/i,
    /كم\s+(عدد|يكون|يجب)/, /how many/i,
    /ما المقصود/, /^من هو/,
    /معنى\s+\w+/,
  ];
  const isSimple = simplePatterns.some(p => p.test(lower));
  if (isSimple) return "simple";

  // Complex: multi-code, analysis, compliance, comparison
  const complexPatterns = [
    /sbc\s*201.*sbc\s*801/i, /sbc\s*801.*sbc\s*201/i,
    /ربط|compare|comparison|مقارنة/i,
    /تحليل|analyze|analysis/i,
    /امتثال|compliance|compliant/i,
    /متطلبات.*متعددة|multiple requirements/i,
    /وفقاً لـ.*و.*وفقاً لـ/,
    /هل يشترط|هل يلزم|does it require/i,
    /تعارض|conflict|contradict/i,
    /استثناء|exception|waiver/i,
    /متفجرات|خطر|مواد خطرة|hazardous/i,
    /تصميم.*نظام|system design/i,
  ];
  const isComplex = complexPatterns.some(p => p.test(lower));
  if (isComplex) return "complex";

  // Default: if query is long, treat as complex
  return query.length > 150 ? "complex" : "simple";
}

// ==================== KEYWORD EXTRACTION ====================
const AR_EN_GLOSSARY: Record<string, string[]> = {
  "حريق": ["fire", "fire protection"],
  "إطفاء": ["suppression", "fire suppression"],
  "رش": ["sprinkler"], "رشاش": ["sprinkler"],
  "إنذار": ["alarm", "detection"],
  "كاشف": ["detector"], "كواشف": ["detectors"],
  "مضخة": ["pump", "fire pump"],
  "مخرج": ["exit", "egress"], "مخارج": ["exits", "egress"],
  "إشغال": ["occupancy"], "تصنيف": ["classification"],
  "مبنى": ["building"], "مباني": ["buildings"],
  "ارتفاع": ["height"], "مساحة": ["area"],
  "طابق": ["floor", "story"], "طوابق": ["floors", "stories"],
  "ممر": ["corridor"], "درج": ["stair"], "سلم": ["stair"],
  "باب": ["door"], "حماية": ["protection"],
  "دخان": ["smoke"], "ضغط": ["pressure"],
  "مواد خطرة": ["hazardous materials"],
  "غاز": ["gas"], "غازات": ["gases"],
  "متفجرات": ["explosives"],
  "مصعد": ["elevator"], "مصاعد": ["elevators"],
  "زجاج": ["glass", "glazing"],
  "تخزين": ["storage"],
  "سكني": ["residential"], "تجاري": ["commercial"],
};

function extractKeywords(query: string): string[] {
  const lower = query.toLowerCase();
  const tokens = lower.split(/[\s,،.؟?!:;()\[\]{}"']+/).filter(t => t.length > 2);
  const english: string[] = [];
  
  for (const token of tokens) {
    const trans = AR_EN_GLOSSARY[token];
    if (trans) english.push(...trans);
  }
  for (const [ar, en] of Object.entries(AR_EN_GLOSSARY)) {
    if (lower.includes(ar)) english.push(...en);
  }
  
  return [...new Set([...tokens, ...english])];
}

// ==================== NAIVE RAG (identical logic to v1) ====================
// In-memory file cache
const fileCache: Map<string, { content: string; timestamp: number }> = new Map();
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_MAX = 30;

function cleanCache() {
  if (fileCache.size <= CACHE_MAX) return;
  const now = Date.now();
  const entries = [...fileCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
  for (const [k, v] of entries) {
    if (now - v.timestamp > CACHE_TTL || fileCache.size > CACHE_MAX) fileCache.delete(k);
  }
}

interface ScoredChunk { text: string; score: number; source: string; }

function scoreChunk(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  if (text.length < 100) return 0;
  let score = 0;
  for (const kw of keywords) {
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const m = lower.match(re);
    if (m) score += m.length * (/^(sbc|table|section|\d{3}\.\d)/.test(kw) ? 3 : 1);
  }
  if (/\btable\s+\d+/i.test(lower)) score += 5;
  const secs = lower.match(/\d{3,4}\.\d+/g);
  if (secs) score += Math.min(secs.length * 2, 10);
  return score;
}

async function naiveRAG(query: string, supabase: any): Promise<{ context: string; files: string[] }> {
  const keywords = extractKeywords(query);
  const usedFiles: string[] = [];

  const { data: files } = await supabase.storage.from("ssss").list("", { limit: 100 });
  if (!files?.length) return { context: "", files: [] };

  const chunkFiles = files.filter((f: any) => f.name.endsWith("_chunks.json"));
  const allChunks: ScoredChunk[] = [];

  // Balanced coverage: up to 10 files from each SBC code to ensure equal representation
  const sbc201Files = chunkFiles.filter((f: any) => f.name.includes("201")).slice(0, 10);
  const sbc801Files = chunkFiles.filter((f: any) => f.name.includes("801")).slice(0, 10);
  const topFiles = [...sbc201Files, ...sbc801Files];

  for (const file of topFiles) {
    try {
      cleanCache();
      let content: string;
      const cached = fileCache.get(file.name);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        content = cached.content;
      } else {
        const { data } = await supabase.storage.from("ssss").download(file.name);
        if (!data) continue;
        content = await data.text();
        fileCache.set(file.name, { content, timestamp: Date.now() });
      }

      // Parse and score chunks
      let chunks: any[] = [];
      try {
        const parsed = JSON.parse(content);
        chunks = Array.isArray(parsed) ? parsed : [parsed];
      } catch { continue; }

      for (const chunk of chunks) {
        const text = typeof chunk === "string" ? chunk : (chunk.text || chunk.content || "");
        if (!text || text.length < 50) continue;
        const s = scoreChunk(text, keywords);
        if (s > 0) allChunks.push({ text, score: s, source: file.name });
      }
    } catch { continue; }
  }

  // Sort and cap at 80k chars
  allChunks.sort((a, b) => b.score - a.score);
  let totalChars = 0;
  const MAX_CHARS = 80000;
  const selected: ScoredChunk[] = [];

  for (const chunk of allChunks) {
    if (totalChars + chunk.text.length > MAX_CHARS) break;
    selected.push(chunk);
    totalChars += chunk.text.length;
    if (!usedFiles.includes(chunk.source)) usedFiles.push(chunk.source);
  }

  const context = selected.length > 0
    ? `\n\n=== SBC REFERENCE DOCUMENTS (Naive RAG) ===\n` +
      selected.map(c => `[Source: ${c.source}]\n${c.text}`).join("\n\n---\n\n")
    : "";

  return { context, files: usedFiles };
}

// ==================== LOCAL SEARCH (Graph-based) ====================
async function localSearch(query: string, supabase: any): Promise<{ context: string; files: string[] }> {
  const keywords = extractKeywords(query);
  const usedFiles: string[] = [];

  // 1. Find matching nodes by keywords
  const { data: matchedNodes } = await supabase
    .from("graph_nodes")
    .select("id, name, type, description, sbc_source, page_range, chapter, keywords")
    .filter("keywords", "cs", `{${keywords.slice(0, 5).join(",")}}`)
    .limit(20);

  if (!matchedNodes?.length) {
    // Fallback: text search in name/description
    const { data: fallbackNodes } = await supabase
      .from("graph_nodes")
      .select("id, name, type, description, sbc_source, page_range")
      .ilike("name", `%${keywords[0] || query.slice(0, 20)}%`)
      .limit(15);
    
    if (!fallbackNodes?.length) return { context: "", files: [] };
    matchedNodes?.push(...(fallbackNodes || []));
  }

  const nodeIds = (matchedNodes || []).map((n: any) => n.id);

  // 2. 2-hop: get edges from matched nodes
  const { data: edges } = await supabase
    .from("graph_edges")
    .select("source_id, target_id, relationship_type, description")
    .or(`source_id.in.(${nodeIds.join(",")}),target_id.in.(${nodeIds.join(",")})`)
    .limit(50);

  // 3. Get neighbor nodes (2-hop)
  const neighborIds = new Set<string>();
  for (const edge of (edges || [])) {
    if (!nodeIds.includes(edge.source_id)) neighborIds.add(edge.source_id);
    if (!nodeIds.includes(edge.target_id)) neighborIds.add(edge.target_id);
  }

  let neighborNodes: any[] = [];
  if (neighborIds.size > 0) {
    const { data: neighbors } = await supabase
      .from("graph_nodes")
      .select("id, name, type, description, sbc_source, page_range")
      .in("id", [...neighborIds].slice(0, 20));
    neighborNodes = neighbors || [];
  }

  // 4. Get original text from bucket for matched page ranges
  const allNodes = [...(matchedNodes || []), ...neighborNodes];
  const pageRanges = [...new Set(allNodes.map((n: any) => n.page_range).filter(Boolean))];
  
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  
  const { data: allFiles } = await supabaseAdmin.storage.from("ssss").list("", { limit: 100 });
  const contextParts: string[] = [];

  for (const range of pageRanges.slice(0, 4)) {
    const matchFile = allFiles?.find((f: any) => f.name.includes(range) && f.name.endsWith("_chunks.json"));
    if (!matchFile) continue;
    
    try {
      const cached = fileCache.get(matchFile.name);
      let content: string;
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        content = cached.content;
      } else {
        const { data } = await supabaseAdmin.storage.from("ssss").download(matchFile.name);
        if (!data) continue;
        content = await data.text();
        fileCache.set(matchFile.name, { content, timestamp: Date.now() });
      }
      usedFiles.push(matchFile.name);
      
      // Score and add relevant chunks
      let chunks: any[] = [];
      try {
        const parsed = JSON.parse(content);
        chunks = Array.isArray(parsed) ? parsed : [parsed];
      } catch { continue; }
      
      const queryKw = extractKeywords(query);
      const scored = chunks
        .map(c => ({ text: typeof c === "string" ? c : (c.text || ""), score: scoreChunk(typeof c === "string" ? c : (c.text || ""), queryKw) }))
        .filter(c => c.score > 0 && c.text.length > 50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      
      if (scored.length > 0) {
        contextParts.push(`[File: ${matchFile.name}]\n${scored.map(c => c.text).join("\n---\n")}`);
      }
    } catch { continue; }
  }

  // Build graph summary
  const graphSummary = `
=== GRAPH LOCAL SEARCH RESULTS ===
Matched Entities (${(matchedNodes || []).length}):
${(matchedNodes || []).map((n: any) => `• ${n.name} [${n.type}] (${n.sbc_source}, pages ${n.page_range}): ${n.description || ""}`).join("\n")}

Related Entities via Graph (${neighborNodes.length}):
${neighborNodes.map(n => `• ${n.name} [${n.type}] (${n.sbc_source}): ${n.description || ""}`).join("\n")}

Relationships (${(edges || []).length}):
${(edges || []).slice(0, 15).map((e: any) => `• ${e.relationship_type}: ${e.description || ""}`).join("\n")}
`;

  const fullContext = contextParts.length > 0
    ? `\n\n=== SBC REFERENCE (Graph Local Search) ===\n${graphSummary}\n\n=== SOURCE TEXT ===\n${contextParts.join("\n\n")}`
    : graphSummary.trim()
    ? `\n\n=== SBC REFERENCE (Graph Local Search) ===\n${graphSummary}`
    : "";

  return { context: fullContext, files: usedFiles };
}

// ==================== GLOBAL SEARCH (Community-based) ====================
async function globalSearch(query: string, supabase: any): Promise<string> {
  const keywords = extractKeywords(query);
  
  // Find relevant communities by topic keywords
  const { data: communities } = await supabase
    .from("community_summaries")
    .select("id, level, summary, summary_ar, sbc_sources, topic_keywords")
    .limit(50);

  if (!communities?.length) return "";

  // Score communities by keyword overlap
  const scored = communities.map((c: any) => {
    const communityKw = (c.topic_keywords || []).join(" ").toLowerCase();
    const querySummary = (c.summary || "").toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (communityKw.includes(kw)) score += 3;
      if (querySummary.includes(kw)) score += 1;
    }
    // Prefer higher-level communities for global context
    score += c.level * 2;
    return { ...c, score };
  }).filter((c: any) => c.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10);

  if (!scored.length) return "";

  // Use Rater LLM to filter summaries (score 0-100)
  const geminiKey = Deno.env.get("Gemini_API_Key1");
  if (!geminiKey) return scored.map((c: any) => c.summary).join("\n\n");

  const raterPrompt = `You are a relevance rater for SBC (Saudi Building Code) community summaries.
Query: "${query}"

Rate each community summary for relevance to the query (0-100).
Return JSON array: [{"id": "...", "score": number}]

Communities:
${scored.map((c: any, i: number) => `[${i}] ID:${c.id} - ${c.summary.slice(0, 200)}`).join("\n")}`;

  let filteredCommunities = scored;
  
  try {
    const raterResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: raterPrompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: "application/json" },
        }),
      }
    );
    
    if (raterResponse.ok) {
      const raterData = await raterResponse.json();
      const ratings = JSON.parse(raterData.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
      const scoreMap = new Map(ratings.map((r: any) => [r.id, r.score]));
      filteredCommunities = scored.filter((c: any) => (scoreMap.get(c.id) || 0) >= 60);
      if (!filteredCommunities.length) filteredCommunities = scored.slice(0, 5);
    }
  } catch { /* use all scored communities */ }

  const globalContext = `
=== COMMUNITY KNOWLEDGE BASE (Global Search) ===
${filteredCommunities.map((c: any) => 
  `[Level ${c.level} | Sources: ${(c.sbc_sources || []).join(", ")}]
${c.summary}
${c.summary_ar ? `Arabic: ${c.summary_ar}` : ""}`
).join("\n\n---\n\n")}`;

  return globalContext;
}

// ==================== DRIFT SEARCH (Hybrid) ====================
async function driftSearch(query: string, supabase: any): Promise<{ context: string; files: string[]; method: string }> {
  // Check if graph has data
  const { count: nodeCount } = await supabase
    .from("graph_nodes")
    .select("*", { count: "exact", head: true });

  // If no graph data yet, fall back to naive RAG
  if (!nodeCount || nodeCount === 0) {
    console.log("⚠️ No graph data, falling back to Naive RAG");
    const { context, files } = await naiveRAG(query, supabase);
    return { context, files, method: "naive_rag_fallback" };
  }

  // Run local + global in parallel
  const [localResult, globalContext] = await Promise.all([
    localSearch(query, supabase),
    globalSearch(query, supabase),
  ]);

  // Combine: 70% local + 30% global
  const localWeight = 0.7;
  const globalWeight = 0.3;
  
  const maxLocalChars = Math.floor(80000 * localWeight);
  const maxGlobalChars = Math.floor(80000 * globalWeight);

  const localCtx = localResult.context.slice(0, maxLocalChars);
  const globalCtx = globalContext.slice(0, maxGlobalChars);

  const combinedContext = [
    localCtx && `\n\n${localCtx}`,
    globalCtx && `\n\n${globalCtx}`,
  ].filter(Boolean).join("");

  return {
    context: combinedContext,
    files: localResult.files,
    method: "drift_search",
  };
}

// ==================== MAIN ROUTER ====================
async function fetchContextRouter(query: string, supabase: any): Promise<{ context: string; files: string[]; method: string }> {
  const complexity = detectQueryComplexity(query);
  console.log(`🔀 Query complexity: ${complexity}`);

  if (complexity === "simple") {
    const { context, files } = await naiveRAG(query, supabase);
    return { context, files, method: "naive_rag" };
  } else {
    return await driftSearch(query, supabase);
  }
}

// ==================== MAIN HANDLER ====================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication
    const isTestMode = req.headers.get("X-Test-Mode") === "lovable-internal-test";
    let userId = "test-user";

    if (!isTestMode) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Please login to continue" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseAnon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Invalid session, please login again" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    console.log(`✅ ${isTestMode ? "TEST MODE" : "Authenticated"} user: ${userId}`);

    const { messages, retry, mode = "standard", language = "ar" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
    const userQuery = lastUserMessage?.content || "";
    
    console.log(`[v2] mode:${mode} lang:${language} query:${userQuery.slice(0, 80)}`);

    let fullSystemPrompt: string;
    let usedFiles: string[] = [];
    let searchMethod = "none";

    if (mode === "primary") {
      // Primary mode: fast, no document loading
      fullSystemPrompt = `أنت ConsultX، مستشار حماية من الحرائق. تتحدث بالعربية بأسلوب مهني ودود. مهمتك: فهم مشكلة المهندس بسرعة، الإجابة على الأسئلة السريعة عن الكود السعودي (SBC 201, SBC 801) ومعايير NFPA، واقتراح الانتقال للوضع الاستشاري أو التحليلي إذا كان السؤال يحتاج تعمق أكثر. اجعل إجاباتك مختصرة ومباشرة. اسأل أسئلة استقصائية لفهم المشكلة.

=== هوية ConsultX التقنية ===
أنت واجهة منظومة من 12 وكيلاً ذكياً متخصصاً بقيادة وكيل الأوركسترا.
تعتمد على تقنية GraphRAG لفهم الروابط المعقدة بين مجلدات الكود السعودي.

قواعدك الصارمة:
- سياسة صفر هلوسة: إذا لم تكن متأكداً من إجابة تتعلق بفقرة محددة، قل ذلك بصراحة واقترح الانتقال للوضع الاستشاري حيث تنشط وكلاء مراجعة الكود وGraphRAG
- مصدر الحقيقة الوحيد: الكود السعودي (إصدار 2024) ومعايير NFPA/SFPE حصرياً
- سيادة الدفاع المدني: عند أي توصية تقنية، ذكّر أن الكود هو الحد الأدنى الفني وأن الدفاع المدني يملك حق التعديل ميدانياً`;
      console.log("[v2] Primary mode: lightweight prompt, skipping RAG");
    } else {
      // Use service role for graph queries
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Route to appropriate search method
      const result = await fetchContextRouter(userQuery, supabaseAdmin);
      const sbcContext = result.context;
      usedFiles = result.files;
      searchMethod = result.method;
      
      console.log(`[v2] Search method: ${searchMethod} | Context: ${sbcContext.length} chars | Files: ${usedFiles.length}`);

      // Build system prompt
      const basePrompt = mode === "analysis" ? getAnalysisPrompt(language) : getStandardPrompt(language);
      
      fullSystemPrompt = basePrompt;
      if (sbcContext) {
        fullSystemPrompt += sbcContext;
        const warningMsg = language === "en"
          ? `\n\n⚠️ CRITICAL: Cite exact clause numbers from above. If not found, say: "The required information is not available in the current files."`
          : `\n\n⚠️ هام: استشهد بأرقام المواد الدقيقة من المستندات أعلاه. إذا لم تجد، قل: "المعلومات المطلوبة غير متوفرة في الملفات الحالية."`;
        fullSystemPrompt += warningMsg;
      }
    }

    const systemMessages: any[] = [{ role: "system", content: fullSystemPrompt }];
    if (retry) {
      const validationMsg = language === "en"
        ? `Your response didn't follow the format. Regenerate with proper structure and exact citations.`
        : `ردك لم يتبع التنسيق. أعد مع الهيكل الصحيح والاستشهادات الدقيقة.`;
      systemMessages.push({ role: "system", content: validationMsg });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: mode === "primary" ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro",
        messages: [...systemMessages, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Please add credits to continue" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("[v2] AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Service error occurred" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-SBC-Sources": usedFiles.join(","),
        "X-Search-Method": searchMethod,
      },
    });

  } catch (error) {
    console.error("[v2] Fatal error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
