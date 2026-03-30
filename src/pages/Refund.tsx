import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useLanguage } from "@/hooks/useLanguage";

export default function Refund() {
  const { language } = useLanguage();
  const isAr = language === "ar";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-20 w-full">
        {isAr ? (
          <>
            <h1 className="text-3xl font-bold text-foreground mb-2">سياسة الاسترداد</h1>
            <p className="text-sm text-muted-foreground mb-10">آخر تحديث: مارس 2026</p>

            <section className="space-y-8 text-sm text-muted-foreground leading-relaxed">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">1. التجربة المجانية لـ 3 أيام</h2>
                <p>كل مستخدم جديد يحصل تلقائياً على 3 أيام وصول كامل مجاناً — بدون بطاقة بنكية. التجربة لا تستوجب أي دفع.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">2. إلغاء الاشتراك</h2>
                <p>يمكنك إلغاء اشتراكك في أي وقت من صفحة حسابك. بعد الإلغاء، يستمر وصولك حتى نهاية فترة الاشتراك المدفوعة — لا يوجد خصم جزئي عند الإلغاء المبكر.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">3. أهلية الاسترداد</h2>
                <p>يحق لك المطالبة باسترداد كامل إذا:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>طلبت الاسترداد خلال 14 يوماً من أول دفعة</li>
                  <li>واجهت عطلاً تقنياً موثقاً منعك من استخدام الخدمة</li>
                </ul>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">4. عملية الاسترداد</h2>
                <p>يُعالَج الاسترداد خلال 5–10 أيام عمل من موافقتنا على الطلب. يُرسَّل المبلغ لنفس وسيلة الدفع الأصلية.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">5. البنود غير القابلة للاسترداد</h2>
                <p>لا يُسترَد: رسوم الفترات السابقة المستهلكة بالكامل، رسوم التجديد التلقائي بعد إشعار التجديد بـ 24 ساعة أو أكثر.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">6. كيفية طلب الاسترداد</h2>
                <p>تواصل معنا عبر <a href="/contact" className="text-primary hover:underline">صفحة التواصل</a> مع ذكر: اسمك، البريد الإلكتروني المسجل، وسبب الطلب. سنرد خلال 24 ساعة في أيام العمل.</p>
              </div>
            </section>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-foreground mb-2">Refund Policy</h1>
            <p className="text-sm text-muted-foreground mb-10">Last updated: March 2026</p>

            <section className="space-y-8 text-sm text-muted-foreground leading-relaxed">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">1. 3-Day Free Trial</h2>
                <p>Every new user automatically receives 3 days of full access for free — no credit card required. The trial requires no payment.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">2. Subscription Cancellation</h2>
                <p>You may cancel your subscription at any time from your account page. After cancellation, your access continues until the end of your paid billing period — no partial refunds for early cancellation.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">3. Refund Eligibility</h2>
                <p>You are eligible for a full refund if:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>You request the refund within 14 days of your first payment</li>
                  <li>You experienced a documented technical outage that prevented you from using the service</li>
                </ul>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">4. Refund Process</h2>
                <p>Refunds are processed within 5–10 business days from our approval. The amount is returned to the original payment method.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">5. Non-Refundable Items</h2>
                <p>The following are not refundable: fees for fully consumed previous periods; auto-renewal fees after 24 or more hours of renewal notification.</p>
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">6. How to Request a Refund</h2>
                <p>Contact us via the <a href="/contact" className="text-primary hover:underline">Contact page</a> with: your name, registered email, and reason for the request. We will respond within 24 hours on business days.</p>
              </div>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
