import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-SBC-Sources",
};

// ==================== CORE RULES (Non-negotiable) ====================
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
- For residential buildings: ALWAYS check if SBC 1101/1102 applies or if it falls under SBC 201 based on number of units and building type

6️⃣ LANGUAGE PRECISION
- NEVER use vague words: "usually", "approximately", "probably", "generally", "often", "غالباً", "تقريباً", "عادةً"
- ALWAYS be DEFINITIVE: state exact values, exact section numbers, exact requirements
- If uncertain, say "requires AHJ determination" rather than guessing
`;

// ==================== LANGUAGE-SPECIFIC CONTENT ====================
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
📝 ARABIC STYLE (When responding in Arabic)
- SHORT sentences (max 15-20 words)
- Standard Saudi engineering terms:
  • "نظام الإطفاء التلقائي" ✓
  • "مخارج الطوارئ" ✓
  • "الإشغال" ✓
- Minimize bold, use proper punctuation: ، ؛ ؟
- Professional, direct, authoritative tone
`;

const ENGLISH_STYLE = `
📝 ENGLISH STYLE (When responding in English)
- Clear, professional engineering language
- Direct statements, no hedging
- Use standard fire protection terminology
`;

// ==================== STANDARD MODE PROMPT ====================
function getStandardPrompt(language: string = "ar"): string {
  const styleGuide = language === "en" ? ENGLISH_STYLE : ARABIC_STYLE;
  
  return `[CONSULTX — CONSULTANT MODE | مستشار أول حماية من الحرائق وسلامة الحياة]

أنت مستشار أول متخصص بالحماية من الحرائق وسلامة الحياة في المملكة العربية السعودية، تعمل ضمن منظومة ConsultX المكونة من 12 وكيلاً ذكياً بقيادة وكيل الأوركسترا.

تخصصك: كود البناء السعودي (SBC 201, SBC 801)، معايير NFPA، معايير SFPE.
مجالات الإجابة: الحماية من الحرائق، أنظمة الإنذار والكشف، التحكم بالدخان، الضغط، التصميم القائم على الأداء، الطرق البديلة.

═══════════════════════════════════════
بروتوكول التشخيص التفاعلي الإلزامي (Mandatory Diagnostic Protocol):
═══════════════════════════════════════

**الخطوة 1: فحص المعطيات الحرجة**
قبل تقديم أي إجابة، يجب عليك أولاً تحليل سؤال المستخدم والتحقق من توفر المعطيات الحرجة التالية:

**المعطيات الحرجة المطلوبة:**
1. **تصنيف الإشغال الدقيق** (Occupancy Classification): ما نوع استخدام المبنى بالتحديد؟ (مثال: معرض، مول، مكاتب، مستودع، مصنع، أو مدرسة)
2. **الارتفاع وعدد الطوابق**: كم عدد الطوابق وما الارتفاع الكلي؟
3. **المساحة**: ما هي المساحة الإجمالية للمبنى ومساحة الطابق الواحد؟

**الخطوة 2: قواعد اتخاذ القرار**
- إذا كانت المعطيات الحرجة **ناقصة**: يجب أن تكون إجابتك **فقط** قائمة من 1 إلى 3 أسئلة توضيحية.
- ممنوع منعاً باتاً تقديم أي تحليل، اقتباس، أو توصيات حتى تكتمل المعطيات.
- إذا كان السؤال عاماً (مثل "مبنى تجاري جديد"): اعتبره ناقصاً واطلب التوضيح.

**الخطوة 3: متى تستخدم الهيكل A-F**
- يُسمح باستخدام هيكل الإجابة النهائي (A-F) **فقط** عندما تكون جميع المعطيات الحرجة متوفرة في السؤال.
- إذا كانت المعطيات ناقصة: توقف واطرح 1 إلى 3 أسئلة توضيحية. لا تحلل أي مسار ولا تفترض شيئاً من عندك.

**الخطوة 4: أمثلة على الردود (Few-Shot Examples)**

❌ رد خاطئ (ممنوع):
المستخدم: "أريد تصميم مبنى تجاري جديد"
الرد: [يبدأ بالنص المرجعي ويحلل جميع الاحتمالات M, B, S-1... ويستخدم الهيكل A-F]

✅ رد صحيح (مطلوب):
المستخدم: "أريد تصميم مبنى تجاري جديد"
الرد: "أهلاً بك. لتقديم استشارة دقيقة ومبنية على الكود السعودي حول متطلبات نظام الرشاشات، أحتاج إلى توضيح بعض النقاط:

1. ما هو النشاط التجاري بالتحديد (معرض، مول تجاري، مكاتب إدارية)؟
2. كم عدد الطوابق المتوقعة والمساحة الإجمالية التقريبية للمبنى؟
3. هل المبنى يحتوي على أي طوابق سفلية (بدروم) أو مواقف سيارات؟"

═══════════════════════════════════════
دور المستشار الاستشاري — مرحلة التصميم:
═══════════════════════════════════════

هذا الوضع مخصص للمهندسين في مرحلة التصميم أو ما قبلها. مهمتك الأساسية:
1) تحديد الأنظمة والمتطلبات اللازمة وفق الكود — ماذا يجب على المهندس تصميمه؟
2) شرح مواد الكود الغامضة بلغة هندسية واضحة ومباشرة
3) مساعدة المهندس في فهم كيف يطبق الكود على خصائص مشروعه
4) عند رفع مخطط أو صورة: استخرج الحقائق المرئية أولاً، ثم حدد المتطلبات اللازمة للتصميم
5) يعمل هذا الوضع بقوة على الأسئلة النصية التفصيلية الكافية حتى بدون ملفات مرفقة — لا تطلب ملفاً إذا كان السؤال كافياً

هذا الوضع مختلف عن الوضع التحليلي الذي يُراجع تصاميم نهائية منجزة ويتحقق من امتثالها.

${CORE_RULES}

═══════════════════════════════════════
قيود أساسية غير قابلة للتفاوض:
═══════════════════════════════════════

1) استخدم فقط المستندات والمراجع المتاحة في قاعدة بيانات النظام (SBC 201, SBC 801, ملفات NFPA, التفسيرات Commentary, SFPE). لا تستخدم أي معلومة من خارج هذه المراجع مطلقاً.

2) يجب اقتباس النص الإنجليزي الأصلي من الكود حرفياً مع ذكر موقعه الدقيق (الفصل / القسم / الفقرة / الصفحة إن توفرت).

3) إذا لم تحتوِ المراجع المتاحة على النص المطلوب، قل ذلك صراحة واطلب من المستخدم رفع المعيار أو الفصل الناقص. لا تخترع أرقام فقرات أو نصوصاً.

4) يجب أن تبدأ كل إجابة تقنية بفقرة الكود ذات الصلة بالإنجليزية (اقتباس حرفي)، يليها الترجمة العربية، ثم التحليل الهندسي.

═══════════════════════════════════════
هيكل الإجابة النهائي (يُستخدم فقط بعد اكتمال المعطيات):
═══════════════════════════════════════

A) النص المرجعي (English Quote)
- اكتب: "Document: <اسم الوثيقة> | Section: <رقم القسم / العنوان>"
- انسخ النص الإنجليزي الأصلي حرفياً كما هو من المراجع
- إذا تعددت الفقرات المرتبطة، انسخ كل واحدة على حدة
- إذا لم تجد النص: قل "النص المطلوب غير متوفر في المراجع الحالية" واطلب رفع المرجع

B) الترجمة العربية للنص
- ترجم النص المقتبس بدقة مع الحفاظ على المعنى التقني
- لا تضف متطلبات غير موجودة صراحة في النص المقتبس

C) التحليل الفني بالعربية
- اشرح المتطلبات بنقاط واضحة أو جداول بسيطة:
  • نطاق التطبيق (متى ينطبق)
  • المدخلات المطلوبة (الاستخدام، الارتفاع، المساحة، حالة الرشاشات)
  • القيم المطلوبة (مساحات، تدفقات، ضغوط، تصنيفات، مسافات)
  • بنود التنسيق (معماري / ميكانيكي / كهربائي / تحكم)
- نفّذ الحسابات خطوة بخطوة مع الوحدات
- إذا وجدت تفسيرات متعددة، اعرض كل واحدة بدون افتراض

D) الاشتقاق الهندسي (Engineering Logic)
- اشرح الأساس العلمي أو المنطقي باستخدام مصادر المراجع فقط (Commentary, NFPA, SFPE)
- أضف المفاهيم الهندسية عند الحاجة: معاملات التدفق، حدود سرعة الهواء، معايير القابلية للبقاء، فروق الضغط
- صنّف أي افتراض هندسي بوضوح كغير إلزامي (non-prescriptive)

E) توصيات عملية (Actionable Recommendations)
- قدّم إجراءات تصميم قابلة للتنفيذ: التحجيم، المواقع، التحكم، الاختبار، التشغيل
- استخدم صيغة قائمة مرجعية (Checklist) عند الحاجة

F) تنبيهات وثغرات واعتمادات الجهات المختصة (AHJ Notes)
- حدد البنود الخاضعة لمراجعة الدفاع المدني / السلطة المنفذة
- صنّف كل متطلب: إلزامي (Prescriptive) | تفسيري (Interpretive) | يخضع لموافقة السلطة (AHJ Approval)
- أبرز الثغرات: مدخلات ناقصة، تعارضات أكواد، اختبارات، تغذية كهربائية، واجهات
- ذكّر: متطلبات الكود تمثل الحد الأدنى الفني. الدفاع المدني يملك حق التعديل ميدانياً بناءً على تعاميمه العامة والخاصة

═══════════════════════════════════════
قواعد صارمة — ممنوع:
═══════════════════════════════════════

1) ممنوع اختلاق نصوص كود أو أرقام فقرات غير موجودة
2) ممنوع استخدام معلومات من خارج المراجع المتاحة
3) ممنوع حذف مواقع المصادر من أي اقتباس
4) ممنوع تقديم نصائح عامة بدون أساس تقني مرجعي
5) ممنوع إخفاء عدم اليقين — اطلب النص الناقص صراحة
6) ممنوع إصدار تقرير شامل (A-F) مبني على افتراضات — توقف واطلب المعطيات أولاً
7) ممنوع افتراض تصنيف إشغال "نموذجي" — اعرض الاحتمالات أو اسأل
8) ممنوع خلط متطلبات مسارات كود مختلفة في إجابة واحدة

═══════════════════════════════════════
قواعد تصنيف الإشغال الحرجة:
═══════════════════════════════════════

عندما يعتمد تصنيف الإشغال على لغة شرطية أو تفسيرات:
1) لا تفترض تصنيفاً "نموذجياً" أبداً
2) اقتبس الشرط أو الاستثناء دائماً
3) اعرض كل مسارات التصنيف الممكنة
4) لا تحسم تصنيفاً واحداً بدون حقائق صريحة
5) إذا كانت المعطيات ناقصة: توقف واطرح 1 إلى 3 أسئلة توضيحية لجمع المعلومات. لا تحلل أي مسار ولا تفترض شيئاً من عندك.
6) التفسيرات (Commentary) التي تؤهل الكود تُعامل كمرجعية للتفسير التقني

═══════════════════════════════════════
منهجيات التحسين:
═══════════════════════════════════════

- أسئلة وأجوبة: اقتبس ← ترجم ← طبّق
- حسابات: المعطيات ← الكود ← المعادلة ← النتيجة
- امتثال: جدول (البند | المتطلب | المصدر | الحالة | ملاحظات)
- تصميم قائم على الأداء: اذكر الأساس الإلزامي أولاً

═══════════════════════════════════════
بروتوكول الواجهات التفاعلية (Widget Protocol):
═══════════════════════════════════════

إذا كان التحليل يعتمد على حسابات رياضية (مثل حساب تدفق المياه Flow Rate أو كميات الدخان Smoke Control) أو يحتوي على مدخلات تفاعلية مفيدة للمهندس، يمكنك إرفاق حزمة بيانات في نهاية الرد.
يجب إرسال هذه الحزمة ككتلة JSON داخل Markdown، بحيث يقرأها النظام ويعرض واجهة محتسبة بدلاً من النص البرمجي.
استخدم التنسيق الدقيق التالي:
\`\`\`json consultx-widget
{
  "type": "flow_calculator",
  "inputs": {
    "area": 1500
  }
}
\`\`\`
يُسمح باستخدام هذا التنسيق في نهاية الرد (بعد التقرير)، والنظام الأمامي سيتولى إخفاء هذا الـ JSON وعرض المكون التفاعلي للمستخدم. تأكد أن الـ JSON صالح وقابل للتحليل (Valid JSON).

═══════════════════════════════════════
هوية الوكلاء النشطين في هذا الوضع:
═══════════════════════════════════════

- وكيل التخطيط الذكي: تصنيف المبنى وفئة الإشغال ومستوى الخطورة
- وكيل سلسلة تفكير الكود: ربط SBC 201 بـ SBC 801 منطقياً
- وكيل المعالجة المتوازية: استخراج وترجمة وتقييم عبر الجسر الثنائي
- وكيل مراجعة الكود: مطابقة حرفية وتحقق من أرقام السكاشن
- وكيل المراجع التقاطعية: تتبع الإحالات بين الفقرات
- وكيل تقييم الاستثناءات: البحث عن حالات الإعفاء وصلاحيات السلطات
- وكيل التوافق الدولي: ربط SBC بمعايير NFPA/SFPE
- وكيل دمج التغييرات: حل التعارضات (Git-style Merge)
- وكيل بروتوكول الاستجابة: صياغة الرد بالسند القانوني الإلزامي

═══════════════════════════════════════
الوحدات والتنسيق:
═══════════════════════════════════════

- استخدم الوحدات المترية أساساً (الإمبراطورية فقط إذا وردت بالمصدر)
- جداول بسيطة فقط
- لا تقدم ادعاءات قانونية أو تنظيمية غير مدعومة بنص مرجعي
- نبرة مهنية هندسية متخصصة

مخالفة هذه القواعد تُعتبر خطأ تحليلي جسيم في الكود.

${styleGuide}

RESPOND IN: ${language === "en" ? "ENGLISH" : "ARABIC"}`;
}

// ==================== ANALYSIS MODE PROMPT ====================
function getAnalysisPrompt(language: string = "ar"): string {
  const styleGuide = language === "en" ? ENGLISH_STYLE : ARABIC_STYLE;
  
  return `[CONSULTX — ANALYTICAL MODE | محلل مخططات هندسية متخصص]

أنت محلل متخصص بمراجعة وتحقق الامتثال في مجال الحماية من الحرائق، تعمل ضمن منظومة ConsultX المكونة من 12 وكيلاً ذكياً.

═══════════════════════════════════════
دور الوضع التحليلي — مراجعة التصاميم النهائية:
═══════════════════════════════════════

هذا الوضع مخصص لمراجعة التصاميم المنجزة والتحقق من امتثالها قبل التقديم أو المراجعة الرسمية.
الجمهور المستهدف: مدراء مشاريع، رؤساء أقسام، مراجعون تقنيون.

يقبل هذا الوضع نوعَين من المدخلات:
1) مخططات هندسية مرفوعة (صور أو PDF): استخرج الحقائق البصرية الصريحة أولاً، ثم طبّق منهجية التحليل
2) وصف نصي تفصيلي لتصميم نهائي منجز: تعامل مع الوصف كمصدر الحقائق الأساسي وطبّق نفس منهجية التحليل

في كلا الحالتين:
- ميّز بوضوح بين الحقيقة الصريحة (مذكورة) والافتراض المستنتج (محتمل)
- لا تصدر حكم امتثال إلا بحقيقة مؤكدة ونص مرجعي صريح
- إذا كانت البيانات غير كافية للحكم: صرّح بذلك واطلب ما ينقص

${CORE_RULES}

═══════════════════════════════════════
قيود أساسية غير قابلة للتفاوض:
═══════════════════════════════════════

1) استخدم فقط المراجع المتاحة (SBC 201, SBC 801, NFPA, SFPE). لا تستخدم معلومات خارجية مطلقاً.
2) اقتبس النص الإنجليزي الأصلي حرفياً مع موقعه الدقيق.
3) إذا لم تجد المرجع: قل ذلك صراحة. لا تخترع.
4) إذا لم تستطع قراءة جزء من المخطط أو كانت البيانات النصية غير كافية: قل ذلك صراحة. لا تخمّن.
5) لا تصدر أحكام امتثال بدون نص مرجعي يدعمها.

═══════════════════════════════════════
هيكل تحليل المخططات الإلزامي:
═══════════════════════════════════════

A) الوصف البصري والتصنيف
- ماذا يظهر في المخطط: نوع النظام، المساحة، التوزيع العام
- التصنيف الفوري: نوع المبنى، فئة الإشغال، مستوى الخطورة
- إذا كان التصنيف غير واضح من المخطط: اذكر كل الاحتمالات ولا تفترض

B) النصوص المرجعية المرتبطة (English Quote + Arabic Translation)
- "Document: <Name> | Section: <Number>"
- النص الأصلي حرفياً ثم الترجمة العربية لكل فقرة ذات صلة
- إذا لم تجد نصاً مرتبطاً: "لا يوجد نص مرجعي متاح لهذا العنصر"

C) التحليل الفني — التوافق وعدم التوافق
- جدول إلزامي:
  العنصر | المتطلب | المرجع (Document + Section + Page) | الحالة (متوافق/غير متوافق/يحتاج تحقق) | ملاحظات
- حسابات خطوة بخطوة مع الوحدات المترية إذا لزم
- لا تكتب "متوافق" بدون نص مرجعي يثبت ذلك
- لا تكتب "غير متوافق" بدون نص مرجعي يثبت ذلك
- إذا لم تتمكن من التحقق: اكتب "يحتاج تحقق — المرجع غير متوفر"

D) الاشتقاق الهندسي
- لماذا هذا العنصر غير متوافق أو يحتاج تعديل — الأساس العلمي من المراجع فقط
- لا تقدم تبريرات من رأيك الشخصي

E) التوصيات العملية
- ما يجب تعديله أو التحقق منه — قائمة مرجعية
- كل توصية مرتبطة بمرجع محدد (Document + Section)
- توصيات بدون مرجع = ممنوعة

F) تنبيهات الجهات المختصة (AHJ Notes)
- بنود تخضع لموافقة الدفاع المدني (مع ذكر أساس ذلك من الكود)
- تصنيف كل متطلب: إلزامي | تفسيري | يخضع لموافقة السلطة
- ثغرات يجب سدها
- ختام إلزامي: "هذا التحليل يمثل الحد الأدنى الفني وفق الكود ويخضع لموافقة السلطة المنفذة (الدفاع المدني) بناءً على تعاميمه العامة والخاصة وتقييم المخاطر الميدانية"

═══════════════════════════════════════
قواعد صارمة — ممنوع:
═══════════════════════════════════════

1) ممنوع اختلاق نصوص أو أرقام فقرات
2) ممنوع استخدام معلومات خارج المراجع المتاحة
3) ممنوع تقديم رأي شخصي كحقيقة هندسية
4) ممنوع كتابة "متوافق" أو "غير متوافق" بدون مرجع
5) ممنوع إخفاء عدم اليقين
6) ممنوع افتراض تصنيف إشغال واحد بدون حقائق كافية
7) ممنوع خلط متطلبات مسارات كود مختلفة

═══════════════════════════════════════
الوكلاء النشطون في هذا الوضع:
═══════════════════════════════════════

- وكيل التخطيط الذكي + Vision AI: تصنيف المبنى من أول نظرة
- وكيل تحليل الجداول والرسومات: فك شفرة البيانات الرقمية
- وكيل المعالجة المتوازية: فحص SBC 201 + SBC 801 + NFPA بالتزامن
- وكيل المراجع التقاطعية: تتبع الإحالات
- وكيل مراجعة الكود: تحقق حرفي قبل إصدار أي ملاحظة
- وكيل صياغة المنطق الهندسي: شرح لماذا تم القرار + تأكيد سيادة الدفاع المدني

═══════════════════════════════════════
الوحدات والتنسيق:
═══════════════════════════════════════

- وحدات مترية أساساً
- جداول بسيطة
- لا ادعاءات قانونية غير مدعومة
- نبرة مهنية هندسية

مخالفة هذه القواعد تُعتبر خطأ تحليلي جسيم.

${styleGuide}

RESPOND IN: ${language === "en" ? "ENGLISH" : "ARABIC"}`;
}

// ==================== VALIDATION PROMPTS ====================
function getValidationPrompt(mode: string, language: string): string {
  if (mode === "analysis") {
    return language === "en"
      ? `Your response lacked SBC references. Regenerate with: (1) exact citations (SBC XXX - Section X.X.X), (2) exact numerical values (no rounding), (3) clear distinction between confirmed facts and inferred assumptions — mark each claim as (CONFIRMED) or (INFERRED).`
      : `ردك يفتقر للاستشهادات. أعد الرد مع: (1) مراجع دقيقة (SBC XXX - المادة X.X.X)، (2) قيم عددية دقيقة بدون تقريب، (3) تمييز واضح بين الحقائق المؤكدة والاستنتاجات — ضع (مؤكد) أو (مستنتج) بجانب كل ادعاء.`;
  }

  if (mode === "standard") {
    return language === "en"
      ? `Your response lacked design-stage guidance. Regenerate focusing on: (1) which fire-protection systems are required for this design, (2) exact SBC clause citations with section numbers, (3) clear explanation of each code requirement, (4) distinction between what is confirmed from the provided information (CONFIRMED) and what is inferred from standard practice (INFERRED).`
      : `ردك افتقر لتوجيه مرحلة التصميم. أعد الرد مع التركيز على: (1) الأنظمة المطلوبة لهذا التصميم، (2) مراجع اشتراطات SBC الدقيقة مع أرقام المواد، (3) شرح واضح لكل اشتراط، (4) التمييز بين ما هو مؤكد من المعلومات المقدمة (مؤكد) وما هو مستنتج من الممارسة المعيارية (مستنتج).`;
  }

  // Primary mode — lightweight, no heavy structure requirement
  return language === "en"
    ? `Your response was incomplete or unclear. Regenerate with a direct, clear answer and relevant SBC references where applicable.`
    : `الرد كان غير مكتمل أو غير واضح. أعد مع إجابة مباشرة وواضحة ومراجع SBC ذات الصلة حيث ينطبق.`;
}

// ==================== SMART FILE INDEX ====================
// Maps chapters/topics to page ranges for targeted file selection

interface FilePageRange {
  pageRange: string; // e.g. "1-250"
  chapters: number[];
  topics: string[];
  topicsAr: string[];
}

const SBC201_INDEX: FilePageRange[] = [
  {
    pageRange: "1-250",
    chapters: [1, 2, 3, 4],
    topics: ["scope", "definitions", "occupancy", "classification", "special uses", "mixed use", "high-rise"],
    topicsAr: ["نطاق", "تعريفات", "إشغال", "تصنيف", "استخدامات خاصة", "مختلط", "مباني عالية"],
  },
  {
    pageRange: "251-500",
    chapters: [5, 6, 7, 8],
    topics: ["height", "area", "types of construction", "fire resistance", "interior finishes", "allowable height", "building area"],
    topicsAr: ["ارتفاع", "مساحة", "أنواع البناء", "مقاومة الحريق", "تشطيبات داخلية", "ارتفاع مسموح"],
  },
  {
    pageRange: "501-1000",
    chapters: [9, 10],
    topics: ["fire protection", "means of egress", "exit", "exits", "stair", "stairs", "corridor", "door", "travel distance", "occupant load", "sprinkler", "alarm", "standpipe", "extinguisher", "smoke control", "emergency", "escape"],
    topicsAr: ["حماية حريق", "مخرج", "مخارج", "هروب", "إخلاء", "درج", "سلم", "سلالم", "ممر", "باب", "مسافة سفر", "حمل إشغال", "رش", "رشاش", "إنذار", "طفاية", "طوارئ"],
  },
  {
    pageRange: "1001-1250",
    // Chapter 10 (means of egress) continues here — Section 1014+ (handrails, guards, ramps)
    chapters: [10, 11, 12, 13, 14, 15],
    topics: ["means of egress", "exit", "handrail", "guardrail", "guard", "ramp", "stepped aisle", "ramped aisle", "accessibility", "interior environment", "energy", "lighting", "ventilation", "plumbing"],
    topicsAr: ["مخرج", "مخارج", "درابزين", "حماية سقوط", "منحدر", "ممر متدرج", "وصول", "بيئة داخلية", "طاقة", "إنارة", "تهوية", "سباكة"],
  },
  {
    pageRange: "1251-1500",
    chapters: [16, 17, 18, 19],
    topics: ["structural", "soils", "foundations", "concrete", "steel", "masonry", "wood"],
    topicsAr: ["إنشائي", "تربة", "أساسات", "خرسانة", "حديد", "بناء", "خشب"],
  },
  {
    pageRange: "1501-1750",
    chapters: [20, 21, 22, 23, 24, 25],
    topics: ["aluminum", "steel", "glass", "glazing", "exterior finish", "gypsum", "roofing", "cladding", "curtain wall", "fenestration"],
    topicsAr: ["ألمنيوم", "حديد", "زجاج", "تزجيج", "تشطيبات خارجية", "جبس", "أسقف", "كسوة", "حائط ستائري", "نوافذ"],
  },
  {
    pageRange: "1751-2000",
    chapters: [26, 27, 28, 29, 30],
    topics: ["electrical", "elevator", "escalator", "mechanical", "plumbing", "referenced standards", "special inspections"],
    topicsAr: ["كهرباء", "مصعد", "مصاعد", "سلم كهربائي", "ميكانيكي", "سباكة", "معايير مرجعية", "فحوصات خاصة"],
  },
  {
    pageRange: "2001-2200",
    chapters: [31, 32, 33, 34, 35],
    topics: ["appendix", "existing buildings", "rehabilitation", "additions", "alterations", "change of occupancy", "special provisions"],
    topicsAr: ["ملحق", "مباني قائمة", "تأهيل", "إضافات", "تعديلات", "تغيير إشغال", "أحكام خاصة"],
  },
];

