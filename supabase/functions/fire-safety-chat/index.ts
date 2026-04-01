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
هيكل الإجابة الإلزامي (استخدمه دائماً):
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
6) ممنوع طرح أسئلة إلا إذا كانت تغيّر نتيجة تحليل الكود
7) ممنوع افتراض تصنيف إشغال "نموذجي" — اعرض كل المسارات الممكنة
8) ممنوع خلط متطلبات مسارات كود مختلفة في إجابة واحدة

═══════════════════════════════════════
قواعد تصنيف الإشغال الحرجة:
═══════════════════════════════════════

عندما يعتمد تصنيف الإشغال على لغة شرطية أو تفسيرات:
1) لا تفترض تصنيفاً "نموذجياً" أبداً
2) اقتبس الشرط أو الاستثناء دائماً
3) اعرض كل مسارات التصنيف الممكنة
4) لا تحسم تصنيفاً واحداً بدون حقائق صريحة
5) إذا كانت المعطيات ناقصة: صرّح أن التصنيف مشروط وحلل المتطلبات تحت كل مسار
6) التفسيرات (Commentary) التي تؤهل الكود تُعامل كمرجعية للتفسير التقني

═══════════════════════════════════════
منهجيات التحسين:
═══════════════════════════════════════

- أسئلة وأجوبة: اقتبس ← ترجم ← طبّق
- حسابات: المعطيات ← الكود ← المعادلة ← النتيجة
- امتثال: جدول (البند | المتطلب | المصدر | الحالة | ملاحظات)
- تصميم قائم على الأداء: اذكر الأساس الإلزامي أولاً

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
    chapters: [11, 12, 13, 14, 15],
    topics: ["accessibility", "interior environment", "energy", "lighting", "ventilation", "plumbing"],
    topicsAr: ["وصول", "بيئة داخلية", "طاقة", "إنارة", "تهوية", "سباكة"],
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
const AR_EN_GLOSSARY: Record<string, string[]> = {
  "حريق": ["fire", "fire protection"],
  "الحريق": ["fire", "fire protection"],
  "إطفاء": ["suppression", "extinguishing", "fire suppression"],
  "رش": ["sprinkler", "spray"],
  "رشاش": ["sprinkler", "nozzle"],
  "الرش": ["sprinkler"],
  "رشاشات": ["sprinklers"],
  "إنذار": ["alarm", "detection", "notification"],
  "كاشف": ["detector", "sensor"],
  "كواشف": ["detectors", "sensors"],
  "مضخة": ["pump", "fire pump"],
  "خرطوم": ["hose", "standpipe"],
  "طفاية": ["extinguisher"],
  "مقاومة": ["resistance", "fire resistance", "rated"],
  "تصنيف": ["classification", "rating", "type"],
  "مبنى": ["building", "structure"],
  "مباني": ["buildings", "structures"],
  "بناء": ["building", "construction"],
  "ارتفاع": ["height", "elevation", "rise"],
  "مساحة": ["area", "floor area", "square"],
  "طابق": ["floor", "story", "storey", "level"],
  "طوابق": ["floors", "stories", "storeys", "levels"],
  "أدوار": ["stories", "floors", "levels"],
  "دور": ["story", "floor", "level"],
  "سقف": ["roof", "ceiling"],
  "جدار": ["wall", "partition"],
  "جدران": ["walls", "partitions"],
  "عمود": ["column", "pillar"],
  "إشغال": ["occupancy", "occupant", "use"],
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
  "مخرج": ["exit", "egress", "means of egress"],
  "مخارج": ["exits", "egress", "means of egress"],
  "هروب": ["escape", "egress", "evacuation"],
  "إخلاء": ["evacuation", "egress"],
  "ممر": ["corridor", "passage", "aisle", "hallway"],
  "درج": ["stair", "stairway", "staircase"],
  "سلم": ["stair", "stairway", "ladder"],
  "سلالم": ["stairs", "stairways", "staircases"],
  "باب": ["door", "doorway", "opening"],
  "أبواب": ["doors", "doorways"],
  "فتحة": ["opening", "aperture"],
  "فتحات": ["openings", "apertures"],
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
  "متطلبات": ["requirements", "provisions", "criteria"],
  "اشتراطات": ["requirements", "provisions", "regulations"],
  "لائحة": ["regulation", "code", "standard"],
  "كود": ["code", "standard"],
  "مادة": ["section", "clause", "article"],
  "فصل": ["chapter", "section"],
  "جدول": ["table", "schedule"],
  "ملحق": ["appendix", "annex", "supplement"],
  "مسافة": ["distance", "travel distance", "separation"],
  "عرض": ["width", "breadth"],
  "طول": ["length", "height"],
  "حمل": ["load", "occupant load", "capacity"],
  "سعة": ["capacity", "occupancy load"],
  "خرسانة": ["concrete", "reinforced concrete"],
  "حديد": ["steel", "iron", "metal"],
  "خشب": ["wood", "timber", "combustible"],
  "عازل": ["insulation", "barrier", "fire barrier"],
  "حاجز": ["barrier", "separation", "fire barrier"],
  "حماية": ["protection", "fire protection", "safeguard"],
  "وقاية": ["prevention", "protection", "safety"],
  "سلامة": ["safety", "life safety"],
  "تلقائي": ["automatic", "auto"],
  "يدوي": ["manual", "hand-operated"],
  // --- Added terms for better RAG matching ---
  "قسم": ["section", "division"],
  "مجموعة": ["group", "occupancy group"],
  "مقاومة حريق": ["fire resistance", "fire-resistance rating"],
  "مقاومة": ["resistance", "rating"],
  "حمل إشغال": ["occupant load", "occupancy load"],
  "إشغال": ["occupancy", "occupant", "use"],
  "مسافة سفر": ["travel distance", "exit travel"],
  "سفر": ["travel", "travel distance"],
  "كاشف دخان": ["smoke detector", "smoke detection"],
  "كاشف": ["detector", "sensor"],
  "كاشف حرارة": ["heat detector", "thermal detector"],
  "نظام رش": ["sprinkler system", "automatic sprinkler"],
  "رش": ["sprinkler", "spray"],
  "رشاش": ["sprinkler", "sprinkler head", "nozzle"],
  "رشاشات": ["sprinklers", "sprinkler system", "automatic sprinkler"],
  "إنذار حريق": ["fire alarm", "fire alarm system"],
  "إنذار": ["alarm", "notification", "alert"],
  "مضخة حريق": ["fire pump", "fire pump system"],
  "مضخة": ["pump", "fire pump"],
  "صاعد": ["standpipe", "riser", "vertical pipe"],
  "صاعد مائي": ["standpipe", "standpipe system"],
  "مخرج طوارئ": ["emergency exit", "exit"],
  "مخرج": ["exit", "means of egress", "egress"],
  "طوارئ": ["emergency", "emergency exit"],
  "ممر": ["corridor", "hallway", "passage"],
  "درج": ["stair", "stairway", "staircase"],
  "سلم": ["stair", "stairway", "ladder"],
  "مصعد": ["elevator", "lift"],
  "حاجز حريق": ["fire barrier", "fire wall", "fire separation"],
  "جدار حريق": ["fire wall", "firewall", "fire barrier"],
  "فاصل حريق": ["fire separation", "fire partition"],
  "تصنيف": ["classification", "rating", "type"],
  "نوع إنشاء": ["construction type", "type of construction"],
  "إنشاء": ["construction", "building construction"],
  "ارتفاع": ["height", "building height", "rise"],
  "مساحة": ["area", "floor area", "allowable area"],
  "مساحة أرضية": ["floor area", "allowable area"],
  "طابق": ["story", "floor", "level"],
  "طوابق": ["stories", "floors", "levels"],
  "تحكم دخان": ["smoke control", "smoke management"],
  "دخان": ["smoke", "smoke control"],
  "مانع دخان": ["smoke barrier", "smoke partition"],
  "فتحة": ["opening", "penetration"],
  "فتحات": ["openings", "penetrations"],
  "مقاومة للحريق": ["fire-rated", "fire resistant", "fire resistance"],
  "مسار هروب": ["means of egress", "escape route", "exit path"],
  "هروب": ["egress", "escape", "evacuation"],
  "إخلاء": ["evacuation", "egress"],
  "تصريح": ["permit", "approval"],
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
    "table 1006", "table 1004", "table 903", "table 1020",
    "section 903", "section 1006", "section 1004", "section 1020",
    "903.2", "903.3", "1006.3", "1004.5", "1020",
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
  
  // Check keyword map
  for (const [keyword, chapters] of Object.entries(CHAPTER_KEYWORDS)) {
    if (lower.includes(keyword)) {
      chapters.sbc201.forEach(c => sbc201Chapters.add(c));
      chapters.sbc801.forEach(c => sbc801Chapters.add(c));
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
  
  // Check for explicit section numbers (e.g., 903.2 -> chapter 9)
  const sectionMatch = lower.match(/(?:section\s+)?(\d{3,4})\.\d/gi);
  if (sectionMatch) {
    for (const m of sectionMatch) {
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
    const { sbc201Chapters, sbc801Chapters } = getTargetChapters(query);
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
    
    // Select top files: max balanced between codes (increased for better coverage)
    const max201 = Math.min(scored201.length, sbc201Chapters.length > 0 ? 6 : 3);
    const max801 = Math.min(scored801.length, sbc801Chapters.length > 0 ? 6 : 3);

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
    const { messages, retry, mode = "standard", language = "ar", image, images } = await req.json();
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
      const TRIAL_DAYS_NUM  = 3;
      const LAUNCH_TRIAL_LIMITS_MAP: Record<string, number> = { primary: 50, standard: 2, analysis: 1 };

      const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];
      const isAdmin      = userEmail && ADMIN_EMAILS.includes(userEmail);

      // Fetch profile (fix: use user_id column, not id)
      const { data: profile } = await adminClient
        .from("profiles")
        .select("plan_type, launch_trial_status, launch_trial_start, launch_trial_end, created_at")
        .eq("user_id", userId)
        .maybeSingle();

      const isUnlimitedPlan = profile?.plan_type === "enterprise" || profile?.plan_type === "engineer";
      console.log("[Limit] email:", userEmail, "| plan_type:", profile?.plan_type, "| isAdmin:", isAdmin, "| isUnlimited:", isUnlimitedPlan);

      if (!isAdmin && !isUnlimitedPlan) {
        // ── Check active paid subscription ────────────────────────────────────
        const { data: sub } = await adminClient
          .from("user_subscriptions")
          .select("status, trial_end, current_period_end")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let dailyLimit       = 10;  // free/expired default
        let hasPaidAccess    = false;

        if (sub?.status === "trialing" && sub.trial_end && now < new Date(sub.trial_end)) {
          dailyLimit    = 20;
          hasPaidAccess = true;
        } else if (sub?.status === "active" && sub.current_period_end && now < new Date(sub.current_period_end)) {
          dailyLimit    = 9999;
          hasPaidAccess = true;
        }

        if (hasPaidAccess) {
          // Paid/trialing user: only enforce the overall daily limit
          if (dailyLimit < 9999) {
            const { data: currentCount } = await adminClient.rpc("increment_daily_usage", { p_user_id: userId });
            if (currentCount && currentCount > dailyLimit) {
              return new Response(
                JSON.stringify({ error: "تجاوزت الحد اليومي للرسائل / Daily message limit exceeded", limit: dailyLimit }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        } else {
          // ── Launch trial mode-specific limit check ──────────────────────────
          let launchTrialStatus = profile?.launch_trial_status ?? null;

          // Auto-initialize if missing
          if (!launchTrialStatus) {
            const userCreatedAt = new Date(profile?.created_at ?? now.toISOString());
            const isNewUser     = userCreatedAt >= LAUNCH_DATE_TS;
            if (now < CAMPAIGN_END_TS) {
              if (isNewUser) {
                const trialEnd = new Date(userCreatedAt.getTime() + TRIAL_DAYS_NUM * 86400000);
                launchTrialStatus = "eligible_new";
                await adminClient.from("profiles").update({
                  launch_trial_status: "eligible_new",
                  launch_trial_start:  userCreatedAt.toISOString(),
                  launch_trial_end:    trialEnd.toISOString(),
                }).eq("user_id", userId);
                profile && Object.assign(profile, { launch_trial_end: trialEnd.toISOString() });
              } else {
                // First chat activates the trial for existing users
                const trialStart = now;
                const trialEnd   = new Date(now.getTime() + TRIAL_DAYS_NUM * 86400000);
                launchTrialStatus = "eligible_existing_active";
                await adminClient.from("profiles").update({
                  launch_trial_status: "eligible_existing_active",
                  launch_trial_start:  trialStart.toISOString(),
                  launch_trial_end:    trialEnd.toISOString(),
                }).eq("user_id", userId);
                profile && Object.assign(profile, { launch_trial_end: trialEnd.toISOString() });
              }
            } else {
              launchTrialStatus = "ineligible_window_closed";
              await adminClient.from("profiles").update({ launch_trial_status: "ineligible_window_closed" }).eq("user_id", userId);
            }
          }

          // Activate pending existing users on first chat
          if (launchTrialStatus === "eligible_existing_pending") {
            if (now < CAMPAIGN_END_TS) {
              const trialStart = now;
              const trialEnd   = new Date(now.getTime() + TRIAL_DAYS_NUM * 86400000);
              launchTrialStatus = "eligible_existing_active";
              await adminClient.from("profiles").update({
                launch_trial_status: "eligible_existing_active",
                launch_trial_start:  trialStart.toISOString(),
                launch_trial_end:    trialEnd.toISOString(),
              }).eq("user_id", userId);
              profile && Object.assign(profile, { launch_trial_end: trialEnd.toISOString() });
            } else {
              launchTrialStatus = "ineligible_window_closed";
              await adminClient.from("profiles").update({ launch_trial_status: "ineligible_window_closed" }).eq("user_id", userId);
            }
          }

          const trialEndDate = profile?.launch_trial_end ? new Date(profile.launch_trial_end) : null;
          const trialIsActive =
            (launchTrialStatus === "eligible_new" || launchTrialStatus === "eligible_existing_active") &&
            trialEndDate !== null && now < trialEndDate;

          if (trialIsActive) {
            // ── Mode-specific limit enforcement ──────────────────────────────
            const resolvedMode = (mode === "primary" || mode === "standard" || mode === "analysis") ? mode : "standard";
            const modeLimit    = LAUNCH_TRIAL_LIMITS_MAP[resolvedMode] ?? 50;

            // Check current count BEFORE incrementing
            const { data: currentModeCount } = await adminClient.rpc("get_mode_daily_count", {
              p_user_id: userId,
              p_mode:    resolvedMode,
            });

            if (currentModeCount !== null && currentModeCount >= modeLimit) {
              return new Response(
                JSON.stringify({
                  error: "mode_limit_exceeded",
                  mode:  resolvedMode,
                  limit: modeLimit,
                  used:  currentModeCount,
                }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            // Increment mode usage (deducted at request start — valid start of processing)
            await adminClient.rpc("increment_mode_daily_count", { p_user_id: userId, p_mode: resolvedMode });

          } else if (!trialIsActive) {
            // Trial expired or no trial — enforce free daily limit
            const { data: currentCount } = await adminClient.rpc("increment_daily_usage", { p_user_id: userId });
            if (currentCount && currentCount > dailyLimit) {
              return new Response(
                JSON.stringify({
                  error: launchTrialStatus === "expired"
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
      const { context: sbcContext, files } = await fetchSBCContextVector(userQuery, mode);
      usedFiles = files;
      console.log(`SBC context result: ${sbcContext.length} chars from ${usedFiles.length} files`);
      
      const basePrompt = mode === "analysis" 
        ? getAnalysisPrompt(language) 
        : getStandardPrompt(language);
      
      fullSystemPrompt = basePrompt;
      if (sbcContext) {
        fullSystemPrompt += sbcContext;
        const warningMsg = language === "en" 
          ? `\n\n⚠️ CRITICAL: Cite exact clause numbers from above. If not found, say: "The required information is not available in the current files."`
          : `\n\n⚠️ هام: استشهد بأرقام المواد الدقيقة من المستندات أعلاه. إذا لم تجد، قل: "المعلومات المطلوبة غير متوفرة في الملفات الحالية."`;
        fullSystemPrompt += warningMsg;
      } else {
        const warningMsg = language === "en"
          ? `\n\n⚠️ WARNING: No SBC files loaded. Inform user that reference documents are temporarily unavailable.`
          : `\n\n⚠️ تحذير: لم يتم تحميل ملفات SBC. أخبر المستخدم أن المستندات المرجعية غير متوفرة مؤقتاً.`;
        fullSystemPrompt += warningMsg;
      }
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
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        for (const line of text.split("\n")) {
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
