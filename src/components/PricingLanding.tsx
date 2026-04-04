import { useNavigate } from "react-router-dom";
import { Check, ShieldCheck, CreditCard, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

/* ── Real plan definitions — must match subscription_plans DB ───────────────
 *   engineer:   9 900 halalas = 99 SAR/mo
 *   pro:        24 500 halalas = 245 SAR/mo
 *   enterprise: 34 900 halalas = 349 SAR/mo
 *
 *   Monthly billing only. Yearly billing is not currently implemented.
 *   Do NOT add a yearly toggle or yearly prices until the backend supports it.
 * ────────────────────────────────────────────────────────────────────────── */
function getPlans(isAr: boolean) {
  return [
    {
      slug: "engineer",
      name: isAr ? "مهندس" : "Engineer",
      desc: isAr
        ? "للمهندسين الأفراد ومراجعة المشاريع"
        : "For individual engineers and project reviews",
      price: 99,
      popular: false,
      features: isAr
        ? [
            "رسائل يومية غير محدودة (الوضع السريع)",
            "20 رسالة استشارية يومياً",
            "10 رسائل تحليلية يومياً",
            "قاعدة بيانات SBC 201 و SBC 801 كاملة",
            "إحالة للفقرة القانونية الدقيقة",
            "حفظ المحادثات",
          ]
        : [
            "Unlimited daily messages (Quick mode)",
            "20 Advisory messages per day",
            "10 Analysis messages per day",
            "Full SBC 201 & SBC 801 code database",
            "Exact legal clause citation",
            "Conversation history",
          ],
    },
    {
      slug: "pro",
      name: isAr ? "برو" : "Pro",
      desc: isAr
        ? "للمحترفين الذين يحتاجون وصول أعلى"
        : "For professionals who need higher access",
      price: 245,
      popular: true,
      features: isAr
        ? [
            "رسائل يومية غير محدودة (الوضع السريع)",
            "100 رسالة استشارية يومياً",
            "50 رسالة تحليلية يومياً",
            "قاعدة بيانات SBC 201 و SBC 801 كاملة",
            "إحالة للفقرة القانونية الدقيقة",
            "حفظ المحادثات",
            "تحليل مخططات (20 تحليل/شهر)",
          ]
        : [
            "Unlimited daily messages (Quick mode)",
            "100 Advisory messages per day",
            "50 Analysis messages per day",
            "Full SBC 201 & SBC 801 code database",
            "Exact legal clause citation",
            "Conversation history",
            "Plan analysis (20 analyses/month)",
          ],
    },
    {
      slug: "enterprise",
      name: isAr ? "مؤسسة" : "Enterprise",
      desc: isAr
        ? "للمكاتب الهندسية والفرق المتعددة"
        : "For engineering firms and multi-user teams",
      price: 349,
      popular: false,
      features: isAr
        ? [
            "كل مميزات باقة برو",
            "رسائل غير محدودة في جميع الأوضاع",
            "دعم فني أولوي عبر واتساب والبريد",
            "مناسب للفرق والمكاتب الهندسية",
            "استخدام مكثف بدون قيود",
            "إعداد مخصص للمؤسسة",
          ]
        : [
            "Everything in Pro",
            "Unlimited messages in all modes",
            "Priority support via WhatsApp & email",
            "Suitable for teams and engineering firms",
            "High-volume usage without limits",
            "Custom enterprise onboarding",
          ],
    },
  ];
}

/* ═══════════ MAIN COMPONENT ═══════════ */
const PricingLanding = () => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const isAr = language === "ar";

  const plans = getPlans(isAr);
  const handleCTA = () => navigate("/subscribe");

  return (
    <section id="pricing" className="py-16 md:py-24 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            {t("pricingTitle")}
          </h2>
          <p className="text-muted-foreground mb-6">{t("pricingSubtitle")}</p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.slug}
              className="relative p-6 rounded-2xl flex flex-col"
              style={
                plan.popular
                  ? {
                      background: "rgba(0,212,255,0.04)",
                      border: "1px solid rgba(0,212,255,0.35)",
                      boxShadow:
                        "0 0 40px rgba(0,212,255,0.1), 0 0 80px rgba(0,212,255,0.05)",
                    }
                  : {
                      background: "rgba(10,15,28,0.5)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }
              }
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap"
                    style={{
                      background: "linear-gradient(135deg,#00D4FF,#0099CC)",
                      color: "#0a0f1a",
                    }}
                  >
                    {t("mostPopular")}
                  </span>
                </div>
              )}

              <h3 className="text-lg font-bold text-foreground mb-1">{plan.name}</h3>
              <p className="text-xs text-muted-foreground mb-5">{plan.desc}</p>

              <div className="mb-6">
                <span className="text-3xl font-black text-foreground">{plan.price}</span>
                <span className="text-sm text-muted-foreground ms-1">{t("perMonth")}</span>
              </div>

              <ul className="flex flex-col gap-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <Check
                      className="w-4 h-4 text-primary flex-shrink-0 mt-0.5"
                      strokeWidth={2}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={handleCTA}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={
                  plan.popular
                    ? {
                        background: "linear-gradient(135deg,#00D4FF,#0099CC)",
                        color: "#0a0f1a",
                        boxShadow: "0 0 20px rgba(0,212,255,0.3)",
                      }
                    : {
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "var(--foreground)",
                      }
                }
              >
                {t("startFreeTrial")}
              </button>
            </div>
          ))}
        </div>

        {/* 7-Day Trial Callout */}
        <div
          className="p-5 rounded-2xl text-center mb-6"
          style={{
            background: "rgba(0,212,255,0.03)",
            border: "1px solid rgba(0,212,255,0.12)",
          }}
        >
          <p className="text-sm font-semibold text-foreground mb-1">
            {t("trialExplanation")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("afterTrialExplanation")}
          </p>
        </div>

        {/* Trust Footer */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-4">
          {[
            {
              icon: ShieldCheck,
              text: isAr ? "بيانات مشفرة" : "Encrypted data",
            },
            {
              icon: RefreshCw,
              text: isAr ? "إلغاء في أي وقت" : "Cancel anytime",
            },
            {
              icon: CreditCard,
              text: isAr ? "ضمان استرداد 14 يوماً" : "14-day money-back",
            },
          ].map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Icon className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
              {text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingLanding;