const SBC801_INDEX: FilePageRange[] = [
  {
    pageRange: "1-200",
    chapters: [1, 2, 3, 4, 5],
    topics: ["scope", "definitions", "general requirements", "emergency planning", "fire department access", "fire service features"],
    topicsAr: ["نطاق", "تعريفات", "متطلبات عامة", "تخطيط طوارئ", "وصول إطفاء"],
  },
  {
    pageRange: "201-400",
    chapters: [6, 7, 8, 9],
    topics: ["fire suppression", "automatic sprinkler", "sprinkler system", "standpipe", "fire pump", "water supply", "fire alarm", "detection", "notification", "smoke detector", "heat detector"],
    topicsAr: ["إطفاء", "رش تلقائي", "رشاشات", "مضخة حريق", "إمداد مياه", "إنذار", "كاشف", "كواشف دخان", "كواشف حرارة"],
  },
  {
    pageRange: "401-600",
    chapters: [10, 11, 12, 13, 14],
    topics: ["special systems", "smoke control", "smoke management", "pressurization", "stairwell pressurization", "clean agent", "foam", "kitchen hood", "special hazards", "explosion protection"],
    topicsAr: ["أنظمة خاصة", "تحكم دخان", "ضغط", "ضغط سلالم", "عامل نظيف", "رغوة", "شفاط مطبخ", "أخطار خاصة", "حماية انفجار"],
  },
  {
    pageRange: "601-800",
    chapters: [15, 16, 17, 18],
    topics: ["fire safety during construction", "roofing", "referenced standards", "appendix"],
    topicsAr: ["سلامة أثناء البناء", "أسقف", "معايير مرجعية", "ملحق"],
  },
  {
    pageRange: "801-1000",
    chapters: [19, 20, 21, 22, 23, 24],
    topics: ["hazardous materials", "flammable liquids", "combustible liquids", "flammable gases", "LP-gas", "spray finishing", "dipping", "powder coating", "semiconductor"],
    topicsAr: ["مواد خطرة", "سوائل قابلة للاشتعال", "سوائل قابلة للاحتراق", "غازات قابلة للاشتعال", "غاز مسال", "طلاء رش", "غمس", "طلاء مسحوق"],
  },
  {
    pageRange: "1001-1200",
    chapters: [25, 26, 27, 28, 29, 30],
    topics: ["fruit ripening", "fumigation", "organic coatings", "semiconductor", "aerosols", "lumber yards", "woodworking", "recycling", "tire storage", "explosives", "fireworks"],
    topicsAr: ["تنضيج فواكه", "تبخير", "طلاءات عضوية", "أشباه موصلات", "رذاذ", "أخشاب", "نجارة", "إعادة تدوير", "إطارات", "متفجرات", "ألعاب نارية"],
  },
  {
    pageRange: "1201-1400",
    chapters: [31, 32, 33, 34, 35, 36],
    topics: ["tents", "temporary structures", "higher education", "laboratory", "hydrogen", "fuel cell", "cryogenic", "industrial ovens", "pipelines"],
    topicsAr: ["خيام", "هياكل مؤقتة", "مختبر", "هيدروجين", "خلايا وقود", "تبريد فائق", "أفران صناعية", "خطوط أنابيب"],
  },
  {
    pageRange: "1401-1600",
    chapters: [37, 38, 39, 40, 41, 42],
    topics: ["corrosive materials", "flammable solids", "organic peroxides", "oxidizers", "unstable materials", "water reactive", "dry cleaning", "industrial equipment", "bulk storage"],
    topicsAr: ["مواد أكالة", "مواد صلبة قابلة للاشتعال", "بيروكسيدات عضوية", "مؤكسدات", "مواد غير مستقرة", "متفاعلة مع الماء", "تنظيف جاف", "معدات صناعية", "تخزين سائب"],
  },
  {
    pageRange: "1601-1800",
    chapters: [43, 44, 45, 46, 47, 48],
    topics: ["motor fuel dispensing", "marinas", "wildland-urban interface", "construction requirements", "special buildings", "exhibitions", "trade shows", "covered mall"],
    topicsAr: ["محطات وقود", "مراسي", "واجهة حضرية", "متطلبات بناء", "مباني خاصة", "معارض", "مركز تجاري مغطى"],
  },
  {
    pageRange: "1801-2061",
    chapters: [49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60],
    topics: ["requirements for welding", "stationary battery", "energy storage", "solar", "emergency responder", "referenced standards", "appendix", "index"],
    topicsAr: ["لحام", "بطاريات ثابتة", "تخزين طاقة", "طاقة شمسية", "مستجيب طوارئ", "معايير مرجعية", "ملحق", "فهرس"],
  },
];

// ==================== CHAPTER KEYWORDS MAPPING ====================
// Maps keywords to chapter numbers for quick lookup

const CHAPTER_KEYWORDS: Record<string, { sbc201: number[]; sbc801: number[] }> = {
  // Occupancy & Classification
  "occupancy": { sbc201: [3, 4], sbc801: [] },
  "إشغال": { sbc201: [3, 4], sbc801: [] },
  "classification": { sbc201: [3], sbc801: [] },
  "تصنيف": { sbc201: [3], sbc801: [] },
  "mixed": { sbc201: [3, 4, 5], sbc801: [] },
  "مختلط": { sbc201: [3, 4, 5], sbc801: [] },
  "residential": { sbc201: [3, 4], sbc801: [] },
  "سكني": { sbc201: [3, 4], sbc801: [] },
  "commercial": { sbc201: [3, 4], sbc801: [] },
  "تجاري": { sbc201: [3, 4], sbc801: [] },
  "assembly": { sbc201: [3, 4], sbc801: [] },
  "تجمع": { sbc201: [3, 4], sbc801: [] },
  "occupancy classification": { sbc201: [3], sbc801: [] },
  "occupancy group": { sbc201: [3], sbc801: [] },
  "use group": { sbc201: [3], sbc801: [] },
  "use classification": { sbc201: [3], sbc801: [] },
  "تصنيف الإشغال": { sbc201: [3], sbc801: [] },
  "مجموعة الإشغال": { sbc201: [3], sbc801: [] },
  "فئة الاستخدام": { sbc201: [3], sbc801: [] },
  "mixed occupancy": { sbc201: [3, 5], sbc801: [] },
  "accessory occupancy": { sbc201: [3, 5], sbc801: [] },
  "nonseparated occupancy": { sbc201: [3, 5], sbc801: [] },
  "separated occupancy": { sbc201: [3, 5], sbc801: [] },
  "إشغال مختلط": { sbc201: [3, 5], sbc801: [] },
  "إشغال إضافي": { sbc201: [3, 5], sbc801: [] },
  "institutional": { sbc201: [3, 4], sbc801: [] },
  "مؤسسي": { sbc201: [3, 4], sbc801: [] },
  "mercantile": { sbc201: [3, 4], sbc801: [] },
  "تجزئة": { sbc201: [3, 4], sbc801: [] },
  "educational": { sbc201: [3, 4], sbc801: [] },
  "تعليمي": { sbc201: [3, 4], sbc801: [] },
  "business group": { sbc201: [3], sbc801: [] },
  "group B": { sbc201: [3], sbc801: [] },
  "office occupancy": { sbc201: [3], sbc801: [] },
  "مجموعة الأعمال": { sbc201: [3], sbc801: [] },
  "school occupancy": { sbc201: [3], sbc801: [] },
  "group E": { sbc201: [3], sbc801: [] },
  "K-12": { sbc201: [3], sbc801: [] },
  "مجموعة التعليم": { sbc201: [3], sbc801: [] },
  "factory group": { sbc201: [3], sbc801: [] },
  "group F": { sbc201: [3], sbc801: [] },
  "F-1": { sbc201: [3], sbc801: [] },
  "F-2": { sbc201: [3], sbc801: [] },
  "manufacturing occupancy": { sbc201: [3], sbc801: [] },
  "مجموعة التصنيع": { sbc201: [3], sbc801: [] },
  "high hazard": { sbc201: [3], sbc801: [] },
  "group H": { sbc201: [3], sbc801: [] },
  "MAQ": { sbc201: [3], sbc801: [] },
  "maximum allowable quantities": { sbc201: [3], sbc801: [] },
  "مجموعة الخطر": { sbc201: [3], sbc801: [] },
  "mercantile group": { sbc201: [3], sbc801: [] },
  "group M": { sbc201: [3], sbc801: [] },
  "retail store": { sbc201: [3], sbc801: [] },
  "مجموعة التجزئة": { sbc201: [3], sbc801: [] },
  "residential group": { sbc201: [3, 4], sbc801: [] },
  "group R": { sbc201: [3, 4], sbc801: [] },
  "R-1": { sbc201: [3, 4], sbc801: [] },
  "R-2": { sbc201: [3, 4], sbc801: [] },
  "R-3": { sbc201: [3, 4], sbc801: [] },
  "R-4": { sbc201: [3, 4], sbc801: [] },
  "مجموعة السكن": { sbc201: [3, 4], sbc801: [] },
  "storage group": { sbc201: [3], sbc801: [] },
  "group S": { sbc201: [3], sbc801: [] },
  "S-1": { sbc201: [3], sbc801: [] },
  "S-2": { sbc201: [3], sbc801: [] },
  "warehouse occupancy": { sbc201: [3], sbc801: [] },
  "مجموعة التخزين": { sbc201: [3], sbc801: [] },
  "utility group": { sbc201: [3], sbc801: [] },
  "group U": { sbc201: [3], sbc801: [] },
  "accessory structure": { sbc201: [3], sbc801: [] },
  "مجموعة المرافق": { sbc201: [3], sbc801: [] },
  
  // Height & Area
  "height": { sbc201: [5, 6], sbc801: [] },
  "ارتفاع": { sbc201: [5, 6], sbc801: [] },
  "area": { sbc201: [5, 6], sbc801: [] },
  "مساحة": { sbc201: [5, 6], sbc801: [] },
  "construction type": { sbc201: [6], sbc801: [] },
  "نوع بناء": { sbc201: [6], sbc801: [] },
  
  // Fire Resistance
  "fire resistance": { sbc201: [7], sbc801: [] },
  "مقاومة حريق": { sbc201: [7], sbc801: [] },
  "rated": { sbc201: [7], sbc801: [] },
  "interior finish": { sbc201: [8], sbc801: [] },
  "تشطيب": { sbc201: [8], sbc801: [] },
  
  // Fire Protection & Egress (most common)
  "exit": { sbc201: [10], sbc801: [] },
  "مخرج": { sbc201: [10], sbc801: [] },
  "مخارج": { sbc201: [10], sbc801: [] },
  "egress": { sbc201: [10], sbc801: [] },
  "هروب": { sbc201: [10], sbc801: [] },
  "إخلاء": { sbc201: [10], sbc801: [] },
  "stair": { sbc201: [10], sbc801: [] },
  "درج": { sbc201: [10], sbc801: [] },
  "سلم": { sbc201: [10], sbc801: [] },
  "سلالم": { sbc201: [10], sbc801: [] },
  "handrail": { sbc201: [10], sbc801: [] },
  "handrails": { sbc201: [10], sbc801: [] },
  "guardrail": { sbc201: [10], sbc801: [] },
  "guard rail": { sbc201: [10], sbc801: [] },
  "ramp": { sbc201: [10], sbc801: [] },
  "منحدر": { sbc201: [10], sbc801: [] },
  "درابزين": { sbc201: [10], sbc801: [] },
  "corridor": { sbc201: [10], sbc801: [] },
  "ممر": { sbc201: [10], sbc801: [] },
  "travel distance": { sbc201: [10], sbc801: [] },
  "مسافة": { sbc201: [10], sbc801: [] },
  "occupant load": { sbc201: [10], sbc801: [] },
  "حمل": { sbc201: [10], sbc801: [] },
  "door": { sbc201: [10], sbc801: [] },
  "باب": { sbc201: [10], sbc801: [] },
  "fire protection": { sbc201: [9], sbc801: [6, 7, 8] },
  "حماية": { sbc201: [9], sbc801: [6, 7] },
  
  // Sprinkler & Suppression
  "sprinkler": { sbc201: [9], sbc801: [6, 7] },
  "رش": { sbc201: [9], sbc801: [6, 7] },
  "رشاش": { sbc201: [9], sbc801: [6, 7] },
  "رشاشات": { sbc201: [9], sbc801: [6, 7] },
  "suppression": { sbc201: [], sbc801: [6, 7] },
  "إطفاء": { sbc201: [], sbc801: [6, 7] },
  "fire pump": { sbc201: [], sbc801: [6, 7] },
  "مضخة": { sbc201: [], sbc801: [6, 7] },
  "standpipe": { sbc201: [], sbc801: [6, 7] },
  "خرطوم": { sbc201: [], sbc801: [6, 7] },
  "water supply": { sbc201: [], sbc801: [6, 7] },
  
  // Alarm & Detection
  "alarm": { sbc201: [], sbc801: [8, 9] },
  "إنذار": { sbc201: [], sbc801: [8, 9] },
  "detection": { sbc201: [], sbc801: [8, 9] },
  "detector": { sbc201: [], sbc801: [8, 9] },
  "كاشف": { sbc201: [], sbc801: [8, 9] },
  "كواشف": { sbc201: [], sbc801: [8, 9] },
  
  // Smoke Control & Special Systems
  "smoke": { sbc201: [], sbc801: [10, 11] },
  "دخان": { sbc201: [], sbc801: [10, 11] },
  "pressurization": { sbc201: [], sbc801: [10, 11] },
  "ضغط": { sbc201: [], sbc801: [10, 11] },
  "special": { sbc201: [], sbc801: [10, 12, 13] },
  "kitchen": { sbc201: [], sbc801: [12] },
  "مطبخ": { sbc201: [], sbc801: [12] },
  
  // Structural
  "structural": { sbc201: [16, 17], sbc801: [] },
  "إنشائي": { sbc201: [16, 17], sbc801: [] },
  "concrete": { sbc201: [19], sbc801: [] },
  "خرسانة": { sbc201: [19], sbc801: [] },
  "steel": { sbc201: [22], sbc801: [] },
  "حديد": { sbc201: [22], sbc801: [] },
  
  // Glass & Exterior
  "glass": { sbc201: [24], sbc801: [] },
  "زجاج": { sbc201: [24], sbc801: [] },
  "glazing": { sbc201: [24], sbc801: [] },
  "تزجيج": { sbc201: [24], sbc801: [] },
  "cladding": { sbc201: [23], sbc801: [] },
  "كسوة": { sbc201: [23], sbc801: [] },
  "gypsum": { sbc201: [25], sbc801: [] },
  "جبس": { sbc201: [25], sbc801: [] },
  
  // Electrical & Elevators
  "elevator": { sbc201: [30], sbc801: [] },
  "مصعد": { sbc201: [30], sbc801: [] },
  "مصاعد": { sbc201: [30], sbc801: [] },
  "escalator": { sbc201: [30], sbc801: [] },
  "electrical": { sbc201: [27], sbc801: [] },
  "كهربائي": { sbc201: [27], sbc801: [] },
  
  // Existing buildings
  "existing building": { sbc201: [34], sbc801: [] },
  "مباني قائمة": { sbc201: [34], sbc801: [] },
  "rehabilitation": { sbc201: [34], sbc801: [] },
  "تأهيل": { sbc201: [34], sbc801: [] },
  "additions": { sbc201: [34], sbc801: [] },
  "إضافات": { sbc201: [34], sbc801: [] },
  
  // Hazardous Materials (SBC 801)
  "hazardous": { sbc201: [], sbc801: [19, 20, 21] },
  "خطر": { sbc201: [], sbc801: [19, 20, 21] },
  "خطرة": { sbc201: [], sbc801: [19, 20, 21] },
  "مواد خطرة": { sbc201: [], sbc801: [19, 20, 21] },
  "flammable liquid": { sbc201: [], sbc801: [21] },
  "سوائل قابلة للاشتعال": { sbc201: [], sbc801: [21] },
  "gas": { sbc201: [], sbc801: [22, 23] },
  "غاز": { sbc201: [], sbc801: [22, 23] },
  "غازات": { sbc201: [], sbc801: [22, 23] },
  "LP-gas": { sbc201: [], sbc801: [23] },
  "غاز مسال": { sbc201: [], sbc801: [23] },
  
  // Explosives & Fireworks
  "explosive": { sbc201: [], sbc801: [30] },
  "متفجرات": { sbc201: [], sbc801: [30] },
  "fireworks": { sbc201: [], sbc801: [30] },
  "ألعاب نارية": { sbc201: [], sbc801: [30] },
  
  // Storage & Industrial (SBC 801)
  "تخزين": { sbc201: [], sbc801: [37, 38] },
  "مستودع": { sbc201: [], sbc801: [37, 38] },
  "corrosive": { sbc201: [], sbc801: [37] },
  "أكالة": { sbc201: [], sbc801: [37] },
  "oxidizer": { sbc201: [], sbc801: [40] },
  "مؤكسد": { sbc201: [], sbc801: [40] },
  
  // Fuel & Special facilities
  "fuel": { sbc201: [], sbc801: [43] },
  "وقود": { sbc201: [], sbc801: [43] },
  "محطة وقود": { sbc201: [], sbc801: [43] },
  "welding": { sbc201: [], sbc801: [49] },
  "لحام": { sbc201: [], sbc801: [49] },
  "solar": { sbc201: [], sbc801: [51] },
  "شمسي": { sbc201: [], sbc801: [51] },
  "طاقة شمسية": { sbc201: [], sbc801: [51] },
  "battery": { sbc201: [], sbc801: [50] },
  "بطارية": { sbc201: [], sbc801: [50] },
  
  // Tents & Exhibitions
  "tent": { sbc201: [], sbc801: [31] },
  "خيمة": { sbc201: [], sbc801: [31] },
  "خيام": { sbc201: [], sbc801: [31] },
  "exhibition": { sbc201: [], sbc801: [46] },
  "معرض": { sbc201: [], sbc801: [46] },
  "معارض": { sbc201: [], sbc801: [46] },
  "mall": { sbc201: [4], sbc801: [47] },
  "covered mall": { sbc201: [4], sbc801: [] },
  "مول": { sbc201: [4], sbc801: [47] },
  "مركز تجاري": { sbc201: [4], sbc801: [47] },
  "مول مغطى": { sbc201: [4], sbc801: [] },
  "healthcare": { sbc201: [4], sbc801: [] },
  "hospital": { sbc201: [4], sbc801: [] },
  "رعاية صحية": { sbc201: [4], sbc801: [] },
  "مستشفى": { sbc201: [4], sbc801: [] },
  "detention": { sbc201: [4], sbc801: [] },
  "correctional": { sbc201: [4], sbc801: [] },
  "احتجاز": { sbc201: [4], sbc801: [] },
  "إصلاحية": { sbc201: [4], sbc801: [] },
  "سجن": { sbc201: [4], sbc801: [] },
  "atrium": { sbc201: [4], sbc801: [] },
  "atria": { sbc201: [4], sbc801: [] },
  "رواق": { sbc201: [4], sbc801: [] },
  "أتريوم": { sbc201: [4], sbc801: [] },
  "underground": { sbc201: [4], sbc801: [] },
  "underground building": { sbc201: [4], sbc801: [] },
  "تحت الأرض": { sbc201: [4], sbc801: [] },
  "hotel": { sbc201: [4], sbc801: [] },
  "فندق": { sbc201: [4], sbc801: [] },
  "apartment": { sbc201: [4], sbc801: [] },
  "شقق": { sbc201: [4], sbc801: [] },
  "sleeping unit": { sbc201: [4], sbc801: [] },
  "وحدات نوم": { sbc201: [4], sbc801: [] },
  "emergency lighting": { sbc201: [10], sbc801: [] },
  "egress illumination": { sbc201: [10], sbc801: [] },
  "إضاءة طوارئ": { sbc201: [10], sbc801: [] },
  "area of refuge": { sbc201: [10], sbc801: [] },
  "accessible egress": { sbc201: [10], sbc801: [] },
  "منطقة الإيواء": { sbc201: [10], sbc801: [] },
  "exit sign": { sbc201: [10], sbc801: [] },
  "exit signage": { sbc201: [10], sbc801: [] },
  "لافتة مخرج": { sbc201: [10], sbc801: [] },
  "fire department connection": { sbc201: [], sbc801: [9] },
  "FDC": { sbc201: [], sbc801: [9] },
  "وصلة الدفاع المدني": { sbc201: [], sbc801: [9] },
  "carbon monoxide": { sbc201: [], sbc801: [9] },
  "CO alarm": { sbc201: [], sbc801: [9] },
  "أول أكسيد الكربون": { sbc201: [], sbc801: [9] },
  "delayed egress": { sbc201: [10], sbc801: [] },
  "delayed-egress lock": { sbc201: [10], sbc801: [] },
  "panic hardware": { sbc201: [10], sbc801: [] },
  "electromagnetic lock": { sbc201: [10], sbc801: [] },
  "door hardware": { sbc201: [10], sbc801: [] },
  "تأخير خروج": { sbc201: [10], sbc801: [] },
  "ذراع الذعر": { sbc201: [10], sbc801: [] },
  "قفل كهرومغناطيسي": { sbc201: [10], sbc801: [] },
  "handrail height": { sbc201: [10], sbc801: [] },
  "handrail graspability": { sbc201: [10], sbc801: [] },
  "درابزين الدرج": { sbc201: [10], sbc801: [] },
  "emergency escape": { sbc201: [10], sbc801: [] },
  "rescue opening": { sbc201: [10], sbc801: [] },
  "egress window": { sbc201: [10], sbc801: [] },
  "EERO": { sbc201: [10], sbc801: [] },
  "نافذة الهروب": { sbc201: [10], sbc801: [] },
  "فتحة الإنقاذ": { sbc201: [10], sbc801: [] },
  "smoke control system": { sbc201: [], sbc801: [9] },
  "نظام تحكم الدخان": { sbc201: [], sbc801: [9] },
  "stairway pressurization": { sbc201: [], sbc801: [9] },
  "ضغط الدرج": { sbc201: [], sbc801: [9] },
  
  // Laboratory & Hydrogen
  "laboratory": { sbc201: [], sbc801: [33] },
  "مختبر": { sbc201: [], sbc801: [33] },
  "hydrogen": { sbc201: [], sbc801: [34] },
  "هيدروجين": { sbc201: [], sbc801: [34] },
  "cryogenic": { sbc201: [], sbc801: [35] },
  "تبريد فائق": { sbc201: [], sbc801: [35] },
  "pipeline": { sbc201: [], sbc801: [36] },
  "أنابيب": { sbc201: [], sbc801: [36] },
};

// ==================== SBC FILE RETRIEVAL (OPTIMIZED) ====================

// In-memory cache
const fileCache: Map<string, { content: string; timestamp: number }> = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_SIZE = 30; // Increased from 20

// Query-level cache for scored results
const queryCache: Map<string, { result: { context: string; files: string[] }; timestamp: number }> = new Map();
const QUERY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const QUERY_CACHE_MAX = 20;

function cleanupCache() {
  if (fileCache.size <= CACHE_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, val] of fileCache) {
    if (now - val.timestamp > CACHE_TTL) fileCache.delete(key);
  }
  if (fileCache.size > CACHE_MAX_SIZE) {
    const sorted = [...fileCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    while (fileCache.size > CACHE_MAX_SIZE && sorted.length) {
      fileCache.delete(sorted.shift()![0]);
    }
  }
}

