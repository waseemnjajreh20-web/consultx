import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Compass, HardHat, Building, Check, X, ChevronDown,
  ShieldCheck, CreditCard, RefreshCw, Building2, Loader2,
} from "lucide-react";
// Switch removed — single monthly price display
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ─────────────── types ─────────────── */
interface Feature {
  text: string;
  included: boolean;
  value?: string;
}

/* ─────────────── data (language-aware, built inside component) ─────────────── */
function getExplorerFeatures(isAr: boolean): Feature[] {
  return [
    { text: isAr ? "الوضع الرئيسي — 10 إجابات/يوم" : "Primary Mode — 10 answers/day", included: true },
    { text: isAr ? "أسئلة سريعة عن SBC وNFPA" : "Quick SBC & NFPA questions", included: true },
    { text: isAr ? "GraphRAG أساسي" : "Basic GraphRAG", included: true },
    { text: isAr ? "الوضع الاستشاري (مقيّد)" : "Advisory Mode (restricted)", included: false },
    { text: isAr ? "الوضع التحليلي (مقيّد)" : "Analysis Mode (restricted)", included: false },
    { text: isAr ? "السند القانوني + رقم الصفحة" : "Legal reference + page number", included: false },
    { text: isAr ? "تصدير PDF" : "PDF export", included: false },
    { text: isAr ? "حفظ المحادثات: 7 أيام" : "Chat history: 7 days", included: true },
  ];
}

function getEngineerFeatures(isAr: boolean): Feature[] {
  return [
    { text: isAr ? "الوضع الرئيسي — غير محدود" : "Primary Mode — Unlimited", included: true },
    { text: isAr ? "الوضع الاستشاري — 50 استشارة/شهر مع اقتباس + سند" : "Advisory Mode — 50/month with clause + reference", included: true },
    { text: isAr ? "الوضع التحليلي — 10 مخططات/شهر مع تحليل كامل" : "Analysis Mode — 10 plans/month with full analysis", included: true },
    { text: isAr ? "جميع الـ 12 وكيل ذكي + أوركسترا" : "All 12 AI agents + orchestrator", included: true },
    { text: isAr ? "GraphRAG كامل — روابط الكود المعقدة" : "Full GraphRAG — complex code cross-links", included: true },
    { text: isAr ? "السند القانوني الدقيق (صفحة + سكشن + اشتقاق)" : "Precise legal reference (page + section + derivation)", included: true },
    { text: isAr ? "تصدير PDF بالهوية المهنية" : "PDF export with professional branding", included: true },
    { text: isAr ? "حفظ المحادثات: 90 يوماً" : "Chat history: 90 days", included: true },
    { text: isAr ? "دعم بريد إلكتروني" : "Email support", included: true },
  ];
}

function getEnterpriseFeatures(isAr: boolean): Feature[] {
  return [
    { text: isAr ? "كل مميزات «مهندس» بالإضافة إلى:" : "All Engineer features plus:", included: true },
    { text: isAr ? "جميع الأوضاع — غير محدود" : "All modes — Unlimited", included: true },
    { text: isAr ? "وكلاء مخصصين حسب المشروع" : "Custom agents per project", included: true },
    { text: isAr ? "GraphRAG كامل + أولوية المعالجة" : "Full GraphRAG + priority processing", included: true },
    { text: isAr ? "تصدير PDF + Word + Excel" : "PDF + Word + Excel export", included: true },
    { text: isAr ? "حتى 10 مستخدمين" : "Up to 10 users", included: true },
    { text: isAr ? "حفظ محادثات غير محدود" : "Unlimited chat history", included: true },
    { text: isAr ? "دعم أولوية + واتساب" : "Priority + WhatsApp support", included: true },
    { text: isAr ? "API للربط مع أنظمتكم" : "API integration with your systems", included: true },
  ];
}

