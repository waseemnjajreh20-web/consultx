import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useLanguage } from "@/hooks/useLanguage";

export default function Terms() {
  const { language } = useLanguage();
  const isAr = language === "ar";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-20 w-full">
        {isAr ? (
          <>
            <h1 className="text-3xl font-bold text-foreground mb-2">الشروط والأحكام</h1>
            <p className="text-sm text-muted-foreground mb-10">آخر تحديث: مارس 2026</p>

            <section className="space-y-8 text-sm text-muted-foreground leading-relaxed">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">1. القبول</h2>
                <p>باستخدامك لخدمة ConsultX، فإنك توافق على هذه الشروط. إذا كنت لا توافق على أي بند، يرجى التوقف عن استخدام الخدمة.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">2. وصف الخدمة</h2>
                <p>ConsultX منصة استشارات هندسية للحماية من الحرائق مدعومة بالذكاء الاصطناعي، تقدم إجابات مرجعية من كود البناء السعودي ومعايير NFPA. الخدمة للاستخدام المعلوماتي المساعد ولا تحل محل المهندس المرخص أو المسؤولية القانونية الرسمية.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">3. تسجيل الحساب</h2>
                <p>يجب تقديم بريد إلكتروني صحيح. أنت مسؤول عن سرية بيانات دخولك. يجب ألا تكون قد صدر بحقك حظر سابق من الخدمة.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">4. الاشتراك والفوترة</h2>
                <p>تُجدَّد الاشتراكات تلقائياً في نهاية كل فترة. يمكنك الإلغاء في أي وقت من صفحة حسابك. تسري أسعار الباقات المعروضة على المنصة وقت الاشتراك. نحتفظ بالحق في تعديل الأسعار مع إشعار مسبق.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">5. التزامات المستخدم</h2>
                <p>تلتزم بعدم استخدام الخدمة لأغراض غير قانونية، عدم محاولة اختراق أو إساءة استخدام النظام، عدم نشر محتوى الخدمة تجارياً دون إذن كتابي. الاستخدام المسموح به: الأغراض الهندسية المهنية والتعليمية.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">6. الملكية الفكرية</h2>
                <p>جميع محتويات الخدمة (واجهة، خوارزميات، شبكة المعرفة) هي ملكية حصرية لـ ConsultX. الإجابات المقدمة لك هي لاستخدامك المهني الشخصي.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">7. إخلاء المسؤولية والقيود</h2>
                <p>الخدمة مساعد هندسي — لا تحل محل الرأي الهندسي الرسمي أو قرارات الدفاع المدني. ConsultX غير مسؤول عن أي قرارات مبنية حصراً على مخرجات الخدمة دون مراجعة مهندس مختص.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">8. القانون الحاكم</h2>
                <p>تخضع هذه الشروط لقوانين المملكة العربية السعودية. أي نزاع يُحل أمام المحاكم السعودية المختصة.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">9. التعديلات</h2>
                <p>نحتفظ بالحق في تعديل هذه الشروط مع إشعار مسبق عبر البريد الإلكتروني المسجل.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">10. الإنهاء</h2>
                <p>يحق لنا إنهاء أو تعليق حسابك في حال انتهاك هذه الشروط، مع الإشعار المسبق كلما أمكن.</p>
              </div>
            </section>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-foreground mb-2">Terms & Conditions</h1>
            <p className="text-sm text-muted-foreground mb-10">Last updated: March 2026</p>

            <section className="space-y-8 text-sm text-muted-foreground leading-relaxed">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">1. Acceptance</h2>
                <p>By using ConsultX, you agree to these Terms. If you do not agree with any provision, please stop using the service.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">2. Service Description</h2>
                <p>ConsultX is an AI-powered fire safety engineering consultation platform that provides referenced answers from the Saudi Building Code and NFPA standards. The service is for informational and professional assistance purposes and does not replace a licensed engineer or official legal responsibility.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">3. Account Registration</h2>
                <p>You must provide a valid email address. You are responsible for the confidentiality of your login credentials. You must not have been previously banned from the service.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">4. Subscription & Billing</h2>
                <p>Subscriptions auto-renew at the end of each billing period. You may cancel at any time from your account page. Prices displayed on the platform at the time of subscription apply. We reserve the right to modify prices with advance notice.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">5. User Obligations</h2>
                <p>You agree not to use the service for unlawful purposes, not to attempt to breach or misuse the system, and not to republish service content commercially without written permission. Permitted use: professional and educational engineering purposes.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">6. Intellectual Property</h2>
                <p>All service content (interface, algorithms, knowledge network) is the exclusive property of ConsultX. Responses provided to you are for your personal professional use.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">7. Disclaimer & Limitations</h2>
                <p>The service is an engineering assistant — it does not replace official engineering opinion or Civil Defense decisions. ConsultX is not liable for decisions made solely based on service outputs without review by a qualified engineer.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">8. Governing Law</h2>
                <p>These Terms are governed by the laws of the Kingdom of Saudi Arabia. Any disputes shall be resolved before the competent Saudi courts.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">9. Modifications</h2>
                <p>We reserve the right to modify these Terms with advance notice via your registered email.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">10. Termination</h2>
                <p>We may terminate or suspend your account in case of violation of these Terms, with prior notice whenever possible.</p>
              </div>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
