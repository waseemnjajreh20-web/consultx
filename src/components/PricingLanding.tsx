import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, ShieldCheck, CreditCard, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

/* ── Plan definitions ── */
const MONTHLY_PRICES = { starter: 99, pro: 249, team: 699 };
const YEARLY_PRICES = { starter: 990, pro: 2490, team: 6990 };

/* ── Comparison table rows ── */
function getComparisonRows(isAr: boolean) {
  return [
    {
      feature: isAr ? "الاستشارات النصية" : "Text consultations",
      starter: isAr ? "محدود" : "Limited",
      pro: isAr ? "غير محدود" : "Unlimited",
      team: isAr ? "غير محدود" : "Unlimited",
    },
    {
      feature: isAr ? "تحليل المخططات" : "Plan analysis",
      starter: false,
      pro: isAr ? "10/شهر" : "10/month",
      team: isAr ? "غير محدود" : "Unlimited",
    },
    {
      feature: isAr ? "أوضاع الاستشارة الثلاثة" : "Three consultation modes",
      starter: isAr ? "واحد فقط" : "One only",
      pro: true,
      team: true,
    },
    {
      feature: isAr ? "تصدير PDF" : "PDF export",
      starter: false,
      pro: true,
      team: true,
    },
    {
      feature: isAr ? "عدد المستخدمين" : "Users",
      starter: "1",
      pro: "1",
      team: isAr ? "حتى 10" : "Up to 10",
    },
    {
      feature: isAr ? "حفظ المحادثات" : "Chat history",
      starter: isAr ? "7 أيام" : "7 days",
      pro: isAr ? "90 يوم" : "90 days",
      team: isAr ? "غير محدود" : "Unlimited",
    },
    {
      feature: isAr ? "الدعم" : "Support",
      starter: isAr ? "بريد إلكتروني" : "Email",
      pro: isAr ? "بريد أولوية" : "Priority email",
      team: isAr ? "واتساب + أولوية" : "WhatsApp + priority",
    },
    {
      feature: isAr ? "API للربط" : "API access",
      starter: false,
      pro: false,
      team: true,
    },
  ];
}

/* ── Plan feature lists ── */
function getStarterFeatures(isAr: boolean) {
  return [
    isAr ? "استشارات نصية محدودة يومياً" : "Limited daily text consultations",
    isAr ? "أكواد SBC وNFPA" : "SBC & NFPA codes",
    isAr ? "إحالة للفقرة الدقيقة" : "Exact code clause citation",
    isAr ? "تصدير النتائج نصياً" : "Text export",
    isAr ? "حفظ المحادثات 7 أيام" : "7-day chat history",
  ];
}

function getProFeatures(isAr: boolean) {
  return [
    isAr ? "استشارات غير محدودة" : "Unlimited consultations",
    isAr ? "الأوضاع الثلاثة (رئيسي، استشاري، تحليلي)" : "All 3 modes (Quick, Advisory, Analysis)",
    isAr ? "تحليل المخططات — 10 مخططات/شهر" : "Plan analysis — 10 drawings/month",
    isAr ? "تصدير PDF كامل" : "Full PDF export",
    isAr ? "حفظ المحادثات 90 يوماً" : "90-day chat history",
    isAr ? "دعم بريد إلكتروني أولوية" : "Priority email support",
  ];
}

function getTeamFeatures(isAr: boolean) {
  return [
    isAr ? "كل مميزات Pro" : "Everything in Pro",
    isAr ? "مخططات غير محدودة" : "Unlimited plan analysis",
    isAr ? "حتى 10 مستخدمين" : "Up to 10 users",
    isAr ? "حفظ محادثات غير محدود" : "Unlimited chat history",
    isAr ? "واتساب + دعم أولوية" : "WhatsApp + priority support",
    isAr ? "API للربط مع أنظمتكم" : "API integration",
  ];
}

/* ── Cell renderer for comparison table ── */
function ComparisonCell({ value }: { value: boolean | string }) {
  if (value === true)
    return <Check className="w-4 h-4 text-primary mx-auto" strokeWidth={2.5} />;
  if (value === false)
    return <span className="text-muted-foreground/40 text-xs mx-auto block text-center">—</span>;
  return <span className="text-xs text-muted-foreground text-center block">{value}</span>;
}

