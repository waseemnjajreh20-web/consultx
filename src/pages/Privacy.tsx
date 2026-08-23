import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useLanguage } from "@/hooks/useLanguage";

// NOTE: All copy on this page is defined locally rather than in
// src/lib/translations.ts. A legal notice must be reviewable as one continuous
// document; splitting it across a shared translation table makes it impossible
// to audit what was actually published on a given date.
export default function Privacy() {
  const { language } = useLanguage();
  const isAr = language === "ar";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-20 w-full">
        {isAr ? (
          <>
            <h1 className="text-3xl font-bold text-foreground mb-2">سياسة الخصوصية</h1>
            <p className="text-sm text-muted-foreground mb-10">آخر تحديث: أغسطس 2026</p>

            <section className="space-y-8 text-sm text-muted-foreground leading-relaxed">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">1. المتحكم في البيانات</h2>
                <p>
                  المتحكم في بياناتك الشخصية هو <strong>مؤسسة العباقرة الأوائل لتقنية نظم المعلومات</strong>،
                  سجل تجاري رقم <strong>7042173794</strong>، تبوك، المملكة العربية السعودية، وهي الجهة المشغّلة
                  لمنصة ConsultX. للتواصل بشأن الخصوصية:{" "}
                  <a href="mailto:info@consultx.app" className="text-primary hover:underline">info@consultx.app</a>
                  {" "}أو <span dir="ltr">+966 53 251 9857</span>.
                </p>
                <p className="mt-3">
                  تُطبَّق هذه السياسة وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية (PDPL) ولائحته التنفيذية.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">2. البيانات التي نجمعها</h2>
                <p>نجمع فقط ما تحتاجه الخدمة:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li><strong>بيانات الحساب:</strong> عنوان البريد الإلكتروني، وكلمة مرور مُجزّأة (hashed) لا نستطيع قراءتها.</li>
                  <li><strong>بيانات الملف الشخصي (اختيارية):</strong> الاسم المعروض، المسمى الوظيفي، رقم الجوال، نبذة، الصورة الرمزية، اللغة المفضلة — إن اخترت إدخالها.</li>
                  <li><strong>محتوى المحادثات:</strong> الأسئلة التي تكتبها وإجابات الذكاء الاصطناعي المرتبطة بها.</li>
                  <li><strong>الملفات المرفوعة:</strong> المخططات والصور وملفات PDF التي ترفعها داخل المحادثة.</li>
                  <li><strong>بيانات الاستخدام:</strong> عدد الرسائل اليومي لكل نمط، وتواريخ الاستخدام (لتطبيق حدود الباقة).</li>
                  <li><strong>بيانات الاشتراك والدفع:</strong> حالة الاشتراك، تواريخ الفوترة، المبلغ والعملة، نوع البطاقة وآخر أربعة أرقام منها. <strong>لا نستقبل ولا نخزّن رقم بطاقتك الكامل ولا رمز CVV إطلاقاً</strong> — تُدخل هذه البيانات مباشرة لدى مُيسّر (Moyasar).</li>
                  <li><strong>بيانات المؤسسات (لعملاء الباقات المؤسسية):</strong> عضويتك في المؤسسة ودورك وما تنشئه من ملاحظات ومراجعات وقضايا داخل مساحة العمل.</li>
                </ul>
                <p className="mt-3">لا نستخدم أدوات تتبع إعلاني، ولا نبني ملفات إعلانية عنك، ولا نبيع بياناتك.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">3. الأساس النظامي لكل غرض</h2>
                <p>نعالج بياناتك للأغراض التالية وبالأسس النظامية الموضحة أمام كل غرض:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li><strong>إنشاء الحساب وتشغيله وتقديم الاستشارات:</strong> تنفيذ العقد المبرم بينك وبيننا (شروط الاستخدام).</li>
                  <li><strong>إرسال محتوى محادثاتك وملفاتك إلى مزوّد الذكاء الاصطناعي لتوليد الإجابة:</strong> تنفيذ العقد — هذه هي الخدمة ذاتها، ولا يمكن تقديمها بدون هذه المعالجة.</li>
                  <li><strong>معالجة المدفوعات والاشتراكات والتجديد:</strong> تنفيذ العقد، والالتزام بالأنظمة التجارية والمحاسبية.</li>
                  <li><strong>رسائل الخدمة (تأكيد البريد، استعادة كلمة المرور، إشعارات الاشتراك والفشل في الدفع):</strong> تنفيذ العقد.</li>
                  <li><strong>حدود الاستخدام اليومي ومنع إساءة الاستخدام وأمن المنصة:</strong> المصلحة المشروعة في حماية الخدمة ومستخدميها.</li>
                  <li><strong>الرسائل التسويقية والعروض الترويجية:</strong> موافقتك — ويمكنك سحبها في أي وقت دون التأثير على حسابك.</li>
                  <li><strong>الاحتفاظ بالسجلات المالية بعد إغلاق الحساب:</strong> الالتزام النظامي بحفظ الدفاتر والسجلات التجارية.</li>
                </ul>
                <p className="mt-3">
                  لا نتخذ قرارات آلية تُنتج أثراً نظامياً عليك. مخرجات الذكاء الاصطناعي محتوى استشاري فني، وليست قراراً بشأنك،
                  ولا تُغني عن مهندس مرخّص أو عن المرجع النظامي الرسمي.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">4. نقل البيانات خارج المملكة ومقدمو الخدمة</h2>
                <p className="text-foreground font-medium">
                  تُعالَج رسائل محادثاتك وأي ملفات أو صور ترفعها خارج المملكة العربية السعودية.
                </p>
                <p className="mt-3">
                  عند إرسالك أي رسالة أو ملف، يُنقل محتواها إلى <strong>Google</strong> لاستخدام نماذج
                  {" "}<strong>Gemini</strong> في توليد الإجابة، وتتم هذه المعالجة على بنية Google التقنية خارج المملكة.
                  هذا النقل ضروري لتقديم الخدمة، ولا يمكن استخدام ConsultX بدونه.
                </p>
                <p className="mt-3">مقدمو الخدمة الفرعيون الذين نستعين بهم:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li><strong>Google (Gemini):</strong> معالجة الرسائل والملفات المرفوعة لتوليد الإجابات — خارج المملكة.</li>
                  <li><strong>Supabase:</strong> قاعدة البيانات والمصادقة وتخزين الملفات — خارج المملكة.</li>
                  <li><strong>Resend:</strong> إرسال رسائل البريد الإلكتروني (التأكيد، استعادة كلمة المرور، إشعارات الاشتراك) — خارج المملكة. يصل إلى Resend بريدك الإلكتروني ومحتوى الرسالة فقط.</li>
                  <li><strong>Vercel:</strong> استضافة واجهة الموقع وشبكة التوزيع — خارج المملكة. تصله بيانات الطلب التقنية مثل عنوان IP ونوع المتصفح.</li>
                  <li><strong>مُيسّر (Moyasar):</strong> معالجة المدفوعات — داخل المملكة العربية السعودية. تُدخل بيانات بطاقتك لديه مباشرة ولا تمر عبر خوادمنا.</li>
                </ul>
                <p className="mt-3">
                  نتعامل مع هؤلاء المزودين بصفتهم معالِجين للبيانات بموجب شروطهم التعاقدية المنشورة، وننقل إليهم الحد الأدنى
                  اللازم لأداء وظيفتهم. باستخدامك الخدمة فإنك تدرك هذا النقل وتوافق عليه. إذا كان النقل خارج المملكة غير
                  مقبول لبياناتك أو لبيانات عملائك، فلا ينبغي رفع تلك البيانات إلى المنصة.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">5. مسؤوليتك عن الملفات التي ترفعها</h2>
                <p>
                  <strong>لا ترفع مخططات أو مستندات أو بيانات تخص طرفاً ثالثاً دون إذنه.</strong> إذا كنت مهندساً أو
                  استشارياً وترفع مخططات عميل، فأنت مسؤول عن التحقق من أن اتفاقية عدم الإفصاح أو العقد المبرم مع عميلك
                  يسمح بمعالجة هذه المستندات عبر خدمة سحابية ونقلها خارج المملكة كما هو موضح في القسم 4.
                </p>
                <p className="mt-3">
                  ننصح بإزالة أسماء المشاريع وبيانات الملاك وأي بيانات شخصية أو تعريفية من المستندات قبل رفعها متى أمكن ذلك.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">6. التخزين والأمان</h2>
                <p>
                  تُخزَّن بياناتك في قاعدة بيانات Supabase مع تشفير أثناء النقل (TLS) وأثناء التخزين، وتُطبَّق سياسات
                  أمان على مستوى الصف (Row Level Security) بحيث لا يستطيع أي مستخدم قراءة بيانات مستخدم آخر.
                  الوصول الإداري إلى محتوى المحادثات مقيّد بحالات الضرورة التقنية أو الالتزام النظامي.
                </p>
                <p className="mt-3">
                  ملاحظة مهمة: الصور والملفات التي ترفعها تُحفظ في مساحة تخزين يمكن الوصول إليها عبر رابط مباشر يصعب تخمينه.
                  لا تشارك روابط الملفات مع من لا تريد اطلاعه عليها.
                </p>
                <p className="mt-3">
                  لا يوجد نظام معلومات آمن بشكل مطلق. في حال وقوع حادثة تسريب لبيانات شخصية، سنتخذ الإجراءات النظامية
                  المطلوبة ونُبلغك عند الاقتضاء.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">7. ملفات تعريف الارتباط</h2>
                <p>
                  نستخدم ملفات تعريف الارتباط والتخزين المحلي للأغراض الضرورية فقط: الإبقاء على جلسة الدخول، وحفظ تفضيلاتك
                  (اللغة، النمط، إعدادات العرض). لا نستخدم ملفات تتبع إعلانية ولا نشارك بيانات تصفحك مع شبكات إعلانية.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">8. حقوقك بموجب نظام حماية البيانات الشخصية</h2>
                <p>يمنحك النظام الحقوق التالية:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li><strong>حق العلم:</strong> معرفة الأساس النظامي لجمع بياناتك والغرض منه — وهو ما توضحه هذه السياسة.</li>
                  <li><strong>حق الوصول:</strong> الحصول على نسخة من بياناتك الشخصية لدينا.</li>
                  <li><strong>حق التصحيح:</strong> تصحيح أو استكمال أي بيانات غير دقيقة أو ناقصة.</li>
                  <li><strong>حق الإتلاف (الحذف):</strong> طلب حذف بياناتك الشخصية.</li>
                  <li><strong>حق الاعتراض:</strong> الاعتراض على معالجة تستند إلى المصلحة المشروعة.</li>
                  <li><strong>سحب الموافقة:</strong> سحب موافقتك على المعالجة القائمة على الموافقة (مثل الرسائل التسويقية) في أي وقت.</li>
                </ul>
                <p className="mt-3">
                  <strong>كيف تمارس حقوقك:</strong> راسلنا من بريدك الإلكتروني المسجّل على{" "}
                  <a href="mailto:info@consultx.app" className="text-primary hover:underline">info@consultx.app</a>{" "}
                  موضحاً الحق الذي ترغب بممارسته. نرد على طلبك خلال ثلاثين (30) يوماً كحد أقصى.
                  ولحذف الحساب تحديداً، يمكنك تنفيذه بنفسك فوراً من إعدادات حسابك كما هو موضح في القسم 9.
                </p>
                <p className="mt-3">
                  قد نطلب تحققاً إضافياً من هويتك قبل تنفيذ الطلب، وذلك حمايةً لحسابك من طلبات غير مصرح بها.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">9. حذف الحساب</h2>
                <p>
                  يمكنك حذف حسابك من إعدادات الحساب داخل المنصة، أو بمراسلتنا على{" "}
                  <a href="mailto:info@consultx.app" className="text-primary hover:underline">info@consultx.app</a>.
                  الحذف <strong>نهائي ولا يمكن التراجع عنه</strong>.
                </p>
                <p className="mt-3">يُحذف عند تنفيذ الطلب:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li>حساب الدخول وعنوان بريدك الإلكتروني.</li>
                  <li>جميع محادثاتك ورسائلها.</li>
                  <li>جميع الصور والملفات التي رفعتها.</li>
                  <li>ملفك الشخصي وبيانات الملف العام وسجلات الاستخدام اليومي.</li>
                </ul>
                <p className="mt-3">
                  <strong>حالات لا يمكن فيها الحذف الفوري:</strong> إذا كان لديك اشتراك ساري (نشط أو تجريبي أو متأخر السداد)
                  فيجب إلغاء الاشتراك أولاً؛ وإذا كنت مالكاً لمساحة عمل مؤسسية أو عضواً فيها فيجب نقل الملكية أو إزالة عضويتك
                  من قِبل مالك المؤسسة أولاً، لأن حذفك مباشرةً يُتلف بيانات تخص المؤسسة وعملاءها وليست بياناتك وحدك.
                  في هذه الحالات راسلنا على info@consultx.app لاستكمال الطلب.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">10. مدد الاحتفاظ بالبيانات</h2>
                <ul className="list-disc ps-5 space-y-1.5">
                  <li><strong>المحادثات والملفات المرفوعة:</strong> يُحتفظ بها ما دام حسابك قائماً، وتُحذف فور تنفيذ طلب حذف الحساب. يمكنك حذف أي محادثة بشكل منفرد في أي وقت.</li>
                  <li><strong>بيانات الحساب والملف الشخصي:</strong> تُحذف فور تنفيذ طلب حذف الحساب.</li>
                  <li><strong>سجلات الاستخدام اليومي:</strong> تُحذف فور تنفيذ طلب حذف الحساب.</li>
                  <li>
                    <strong>السجلات المالية (الاشتراكات وعمليات الدفع):</strong> تُحفظ حتى بعد حذف حسابك، امتثالاً
                    لالتزامات حفظ الدفاتر والسجلات التجارية في المملكة، ولمعالجة أي نزاع أو استرداد لاحق. عند حذف الحساب
                    نزيل من هذه السجلات كل بيانات البطاقة القابلة لإعادة الاستخدام (رموز البطاقة المحفوظة) فلا يمكن إجراء
                    أي خصم لاحق، ويبقى فيها فقط المبلغ والعملة والتاريخ ونوع البطاقة وآخر أربعة أرقام، مرتبطة بمعرّف رقمي
                    لم يعد بالإمكان ربطه بشخصك بعد حذف حساب الدخول.
                  </li>
                  <li><strong>سجلات إجراءات المشرفين (Audit log):</strong> تُحفظ لأغراض الأمن ولا تتضمن محتوى محادثاتك.</li>
                  <li><strong>النسخ الاحتياطية:</strong> قد تبقى بياناتك ضمن نسخ احتياطية دورية لمزود قاعدة البيانات لمدة تصل إلى 30 يوماً بعد الحذف، ثم تُستبدل تلقائياً.</li>
                </ul>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">11. من نشارك معه بياناتك</h2>
                <p>
                  لا نبيع بياناتك ولا نؤجّرها ولا نشاركها لأغراض تسويقية مع أي طرف. نشاركها فقط مع مقدمي الخدمة المذكورين
                  في القسم 4 بالقدر اللازم لتشغيل الخدمة، أو استجابةً لطلب نظامي من جهة مختصة في المملكة.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">12. الأطفال</h2>
                <p>
                  الخدمة موجّهة للمهنيين والمختصين وليست موجّهة لمن هم دون الثامنة عشرة. لا نجمع بيانات الأطفال عن قصد،
                  وإذا علمنا بذلك نحذفها.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">13. تحديثات السياسة</h2>
                <p>
                  قد نحدّث هذه السياسة. ونُشعرك بأي تغيير جوهري عبر بريدك الإلكتروني المسجّل قبل سريانه، ويظهر تاريخ آخر
                  تحديث أعلى هذه الصفحة.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">14. التواصل والشكاوى</h2>
                <p>
                  لأي استفسار أو طلب أو شكوى تتعلق ببياناتك الشخصية:{" "}
                  <a href="mailto:info@consultx.app" className="text-primary hover:underline">info@consultx.app</a>{" "}
                  أو <span dir="ltr">+966 53 251 9857</span> أو عبر{" "}
                  <a href="/contact" className="text-primary hover:underline">صفحة التواصل</a>.
                </p>
                <p className="mt-3">
                  وإن لم تكن راضياً عن ردنا، يحق لك تقديم شكوى إلى الجهة المختصة بالإشراف على تطبيق نظام حماية البيانات
                  الشخصية في المملكة (الهيئة السعودية للبيانات والذكاء الاصطناعي — سدايا).
                </p>
              </div>
            </section>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground mb-10">Last updated: August 2026</p>

            <section className="space-y-8 text-sm text-muted-foreground leading-relaxed">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">1. Data Controller</h2>
                <p>
                  The controller of your personal data is{" "}
                  <strong>Al-Abaqirah Al-Awail Information Systems Technology Est.</strong>,
                  Commercial Registration <strong>7042173794</strong>, Tabuk, Saudi Arabia, the operator of the
                  ConsultX platform. Privacy contact:{" "}
                  <a href="mailto:info@consultx.app" className="text-primary hover:underline">info@consultx.app</a>
                  {" "}or <span dir="ltr">+966 53 251 9857</span>.
                </p>
                <p className="mt-3">
                  This policy is written to align with the Saudi Personal Data Protection Law (PDPL) and its
                  Implementing Regulations.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">2. Data We Collect</h2>
                <p>We collect only what the service needs:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li><strong>Account data:</strong> your email address and a hashed password we cannot read.</li>
                  <li><strong>Optional profile data:</strong> display name, job title, phone number, bio, avatar, preferred language — only if you choose to enter them.</li>
                  <li><strong>Conversation content:</strong> the questions you write and the AI answers attached to them.</li>
                  <li><strong>Uploaded files:</strong> drawings, images and PDFs you upload inside a conversation.</li>
                  <li><strong>Usage data:</strong> daily message counts per mode and usage dates, used to enforce plan limits.</li>
                  <li><strong>Subscription and payment data:</strong> subscription status, billing dates, amount and currency, card brand and last four digits. <strong>We never receive or store your full card number or CVV</strong> — those are entered directly with Moyasar.</li>
                  <li><strong>Enterprise workspace data (for organization plans):</strong> your membership, role, and the notes, reviews and cases you create inside the workspace.</li>
                </ul>
                <p className="mt-3">We use no advertising trackers, build no advertising profiles, and sell no data.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">3. Lawful Basis for Each Purpose</h2>
                <p>We process your data for the following purposes on the following lawful bases:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li><strong>Creating and running your account and delivering consultations:</strong> performance of our contract with you (the Terms).</li>
                  <li><strong>Sending your conversation content and uploaded files to the AI provider to generate an answer:</strong> performance of the contract — this processing is the service itself and cannot be separated from it.</li>
                  <li><strong>Processing payments, subscriptions and renewals:</strong> performance of the contract and compliance with commercial and accounting obligations.</li>
                  <li><strong>Service emails (email confirmation, password reset, subscription and payment-failure notices):</strong> performance of the contract.</li>
                  <li><strong>Daily usage limits, abuse prevention and platform security:</strong> our legitimate interest in protecting the service and its users.</li>
                  <li><strong>Marketing and promotional emails:</strong> your consent, which you may withdraw at any time without affecting your account.</li>
                  <li><strong>Retaining financial records after account closure:</strong> compliance with the legal obligation to keep commercial books and records.</li>
                </ul>
                <p className="mt-3">
                  We make no automated decisions that produce legal effects concerning you. AI output is technical
                  advisory content, not a decision about you, and does not replace a licensed engineer or the
                  official code text.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">4. Cross-Border Transfer and Sub-Processors</h2>
                <p className="text-foreground font-medium">
                  Your chat messages and any files or images you upload are processed outside the Kingdom of Saudi Arabia.
                </p>
                <p className="mt-3">
                  When you send a message or upload a file, its content is transferred to <strong>Google</strong> and
                  processed by the <strong>Gemini</strong> models on Google infrastructure located outside the Kingdom.
                  This transfer is necessary to deliver the service; ConsultX cannot function without it.
                </p>
                <p className="mt-3">The sub-processors we rely on:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li><strong>Google (Gemini):</strong> processes your messages and uploaded files to generate answers — outside the Kingdom.</li>
                  <li><strong>Supabase:</strong> database, authentication and file storage — outside the Kingdom.</li>
                  <li><strong>Resend:</strong> email delivery (confirmation, password reset, subscription notices) — outside the Kingdom. Resend receives only your email address and the message content.</li>
                  <li><strong>Vercel:</strong> front-end hosting and content delivery — outside the Kingdom. It receives technical request data such as IP address and browser type.</li>
                  <li><strong>Moyasar:</strong> payment processing — inside Saudi Arabia. Your card details are entered directly with Moyasar and never pass through our servers.</li>
                </ul>
                <p className="mt-3">
                  We engage these providers as data processors under their published contractual terms and send them
                  only the minimum needed to perform their function. By using the service you understand and accept
                  this transfer. If transfer outside the Kingdom is not acceptable for your data or your clients' data,
                  that data should not be uploaded to the platform.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">5. Your Responsibility for What You Upload</h2>
                <p>
                  <strong>Do not upload drawings, documents or data belonging to a third party without their permission.</strong>{" "}
                  If you are an engineer or consultant uploading a client's drawings, you are responsible for confirming
                  that your NDA or engagement contract permits those documents to be processed by a cloud service and
                  transferred outside the Kingdom as described in Section 4.
                </p>
                <p className="mt-3">
                  Wherever possible, remove project names, owner details and any personal or identifying data from
                  documents before uploading them.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">6. Storage and Security</h2>
                <p>
                  Your data is stored in a Supabase database with encryption in transit (TLS) and at rest, protected by
                  Row Level Security policies so that no user can read another user's data. Administrative access to
                  conversation content is limited to cases of documented technical necessity or legal obligation.
                </p>
                <p className="mt-3">
                  Important: images and files you upload are held in storage reachable through a direct, hard-to-guess
                  link. Do not share file links with anyone you do not want to see them.
                </p>
                <p className="mt-3">
                  No information system is absolutely secure. In the event of a personal data breach we will take the
                  steps required by law and notify you where applicable.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">7. Cookies</h2>
                <p>
                  We use cookies and local storage strictly for necessary purposes: keeping you signed in and saving
                  your preferences (language, mode, display settings). We use no advertising trackers and share no
                  browsing data with ad networks.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">8. Your Rights Under the PDPL</h2>
                <p>The law grants you the following rights:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li><strong>Right to be informed:</strong> to know the lawful basis and purpose for collecting your data — set out in this policy.</li>
                  <li><strong>Right of access:</strong> to obtain a copy of the personal data we hold about you.</li>
                  <li><strong>Right to correction:</strong> to correct or complete inaccurate or incomplete data.</li>
                  <li><strong>Right to destruction (deletion):</strong> to request deletion of your personal data.</li>
                  <li><strong>Right to object:</strong> to object to processing based on legitimate interest.</li>
                  <li><strong>Withdrawal of consent:</strong> to withdraw consent for consent-based processing (such as marketing emails) at any time.</li>
                </ul>
                <p className="mt-3">
                  <strong>How to exercise them:</strong> email us from your registered address at{" "}
                  <a href="mailto:info@consultx.app" className="text-primary hover:underline">info@consultx.app</a>{" "}
                  stating which right you wish to exercise. We respond within thirty (30) days at most.
                  For account deletion specifically, you can do it yourself immediately from your account settings, as
                  described in Section 9.
                </p>
                <p className="mt-3">
                  We may ask you to verify your identity before acting on a request, to protect your account from
                  unauthorised requests.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">9. Account Deletion</h2>
                <p>
                  You can delete your account from your account settings in the platform, or by emailing{" "}
                  <a href="mailto:info@consultx.app" className="text-primary hover:underline">info@consultx.app</a>.
                  Deletion is <strong>permanent and irreversible</strong>.
                </p>
                <p className="mt-3">When the request is executed we delete:</p>
                <ul className="list-disc ps-5 mt-3 space-y-1.5">
                  <li>your login and email address;</li>
                  <li>all your conversations and their messages;</li>
                  <li>all images and files you uploaded;</li>
                  <li>your profile, public profile data and daily usage records.</li>
                </ul>
                <p className="mt-3">
                  <strong>When immediate deletion is not possible:</strong> if you have a live subscription (active,
                  trialing or past due) you must cancel it first; and if you own or belong to an enterprise workspace,
                  ownership must be transferred or your membership removed by an organization owner first, because
                  deleting you outright would destroy records belonging to the organization and its clients, not only
                  to you. In those cases email info@consultx.app and we will complete the request.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">10. Retention Periods</h2>
                <ul className="list-disc ps-5 space-y-1.5">
                  <li><strong>Conversations and uploaded files:</strong> kept while your account exists and deleted as soon as an account deletion request is executed. You can delete any individual conversation at any time.</li>
                  <li><strong>Account and profile data:</strong> deleted as soon as an account deletion request is executed.</li>
                  <li><strong>Daily usage records:</strong> deleted as soon as an account deletion request is executed.</li>
                  <li>
                    <strong>Financial records (subscriptions and payments):</strong> retained even after your account is
                    deleted, to comply with Saudi obligations to keep commercial books and records and to handle any
                    later dispute or refund. On deletion we strip every reusable card credential (stored card tokens)
                    from these records so no further charge is possible, leaving only amount, currency, date, card brand
                    and last four digits, tied to a numeric identifier that can no longer be linked to you once the
                    login is gone.
                  </li>
                  <li><strong>Administrator audit log:</strong> retained for security purposes; it contains no conversation content of yours.</li>
                  <li><strong>Backups:</strong> your data may persist in the database provider's rolling backups for up to 30 days after deletion, after which they are automatically overwritten.</li>
                </ul>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">11. Who We Share Data With</h2>
                <p>
                  We do not sell, rent, or share your data for marketing with anyone. We share it only with the
                  providers listed in Section 4, to the extent needed to run the service, or in response to a lawful
                  request from a competent authority in the Kingdom.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">12. Children</h2>
                <p>
                  The service is intended for professionals and is not directed at anyone under 18. We do not knowingly
                  collect children's data, and we delete it if we become aware of it.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">13. Policy Updates</h2>
                <p>
                  We may update this policy. We will notify you of any material change via your registered email before
                  it takes effect, and the last-updated date appears at the top of this page.
                </p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">14. Contact and Complaints</h2>
                <p>
                  For any question, request or complaint about your personal data:{" "}
                  <a href="mailto:info@consultx.app" className="text-primary hover:underline">info@consultx.app</a>,{" "}
                  <span dir="ltr">+966 53 251 9857</span>, or via the{" "}
                  <a href="/contact" className="text-primary hover:underline">Contact page</a>.
                </p>
                <p className="mt-3">
                  If you are not satisfied with our response, you have the right to lodge a complaint with the authority
                  supervising the Personal Data Protection Law in the Kingdom (the Saudi Data and AI Authority, SDAIA).
                </p>
              </div>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
