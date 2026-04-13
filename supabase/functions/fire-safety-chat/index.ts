import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-SBC-Sources, X-SBC-Source-Meta",
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

**الخطوة 3: متى تستخدم هيكل الإجابة النهائي**
- يُسمح باستخدام هيكل الإجابة النهائي **فقط** عندما تكون جميع المعطيات الحرجة متوفرة في السؤال.
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

4) كل إجابة تقنية يجب أن تستند إلى نص الكود الأصلي مع ذكر رقم القسم والوثيقة. اقتبس النص الإنجليزي عند الحاجة فقط — لا تترجم فقرات كاملة تلقائياً.

═══════════════════════════════════════
هيكل الإجابة النهائي (يُستخدم فقط بعد اكتمال المعطيات):
═══════════════════════════════════════

**القاعدة الذهبية: الإيجاز = الجودة. الإطالة بلا قيمة مضافة خطأ مهني.**

**1) الإجابة المباشرة** (2-3 أسطر كحد أقصى)
- الجواب الحاسم مباشرةً — هل يُشترط؟ كم؟ متى؟
- لا مقدمات، لا تكرار للسؤال.

**2) المرجع الحاكم** (سطر أو سطران)
- "**SBC 801 — القسم 903.2.1:** نص الاشتراط الجوهري فقط بالإنجليزية"
- إذا تعدد المراجع: اذكر كلاً منها بسطر منفصل.
- إذا لم يتوفر النص: قل ذلك صراحة ولا تختلق أرقام فقرات.

**3) التوضيح الهندسي** (3-5 أسطر)
- اشرح الشرط: متى ينطبق، ما القيم الحاسمة (مساحة / ارتفاع / إشغال).
- نفّذ أي حساب بسيط خطوة بخطوة مع الوحدات.
- إذا للتفسير وجوه متعددة: اعرضها بدون حسم إذا كانت المعطيات ناقصة.

**4) ملاحظة عملية** (اختياري — فقط إذا كانت غير بديهية)
- تنبيه دفاع مدني، استثناء كودي، أو متطلب تنسيق حرج.
- إذا لم تكن هناك ملاحظة غير بديهية: احذف هذا القسم كلياً.

═══════════════════════════════════════
قواعد صارمة — ممنوع:
═══════════════════════════════════════