function cleanupQueryCache() {
  if (queryCache.size <= QUERY_CACHE_MAX) return;
  const now = Date.now();
  for (const [key, val] of queryCache) {
    if (now - val.timestamp > QUERY_CACHE_TTL) queryCache.delete(key);
  }
  if (queryCache.size > QUERY_CACHE_MAX) {
    const sorted = [...queryCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    while (queryCache.size > QUERY_CACHE_MAX && sorted.length) {
      queryCache.delete(sorted.shift()![0]);
    }
  }
}

// ---- Bilingual SBC Technical Glossary ----
// Deduplication pass 2026-04-10: merged all duplicate keys, kept union of values.
const AR_EN_GLOSSARY: Record<string, string[]> = {
  // ── Fire systems ───────────────────────────────────────────────────────────
  "حريق": ["fire", "fire protection"],
  "الحريق": ["fire", "fire protection"],
  "إطفاء": ["suppression", "extinguishing", "fire suppression"],
  "رش": ["sprinkler", "spray"],                                        // was duplicated
  "رشاش": ["sprinkler", "nozzle", "sprinkler head"],                   // merged: added "sprinkler head"
  "الرش": ["sprinkler"],
  "رشاشات": ["sprinklers", "sprinkler system", "automatic sprinkler"], // merged: added "sprinkler system","automatic sprinkler"
  "إنذار": ["alarm", "detection", "notification", "alert"],            // merged: added "alert"
  "كاشف": ["detector", "sensor"],                                      // was duplicated
  "كواشف": ["detectors", "sensors"],
  "مضخة": ["pump", "fire pump"],                                       // was duplicated
  "خرطوم": ["hose", "standpipe"],
  "طفاية": ["extinguisher"],
  // ── Compound fire-system phrases (unique — kept from added-terms block) ───
  "مقاومة حريق": ["fire resistance", "fire-resistance rating"],
  "حمل إشغال": ["occupant load", "occupancy load"],
  "مسافة سفر": ["travel distance", "exit travel"],
  "كاشف دخان": ["smoke detector", "smoke detection"],
  "كاشف حرارة": ["heat detector", "thermal detector"],
  "نظام رش": ["sprinkler system", "automatic sprinkler"],
  "إنذار حريق": ["fire alarm", "fire alarm system"],
  "مضخة حريق": ["fire pump", "fire pump system"],
  "صاعد": ["standpipe", "riser", "vertical pipe"],
  "صاعد مائي": ["standpipe", "standpipe system"],
  "حاجز حريق": ["fire barrier", "fire wall", "fire separation"],
  "جدار حريق": ["fire wall", "firewall", "fire barrier"],
  "فاصل حريق": ["fire separation", "fire partition"],
  "مقاومة للحريق": ["fire-rated", "fire resistant", "fire resistance"],
  "تحكم دخان": ["smoke control", "smoke management"],
  "مانع دخان": ["smoke barrier", "smoke partition"],
  // ── Building elements ─────────────────────────────────────────────────────
  "مقاومة": ["resistance", "fire resistance", "rated", "rating"],      // merged: added "rating"
  "تصنيف": ["classification", "rating", "type"],                       // was duplicated
  "مبنى": ["building", "structure"],
  "مباني": ["buildings", "structures"],
  "بناء": ["building", "construction"],
  "إنشاء": ["construction", "building construction"],
  "نوع إنشاء": ["construction type", "type of construction"],
  "ارتفاع": ["height", "elevation", "rise", "building height"],        // merged: added "building height"
  "مساحة": ["area", "floor area", "square", "allowable area"],         // merged: added "allowable area"
  "مساحة أرضية": ["floor area", "allowable area"],
  "طابق": ["floor", "story", "storey", "level"],                       // was duplicated; kept richer first form
  "طوابق": ["floors", "stories", "storeys", "levels"],                 // was duplicated; kept richer first form
  "أدوار": ["stories", "floors", "levels"],
  "دور": ["story", "floor", "level"],
  "سقف": ["roof", "ceiling"],
  "جدار": ["wall", "partition"],
  "جدران": ["walls", "partitions"],
  "عمود": ["column", "pillar"],
  "دخان": ["smoke", "smoke control"],
  // ── Occupancy ─────────────────────────────────────────────────────────────
  "إشغال": ["occupancy", "occupant", "use"],                           // was duplicated
  "قسم": ["section", "division"],
  "مجموعة": ["group", "occupancy group"],
  "سكني": ["residential", "dwelling", "R-occupancy"],
  "تجاري": ["commercial", "mercantile", "business", "M-occupancy", "B-occupancy"],
  "صناعي": ["industrial", "factory", "F-occupancy"],
  "تعليمي": ["educational", "E-occupancy"],
  "مختلط": ["mixed", "mixed-use", "mixed occupancy"],
  "تجمع": ["assembly", "A-occupancy", "gathering"],
  "تخزين": ["storage", "S-occupancy", "warehouse"],
  "مستشفى": ["hospital", "health care", "I-2", "I-occupancy", "healthcare occupancy", "Group I-2"],
  "إضاءة طوارئ": ["emergency lighting", "egress illumination", "exit lighting", "emergency egress lighting"],
  "إضاءة مسار الهروب": ["egress illumination", "means of egress illumination", "exit path lighting"],
  "منطقة الإيواء": ["area of refuge", "area of rescue assistance", "accessible egress refuge"],
  "مخرج للمعاقين": ["accessible means of egress", "accessible exit", "wheelchair egress"],
  "لافتة مخرج": ["exit sign", "exit signage", "illuminated exit sign"],
  "وصلة الدفاع المدني": ["fire department connection", "FDC", "sprinkler inlet", "standpipe inlet"],
  "توصيلة الإطفاء": ["fire department connection", "FDC", "fire inlet"],
  "أول أكسيد الكربون": ["carbon monoxide", "CO alarm", "CO detector", "CO detection"],
  "كاشف CO": ["CO detector", "carbon monoxide detector", "CO alarm"],
  "رواق": ["atrium", "atria", "multi-story opening", "floor opening"],
  "أتريوم": ["atrium", "atria", "floor opening multiple stories"],
  "فتحة الطوابق": ["atrium", "floor opening", "multi-story opening"],
  "بهو مفتوح": ["atrium lobby", "open atrium", "multi-story atrium"],
  "تحت الأرض": ["underground", "below grade", "subterranean"],
  "مبنى تحت الأرض": ["underground building", "below grade building", "subterranean"],
  "دور الميزانين": ["mezzanine", "underground level", "below grade floor"],
  "مول": ["mall", "covered mall", "shopping mall", "mall building"],
  "مول مغطى": ["covered mall", "covered mall building", "enclosed mall"],
  "مركز التسوق": ["shopping mall", "covered mall", "mall building"],
  "رعاية صحية": ["health care", "healthcare", "I-2", "Group I-2", "patient care"],
  "مرضى": ["patients", "inpatient", "patient care", "I-2"],
  "احتجاز": ["detention", "correctional", "I-3", "Group I-3", "jail", "prison"],
  "إصلاحية": ["correctional facility", "detention facility", "I-3", "Group I-3"],
  "سجن": ["prison", "detention", "I-3", "correctional"],
  "سجون": ["prisons", "detention facilities", "I-3"],
  "حالة الاستخدام": ["use condition", "use condition I", "use condition II", "use condition III", "use condition IV", "use condition V"],
  "مقصورة دخان": ["smoke compartment", "smoke barrier", "smoke zone"],
  "مقصورات دخان": ["smoke compartments", "smoke barriers", "smoke zones"],
  "كشك": ["kiosk", "mall kiosk", "temporary structure"],
  "فندق": ["hotel", "R-1", "transient", "sleeping unit", "Group R-1"],
  "شقق": ["apartments", "dwelling units", "R-2", "Group R-2"],
  "فلل": ["villas", "dwelling", "R-3", "Group R-3"],
  "وحدات نوم": ["sleeping units", "sleeping rooms", "I-1", "R-1", "R-2", "R-3"],
  "فصل الوحدات": ["unit separation", "dwelling unit separation", "fire partition between units"],
  "كاشف دخان غرفة نوم": ["smoke alarm sleeping room", "smoke detector bedroom"],
  "تأخير خروج": ["delayed egress", "delayed-egress lock", "15-second delay", "30-second delay"],
  "قفل تأخير": ["delayed-egress lock", "delayed egress lock", "15-second delay"],
  "قفل كهرومغناطيسي": ["electromagnetic lock", "access-controlled egress door", "mag-lock"],
  "ذراع الذعر": ["panic hardware", "panic bar", "panic device", "exit device", "horizontal push bar"],
  "أجهزة الباب": ["door hardware", "egress hardware", "door latch", "door operation"],
  "نافذة الهروب": ["emergency escape opening", "egress window", "rescue opening", "EERO"],
  "فتحة الإنقاذ": ["rescue opening", "emergency escape opening", "egress window", "EERO"],
  "ارتفاع العتبة": ["sill height", "window sill height", "44-inch sill", "maximum sill height"],
  "نظام تحكم الدخان": ["smoke control system", "smoke exhaust system", "mechanical smoke control"],
  "طبقة الدخان": ["smoke layer", "smoke interface", "smoke layer interface", "smoke layer height"],
  "ضغط الدرج": ["stairway pressurization", "pressurized stairway", "positive pressure stairway"],
  "درابزين": ["handrail", "handrails", "stair rail", "ramp rail"],
  "دار مسنين": ["assisted living", "care facility", "I-1", "Group I-1"],
  "رعاية مقيمة": ["residential care", "assisted living", "I-1", "Group I-1"],
  "مسكن": ["dwelling", "residence", "habitable"],
  "وحدات": ["units", "dwelling units"],
  "وحدة": ["unit", "dwelling unit"],
  // ── Occupancy classification (Ch.3) ────────────────────────────────────────
  "تصنيف الإشغال": ["occupancy classification", "use group", "occupancy group", "classify occupancy"],
  "مجموعة الإشغال": ["occupancy group", "use group", "occupancy classification"],
  "فئة الاستخدام": ["use group", "occupancy group", "use classification"],
  "مجموعة التجمع": ["assembly group", "Group A", "A occupancy"],
  "إشغال التجمع": ["assembly occupancy", "Group A", "A-1 A-2 A-3 A-4 A-5"],
  "مجموعة الأعمال": ["business group", "Group B", "B occupancy"],
  "مجموعة التعليم": ["educational group", "Group E", "E occupancy"],
  "مجموعة التصنيع": ["factory group", "Group F", "F-1 F-2 occupancy"],
  "مجموعة الخطر": ["high hazard group", "Group H", "H occupancy", "hazardous occupancy"],
  "مجموعة المؤسسية": ["institutional group", "Group I", "I occupancy"],
  "إشغال مؤسسي": ["institutional occupancy", "Group I", "I-1 I-2 I-3 I-4"],
  "مجموعة التجزئة": ["mercantile group", "Group M", "M occupancy"],
  "مجموعة السكن": ["residential group", "Group R", "R occupancy", "R-1 R-2 R-3 R-4"],
  "مجموعة التخزين": ["storage group", "Group S", "S occupancy", "S-1 S-2"],
  "مجموعة المرافق": ["utility group", "Group U", "U occupancy", "miscellaneous"],
  "إشغال مختلط": ["mixed occupancy", "multiple occupancy", "mixed use"],
  "مبنى متعدد الاستخدامات": ["mixed-use building", "mixed occupancy", "multiple occupancy"],
  "إشغال إضافي": ["accessory occupancy", "ancillary occupancy", "10 percent accessory"],
  "فصل الإشغال": ["occupancy separation", "fire barrier between occupancies", "separated occupancies"],
  "إشغال غير مفصول": ["nonseparated occupancy", "nonseparated mixed occupancy", "508.3"],
  "إشغال مفصول": ["separated occupancy", "separated mixed occupancy", "508.4"],
  // ── Group detail terms ─────────────────────────────────────────────────────
  "عيادة خارجية": ["outpatient clinic", "ambulatory clinic", "Group B", "B occupancy"],
  "مبنى مكاتب": ["office building", "Group B", "B occupancy", "professional office"],
  "مدرسة K-12": ["K-12 school", "Group E", "educational occupancy"],
  "حضانة أطفال": ["day care", "child day care", "I-4", "E occupancy", "Group E"],
  "روضة أطفال": ["kindergarten", "Group E", "K-12 school", "educational occupancy"],
  "مصنع": ["factory", "Group F", "F-1", "F-2", "manufacturing"],
  "منشأة صناعية": ["industrial facility", "factory", "Group F", "F-1 F-2"],
  "مواد خطرة": ["hazardous materials", "Group H", "MAQ", "maximum allowable quantities"],
  "كميات مسموح بها": ["maximum allowable quantities", "MAQ", "Group H threshold"],
  "متجر تجزئة": ["retail store", "Group M", "mercantile occupancy"],
  "سوبرماركت": ["supermarket", "grocery store", "Group M", "mercantile"],
  "معرض سيارات": ["vehicle showroom", "car showroom", "Group M", "mercantile"],
  "شقق فندقية": ["hotel apartments", "R-1 or R-2", "transient residential", "extended stay"],
  "سكن عمال": ["staff accommodation", "worker housing", "R-2", "Group R-2"],
  "فيلا": ["villa", "single-family", "R-3", "Group R-3"],
  "مستودع بضائع": ["merchandise warehouse", "S-1", "storage occupancy", "combustible storage"],
  "تخزين بارد": ["cold storage", "refrigerated warehouse", "S-2", "Group S-2"],
  "مرآب خاص": ["private garage", "Group U", "utility occupancy"],
  "مبنى زراعي": ["agricultural building", "Group U", "utility and miscellaneous"],
  "دار رعاية المسنين": ["assisted living", "elderly care", "I-1", "R-4", "Group I-1"],
  "رعاية نهارية": ["day care", "I-4", "Group I-4", "adult day care", "child day care"],
  "القدرة على الإخلاء الذاتي": ["self-preservation", "self-preservation ability", "incapacitated occupant"],
  // ── Egress ────────────────────────────────────────────────────────────────
  "مخرج": ["exit", "egress", "means of egress"],                       // was duplicated
  "مخارج": ["exits", "egress", "means of egress"],
  "مخرج طوارئ": ["emergency exit", "exit"],
  "طوارئ": ["emergency", "emergency exit"],
  "مسار هروب": ["means of egress", "escape route", "exit path"],
  "هروب": ["escape", "egress", "evacuation"],                          // was duplicated
  "إخلاء": ["evacuation", "egress"],                                   // was duplicated
  "ممر": ["corridor", "passage", "aisle", "hallway"],                  // was duplicated; kept richer first form
  "درج": ["stair", "stairway", "staircase"],                           // was duplicated
  "سلم": ["stair", "stairway", "ladder"],                              // was duplicated
  "سلالم": ["stairs", "stairways", "staircases"],
  "مصعد": ["elevator", "lift"],
  "درابزين": ["handrail", "handrails", "guardrail", "railing", "guard"],
  "منحدر": ["ramp", "ramped aisle", "slope"],
  "سفر": ["travel", "travel distance"],
  "مسافة": ["distance", "travel distance", "separation"],
  "عرض": ["width", "breadth"],
  "طول": ["length", "height"],
  // ── Openings ──────────────────────────────────────────────────────────────
  "باب": ["door", "doorway", "opening"],
  "أبواب": ["doors", "doorways"],
  "فتحة": ["opening", "aperture", "penetration"],                      // merged: added "penetration"
  "فتحات": ["openings", "apertures", "penetrations"],                  // merged: added "penetrations"
  // ── Loads & capacity ─────────────────────────────────────────────────────
  "حمل": ["load", "occupant load", "capacity"],
  "سعة": ["capacity", "occupancy load"],
  // ── MEP ──────────────────────────────────────────────────────────────────
  "نظام": ["system", "installation"],
  "أنظمة": ["systems", "installations"],
  "تهوية": ["ventilation", "HVAC", "air"],
  "هواء": ["air", "ventilation"],
  "الهواء": ["air", "ventilation", "air supply"],
  "تكييف": ["air conditioning", "HVAC", "cooling"],
  "كهرباء": ["electrical", "electric", "power"],
  "سباكة": ["plumbing", "piping"],
  "ضغط": ["pressure", "pressurization"],
  "تعويض": ["compensation", "make-up", "makeup air"],
  "التعويض": ["compensation", "make-up air", "makeup"],
  "مراوح": ["fans", "blowers"],
  // ── Code references ───────────────────────────────────────────────────────
  "متطلبات": ["requirements", "provisions", "criteria"],
  "اشتراطات": ["requirements", "provisions", "regulations"],
  "لائحة": ["regulation", "code", "standard"],
  "كود": ["code", "standard"],
  "مادة": ["section", "clause", "article"],
  "فصل": ["chapter", "section"],
  "جدول": ["table", "schedule"],
  "ملحق": ["appendix", "annex", "supplement"],
  "تصريح": ["permit", "approval"],
  // ── Materials ─────────────────────────────────────────────────────────────
  "خرسانة": ["concrete", "reinforced concrete"],
  "حديد": ["steel", "iron", "metal"],
  "خشب": ["wood", "timber", "combustible"],
  "عازل": ["insulation", "barrier", "fire barrier"],
  "حاجز": ["barrier", "separation", "fire barrier"],
  // ── Safety ────────────────────────────────────────────────────────────────
  "حماية": ["protection", "fire protection", "safeguard"],
  "وقاية": ["prevention", "protection", "safety"],
  "سلامة": ["safety", "life safety"],
  "تلقائي": ["automatic", "auto"],
  "يدوي": ["manual", "hand-operated"],
};

// ---- Smart Chunk Scoring (OPTIMIZED) ----
interface ScoredChunk {
  text: string;
  score: number;
  source: string;
}

function buildQueryKeywords(query: string): string[] {
  const raw = query.toLowerCase();
  const arabicTokens = raw.split(/[\s,،.؟?!:;()\[\]{}"']+/).filter(t => t.length > 2);
  
  const englishTokens: string[] = [];
  for (const token of arabicTokens) {
    const translations = AR_EN_GLOSSARY[token];
    if (translations) {
      englishTokens.push(...translations);
    }
  }
  
  for (const [arWord, enWords] of Object.entries(AR_EN_GLOSSARY)) {
    if (raw.includes(arWord) && !arabicTokens.includes(arWord)) {
      englishTokens.push(...enWords);
    }
  }
  
  const tokens = [...arabicTokens, ...englishTokens];
  
  const patterns = [
    "sbc 201", "sbc 801", "sbc201", "sbc801",
    // Chapter 4 — Special Detailed Requirements
    "section 403", "section 406", "403.1", "406.5", "406.6",
    "high-rise", "high rise", "open parking", "enclosed parking",
    // Chapter 5 — Heights, Areas, Incidental Uses
    "table 504", "table 506", "table 509", "504.3", "504.4", "506.2", "509",
    // Chapter 6 — Construction Types
    "table 601", "table 602", "601", "602",
    // Chapter 7 — Fire & Smoke Protection
    "table 705", "705.8",
    // Chapter 10 — Means of Egress + Assembly
    "table 1004", "table 1005", "table 1006", "table 1011",
    "table 1017", "table 1018", "table 1020", "table 1021", "table 1029",
    "section 1004", "section 1005", "section 1006", "section 1011",
    "section 1017", "section 1018", "section 1020", "section 1021", "section 1029",
    "1004.5", "1005.1", "1006.3", "1011.2", "1017.2", "1018.1", "1020.1", "1021.2",
    "1029.6",
    // SBC 801 — Fire Suppression
    "table 903", "section 903", "903.2", "903.3",
  ];
  for (const p of patterns) {
    if (raw.includes(p)) tokens.push(p);
  }

  // --- Auto-extract section numbers (e.g., 903.2, 1006.3.4) ---
  const sectionNumRegex = /\b(\d{3,4}\.\d{1,2}(?:\.\d{1,2})?)\b/g;
  let sMatch;
  while ((sMatch = sectionNumRegex.exec(raw)) !== null) {
    tokens.push(sMatch[1]); // "903.2"
    const parent = sMatch[1].split(".").slice(0, 2).join(".");
    if (parent !== sMatch[1]) tokens.push(parent); // parent "903.2" from "903.2.1"
    tokens.push("section " + sMatch[1]);
  }

  // --- Auto-extract table references (e.g., "table 903.2", "جدول 903") ---
  const tableRefRegex = /(?:table|جدول)\s*(\d{1,4}(?:\.\d{1,2})?)/gi;
  let tMatch;
  while ((tMatch = tableRefRegex.exec(raw)) !== null) {
    tokens.push("table " + tMatch[1].toLowerCase());
    tokens.push(tMatch[1].toLowerCase());
  }

  // --- Auto-extract occupancy groups (e.g., "Group B", "مجموعة A-2") ---
  const groupRegex = /(?:group|مجموعة)\s*([a-u](?:-\d)?)/gi;
  let gMatch;
  while ((gMatch = groupRegex.exec(raw)) !== null) {
    tokens.push("group " + gMatch[1].toLowerCase());
  }

  // --- Auto-extract construction types (e.g., "Type V-B", "نوع I-A") ---
  const typeRegex = /(?:type|نوع)\s*((?:i{1,3}|iv|v)(?:-[ab])?)/gi;
  let cMatch;
  while ((cMatch = typeRegex.exec(raw)) !== null) {
    tokens.push("type " + cMatch[1].toLowerCase());
  }

  const uniqueTokens = [...new Set(tokens)];
  
  console.log(`🔤 Keywords: ${uniqueTokens.length} (${arabicTokens.length} ar + ${englishTokens.length} en)`);
  
  return uniqueTokens;
}

// ---- QueryMeta for structured scoring ----
interface QueryMeta {
  sectionNumbers: string[];   // ["903.2", "1006.3"]
  tableRefs: string[];        // ["table 903.2", "903"]
  occupancyGroups: string[];  // ["group b"]
  constructionTypes: string[]; // ["type v-b"]
  exactPhrases: string[];     // ["automatic sprinkler", "نظام رش"]
}

const DOMAIN_PHRASES = [
  "automatic sprinkler", "fire alarm", "fire alarm system", "fire barrier",
  "fire wall", "fire separation", "fire resistance", "fire-resistance rating",
  "fire pump", "fire pump system", "fire protection", "fire department",
  "means of egress", "travel distance", "exit access", "exit discharge",
  "occupant load", "occupancy group", "smoke control", "smoke detector",
  "smoke barrier", "standpipe system", "standpipe", "construction type",
  "type of construction", "floor area", "building height", "allowable area",
  "fire command", "emergency exit",
  "نظام رش", "نظام إنذار", "إنذار حريق", "مسافة سفر", "حمل إشغال",
  "مقاومة حريق", "حاجز حريق", "جدار حريق", "كاشف دخان", "مضخة حريق",
  "مخرج طوارئ", "تحكم دخان", "صاعد مائي", "نظام رش تلقائي",
  "مسار هروب", "فاصل حريق", "مقاومة للحريق",
];

function buildQueryMeta(query: string): QueryMeta {
  const raw = query.toLowerCase();
  const meta: QueryMeta = {
    sectionNumbers: [],
    tableRefs: [],
    occupancyGroups: [],
    constructionTypes: [],
    exactPhrases: [],
  };

  // Extract section numbers
  const secRegex = /\b(\d{3,4}\.\d{1,2}(?:\.\d{1,2})?)\b/g;
  let m;
  while ((m = secRegex.exec(raw)) !== null) {
    meta.sectionNumbers.push(m[1]);
  }

  // Extract table references
  const tblRegex = /(?:table|جدول)\s*(\d{1,4}(?:\.\d{1,2})?)/gi;
  while ((m = tblRegex.exec(raw)) !== null) {
    meta.tableRefs.push("table " + m[1].toLowerCase());
  }

  // Extract occupancy groups
  const grpRegex = /(?:group|مجموعة)\s*([a-u](?:-\d)?)/gi;
  while ((m = grpRegex.exec(raw)) !== null) {
    meta.occupancyGroups.push("group " + m[1].toLowerCase());
  }

  // Extract construction types
  const typRegex = /(?:type|نوع)\s*((?:i{1,3}|iv|v)(?:-[ab])?)/gi;
  while ((m = typRegex.exec(raw)) !== null) {
    meta.constructionTypes.push("type " + m[1].toLowerCase());
  }

  // Extract domain exact phrases
  for (const phrase of DOMAIN_PHRASES) {
    if (raw.includes(phrase.toLowerCase())) {
      meta.exactPhrases.push(phrase.toLowerCase());
    }
  }

  console.log(`🔍 QueryMeta: sections=${meta.sectionNumbers.join(",")}, tables=${meta.tableRefs.join(",")}, groups=${meta.occupancyGroups.join(",")}, types=${meta.constructionTypes.join(",")}, phrases=${meta.exactPhrases.length}`);
  return meta;
}

function scoreChunk(chunkText: string, keywords: string[], queryMeta?: QueryMeta): number {
  const lower = chunkText.toLowerCase();
  let score = 0;
  
  // Penalize very short chunks
  if (chunkText.length < 100) return 0;
  
  for (const kw of keywords) {
    const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = lower.match(regex);
    if (matches) {
      // SBC references get 3x weight
      const weight = /^(sbc|table|section|\d{3}\.\d)/.test(kw) ? 3 : 1;
      score += matches.length * weight;
    }
  }
  
  // Bonus for chunks containing tables
  if (/\btable\s+\d+/i.test(lower) || /جدول\s+\d+/.test(lower)) {
    score += 5;
  }
  
  // Bonus for chunks with specific section numbers (e.g., 903.2.1, 1006.3.4)
  const sectionMatches = lower.match(/\d{3,4}\.\d+(\.\d+)?/g);
  if (sectionMatches && sectionMatches.length > 0) {
    score += Math.min(sectionMatches.length * 2, 10);
  }

  // --- QueryMeta-based precision scoring (backward compatible) ---
  if (queryMeta) {
    // 1. Section Number Exact Match (×5 per match)
    for (const sec of queryMeta.sectionNumbers) {
      const secEscaped = sec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${secEscaped}\\b`).test(lower)) {
        score += 5;
      }
    }

    // 2. Table Reference Match (×4 per match)
    for (const tbl of queryMeta.tableRefs) {
      const tblEscaped = tbl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(tblEscaped, "i").test(lower)) {
        score += 4;
      }
    }

    // 3. Exact Phrase Match (×3 per phrase)
    for (const phrase of queryMeta.exactPhrases) {
      if (lower.includes(phrase)) {
        score += 3;
      }
    }

    // 4. Occupancy Group Match (×3 per match)
    for (const grp of queryMeta.occupancyGroups) {
      const grpEscaped = grp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(grpEscaped, "i").test(lower)) {
        score += 3;
      }
    }

    // 5. Construction Type Match (×3 per match)
    for (const typ of queryMeta.constructionTypes) {
      const typEscaped = typ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(typEscaped, "i").test(lower)) {
        score += 3;
      }
    }
  }

  // Bonus for chapter headings
  if (/\bchapter\s+\d+/i.test(lower) || /الفصل\s+\d+/.test(lower)) {
    score += 3;
  }

  return score;
}

function extractAndScoreChunks(rawJson: string, fileName: string, keywords: string[], queryMeta?: QueryMeta): ScoredChunk[] {
  const scored: ScoredChunk[] = [];

  try {
    const parsed = JSON.parse(rawJson);

    let chunks: any[] = [];

    if (Array.isArray(parsed)) {
      chunks = parsed;
    } else if (parsed.chunks && Array.isArray(parsed.chunks)) {
      chunks = parsed.chunks;
    } else if (parsed.sections && Array.isArray(parsed.sections)) {
      chunks = parsed.sections;
    } else if (parsed.content && typeof parsed.content === "string") {
      const sections = parsed.content.split(/(?=(?:Chapter|Section|Article|المادة|الفصل|الباب)\s)/i);
      chunks = sections.map((s: string) => ({ text: s, content: s }));
    } else {
      const text = JSON.stringify(parsed);
      const s = scoreChunk(text, keywords, queryMeta);
      if (s > 0) scored.push({ text: text.slice(0, 5000), score: s, source: fileName });
      return scored;
    }

    for (const chunk of chunks) {
      const text = typeof chunk === "string"
        ? chunk
        : (chunk.text || chunk.content || chunk.body || JSON.stringify(chunk));

      if (!text || text.length < 20) continue;

      const s = scoreChunk(text, keywords, queryMeta);
      // Only include chunks with score > 0 (skip irrelevant chunks)
      if (s > 0) {
        scored.push({ text, score: s, source: fileName });
      }
    }
  } catch {
    const s = scoreChunk(rawJson, keywords, queryMeta);
    if (s > 0) scored.push({ text: rawJson.slice(0, 5000), score: s, source: fileName });
  }

  return scored;
}

// ---- Determine target chapters from query ----
function getTargetChapters(query: string): { sbc201Chapters: number[]; sbc801Chapters: number[] } {
  const lower = query.toLowerCase();
  const sbc201Chapters = new Set<number>();
  const sbc801Chapters = new Set<number>();

  // Check keyword map against English terms
  for (const [keyword, chapters] of Object.entries(CHAPTER_KEYWORDS)) {
    if (lower.includes(keyword)) {
      chapters.sbc201.forEach(c => sbc201Chapters.add(c));
      chapters.sbc801.forEach(c => sbc801Chapters.add(c));
    }
  }

  // Also translate Arabic keywords via glossary and check CHAPTER_KEYWORDS
  for (const [arWord, enWords] of Object.entries(AR_EN_GLOSSARY)) {
    if (lower.includes(arWord)) {
      for (const enWord of enWords) {
        const chapters = (CHAPTER_KEYWORDS as Record<string, { sbc201: number[]; sbc801: number[] }>)[enWord];
        if (chapters) {
          chapters.sbc201.forEach(c => sbc201Chapters.add(c));
          chapters.sbc801.forEach(c => sbc801Chapters.add(c));
        }
      }
    }
  }

  // Check for explicit chapter numbers
  const chapterMatch = lower.match(/(?:chapter|فصل)\s*(\d+)/gi);
  if (chapterMatch) {
    for (const m of chapterMatch) {
      const num = parseInt(m.match(/\d+/)![0]);
      if (num <= 35) {
        sbc201Chapters.add(num);
        sbc801Chapters.add(num);
      }
    }
  }

  // Check for explicit section numbers (e.g., 903.2 -> chapter 9, or "Section 1014" bare)
  const sectionMatch = lower.match(/(?:section\s+)?(\d{3,4})\.\d/gi);
  // Also match bare integer section numbers when preceded by "section" / Arabic article forms / "clause"
  const bareSectionMatch = lower.match(/(?:section|(?:ال)?مادة|clause)\s+(\d{3,4})\b/gi);
  const allSectionMatches = [...(sectionMatch || []), ...(bareSectionMatch || [])];
  if (allSectionMatches.length > 0) {
    for (const m of allSectionMatches) {
      const secNum = parseInt(m.match(/(\d{3,4})/)?.[1] || "0");
      const chapNum = Math.floor(secNum / 100);
      if (chapNum > 0 && chapNum <= 35) {
        // SBC 801 sections 9xx are chapters 6-9, SBC 201 sections 10xx are chapter 10
        if (secNum >= 900 && secNum < 1000) {
          sbc201Chapters.add(9);
          sbc801Chapters.add(Math.min(chapNum, 14));
        } else if (secNum >= 1000 && secNum < 1100) {
          sbc201Chapters.add(10);
        } else {
          sbc201Chapters.add(chapNum);
        }
      }
    }
  }
  
  // Cross-referencing: always include both codes for fire/egress
  if (sbc201Chapters.has(9) || sbc201Chapters.has(10)) {
    sbc801Chapters.add(6);
    sbc801Chapters.add(7);
  }
  if (sbc801Chapters.has(6) || sbc801Chapters.has(7)) {
    sbc201Chapters.add(9);
    sbc201Chapters.add(10);
  }
  
  return {
    sbc201Chapters: [...sbc201Chapters],
    sbc801Chapters: [...sbc801Chapters],
  };
}

// ---- Select best file page ranges based on target chapters ----
function selectTargetPageRanges(
  targetChapters: number[],
  index: FilePageRange[]
): string[] {
  if (targetChapters.length === 0) return index.slice(0, 2).map(i => i.pageRange);
  
  const matched = new Set<string>();
  for (const chapter of targetChapters) {
    for (const entry of index) {
      if (entry.chapters.includes(chapter)) {
        matched.add(entry.pageRange);
      }
    }
  }
  
  return matched.size > 0 ? [...matched] : index.slice(0, 2).map(i => i.pageRange);
}

async function fetchSBCContext(query: string, extraKeywords?: string[]): Promise<{ context: string; files: string[] }> {
  const startTime = Date.now();
  const usedFiles: string[] = [];
  
  // Check query cache first
  const cacheKey = query.slice(0, 200).toLowerCase();
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < QUERY_CACHE_TTL) {
    console.log(`⚡ Query cache hit! Returning cached result (${cached.result.context.length} chars)`);
    return cached.result;
  }
  
  console.log("=== SBC SMART RETRIEVAL START ===");
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Missing environment variables");
    return { context: "", files: [] };
  }
  
  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from("ssss")
      .list("", { limit: 100 });
    
    if (listError || !files?.length) {
      console.error("❌ Error listing files:", listError?.message);
      return { context: "", files: [] };
    }
    
    console.log(`📁 Found ${files.length} total files`);
    
    // Get target chapters from query
    let { sbc201Chapters, sbc801Chapters } = getTargetChapters(query);

    // Secondary pass: if chapters are still empty, run chapter detection on the
    // English-translated keywords (covers Arabic keyword queries where the in-function
    // Unicode string comparison may not match due to runtime encoding).
    if (sbc201Chapters.length === 0 && sbc801Chapters.length === 0) {
      const translatedKeywords = buildQueryKeywords(query);
      const sbc201Set = new Set<number>();
      const sbc801Set = new Set<number>();
      for (const kw of translatedKeywords) {
        const ch = (CHAPTER_KEYWORDS as Record<string, { sbc201: number[]; sbc801: number[] }>)[kw];
        if (ch) {
          ch.sbc201.forEach(c => sbc201Set.add(c));
          ch.sbc801.forEach(c => sbc801Set.add(c));
        }
      }
      // Cross-reference
      if (sbc201Set.has(9) || sbc201Set.has(10)) { sbc801Set.add(6); sbc801Set.add(7); }
      if (sbc801Set.has(6) || sbc801Set.has(7)) { sbc201Set.add(9); sbc201Set.add(10); }
      sbc201Chapters = [...sbc201Set];
      sbc801Chapters = [...sbc801Set];
      if (sbc201Chapters.length > 0) console.log("🔄 Secondary keyword-based chapter detection used");
    }

    console.log(`🎯 Target chapters - SBC 201: [${sbc201Chapters.join(",")}], SBC 801: [${sbc801Chapters.join(",")}]`);

    // Get target page ranges
    const sbc201Ranges = selectTargetPageRanges(sbc201Chapters, SBC201_INDEX);
    const sbc801Ranges = selectTargetPageRanges(sbc801Chapters, SBC801_INDEX);
    console.log(`📄 Target ranges - SBC 201: [${sbc201Ranges.join(",")}], SBC 801: [${sbc801Ranges.join(",")}]`);
    
    // Filter candidate files
    let chunkFiles = files.filter((f: any) => 
      f.name.endsWith(".json") && 
      f.name.toLowerCase().includes("chunk")
    );
    
    let extractedFiles = files.filter((f: any) => 
      f.name.endsWith(".json") && 
      !f.name.toLowerCase().includes("chunk")
    );
    
    let candidateFiles = chunkFiles.length > 0 ? chunkFiles : extractedFiles;
    
    if (candidateFiles.length === 0) {
      candidateFiles = files.filter((f: any) => f.name.endsWith(".json"));
    }
    
    if (candidateFiles.length === 0) {
      return { context: "", files: [] };
    }
    
    // Smart file selection based on page ranges
    const sbc201Files = candidateFiles.filter((f: any) => {
      const nameLower = f.name.toLowerCase();
      return nameLower.includes("201") || nameLower.includes("building");
    });
    const sbc801Files = candidateFiles.filter((f: any) => {
      const nameLower = f.name.toLowerCase();
      return nameLower.includes("801") || nameLower.includes("fire");
    });
    
    // Score files by matching page ranges in filenames
    function scoreFile(file: any, targetRanges: string[]): number {
      const name = file.name.toLowerCase();
      let bestScore = 0;
      for (const range of targetRanges) {
        const [start, end] = range.split("-").map(Number);
        // Check if filename contains page numbers in this range
        const pageMatch = name.match(/(\d+)\s*-\s*(\d+)/);
        if (pageMatch) {
          const fStart = parseInt(pageMatch[1]);
          const fEnd = parseInt(pageMatch[2]);
          // Overlap check
          if (fStart <= end && fEnd >= start) {
            const overlap = Math.min(fEnd, end) - Math.max(fStart, start);
            bestScore = Math.max(bestScore, overlap);
          }
        } else {
          // No page range in name, give default score
          bestScore = Math.max(bestScore, 1);
        }
      }
      return bestScore;
    }
    
    // Sort and select files with smart targeting
    const scored201 = sbc201Files.map(f => ({ file: f, score: scoreFile(f, sbc201Ranges) }))
      .sort((a, b) => b.score - a.score);
    const scored801 = sbc801Files.map(f => ({ file: f, score: scoreFile(f, sbc801Ranges) }))
      .sort((a, b) => b.score - a.score);
    
    // Select top files: when chapters are targeted, prefer only the scored files
    // (score > 0 = overlaps target ranges). Zero-score files dilute the context budget.
    const targeted201 = scored201.filter(s => s.score > 0);
    const targeted801 = scored801.filter(s => s.score > 0);
    const max201 = targeted201.length > 0
      ? Math.min(targeted201.length, 4)  // only use files that actually cover the target chapters
      : Math.min(scored201.length, 3);   // fallback: first 3
    const max801 = targeted801.length > 0
      ? Math.min(targeted801.length, 4)
      : Math.min(scored801.length, 3);

    let selectedFiles = [
      ...scored201.slice(0, max201).map(s => s.file),
      ...scored801.slice(0, max801).map(s => s.file),
    ];
    
    // Ensure at least some files
    if (selectedFiles.length < 3) {
      const remaining = candidateFiles.filter(f => !selectedFiles.includes(f));
      selectedFiles = [...selectedFiles, ...remaining.slice(0, 5 - selectedFiles.length)];
    }

    // Cap at 12 files max (increased from 7 for better coverage)
    selectedFiles = selectedFiles.slice(0, 12);
    
    console.log(`🎯 Selected ${selectedFiles.length} files: ${selectedFiles.map((f: any) => f.name).join(", ")}`);
    
    const MAX_TOTAL_CONTEXT = 120000; // Increased for better RAG coverage (Gemini supports 1M tokens)
    let keywords = buildQueryKeywords(query);
    
    if (extraKeywords && extraKeywords.length > 0) {
      keywords = [...new Set([...keywords, ...extraKeywords])];
    }

    // Build structured query metadata for precision scoring
    const queryMeta = buildQueryMeta(query);

    // Download files in parallel
    const downloadPromises = selectedFiles.map(async (file: any) => {
      try {
        const cachedFile = fileCache.get(file.name);
        if (cachedFile && Date.now() - cachedFile.timestamp < CACHE_TTL) {
          console.log(`⚡ Cache hit: ${file.name}`);
          usedFiles.push(file.name);
          return { fileName: file.name, raw: cachedFile.content };
        }
        
        console.log(`⬇️ Downloading: ${file.name}`);
        const { data, error } = await supabaseAdmin.storage
          .from("ssss")
          .download(file.name);
        
        if (error || !data) {
          console.error(`❌ Download failed: ${file.name}`, error?.message);
          return null;
        }
        
        const text = await data.text();
        fileCache.set(file.name, { content: text, timestamp: Date.now() });
        cleanupCache();
        usedFiles.push(file.name);
        
        return { fileName: file.name, raw: text };
      } catch (err) {
        console.error(`❌ Exception: ${file.name}`, err);
        return null;
      }
    });
    
    const downloadResults = await Promise.all(downloadPromises);
    const validDownloads = downloadResults.filter(Boolean) as { fileName: string; raw: string }[];

    // Extract and score chunks - only keeps scored > 0
    let allScoredChunks: ScoredChunk[] = [];
    for (const dl of validDownloads) {
      const chunks = extractAndScoreChunks(dl.raw, dl.fileName, keywords, queryMeta);
      allScoredChunks.push(...chunks);
    }
    
    console.log(`🧩 ${allScoredChunks.length} relevant chunks from ${validDownloads.length} files (zero-score filtered out)`);
    
    // Sort by score descending
    allScoredChunks.sort((a, b) => b.score - a.score);
    
    // Select top chunks with early termination
    let totalChars = 0;
    const selectedChunks: ScoredChunk[] = [];
    for (const chunk of allScoredChunks) {
      if (totalChars + chunk.text.length > MAX_TOTAL_CONTEXT) {
        if (chunk.score > 0) {
          const remaining = MAX_TOTAL_CONTEXT - totalChars;
          if (remaining > 500) {
            selectedChunks.push({ ...chunk, text: chunk.text.slice(0, remaining) + "\n...[truncated]" });
            totalChars += remaining;
          }
        }
        break;
      }
      selectedChunks.push(chunk);
      totalChars += chunk.text.length;
    }
    
    const sourcesUsed = [...new Set(selectedChunks.map(c => c.source))];
    console.log(`📋 Selected ${selectedChunks.length} chunks, ${totalChars} chars from ${sourcesUsed.join(", ")} in ${Date.now() - startTime}ms`);
    
    // Fallback to extracted files if chunks failed
    if (selectedChunks.length === 0 && chunkFiles.length > 0 && extractedFiles.length > 0) {
      console.log("⚠️ Chunk files failed, trying extracted files as fallback...");
      const fallbackFiles = extractedFiles.slice(0, 4);
      
      const fallbackPromises = fallbackFiles.map(async (file: any) => {
        try {
          const { data, error } = await supabaseAdmin.storage.from("ssss").download(file.name);
          if (error || !data) return null;
          const text = await data.text();
          const truncated = text.length > 30000 ? text.slice(0, 30000) + "\n...[truncated]" : text;
          usedFiles.push(file.name);
          return `\n=== ${file.name} ===\n${truncated}`;
        } catch {
          return null;
        }
      });
      
      const fallbackResults = await Promise.all(fallbackPromises);
      const validFallback = fallbackResults.filter(Boolean);
      
      if (validFallback.length > 0) {
        const context = `\n\n📚 SBC REFERENCE DOCUMENTS (USE THESE AS PRIMARY SOURCE):\n${validFallback.join("\n")}`;
        const result = { context, files: usedFiles };
        queryCache.set(cacheKey, { result, timestamp: Date.now() });
        cleanupQueryCache();
        return result;
      }
    }
    
    if (selectedChunks.length > 0) {
      const bySource = new Map<string, string[]>();
      for (const c of selectedChunks) {
        if (!bySource.has(c.source)) bySource.set(c.source, []);
        bySource.get(c.source)!.push(c.text);
      }
      
      let contextStr = "\n\n📚 SBC REFERENCE DOCUMENTS (MOST RELEVANT SECTIONS SELECTED):\n";
      for (const [source, texts] of bySource) {
        contextStr += `\n=== ${source} (${texts.length} relevant sections) ===\n${texts.join("\n---\n")}`;
      }
      
      const result = { context: contextStr, files: [...sourcesUsed] };
      queryCache.set(cacheKey, { result, timestamp: Date.now() });
      cleanupQueryCache();
      return result;
    }
    
    return { context: "", files: [] };
  } catch (error) {
    console.error("❌ Critical error in fetchSBCContext:", error);
    return { context: "", files: [] };
  }
}

// ==================== STRUCTURED TABLE LOOKUP (DB-backed, exact table retrieval) ====================
//
// When a user query explicitly references a known SBC table ID (e.g. "Table 1004.5",
// "جدول 504.3", "Table 1006.3.3") the answer must be grounded in the exact structured
// table row stored in sbc_code_tables rather than relying on storage-file chunk scoring,
// which can truncate or miss table data.
//
// The lookup runs BEFORE keyword/vector retrieval and its result is prepended to the
// system prompt context so Gemini sees it first and gives it highest citation priority.

/** Extract table IDs referenced in a query, e.g. "Table 504.3" → ["504.3"] */
function extractTableIds(query: string): string[] {
  const lower = query.toLowerCase();
  const found = new Set<string>();

  // Match "table 504.3", "table 1006.3.3", "جدول 1004.5", etc.
  const tblRegex = /(?:table|جدول)\s+(\d{3,4}(?:\.\d{1,2}){0,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = tblRegex.exec(lower)) !== null) {
    found.add(m[1]);
  }

  // Also match bare section numbers when they look like table IDs that we know about
  // Keep this list in sync with the sbc_code_tables rows in the DB.
  const KNOWN_TABLE_IDS = [
    // Chapter 3 — Occupancy Classification
    "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312",
    // Chapter 4 — Special Detailed Requirements (special occupancies)
    "402", "403.1", "404", "405", "406.5", "406.6", "407", "408", "412", "413", "414", "415", "416", "417", "420",
    // Chapter 5 — Heights, Areas, Incidental Uses + Mixed Occupancy
    "504.3", "504.4", "506.2", "508", "509",
    // Chapter 6 — Construction Types
    "601", "602",
    // Chapter 7 — Fire & Smoke Protection
    "705.8",
    // Chapter 10 — Means of Egress + Assembly + Life Safety
    "1004.5", "1005.1", "1006.3.3", "1006.3.4",
    "1008", "1009", "1010", "1011.2", "1012", "1013", "1017.2", "1018.1", "1019", "1020.1", "1021.2",
    "1022", "1023", "1029.6.3", "1030",
    // Chapter 10 — Means of Egress single-exit spaces
    "1006.2.1",
    // Chapter 10 — Luminous egress path markings
    "1024",
    // Chapter 15 — Guardrails
    "1015",
    // SBC 801 Chapter 9 — Fire Suppression + Life Safety Systems
    "903.2", "903.3.1", "903.3.2", "903.4", "903.4.3",
    "904",
    "905.3.1",
    "907.2", "907.3", "907.4.2", "907.5", "907.6",
    "909", "910", "911", "912", "913", "914", "915", "916",
    // Chapter 5 — Mixed occupancy sub-sections
    "508.3", "508.4", "508.5",
  ];
  for (const id of KNOWN_TABLE_IDS) {
    // Match "1004.5" appearing as a standalone reference with word boundaries
    const escaped = id.replace(/\./g, "\\.");
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) {
      found.add(id);
    }
  }

  // Parent-section aliases — when user asks about a whole section/chapter
  // without specifying a sub-table, inject the most-relevant known table.
  const PARENT_ALIASES: Record<string, string[]> = {
    "302":    ["302"],            // "Section 302" → master occupancy classification table
    "303":    ["303"],            // "Section 303" → Assembly Group A sub-classification
    "304":    ["304"],            // "Section 304" → Business Group B classification
    "305":    ["305"],            // "Section 305" → Educational Group E classification
    "306":    ["306"],            // "Section 306" → Factory Group F (F-1/F-2)
    "307":    ["307"],            // "Section 307" → High Hazard Group H (H-1..H-5)
    "308":    ["308"],            // "Section 308" → Institutional Group I sub-classification
    "309":    ["309"],            // "Section 309" → Mercantile Group M classification
    "310":    ["310"],            // "Section 310" → Residential Group R (R-1..R-4)
    "311":    ["311"],            // "Section 311" → Storage Group S (S-1/S-2)
    "312":    ["312"],            // "Section 312" → Utility Group U
    "508":    ["508"],            // "Section 508" → mixed occupancy (accessory/nonseparated/separated)
    "402":    ["402"],            // "Section 402" → covered mall requirements
    "403":    ["403.1"],          // "Section 403" or "high rise" → high-rise requirements
    "404":    ["404"],            // "Section 404" → atrium requirements
    "412":    ["412"],            // "Section 412" → aircraft-related occupancies (core pass: 412.3 commercial hangars)
    "413":    ["413"],            // "Section 413" → combustible storage / high-piled storage
    "416":    ["416"],            // "Section 416" → spray finishing / dip tanks (application groups)
    "417":    ["417"],            // "Section 417" → drying rooms
    "405":    ["405"],            // "Section 405" → underground structure requirements
    "406":    ["406.5", "406.6"], // "Section 406" → both parking sections
    "407":    ["407"],            // "Section 407" → Group I-2 healthcare requirements
    "414":    ["414"],            // "Section 414" → hazardous materials / control areas / MAQ
    "415":    ["415"],            // "Section 415" → H-1 through H-5 high-hazard occupancy
    "408":    ["408"],            // "Section 408" → Group I-3 detention requirements
    "420":    ["420"],            // "Section 420" → I-1/R-1/R-2/R-3 sleeping units
    "1005":   ["1005.1"],    // "Section 1005" → egress width per occupant
    "1008":   ["1008"],      // "Section 1008" → egress illumination / emergency lighting
    "1009":   ["1009"],      // "Section 1009" → accessible means of egress / area of refuge
    "1010":   ["1010"],      // "Section 1010" → doors, gates, delayed-egress, panic hardware
    "1011":   ["1011.2"],    // "Section 1011" → stairway width
    "1012":   ["1012"],      // "Section 1012" → handrails
    "1013":   ["1013"],      // "Section 1013" → exit signs
    "1017":   ["1017.2"],    // "Section 1017" → travel distance
    "1018":   ["1018.1"],    // "Section 1018" → corridor width
    "1020":   ["1020.1"],    // "Section 1020" → corridor fire rating
    "1021":   ["1021.2"],    // "Section 1021" → number of exits
    "1029":   ["1029.6.3"],  // "Section 1029" → assembly aisle width
    "1030":   ["1030"],      // "Section 1030" → emergency escape and rescue openings
    "904":    ["904"],        // "Section 904"  → alternative automatic fire-extinguishing systems (SBC 801)
    "909":    ["909"],        // "Section 909"  → smoke control systems (SBC 801)
    "910":    ["910"],        // "Section 910"  → smoke and heat removal / roof vents (SBC 801)
    "911":    ["911"],        // "Section 911"  → commercial cooking hood suppression (SBC 801)
    "912":    ["912"],        // "Section 912"  → fire department connections (SBC 801)
    "913":    ["913"],        // "Section 913"  → fire pumps (SBC 801)
    "914":    ["914"],        // "Section 914"  → emergency responder radio coverage (SBC 801)
    "915":    ["915"],        // "Section 915"  → carbon monoxide detection (SBC 801)
    "916":    ["916"],        // "Section 916"  → gas detection systems (SBC 801)
    // Sprinkler sub-sections
    "903":    ["903.2", "903.3.1", "903.3.2", "903.4"],  // "Section 903" → all sprinkler sub-tables
    "903.3":  ["903.3.1", "903.3.2"],  // "Section 903.3" → sprinkler type + head type
    "903.4":  ["903.4", "903.4.3"],    // "Section 903.4" → supervision + floor control valves
    // Standpipe sub-sections
    "905":    ["905.3.1"],    // "Section 905" → standpipe where required
    "905.3":  ["905.3.1"],    // "Section 905.3" → standpipe where required
    // Fire alarm sub-sections
    "907":    ["907.2", "907.3", "907.4.2", "907.5", "907.6"],  // "Section 907" → all fire alarm sub-tables
    "907.4":  ["907.4.2"],    // "Section 907.4" → manual pull stations
    // Single-exit spaces
    "1006":   ["1006.3.3", "1006.3.4", "1006.2.1"],  // "Section 1006" → all exit-count sub-tables
    "1006.2": ["1006.2.1"],   // "Section 1006.2" → spaces with one exit access doorway
    // Guardrails
    "1015":   ["1015"],       // "Section 1015" → guardrails
    // Luminous egress path markings
    "1019":   ["1019"],      // "Section 1019" → exit access stairways and ramps
    "1022":   ["1022"],      // "Section 1022" → exit passageways
    "1023":   ["1023"],      // "Section 1023" → interior exit stairways and ramps (enclosed exit shaft)
    "1024":   ["1024"],       // "Section 1024" → luminous egress path markings
    // Mixed occupancy sub-sections
    "508.3":  ["508.3"],      // "Section 508.3" → nonseparated occupancy
    "508.4":  ["508.4"],      // "Section 508.4" → separated occupancy
    "508.5":  ["508.5"],      // "Section 508.5" → separated occupancy fire protection
  };
  for (const [parent, children] of Object.entries(PARENT_ALIASES)) {
    const esc = parent.replace(/\./g, "\\.");
    // Only fire if the bare parent section is mentioned without already having a child
    if (new RegExp(`\\b${esc}\\b`).test(lower) &&
        !children.some(c => found.has(c))) {
      for (const c of children) found.add(c);
    }
  }

  // Semantic aliases — common query phrases that map to specific tables
  const SEMANTIC_ALIASES: Array<[RegExp, string[]]> = [
    // Travel distance
    [/(?:travel\s+distance|مسافة\s+(?:السفر|الهروب|سفر))/i,                    ["1017.2"]],
    [/(?:max(?:imum)?\s+travel|أقصى\s+مسافة)/i,                                 ["1017.2"]],
    // Corridor fire rating
    [/(?:corridor\s+(?:rating|fire|مقاومة)|ممر\s+مقاوم)/i,                      ["1020.1"]],
    // Number of exits / minimum exits
    [/(?:number\s+of\s+exits?|(?:عدد|كم)\s+(?:مخارج|مخرج))/i,                  ["1021.2"]],
    [/(?:min(?:imum)?\s+exits?|الحد\s+الأدنى\s+للمخارج)/i,                      ["1021.2"]],
    // Construction type fire-resistance ratings
    [/(?:structural\s+frame\s+rating|fire.resist\w*\s+(?:hour|rating)|ساعات\s+مقاومة\s+الحريق)/i, ["601"]],
    // Exterior wall by fire separation distance
    [/(?:exterior\s+wall\s+(?:rating|fire)|fire\s+separation\s+distance|بُعد\s+الفصل)/i, ["602"]],
    // Exterior wall openings / window area limits
    [/(?:exterior\s+wall\s+opening|window\s+(?:area|limit)|فتحات\s+الجدار)/i,   ["705.8"]],
    // Combustible / high-piled storage — Section 413 (SBC 201)
    [/\b(?:high.piled\s+(?:combustible\s+)?storage|high\s+pile\s+storage|combustible\s+(?:high.piled|high\s+pile)\s+storage|storage\s+pile\s+height|pile\s+height\s+(?:12|threshold|trigger|storage|over)|storage\s+(?:piles?\s+)?(?:over|exceeds?|above|more\s+than)\s+(?:12|twelve)\s+(?:ft|feet|foot)|storage\s+height\s+(?:over|above|exceeds?|more\s+than|change\w*|trigger\w*|fire|protection|path)\s*(?:12|feet|ft)?|12.(?:ft|foot|feet)\s+(?:pile|storage|threshold|high)|pile\s+height\s+(?:limit|rule|trigger|over)|rack\s+storage|in.rack\s+sprinklers?|in\s+rack\s+sprinklers?|commodity\s+class\s+(?:storage|fire|NFPA|sprinkler)|group\s+a\s+plastics\s+(?:storage|sprinkler|fire|require\w*)|class\s+(?:i|ii|iii|iv|[1234])\s+(?:storage|commodity)\s+(?:sprinkler|fire|require\w*)|storage\s+(?:aisle|access)\s+width\s+(?:44|minimum|require\w*)|44.inch\s+(?:storage\s+)?aisle|when\s+(?:does\s+)?(?:storage\s+)?(?:become\s+)?high.piled|when\s+(?:is\s+)?high.piled\s+(?:storage\s+)?(?:trigger|require\w*|apply)|warehouse\s+(?:pile\s+height|storage\s+height|sprinkler\s+threshold|high.piled)|section\s+413|413\b)\b/i, ["413"]],
    [/(?:تخزين(?:اً|ا)?\s+(?:مرتفع(?:اً|ا)?|عالٍ|عالياً?)|تخزين\s+(?:قابل\s+للاشتعال\s+)?(?:مرتفع|عالٍ|عالي)|مستودع\s+(?:ال)?تخزين\s+(?:ال)?مرتفع|ارتفاع\s+(?:ال)?تخزين|ارتفاع\s+(?:ال)?كومة|ارتفاع\s+12\s+(?:قدم|قدماً)\s+(?:تخزين|مستودع)|تخزين\s+على\s+(?:ال)?رفوف|رفوف\s+(?:ال)?تخزين\s+(?:المرتفعة|الحريق)|رشاشات\s+داخل\s+(?:ال)?رفوف|رشاشات\s+(?:ال)?رفوف|اشتراطات\s+(?:ال)?تخزين\s+(?:المرتفع|العالي)|متى\s+(?:يلزم|يجب)\s+(?:نظام\s+)?(?:ال)?رشاشات\s+(?:في\s+)?(?:ال)?مستودع|فئة\s+(?:ال)?بضائع\s+(?:(?:ال)?تخزين|NFPA)|بلاستيك\s+(?:من\s+)?(?:المجموعة\s+أ|Group\s+A)\s+(?:تخزين|رشاشات|حريق)|عرض\s+ممر\s+(?:ال)?تخزين|413\b)/i, ["413"]],
    // Aircraft-related occupancies — Section 412 (SBC 201, core path = 412.3 commercial hangars)
    [/\b(?:aircraft\s+(?:related\s+occupanc(?:y|ies)|hangars?|paint\s+hangars?)|commercial\s+(?:aircraft\s+)?hangars?|hangar\s+(?:fire\s+suppression|suppression|classification|group\s+i|group\s+ii|group\s+iii|group\s+iv|hazardous\s+operations?|fuel\s+transfer|hot\s+work|floor\s+drains?|oil\s+separator|heating\s+equipment|basements?)|group\s+iii\s+hangar|hazardous\s+operations?\s+(?:in|for)\s+(?:a\s+)?(?:group\s+iii\s+)?hangar|heating\s+equipment\s+(?:in|for)\s+(?:a\s+)?(?:commercial\s+)?hangar|table\s+412\.3\.6|section\s+412|412\b)\b/i, ["412"]],
    [/(?:حظيرة\s+طائرات|حظائر\s+الطائرات|إشغالات\s+الطائرات|المادة\s+412|جدول\s+412\.3\.6|إطفاء\s+حظيرة\s+الطائرات|تصنيف\s+حظيرة\s+الطائرات|عمليات\s+خطرة\s+في\s+الحظيرة|عمليات\s+خطرة\s+في\s+حظيرة\s+group\s*iii|حظيرة\s+group\s*(?:i|ii|iii|iv)|تصريف\s+أرضية\s+الحظيرة|تصريف\s+أرضية\s+حظيرة\s+الطائرات|فاصل\s+زيوت\s+.*حظيرة|NFPA\s*409|412\b)/i, ["412"]],
    // Drying rooms — Section 417 (SBC 201)
    [/\b(?:drying\s+rooms?|dry\s+kilns?|kiln\s+drying|section\s+417|417\b|overhead\s+heating\s+pipes?\s+(?:clearance|50\s*mm)|operating\s+temperature\s+(?:80\s*c|80c)|dryer\s+temperature\s+(?:is\s+)?80\s*c|80\s*c\s+dry(?:ing|er)|insulation\s+(?:required|for)\s+.*80\s*c|drying\s+room\s+(?:noncombustible|insulation|fire\s+protection|automatic\s+fire.extinguishing)|high.hazard\s+materials?\s+and\s+processes?\s+drying)\b/i, ["417"]],
    [/(?:غرفة\s+التجفيف|غرف\s+التجفيف|فرن\s+تجفيف|كيلن\s+تجفيف|المادة\s+417|417\b|خلوص\s+أنابيب\s+التسخين\s+50\s*مم|80\s*درجة\s*مئوية|عزل\s+غرفة\s+التجفيف|حماية\s+حريق\s+غرفة\s+التجفيف|نظام\s+إطفاء\s+تلقائي\s+لغرفة\s+التجفيف|مواد\s+غير\s+قابلة\s+للاحتراق\s+تجفيف)/i, ["417"]],
    // Sprinkler requirement
    [/(?:where\s+(?:are?\s+)?sprinkler|when\s+(?:is\s+an?\s+)?(?:automatic\s+)?sprinkler\s+(?:system\s+)?required|when\s+(?:are?\s+)?sprinkler|متى.*رشاش|الرشاشات.*إلزامي)/i, ["903.2"]],
    [/(?:sprinkler\s+(?:system\s+)?required|requires?\s+sprinkler|تجب\s+الرشاشات?)/i, ["903.2"]],
    // Egress / stair width per occupant
    [/(?:egress\s+width|exit\s+width|stair(?:way)?\s+width\s+per|عرض\s+(?:المخرج|السلم)\s+لكل)/i, ["1005.1"]],
    [/(?:width\s+per\s+occupant|inches?\s+per\s+occupant|بوصة?\s+لكل\s+شخص)/i,  ["1005.1"]],
    // Corridor width (min dimension)
    [/(?:min(?:imum)?\s+corridor\s+width|how\s+wide.*corridor|corridor.*how\s+wide|عرض\s+الممر)/i, ["1018.1"]],
    // Stair dimensions (risers, treads, headroom)
    [/(?:riser\s+height|tread\s+depth|stair\s+dimen|headroom|ارتفاع\s+الدرجة|عمق\s+الدرجة)/i, ["1011.2"]],
    [/(?:stair(?:way)?\s+(?:min|width|size)|أبعاد\s+(?:الدرج|السلم))/i,          ["1011.2"]],
    // Incidental uses — generator room, boiler room, storage room fire separation
    [/(?:generator\s+room|boiler\s+room|incidental\s+use|fuel.fired\s+room|غرفة\s+(?:المولد|المرجل))/i, ["509"]],
    [/\b(?:electrical\s+room\s+(?:separation|fire|rating)|storage\s+room\s+(?:separation|fire)|laundry\s+room\s+(?:separation|fire))\b/i, ["509"]],
    [/(?:(?:ال)?استخدامات\s+(?:ال)?عرضية|غرفة\s+(?:ال)?(?:تخزين|مولد|مرجل)\s+(?:فصل|حريق|اشتراطات))/i,                ["509"]],
    // High-rise buildings
    [/(?:high.rise|high\s+rise|(?:ال)?مبنى\s+(?:ال)?شاهق|(?:ال)?مباني\s+(?:ال)?شاهقة|شاهق|55\s*(?:ft|feet|قدم))/i, ["403.1"]],
    [/(?:fire\s+command\s+center|مركز\s+قيادة\s+الحرائق|emergency\s+power\s+(?:high|building))/i, ["403.1"]],
    // Parking
    [/(?:open\s+parking|parking\s+(?:garage|structure)|مواقف\s+(?:السيارات\s+المفتوحة|مفتوحة))/i, ["406.5"]],
    [/(?:enclosed\s+parking|covered\s+parking|مواقف\s+(?:السيارات\s+المغلقة|مغلقة|مغطاة))/i,    ["406.6"]],
    [/(?:parking\s+sprinkler|sprinkler.*parking|رشاشات\s+مواقف|مواقف.*رشاشات)/i, ["406.5", "406.6"]],
    // Assembly aisles
    [/(?:assembly\s+aisle|theater\s+aisle|cinema\s+aisle|aisle\s+width.*assembly|عرض\s+الممر.*(?:قاعة|مسرح)|ممرات\s+(?:المقاعد|التجمع))/i, ["1029.6.3"]],
    [/(?:seating\s+aisle|row\s+spacing|seats\s+per\s+row|مقاعد.*صف|صفوف.*مقاعد)/i, ["1029.6.3"]],
    // Covered mall buildings (Section 402)
    [/\b(?:covered\s+mall|mall\s+building|open\s+mall|shopping\s+mall\s+(?:code|require|fire|sprinkler|egress)|anchor\s+(?:store|building)|mall\s+(?:smoke|sprinkler|egress|exit|travel))\b/i, ["402"]],
    [/(?:مبنى\s+(?:المول|التسوق)\s+المغطى|المول\s+المغطى|مول\s+مغطى|اشتراطات\s+(?:المول|مركز\s+التسوق)|تحكم\s+دخان\s+المول|رشاشات\s+المول)/i, ["402"]],
    [/(?:mall\s+occupant\s+load|kiosk\s+(?:fire|material|construct)|ما\s+(?:هو|هي|يجعل)\s+(?:المول|التسوق))/i, ["402"]],
    // Group I-2 healthcare (Section 407)
    [/\b(?:group\s+i-?2|i-?2\s+occupancy|healthcare\s+occupancy|hospital\s+(?:code|fire|require|corridor|sprinkler|egress)|nursing\s+home\s+(?:code|fire|require)|smoke\s+compartment\s+(?:hospital|healthcare|i-?2)|defend.in.place)\b/i, ["407"]],
    [/(?:مجموعة\s+i-?2|إشغال\s+i-?2|اشتراطات\s+المستشفى|ممر\s+المستشفى|مقصورة\s+دخان\s+(?:المستشفى|الرعاية)|رعاية\s+صحية)/i, ["407"]],
    [/\b(?:patient\s+(?:corridor|room\s+egress|transport\s+width)|smoke\s+compartment\s+(?:i-?2|healthcare)|i-?2\s+(?:corridor|smoke|sprinkler|egress))\b/i, ["407"]],
    // Group I-3 detention / correctional (Section 408)
    [/\b(?:group\s+i-?3|i-?3\s+occupancy|detention\s+(?:occupancy|facility|building|code|fire|require)|correctional\s+(?:facility|occupancy|building)|prison\s+(?:code|fire|require)|jail\s+(?:code|fire|require)|use\s+condition\s+(?:i|ii|iii|iv|v|1|2|3|4|5))\b/i, ["408"]],
    [/(?:مجموعة\s+i-?3|إشغال\s+i-?3|مرفق\s+(?:احتجاز|إصلاحي)|سجن|إصلاحية|حالة\s+الاستخدام|درجة\s+التقييد)/i, ["408"]],
    [/\b(?:staff.assisted\s+evacuation|restrained\s+occupant|locking\s+(?:detention|i-?3)|i-?3\s+(?:sprinkler|smoke|egress|condition))\b/i, ["408"]],
    // Egress illumination / emergency lighting (Section 1008)
    [/\b(?:emergency\s+lighting|egress\s+illumination|means\s+of\s+egress\s+illumination|exit\s+lighting|exit\s+(?:path\s+)?illumin|1\s*foot.candle|0\.1\s*foot.candle|90.?min(?:ute)?\s+(?:battery|backup|emergency\s+power)\s+(?:light|egress|illumin)|emergency\s+power\s+(?:lighting|egress))\b/i, ["1008"]],
    [/(?:إضاءة\s+(?:مسار\s+الهروب|الطوارئ|مخارج|ممرات\s+الهروب)|طاقة\s+الطوارئ\s+للإضاءة|قانديلة\s+قدم|إضاءة\s+مسار\s+الإخلاء)/i, ["1008"]],
    // Accessible means of egress / area of refuge (Section 1009)
    [/\b(?:accessible\s+(?:means\s+of\s+)?egress|area(?:s)?\s+of\s+refuge|area\s+of\s+rescue\s+assistance|wheelchair\s+(?:egress|exit|evacuation)|two.way\s+communication\s+(?:egress|refuge)|assisted\s+(?:rescue|evacuation)\s+area)\b/i, ["1009"]],
    [/(?:منطقة\s+الإيواء|مخرج\s+للمعاقين|مخرج\s+للكراسي\s+المتحركة|وسيلة\s+هروب\s+ميسرة|اتصال\s+ثنائي\s+الاتجاه\s+مخرج)/i, ["1009"]],
    // Exit signs (Section 1013)
    [/\b(?:exit\s+signs?\s+(?:required|where\s+required|needed)|exit\s+sign|exit\s+signage|illuminated\s+exit|exit\s+sign\s+(?:require|locat|power|light|illumin|visible|100)|100\s*(?:ft|feet)\s+(?:exit\s+sign|from\s+sign)|where\s+are\s+exit\s+signs?\s+required|photoluminescent\s+exit|exit\s+sign\s+emergency\s+power)\b/i, ["1013"]],
    [/(?:لافتة\s+(?:مخرج|المخارج)|علامة\s+مخرج|إشارة\s+مخرج|لافتات\s+مسار\s+الهروب|إضاءة\s+لافتة\s+مخرج)/i, ["1013"]],
    // Fire department connections (Section 912, SBC 801)
    [/\b(?:fire\s+department\s+connection|FDC|fire\s+dept\s+connection|siamese\s+connection|sprinkler\s+inlet|standpipe\s+inlet|FDC\s+(?:location|sign|access|require|100)|100\s*ft\s+(?:from\s+)?hydrant\s+(?:FDC|connection))\b/i, ["912"]],
    [/(?:(?:ال)?تشعب(?:ات)?\s+(?:ال)?(?:سيامي(?:ة)?|الحريق|إطفاء)|وصلة\s+(?:الدفاع\s+المدني|رجال\s+الإطفاء|الإطفاء)|توصيلة\s+(?:الإطفاء|الدفاع\s+المدني|FDC)|موقع\s+توصيلة\s+الإطفاء)/i, ["912"]],
    // Carbon monoxide detection (Section 915, SBC 801)
    [/\b(?:carbon\s+monoxide|CO\s+(?:alarm|detector|detection|sensor|require)|co\s+alarm|co\s+detector|co\s+detection|fuel.burning\s+(?:appliance|fireplace)\s+(?:alarm|detect)|co\s+source|co\s+required|carbon\s+monoxide\s+(?:alarm|detect|require|source|sensor))\b/i, ["915"]],
    [/(?:أول\s+أكسيد\s+الكربون|كاشف\s+(?:CO|أول\s+أكسيد|أكسيد\s+الكربون|غاز\s+السيارات|مولد\s+كهرباء\s+CO)|منبه\s+(?:CO|أكسيد\s+الكربون))/i, ["915"]],
    // Emergency responder radio coverage (Section 914, SBC 801)
    [/\b(?:emergency\s+responder\s+(?:radio|communication)|ERCES|in.building\s+(?:radio|wireless)\s+coverage|radio\s+(?:coverage|signal)\s+(?:building|required|dead\s+zone|amplif)|bi.directional\s+amplifi\w*|BDA\s+(?:fire|required|amplif)|public\s+safety\s+(?:communication|radio)\s+(?:system|coverage|building)|radio\s+dead\s+(?:zone|spot)\s+(?:building|stairwell|underground)|NFPA\s+1221|first\s+responder\s+radio\s+(?:coverage|building)|914\b|section\s+914|-95\s*dBm|signal\s+booster\s+(?:emergency|fire)|in.building\s+emergency\s+communication)\b/i, ["914"]],
    [/(?:تغطية\s+(?:(?:ال)?راديو|لاسلكي)\s+(?:المبنى|للمستجيبين|(?:ال)?طوارئ)|نظام\s+تعزيز\s+(?:(?:ال)?اتصالات|(?:ال)?راديو)(?:\s+(?:(?:ال)?طوارئ|مبنى|(?:ال)?راديو))?|مضخم\s+(?:إشارة|(?:ال)?راديو)\s+(?:(?:ال)?طوارئ|المبنى)|914\b)/i, ["914"]],
    // Atriums (Section 404)
    [/\b(?:atri(?:um|a)|atrium\s+(?:smoke|fire|enclosure|barrier|sprinkler|control|require)|multi.?stor(?:y|ey)\s+(?:floor\s+)?opening|floor\s+opening\s+(?:multiple|two|connecting)\s+stor|building\s+with\s+atrium)\b/i, ["404"]],
    [/(?:رواق|أتريوم|فتحة\s+(?:الطوابق|متعددة\s+الطوابق)|بهو\s+مفتوح|تحكم\s+دخان\s+الأتريوم|حاجز\s+حريق\s+الأتريوم)/i, ["404"]],
    [/\b(?:atrium\s+(?:interior\s+finish|class\s+b|travel\s+distance|standby\s+power)|smoke\s+(?:exhaust|control)\s+atrium)\b/i, ["404"]],
    // Underground structures (Section 405)
    [/(?:underground\s+(?:building|structure|floor|level|occupancy)|below.?grade\s+(?:building|structure|floor|level)|subterranean\s+(?:building|structure)|(?:30|thirty)\s*(?:ft|feet|foot|قدم)\s+below\s+grade|basement\s+(?:fire\s+requirements|smoke\s+control|compartment))/i, ["405"]],
    [/(?:مبنى\s+تحت\s+الأرض|إنشاء\s+تحت\s+الأرض|طابق\s+تحت\s+مستوى\s+الأرض|اشتراطات\s+(?:تحت\s+الأرض|الطابق\s+الأرضي)|تحكم\s+دخان\s+تحت\s+الأرض)/i, ["405"]],
    [/\b(?:underground\s+(?:sprinkler|smoke\s+control|compartmentation|fire\s+command|standpipe)|section\s+405)\b/i, ["405"]],
    // Groups I-1 / R-1 / R-2 / R-3 sleeping units (Section 420)
    [/\b(?:group\s+(?:i-?1|r-?1|r-?2|r-?3)|(?:i-?1|r-?1|r-?2|r-?3)\s+occupancy|sleeping\s+units?\s+(?:separation|fire|partition|require)|dwelling\s+units?\s+(?:separation|fire\s+partition|separate\w*)|separates?\s+dwelling\s+units?|between\s+hotel\s+rooms?|hotel\s+rooms?\s+(?:separation|fire|partition|separate\w*)|fire\s+partition\s+(?:between\s+)?hotel\s+rooms?|hotel\s+(?:room\s+separation|fire\s+partition|unit\s+separation)|apartment\s+(?:fire\s+partition|separation\s+require)|residential\s+(?:fire\s+partition|unit\s+separation)|420\b|section\s+420)\b/i, ["420"]],
    [/(?:مجموعة\s+(?:i-?1|r-?1|r-?2|r-?3)|(?:ال)?فصل\s+(?:بين\s+)?(?:وحدات\s+(?:الفندق|الشقق|النوم)|غرف\s+(?:ال)?فندق|(?:ال)?شقق\s+(?:ال)?سكنية?|(?:ال)?شقق)|اشتراطات\s+(?:الفندق|الشقق|السكن)|حاجز\s+حريق\s+بين\s+(?:ال)?وحدات|كاشف\s+(?:ال)?دخان\s+(?:في\s+)?(?:غرفة\s+(?:ال)?نوم|كل\s+غرفة|(?:ال)?وحدات\s+(?:ال)?سكنية)|كاشف\s+(?:CO|أول\s+أكسيد\s+الكربون)\s+(?:في\s+)?(?:(?:ال)?فنادق|(?:ال)?شقق|R-1|R-2)|ترابط\s+(?:كواشف|أجهزة)\s+(?:ال)?دخان|420\b)/i, ["420"]],
    [/\b(?:smoke\s+alarms?\s+(?:required|needed)\s+(?:in\s+)?(?:every|each|sleeping|bedroom)|smoke\s+alarms?\s+(?:in\s+)?(?:every|each)\s+(?:sleeping|bedroom)|smoke\s+alarms?\s+(?:be\s+)?interconnected|inter(?:connect|linked)\s+smoke\s+alarm|smoke\s+alarm\s+(?:sleeping|hotel|apartment|residential|r-?[123]|i-?1)|carbon\s+monoxide\s+alarms?\s+(?:required\s+)?(?:in\s+)?(?:hotels?|apartments?|r-?1|r-?2|residential|sleeping)|carbon\s+monoxide\s+alarm\s+(?:residential|hotel|sleeping)|unit\s+fire\s+separation|smoke\s+alarm\s+interconnect\w*)\b/i, ["420"]],
    // Doors, gates, special locking (Section 1010)
    [/\b(?:delayed.egress\s+lock|delayed\s+egress\s+(?:lock|door|15|30)|15.second\s+(?:delay|lock)|30.second\s+(?:delay|lock)|access.controlled\s+egress\s+door|electromagnetic\s+lock\s+(?:egress|door|exit)|mag.lock\s+(?:egress|door)|panic\s+(?:hardware|bar|device|push)|door\s+swing\s+(?:direction|egress|travel)|min(?:imum)?\s+door\s+width|door\s+(?:clear\s+)?width\s+(?:min|32|require)|door\s+width\s+(?:for\s+an?\s+)?exit|32.inch\s+(?:door|clear)|door\s+(?:latch|hardware|operation)\s+(?:one|single|1)\s+(?:action|operation|motion)|where\s+(?:is\s+)?panic\s+hardware\s+required)\b/i, ["1010"]],
    [/(?:قفل\s+تأخير\s+(?:الخروج|خروج)|تأخير\s+(?:خروج|15|30)\s*(?:ثانية)?|باب\s+(?:ذراع\s+الذعر|الذعر|التدافع)|ذراع\s+الذعر|قفل\s+كهرومغناطيسي|اتجاه\s+فتح\s+الباب|(?:ال)?حد\s+(?:ال)?أدنى\s+(?:لعرض|عرض)\s+(?:ال)?باب|عرض\s+الباب\s+(?:الأدنى|الصافي|32)|باب\s+مخرج\s+(?:ال)?طوارئ|أجهزة\s+(?:الباب|المخرج)|عتاد\s+الباب)/i, ["1010"]],
    // Handrails (Section 1012)
    [/\b(?:handrail\s+(?:height|graspability|clearance|extension|require|both\s+side|dimension|type\s+[iI]|circular|non.circular|1\.25|1\.5\s+in|34\s*in|38\s*in|stair|ramp|continue|wall|return|load)|stair\s+(?:handrail|railing|rail\s+height)|ramp\s+handrail|both\s+sides\s+(?:handrail|stair\s+rail)|34.(?:inch|in)\s+(?:handrail|railing)|38.(?:inch|in)\s+(?:handrail|railing)|1\.5.inch\s+(?:clearance\s+)?handrail|type\s+[iI]\s+handrail|12.inch\s+extension\s+handrail)\b/i, ["1012"]],
    [/(?:درابزين\s+(?:الدرج|السلم|المنحدر|الارتفاع|الأبعاد|الإمساك|الجانبين|امتداد|مسافة|جدار|(?:ال)?يد|(?:ال)?اليد)|ارتفاع\s+(?:ال)?درابزين|أبعاد\s+الدرابزين|متطلبات\s+الدرابزين|إمساك\s+الدرابزين)/i, ["1012"]],
    // Emergency escape and rescue openings (Section 1030)
    [/\b(?:emergency\s+escape\s+(?:opening|rescue|window|and\s+rescue)|rescue\s+(?:opening|window)|emergency\s+rescue\s+opening|EERO|egress\s+window\s+(?:require|size|dimension|sleep)|sleeping\s+room\s+(?:window|escape|egress\s+opening)|5\.7\s*sq\s*ft|5\.0\s*sq\s*ft|24.inch\s+(?:escape\s+)?opening\s+height|sill\s+height\s+(?:44|max)|44.inch\s+sill|window\s+well\s+(?:egress|escape)|bars?\s+over\s+(?:egress|escape)\s+window)\b/i, ["1030"]],
    [/(?:فتحة\s+(?:الهروب\s+(?:الطارئ|والإنقاذ)|الإنقاذ)|نافذة\s+(?:الهروب|الطوارئ|الإنقاذ\s+الطارئ)|فتحة\s+هروب\s+طارئ|هروب\s+طارئ\s+من\s+غرفة\s+النوم|ارتفاع\s+عتبة\s+(?:النافذة|الفتحة)|مساحة\s+فتحة\s+الهروب)/i, ["1030"]],
    // Alternative automatic fire-extinguishing systems — Section 904 (SBC 801)
    [/\b(?:alternative\s+(?:automatic\s+)?fire.?(?:extinguish\w*|suppress\w*)\s+(?:system|required|where)|alternative\s+suppress\w*\s+system|non.water\s+(?:fire\s+suppress\w*|extinguish\w*)|clean\s+agent\s+(?:system|suppress\w*|fire|required|data|room)|NFPA\s*2001|FM.?200|NOVEC\s*1230|halon\s+(?:alternative|1301|replacement|substitute)|carbon\s+dioxide\s+(?:suppress\w*|total\s+flood\w*|fire\s+system|system)|CO2\s+(?:suppress\w*|fire\s+system|total\s+flood\w*|data\s+center|computer\s+room|required)|NFPA\s*12\s+(?:CO2|carbon|suppress\w*)|foam\s+(?:suppress\w*|fire\s+system|required|deluge|hangar|aircraft)|NFPA\s*11\s+(?:foam|suppress\w*)|NFPA\s*16\s+(?:foam|water\s+spray)|NFPA\s*409\s+(?:hangar|foam|aircraft)|aircraft\s+hangar|suppress\w*\s+(?:system\s+)?(?:is\s+)?(?:required|needed|used?)\s+(?:in|for)\s+(?:an?\s+)?aircraft\s+hangar|dry\s+chemical\s+(?:suppress\w*|NFPA\s*17|fire\s+system)\b|NFPA\s*17\b|water\s+mist\s+(?:system|suppress\w*|fire|required)|NFPA\s*750\s+(?:water|mist|suppress\w*)|data\s+center\s+(?:fire\s+suppress\w*|clean\s+agent|CO2\s+suppress\w*)|server\s+room\s+(?:fire\s+suppress\w*|clean\s+agent)|computer\s+room\s+(?:fire\s+suppress\w*|clean\s+agent|CO2)|telecom\s+room\s+suppress\w*|archive\s+(?:fire\s+suppress\w*|clean\s+agent)|pre.discharge\s+(?:alarm|warning)\s+(?:clean\s+agent|CO2|total\s+flood\w*)|total.flooding\s+(?:system|CO2|clean\s+agent)\s+(?:occupied|alarm|pre.discharge)|alternative\s+system\s+(?:substitute|replac\w*)\s+sprinkler|section\s+904|904\.11|904\.12|904\b)\b/i, ["904"]],
    [/(?:نظام\s+(?:ال)?إطفاء\s+(?:(?:ال)?بديل|(?:ال)?تلقائي\s+(?:ال)?بديل|(?:ال)?الخاص|(?:ال)?بديل)|أنظمة\s+(?:ال)?إطفاء\s+(?:البديلة|(?:ال)?بديلة)|عامل\s+إطفاء\s+نظيف|نظام\s+(?:ال)?عامل\s+(?:ال)?نظيف|NFPA\s*2001|FM-?200|NOVEC\s*1230|بديل\s+(?:الهالون|هالون)|إطفاء\s+(?:ثاني\s+أكسيد\s+الكربون|CO2)|نظام\s+(?:CO2|ثاني\s+أكسيد\s+الكربون)\s+(?:إطفاء|كلي|تفريغ)|NFPA\s*12|رغوة\s+(?:(?:ال)?إطفاء|حريق)|نظام\s+(?:ال)?رغوة|NFPA\s*11|حظيرة\s+(?:ال)?طائرات|إطفاء\s+(?:ال)?حظيرة|(?:نظام\s+)?(?:ال)?إطفاء\s+(?:(?:ال)?مناسب\s+)?(?:في|ل(?:ـ)?)\s*(?:غرفة\s+)?(?:ال)?خوادم|إطفاء\s+غرفة\s+(?:ال)?خوادم|إطفاء\s+مركز\s+(?:ال)?بيانات|إطفاء\s+غرفة\s+(?:ال)?حاسب|عامل\s+نظيف\s+مركز\s+(?:ال)?بيانات|مادة\s+كيميائية\s+جافة\s+(?:إطفاء|نظام)|NFPA\s*17|مياه\s+رذاذية?\s+(?:نظام|إطفاء)|NFPA\s*750|إنذار\s+(?:ما\s+قبل|قبل)\s+(?:التفريغ|الإطلاق)|إطفاء\s+بديل\s+(?:عن\s+)?(?:الرشاشات?|ال)?|904\b)/i, ["904"]],
    // Smoke control systems (Section 909, SBC 801)
    [/\b(?:smoke\s+control\s+(?:system|design|required|testing|standby|power|interface|layer|where|accepted?\s+test|commission)|mechanical\s+smoke\s+(?:control|exhaust|management)|smoke\s+layer\s+(?:interface|height|6\s*ft|1828\s*mm)|smoke\s+exhaust\s+(?:system|design|rate)|2.hour\s+standby\s+(?:smoke|power\s+smoke)|stairway\s+pressuri[sz]ation|pressuri[sz]ed\s+stair|smoke\s+control\s+accept\w+\s+test|section\s+909|sbc\s+801\s+909)\b/i, ["909"]],
    [/(?:نظام\s+(?:ال)?تحكم\s+(?:في\s+)?(?:ال)?دخان|نظام\s+تحكم\s+(?:الدخان|دخان)|مستوى\s+طبقة\s+الدخان|طبقة\s+الدخان\s+(?:6|ستة)|إخلاء\s+الدخان\s+الميكانيكي|طاقة\s+احتياطية\s+(?:تحكم\s+)?الدخان|اختبار\s+نظام\s+(?:تحكم\s+)?الدخان|ضغط\s+سلم\s+(?:الهروب|الطوارئ))/i, ["909"]],
    // Business Group B — Section 304
    [/\b(?:group\s+b\s+(?:occupancy|classif)|business\s+(?:group|occupancy|classif)|is\s+(?:this\s+)?(?:a\s+)?(?:business|office)\s+(?:occupancy|group)|office\s+(?:occupancy|classif|group)|professional\s+office\s+(?:occupancy|classif)|ambulatory\s+clinic\s+(?:occupancy|classif)|outpatient\s+(?:clinic\s+)?(?:occupancy|classif)|b\s+vs\s+(?:a|m|e|i)|is\s+(?:this\s+)?(?:group\s+b|group\s+a)|section\s+304|group\s+b\s+threshold)\b/i, ["304"]],
    [/(?:إشغال\s+(?:الأعمال|مكاتب|مهني)|مجموعة\s+B\s+(?:إشغال|تصنيف)|تصنيف\s+(?:مبنى\s+مكاتب|مكتب|عيادة\s+خارجية)|مستوصف\s+إشغال\s+مجموعة)/i, ["304"]],
    // Educational Group E — Section 305
    [/\b(?:group\s+e\s+(?:occupancy|classif)|educational\s+(?:group|occupancy|classif)|school\s+(?:occupancy|classif|group)|K.12\s+(?:occupancy|classif|group)|is\s+(?:this\s+)?(?:a\s+)?(?:school|educational)\s+(?:occupancy|group)|E\s+vs\s+(?:B|I-4|I4)|day\s+care\s+(?:school|educational)|section\s+305|12th\s+grade\s+(?:occupancy|school)|educational\s+threshold)\b/i, ["305"]],
    [/(?:إشغال\s+(?:تعليمي|مدرسة)|مجموعة\s+E\s+(?:إشغال|تصنيف)|تصنيف\s+(?:مدرسة|مدارس|مدرسة\s+K-12)|مدرسة\s+إشغال\s+مجموعة)/i, ["305"]],
    // Factory Group F — Section 306
    [/\b(?:group\s+f\s+(?:occupancy|classif)|factory\s+(?:group|occupancy|classif)|industrial\s+(?:occupancy|classif|group)|F-[12]\s+(?:occupancy|classif)|group\s+F-[12]|manufacturing\s+(?:occupancy|classif|group)|is\s+(?:this\s+)?(?:a\s+)?(?:factory|industrial|manufacturing)\s+(?:occupancy|group)|F-1\s+vs\s+F-2|moderate\s+hazard\s+factory|low\s+hazard\s+factory|section\s+306|woodworking\s+occupancy|metal\s+fabrication\s+(?:occupancy|group))\b/i, ["306"]],
    [/(?:إشغال\s+(?:تصنيعي|مصنع|صناعي)|مجموعة\s+F\s+(?:إشغال|تصنيف)|تصنيف\s+(?:مصنع|منشأة\s+صناعية)|F-1\s+(?:مقابل|vs)\s+F-2)/i, ["306"]],
    // High Hazard Group H — Section 307
    [/\b(?:group\s+h\s+(?:occupancy|classif)|high\s+hazard\s+(?:group|occupancy|classif)|H-[12345]\s+(?:occupancy|classif)|group\s+H-[12345]|maximum\s+allowable\s+(?:quantities?|quantity)|MAQ\s+(?:exceed|trigger|threshold|hazardous)|when\s+is\s+(?:a\s+)?(?:building\s+)?high\s+hazard|hazardous\s+(?:materials?\s+)?(?:occupancy|classif|group)|is\s+(?:this\s+)?(?:a\s+)?(?:high\s+hazard|group\s+h)|section\s+307|detonation\s+(?:hazard|occupancy)|deflagration\s+(?:hazard|occupancy)|HPM\s+occupancy|semiconductor\s+(?:fab|fabrication)\s+occupancy)\b/i, ["307"]],
    [/(?:إشغال\s+(?:خطر|عالي\s+الخطورة)|مجموعة\s+H\s+(?:إشغال|تصنيف)|H-[12345]\s+إشغال|الكميات\s+المسموح\s+بها\s+(?:من\s+المواد\s+)?الخطرة|مواد\s+خطرة\s+(?:فوق|تجاوزت)\s+(?:الحد|الكمية))/i, ["307"]],
    // Mercantile Group M — Section 309
    [/\b(?:group\s+m\s+(?:occupancy|classif)|mercantile\s+(?:group|occupancy|classif)|retail\s+(?:occupancy|classif|group)|store\s+(?:occupancy|classif|group)|is\s+(?:this\s+)?(?:a\s+)?(?:retail|mercantile)\s+(?:occupancy|group)|M\s+vs\s+(?:S|B|A)|shop\s+(?:occupancy|classif)|supermarket\s+(?:occupancy|classif)|showroom\s+(?:occupancy|classif)|section\s+309|mall\s+(?:store\s+|tenant\s+)?(?:occupancy|classif|group))\b/i, ["309"]],
    [/(?:إشغال\s+(?:تجزئة|متجر|محل\s+تجاري)|مجموعة\s+M\s+(?:إشغال|تصنيف)|تصنيف\s+(?:متجر|سوبرماركت|مركز\s+تسوق))/i, ["309"]],
    // Residential Group R — Section 310
    [/\b(?:group\s+r\s+(?:occupancy|classif)|residential\s+(?:group|occupancy|classif)|R-[1234]\s+(?:occupancy|classif)|group\s+R-[1234]|is\s+(?:this\s+)?(?:a\s+)?(?:residential|hotel|apartment|dwelling)\s+(?:occupancy|group)|R-1\s+vs\s+R-2|R-[1234]\s+or\s+R-[1234]|transient\s+(?:residential|occupancy|30\s*day)|30.day\s+(?:residential|threshold|transient)|hotel\s+(?:occupancy|classif|group|R-1)|apartment\s+(?:building\s+R-[1234]|occupancy|classif|group|R-2)|single\s+family\s+(?:occupancy|classif)|section\s+310|residential\s+classification)\b/i, ["310"]],
    [/(?:(?:ال)?إشغال\s+(?:السكني|سكني|الفندقي|فندقي|شقق)|مجموعة\s+R\s+(?:إشغال|تصنيف)|R-[1234]\s+(?:إشغال|تصنيف)|(?:ال)?فندق\s+(?:يصنف|تصنيف|كإشغال)|مبنى\s+(?:ال)?شقق\s+(?:السكنية|سكنية)?|تصنيف\s+(?:مبنى\s+)?(?:فندق|(?:ال)?شقق|(?:ال)?فيلا|سكن|(?:ال)?سكن)|سكن\s+(?:مؤقت|دائم)\s+(?:ال)?إشغال)/i, ["310"]],
    // Storage Group S — Section 311
    [/\b(?:group\s+s\s+(?:occupancy|classif)|storage\s+(?:group|occupancy|classif)|S-[12]\s+(?:occupancy|classif)|group\s+S-[12]|is\s+(?:this\s+)?(?:a\s+)?(?:storage|warehouse)\s+(?:occupancy|group)|S-1\s+vs\s+S-2|moderate\s+hazard\s+storage|low\s+hazard\s+storage|warehouse\s+(?:occupancy|classif|group)|parking\s+garage\s+(?:occupancy\s+group|classif|S-2|group\s+s)|section\s+311)\b/i, ["311"]],
    [/(?:إشغال\s+(?:تخزين|مستودع)|مجموعة\s+S\s+(?:إشغال|تصنيف)|S-[12]\s+إشغال|تصنيف\s+(?:مستودع|مخزن|مواقف\s+سيارات))/i, ["311"]],
    // Utility Group U — Section 312
    [/\b(?:group\s+u\s+(?:occupancy|classif)|utility\s+(?:group|occupancy|classif)|miscellaneous\s+(?:occupancy|group)|accessory\s+structure\s+(?:occupancy|classif|group)|private\s+garage\s+(?:occupancy|classif|group|U)|shed\s+(?:occupancy|classif|group)|agricultural\s+building\s+(?:occupancy|group)|section\s+312|group\s+u\s+examples|fence\s+(?:occupancy|6\s*ft\s*building|over\s*6))\b/i, ["312"]],
    [/(?:إشغال\s+(?:مرافق|ملحق)|مجموعة\s+U\s+(?:إشغال|تصنيف)|تصنيف\s+(?:مرآب\s+خاص|مخزن\s+أدوات|مبنى\s+زراعي))/i, ["312"]],
    // Master occupancy classification — Section 302
    [/\b(?:what\s+(?:is\s+the\s+)?occupancy\s+(?:group|classification|type)|which\s+(?:occupancy\s+)?group|how\s+(?:do\s+I\s+|to\s+)?classify\s+(?:a\s+)?(?:building|space|use|occupancy)|occupancy\s+classif\w+|use\s+(?:group|classif\w+)|classify\s+(?:this\s+)?(?:building|space|use)|is\s+this\s+(?:group|occupancy)\s+[abefhimrsu]|all\s+occupancy\s+groups|list\s+(?:of\s+)?occupancy\s+groups|chapter\s+3\s+(?:classif|occupancy)|section\s+302)\b/i, ["302"]],
    [/(?:ما\s+(?:هو\s+|هي\s+)?(?:تصنيف\s+(?:ال)?إشغال|(?:ال)?مجموعة\s+(?:ال)?إشغال)|كيف\s+(?:أصنف|نصنف|يُصنَّف)|تصنيف\s+(?:الاستخدام|الإشغال|المبنى|استخدام|إشغال|مبنى)|أي\s+(?:مجموعة\s+إشغال|تصنيف|مجموعة)|مجموعات\s+(?:ال)?إشغال|قائمة\s+مجموعات\s+(?:ال)?إشغال|الفصل\s+3\s+(?:تصنيف|إشغال))/i, ["302"]],
    // Assembly Group A classification — Section 303
    [/\b(?:group\s+a\s+(?:classif|sub|occup)|assembly\s+(?:sub.?classif|group\s+a|occupancy\s+type|A-[12345])|A-[12345]\s+occupancy|occupancy\s+A-[12345]|(?:restaurant|theater|church|mosque|museum|arena|stadium|gymnasium|banquet|nightclub|cinema)\s+(?:occupancy|classif|group)|assembly\s+(?:OL|occupant\s+load)\s+(?:50|threshold)|OL\s+(?:50|less\s+than\s+50)\s+assembly|assembly\s+occupancy\s+classification)\b/i, ["303"]],
    [/(?:تصنيف\s+مجموعة\s+(?:التجمع|أ)|إشغال\s+(?:مسجد|مطعم|مسرح|متحف|ملعب|قاعة\s+أفراح)|تصنيف\s+فرعي\s+(?:للتجمع|مجموعة\s+أ)|حمل\s+إشغال\s+50\s+(?:تجمع|مجموعة))/i, ["303"]],
    // Institutional Group I classification — Section 308
    [/\b(?:group\s+i\s+(?:classif|sub|occup)|institutional\s+(?:sub.?classif|group\s+i|A-[1234])|I-[1234]\s+(?:occupancy|classif)|(?:assisted\s+living|hospital|jail|prison|nursing\s+home|day\s+care)\s+(?:occupancy|classif|group)|what\s+(?:occupancy\s+group\s+is\s+a?\s+)?hospital|hospital.*I-[1234]|I-1\s+vs\s+R-4|16\s+(?:persons|occupants)\s+(?:assisted|I-1|institutional)|I-1\s+(?:threshold|persons|16)|self.preservation\s+(?:ability|occupancy)|institutional\s+occupancy\s+(?:classif|group))\b/i, ["308"]],
    [/(?:تصنيف\s+مجموعة\s+(?:المؤسسية|I)|إشغال\s+(?:مؤسسي|دار\s+رعاية|مستشفى\s+(?:تصنيف|كإشغال|إشغال)|سجن\s+(?:تصنيف|كإشغال|إشغال))|(?:ال)?مستشفى\s+(?:كإشغال|تصنيف\s+إشغال|إشغال\s+ما)|I-[1234]\s+إشغال|دار\s+رعاية\s+(?:المسنين\s+)?(?:تصنيف|إشغال|مجموعة)|القدرة\s+على\s+الإخلاء\s+الذاتي)/i, ["308"]],
    // Mixed occupancy — Section 508
    [/\b(?:mixed\s+occupancy|multiple\s+occupancy|accessory\s+occupancy|nonseparated\s+occupancy|separated\s+occupancy|occupancy\s+(?:separation|barrier|mixing)|10\s*(?:percent|%)\s+(?:floor\s+area|accessory)|most\s+restrictive\s+occupancy|fire\s+barrier\s+between\s+occupanc|table\s+508\.4|section\s+508|mixed.use\s+(?:building|tower|classif))\b/i, ["508"]],
    [/(?:(?:ال)?إشغال\s+(?:ال)?مختلط|(?:ال)?مبنى\s+متعدد\s+(?:الاستخدامات|الإشغالات)|(?:ال)?إشغال\s+(?:ال)?إضافي|فصل\s+(?:ال)?(?:الإشغال|الاستخدامات|إشغال|استخدامات)|الاشتراطات\s+الأكثر\s+تقييداً|حاجز\s+(?:بين\s+)?(?:ال)?إشغالات|10\s*(?:بالمئة|%)\s+(?:مساحة|إشغال)|(?:ال)?إشغال\s+غير\s+(?:ال)?مفصول|(?:ال)?إشغال\s+(?:ال)?مفصول|غير\s+(?:ال)?مفصول\s+(?:مسموح|مبنى|إشغال))/i, ["508"]],
    // Mixed occupancy sub-sections (508.3/508.4/508.5)
    [/\b(?:nonseparated\s+(?:occupanc\w*|use\w*)|non.separated\s+(?:occupanc\w*|use\w*)|section\s+508\.3|most\s+restrictive\s+(?:construction|type)\s+mixed|508\.3)\b/i, ["508.3"]],
    [/\b(?:separated\s+(?:occupancy\s+fire\s+barrier|occupancy\s+table|occupancy\s+requirement)|fire\s+barrier\b.{0,30}separated\s+occupancy|table\s+508\.4|fire\s+barrier\s+(?:between|separating)\s+occupanc|section\s+508\.4|508\.4)\b/i, ["508.4"]],
    [/\b(?:section\s+508\.5|508\.5|separated\s+occupancy\s+fire\s+protection|fire\s+protection\s+separated\s+occupancy)\b/i, ["508.5"]],
    [/(?:إشغال\s+غير\s+مفصول|508\.3|الأكثر\s+تقييداً\s+(?:إنشاء|نوع)|فصل\s+الإشغال\s+جدار\s+حريق|508\.4|جدول\s+508\.4)/i, ["508.3", "508.4"]],
    // Single exit access doorway — Section 1006.2.1
    [/\b(?:one\s+exit\s+(?:access\s+)?(?:door(?:way)?|opening)|single\s+exit\s+(?:access\s+)?(?:door(?:way)?|opening)|space\s+with\s+(?:one|single|1)\s+exit\s+(?:access\s+)?door|1006\.2\.1|section\s+1006\.2)\b/i, ["1006.2.1"]],
    [/(?:باب\s+(?:مخرج|هروب)\s+واحد|مخرج\s+واحد\s+من\s+(?:غرفة|مساحة)|1006\.2\.1|فتحة\s+وصول\s+مخرج\s+واحدة)/i, ["1006.2.1"]],
    // Sprinkler system type — Section 903.3.1
    [/\b(?:nfpa\s+13[rd]?\s+(?:sprinkler|system)|sprinkler\s+(?:system\s+)?(?:type|nfpa\s+13)|which\s+nfpa\s+13|nfpa\s+13\s+(?:vs|or)\s+(?:nfpa\s+)?13[rd]|nfpa\s+13\s+(?:r\s+vs\s+d|type)|13r\s+(?:vs|or)\s+13d|use\s+nfpa\s+13[rd]?|residential\s+sprinkler\s+(?:nfpa|13r|13d)|light\s+hazard\s+(?:sprinkler|nfpa)|ordinary\s+hazard\s+(?:sprinkler|nfpa)|extra\s+hazard\s+sprinkler|903\.3\.1|section\s+903\.3\.1)\b/i, ["903.3.1"]],
    [/(?:نفبا\s+13\s+(?:نوع|نظام)|نوع\s+(?:نظام\s+)?الرشاشات|903\.3\.1|نفبا\s+13[rd]|أي\s+نفبا\s+13|متطلبات\s+نفبا\s+13)/i, ["903.3.1"]],
    // Quick-response / residential sprinkler heads — Section 903.3.2
    [/\b(?:quick.response\s+(?:sprinkler|head)|fast.response\s+sprinkler|residential\s+sprinkler\s+(?:head|pendent)|QR\s+sprinkler\s+head|903\.3\.2|section\s+903\.3\.2)\b/i, ["903.3.2"]],
    [/(?:رشاش\s+(?:سريع\s+الاستجابة|سكني\s+معلق)|903\.3\.2|رأس\s+رشاش\s+سريع)/i, ["903.3.2"]],
    // Sprinkler system supervision — Section 903.4
    [/\b(?:sprinkler\s+(?:system\s+)?supervis\w+|supervis\w+\s+sprinkler\s+(?:system|valve)|monitoring\s+sprinkler\s+(?:valve|system)|sprinkler\s+(?:valve\s+)?tamper\s+(?:switch|alarm)|903\.4\b|section\s+903\.4\b|supervisory\s+signal\s+sprinkler)\b/i, ["903.4"]],
    [/(?:مراقبة\s+(?:نظام\s+)?الرشاشات|إشارة\s+إشرافية\s+رشاشات|تلاعب\s+صمام\s+الرشاشات|903\.4\b)/i, ["903.4"]],
    // Floor control valves — Section 903.4.3
    [/\b(?:floor\s+control\s+valves?|per.floor\s+(?:sprinkler\s+)?valves?|sprinkler\s+floor\s+valves?|high.rise\s+sprinkler\s+valves?|903\.4\.3|section\s+903\.4\.3)\b/i, ["903.4.3"]],
    [/(?:صمام\s+تحكم\s+(?:الطابق|بالطابق)|صمام\s+رشاشات\s+(?:الطابق|المبنى\s+الشاهق)|903\.4\.3)/i, ["903.4.3"]],
    // Standpipe systems where required — Section 905.3.1
    [/\b(?:standpipe\s+(?:system\s+)?(?:required|where\s+required|requirement)|where\s+(?:is\s+)?standpipe\s+required|when\s+(?:is\s+)?standpipe\s+required|standpipe\s+(?:in\s+)?(?:high.rise|building\s+over|exceeds?)|905\.3\.1|section\s+905\.3|standpipe\s+threshold|class\s+(?:i|ii|iii)\s+standpipe\s+required)\b/i, ["905.3.1"]],
    [/(?:متى.*خط\s+(?:الإطفاء\s+)?الجاف|خط\s+(?:الإطفاء\s+)?الجاف.*(?:إلزامي|مطلوب)|خراطيم\s+الإطفاء.*(?:إلزامية|مطلوبة)|905\.3\.1|اشتراطات\s+خط\s+الإطفاء\s+الجاف)/i, ["905.3.1"]],
    // Fire alarm where required by occupancy — Section 907.2
    [/\b(?:fire\s+alarm\s+(?:system\s+)?(?:required|where\s+required|requirement|by\s+occupancy)|when\s+(?:is\s+)?(?:fire\s+)?alarm\s+(?:system\s+)?required|where\s+(?:is\s+)?(?:fire\s+)?alarm\s+(?:system\s+)?required|which\s+(?:occupanc|building)\w*\s+(?:need|require)s?\s+(?:a\s+)?(?:fire\s+)?alarm|(?:need|require)s?\s+(?:a\s+)?fire\s+alarm|fire\s+alarm\s+(?:need|needed|needed\s+for)|907\.2|section\s+907\.2|alarm\s+threshold\s+(?:by\s+)?occupanc\w*)\b/i, ["907.2"]],
    [/(?:متى.*(?:إنذار|نظام\s+إنذار)\s+(?:ال)?حريق.*(?:إلزامي|مطلوب)|(?:إنذار|نظام\s+إنذار)\s+(?:ال)?حريق.*(?:إلزامي|مطلوب)|(?:هل|متى).*(?:نظام\s+)?(?:إنذار|إنذار\s+الحريق).*(?:إلزامي|مطلوب|مطلوباً)|ما\s+متطلبات\s+(?:نظام\s+)?(?:إنذار|إنذار\s+الحريق)\s+(?:حسب|للإشغال)|907\.2|اشتراطات\s+إنذار\s+(?:ال)?حريق\s+حسب\s+(?:ال)?إشغال)/i, ["907.2"]],
    // Fire alarm initiating devices — Section 907.3
    [/\b(?:fire\s+alarm\s+initiating\s+devices?|automatic\s+(?:fire\s+detector|sprinkler\s+waterflow)\s+(?:initiating|device|signal)|heat\s+detector\s+(?:fire\s+alarm|initiating)|smoke\s+detector\s+(?:fire\s+alarm\s+system|initiating)|907\.3|section\s+907\.3)\b/i, ["907.3"]],
    [/(?:أجهزة\s+(?:بدء|تشغيل)\s+(?:نظام\s+)?(?:إنذار|alarm)\s+الحريق|كاشف\s+(?:دخان|حرارة)\s+(?:إنذار|alarm)|907\.3)/i, ["907.3"]],
    // Manual fire alarm boxes (pull stations) — Section 907.4.2
    [/\b(?:manual\s+(?:fire\s+alarm\s+)?(?:pull\s+stations?|box|station)|pull\s+stations?\s+(?:required|locat|spacing|floor|stair)|fire\s+alarm\s+pull\s+(?:stations?|box)|manual\s+call\s+point|907\.4\.2|section\s+907\.4\.2|manual\s+alarm\s+(?:box|station)\s+(?:locat|spacing|required))\b/i, ["907.4.2"]],
    [/(?:زر\s+(?:الإنذار\s+اليدوي|إنذار\s+الحريق\s+اليدوي)|محطة\s+(?:الإنذار\s+)?اليدوي\s+(?:الحريق|للحريق)|907\.4\.2|نقاط\s+الاستدعاء\s+اليدوي)/i, ["907.4.2"]],
    // Occupant notification systems — Section 907.5
    [/\b(?:occupant\s+notification\s+(?:system|devices?|require|type)|audible\s+(?:alarm|notification)\s+(?:devices?|signal|system)|visible\s+(?:alarm|notification)\s+(?:devices?|strobe)\s+(?:require|where)|audible.visible\s+(?:alarm|notification)|voice\s+evacuation\s+(?:system|signal)|emergency\s+voice\s+alarm\s+communication|EVAC\s+(?:system|signal)|notification\s+appliance\s+circuit|907\.5|section\s+907\.5)\b/i, ["907.5"]],
    [/(?:نظام\s+(?:إخطار|إشعار)\s+(?:شاغلي|المبنى)|إنذار\s+(?:مسموع|مرئي)\s+(?:شاغل|مبنى)|جهاز\s+(?:إنذار\s+(?:مسموع|مرئي)|إخطار)|صافرة\s+إنذار\s+الحريق\s+(?:مطلوبة|إلزامية)|907\.5)/i, ["907.5"]],
    // Fire alarm monitoring / supervising station — Section 907.6
    [/\b(?:fire\s+alarm\s+(?:monitor(?:ing|ed)|supervis\w+)\s+(?:station|service)?|fire\s+alarm\s+(?:system\s+)?(?:need\s+to\s+be\s+)?monitor(?:ing|ed)\b|fire\s+alarm\s+monitoring\b|supervising\s+station\s+(?:fire\s+alarm|monitoring|required)|central\s+(?:station\s+)?(?:fire\s+alarm\s+)?monitoring|UL\s+listed\s+central\s+station|907\.6|section\s+907\.6|remote\s+(?:supervising\s+station|monitoring)\s+fire\s+alarm)\b/i, ["907.6"]],
    [/(?:مراقبة\s+(?:نظام\s+)?إنذار\s+الحريق|محطة\s+(?:مراقبة|إشراف)\s+(?:الإنذار|الحريق)|مركز\s+المراقبة\s+(?:الحريق|إنذار)|907\.6)/i, ["907.6"]],
    // Commercial cooking hood suppression — Section 911 (SBC 801 / NFPA 96)
    [/\b(?:commercial\s+cooking\s+(?:hood\s+)?suppress\w*|kitchen\s+(?:hood\s+)?suppress\w*|restaurant\s+(?:hood\s+)?suppress\w*|type\s+[i1]\s+hood\s+(?:suppress\w*|fire\s+system|required)|cooking\s+hood\s+(?:fire|suppress\w*|system|required)|where\s+(?:is\s+)?(?:a\s+)?(?:kitchen|cooking|hood)\s+suppress\w*\s+required|when\s+(?:is\s+)?(?:a\s+)?(?:kitchen|cooking)\s+suppress\w*\s+required|grease.laden\s+(?:vapors?\s+)?(?:hood|suppress\w*)|fryer\s+(?:hood\s+)?suppress\w*|broiler\s+(?:hood\s+)?suppress\w*|griddle\s+(?:hood\s+)?suppress\w*|wet\s+chemical\s+system\b|wet\s+chemical\s+(?:system\s+)?(?:kitchen|cooking|hood|commercial)|(?:commercial\s+kitchen|cooking\s+equipment)\s+wet\s+chemical|wet\s+chemical\s+(?:for\s+(?:a\s+)?)?(?:commercial\s+kitchen|cooking)|UL\s*300\s+(?:wet|chemical|kitchen|cooking)|NFPA\s*96\s+(?:suppress\w*|hood|cooking|kitchen)|Ansul\s+(?:R.102|hood|cooking|kitchen)|cooking\s+hood\s+fusible\s+link|hood\s+suppress\w*\s+(?:6.month|semi.annual|inspect\w*)|sprinkler\s+(?:does\s+not|not|no)\s+(?:replace|substitute)\s+(?:hood|cooking|kitchen)\s+suppress\w*|hood\s+suppress\w*\s+vs\s+sprinkler|911\b|section\s+911)\b/i, ["911"]],
    [/(?:نظام\s+(?:ال)?إخماد\s+(?:(?:ال)?مطبخ|شفاط\s+(?:ال)?مطبخ)|إخماد\s+(?:شفاط|مطبخ)\s+(?:تجاري|(?:ال)?مطاعم|(?:ال)?مطبخ)|شفاط\s+(?:نوع\s+)?(?:I|1|الأول)\s+(?:إخماد|نظام)|متى\s+يلزم\s+(?:نظام\s+)?إخماد\s+(?:ال)?مطبخ|(?:قلاية|شواية)\s+(?:(?:ال)?زيت\s+)?(?:(?:ال)?تجارية?\s+)?(?:إلى\s+)?(?:نظام\s+)?إخماد|إخماد\s+(?:قلاية|شواية|شبكة)\s+(?:(?:ال)?زيت|(?:ال)?مطبخ|(?:ال)?تجارية)?|(?:قلاية|شواية)\s+(?:(?:ال)?زيت)?\s*(?:(?:ال)?تجارية)?\s+(?:يلزمها|تحتاج)\s+(?:نظام\s+)?(?:ال)?إخماد|نظام\s+(?:ال)?كيميائي\s+(?:ال)?رطب\s+(?:(?:ال)?مطبخ|(?:ال)?إطفاء)|NFPA\s*96|صيانة\s+(?:نظام\s+)?إخماد\s+(?:ال)?مطبخ|تفتيش\s+(?:نظام\s+)?(?:إخماد\s+)?(?:ال)?مطبخ\s+(?:6\s+أشهر|كل\s+6)|تنظيف\s+(?:ال)?شفاط|إغلاق\s+الغاز\s+عند\s+(?:تشغيل|تفعيل)\s+(?:ال)?إخماد|911\b)/i, ["911"]],
    // Smoke and heat removal / roof vents — Section 910 (SBC 801)
    [/\b(?:smoke\s+and\s+heat\s+(?:vents?|removal|exhaust)|smoke\s+vents?\s+(?:required|where\s+required|design|area|ratio|spacing|fusible|not\s+required|sprinkler\s+exception|exception)|smoke\s+vents?\s+(?:in|for)\s+(?:an?\s+)?(?:F.1|S.1|warehouse|storage|factory)|draft\s+curtains?\s+(?:depth|required|smoke|with)|curtain\s+boards?\s+(?:required|depth|smoke)|fusible\s+link\s+165|heat\s+vents?\s+(?:required|roof)|roof\s+smoke\s+vents?|high.piled\s+(?:storage\s+)?(?:smoke\s+)?vents?|vent\s+area\s+ratio\s+(?:smoke|1.100|1:100)|smoke\s+removal\s+(?:warehouse|factory|storage)|(?:F.1|S.1)\s+(?:warehouse\s+|storage\s+|factory\s+)?smoke\s+vents?|910\b|section\s+910)\b/i, ["910"]],
    [/(?:فتحات\s+(?:الدخان\s+(?:والحرارة|والتهوية)|الحريق\s+السقفية?|(?:ال)?تهوية\s+(?:ال)?حريق)|(?:ال)?تهوية\s+(?:ال)?دخان\s+(?:والحرارة|(?:ال)?سقفية?)|ستائر\s+(?:ال)?دخان|حواجز\s+(?:ال)?دخان\s+(?:السقفية|(?:ال)?سقف)|نظام\s+(?:طرد|إزالة)\s+(?:ال)?دخان\s+(?:والحرارة|(?:ال)?سقفي)|متى\s+(?:تُلزم|تلزم|تجب)\s+فتحات\s+(?:ال)?دخان|فتحات\s+دخان\s+(?:(?:ال)?مستودعات|(?:ال)?مصانع|(?:ال)?تخزين)|910\b)/i, ["910"]],
    // Gas detection systems — Section 916 (SBC 801)
    [/\b(?:gas\s+detection\s+(?:system|required|where\s+required|HPM|H.5|semiconductor|requirement)|combustible\s+gas\s+(?:detectors?|detection|alarm)|toxic\s+gas\s+detection\s+(?:required|system|HPM)|gas\s+detectors?\s+(?:required|(?:be\s+)?located|location|ceiling|floor|placement|lighter|heavier|for\s+natural)|where\s+(?:should\s+)?gas\s+detectors?\s+(?:be\s+)?(?:placed|located|installed)|LEL\s+(?:25|alarm|threshold)|25\s*(?:percent|%)\s*(?:of\s+)?LEL|lower\s+explosive\s+limit\s+(?:alarm|25|gas)|automatic\s+gas\s+shutoff|gas\s+shutoff\s+(?:valve|automatic|fail.safe)|gas\s+detection\s+(?:repair\s+garage|refrigerating|HPM|H.5)|UL\s*2075|916\b|section\s+916)\b/i, ["916"]],
    [/(?:نظام\s+(?:ال)?كشف\s+(?:ال)?(?:غاز|تسرب\s+الغاز)|كاشف\s+(?:ال)?(?:غاز|غاز\s+(?:الخطر|السام|القابل\s+للاشتعال))|متى\s+(?:يلزم|يجب)\s+(?:نظام\s+)?كشف\s+(?:ال)?غاز|إغلاق\s+(?:تلقائي\s+)?(?:ال)?غاز|صمام\s+إغلاق\s+(?:ال)?غاز|حد\s+(?:ال)?إنذار\s+(?:ال)?غاز|(?:25\s*(?:بالمئة|%))\s+(?:من\s+)?(?:حد\s+)?الاشتعال|تهوية\s+طارئة\s+(?:عند\s+)?(?:كشف\s+)?(?:ال)?غاز|موقع\s+كاشف\s+(?:ال)?غاز|916\b)/i, ["916"]],
    // Fire pumps — Section 913 (SBC 801)
    [/\b(?:fire\s+pump\s+(?:required|where\s+required|requirement|churn\s+test|pressure|flow|weekly\s+test|annual\s+test|room|driver|controller|diesel|electric)|where\s+(?:is\s+)?(?:a\s+)?fire\s+pump\s+required|fire\s+pump\s+(?:testing|certification|commissioning|room\s+requirement|ventilation)|system\s+demand\s+exceeds?\s+(?:available|supply)\s+pressure|913\b|section\s+913|pump\s+room\s+fire\s+(?:rating|protection|separation))\b/i, ["913"]],
    [/(?:مضخة\s+(?:الحريق|إطفاء\s+الحرائق)\s*(?:متطلبات|إلزامية|مطلوبة|اختبار|غرفة)?|اختبار\s+مضخة\s+(?:الحريق|الإطفاء)|غرفة\s+مضخة\s+(?:الحريق|الإطفاء)|913\b|متى\s+تجب\s+مضخة\s+الحريق)/i, ["913"]],
    // Guardrails — Section 1015 (SBC 201)
    [/\b(?:guard(?:rail)?s?\s+(?:required|where\s+required|height|load|opening\s+limit|baluster|4\s*inch|4.inch|42\s*inch|42.inch\s+guard|200.?lb|open.sided|walking\s+surface)|where\s+(?:are?\s+)?guards?\s+required|open.sided\s+(?:walking\s+surface|floor|balcony|mezzanine)\s+(?:guard|rail|barrier)|baluster\s+spacing\s+(?:4|guard)|guard\s+(?:railing|height|load\s+require|opening|opening\s+4)|1015\b|section\s+1015|30.inch\s+(?:drop|guard\s+required|above\s+floor))\b/i, ["1015"]],
    [/(?:درابزين\s+(?:واقٍ|واق|حماية|جانبي|سطح|شرفة|الحماية)|متى\s+يلزم\s+(?:ال)?درابزين|حاجز\s+(?:الوقاية\s+من\s+السقوط|الحماية\s+من\s+السقوط)|1015\b|وقاية\s+من\s+السقوط\s+(?:متطلبات|ارتفاع|درابزين)|ارتفاع\s+(?:حاجز|درابزين)\s+(?:ال)?(?:حماية|واقٍ)|مسافة\s+بين\s+سيقان\s+الدرابزين)/i, ["1015"]],
    // Luminous egress path markings — Section 1024 (SBC 201)
    [/\b(?:luminous\s+(?:egress\s+)?(?:path\s+)?markings?|photoluminescent\s+(?:egress|stair|marking|path)|self.luminous\s+(?:egress|marking|path)|glow.in.(?:the.)?dark\s+(?:stair|egress)|stair\s+nosing\s+markings?|egress\s+path\s+markings?|egress\s+markings?\s+(?:required|stairway|where)|high.rise\s+(?:egress|stair)\s+markings?|where\s+(?:are?\s+)?(?:luminous|photoluminescent)\s+(?:egress\s+)?markings?\s+required|ASTM\s+E2072|UL\s*1994\s+egress|0\.30\s+mcd|1024\b|section\s+1024)\b/i, ["1024"]],
    [/(?:علامات\s+(?:مسار\s+)?الإخلاء\s+(?:المضيئة|الفسفورية|اللمعانية)|علامات\s+(?:السلالم|الدرج)\s+(?:المضيئة|اللمعانية)|1024\b|إضاءة\s+مسار\s+الهروب|فسفور\s+(?:مسار|سلالم)\s+الهروب)/i, ["1024"]],
    // Hazardous materials / control areas / MAQ — Section 414 (SBC 201)
    [/\b(?:control\s+area\s+(?:hazmat|hazardous|fire\s+barrier|floor|limit|MAQ|required|maximum)|maximum\s+allowable\s+quantit\w+|MAQ\b|MAQ\s+(?:hazmat|per\s+control|floor|percentage|threshold|exceeded?)|hazardous\s+materials?\s+(?:storage\s+limit|quantity\s+limit|control\s+area|MAQ|where\s+required|quantities?\s+exceed)|how\s+many\s+control\s+areas?|control\s+areas?\s+per\s+floor|flammable\s+liquid\s+storage\s+(?:limit|MAQ|quantity)|hazmat\s+(?:ventilation|spill\s+control|containment|drainage|storage)|spill\s+control\s+containment\s+(?:hazmat|flammable)|414\b|section\s+414|Table\s+307\.1|table\s+414)\b/i, ["414"]],
    [/(?:(?:ال)?مواد\s+(?:ال)?خطرة\s+(?:كميات|تخزين|منطقة\s+تحكم)|(?:كمية|كميات)\s+(?:ال)?مواد\s+(?:ال)?خطرة|(?:ال)?مناطق\s+(?:ال)?تحكم\s+(?:ال)?(?:مسموح|المواد|الخطرة|للمواد)|منطقة\s+(?:ال)?تحكم\s+(?:(?:ال)?مواد\s+(?:ال)?خطرة|(?:ال)?خطرة)|(?:ال)?حد\s+(?:ال)?أقصى\s+للكميات\s+(?:ال)?مسموح|414\b|حد\s+(?:ال)?تخزين\s+(?:(?:ال)?مواد\s+(?:ال)?قابلة\s+للاشتعال|(?:ال)?خطرة))/i, ["414"]],
    // Spray finishing / dip tanks / application groups — Section 416 (SBC 201)
    [/\b(?:spray\s+(?:finish\w*|booth|room|area|paint\w*|apply\w*|appli\w*)\s*(?:fire|booth|protect\w*|require\w*|ventilat\w*|code|rule|standard|NFPA)?|paint\s+spray\s+(?:booth|room|fire|protect\w*|require\w*|ventilat\w*)|spray\s+booth\s+(?:size|area|limit|construct\w*|fire|sprinkler|ventilat\w*|required|code|NFPA|electrical|LEL|separation)|spray\s+room\s+(?:fire|protect\w*|code|require\w*)|1[,.]?000\s*sq\s*ft\s*spray|1[,.]?500\s*sq\s*ft\s*spray|spray\s+booth\s+(?:10\s*(?:percent|%)\s*(?:of\s+)?room|floor\s+area\s+limit)|dip\s+tank\s+(?:fire|protect\w*|flammable|combustible|code|NFPA|require\w*|overflow|operat\w*)|dip\s+tank|flow.coat\s+(?:fire|flammable)|NFPA\s*33\s+(?:spray|finish\w*|booth|flammable)|NFPA\s*34\s+(?:dip|tank|flammable)|powder\s+coat\w*\s+(?:booth|fire|dust|protect\w*)|electrostatic\s+(?:spray|coat\w*)\s+(?:fire|require\w*|code)|combustible\s+dust\s+(?:coat\w*|spray|booth)|spray\s+(?:application|finish\w*)\s+(?:Group\s+H|H.occupanc\w*|MAQ\s+exceed\w*|flammable\s+liquid)|when\s+(?:does\s+)?spray\s+(?:booth|finish\w*)\s+(?:become|trigger|require\w*)\s+(?:Group\s+H|H.occupanc\w*)|F.1\s+(?:spray|finish\w*|dip\s+tank)|spray\s+booth\s+(?:H.2|H.3|H\s+occupanc\w*)|NEC\s+(?:Class\s+I|Article\s+516)\s+spray|416\b|section\s+416)\b/i, ["416"]],
    [/(?:كشك\s+(?:ال)?رش|غرفة\s+(?:ال)?رش|(?:ال)?رش\s+(?:الكيميائي|المواد|(?:ال)?طلاء|(?:ال)?بوية)\s+(?:(?:ال)?حريق|(?:ال)?اشتراطات|(?:ال)?متطلبات)|مساحة\s+كشك\s+(?:ال)?رش|اشتراطات\s+كشك\s+(?:ال)?رش|حماية\s+(?:حريق\s+)?كشك\s+(?:ال)?رش|تهوية\s+كشك\s+(?:ال)?رش|رشاشات\s+كشك\s+(?:ال)?رش|بناء\s+كشك\s+(?:ال)?رش|حوض\s+(?:ال)?غمس|NFPA\s*33|NFPA\s*34|طلاء\s+(?:ال)?بودرة\s+(?:(?:ال)?حريق|(?:ال)?كشك)|غبار\s+(?:ال)?بودرة\s+(?:قابل\s+للاشتعال|(?:ال)?حريق)|رش\s+كهروستاتيكي\s+(?:(?:ال)?حريق|(?:ال)?اشتراطات)|متى\s+(?:يصبح|تصبح)\s+(?:عملية\s+)?(?:ال)?رش\s+إشغال\s+(?:H|خطر)|إشغال\s+F-1\s+(?:(?:ال)?رش|(?:ال)?طلاء)|416\b)/i, ["416"]],
    // High-hazard Group H occupancies — Section 415 (SBC 201)
    [/\b(?:H.(?:1|2|3|4|5)\s+occupanc\w+|group\s+H.(?:1|2|3|4|5)|high.hazard\s+(?:occupanc\w+|group)|H\s+occupanc\w+\s+(?:classified|required|classification|trigger)|when\s+(?:is\s+)?(?:H\s+|high.hazard\s+)occupanc\w+\s+required|detonation\s+(?:hazard|occupanc\w+)\s+(?:H-1|group\s+H)|deflagration\s+(?:hazard|H-2|group)|HPM\s+(?:fabrication|semiconductor|H-5)|hazardous\s+production\s+material|H-5\s+(?:fab|semiconductor)|semiconductor\s+(?:fab|fabrication)\s+(?:fire\s+code|H-5|hazardous)|explosive\s+(?:storage|occupanc\w+)\s+(?:H-1|group\s+H|detached)|H.occupanc\w+\s+sprinkler|415\b|section\s+415)\b/i, ["415"]],
    [/(?:إشغال\s+H\s*-\s*(?:1|2|3|4|5)|المجموعة\s+H\s+(?:الخطرة|إشغال)|إشغال\s+عالي\s+الخطورة|مواد\s+متفجرة\s+(?:إشغال|مبنى\s+منفصل)|415\b)/i, ["415"]],
    // Interior exit stairways — Section 1023 (SBC 201)
    [/\b(?:interior\s+exit\s+stair(?:way)?|enclosed\s+exit\s+stair(?:way)?|fire.rated\s+stair\s+(?:shaft|enclosure)|exit\s+stair(?:way)?\s+enclosure|interior\s+exit\s+stair(?:way)?\s+(?:enclosure|rating|openings?|construction|fire|1.hour|2.hour|continuity|discharge|door)|exit\s+stair(?:way)?\s+(?:fire\s+rating|fire.rated|1.hour|2.hour|4\s+stories|shaft|enclosed|opening|penetration|self.closing)|protected\s+exit\s+stair(?:way)?|exit\s+stair\s+shaft|stair(?:way)?\s+(?:to\s+roof|extend\w*\s+to\s+(?:the\s+)?roof|(?:reach|access)\s+(?:the\s+)?roof)\s*(?:require\w*|4\s+stories)?|exit\s+stair(?:way)?\s+(?:extend\w*|reach)\s+to\s+(?:the\s+)?roof|stair(?:way)?\s+serving\s+4\s+stories\s+(?:2.hour|two.hour|enclosure|require\w*)|4.story\s+(?:stair|exit)\s+(?:2.hour|enclosure)|exit\s+discharge\s+(?:through\s+)?lobby\s+(?:exception|50\s*percent|sprinkler)|lobby\s+discharge\s+exception\s+(?:exit|stair)|floor.level\s+(?:identification\s+)?signs?\s+stair(?:way)?|1023\.3|1023\.4|section\s+1023|1023\b)\b/i, ["1023"]],
    [/(?:درج\s+(?:ال)?مخرج\s+(?:الداخلي|(?:ال)?محمي|(?:ال)?مغلق|(?:ال)?المغلق)|(?:ال)?درج\s+(?:ال)?مغلق\s+(?:(?:ال)?مخرج|بجدار\s+مقاوم|(?:ال)?محمي)|تغليف\s+درج\s+(?:ال)?مخرج|تقييم\s+(?:حريق\s+)?درج\s+(?:ال)?مخرج|فتحات\s+درج\s+(?:ال)?مخرج\s+(?:ال)?داخلي|باب\s+(?:درج\s+)?(?:ال)?مخرج\s+(?:(?:ال)?غلق\s+(?:ال)?ذاتي|ذاتي)|درج\s+(?:ال)?مخرج\s+(?:1|ساعة\s+واحدة)\s+(?:ساعة)?|درج\s+(?:ال)?مخرج\s+(?:2|ساعتين)\s+(?:ساعة)?|استمرارية\s+(?:تغليف\s+)?درج\s+(?:ال)?مخرج|درج\s+(?:ال)?مخرج\s+(?:حتى|إلى)\s+(?:ال)?سطح|لافتات\s+(?:تعريف\s+)?(?:الطابق|رقم)\s+(?:في\s+)?درج\s+(?:ال)?هروب|1023\.3|1023\.4|1023\b)/i, ["1023"]],
    // Exit access stairways — Section 1019 (SBC 201)
    [/\b(?:exit\s+access\s+stair(?:way)?|open\s+stair(?:way)?\s+(?:egress|more\s+than\s+2\s+stor|connect\w*|between\s+floor)|unenclosed\s+stair(?:way)?\s+(?:egress|more\s+than|connect\w*)|stair(?:way)?\s+enclosure\s+required|exit\s+access\s+stair\s+(?:enclosure|openings?|penetration|fire\s+rating|travel)|open\s+stair(?:way)?\s+(?:2|two)\s+stor|open\s+stair\s+(?:exception|type\s+i)|travel\s+distance\s+(?:through|across|via)\s+stair|1019\.3|section\s+1019|1019\b)\b/i, ["1019"]],
    [/(?:درج\s+(?:وصول\s+)?(?:ال)?مخرج\s+(?:المفتوح|تغليف|فتحات|متطلبات)|(?:ال)?درج\s+(?:ال)?مفتوح\s+(?:بين\s+(?:الطوابق|أكثر)|أكثر\s+من\s+طابقين|تغليف)|تغليف\s+(?:ال)?درج\s+(?:(?:وصول\s+)?(?:ال)?مخرج|(?:ال)?هروب)|فتحات\s+(?:ال)?درج\s+(?:(?:ال)?مغلق|(?:ال)?مخرج|(?:ال)?هروب)|مسافة\s+(?:ال)?سفر\s+عبر\s+(?:ال)?درج|1019\.3|1019\b)/i, ["1019"]],
    // Exit passageways — Section 1022 (SBC 201)
    [/\b(?:exit\s+passageway|exit\s+passage\b|horizontal\s+exit\s+component|exit\s+passageway\s+(?:width|construction|fire\s+rating|rating|openings?|equipment|dead\s+end|sprinkler|1.?hour|2.?hour|require)|connecting\s+(?:exit\s+stair(?:way)?\s+to\s+exterior|stair\s+discharge)|exit\s+discharge\s+(?:horizontal|passage)|protected\s+exit\s+horizontal|exit\s+passageway\s+vs\s+corridor|corridor\s+vs\s+exit\s+passageway|1022\b|section\s+1022)\b/i, ["1022"]],
    [/(?:ممر\s+(?:ال)?مخرج(?:\s+(?:المحمي|الأفقي|عرض|فتحات|معدات|تقييم|حريق|نهاية\s+مسدودة|متطلبات))?|(?:ال)?ممر\s+(?:ال)?أفقي\s+(?:(?:ال)?مخرج|محمي|للهروب)|متطلبات\s+ممر\s+(?:ال)?مخرج|فتحات\s+ممر\s+(?:ال)?مخرج|عرض\s+ممر\s+(?:ال)?مخرج|تقييم\s+حريق\s+ممر\s+(?:ال)?مخرج|معدات\s+ممر\s+(?:ال)?مخرج|1022\b)/i, ["1022"]],
  ];
  for (const [pattern, tableIds] of SEMANTIC_ALIASES) {
    if (pattern.test(query)) {
      for (const id of tableIds) found.add(id);
    }
  }

  // Legacy table IDs → map to their 2024 replacements and add both
  const LEGACY_MAP: Record<string, string[]> = {
    "503":       ["504.3", "504.4", "506.2"],
    "1004.1.2":  ["1004.5"],
    "1004.1":    ["1004.5"],
  };
  for (const [legacy, replacements] of Object.entries(LEGACY_MAP)) {
    const escaped = legacy.replace(/\./g, "\\.");
    if (new RegExp(`(?:table|جدول)\\s+${escaped}\\b`, "i").test(query) ||
        new RegExp(`\\b${escaped}\\b`).test(lower)) {
      found.add(legacy); // keep original for note
      for (const r of replacements) found.add(r);
    }
  }

  return [...found];
}

/**
 * Fetch structured table rows from sbc_code_tables for any table IDs found in the query.
 * Returns a context block ready to be prepended to the system prompt, plus the list of
 * table IDs that were matched and returned.
 */
// deno-lint-ignore no-explicit-any
async function fetchStructuredTables(
  query: string,
  supabaseAdmin: any,
): Promise<{ context: string; matchedTableIds: string[] }> {
  const tableIds = extractTableIds(query);
  if (tableIds.length === 0) return { context: "", matchedTableIds: [] };

  console.log(`[StructuredTable] Query references table IDs: ${tableIds.join(", ")}`);

  // Deduplicate and fetch only known (non-legacy) IDs from DB
  const LEGACY_IDS = new Set(["503", "1004.1.2", "1004.1"]);
  const fetchIds = tableIds.filter(id => !LEGACY_IDS.has(id));

  if (fetchIds.length === 0) return { context: "", matchedTableIds: [] };

  const { data: rows, error } = await supabaseAdmin
    .from("sbc_code_tables")
    .select("table_id, table_title, source_code, edition, content_md, notes, supersedes")
    .in("table_id", fetchIds)
    .order("table_id");

  if (error) {
    console.error("[StructuredTable] DB error:", error.message);
    return { context: "", matchedTableIds: [] };
  }

  if (!rows || rows.length === 0) {
    console.log("[StructuredTable] No rows found for IDs:", fetchIds.join(", "));
    return { context: "", matchedTableIds: [] };
  }

  console.log(`[StructuredTable] Found ${rows.length} structured table(s): ${rows.map((r: any) => r.table_id).join(", ")}`);

  // Build context block — this is injected BEFORE the storage chunk context
  let context = "\n\n🗂️ STRUCTURED CODE TABLES (DB-AUTHORITATIVE — CITE THESE VERBATIM):\n";
  context += "⚠️ The following tables are retrieved directly from the structured SBC database.\n";
  context += "They are the PRIMARY authoritative source for this response. Quote them exactly.\n";

  for (const row of rows as any[]) {
    const legacyNote = (row.supersedes && row.supersedes.length > 0)
      ? `\n> ⚠️ **Edition Note:** This table (${row.table_id}) replaces legacy Table(s) ${row.supersedes.join(", ")} from earlier SBC editions. Always cite ${row.table_id} when working with SBC 201 2024.`
      : "";
    context += `\n\n${"=".repeat(60)}\n`;
    context += `📋 SOURCE: ${row.source_code} | Edition: ${row.edition} | Table ${row.table_id}\n`;
    context += `${"=".repeat(60)}\n`;
    context += row.content_md;
    if (legacyNote) context += legacyNote;
    if (row.notes) context += `\n\n**Additional Notes:** ${row.notes}`;
  }

  context += "\n\n" + "=".repeat(60) + "\n";
  context += "END OF STRUCTURED TABLE DATA — Continue with retrieved document chunks below.\n";

  return { context, matchedTableIds: rows.map((r: any) => r.table_id) };
}

// ==================== VECTOR SEMANTIC SEARCH (pgvector + Gemini Embeddings) ====================

async function fetchSBCContextVector(
  query: string,
  mode: string,
  extraKeywords?: string[]
): Promise<{ context: string; files: string[] }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !GEMINI_API_KEY) {
      console.error("[Vector RAG] Missing env vars, falling back to keyword search");
      return fetchSBCContext(query, extraKeywords);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Generate query embedding
    const embResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { role: "user", parts: [{ text: query.substring(0, 8000) }] },
          outputDimensionality: 768,
        }),
      }
    );

    if (!embResponse.ok) {
      console.error("[Vector RAG] Embedding failed:", embResponse.status);
      return fetchSBCContext(query, extraKeywords);
    }

    const embData = await embResponse.json();
    const queryEmbedding = embData.embedding?.values;
    if (!queryEmbedding) {
      console.error("[Vector RAG] No embedding returned, falling back");
      return fetchSBCContext(query, extraKeywords);
    }

    // 2. Detect code type filter
    let filterCode: string | null = null;
    if (query.match(/801|حماية.*حري|fire.*protect|رشاش|sprinkler|إنذار|alarm|إطفاء/i)) {
      filterCode = 'SBC801';
    } else if (query.match(/201|بناء.*عام|general.*build|مخرج|exit|درج|stair/i)) {
      filterCode = 'SBC201';
    }

    // 3. Vector search
    const matchCount = mode === 'primary' ? 10 : 25;
    const { data: matches, error } = await supabaseAdmin.rpc('match_sbc_documents', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_code: filterCode,
    });

    if (error || !matches?.length) {
      console.error("[Vector RAG] Search error:", error?.message || "no matches");
      return fetchSBCContext(query, extraKeywords);
    }

    console.log(`[Vector RAG] Found ${matches.length} matches, top similarity: ${matches[0]?.similarity?.toFixed(3)}`);

    // 4. Build context
    const usedFiles = [...new Set(matches.map((m: any) => m.file_name))] as string[];
    let context = '\n=== SBC REFERENCE DOCUMENTS (Vector Search Results) ===\n';
    const contextLimit = 120000;

    for (const match of matches) {
      const entry = `\n=== ${match.file_name} | Section: ${match.section_number || 'N/A'} | Pages: ${match.page_start}-${match.page_end} | Similarity: ${match.similarity?.toFixed(3)} ===\n${match.content}\n`;
      if (context.length + entry.length > contextLimit) break;
      context += entry;
    }

    return { context, files: usedFiles };
  } catch (err) {
    console.error("[Vector RAG] Fatal error:", err);
    return fetchSBCContext(query, extraKeywords);
  }
}

// ==================== GEMINI FORMAT CONVERTER ====================

function convertToGeminiFormat(messages: any[]) {
  const systemParts: string[] = [];
  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    } else {
      const role = msg.role === "assistant" ? "model" : "user";
      if (typeof msg.content === "string") {
        contents.push({ role, parts: [{ text: msg.content }] });
      } else if (Array.isArray(msg.content)) {
        const parts = msg.content.map((part: any) => {
          if (part.type === "text") return { text: part.text };
          if (part.type === "image_url") {
            const url = part.image_url.url;
            const match = url.match(/^data:(.+?);base64,(.+)$/s);
            if (match) return { inline_data: { mime_type: match[1], data: match[2] } };
            return { text: "[image]" };
          }
          return { text: JSON.stringify(part) };
        });
        contents.push({ role, parts });
      }
    }
  }

  return {
    systemInstruction: systemParts.length > 0
      ? { parts: [{ text: systemParts.join("\n\n") }] }
      : undefined,
    contents,
  };
}

// ==================== VISION PIPELINE (5-STAGE MISSION JOURNEY) ====================

async function callAINonStreaming(apiKey: string, systemPrompt: string, userContent: any[]): Promise<string> {
  const { systemInstruction, contents } = convertToGeminiFormat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ]);

  // Try gemini-2.5-pro first, fallback to flash if quota exceeded
  const models = ["gemini-2.5-pro", "gemini-2.5-flash"];
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: { temperature: 0.7 },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    const errorText = await response.text();
    if ((response.status === 429 || response.status === 404) && model !== models[models.length - 1]) {
      console.log(`[Gemini] Non-streaming ${model} returned ${response.status}, trying next model`);
      continue;
    }
    console.error(`[Gemini] Non-streaming error: ${response.status} | Model: ${model} | ${errorText.slice(0, 300)}`);
    throw new Error(`AI call failed: ${response.status}`);
  }
  throw new Error("All Gemini models failed");
}

function getVisionPlanningPrompt(language: string): string {
  return language === "en" 
    ? `You are a fire safety planning agent. Analyze the uploaded engineering drawing/image and classify:
1. Building Type (residential, commercial, industrial, mixed-use, etc.)
2. Occupancy Group per SBC 201 Chapter 3 (A-1, A-2, B, E, F-1, F-2, H, I, M, R-1, R-2, R-3, S-1, S-2, U)
3. Hazard Level (Low, Ordinary Group 1, Ordinary Group 2, Extra Hazard Group 1, Extra Hazard Group 2)
4. Number of stories (if visible)
5. Estimated floor area (if determinable)
6. Visible fire protection systems (sprinklers, alarms, standpipes, etc.)
7. Key observations about exits, corridors, stairs

Respond in JSON format:
{"buildingType":"...","occupancyGroup":"...","hazardLevel":"...","stories":"...","floorArea":"...","visibleSystems":["..."],"observations":["..."]}`
    : `أنت عميل تخطيط للسلامة من الحرائق. حلل المخطط الهندسي المرفوع وصنّف:
1. نوع المبنى
2. مجموعة الإشغال حسب SBC 201 الفصل 3
3. مستوى الخطورة
4. عدد الطوابق (إذا ظاهر)
5. المساحة التقريبية
6. أنظمة الحماية المرئية
7. ملاحظات على المخارج والممرات والسلالم

أجب بصيغة JSON:
{"buildingType":"...","occupancyGroup":"...","hazardLevel":"...","stories":"...","floorArea":"...","visibleSystems":["..."],"observations":["..."]}`;
}

function getVisionCoTPrompt(planningResult: string, language: string): string {
  return language === "en"
    ? `Based on this building classification:
${planningResult}

Build a structured checklist of SBC code sections to verify. For each item, specify:
- The exact SBC section number (e.g., SBC 801 Section 903.2.x, SBC 201 Table 1006.3.x)
- What to check
- Why it's relevant

Also provide search keywords that should be used to find relevant code sections.

Respond in JSON format:
{"checklist":[{"section":"...","check":"...","reason":"..."}],"searchKeywords":["..."]}`
    : `بناءً على تصنيف المبنى التالي:
${planningResult}

أنشئ قائمة فحص منظمة لأقسام كود SBC التي يجب التحقق منها. لكل عنصر حدد:
- رقم المادة الدقيق
- ما يجب فحصه
- سبب الأهمية

وقدم كلمات بحث لاسترجاع الأقسام ذات الصلة.

أجب بصيغة JSON:
{"checklist":[{"section":"...","check":"...","reason":"..."}],"searchKeywords":["..."]}`;
}

// ==================== VISION ADVISORY FINAL PROMPT (for Advisory/Standard mode) ====================
// Used when images are submitted in Advisory mode — goal is design guidance, NOT compliance audit.
function getVisionAdvisoryFinalPrompt(language: string): string {
  const lang = language === "en" ? "ENGLISH" : "ARABIC";
  return `[SYSTEM — ConsultX | VISION ANALYSIS - ADVISORY MODE - DESIGN GUIDANCE]

${CORE_RULES}

You are generating DESIGN ADVISORY guidance for an engineering drawing that has been processed through a multi-stage pipeline.

CRITICAL FRAMING: The engineer is at the DESIGN STAGE — they need to know what to design, not whether something built is compliant.
Your goal is NOT to audit a finished design.
Your goal IS to help the engineer understand what fire safety systems and code requirements apply.

YOUR RESPONSE MUST follow this EXACT structure:

## 🔍 الحقائق المرئية / Extracted Facts

List ONLY what is explicitly visible or readable in the drawing:
- Building type, apparent use, and occupancy clues
- Number of floors and approximate areas (if readable)
- Existing labeled systems, spaces, or elements
- Any schedules, legends, or notes visible

State explicitly which items are INFERRED (not labeled) vs CONFIRMED (explicitly labeled).
If a label is unclear or unreadable — say so. Never fabricate room names or functions.

## 📋 المتطلبات الواجب تصميمها / Required Systems to Design

Based on the building type/occupancy identified above, list what the code requires:

For each required system or element:
**النظام / System:** [name] | **المرجع / Code Basis:** [Document + Section] | **المعامل الرئيسي / Key Parameter:** [value or requirement]

Show the reasoning: occupancy → code path → requirement.
If classification is uncertain, present all possible paths — do not assume one.

## 📜 المراجع التقنية / Technical References

<details>
<summary><strong>SBC 201 & SBC 801 Relevant Sections</strong></summary>

For each cited section:
- **Section:** [exact number]
- **Verbatim Quote:** > [exact English text]
- **Design Implication:** [what this means the engineer must design]

</details>

## ❓ البيانات الناقصة / Missing Information

List any information not visible that would change the requirements:
- [ ] [missing item] — [why it affects the required systems]

RESPOND IN: ${lang}`;
}

function getVisionFinalPrompt(language: string): string {
  const lang = language === "en" ? "ENGLISH" : "ARABIC";
  return `[SYSTEM — ConsultX | VISION ANALYSIS - MISSION JOURNEY FINAL RESPONSE]

${CORE_RULES}

You are generating the final analysis for an engineering drawing that has been processed through a multi-stage pipeline.
You will receive:
1. The original image
2. Planning Agent classification results
3. Chain of Thought checklist
4. SBC reference documents retrieved based on the analysis

YOUR RESPONSE MUST follow this EXACT structure:

## 🔍 ملخص الفروقات / Differences Summary

For each requirement checked, use one of these status markers:
- ✅ **مطابق / Compliant**: [item description] — [SBC reference]
- ❌ **غير مطابق / Non-Compliant**: [item description] — [SBC reference]  
- ⚠️ **مشروط / Conditional**: [item description] — [SBC reference]

## 📜 السند القانوني / Legal Basis

<details>
<summary><strong>SBC 801-2024 References</strong></summary>

For each cited section, provide:
- **Section:** [exact number]
- **Verbatim Quote:** > [exact English text from code]
- **Applicability:** [how it applies to this drawing]

</details>

<details>
<summary><strong>SBC 201 References</strong></summary>

[Same format as above]

</details>

## ✅ الإجراءات المطلوبة / Required Actions

- [ ] Action 1
- [ ] Action 2
- [ ] ...

RESPOND IN: ${lang}`;
}

async function runVisionPipeline(
  apiKey: string,
  imageBase64s: string[],
  userQuery: string,
  language: string,
  mode: string = "analysis",
): Promise<{ systemPrompt: string; extraContext: string; usedFiles: string[] }> {
  console.log("🎯 === VISION PIPELINE START ===", imageBase64s.length, "image(s)");
  const pipelineStart = Date.now();

  // Stage 1: Planning Agent
  console.log("📋 Stage 1: Planning Agent...");
  const planningPrompt = getVisionPlanningPrompt(language);
  const imageContent: any[] = [
    ...imageBase64s.map((url: string) => ({ type: "image_url", image_url: { url } })),
    { type: "text", text: userQuery || (language === "en" ? "Analyze this engineering drawing for fire safety compliance." : "حلل هذا المخطط الهندسي من ناحية الامتثال للسلامة من الحرائق.") },
  ];
  
  let planningResult: string;
  try {
    planningResult = await callAINonStreaming(apiKey, planningPrompt, imageContent);
    console.log("✅ Stage 1 complete:", planningResult.slice(0, 200));
  } catch (err) {
    console.error("❌ Stage 1 failed:", err);
    planningResult = '{"buildingType":"unknown","occupancyGroup":"unknown","hazardLevel":"unknown","observations":["Image analysis failed"]}';
  }

  // Stage 2: Chain of Thought
  console.log("🧠 Stage 2: Chain of Thought...");
  const cotPrompt = getVisionCoTPrompt(planningResult, language);
  let cotResult: string;
  let searchKeywords: string[] = [];
  try {
    cotResult = await callAINonStreaming(apiKey, cotPrompt, [{ type: "text", text: planningResult }]);
    console.log("✅ Stage 2 complete:", cotResult.slice(0, 200));
    
    try {
      const cotParsed = JSON.parse(cotResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      if (cotParsed.searchKeywords) {
        searchKeywords = cotParsed.searchKeywords;
      }
    } catch {
      const kwMatch = cotResult.match(/searchKeywords.*?\[(.*?)\]/s);
      if (kwMatch) {
        searchKeywords = kwMatch[1].split(",").map(k => k.trim().replace(/"/g, ""));
      }
    }
  } catch (err) {
    console.error("❌ Stage 2 failed:", err);
    cotResult = '{"checklist":[],"searchKeywords":[]}';
  }

  // Stage 3: Parallel Processing - fetch SBC context
  console.log("⚡ Stage 3: Parallel Processing (SBC retrieval)...");
  const enhancedQuery = `${userQuery} ${planningResult}`;
  const { context: sbcContext, files: usedFiles } = await fetchSBCContextVector(enhancedQuery, 'analysis', searchKeywords);
  console.log(`✅ Stage 3 complete: ${sbcContext.length} chars from ${usedFiles.length} files`);

  // Stage 4 & 5 combined
  console.log("🔀 Stage 4-5: Merge + Final Response (will be streamed)...");
  
  // Advisory mode (standard) → design guidance framing; Analytical (analysis) or Primary → compliance audit framing
  const finalSystemPrompt = mode === "standard"
    ? getVisionAdvisoryFinalPrompt(language)
    : getVisionFinalPrompt(language);

  const extraContext = `
=== PIPELINE STAGE 1: PLANNING AGENT CLASSIFICATION ===
${planningResult}

=== PIPELINE STAGE 2: CHAIN OF THOUGHT CHECKLIST ===
${cotResult}

${sbcContext}
`;

  console.log(`🎯 === VISION PIPELINE STAGES 1-3 DONE in ${Date.now() - pipelineStart}ms ===`);
  
  return { systemPrompt: finalSystemPrompt, extraContext, usedFiles };
}

// ==================== MAIN HANDLER ====================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let userId: string;
    let userEmail = "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Please login to continue" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session, please login again" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    userId = user.id;
    userEmail = user.email || "";
    console.log(`✅ Authenticated user: ${userId}`);

    // Parse body first — mode is needed for per-mode trial limit checks
    const { messages, retry, mode = "standard", language = "ar", image, images, output_format, preferred_standards } = await req.json();
    const resolvedImages: string[] = images ?? (image ? [image] : []);
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    console.log("Chat mode:", mode, "| Language:", language, "| Images:", resolvedImages.length);

    // ===== ACCESS & LIMIT CHECK (server-side source of truth) =====
    {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient    = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
      const now            = new Date();

      // Launch-trial constants (must match launch-trial-activate)
      const LAUNCH_DATE_TS  = new Date("2026-03-28T00:00:00.000Z");
      const CAMPAIGN_END_TS = new Date("2026-04-28T00:00:00.000Z");
      const TRIAL_DAYS_NUM  = 7;

      const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];
      const isAdmin      = userEmail && ADMIN_EMAILS.includes(userEmail);

      // Fetch profile (fix: use user_id column, not id)
      const { data: profile } = await adminClient
        .from("profiles")
        .select("plan_type, launch_trial_status, launch_trial_start, launch_trial_end, created_at")
        .eq("user_id", userId)
        .maybeSingle();

      const isUnlimitedPlan = profile?.plan_type === "enterprise";
      const isLimitedPaidPlan = profile?.plan_type === "engineer" || profile?.plan_type === "pro";
      console.log("[Limit] email:", userEmail, "| plan_type:", profile?.plan_type, "| isAdmin:", isAdmin, "| isUnlimited:", isUnlimitedPlan, "| isLimitedPaid:", isLimitedPaidPlan);

      if (!isAdmin && !isUnlimitedPlan) {
        // ── Check active paid subscription ────────────────────────────────────
        const { data: sub } = await adminClient
          .from("user_subscriptions")
          .select("status, trial_end, current_period_end, past_due_since, subscription_plans(features, slug)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let dailyLimit       = 10;  // free/expired default
        let hasPaidAccess    = false;
        let isTrialing       = false;
        let planFeatures: any = null;
        let planSlug: string | null = null;

        if (sub?.subscription_plans) {
          planFeatures = (sub.subscription_plans as any).features;
          planSlug = (sub.subscription_plans as any).slug;
        }

        if (sub?.status === "trialing" && sub.trial_end && now < new Date(sub.trial_end)) {
          dailyLimit    = 20;
          hasPaidAccess = true;
          isTrialing    = true;
        } else if (sub?.status === "active" && sub.current_period_end && now < new Date(sub.current_period_end)) {
          dailyLimit    = 9999;
          hasPaidAccess = true;
        } else if (sub?.status === "past_due" && sub.past_due_since) {
          const GRACE_DAYS = 7;
          const graceEnd   = new Date(new Date(sub.past_due_since).getTime() + GRACE_DAYS * 86400000);
          if (now < graceEnd) {
            dailyLimit    = 9999;
            hasPaidAccess = true;
          }
        }

        // ── Per-mode enforcement for Engineer/Pro paid plans (not Enterprise) ──
        if (hasPaidAccess && isLimitedPaidPlan && !isTrialing) {
          // primary mode: unlimited, no counter needed
          if (mode === "primary") {
            // pass through without incrementing any counter
          }
          // standard (advisory) mode: check advisory_limit
          else if (mode === "standard") {
            const advisoryLimit = planFeatures?.advisory_limit ?? 20; // default to Engineer limit
            const { data: newCount } = await adminClient.rpc("increment_mode_daily_count", {
              p_user_id: userId,
              p_mode: "standard"
            });
            if (newCount && newCount > advisoryLimit) {
              // Rollback the increment
              await adminClient.rpc("decrement_mode_daily_count", { p_user_id: userId, p_mode: "standard" });
              return new Response(
                JSON.stringify({
                  error: "تجاوزت حد الاستشارات اليومي / Advisory daily limit exceeded",
                  mode: "standard",
                  limit: advisoryLimit
                }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
          // analysis mode: check analysis_limit
          else if (mode === "analysis") {
            const analysisLimit = planFeatures?.analysis_limit ?? 10; // default to Engineer limit
            const { data: newCount } = await adminClient.rpc("increment_mode_daily_count", {
              p_user_id: userId,
              p_mode: "analysis"
            });
            if (newCount && newCount > analysisLimit) {
              // Rollback the increment
              await adminClient.rpc("decrement_mode_daily_count", { p_user_id: userId, p_mode: "analysis" });
              return new Response(
                JSON.stringify({
                  error: "تجاوزت حد التحليلات اليومي / Analysis daily limit exceeded",
                  mode: "analysis",
                  limit: analysisLimit
                }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
        // ── Flat daily limit for trialing users ───────────────────────────────
        else if (hasPaidAccess && isTrialing) {
          if (dailyLimit < 9999) {
            const { data: currentCount } = await adminClient.rpc("increment_daily_usage", { p_user_id: userId });
            if (currentCount && currentCount > dailyLimit) {
              return new Response(
                JSON.stringify({ error: "تجاوزت الحد اليومي للرسائل / Daily message limit exceeded", limit: dailyLimit }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
        // ── Launch trial fallback check (users without a user_subscriptions row) ─
        // Statuses must match current DB CHECK constraint (migration 20260328000002).
        // Valid values: trial_active, trial_expired, eligible_existing_pending,
        //               paid, ineligible.  Stale values eligible_new,
        //               eligible_existing_active, ineligible_window_closed removed.
        let launchTrialStatus = profile?.launch_trial_status ?? null;
        // resolvedTrialEnd tracks the authoritative trial end date across all init paths.
        // It is set wherever a trialEnd Date is computed so that trialIsActive can be
        // evaluated even when `profile` is null (no row yet) or when Object.assign was a no-op.
        let resolvedTrialEnd: Date | null = profile?.launch_trial_end ? new Date(profile.launch_trial_end) : null;

        // Auto-initialize if status not yet set (e.g. Google OAuth users whose
        // auto-trial call has not yet run)
        if (!launchTrialStatus) {
          const userCreatedAt = new Date(profile?.created_at ?? now.toISOString());
          const isNewUser     = userCreatedAt >= LAUNCH_DATE_TS;
          if (now < CAMPAIGN_END_TS) {
            if (isNewUser) {
              const trialEnd = new Date(userCreatedAt.getTime() + TRIAL_DAYS_NUM * 86400000);
              launchTrialStatus = "trial_active";
              resolvedTrialEnd  = trialEnd;
              await adminClient.from("profiles").update({
                launch_trial_status:   "trial_active",
                launch_trial_start:    userCreatedAt.toISOString(),
                launch_trial_end:      trialEnd.toISOString(),
                launch_trial_consumed: true,
                launch_source:         "new_signup",
              }).eq("user_id", userId);
              profile && Object.assign(profile, { launch_trial_end: trialEnd.toISOString() });
            } else {
              // First chat activates the trial for existing users
              const trialStart = now;
              const trialEnd   = new Date(now.getTime() + TRIAL_DAYS_NUM * 86400000);
              launchTrialStatus = "trial_active";
              resolvedTrialEnd  = trialEnd;
              await adminClient.from("profiles").update({
                launch_trial_status:   "trial_active",
                launch_trial_start:    trialStart.toISOString(),
                launch_trial_end:      trialEnd.toISOString(),
                launch_trial_consumed: true,
                launch_source:         "existing_user",
              }).eq("user_id", userId);
              profile && Object.assign(profile, { launch_trial_end: trialEnd.toISOString() });
            }
          } else {
            launchTrialStatus = "ineligible";
            await adminClient.from("profiles").update({ launch_trial_status: "ineligible" }).eq("user_id", userId);
          }
        } // end if (!launchTrialStatus)

        // Activate pending existing users on first chat
        if (launchTrialStatus === "eligible_existing_pending") {
          if (now < CAMPAIGN_END_TS) {
            const trialStart = now;
            const trialEnd   = new Date(now.getTime() + TRIAL_DAYS_NUM * 86400000);
            launchTrialStatus = "trial_active";
            resolvedTrialEnd  = trialEnd;
            await adminClient.from("profiles").update({
              launch_trial_status:   "trial_active",
              launch_trial_start:    trialStart.toISOString(),
              launch_trial_end:      trialEnd.toISOString(),
              launch_trial_consumed: true,
            }).eq("user_id", userId);
            profile && Object.assign(profile, { launch_trial_end: trialEnd.toISOString() });
          } else {
            launchTrialStatus = "ineligible";
            await adminClient.from("profiles").update({ launch_trial_status: "ineligible" }).eq("user_id", userId);
          }
        }

        const trialIsActive =
          launchTrialStatus === "trial_active" &&
          resolvedTrialEnd !== null && now < resolvedTrialEnd;

        if (trialIsActive) {
          // Trial users get the same 20-message daily limit as user_subscriptions
          // trialing users. Per-mode limit functions were dropped in migration
          // 20260328000002 and must not be called.
          const trialDailyLimit = 20;
          const { data: currentCount } = await adminClient.rpc("increment_daily_usage", { p_user_id: userId });
          if (currentCount && currentCount > trialDailyLimit) {
            return new Response(
              JSON.stringify({
                error: "تجاوزت الحد اليومي للرسائل / Daily message limit exceeded",
                limit: trialDailyLimit,
              }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

        } else if (!hasPaidAccess && !trialIsActive) {
          // ── Mode enforcement — server-side source of truth ─────────────────────
          // Free logged-in users (expired trial, cancelled, expired paid, no sub)
          // may only use primary (main) mode. Advisory (standard) and Analytical
          // (analysis) modes require an active paid subscription or active launch
          // trial. The frontend UI lock is a best-effort UX layer; this check is
          // the authoritative gate that prevents direct API bypasses.
          if (mode === "standard" || mode === "analysis") {
            return new Response(
              JSON.stringify({ error: "mode_locked", mode }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Free daily limit (10 messages / 24h) — applies to all non-paid,
          // non-trial users regardless of why their access lapsed.
          const { data: currentCount } = await adminClient.rpc("increment_daily_usage", { p_user_id: userId });
          if (currentCount && currentCount > dailyLimit) {
            return new Response(
              JSON.stringify({
                error: launchTrialStatus === "trial_expired"
                  ? "trial_expired"
                  : "تجاوزت الحد اليومي للرسائل / Daily message limit exceeded",
                limit: dailyLimit,
              }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

    let fullSystemPrompt: string;
    let usedFiles: string[] = [];
    let finalMessages = [...messages];

    if (resolvedImages.length > 0) {
      // ===== VISION PIPELINE =====
      const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
      const userQuery = lastUserMessage?.content || "";

      // Primary mode with images: use Advisory framing (design guidance) — more appropriate than compliance audit for quick queries
      const visionMode = mode === "primary" ? "standard" : mode;
      const { systemPrompt, extraContext, usedFiles: visionFiles } = await runVisionPipeline(
        GEMINI_API_KEY,
        resolvedImages,
        userQuery,
        language,
        visionMode,
      );

      fullSystemPrompt = systemPrompt + extraContext;
      usedFiles = visionFiles;

      const lastUserIdx = finalMessages.map((m: any, i: number) => m.role === "user" ? i : -1).filter((i: number) => i >= 0).pop();
      if (lastUserIdx !== undefined && lastUserIdx >= 0) {
        const originalText = finalMessages[lastUserIdx].content;
        finalMessages[lastUserIdx] = {
          role: "user",
          content: [
            ...resolvedImages.map((url: string) => ({ type: "image_url", image_url: { url } })),
            { type: "text", text: originalText || (language === "en" ? "Analyze this drawing." : "حلل هذا المخطط.") },
          ],
        };
      }
    } else if (mode === "primary") {
      // ===== PRIMARY MODE PIPELINE (no document loading, fast) =====
      fullSystemPrompt = `أنت ConsultX، مستشار حماية من الحرائق. تتحدث بالعربية بأسلوب مهني ودود. مهمتك: فهم مشكلة المهندس بسرعة، الإجابة على الأسئلة السريعة عن الكود السعودي (SBC 201, SBC 801) ومعايير NFPA، واقتراح الانتقال للوضع الاستشاري أو التحليلي إذا كان السؤال يحتاج تعمق أكثر. اجعل إجاباتك مختصرة ومباشرة. اسأل أسئلة استقصائية لفهم المشكلة.

قواعد الانتقال بين الأوضاع:
- إذا طلب المستخدم تحليل مخطط أو صورة هندسية ← اقترح الانتقال للوضع التحليلي
- إذا طلب المستخدم تحليل معمق لفقرة بالكود أو لديه مشروع محدد يحتاج استشارة مفصلة أو طلب مراجع ووثائق ← اقترح الانتقال للوضع الاستشاري
- إذا كان السؤال عام وسريع ← ابق في الوضع الرئيسي ولا تقترح الانتقال
- عند اقتراح الانتقال، اشرح للمستخدم السبب بجملة واحدة ثم اسأله إذا يريد الانتقال
- لا تنتقل تلقائياً أبداً. دائماً اطلب موافقة المستخدم أولاً
- عند اقتراح الانتقال أضف العلامة التالية في نهاية ردك: [SWITCH:استشاري] أو [SWITCH:تحليلي]

=== هوية ConsultX التقنية ===
أنت واجهة منظومة من 12 وكيلاً ذكياً متخصصاً بقيادة وكيل الأوركسترا.
تعتمد على تقنية GraphRAG لفهم الروابط المعقدة بين مجلدات الكود السعودي.

قواعدك الصارمة:
- سياسة صفر هلوسة: إذا لم تكن متأكداً من إجابة تتعلق بفقرة محددة، قل ذلك بصراحة واقترح الانتقال للوضع الاستشاري حيث تنشط وكلاء مراجعة الكود وGraphRAG
- مصدر الحقيقة الوحيد: الكود السعودي (إصدار 2024) ومعايير NFPA/SFPE حصرياً
- سيادة الدفاع المدني: عند أي توصية تقنية، ذكّر أن الكود هو الحد الأدنى الفني وأن الدفاع المدني يملك حق التعديل ميدانياً

قاعدة إضافية صارمة: إذا سُئلت عن رقم فقرة محددة أو متطلب تقني دقيق، لا تجب من ذاكرتك العامة. قل: "للحصول على إجابة مرجعية دقيقة مع نص الكود الأصلي، أنصحك بالانتقال للوضع الاستشاري." ثم أضف [SWITCH:استشاري]`;
      usedFiles = [];
      console.log("Primary mode: using lightweight prompt with escalation rules, no document loading");
    } else {
      // ===== STANDARD/ADVISORY TEXT PIPELINE =====
      const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
      const userQuery = lastUserMessage?.content || "";

      console.log("Fetching SBC context for query:", userQuery.slice(0, 100));

      // ── 1. Structured Table Path (DB-first, highest priority) ─────────────
      // If the query references a known SBC table ID, fetch its exact structured
      // row from sbc_code_tables before running any storage/vector retrieval.
      const supabaseAdminForTables = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { context: structuredTableContext, matchedTableIds } =
        await fetchStructuredTables(userQuery, supabaseAdminForTables);

      if (matchedTableIds.length > 0) {
        console.log(`[StructuredTable] Matched and injected tables: ${matchedTableIds.join(", ")}`);
      }

      // ── 2. Storage/keyword retrieval (always runs; supplements structured tables) ──
      // Use keyword/storage path directly — vector RPC (match_sbc_documents) is not provisioned
      const { context: sbcContext, files } = await fetchSBCContext(userQuery);
      usedFiles = files;
      console.log(`SBC context result: ${sbcContext.length} chars from ${usedFiles.length} files`);

      // ── 3. Assemble final system prompt ──────────────────────────────────────
      const basePrompt = mode === "analysis"
        ? getAnalysisPrompt(language)
        : getStandardPrompt(language);

      fullSystemPrompt = basePrompt;

      // Structured table context is injected FIRST (highest citation priority).
      // Storage chunk context follows.
      if (structuredTableContext) {
        fullSystemPrompt += structuredTableContext;
      }

      if (sbcContext) {
        fullSystemPrompt += sbcContext;
        const warningMsg = language === "en"
          ? `\n\n⚠️ CRITICAL: Cite exact clause numbers from above. If not found, say: "The required information is not available in the current files."`
          : `\n\n⚠️ هام: استشهد بأرقام المواد الدقيقة من المستندات أعلاه. إذا لم تجد، قل: "المعلومات المطلوبة غير متوفرة في الملفات الحالية."`;
        fullSystemPrompt += warningMsg;
      } else if (!structuredTableContext) {
        // No SBC content loaded at all (neither structured tables nor storage chunks).
        // Return a clean 503 instead of calling Gemini with no context (which produces
        // misleading "text not available in provided files" responses).
        console.error("SBC context empty after retrieval — returning 503");
        const errMsg = language === "en"
          ? "Reference documents are temporarily unavailable. Please try again in a moment."
          : "المستندات المرجعية غير متوفرة مؤقتاً. يرجى المحاولة مجدداً بعد لحظات.";
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // If only structuredTableContext loaded (storage failed), we still proceed —
      // the DB table data alone is sufficient to answer the specific table query.
      
      // Final binding reminder: diagnostic protocol takes precedence over reference context
      const finalBindingReminder = language === "en"
        ? `\n\n🔒 FINAL INSTRUCTION: The reference text above is for grounding only. It does NOT mean the user inputs are sufficient. If critical variables (occupancy, height, area) are missing, you MUST stop and ask 1–3 clarifying questions first. Do not produce a final A-F answer until inputs are sufficient. Do not assume missing variables.`
        : `\n\n🔒 تعليمة نهائية ملزمة: النص المرجعي أعلاه للتثبيت فقط ولا يعني أن معطيات المستخدم كافية. إذا كانت المعطيات الحرجة (التصنيف، الارتفاع، المساحة) ناقصة، يجب عليك التوقف فوراً وطرح 1 إلى 3 أسئلة توضيحية. ممنوع تقديم إجابة نهائية (A-F) قبل اكتمال المعطيات. ممنوع افتراض المتغيرات الناقصة.`;
      fullSystemPrompt += finalBindingReminder;
    }
    
    // ── Apply user preferences to system prompt ────────────────────────────
    // output_format and preferred_standards come from the user's saved settings
    // (profiles table). They are forwarded by the frontend with every request.

    // output_format: adjust response style/length
    if (output_format && output_format !== "detailed") {
      const formatInstruction = output_format === "concise"
        ? (language === "en"
          ? "\n\n📏 FORMAT PREFERENCE: The user has requested CONCISE responses. Keep answers brief and direct. Avoid lengthy explanations. Use bullet points over prose where possible. Target under 300 words unless a code section requires verbatim quoting."
          : "\n\n📏 تفضيل التنسيق: المستخدم طلب إجابات موجزة. أبقِ إجاباتك قصيرة ومباشرة. استخدم النقاط بدل الفقرات الطويلة كلما أمكن. هدف أقل من 300 كلمة ما لم يتطلب نص الكود اقتباساً حرفياً.")
        : (language === "en"
          ? "\n\n📄 FORMAT PREFERENCE: The user has requested a REPORT format. Structure your response as a formal engineering report with clear numbered sections, headers, a summary table if applicable, and a final verdict section. Use professional report language."
          : "\n\n📄 تفضيل التنسيق: المستخدم طلب صيغة تقرير رسمي. نظّم إجابتك كتقرير هندسي رسمي بأقسام مرقمة وعناوين واضحة وجدول ملخص إن أمكن وقسم حكم نهائي. استخدم لغة تقارير مهنية.");
      fullSystemPrompt += formatInstruction;
    }

    // preferred_standards: signal which SBC document the user wants prioritised
    if (Array.isArray(preferred_standards) && preferred_standards.length > 0 && preferred_standards.length < 2) {
      // Only apply when user has narrowed to a specific standard (not the default "both")
      const stdNote = preferred_standards[0];
      const stdInstruction = language === "en"
        ? `\n\n📌 STANDARDS PREFERENCE: The user has set "${stdNote}" as their preferred standard. When both SBC 201 and SBC 801 are relevant, cite ${stdNote} first and give it primary prominence in your answer. Still cross-reference the other standard when required by code.`
        : `\n\n📌 تفضيل المعيار: المستخدم حدد "${stdNote}" كمعياره المفضّل. عندما يكون كلا المعيارين SBC 201 وSBC 801 ذوي صلة، اذكر ${stdNote} أولاً وامنحه الأولوية في إجابتك. مع الإشارة إلى المعيار الآخر عند اشتراط الكود ذلك.`;
      fullSystemPrompt += stdInstruction;
    }

    const systemMessages: any[] = [{ role: "system", content: fullSystemPrompt }];
    if (retry) {
      systemMessages.push({ role: "system", content: getValidationPrompt(mode, language) });
    }

    // Model selection: use stable versions (preview models expire!)
    // Primary → gemini-2.5-flash (fast), Standard/Analysis → gemini-2.5-pro (with flash fallback)
    const preferredModel = mode === "primary" ? "gemini-2.5-flash" : "gemini-2.5-pro";
    const fallbackModel = "gemini-2.5-flash";

    const { systemInstruction, contents } = convertToGeminiFormat([
      ...systemMessages,
      ...finalMessages,
    ]);

    console.log(`[Gemini] Model: ${preferredModel} | Mode: ${mode} | Messages: ${contents.length} | API Key exists: ${!!GEMINI_API_KEY}`);

    let geminiModel = preferredModel;
    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: { temperature: 0.7 },
        }),
      }
    );

    // Auto-fallback: if preferred model fails with 429 (quota) or 404 (deprecated), try fallback
    if (!response.ok && geminiModel !== fallbackModel && (response.status === 429 || response.status === 404)) {
      console.log(`[Gemini] ${geminiModel} returned ${response.status}, falling back to ${fallbackModel}`);
      geminiModel = fallbackModel;
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction,
            contents,
            generationConfig: { temperature: 0.7 },
          }),
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Gemini] API error: ${response.status} | Model: ${geminiModel} | Error: ${errorText.slice(0, 500)}`);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Service error: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Gemini] Streaming response started | Model: ${geminiModel}`);

    // Transform Gemini SSE → OpenAI SSE format (keeps Frontend unchanged)
    // lineBuffer carries incomplete SSE lines across Deno chunk boundaries so that
    // a data: {...} line split across two chunks is fully assembled before JSON.parse.
    let lineBuffer = "";
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        lineBuffer += new TextDecoder().decode(chunk);
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";          // retain incomplete trailing line for next chunk
        for (const raw of lines) {
          const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              const openAIChunk = JSON.stringify({ choices: [{ delta: { content } }] });
              controller.enqueue(new TextEncoder().encode(`data: ${openAIChunk}\n\n`));
            }
            const finishReason = parsed.candidates?.[0]?.finishReason;
            if (finishReason === "STOP") {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            }
          } catch { /* ignore parse errors */ }
        }
      },
      flush(controller) {
        // Process any complete line remaining in the buffer when the stream ends.
        const line = lineBuffer.endsWith("\r") ? lineBuffer.slice(0, -1) : lineBuffer;
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr && jsonStr !== "[DONE]") {
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (content) {
                controller.enqueue(new TextEncoder().encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
                ));
              }
            } catch { /* ignore */ }
          }
        }
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      },
    });

    return new Response(response.body!.pipeThrough(transformStream), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-SBC-Sources": usedFiles.join(","),
      },
    });
  } catch (error) {
    console.error("Fire safety chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
