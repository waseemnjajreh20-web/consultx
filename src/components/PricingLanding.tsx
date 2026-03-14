import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Compass, HardHat, Building, Check, X, ChevronDown,
  ShieldCheck, CreditCard, RefreshCw, Building2, Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ─────────────── types ─────────────── */
interface Feature {
  text: string;
  included: boolean;
  value?: string;
}

/* ─────────────── data ─────────────── */
const explorerFeatures: Feature[] = [
  { text: "الوضع الرئيسي — 10 رسائل/يوم", included: true },
  { text: "3 وكلاء ذكيين", included: true },
  { text: "GraphRAG أساسي", included: true },
  { text: "الوضع الاستشاري", included: false },
  { text: "الوضع التحليلي", included: false },
  { text: "السند القانوني (رقم الصفحة)", included: false },
  { text: "تصدير التقارير", included: false },
  { text: "حفظ المحادثات: 7 أيام", included: true },
];

const engineerFeatures: Feature[] = [
  { text: "الوضع الرئيسي — غير محدود", included: true },
  { text: "الوضع الاستشاري — 50 استشارة/شهر", included: true },
  { text: "الوضع التحليلي — 10 مخططات/شهر", included: true },
  { text: "جميع الـ 12 وكيل ذكي", included: true },
  { text: "GraphRAG كامل", included: true },
  { text: "السند القانوني (رقم الصفحة والسكشن)", included: true },
  { text: "تصدير PDF", included: true },
  { text: "حفظ المحادثات: 90 يوم", included: true },
  { text: "دعم بريد إلكتروني", included: true },
];

const enterpriseFeatures: Feature[] = [
  { text: "كل مميزات «مهندس» بالإضافة إلى:", included: true },
  { text: "جميع الأوضاع — غير محدود", included: true },
  { text: "وكلاء مخصصين حسب المشروع", included: true },
  { text: "GraphRAG كامل + أولوية المعالجة", included: true },
  { text: "تصدير PDF + Word + Excel", included: true },
  { text: "حتى 10 مستخدمين", included: true },
  { text: "حفظ محادثات غير محدود", included: true },
  { text: "دعم أولوية + واتساب", included: true },
  { text: "API للربط مع أنظمتكم", included: true },
];

const comparisonRows = [
  { label: "الوضع الرئيسي", explorer: "10/يوم", engineer: "غير محدود", enterprise: "غير محدود" },
  { label: "الوضع الاستشاري", explorer: false, engineer: "50/شهر", enterprise: "غير محدود" },
  { label: "الوضع التحليلي", explorer: false, engineer: "10/شهر", enterprise: "غير محدود" },
  { label: "عدد الوكلاء", explorer: "3", engineer: "12", enterprise: "12+" },
  { label: "GraphRAG", explorer: "أساسي", engineer: "كامل", enterprise: "كامل + أولوية" },
  { label: "السند القانوني", explorer: false, engineer: true, enterprise: true },
  { label: "تصدير التقارير", explorer: false, engineer: "PDF", enterprise: "PDF / Word / Excel" },
  { label: "حفظ المحادثات", explorer: "7 أيام", engineer: "90 يوم", enterprise: "غير محدود" },
  { label: "المستخدمون", explorer: "1", engineer: "1", enterprise: "حتى 10" },
  { label: "الدعم الفني", explorer: false, engineer: "بريد إلكتروني", enterprise: "أولوية + واتساب" },
  { label: "API", explorer: false, engineer: false, enterprise: true },
];

/* ─────────────── helpers ─────────────── */
function TableCell({ val }: { val: boolean | string | undefined }) {
  if (val === true) return <Check size={16} strokeWidth={1.5} className="mx-auto" style={{ color: "hsl(195 85% 50%)" }} />;
  if (val === false) return <X size={16} strokeWidth={1.5} className="mx-auto" style={{ color: "hsl(220 25% 35%)" }} />;
  return <span className="text-xs" style={{ color: "hsl(200 20% 75%)" }}>{val}</span>;
}

/* animated number transition */
function AnimatedPrice({ value }: { value: string }) {
  const [displayed, setDisplayed] = useState(value);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    setFade(true);
    const t = setTimeout(() => {
      setDisplayed(value);
      setFade(false);
    }, 150);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span
      style={{
        transition: "opacity 0.15s ease, transform 0.15s ease",
        opacity: fade ? 0 : 1,
        transform: fade ? "translateY(-6px)" : "translateY(0)",
        display: "inline-block",
      }}
    >
      {displayed}
    </span>
  );
}