1) ممنوع اختلاق نصوص كود أو أرقام فقرات غير موجودة
2) ممنوع استخدام معلومات من خارج المراجع المتاحة
3) ممنوع حذف مواقع المصادر من أي اقتباس
4) ممنوع تقديم نصائح عامة بدون أساس تقني مرجعي
5) ممنوع إخفاء عدم اليقين — اطلب النص الناقص صراحة
6) ممنوع إصدار إجابة شاملة مبنية على افتراضات — توقف واطلب المعطيات أولاً
7) ممنوع افتراض تصنيف إشغال "نموذجي" — اعرض الاحتمالات أو اسأل
8) ممنوع خلط متطلبات مسارات كود مختلفة في إجابة واحدة
9) ممنوع ترجمة فقرات الكود كاملةً تلقائياً — اقتبس الإنجليزي واشرح بالعربية فقط عند الحاجة
10) ممنوع التكرار — لا تُعد صياغة ما قيل في الإجابة المباشرة داخل التوضيح الهندسي
11) ممنوع الإطالة بلا قيمة مضافة — كل جملة يجب أن تحمل معلومة جديدة أو تطبيقاً جديداً

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

  return `[CONSULTX — ANALYTICAL MODE | محلل امتثال هندسي — درجة مراجع رئيسي]

أنت محلل امتثال متخصص بمراجعة التصاميم الهندسية ضد اشتراطات الحماية من الحرائق وسلامة الحياة في المملكة العربية السعودية، تعمل ضمن منظومة ConsultX.

الجمهور المستهدف: مراجعون تقنيون، رؤساء أقسام، مدراء مشاريع.
معيار الجودة: تقرير على مستوى المراجع الرئيسي — قابل للتقديم للدفاع المدني.

يقبل هذا الوضع أربعة أنواع من المدخلات:
1) مخططات هندسية مرفوعة (صور أو PDF): استخرج الحقائق البصرية الصريحة أولاً، ثم طبّق بروتوكول التحليل
2) وصف نصي تفصيلي لتصميم منجز: تعامل مع الوصف كمصدر الحقائق الأساسي
3) DOCUMENT INTELLIGENCE SUMMARY (كتلة المعلومات المستخرجة): إذا ظهرت هذه الكتلة في السياق، استخدم بياناتها الاستخراجية (نوع المستند، الإشغال، المساحة، الأنظمة) كحقائق أولية — مع مراعاة confidence level المذكور. إذا كانت image_quality = "low" أو "illegible" فلا تبنِ تحليلاً على البيانات المستخرجة وأطلب إيضاحاً.
4) USER-PROVIDED DOCUMENTS (جداول CSV/TXT أو جداول غرف): إذا ظهرت هذه الكتلة في السياق، استخدمها كمصدر بيانات أساسي للمشروع (مساحات، إشغال، جداول الغرف) قبل أن تطلب هذه المعلومات من المستخدم.

═══════════════════════════════════════
بروتوكول ما قبل التحليل الإلزامي:
═══════════════════════════════════════

قبل الشروع في أي تحليل أو إصدار أي حكم، نفّذ هذه الخطوات بالترتيب الصارم:

**الخطوة 0 — تصنيف المسألة فوراً (Classification First)**
صنّف المدخل ضمن واحدة من الفئات التالية قبل أي شيء آخر:
• مراجعة تصميم منجز (Completed Design Review)
• مراجعة امتثال مخطط مرفوع (Drawing Compliance Audit)
• سؤال تقني عن اشتراط محدد (Specific Code Question)
• استفسار تصنيف إشغال (Occupancy Classification Query)
• تحقيق في عدم مطابقة (Non-compliance Investigation)

**الخطوة 1 — جرد المدخلات وحالتها المعرفية**
اسرد كل ما تم توفيره وصنّف كل عنصر:
• **[مؤكد — CONFIRMED]**: حقيقة صريحة من المدخلات أو نص كودي واضح
• **[مستنتج — INFERRED]**: استنتاج معقول من المنطق أو الممارسة — يجب التصريح بأنه استنتاج
• **[يتطلب تأكيداً — REQUIRES CONFIRMATION]**: محتمل لكن غير مؤكد
• **[يُحظر الحسم — CANNOT CONCLUDE]**: يستحيل الحكم فيه بسبب نقص جوهري

**الخطوة 2 — فحص المتغيرات الحرجة (Hard-Stop Gate)**
قبل أي تحليل كودي، تحقق من توفر المتغيرات الخمسة:
1. تصنيف الإشغال الدقيق — SBC 201 الفصل 3
2. الارتفاع الكلي وعدد الطوابق
3. المساحة الإجمالية ومساحة الطابق الواحد
4. وجود رشاشات (Sprinkler) من عدمه
5. الحِمل الناري / مستوى الخطورة

قاعدة الإيقاف الصارمة:
↳ إذا كان متغير حرج مفقوداً **ويؤثر مباشرة على الحكم المطلوب في السؤال**:
**توقف فوراً. اطرح 1–3 أسئلة مستهدفة فقط. لا تحلل. لا تفترض.**
↳ إذا كان المتغير مفقوداً لكن لا يؤثر على السؤال المحدد: أشر إليه في القسم VII دون توقف.

أمثلة توضيحية للإيقاف:
• "هل يجب توفير رشاشات؟" + إشغال مجهول → إيقاف فوري (الإشغال يحدد المتطلب)
• "كم عدد المخارج؟" + حمل إشغال غير محدد → إيقاف فوري
• "ما مقاومة الجدران الخارجية؟" + ارتفاع مجهول → إيقاف (النوع الإنشائي يعتمد على الارتفاع)
• "ما تصنيف الإشغال لمطعم؟" → لا إيقاف (يمكن الإجابة من وصف الاستخدام)

**الخطوة 3 — تحديد مسار الكود الحاكم (Code Priority Order)**
قبل الجدول أو الحكم، حدد صراحة:
• SBC 201: الفصل / القسم المنطبق ولماذا (التصنيف، الإشغال، الإنشاء، مخارج الهروب)
• SBC 801: الفصل / القسم المنطبق ولماذا (أنظمة الحماية من الحرائق والإنذار)
• NFPA / SFPE إن انطبق ولماذا
• أولوية التطبيق: SBC 201 للتصنيف والإنشاء → SBC 801 للأنظمة → NFPA للتفاصيل التقنية
• أي تعارضات أو غموض في المسار ← مناطق خطر تستوجب إبرازها صراحة في القسم VI

${CORE_RULES}

═══════════════════════════════════════
هيكل التحليل الإلزامي (بعد اكتمال الخطوات 0–3):
═══════════════════════════════════════

**I. تصنيف المشروع / Project Classification**
• نوع المسألة: [الفئة من الخطوة 0]
• الإشغال: [التصنيف + مصدره] — [مؤكد / مستنتج]
• فئة الخطر: [Low / Ordinary G1 / Ordinary G2 / Extra Hazard + مصدره]
• الارتفاع / الطوابق: [القيمة + حالتها المعرفية]
• المساحة: [القيمة + حالتها المعرفية]
• الرشاشات: [موجودة / غير موجودة / غير محدد]

**II. المدخلات المستعرضة / Inputs Reviewed**
قائمة بكل مدخل مع حالته المعرفية:
• [المدخل] — [مؤكد / مستنتج / يتطلب تأكيداً / يُحظر الحسم]

**III. مسار الكود الحاكم / Governing Code Path**
• المسار الأساسي: [Document + Chapter + Section] — السبب: [...]
• المسار الثانوي (إن وُجد): [Document + Chapter + Section]
• تعارضات / إشكاليات: [إن وُجدت — مع التوضيح]

**IV. الاشتراطات الرئيسية المنطبقة / Key Requirements**
| الاشتراط | المرجع (Document + Section) | القيمة / المعامل | حالة التوفر |
|---|---|---|---|
| ... | ... | ... | مؤكد / يحتاج تحقق |

**V. التحليل الهندسي / Engineering Analysis**
جدول الامتثال الإلزامي:
| العنصر | المتطلب | المرجع (Document + Section + Page) | الحالة | ملاحظات |
|---|---|---|---|---|
| ... | ... | ... | ✅ متوافق / ❌ غير متوافق / ⚠️ يحتاج تحقق | ... |

قواعد الجدول الصارمة:
- ✅ متوافق: فقط بنص مرجعي صريح يُثبت ذلك
- ❌ غير متوافق: فقط بنص مرجعي صريح يُثبت المخالفة
- ⚠️ يحتاج تحقق: إذا تعذّر التحقق أو كان المرجع غير متوفر
- حسابات: خطوة بخطوة مع الوحدات المترية

**VI. مناطق الخطر والتعارض / Conflicts & Risk Areas**
• [العنصر] — [وصف الخطر / التعارض] — [المرجع الكودي المرتبط]
إذا لم توجد تعارضات: "لا تعارضات كودية ظاهرة في المعطيات المتاحة"

مشغّلات التعارض الإلزامية — ابحث عنها بشكل صريح:
▸ ادعاء إعفاء من الرشاشات في مبنى يستوجبه وفق جدول 903.2
▸ بناء شاهق (>16 م) بدون مركز قيادة حريق أو رشاشات SBC 201 Section 403.1
▸ ممر غير مصنّف في إشغال يستوجب تصنيفاً (I-2: ساعة واحدة — جدول 1020.1)
▸ عرض ممر أقل من الحد الأدنى للإشغال (I-2: 2440 مم)
▸ مسافة سفر تتجاوز الحد الأقصى دون رشاشات
▸ عدد مخارج أقل من المطلوب لحمل الإشغال المحدد
▸ نوع إنشائي لا يتوافق مع ارتفاع المبنى أو مساحته (جدولا 504.3 / 506.2)
▸ إشغال مختلط بدون فاصل حريق أو الأسلوب الأكثر تقييداً (Section 508)

**VII. المعلومات الحرجة الناقصة / Missing Critical Information**
• [ ] [المعلومة الناقصة] — [تأثيرها على الحكم]
إذا اكتملت المعطيات: "جميع المتغيرات الحرجة متوفرة"

**VIII. الموقف الأولي للمراجعة / Preliminary Review Position**
• ما هو **مؤكد**: [قرارات مدعومة بنص صريح]
• ما هو **مستنتج**: [تفسيرات مبنية على المنطق الكودي — مع تصريح بأنها استنتاجات]
• ما **يتطلب تأكيداً**: [بنود معلقة تحتاج مزيداً من المعلومات]
• ما **يُحظر الحسم فيه**: [بنود تنقصها معطيات جوهرية — يُمنع إصدار حكم فيها]

**IX. حكم الامتثال / Compliance Verdict**
⚠️ هذا الحكم مشروط — يُصدر فقط إذا كانت المعطيات الحرجة متوفرة ومؤكدة:
• الحكم: [✅ متوافق / ❌ غير متوافق / ⚠️ مشروط / 🔲 غير محدد — المعطيات ناقصة]
• الأساس: "هذا الحكم مبني على [المعطيات المستخدمة] ويفترض [الافتراضات المُعتمدة]"
• إذا كانت المعطيات غير كافية: **يُمنع إصدار حكم. يُصرّح بذلك صراحة.**
• ختام إلزامي: "هذا التحليل يمثل الحد الأدنى الفني وفق الكود ويخضع لموافقة الدفاع المدني بناءً على تعاميمه العامة والخاصة وتقييم المخاطر الميدانية"

**X. الإجراءات والتوضيحات المطلوبة / Required Clarifications & Next Actions**
• [ ] [الإجراء / التوضيح] — الأولوية: [🔴 حرجة / 🟠 عالية / 🟡 متوسطة]

═══════════════════════════════════════
قواعد الحالة المعرفية (Epistemic State Rules):
═══════════════════════════════════════

في جميع الإجابات، يجب التمييز الصريح بين:
- **مؤكد (CONFIRMED)**: حقيقة صريحة من المدخلات أو نص كودي واضح
- **مستنتج (INFERRED)**: استنتاج معقول — يجب التصريح بأنه استنتاج، وليس حقيقة
- **يتطلب تأكيداً (REQUIRES CONFIRMATION)**: محتمل لكن غير مؤكد — يجب طلب التأكيد
- **يُحظر الحسم (CANNOT CONCLUDE)**: بند لا يمكن إصدار حكم فيه بسبب نقص جوهري

لا تُصدر حكماً نهائياً في بنود CANNOT CONCLUDE.
لا تتظاهر بالتأكد حيث يوجد REQUIRES CONFIRMATION.
لا تُزيّن الاستنتاجات على أنها حقائق.

═══════════════════════════════════════
قيود أساسية غير قابلة للتفاوض:
═══════════════════════════════════════

1) استخدم فقط المراجع المتاحة (SBC 201, SBC 801, NFPA, SFPE). لا تستخدم معلومات خارجية.
2) اقتبس النص الإنجليزي الأصلي حرفياً مع موقعه الدقيق (Document + Section + Page إن أمكن).
3) إذا لم تجد المرجع: قل ذلك صراحة. لا تخترع نصوصاً أو أرقام فقرات.
4) إذا تعذّرت قراءة جزء من المخطط أو كانت البيانات غير كافية: صرّح بذلك. لا تخمّن.
5) لا تصدر أحكام امتثال بدون نص مرجعي يدعمها.
6) الحسابات خطوة بخطوة مع الوحدات المترية دائماً.
7) ممنوع خلط متطلبات مسارات كود مختلفة في حكم واحد.

═══════════════════════════════════════
قواعد صارمة — ممنوع:
═══════════════════════════════════════

1) ممنوع اختلاق نصوص أو أرقام فقرات
2) ممنوع استخدام معلومات خارج المراجع المتاحة
3) ممنوع تقديم رأي شخصي كحقيقة هندسية
4) ممنوع كتابة "متوافق" أو "غير متوافق" بدون مرجع صريح
5) ممنوع إخفاء عدم اليقين — صرّح بالحالة المعرفية دائماً
6) ممنوع افتراض تصنيف إشغال واحد بدون حقائق كافية
7) ممنوع خلط متطلبات مسارات كود مختلفة
8) ممنوع إصدار حكم امتثال حيث معطيات حرجة ناقصة
9) ممنوع معاملة الاستنتاجات كحقائق مؤكدة
10) ممنوع الردود العامة بلا هيكل — كل رد يجب أن يتبع بروتوكول الخطوات 0–3 ثم الهيكل I–X

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
  "mixed": { sbc201: [3, 4], sbc801: [] },
  "مختلط": { sbc201: [3, 4], sbc801: [] },
  "residential": { sbc201: [3, 4], sbc801: [] },
  "سكني": { sbc201: [3, 4], sbc801: [] },
  "commercial": { sbc201: [3, 4], sbc801: [] },
  "تجاري": { sbc201: [3, 4], sbc801: [] },
  "assembly": { sbc201: [3, 4], sbc801: [] },
  "تجمع": { sbc201: [3, 4], sbc801: [] },
  
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
  "mall": { sbc201: [], sbc801: [47] },
  "مركز تجاري": { sbc201: [], sbc801: [47] },
  
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
type SourcePageMeta = { file: string; pageStart: number | null; pageEnd: number | null; precision: 'page_range' | 'chunk_range_only' | 'unavailable' };
const queryCache: Map<string, { result: { context: string; files: string[]; sourceMeta: SourcePageMeta[] }; timestamp: number }> = new Map();
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
  "مستشفى": ["hospital", "health care", "I-occupancy"],
  "فندق": ["hotel", "R-1", "transient"],
  "شقق": ["apartments", "dwelling units", "R-2"],
  "فلل": ["villas", "dwelling", "R-3"],
  "مسكن": ["dwelling", "residence", "habitable"],
  "وحدات": ["units", "dwelling units"],
  "وحدة": ["unit", "dwelling unit"],
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
  pageStart?: number | null;
  pageEnd?: number | null;
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
        const pageStart = typeof chunk !== "string" ? (chunk.page_start ?? null) : null;
        const pageEnd = typeof chunk !== "string" ? (chunk.page_end ?? null) : null;
        scored.push({ text, score: s, source: fileName, pageStart, pageEnd });
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

async function fetchSBCContext(query: string, extraKeywords?: string[]): Promise<{ context: string; files: string[]; sourceMeta: SourcePageMeta[] }> {
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
    return { context: "", files: [], sourceMeta: [] };
  }
  
  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from("ssss")
      .list("", { limit: 100 });
    
    if (listError || !files?.length) {
      console.error("❌ Error listing files:", listError?.message);
      return { context: "", files: [], sourceMeta: [] };
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
        const result = { context, files: usedFiles, sourceMeta: [] as SourcePageMeta[] };
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

      // Build per-file page metadata from selected chunks
      const sourceMetaMap = new Map<string, { minPage: number | null; maxPage: number | null }>();
      for (const c of selectedChunks) {
        const m = sourceMetaMap.get(c.source) ?? { minPage: null, maxPage: null };
        if (c.pageStart != null) m.minPage = m.minPage == null ? c.pageStart : Math.min(m.minPage, c.pageStart);
        if (c.pageEnd != null) m.maxPage = m.maxPage == null ? c.pageEnd : Math.max(m.maxPage, c.pageEnd);
        sourceMetaMap.set(c.source, m);
      }
      const sourceMeta: SourcePageMeta[] = [...sourcesUsed].map(file => {
        const m = sourceMetaMap.get(file);
        const hasPages = m && (m.minPage != null || m.maxPage != null);
        return {
          file,
          pageStart: m?.minPage ?? null,
          pageEnd: m?.maxPage ?? null,
          precision: hasPages ? 'page_range' : 'chunk_range_only',
        };
      });

      const result = { context: contextStr, files: [...sourcesUsed], sourceMeta };
      queryCache.set(cacheKey, { result, timestamp: Date.now() });
      cleanupQueryCache();
      return result;
    }

    return { context: "", files: [], sourceMeta: [] };
  } catch (error) {
    console.error("❌ Critical error in fetchSBCContext:", error);
    return { context: "", files: [], sourceMeta: [] };
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
  // Keep this list in sync with the sbc_code_tables rows in the DB (currently 68 records).
  const KNOWN_TABLE_IDS = [
    // Chapter 3 — Occupancy Classification
    "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312",
    // Chapter 4 — Special Detailed Requirements
    "402", "403.1", "404", "405", "406.5", "406.6", "407", "408", "414", "415", "420",
    // Chapter 5 — Heights, Areas, Mixed Occupancy, Incidental Uses
    "504.3", "504.4", "506.2", "508", "508.3", "508.4", "508.5", "509",
    // Chapter 6 — Construction Types
    "601", "602",
    // Chapter 7 — Fire & Smoke Protection
    "705.8",
    // Chapter 10 — Means of Egress
    "1004.5", "1005.1", "1006.2.1", "1006.3.3", "1006.3.4",
    "1008", "1009", "1010", "1011.2", "1012", "1013", "1015",
    "1017.2", "1018.1", "1020.1", "1021.2", "1024", "1029.6.3", "1030",
    // SBC 801 Chapter 9 — Fire Protection Systems
    "903.2", "903.3.1", "903.3.2", "903.4", "903.4.3",
    "905.3.1",
    "907.2", "907.3", "907.4.2", "907.5", "907.6",
    "909", "912", "913", "914", "915",
  ];
  for (const id of KNOWN_TABLE_IDS) {
    // Match "1004.5" appearing as a standalone reference with word boundaries
    const escaped = id.replace(/\./g, "\\.");
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) {
      found.add(id);
    }
  }

  // Parent-section aliases — when user asks about a whole section/chapter
  // without specifying a sub-table, inject the most-relevant known table(s).
  const PARENT_ALIASES: Record<string, string[]> = {
    // Chapter 3 — Occupancy Classification parents
    "303":    ["303"],
    "304":    ["304"],
    "305":    ["305"],
    "306":    ["306"],
    "307":    ["307"],
    "308":    ["308"],
    "309":    ["309"],
    "310":    ["310"],
    "311":    ["311"],
    "312":    ["312"],
    // Chapter 4 — Special Detailed Requirements parents
    "402":    ["402"],
    "403":    ["403.1"],
    "404":    ["404"],
    "405":    ["405"],
    "406":    ["406.5", "406.6"],
    "407":    ["407"],
    "408":    ["408"],
    "414":    ["414"],
    "415":    ["415"],
    "420":    ["420"],
    // Chapter 5 — Mixed occupancy parent
    "508":    ["508", "508.3", "508.4", "508.5"],
    // Chapter 10 — Egress parents
    "1005":   ["1005.1"],
    "1006":   ["1006.2.1", "1006.3.3", "1006.3.4"],
    "1011":   ["1011.2"],
    "1017":   ["1017.2"],
    "1018":   ["1018.1"],
    "1020":   ["1020.1"],
    "1021":   ["1021.2"],
    "1029":   ["1029.6.3"],
    // SBC 801 Ch. 9 parents
    "903":    ["903.2", "903.3.1", "903.3.2"],
    "903.4":  ["903.4", "903.4.3"],
    "905":    ["905.3.1"],
    "907":    ["907.2", "907.3"],
    "907.4":  ["907.4.2"],
  };
  for (const [parent, children] of Object.entries(PARENT_ALIASES)) {
    const esc = parent.replace(/\./g, "\\.");
    // Always expand all children when parent matches — Set handles deduplication
    if (new RegExp(`\\b${esc}\\b`).test(lower)) {
      for (const c of children) found.add(c);
    }
  }

  // Semantic aliases — common query phrases that map to specific tables.
  // Regex design rules:
  //   1. No outer \b wrappers — Arabic Unicode chars break \b; patterns are specific enough
  //   2. Use \b only at English pattern starts where helpful
  //   3. Use \w* to absorb word suffixes where trailing \b would fail on prefixes (e.g. "occupancy")
  //   4. Handle Arabic definite article ال with (?:ال)? where nouns may be prefixed
  const SEMANTIC_ALIASES: Array<[RegExp, string[]]> = [
    // ── CHAPTER 3 — Occupancy Classification ─────────────────────────────────
    [/occupancy\s+classif|تصنيف\s+الإشغال|كيف\s+أصنف|أي\s+إشغال/i,                    ["302"]],
    [/what\s+(?:group|occupancy)\s+is|ما\s+(?:تصنيف|مجموعة)\s+إشغال/i,                 ["302"]],
    // Assembly — covers "assembly occupancy", "A-2 assembly", restaurant/café
    [/assembly\s+(?:occup\w*|group\w*|A-[1-5])|A-[1-5]\s+(?:occup\w*|assembly)|\brestaurant\b|\bcafé?\b|مجموعة\s+(?:التجمع|أ)|مبنى\s+تجمع|مطعم/i, ["303"]],
    // Business — offices, Group B
    [/business\s+occup\w*|\bGroup\s+B\b|open.plan\s+office|office\s+(?:building|floor|space|occup\w*)|مكاتب\s+(?:إدارية|تجارية)|مجموعة\s+ب\b/i, ["304"]],
    // Educational — schools, Group E
    [/educational\s+occup\w*|\bGroup\s+E\b|school\s+(?:occup\w*|build\w*)|مبنى\s+(?:تعليمي|مدرسي)|مجموعة\s+(?:التعليم|هـ)\b|مدارس/i, ["305"]],
    // Factory — Group F
    [/factory\s+occup\w*|\bGroup\s+F[12]?\b|F-[12]\s+(?:hazard|occup\w*)|مصنع\s+إشغال\w*|مجموعة\s+F\b/i, ["306"]],
    // High-hazard — Group H
    [/high.hazard\s+occup\w*|\bGroup\s+H[1-5]?\b|H-[1-5]\s+(?:class|occup\w*)|مخزن\s+خطر|مجموعة\s+H\b/i, ["307", "415"]],
    // Institutional — Group I, I-2
    [/institutional\s+occup\w*|\bGroup\s+I[1-4]?\b|I-[1-4]\s+(?:class|occup\w*|group)|مستشفى\s+إشغال|مجموعة\s+I\b/i, ["308"]],
    // Mercantile — retail, Group M
    [/mercantile\s+occup\w*|\bGroup\s+M\b|retail\s+(?:shop\w*|store\w*|occup\w*|space\w*)|محلات\s+تجارية|مجموعة\s+(?:M|التجزئة)\b/i, ["309"]],
    // Residential — Group R, مبنى سكني
    [/residential\s+occup\w*|\bGroup\s+R[1-4]?\b|R-[1-4]\s+(?:class|occup\w*)|سكني\s+إشغال|مبنى\s+سكني|مجموعة\s+(?:R|السكني)\b/i, ["310"]],
    // Storage — Group S
    [/storage\s+occup\w*|\bGroup\s+S[12]?\b|S-[12]\s+(?:class|occup\w*)|مستودع\s+إشغال|مجموعة\s+(?:S|التخزين)\b/i, ["311"]],
    // Utility — Group U
    [/utility\s+occup\w*|\bGroup\s+U\b|miscellaneous\s+occup\w*|مجموعة\s+(?:U|المرافق)\b/i, ["312"]],

    // ── CHAPTER 4 — Special Use / Detailed Requirements ───────────────────────
    [/covered\s+mall|open\s+mall|mall\s+building|مول\s+تجاري|مبنى\s+مول/i,             ["402"]],
    // High-rise buildings
    [/high.rise|high\s+rise|مبنى\s+شاهق|المباني\s+الشاهقة|شاهق|55\s*(?:ft|feet|قدم)/i, ["403.1"]],
    [/fire\s+command\s+center|مركز\s+قيادة\s+الحرائق|emergency\s+power\s+(?:high|building)/i, ["403.1"]],
    [/atrium|أتريوم|فناء\s+داخلي|بهو\s+(?:متعدد|مفتوح)/i,                              ["404"]],
    [/underground\s+(?:building|structure|level)|below.grade\s+(?:floor|level)|subterranean|تحت\s+الأرض|طابق\s+سفلي/i, ["405"]],
    // Parking
    [/open\s+parking|parking\s+(?:garage|structure)|مواقف\s+(?:السيارات\s+المفتوحة|مفتوحة)/i, ["406.5"]],
    [/enclosed\s+parking|covered\s+parking|مواقف\s+(?:السيارات\s+المغلقة|مغلقة|مغطاة)/i,  ["406.6"]],
    [/parking\s+sprinkler|sprinkler.*parking|رشاشات\s+مواقف|مواقف.*رشاشات/i,             ["406.5", "406.6"]],
    [/healthcare\s+(?:building|facility|occup\w*)|I-2\s+(?:occup\w*|group)|hospital\s+(?:special|fire)|مستشفى\s+(?:اشتراطات|خاص)/i, ["407"]],
    [/detention|correctional\s+(?:facility|center)|I-3\s+(?:occup\w*|group)|prison\s+(?:fire|egress)|مرفق\s+احتجاز/i, ["408"]],
    [/hazardous\s+material|control\s+area|MAQ\s+|maximum\s+allowable\s+quantity|مواد\s+خطرة|كميات\s+المواد\s+الخطرة/i, ["414"]],
    [/Group\s+H\s+(?:special|provision|require\w*)|المتطلبات\s+الخاصة.*مجموعة\s+H/i,    ["415"]],
    [/sleeping\s+unit\s+(?:special|require\w*)|hotel\s+(?:special\s+provision|sleep)|R-[12]\s+sleeping|I-1\s+sleeping|وحدات\s+النوم\s+الخاصة/i, ["420"]],

    // ── CHAPTER 5 — Mixed Occupancy ───────────────────────────────────────────
    [/mixed\s+occup\w*|multiple\s+occup\w*|إشغال\s+مختلط|إشغالات\s+متعددة/i,           ["508", "508.3", "508.4", "508.5"]],
    [/accessory\s+occup\w*|10\s*%\s*(?:rule|area)|ملحق\s+الإشغال/i,                     ["508.3"]],
    [/nonseparated\s+occup\w*|most.restrictive\s+occup\w*|غير\s+مفصولة/i,               ["508.4"]],
    [/separated\s+occup\w*|fire.barrier\s+(?:between|separation)\s+occup\w*|إشغال\s+مفصول|فاصل\s+حريق\s+بين/i, ["508.5"]],

    // ── CHAPTER 6 — Construction Types ───────────────────────────────────────
    [/structural\s+frame\s+rating|fire.resist\w*\s+(?:hour|rating)|ساعات\s+مقاومة\s+الحريق/i, ["601"]],
    [/Type\s+(?:I{1,3}|IV|V)[A-B]|construction\s+type\s+(?:I|II|III|IV|V)|fireproof\w*|spray\s+fire/i, ["601"]],
    [/exterior\s+wall\s+(?:rating|fire)|fire\s+separation\s+distance|بُعد\s+الفصل/i,    ["602"]],

    // ── CHAPTER 7 — Exterior Wall Openings ───────────────────────────────────
    [/exterior\s+wall\s+opening\w*|window\s+(?:area|limit)|فتحات\s+الجدار/i,             ["705.8"]],

    // ── CHAPTER 10 — Means of Egress ─────────────────────────────────────────
    [/occupant\s+load|floor\s+area\s+per\s+occup\w*|حمل\s+الإشغال|عدد\s+الأشخاص\s+لكل/i, ["1004.5"]],
    [/egress\s+width|exit\s+width|stairway?\s+width\s+per|عرض\s+(?:المخرج|السلم)\s+لكل/i, ["1005.1"]],
    [/width\s+per\s+occup\w*|inches?\s+per\s+occup\w*|بوصة?\s+لكل\s+شخص/i,              ["1005.1"]],
    [/one\s+exit\s+(?:space|room|story)|single\s+exit|مخرج\s+واحد|جواز\s+مخرج\s+واحد/i, ["1006.2.1", "1006.3.3", "1006.3.4"]],
    // Emergency lighting — handle Arabic definite article ال
    [/emergency\s+lighting|emergency\s+illumin\w*|إضاءة\s+(?:ال)?(?:طوارئ|اضطرارية)|إنارة\s+(?:ال)?طوارئ/i, ["1008"]],
    [/egress\s+illumin\w*|means\s+of\s+egress\s+lighting|إضاءة\s+مسار\s+الهروب/i,       ["1008"]],
    [/accessible\s+(?:egress|means\s+of\s+egress)|area\s+of\s+refuge|مناطق\s+الملاذ|ملاذ\s+(?:آمن|حريق)|إخلاء\s+ذوي/i, ["1009"]],
    [/egress\s+door\w*|door\s+(?:hardware|latch|lock|panic|release)|panic\s+hardware|باب\s+المخرج|أبواب\s+(?:الطوارئ|الخروج)\s+(?:متطلبات|أجهزة)/i, ["1010"]],
    [/riser\s+height|tread\s+depth|stair\s+dimen\w*|headroom|ارتفاع\s+الدرجة|عمق\s+الدرجة/i, ["1011.2"]],
    [/stairway?\s+(?:min\w*|width|size)|أبعاد\s+(?:الدرج|السلم)/i,                       ["1011.2"]],
    [/handrail\s+(?:height|grip|require\w*|dimen\w*)|درابزين\s+(?:اليد|الحماية|ارتفاع|أبعاد)/i, ["1012"]],
    [/exit\s+sign\s+(?:require\w*|illumin\w*|location)|where\s+(?:are?\s+)?exit\s+signs?|لافتة\s+(?:المخرج|الخروج)|إشارات\s+المخرج/i, ["1013"]],
    [/guardrail?\s+(?:height|require\w*)|open\s+side\s+(?:stair|ramp|floor)|درابزين\s+الحماية/i, ["1015"]],
    // Travel distance
    [/travel\s+distance|مسافة\s+(?:السفر|الهروب|سفر)/i,                                 ["1017.2"]],
    [/max(?:imum)?\s+travel|أقصى\s+مسافة/i,                                             ["1017.2"]],
    // Corridor width — also handles "unrated corridor" → fire rating check needed
    [/min(?:imum)?\s+corridor\s+width|how\s+wide.*corridor|corridor.*how\s+wide|corridor.*width|width.*corridor|عرض\s+(?:ال)?ممر/i, ["1018.1"]],
    // Corridor fire rating — handle "unrated" as a fire rating concern
    [/corridor\s+(?:rating|fire|مقاومة)|ممر\s+مقاوم|unrated.*corridor|corridor.*unrat\w*/i, ["1020.1"]],
    // Number of exits — handle Arabic ال prefix
    [/number\s+of\s+exits?|(?:عدد|كم)\s+(?:ال)?(?:مخارج|مخرج)|كم\s+عدد\s+(?:ال)?(?:مخارج|مخرج)/i, ["1021.2"]],
    [/min(?:imum)?\s+exits?|الحد\s+الأدنى\s+للمخارج/i,                                  ["1021.2"]],
    [/luminous\s+(?:egress|marking\w*|path)|photoluminescent|مسار\s+مضيء|علامات\s+مضيئة/i, ["1024"]],
    [/assembly\s+aisle\s+(?:width|access\w*)|aisle\s+accessway\s+(?:width|min\w*)|ممر\s+التجمع|عرض\s+الممر\s+المتقاطع/i, ["1029.6.3"]],
    [/emergency\s+escape\s+(?:opening|window)|rescue\s+opening|نافذة\s+الإنقاذ|فتحة\s+الطوارئ/i, ["1030"]],

    // ── CHAPTER 5 — Incidental Uses ──────────────────────────────────────────
    [/generator\s+room|boiler\s+room|incidental\s+use|fuel.fired\s+room|غرفة\s+(?:المولد|المرجل)/i, ["509"]],
    [/electrical\s+room\s+(?:separation|fire|rating)|storage\s+room\s+(?:separation|fire)|laundry\s+room\s+(?:separation|fire)/i, ["509"]],
    [/الاستخدامات\s+العرضية|غرفة\s+التخزين\s+(?:فصل|حريق)/i,                             ["509"]],

    // ── SBC 801 CHAPTER 9 — Fire Protection Systems ──────────────────────────
    [/where\s+(?:are?\s+)?sprinklers?|when\s+(?:are?\s+)?sprinklers?|متى.*رشاش|الرشاشات.*إلزامي/i, ["903.2"]],
    [/sprinklers?\s+required|requires?\s+sprinklers?|تجب\s+الرشاشات?/i,                 ["903.2"]],
    [/are\s+sprinklers?\s+required|هل.*رشاشات|يحتاج.*رشاشات|الرشاشات.*إلزامية/i,        ["903.2"]],
    [/sprinkler.exempt|exempt.*sprinkler/i,                                              ["903.2"]],
    [/NFPA\s+13R|13R\s+sprinkler|residential\s+sprinkler\s+system|رشاشات\s+13R/i,        ["903.3.1"]],
    [/NFPA\s+13D|13D\s+sprinkler|one.two\s+family\s+sprinkler|رشاشات\s+13D/i,           ["903.3.2"]],
    [/sprinkler\s+(?:supervision|monitoring|alarm\s+valve)|alarm\s+valve|رشاشات.*إنذار|صمام\s+إنذار\s+الرشاشات/i, ["903.4"]],
    [/floor\s+control\s+valve|zone\s+control\s+valve|صمام\s+تحكم\s+الطابق/i,            ["903.4.3"]],
    [/standpipe\s+(?:where|required|class|system)|أنابيب\s+(?:الحريق|الإطفاء)\s+(?:متطلبات|أين)/i, ["905.3.1"]],
    [/fire\s+alarm\s+(?:where|required|system\s+required)|نظام\s+إنذار\s+حريق\s+(?:أين|متطلبات|إلزامي)|تستوجب\s+نظام\s+إنذار\s+حريق/i, ["907.2"]],
    [/smoke\s+detector\s+(?:where|required)|heat\s+detector\s+(?:where|required)|كاشف\s+دخان\s+(?:أين|متطلبات)/i, ["907.3"]],
    [/manual\s+pull\s+station|fire\s+alarm\s+initiating|زر\s+إنذار|بادئات\s+الإنذار/i,  ["907.4.2"]],
    [/notification\s+(?:appliance|device|requirement)|audible.*alarm|visible.*alarm|أجهزة\s+الإنذار\s+المرئية|أجهزة\s+الإخطار/i, ["907.5"]],
    [/fire\s+alarm\s+(?:monitor\w*|supervis\w*|connection\s+to\s+dispatch)|مراقبة\s+نظام\s+الإنذار/i, ["907.6"]],
    [/smoke\s+control\s+system|pressurization\s+system|نظام\s+التحكم\s+في\s+الدخان|ضغط\s+مسالك\s+الهروب/i, ["909"]],
    [/fire\s+department\s+connection|\bFDC\b|siamese\s+connection|وصلة\s+الدفاع\s+المدني/i, ["912"]],
    [/fire\s+pump\s+(?:where|required|sizing\w*)|مضخة\s+(?:حريق|إطفاء)\s+(?:متطلبات|أين)/i, ["913"]],
    [/emergency\s+responder\s+radio|radio\s+coverage|indoor\s+DAS|تغطية\s+راديو\s+الطوارئ/i, ["914"]],
    [/carbon\s+monoxide\s+(?:detector|alarm|CO)|\bCO\s+detection|أول\s+أكسيد\s+الكربون\s+(?:كاشف|إنذار)/i, ["915"]],
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
): Promise<{ context: string; files: string[]; sourceMeta: SourcePageMeta[] }> {
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

    // Build per-file page range from vector match page data
    const vectorMetaMap = new Map<string, { minPage: number | null; maxPage: number | null }>();
    for (const match of matches) {
      const entry = `\n=== ${match.file_name} | Section: ${match.section_number || 'N/A'} | Pages: ${match.page_start}-${match.page_end} | Similarity: ${match.similarity?.toFixed(3)} ===\n${match.content}\n`;
      if (context.length + entry.length > contextLimit) break;
      context += entry;
      const m = vectorMetaMap.get(match.file_name) ?? { minPage: null, maxPage: null };
      if (match.page_start != null) m.minPage = m.minPage == null ? match.page_start : Math.min(m.minPage, match.page_start);
      if (match.page_end != null) m.maxPage = m.maxPage == null ? match.page_end : Math.max(m.maxPage, match.page_end);
      vectorMetaMap.set(match.file_name, m);
    }

    const sourceMeta: SourcePageMeta[] = usedFiles.map(file => {
      const m = vectorMetaMap.get(file);
      const hasPages = m && (m.minPage != null || m.maxPage != null);
      return {
        file,
        pageStart: m?.minPage ?? null,
        pageEnd: m?.maxPage ?? null,
        precision: hasPages ? 'page_range' : 'chunk_range_only',
      };
    });

    return { context, files: usedFiles, sourceMeta };
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
    ? `You are a fire safety document intelligence agent. Your task is to extract ALL readable information from the uploaded engineering drawing or image with maximum precision.