/* ═══════════ MAIN COMPONENT ═══════════ */
const PricingLanding = () => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const isAr = language === "ar";

  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [tableOpen, setTableOpen] = useState(false);

  const prices = billing === "monthly" ? MONTHLY_PRICES : YEARLY_PRICES;
  const period = billing === "monthly" ? t("perMonth") : t("perYear");

  const starterFeatures = getStarterFeatures(isAr);
  const proFeatures = getProFeatures(isAr);
  const teamFeatures = getTeamFeatures(isAr);
  const rows = getComparisonRows(isAr);

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

          {/* Monthly / Yearly toggle */}
          <div
            className="inline-flex items-center gap-1 p-1 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {(["monthly", "yearly"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                className="relative px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={
                  billing === b
                    ? {
                        background: "rgba(0,212,255,0.12)",
                        border: "1px solid rgba(0,212,255,0.3)",
                        color: "#00D4FF",
                      }
                    : { color: "var(--muted-foreground)" }
                }
              >
                {b === "monthly" ? t("monthlyLabel") : t("yearlyLabel")}
                {b === "yearly" && (
                  <span
                    className="absolute -top-2 -end-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: "rgba(0,212,255,0.15)",
                      border: "1px solid rgba(0,212,255,0.3)",
                      color: "#00D4FF",
                    }}
                  >
                    {t("savingsLabel")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Three Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {/* Starter */}
          <div
            className="p-6 rounded-2xl flex flex-col"
            style={{
              background: "rgba(10,15,28,0.5)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <h3 className="text-lg font-bold text-foreground mb-1">
              {t("planStarterName")}
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              {t("planStarterDesc")}
            </p>
            <div className="mb-6">
              <span className="text-3xl font-black text-foreground">
                {prices.starter}
              </span>
              <span className="text-sm text-muted-foreground ms-1">{period}</span>
            </div>
            <ul className="flex flex-col gap-2.5 flex-1 mb-6">
              {starterFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" strokeWidth={2} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={handleCTA}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-80"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "var(--foreground)",
              }}
            >
              {t("startFreeTrial")}
            </button>
          </div>

          {/* Pro — emphasized */}
          <div
            className="relative p-6 rounded-2xl flex flex-col"
            style={{
              background: "rgba(0,212,255,0.04)",
              border: "1px solid rgba(0,212,255,0.35)",
              boxShadow:
                "0 0 40px rgba(0,212,255,0.1), 0 0 80px rgba(0,212,255,0.05)",
            }}
          >
            {/* Most Popular badge */}
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

            <h3 className="text-lg font-bold text-foreground mb-1">
              {t("planProName")}
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              {t("planProDesc")}
            </p>
            <div className="mb-6">
              <span className="text-3xl font-black text-foreground">
                {prices.pro}
              </span>
              <span className="text-sm text-muted-foreground ms-1">{period}</span>
            </div>
            <ul className="flex flex-col gap-2.5 flex-1 mb-6">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground/80">
                  <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" strokeWidth={2} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={handleCTA}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg,#00D4FF,#0099CC)",
                color: "#0a0f1a",
                boxShadow: "0 0 20px rgba(0,212,255,0.3)",
              }}
            >
              {t("startFreeTrial")}
            </button>
          </div>

          {/* Team */}
          <div
            className="p-6 rounded-2xl flex flex-col"
            style={{
              background: "rgba(10,15,28,0.5)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <h3 className="text-lg font-bold text-foreground mb-1">
              {t("planTeamName")}
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              {t("planTeamDesc")}
            </p>
            <div className="mb-6">
              <span className="text-3xl font-black text-foreground">
                {prices.team}
              </span>
              <span className="text-sm text-muted-foreground ms-1">{period}</span>
            </div>
            <ul className="flex flex-col gap-2.5 flex-1 mb-6">
              {teamFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" strokeWidth={2} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={handleCTA}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-80"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "var(--foreground)",
              }}
            >
              {t("startFreeTrial")}
            </button>
          </div>
        </div>

        {/* 3-Day Trial Callout */}
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

        {/* Comparison Table (collapsible) */}
        <div className="mb-8">
          <button
            onClick={() => setTableOpen(!tableOpen)}
            className="flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{t("comparisonToggle")}</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-300 ${tableOpen ? "rotate-180" : ""}`}
            />
          </button>

          {tableOpen && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <th className="text-start py-3 pe-4 text-muted-foreground font-medium">
                      {isAr ? "الميزة" : "Feature"}
                    </th>
                    <th className="text-center py-3 px-2 text-foreground font-semibold">
                      {t("planStarterName")}
                    </th>
                    <th
                      className="text-center py-3 px-2 font-semibold"
                      style={{ color: "#00D4FF" }}
                    >
                      {t("planProName")}
                    </th>
                    <th className="text-center py-3 px-2 text-foreground font-semibold">
                      {t("planTeamName")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <td className="py-3 pe-4 text-muted-foreground text-xs">
                        {row.feature}
                      </td>
                      <td className="py-3 px-2">
                        <ComparisonCell value={row.starter} />
                      </td>
                      <td className="py-3 px-2">
                        <ComparisonCell value={row.pro} />
                      </td>
                      <td className="py-3 px-2">
                        <ComparisonCell value={row.team} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