/* ─────────────── main component ─────────────── */
const PricingLanding = () => {
  const [annual, setAnnual] = useState(true);
  const [tableOpen, setTableOpen] = useState(false);
  const [engineerLoading, setEngineerLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  /* card styles */
  const cardBase: React.CSSProperties = {
    background: "rgba(17, 24, 39, 0.6)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    borderRadius: "16px",
    transition: "all 0.3s ease",
  };

  const explorerCard: React.CSSProperties = {
    ...cardBase,
    border: "1px solid rgba(255,255,255,0.08)",
  };

  const engineerCard: React.CSSProperties = {
    ...cardBase,
    border: "2px solid rgba(0,212,255,0.5)",
    boxShadow: "0 0 40px rgba(0,212,255,0.12), 0 0 80px rgba(0,212,255,0.06)",
    transform: "scale(1.03)",
  };

  const enterpriseCard: React.CSSProperties = {
    ...cardBase,
    border: "1px solid rgba(255,140,0,0.3)",
  };

  const cyanColor = "hsl(195 85% 50%)";
  const amberColor = "#FF8C00";

  const { dir } = useLanguage();

  const handleEngineerSubscribe = async () => {
    setEngineerLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate(`/auth?redirect=subscribe&plan=engineer&billing=${annual ? "annual" : "monthly"}`);
        return;
      }
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: "engineer", billing_cycle: annual ? "annual" : "monthly" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.checkout_url) {
        toast({ title: "خطأ في الدفع", description: error?.message || "حاول مرة أخرى", variant: "destructive" });
        return;
      }
      window.location.href = data.checkout_url;
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "حدث خطأ غير متوقع", variant: "destructive" });
    } finally {
      setEngineerLoading(false);
    }
  };


  return (
    <section
      id="pricing-section"
      className="w-full max-w-6xl mx-auto px-4 py-16"
      dir={dir}
    >
      {/* Section title */}
      <div className="text-center mb-12 animate-fade-in">
        <h2
          className="text-3xl md:text-4xl font-bold mb-3"
          style={{
            background: "linear-gradient(135deg, hsl(195 85% 50%), #ffffff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          اختر خطتك المناسبة
        </h2>
        <p style={{ color: "rgba(200,220,240,0.65)" }} className="text-lg">
          ابدأ مجاناً. ارتقِ عندما تحتاج.
        </p>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-center gap-4 mb-10">
        <span
          className="text-sm font-medium"
          style={{ color: !annual ? cyanColor : "rgba(200,220,240,0.55)" }}
        >
          شهري
        </span>
        <Switch
          checked={annual}
          onCheckedChange={setAnnual}
          className="data-[state=checked]:bg-primary"
        />
        <span
          className="text-sm font-medium"
          style={{ color: annual ? cyanColor : "rgba(200,220,240,0.55)" }}
        >
          سنوي
        </span>
        {annual && (
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full animate-fade-in"
            style={{
              background: "rgba(255,140,0,0.15)",
              border: "1px solid rgba(255,140,0,0.4)",
              color: amberColor,
              boxShadow: "0 0 12px rgba(255,140,0,0.15)",
            }}
          >
            وفّر حتى 33%
          </span>
        )}
      </div>

      {/* Cards grid — on mobile: engineer card first, then explorer, then enterprise */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-stretch">

        {/* ── Mobile: مهندس FIRST ── Desktop: normal order ── */}

        {/* ── Card 2: مهندس (popular) — shown first on mobile ── */}
        <div
          style={engineerCard}
          className="pricing-popular-card p-6 flex flex-col relative order-first md:order-none"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "scale(1.03) translateY(-4px)";
            (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 60px rgba(0,212,255,0.22), 0 0 100px rgba(0,212,255,0.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "scale(1.03)";
            (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 40px rgba(0,212,255,0.12), 0 0 80px rgba(0,212,255,0.06)";
          }}
        >
          {/* popular badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap z-10">
            <span
              className="text-xs font-semibold px-4 py-1.5 rounded-full"
              style={{
                background: cyanColor,
                color: "hsl(220 40% 6%)",
              }}
            >
              الأكثر شعبية
            </span>
          </div>

          {/* promo ribbon */}
          <div
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full mb-4 mt-3 self-start"
            style={{
              background: "rgba(255,140,0,0.12)",
              border: "1px solid rgba(255,140,0,0.35)",
              color: amberColor,
            }}
          >
            <Building2 size={12} strokeWidth={1.5} />
            <span>تجربة 3 أيام مجاناً للبريد المؤسسي</span>
          </div>

          {/* icon */}
          <div
            className="mb-4 flex items-center justify-center w-16 h-16 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(0,212,255,0.15) 0%, transparent 70%)" }}
          >
            <HardHat size={32} strokeWidth={1.5} style={{ color: cyanColor }} />
          </div>

          <h3 className="text-xl font-bold text-foreground mb-1">مهندس</h3>
          <p className="text-sm mb-4" style={{ color: "rgba(200,220,240,0.5)" }}>
            للمهندس الاستشاري المتخصص
          </p>

          {/* price */}
          <div className="mb-6">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-4xl font-bold text-foreground">
                <AnimatedPrice value={annual ? "99" : "149"} />
              </span>
              <span className="text-lg font-medium" style={{ color: "rgba(200,220,240,0.6)" }}>
                ر.س/شهر
              </span>
              {annual && (
                <span
                  className="text-sm line-through"
                  style={{ color: "rgba(200,220,240,0.35)" }}
                >
                  149 ر.س
                </span>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: "rgba(200,220,240,0.4)" }}>
              {annual ? "~$26 USD" : "~$39 USD"}
            </p>
          </div>

          {/* features */}
          <ul className="space-y-2.5 flex-1 mb-6">
            {engineerFeatures.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" style={{ color: cyanColor }} />
                <span style={{ color: "hsl(200 20% 80%)" }}>{f.text}</span>
              </li>
            ))}
          </ul>


          <button
            onClick={handleEngineerSubscribe}
            disabled={engineerLoading}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            style={{
              background: cyanColor,
              color: "hsl(220 40% 6%)",
              boxShadow: "0 0 20px rgba(0,212,255,0.3)",
              minHeight: "48px",
            }}
            onMouseEnter={(e) => {
              if (!engineerLoading) (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 35px rgba(0,212,255,0.5)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 20px rgba(0,212,255,0.3)";
            }}
          >
            {engineerLoading ? (
              <><Loader2 size={15} strokeWidth={1.5} className="animate-spin" /> جارٍ التحميل...</>
            ) : "ابدأ تجربة مجانية"}
          </button>
        </div>

        {/* ── Card 1: مستكشف ── */}
        <div
          style={explorerCard}
          className="p-6 flex flex-col group"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,212,255,0.25)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
          }}
        >
          {/* icon */}
          <div
            className="mb-4 flex items-center justify-center w-16 h-16 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(0,212,255,0.15) 0%, transparent 70%)" }}
          >
            <Compass size={32} strokeWidth={1.5} style={{ color: cyanColor }} />
          </div>

          <h3 className="text-xl font-bold text-foreground mb-1">مستكشف</h3>
          <p className="text-sm mb-4" style={{ color: "rgba(200,220,240,0.5)" }}>
            للتعرف على ConsultX
          </p>

          {/* price */}
          <div className="mb-6">
            <span className="text-4xl font-bold text-foreground">مجاناً</span>
          </div>

          {/* features */}
          <ul className="space-y-2.5 flex-1 mb-6">
            {explorerFeatures.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {f.included
                  ? <Check size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" style={{ color: cyanColor }} />
                  : <X size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" style={{ color: "hsl(220 25% 35%)" }} />
                }
                <span style={{ color: f.included ? "hsl(200 20% 80%)" : "hsl(200 15% 40%)" }}>
                  {f.text}
                </span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => navigate("/auth")}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-300"
            style={{
              border: `1.5px solid ${cyanColor}`,
              color: cyanColor,
              background: "transparent",
              minHeight: "48px",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,255,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            ابدأ مجاناً
          </button>
        </div>

        {/* ── Card 3: مؤسسة ── */}
        <div
          style={enterpriseCard}
          className="p-6 flex flex-col"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,140,0,0.55)";
            (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 30px rgba(255,140,0,0.12)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,140,0,0.3)";
            (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
          }}
        >
          {/* للفرق badge */}
          <div className="mb-3 self-start">
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{
                background: "rgba(255,140,0,0.12)",
                border: "1px solid rgba(255,140,0,0.35)",
                color: amberColor,
              }}
            >
              للفرق
            </span>
          </div>

          {/* icon */}
          <div
            className="mb-4 flex items-center justify-center w-16 h-16 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,140,0,0.15) 0%, transparent 70%)" }}
          >
            <Building size={32} strokeWidth={1.5} style={{ color: amberColor }} />
          </div>

          <h3 className="text-xl font-bold text-foreground mb-1">مؤسسة</h3>
          <p className="text-sm mb-4" style={{ color: "rgba(200,220,240,0.5)" }}>
            للمكاتب الاستشارية والمقاولين
          </p>

          {/* price */}
          <div className="mb-6">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-4xl font-bold text-foreground">
                <AnimatedPrice value={annual ? "349" : "499"} />
              </span>
              <span className="text-lg font-medium" style={{ color: "rgba(200,220,240,0.6)" }}>
                ر.س/شهر
              </span>
              {annual && (
                <span
                  className="text-sm line-through"
                  style={{ color: "rgba(200,220,240,0.35)" }}
                >
                  499 ر.س
                </span>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: "rgba(200,220,240,0.4)" }}>
              {annual ? "~$90 USD" : "~$129 USD"}
            </p>
          </div>

          {/* features */}
          <ul className="space-y-2.5 flex-1 mb-6">
            {enterpriseFeatures.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" style={{ color: amberColor }} />
                <span style={{ color: "hsl(200 20% 80%)" }}>{f.text}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => window.location.href = "mailto:njajrehwaseem@gmail.com?subject=استفسار عن باقة مؤسسة — ConsultX"}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-300"
            style={{
              border: `1.5px solid ${amberColor}`,
              color: amberColor,
              background: "transparent",
              minHeight: "48px",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,140,0,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            تواصل معنا
          </button>
        </div>
      </div>

      {/* ── Comparison table ── */}
      <div className="mt-8 md:mt-10">
        <button
          onClick={() => setTableOpen((o) => !o)}
          className="flex items-center gap-2 mx-auto text-sm font-medium transition-all duration-300"
          style={{ color: "rgba(200,220,240,0.6)", minHeight: "44px" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = cyanColor;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,220,240,0.6)";
          }}
        >
          قارن جميع المميزات
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            style={{
              transition: "transform 0.3s ease",
              transform: tableOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>

        <div
          style={{
            maxHeight: tableOpen ? "900px" : "0",
            overflow: "hidden",
            transition: "max-height 0.4s ease",
          }}
        >
          <div className="comparison-table-wrapper mt-6 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,212,255,0.1)" }}>
            <table className="comparison-table w-full text-sm" dir={dir} style={{ minWidth: "420px" }}>
              <thead>
                <tr style={{ background: "rgba(0,212,255,0.08)" }}>
                  <th
                    className="text-right py-3 px-4 font-semibold"
                    style={{ color: cyanColor, borderBottom: "1px solid rgba(0,212,255,0.15)" }}
                  >
                    الميزة
                  </th>
                  {["مستكشف", "مهندس", "مؤسسة"].map((h) => (
                    <th
                      key={h}
                      className="text-center py-3 px-4 font-semibold"
                      style={{ color: cyanColor, borderBottom: "1px solid rgba(0,212,255,0.15)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      background: i % 2 === 0 ? "rgba(17,24,39,0.4)" : "rgba(17,24,39,0.2)",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <td className="py-2.5 px-4" style={{ color: "hsl(200 20% 75%)" }}>
                      {row.label}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <TableCell val={row.explorer} />
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <TableCell val={row.engineer} />
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <TableCell val={row.enterprise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Trust elements ── */}
      <div className="mt-10 flex flex-col items-center gap-6">
        <div className="flex flex-wrap justify-center gap-6">
          {[
            { Icon: ShieldCheck, label: "بيانات مشفرة", color: cyanColor },
            { Icon: CreditCard, label: "إلغاء في أي وقت", color: cyanColor },
            { Icon: RefreshCw, label: "ضمان استرداد 14 يوم", color: cyanColor },
          ].map(({ Icon, label, color }) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <Icon size={16} strokeWidth={1.5} style={{ color }} />
              <span style={{ color: "rgba(200,220,240,0.6)" }}>{label}</span>
            </div>
          ))}
        </div>

        <div
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl"
          style={{
            background: "rgba(255,140,0,0.08)",
            border: "1px solid rgba(255,140,0,0.2)",
            color: amberColor,
          }}
        >
          <Building2 size={14} strokeWidth={1.5} />
          <span>بريد مؤسسي؟ جرّب باقة مهندس 3 أيام مجاناً</span>
        </div>

        <p className="text-xs text-center" style={{ color: "rgba(200,220,240,0.35)" }}>
          جميع الباقات تشمل تجربة مجانية لمدة 7 أيام. بدون بطاقة ائتمان.
        </p>
      </div>
    </section>
  );
};

export default PricingLanding;