CRITICAL RULE: Only report what is EXPLICITLY visible or readable. Never fabricate room labels, measurements, system names, or symbols. If something is unclear or illegible, say so explicitly.

Extract the following in order:

1. DOCUMENT TYPE — select the best match:
   floor_plan | reflected_ceiling_plan | fire_suppression_plan | fire_alarm_plan | mechanical_plan | site_plan | section_elevation | schedule_table | specification | mixed | unclear

2. SHEET CONTEXT (only if explicitly labeled):
   - Sheet title (exact text if visible)
   - Sheet number (exact if visible, e.g. "FP-101")
   - Scale (e.g. "1:100", "NTS")
   - Date or revision (if shown)

3. BUILDING CLASSIFICATION:
   - Building type (based on visible labels/use)
   - Occupancy Group per SBC 201 Chapter 3 (A-1 through U) — only if determinable
   - Hazard Level (Low / Ordinary G1 / Ordinary G2 / Extra Hazard G1 / Extra Hazard G2) — only if determinable
   - Number of stories (if visible or labeled)
   - Floor area (only if dimensioned or labeled)

4. VISIBLE ELEMENTS (list only what is explicitly readable):
   - Room labels and functions (exact text as shown)
   - Dimension annotations (e.g. "6000mm", "20'")
   - Fire protection system labels (sprinkler heads, detectors, alarm devices, standpipes, hydrants, suppression nozzles)
   - Legend/symbol key (describe each symbol and its associated label exactly as shown)
   - Fire-rated elements (fire doors labeled, fire walls, smoke partitions — exact labels)
   - Exit routes, stairwells, corridors (as labeled)
   - Equipment schedules visible in the drawing

