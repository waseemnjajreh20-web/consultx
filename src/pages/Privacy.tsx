import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useLanguage } from "@/hooks/useLanguage";

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
            <p className="text-sm text-muted-foreground mb-10">آخر تحديث: مارس 2026</p>

            <section className="space-y-8 text-sm text-muted-foreground leading-relaxed">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">1. جمع البيانات</h2>
                <p>نجمع البيانات الضرورية لتقديم الخدمة: عنوان البريد الإلكتروني عند التسجيل، محادثات الاستشارة (مخزنة بشكل آمن)، بيانات الاستخدام الأساسية (عدد الرسائل، نوع الجهاز). لا نجمع بيانات مالية مباشرةً — تُعالج المدفوعات عبر Tap Payments.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">2. كيفية استخدام البيانات</h2>
                <p>نستخدم بياناتك لتقديم الاستشارات الهندسية، تحسين جودة الخدمة، إرسال الإشعارات المتعلقة بالاشتراك، وتحليل الأداء العام للخدمة دون تحديد هويتك.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">3. تخزين البيانات وأمانها</h2>
                <p>تُخزَّن بياناتك على خوادم Supabase المشفرة في مراكز بيانات آمنة. نستخدم التشفير أثناء النقل (TLS) وأثناء التخزين. لا يصل أي فرد من فريقنا لمحادثاتك إلا عند الضرورة التقنية الموثقة.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">4. الأطراف الثالثة</h2>
                <p>نشارك بياناتك مع: <strong>Supabase</strong> (قاعدة البيانات والمصادقة)، <strong>Tap Payments</strong> (معالجة المدفوعات)، <strong>Google (Gemini)</strong> (معالجة الاستشارات بالذكاء الاصطناعي). لا نبيع بياناتك لأي طرف ثالث.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">5. ملفات تعريف الارتباط (Cookies)</h2>
                <p>نستخدم ملفات تعريف الارتباط الضرورية فقط: لحفظ جلسة المستخدم والتفضيلات (اللغة، الوضع). لا نستخدم ملفات تتبع إعلانية.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">6. حقوق المستخدم</h2>
                <p>يحق لك في أي وقت: طلب نسخة من بياناتك، تصحيح بيانات غير دقيقة، طلب حذف حسابك وجميع بياناتك. لممارسة هذه الحقوق، تواصل معنا عبر صفحة التواصل.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">7. الاحتفاظ بالبيانات</h2>
                <p>نحتفظ بمحادثاتك وفق خطة اشتراكك (7 أيام للباقة الأساسية، 90 يوماً لباقة Pro، غير محدود لباقة Team). بعد إلغاء الحساب، يتم حذف البيانات خلال 30 يوماً.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">8. تحديثات السياسة</h2>
                <p>نُعلمك بأي تغييرات جوهرية عبر البريد الإلكتروني المسجل. الاستمرار في استخدام الخدمة بعد الإشعار يعني قبول السياسة المحدثة.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">9. التواصل</h2>
                <p>لأي استفسار حول الخصوصية: <a href="/contact" className="text-primary hover:underline">صفحة التواصل</a>.</p>
              </div>
            </section>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground mb-10">Last updated: March 2026</p>

            <section className="space-y-8 text-sm text-muted-foreground leading-relaxed">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">1. Data Collection</h2>
                <p>We collect data necessary to provide the service: email address upon registration, consultation conversations (securely stored), and basic usage data (message count, device type). We do not collect financial data directly — payments are processed via Tap Payments.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">2. How We Use Your Data</h2>
                <p>We use your data to deliver engineering consultations, improve service quality, send subscription-related notifications, and analyze overall service performance without identifying you personally.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">3. Data Storage & Security</h2>
                <p>Your data is stored on encrypted Supabase servers in secure data centers. We use encryption in transit (TLS) and at rest. No team member accesses your conversations except when technically required and documented.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">4. Third-Party Services</h2>
                <p>We share data with: <strong>Supabase</strong> (database & authentication), <strong>Tap Payments</strong> (payment processing), <strong>Google (Gemini)</strong> (AI consultation processing). We do not sell your data to any third party.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">5. Cookies</h2>
                <p>We use only necessary cookies: to save user sessions and preferences (language, mode). We do not use advertising tracking cookies.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">6. Your Rights</h2>
                <p>You may at any time: request a copy of your data, correct inaccurate data, or request deletion of your account and all data. To exercise these rights, contact us via the Contact page.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">7. Data Retention</h2>
                <p>We retain your conversations according to your subscription plan (7 days for Starter, 90 days for Pro, unlimited for Team). After account cancellation, data is deleted within 30 days.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">8. Policy Updates</h2>
                <p>We will notify you of any material changes via your registered email. Continued use of the service after notification constitutes acceptance of the updated policy.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">9. Contact</h2>
                <p>For any privacy inquiries: <a href="/contact" className="text-primary hover:underline">Contact page</a>.</p>
              </div>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