function getComparisonRows(isAr: boolean) {
  return [
    { label: isAr ? "الوضع الرئيسي" : "Main Mode", explorer: isAr ? "10/يوم" : "10/day", engineer: isAr ? "غير محدود" : "Unlimited", enterprise: isAr ? "غير محدود" : "Unlimited" },
    { label: isAr ? "الوضع الاستشاري" : "Advisory Mode", explorer: false, engineer: isAr ? "50/شهر" : "50/month", enterprise: isAr ? "غير محدود" : "Unlimited" },
    { label: isAr ? "الوضع التحليلي" : "Analysis Mode", explorer: false, engineer: isAr ? "10/شهر" : "10/month", enterprise: isAr ? "غير محدود" : "Unlimited" },
    { label: isAr ? "عدد الوكلاء" : "AI Agents", explorer: "3", engineer: "12", enterprise: "12+" },
    { label: "GraphRAG", explorer: isAr ? "أساسي" : "Basic", engineer: isAr ? "كامل" : "Full", enterprise: isAr ? "كامل + أولوية" : "Full + priority" },
    { label: isAr ? "السند القانوني" : "Legal Reference", explorer: false, engineer: true, enterprise: true },
    { label: isAr ? "تصدير التقارير" : "Report Export", explorer: false, engineer: "PDF", enterprise: "PDF / Word / Excel" },
    { label: isAr ? "حفظ المحادثات" : "Chat History", explorer: isAr ? "7 أيام" : "7 days", engineer: isAr ? "90 يوم" : "90 days", enterprise: isAr ? "غير محدود" : "Unlimited" },
    { label: isAr ? "المستخدمون" : "Users", explorer: "1", engineer: "1", enterprise: isAr ? "حتى 10" : "Up to 10" },
    { label: isAr ? "الدعم الفني" : "Support", explorer: false, engineer: isAr ? "بريد إلكتروني" : "Email", enterprise: isAr ? "أولوية + واتساب" : "Priority + WhatsApp" },
    { label: "API", explorer: false, engineer: false, enterprise: true },
  ];
}

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
  const [tableOpen, setTableOpen] = useState(false);
  const [engineerLoading, setEngineerLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  /* mouse-tracking glow handler for glass cards */
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  /* card styles */
  const cardBase: React.CSSProperties = {
    background: "rgba(10, 15, 28, 0.4)",
    backdropFilter: "blur(24px) saturate(1.2)",
    WebkitBackdropFilter: "blur(24px) saturate(1.2)",
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

  const { dir, language } = useLanguage();
  const isAr = language === "ar";

  const explorerFeatures = getExplorerFeatures(isAr);
  const engineerFeatures = getEngineerFeatures(isAr);
  const enterpriseFeatures = getEnterpriseFeatures(isAr);
  const comparisonRows = getComparisonRows(isAr);

  const handleEngineerSubscribe = async () => {
    setEngineerLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate(`/auth?redirect=subscribe&plan=engineer&billing=monthly`);
        return;
      }
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: "engineer", billing_cycle: "monthly" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.checkout_url) {
        toast({ title: isAr ? "خطأ في الدفع" : "Payment error", description: error?.message || (isAr ? "حاول مرة أخرى" : "Please try again"), variant: "destructive" });
        return;
      }
      window.location.href = data.checkout_url;
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message || (isAr ? "حدث خطأ غير متوقع" : "An unexpected error occurred"), variant: "destructive" });
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
        {/* Launch trial badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-4"
          style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)", color: "hsl(195 85% 60%)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "hsl(195 85% 50%)", display: "inline-block" }} />
          {isAr ? "مسار إثبات الثقة — تجربة 3 أيام مفعّلة تلقائياً لكل مستخدم" : "Trust Proof Path — 3-day trial auto-activated for every user"}
        </div>
        <h2
          className="text-3xl md:text-4xl font-bold mb-3"
          style={{
            background: "linear-gradient(135deg, hsl(195 85% 50%), #ffffff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {isAr ? "أداة دعم القرار الهندسي" : "Engineering Decision Support"}
        </h2>
        <p style={{ color: "rgba(200,220,240,0.65)" }} className="text-lg max-w-2xl mx-auto">
          {isAr
            ? "ConsultX ليس شاتاً — هو مرجعية هندسية موثقة تعتمد على SBC وNFPA وتدفعك لقرار مدعوم بالسند والمنطق."
            : "ConsultX isn't a chatbot — it's a documented engineering reference built on SBC & NFPA, delivering decisions backed by clause and logic."}
        </p>

        {/* Value props row */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-6">
          {(isAr
            ? ["⚡ سرعة الإجابة الهندسية", "📖 مرجع + فقرة + اشتقاق", "🔒 موثوقية SBC 2024"]
            : ["⚡ Engineering answer speed", "📖 Reference + clause + derivation", "🔒 SBC 2024 compliance"]
          ).map((v, i) => (
            <span key={i} style={{ fontSize: "0.78rem", color: "rgba(180,210,230,0.7)", padding: "3px 12px", borderRadius: "20px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {v}
            </span>
          ))}
        </div>
      </div>

      {/* spacer */}
      <div className="mb-10" />

      {/* Cards grid — on mobile: engineer card first, then explorer, then enterprise */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-stretch">

        {/* ── Mobile: مهندس FIRST ── Desktop: normal order ── */}

        {/* ── Card 2: مهندس (popular) — shown first on mobile ── */}
        <div
          style={engineerCard}
          className="pricing-popular-card glass-card-interactive p-6 flex flex-col relative order-first md:order-none"
          onMouseMove={handleMouseMove}
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
              {isAr ? "الأكثر شعبية" : "Most Popular"}
            </span>
          </div>

          {/* promo ribbon */}
          <div
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full mb-4 mt-3 self-start"
            style={{
              background: "rgba(0,212,255,0.10)",
              border: "1px solid rgba(0,212,255,0.35)",
              color: cyanColor,
            }}
          >
            <Building2 size={12} strokeWidth={1.5} />
            <span>{isAr ? "تجربة مفعّلة تلقائياً · 3 أيام كاملة" : "Auto-activated · 3-day full trial"}</span>
          </div>

          {/* icon */}
          <div
            className="mb-4 flex items-center justify-center w-16 h-16 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(0,212,255,0.15) 0%, transparent 70%)" }}
          >
            <HardHat size={32} strokeWidth={1.5} style={{ color: cyanColor }} />
          </div>

          <h3 className="text-xl font-bold text-foreground mb-1">{isAr ? "مهندس Pro" : "Engineer Pro"}</h3>
          <p className="text-sm mb-4" style={{ color: "rgba(200,220,240,0.5)" }}>
            {isAr ? "للمهندس الذي يعتمد ConsultX مرجعاً يومياً للقرار" : "For engineers who rely on ConsultX as their daily decision reference"}
          </p>

          {/* price */}
          <div className="mb-6">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-4xl font-bold text-foreground">
                <AnimatedPrice value="99" />
              </span>
              <span className="text-lg font-medium" style={{ color: "rgba(200,220,240,0.6)" }}>
                {isAr ? "ر.س/شهر" : "SAR/mo"}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: "rgba(200,220,240,0.4)" }}>
              ~$26 USD
            </p>
            <p className="text-xs mt-1 font-medium" style={{ color: cyanColor }}>
              {isAr ? "تجربة 3 أيام مفعّلة تلقائياً — بدون بطاقة" : "3-day trial auto-activated — no card required"}
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
              <><Loader2 size={15} strokeWidth={1.5} className="animate-spin" /> {isAr ? "جارٍ التحميل..." : "Loading..."}</>
            ) : (isAr ? "اشترك في Pro الآن" : "Subscribe to Pro Now")}
          </button>
        </div>

        {/* ── Card 1: مستكشف ── */}
        <div
          style={explorerCard}
          className="glass-card-interactive p-6 flex flex-col group"
          onMouseMove={handleMouseMove}
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

          <h3 className="text-xl font-bold text-foreground mb-1">{isAr ? "مستكشف" : "Explorer"}</h3>
          <p className="text-sm mb-4" style={{ color: "rgba(200,220,240,0.5)" }}>
            {isAr ? "البداية الآمنة — يصبح Pro بعد التجربة" : "Safe starting point — becomes Pro after trial"}
          </p>

          {/* price */}
          <div className="mb-6">
            <span className="text-4xl font-bold text-foreground">{isAr ? "مجاناً" : "Free"}</span>
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
            {isAr ? "ابدأ مجاناً" : "Start Free"}
          </button>
        </div>

        {/* ── Card 3: مؤسسة ── */}
        <div
          style={enterpriseCard}
          className="glass-card-interactive p-6 flex flex-col"
          onMouseMove={handleMouseMove}
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
              {isAr ? "للفرق" : "For Teams"}
            </span>
          </div>

          {/* icon */}
          <div
            className="mb-4 flex items-center justify-center w-16 h-16 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,140,0,0.15) 0%, transparent 70%)" }}
          >
            <Building size={32} strokeWidth={1.5} style={{ color: amberColor }} />
          </div>

          <h3 className="text-xl font-bold text-foreground mb-1">{isAr ? "مؤسسة" : "Enterprise"}</h3>
          <p className="text-sm mb-4" style={{ color: "rgba(200,220,240,0.5)" }}>
            {isAr ? "للمكاتب الاستشارية والمقاولين" : "For consulting firms and contractors"}
          </p>

          {/* price */}
          <div className="mb-6">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-4xl font-bold text-foreground">
                <AnimatedPrice value="349" />
              </span>
              <span className="text-lg font-medium" style={{ color: "rgba(200,220,240,0.6)" }}>
                {isAr ? "ر.س/شهر" : "SAR/mo"}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: "rgba(200,220,240,0.4)" }}>
              ~$90 USD
            </p>
            <p className="text-xs mt-1 font-medium" style={{ color: amberColor }}>
              {isAr ? "تجربة مجانية 3 أيام" : "3-Day Free Trial"}
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
            onClick={() => window.location.href = `mailto:njajrehwaseem@gmail.com?subject=${isAr ? "استفسار عن باقة مؤسسة — ConsultX" : "Enterprise plan inquiry — ConsultX"}`}
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
            {isAr ? "تواصل معنا" : "Contact Us"}
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
          {isAr ? "قارن جميع المميزات" : "Compare all features"}
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
                    {isAr ? "الميزة" : "Feature"}
                  </th>
                  {(isAr ? ["مستكشف", "مهندس", "مؤسسة"] : ["Explorer", "Engineer", "Enterprise"]).map((h) => (
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
            { Icon: ShieldCheck, label: isAr ? "بيانات مشفرة" : "Encrypted data", color: cyanColor },
            { Icon: CreditCard, label: isAr ? "إلغاء في أي وقت" : "Cancel anytime", color: cyanColor },
            { Icon: RefreshCw, label: isAr ? "ضمان استرداد 14 يوم" : "14-day money-back guarantee", color: cyanColor },
          ].map(({ Icon, label, color }) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <Icon size={16} strokeWidth={1.5} style={{ color }} />
              <span style={{ color: "rgba(200,220,240,0.6)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Trust proof statement */}
        <div
          className="flex items-center gap-2 text-sm px-5 py-3 rounded-xl text-center"
          style={{
            background: "rgba(0,212,255,0.06)",
            border: "1px solid rgba(0,212,255,0.2)",
            color: "hsl(195 60% 70%)",
            maxWidth: "520px",
          }}
        >
          <ShieldCheck size={14} strokeWidth={1.5} style={{ color: cyanColor, flexShrink: 0 }} />
          <span>
            {isAr
              ? "كل مستخدم — جديد أو قديم — يحصل تلقائياً على 3 أيام لاختبار العمق الهندسي. لا كود. لا تسجيل إضافي. مسار اشتراك واحد متسق من الدخول حتى الدفع."
              : "Every user — new or returning — automatically gets 3 days to experience the engineering depth. No code. No re-registration. One consistent subscription path from entry to payment."}
          </span>
        </div>

        <p className="text-xs text-center" style={{ color: "rgba(200,220,240,0.35)" }}>
          {isAr
            ? "ConsultX — منصة استشارات هندسية SaaS. الحد الأدنى هو الكود السعودي. نعمل فوق الحد الأدنى."
            : "ConsultX — Engineering SaaS decision platform. The floor is the Saudi building code. We work above the floor."}
        </p>
      </div>
    </section>
  );
};

export default PricingLanding;