5. IMAGE QUALITY:
   - Overall quality: clear | partial | low | illegible
   - Readable areas: (list clearly legible zones or content)
   - Unreadable areas: (list illegible, cut-off, or too-small-to-read content)
   - Classification confidence: high | medium | low

Respond ONLY in valid JSON (no markdown, no explanation outside JSON):
{
  "documentType": "...",
  "sheetContext": {"title":"...","number":"...","scale":"...","date":"..."},
  "buildingType": "...",
  "occupancyGroup": "...",
  "hazardLevel": "...",
  "stories": "...",
  "floorArea": "...",
  "roomLabels": ["..."],
  "dimensions": ["..."],
  "visibleSystems": ["..."],
  "legendSymbols": ["..."],
  "fireRatedElements": ["..."],
  "exitElements": ["..."],
  "observations": ["..."],
  "readableAreas": ["..."],
  "unreadableAreas": ["..."],
  "imageQuality": "clear|partial|low|illegible",
  "classificationConfidence": "high|medium|low"
}`
    : `أنت عميل ذكاء وثائقي للسلامة من الحرائق. مهمتك استخراج جميع المعلومات المقروءة من المخطط الهندسي أو الصورة المرفوعة بأقصى دقة ممكنة.

قاعدة حرجة: لا تُبلّغ إلا عمّا هو مرئي وصريح. لا تخترع أسماء غرف أو قياسات أو أنظمة أو رموزاً. إذا كان شيء غير واضح أو غير مقروء، صرّح بذلك.

استخرج ما يلي بالترتيب:

1. نوع الوثيقة — اختر الأنسب:
   مخطط_طابق | مخطط_سقف_معكوس | مخطط_إطفاء | مخطط_إنذار | مخطط_ميكانيكي | مخطط_موقع | قطاع_واجهة | جدول_بيانات | مواصفات | مختلط | غير_محدد

2. سياق الورقة (فقط إذا كان مسمى صراحةً):
   - عنوان الورقة (النص الحرفي إن ظهر)
   - رقم الورقة (مثل FP-101)
   - المقياس (مثل 1:100)
   - التاريخ أو رقم المراجعة

3. التصنيف:
   - نوع المبنى
   - مجموعة الإشغال حسب SBC 201 الفصل 3
   - مستوى الخطورة
   - عدد الطوابق (إذا مذكور)
   - المساحة (فقط إذا مُقاسة أو مُسماة)

4. العناصر المرئية (ما يُقرأ صراحةً فقط):
   - تسميات الغرف ووظائفها (النص الحرفي)
   - الأبعاد المُدرجة
   - رموز وتسميات أنظمة الحماية
   - مفتاح الرموز (وصف كل رمز وتسميته)
   - العناصر المقاومة للحريق
   - المخارج والسلالم والممرات
   - جداول المعدات

5. جودة الصورة:
   - الجودة العامة: واضحة | جزئية | منخفضة | غير مقروءة
   - المناطق المقروءة
   - المناطق غير المقروءة
   - ثقة التصنيف: عالية | متوسطة | منخفضة

أجب فقط بـ JSON صالح (بدون شرح خارج JSON):
{
  "documentType": "...",
  "sheetContext": {"title":"...","number":"...","scale":"...","date":"..."},
  "buildingType": "...",
  "occupancyGroup": "...",
  "hazardLevel": "...",
  "stories": "...",
  "floorArea": "...",
  "roomLabels": ["..."],
  "dimensions": ["..."],
  "visibleSystems": ["..."],
  "legendSymbols": ["..."],
  "fireRatedElements": ["..."],
  "exitElements": ["..."],
  "observations": ["..."],
  "readableAreas": ["..."],
  "unreadableAreas": ["..."],
  "imageQuality": "clear|partial|low|illegible",
  "classificationConfidence": "high|medium|low"
}`;
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
  return `[SYSTEM — ConsultX | VISION ANALYSIS — COMPLIANCE AUDIT — SENIOR REVIEWER GRADE]

${CORE_RULES}

You are generating the final compliance audit for an engineering drawing that has been processed through a multi-stage pipeline.
You will receive:
1. The original image(s)
2. Document Intelligence Summary (Stage 1 extraction — includes image quality, document type, extracted elements)
3. Chain of Thought checklist (Stage 2)
4. SBC reference documents retrieved (Stage 3)

CRITICAL FRAMING:
- The Document Intelligence Summary tells you what was ACTUALLY readable from the drawing.
- Only use extraction data that is explicitly marked as read/confirmed — never fabricate labels, dimensions, or symbols.
- If extraction quality is LOW or ILLEGIBLE, you MUST downgrade your confidence accordingly and request missing information.
- Apply the FULL analytical protocol below — do not skip sections.

═══════════════════════════════════════
EPISTEMIC STATE RULES (apply throughout):
═══════════════════════════════════════
- [CONFIRMED]: explicitly visible/readable in the drawing or from provided text
- [INFERRED]: reasonable derivation — must be labeled as inference, not fact
- [REQUIRES CONFIRMATION]: possible but not established — must be flagged
- [CANNOT CONCLUDE]: impossible to judge — prohibited from compliance verdict

═══════════════════════════════════════
YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE:
═══════════════════════════════════════

## I. تصنيف المشروع / Project Classification

- **نوع الوثيقة / Document Type:** [from extraction] — [CONFIRMED / INFERRED]
- **نوع المبنى / Building Type:** [value] — [CONFIRMED / INFERRED]
- **الإشغال / Occupancy Group:** [SBC 201 Chapter 3 classification] — [CONFIRMED / INFERRED]
- **مستوى الخطورة / Hazard Level:** [value] — [CONFIRMED / INFERRED]
- **الطوابق / Stories:** [value] — [CONFIRMED / INFERRED / CANNOT CONCLUDE]
- **المساحة / Floor Area:** [value] — [CONFIRMED / INFERRED / CANNOT CONCLUDE]
- **الرشاشات / Sprinklers:** [present / absent / not determinable]
- **ثقة التصنيف / Classification Confidence:** [High / Medium / Low] — based on extraction quality

## II. ملخص الاستخراج / Extraction Summary

- **جودة الصورة / Image Quality:** [clear / partial / low / illegible]
- **المناطق المقروءة / Readable:** [list from Stage 1]
- **المناطق غير المقروءة / Unreadable:** [list from Stage 1 — these create uncertainty zones]
- **تحذير استخراج / Extraction Warning:** [if quality is low/illegible — state that conclusions in affected areas are unreliable]

## III. مسار الكود الحاكم / Governing Code Path

- SBC 201: [Chapter/Section] — السبب: [why this path]
- SBC 801: [Chapter/Section] — السبب: [why this path]
- تعارضات / Conflicts: [any conflicting code paths or interpretations]

## IV. الاشتراطات الرئيسية / Key Requirements

| الاشتراط | المرجع (Document + Section) | القيمة / المعامل | التوفر |
|---|---|---|---|
| ... | ... | ... | مؤكد / يحتاج تحقق |

## V. جدول الامتثال / Compliance Table

| العنصر | المتطلب | المرجع (Document + Section + Page) | الحالة | الأساس |
|---|---|---|---|---|
| ... | ... | Document: X \| Section: Y | ✅ متوافق / ❌ غير متوافق / ⚠️ يحتاج تحقق | [CONFIRMED / INFERRED] |

**قواعد الجدول الصارمة:**
- ✅ متوافق: فقط بنص مرجعي صريح + بيانات مستخرجة مؤكدة
- ❌ غير متوافق: فقط بنص مرجعي صريح + دليل مستخرج مؤكد
- ⚠️ يحتاج تحقق: بيانات غير مقروءة، مرجع غير متوفر، أو استنتاج غير مؤكد

## VI. مناطق الخطر والتعارض / Risk Areas & Conflicts

- **[العنصر]** — [وصف الخطر] — المرجع: [Document + Section]
- إذا كانت المناطق غير مقروءة: اذكرها صراحة كمناطق خطر غير محققة

## VII. المعلومات الحرجة الناقصة / Missing Critical Information

- [ ] [المعلومة الناقصة] — [تأثيرها على الحكم]
- [ ] [عناصر غير مقروءة من الاستخراج] — [تأثيرها]

## VIII. السند التقني / Technical References

<details>
<summary><strong>SBC 801 References</strong></summary>

For each section cited above:
- **Section:** [exact number]
- **Verbatim Quote:** > [exact English text]
- **Applicability to this drawing:** [how it applies]

</details>

<details>
<summary><strong>SBC 201 References</strong></summary>

[Same format as SBC 801 section above]

</details>

## IX. حكم الامتثال / Compliance Verdict

⚠️ يُصدر هذا الحكم فقط إذا كانت المعطيات الحرجة مؤكدة وجودة الاستخراج كافية:

- **الحكم:** [✅ متوافق / ❌ غير متوافق / ⚠️ مشروط / 🔲 غير محدد — بيانات غير كافية]
- **الأساس:** "هذا الحكم مبني على [المعطيات المستخدمة] ويفترض [الافتراضات المُعتمدة]"
- **تحفظات الاستخراج:** [إذا كانت جودة الصورة تُقيّد الحكم — اذكر ذلك صراحة]
- **ختام إلزامي:** "هذا التحليل يمثل الحد الأدنى الفني وفق الكود ويخضع لموافقة الدفاع المدني بناءً على تعاميمه العامة والخاصة وتقييم المخاطر الميدانية"

## X. الإجراءات المطلوبة / Required Actions

- [ ] [الإجراء] — الأولوية: [🔴 حرجة / 🟠 عالية / 🟡 متوسطة]

RESPOND IN: ${lang}`;
}

async function runVisionPipeline(
  apiKey: string,
  imageBase64s: string[],
  userQuery: string,
  language: string,
  mode: string = "analysis",
): Promise<{ systemPrompt: string; extraContext: string; usedFiles: string[]; sourceMeta: SourcePageMeta[] }> {
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
  const { context: sbcContext, files: usedFiles, sourceMeta } = await fetchSBCContextVector(enhancedQuery, 'analysis', searchKeywords);
  console.log(`✅ Stage 3 complete: ${sbcContext.length} chars from ${usedFiles.length} files`);

  // Stage 4 & 5 combined
  console.log("🔀 Stage 4-5: Merge + Final Response (will be streamed)...");

  // ── Build Document Intelligence Summary from Stage 1 results ─────────────
  // Parse the planning JSON to extract quality/confidence metadata so the
  // final analytical prompt knows what was actually readable from the drawing.
  let docIntelSummary = "";
  try {
    const planParsed = JSON.parse(planningResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    const quality = planParsed.imageQuality || "unknown";
    const confidence = planParsed.classificationConfidence || "unknown";
    const docType = planParsed.documentType || "unknown";
    const readableAreas: string[] = planParsed.readableAreas || [];
    const unreadableAreas: string[] = planParsed.unreadableAreas || [];
    const roomLabels: string[] = planParsed.roomLabels || [];
    const visibleSystems: string[] = planParsed.visibleSystems || [];
    const legendSymbols: string[] = planParsed.legendSymbols || [];
    const dimensions: string[] = planParsed.dimensions || [];
    const sheetCtx = planParsed.sheetContext || {};

    const qualityWarning = (quality === "low" || quality === "illegible")
      ? `\n⚠️ EXTRACTION WARNING: Image quality is "${quality}". Conclusions in unreadable areas are UNRELIABLE. Do NOT fabricate elements not confirmed by extraction. Downgrade compliance confidence accordingly.`
      : "";

    docIntelSummary = `
=== DOCUMENT INTELLIGENCE SUMMARY (Stage 1 Extraction) ===
Input Type: ${docType}
Sheet: ${sheetCtx.title || "unknown"} | Number: ${sheetCtx.number || "N/A"} | Scale: ${sheetCtx.scale || "N/A"}
Image Quality: ${quality}
Classification Confidence: ${confidence}
Readable Areas: ${readableAreas.length > 0 ? readableAreas.join("; ") : "not specified"}
Unreadable Areas: ${unreadableAreas.length > 0 ? unreadableAreas.join("; ") : "none reported"}
Room Labels Extracted: ${roomLabels.length > 0 ? roomLabels.join(", ") : "none"}
Fire Systems Visible: ${visibleSystems.length > 0 ? visibleSystems.join(", ") : "none"}
Legend Symbols: ${legendSymbols.length > 0 ? legendSymbols.join(", ") : "none"}
Dimensions: ${dimensions.length > 0 ? dimensions.join(", ") : "none"}
Building Type (extracted): ${planParsed.buildingType || "unknown"}
Occupancy (extracted): ${planParsed.occupancyGroup || "unknown"}
Hazard Level (extracted): ${planParsed.hazardLevel || "unknown"}
Stories (extracted): ${planParsed.stories || "unknown"}
Floor Area (extracted): ${planParsed.floorArea || "unknown"}${qualityWarning}
=== END DOCUMENT INTELLIGENCE SUMMARY ===
`;
    console.log(`[DocIntel] Quality: ${quality} | Confidence: ${confidence} | DocType: ${docType} | Rooms: ${roomLabels.length} | Systems: ${visibleSystems.length}`);
  } catch {
    docIntelSummary = `
=== DOCUMENT INTELLIGENCE SUMMARY (Stage 1 Extraction) ===
Extraction: Stage 1 JSON parse failed — raw classification data follows in Stage 1 block below.
Image Quality: unknown
Classification Confidence: low
⚠️ EXTRACTION WARNING: Classification metadata unavailable. Use only visually confirmed elements. Do not fabricate details.
=== END DOCUMENT INTELLIGENCE SUMMARY ===
`;
    console.warn("[DocIntel] Failed to parse Stage 1 JSON for summary");
  }

  // Advisory mode (standard) → design guidance framing; Analytical (analysis) or Primary → compliance audit framing
  const finalSystemPrompt = mode === "standard"
    ? getVisionAdvisoryFinalPrompt(language)
    : getVisionFinalPrompt(language);

  const extraContext = `
${docIntelSummary}
=== PIPELINE STAGE 1: PLANNING AGENT CLASSIFICATION (raw) ===
${planningResult}

=== PIPELINE STAGE 2: CHAIN OF THOUGHT CHECKLIST ===
${cotResult}

${sbcContext}
`;

  console.log(`🎯 === VISION PIPELINE STAGES 1-3 DONE in ${Date.now() - pipelineStart}ms ===`);

  return { systemPrompt: finalSystemPrompt, extraContext, usedFiles, sourceMeta };
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
    const { messages, retry, mode = "standard", language = "ar", image, images, documentTexts, output_format, preferred_standards } = await req.json();
    const resolvedImages: string[] = images ?? (image ? [image] : []);
    // documentTexts: [{name: string, content: string}] — CSV/TXT files extracted by frontend
    const resolvedDocTexts: Array<{ name: string; content: string }> = Array.isArray(documentTexts) ? documentTexts : [];
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
    let usedSourceMeta: SourcePageMeta[] = [];
    let finalMessages = [...messages];

    if (resolvedImages.length > 0) {
      // ===== VISION PIPELINE =====
      const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
      const userQuery = lastUserMessage?.content || "";

      // Primary mode with images: use Advisory framing (design guidance) — more appropriate than compliance audit for quick queries
      const visionMode = mode === "primary" ? "standard" : mode;
      const { systemPrompt, extraContext, usedFiles: visionFiles, sourceMeta: visionMeta } = await runVisionPipeline(
        GEMINI_API_KEY,
        resolvedImages,
        userQuery,
        language,
        visionMode,
      );

      fullSystemPrompt = systemPrompt + extraContext;
      usedFiles = visionFiles;
      usedSourceMeta = visionMeta;

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
      const { context: sbcContext, files, sourceMeta: keywordMeta } = await fetchSBCContext(userQuery);
      usedFiles = files;
      usedSourceMeta = keywordMeta;
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
    
    // ── Inject document texts (CSV/TXT files) into system prompt ─────────────
    // These are structured text documents uploaded by the user (schedules, tables,
    // specifications). Injected AFTER the SBC context so they appear as user-provided
    // project data, clearly distinct from code references.
    if (resolvedDocTexts.length > 0) {
      let docTextBlock = language === "en"
        ? `\n\n=== USER-PROVIDED DOCUMENTS (Text/CSV/Schedule Files) ===\n`
        : `\n\n=== وثائق المستخدم المرفوعة (ملفات نصية / CSV / جداول) ===\n`;
      for (const doc of resolvedDocTexts) {
        const truncated = doc.content.length > 8000 ? doc.content.slice(0, 8000) + "\n...[truncated]" : doc.content;
        docTextBlock += `\n--- File: ${doc.name} ---\n${truncated}\n--- End of ${doc.name} ---\n`;
      }
      docTextBlock += language === "en"
        ? `\n=== END USER-PROVIDED DOCUMENTS ===\nNOTE: The above documents are user-supplied project data (schedules, specifications, material lists). Treat them as CONFIRMED project inputs. Reference them explicitly when analyzing compliance. Do not confuse them with code references.\n`
        : `\n=== نهاية وثائق المستخدم ===\nملاحظة: الوثائق أعلاه بيانات مشروع مرفوعة من المستخدم (جداول، مواصفات، قوائم مواد). اعتبرها مدخلات مشروع مؤكدة. أشر إليها صراحة عند تحليل الامتثال. لا تخلطها مع مراجع الكود.\n`;
      fullSystemPrompt += docTextBlock;
      console.log(`[DocText] Injected ${resolvedDocTexts.length} document(s) into prompt`);
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
        "X-SBC-Source-Meta": JSON.stringify(usedSourceMeta),
      },
    });
  } catch (error) {
    console.error("Fire safety chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
