import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CreditCard,
  Shield,
  Clock,
  CheckCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Network,
  BookOpen,
  Infinity,
  Mail,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LanguageToggle } from "@/components/LanguageToggle";

const TAP_PUBLISHABLE_KEY =
  import.meta.env.VITE_TAP_PUBLISHABLE_KEY || "pk_test_4QqUxKJotDilhnfGZ98ALrp3";

declare global {
  interface Window {
    CardSDK: any;
  }
}

interface Plan {
  id: string;
  name_ar: string;
  name_en: string;
  slug: string;
  price_amount: number;
  type: string;
  target: string;
  duration_days: number;
  features: {
    messages_per_day: number | null;
    graphrag: boolean;
    modes: string[];
    team_members?: number;
  };
}

type BillingPeriod = "monthly" | "yearly";

// Static plan metadata keyed by slug
const PLAN_META: Record<
  string,
  {
    monthly_price: number;
    yearly_price: number;
    features_ar: string[];
    features_en: string[];
    history_ar: string;
    history_en: string;
  }
> = {
  starter: {
    monthly_price: 99,
    yearly_price: 990,
    features_ar: [
      "وضع الأساسي والاستشاري",
      "عمق استجابة قياسي",
      "بدون GraphRAG",
      "بدون تصدير PDF",
    ],
    features_en: [
      "Primary & Advisory modes",
      "Standard response depth",
      "No GraphRAG",
      "No PDF export",
    ],
    history_ar: "سجل المحادثات: 30 يوماً",
    history_en: "Conversation history: 30 days",
  },
  pro: {
    monthly_price: 249,
    yearly_price: 2490,
    features_ar: [
      "جميع الأوضاع: أساسي، استشاري، تحليلي",
      "GraphRAG — شبكة المراجع الهندسية",
      "تصدير PDF للتقارير",
      "رسائل غير محدودة يومياً",
    ],
    features_en: [
      "All modes: Primary, Advisory, Analysis",
      "GraphRAG — full engineering reference graph",
      "PDF report export",
      "Unlimited daily messages",
    ],
    history_ar: "سجل المحادثات: 90 يوماً",
    history_en: "Conversation history: 90 days",
  },
  team: {
    monthly_price: 699,
    yearly_price: 6990,
    features_ar: [
      "كل مزايا Pro × مقاعد متعددة",
      "لوحة تحكم للمكتب",
      "إدارة المستخدمين",
      "دعم مخصص",
    ],
    features_en: [
      "Everything in Pro × multiple seats",
      "Office dashboard",
      "User management",
      "Dedicated support",
    ],
    history_ar: "سجل محادثات غير محدود",
    history_en: "Unlimited conversation history",
  },
};

// Derive access state from subscription hook data
type AccessState =
  | "trial_active"
  | "trial_expired"
  | "eligible_existing_pending"
  | "paid_active"
  | "active"
  | "ineligible"
  | "none";

function deriveAccessState(subscription: ReturnType<typeof useSubscription>["subscription"]): AccessState {
  if (!subscription) return "none";
  const { status, active } = subscription;
  if (active && (status === "active")) return "paid_active";
  if (status === "trialing") return "trial_active";
  if (status === "expired") return "trial_expired";
  if (status === "cancelled") return "trial_expired";
  if (status === "none") return "eligible_existing_pending";
  return "ineligible";
}

const Subscribe = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session, loading: authLoading } = useAuth();
  const { t, dir, language } = useLanguage();
  const { subscription, loading: subLoading } = useSubscription();
  const { toast } = useToast();

  const isAr = language === "ar";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [cardReady, setCardReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const accessState = deriveAccessState(subscription);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Redirect users who already have an active subscription
  useEffect(() => {
    if (!subLoading && subscription?.active && accessState === "paid_active") navigate("/");
  }, [subscription, subLoading, navigate, accessState]);

  // Fetch plans from DB
  useEffect(() => {
    const fetchPlans = async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .neq("slug", "free")
        .order("price_amount", { ascending: true });
      if (data && data.length > 0) {
        setPlans(data);
        const urlPlan = searchParams.get("plan");
        if (urlPlan && data.find((p) => p.id === urlPlan)) {
          setSelectedPlan(urlPlan);
        } else {
          // Default to Pro plan
          const proPlan = data.find((p) => p.slug === "pro" || p.slug === "engineer");
          setSelectedPlan(proPlan?.id || data[0].id);
        }
      }
    };
    fetchPlans();
  }, [searchParams]);

  // Load Tap Card SDK
  useEffect(() => {
    if (sdkLoaded || window.CardSDK) {
      setSdkLoaded(true);
      setTimeout(() => initTapCard(), 500);
      return;
    }
    const existingScript = document.querySelector('script[src*="tap-sdks"]');
    if (existingScript) {
      setSdkLoaded(true);
      setTimeout(() => initTapCard(), 500);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://tap-sdks.b-cdn.net/card/1.0.0/index.js";
    script.async = true;
    script.onload = () => {
      setSdkLoaded(true);
      setTimeout(() => initTapCard(), 500);
    };
    document.body.appendChild(script);
  }, []);

  // Re-init card SDK when plan selection changes (to reset element)
  useEffect(() => {
    if (sdkLoaded && selectedPlan) {
      const currentPlanData = plans.find((p) => p.id === selectedPlan);
      if (currentPlanData?.slug !== "team") {
        resetCardSDK();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan]);

  const initTapCard = () => {
    if (!window.CardSDK) return;
    try {
      const { renderTapCard } = window.CardSDK;
      renderTapCard("card-element", {
        publicKey: TAP_PUBLISHABLE_KEY,
        transaction: { amount: "1", currency: "SAR" },
        customer: { editable: true },
        acceptance: {
          supportedBrands: ["VISA", "MASTERCARD", "MADA", "AMERICAN_EXPRESS"],
          supportedCards: "ALL",
        },
        fields: { cardHolder: true },
        addons: { displayPaymentBrands: true, loader: true },
        interface: {
          locale: isAr ? "ar" : "en",
          theme: "dark",
          edges: "curved",
          direction: dir,
        },
        onReady: () => setCardReady(true),
        onError: (err: any) => console.error("Card SDK error:", err),
      });
    } catch (err) {
      console.error("Failed to init Tap Card SDK:", err);
    }
  };

  const resetCardSDK = () => {
    setCardReady(false);
    const cardEl = document.getElementById("card-element");
    if (cardEl) cardEl.innerHTML = "";
    setTimeout(() => initTapCard(), 400);
  };

  const handleSubscribe = async () => {
    if (!selectedPlan || !cardReady || !session || processing) return;
    setProcessing(true);
    try {
      const { tokenize } = window.CardSDK;
      const tokenResult = await tokenize();
      if (!tokenResult?.id) {
        toast({
          title: t("errorTitle"),
          description: isAr
            ? "فشل التحقق من بيانات البطاقة، يرجى إعادة إدخال بيانات البطاقة"
            : "Card verification failed. Please re-enter your card details.",
          variant: "destructive",
        });
        resetCardSDK();
        return;
      }
      const { data, error } = await supabase.functions.invoke("tap-create-subscription", {
        body: { token_id: tokenResult.id, plan_id: selectedPlan },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        toast({
          title: t("errorTitle"),
          description: isAr
            ? "حدث خطأ في معالجة الدفع، يرجى إدخال بيانات البطاقة مرة أخرى"
            : "Payment processing error. Please re-enter your card details.",
          variant: "destructive",
        });
        resetCardSDK();
        return;
      }
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        toast({ title: t("subscriptionActivated"), description: t("trialStarted") });
        navigate("/");
      }
    } catch (err: any) {
      console.error("Subscribe error:", err);
      toast({
        title: t("errorTitle"),
        description: isAr
          ? "حدث خطأ غير متوقع، يرجى إدخال بيانات البطاقة مرة أخرى"
          : "An unexpected error occurred. Please re-enter your card details.",
        variant: "destructive",
      });
      resetCardSDK();
    } finally {
      setProcessing(false);
    }
  };

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentPlan = plans.find((p) => p.id === selectedPlan);
  const isTeamSelected = currentPlan?.slug === "team";

  const getPlanPrice = (slug: string, period: BillingPeriod): number => {
    const meta = PLAN_META[slug];
    if (!meta) return 0;
    return period === "yearly" ? meta.yearly_price : meta.monthly_price;
  };

  const getPlanMonthlyEquivalent = (slug: string): number => {
    const meta = PLAN_META[slug];
    if (!meta) return 0;
    return Math.round(meta.yearly_price / 12);
  };

  const getDisplayPrice = (plan: Plan, period: BillingPeriod): string => {
    const slug = plan.slug;
    if (slug === "team") return isAr ? "٦٩٩+" : "699+";
    const meta = PLAN_META[slug];
    if (!meta) {
      // Fallback to DB price_amount (stored in halalas, divide by 100)
      return String(Math.round(plan.price_amount / 100));
    }
    if (period === "yearly") {
      return String(getPlanMonthlyEquivalent(slug));
    }
    return String(meta.monthly_price);
  };

  const faqItems = [
    {
      q_ar: "ما الفرق بين Starter و Pro؟",
      q_en: "What's the difference between Starter and Pro?",
      a_ar:
        "Starter يوفر الوضعين الأساسي والاستشاري مع عمق استجابة قياسي وسجل محادثات لمدة 30 يوماً. Pro يضيف وضع التحليل، وشبكة GraphRAG للمراجع الهندسية، وتصدير PDF، ورسائل غير محدودة، وسجل محادثات لمدة 90 يوماً — وهو مصمم للمهندسين الذين يعتمدون على ConsultX بشكل يومي.",
      a_en:
        "Starter gives you Primary and Advisory modes with standard response depth and 30-day conversation history. Pro adds Analysis mode, GraphRAG engineering reference network, PDF export, unlimited messages, and 90-day history — designed for engineers who rely on ConsultX daily.",
    },
    {
      q_ar: "هل يمكنني الإلغاء في أي وقت؟",
      q_en: "Can I cancel anytime?",
      a_ar:
        "نعم، يمكنك إلغاء اشتراكك في أي وقت بدون غرامات أو رسوم إضافية. سيظل وصولك نشطاً حتى نهاية فترة الفاتورة الحالية.",
      a_en:
        "Yes, you can cancel your subscription at any time with no penalties or extra fees. Your access remains active until the end of your current billing period.",
    },
    {
      q_ar: "متى يبدأ الوصول بعد الاشتراك؟",
      q_en: "When does access start after subscribing?",
      a_ar:
        "الوصول فوري. بمجرد التحقق من بطاقتك وإتمام عملية الدفع، تُفعَّل باقتك على الفور ويمكنك البدء باستخدام ConsultX كاملاً.",
      a_en:
        "Access is immediate. Once your card is verified and payment is processed, your plan is activated instantly and you can start using ConsultX in full.",
    },
    {
      q_ar: "هل ConsultX مناسب للشركات والمكاتب الهندسية؟",
      q_en: "Is ConsultX suitable for firms and engineering offices?",
      a_ar:
        "نعم، باقة Team مصممة خصيصاً للمكاتب الهندسية والشركات. تشمل مقاعد متعددة، ولوحة تحكم للمكتب، وإدارة المستخدمين، ودعماً مخصصاً. تواصل معنا للحصول على تسعير مخصص لحجم فريقك.",
      a_en:
        "Yes, the Team plan is designed specifically for engineering offices and firms. It includes multiple seats, an office dashboard, user management, and dedicated support. Contact us for pricing tailored to your team size.",
    },
  ];

  return (
    <div className="min-h-dvh bg-background flex flex-col" dir={dir}>
      <div className="fixed inset-0 blueprint-grid opacity-30 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/30">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground"
        >
          {dir === "rtl" ? (
            <ArrowRight className="ms-2 w-4 h-4" />
          ) : (
            <ArrowLeft className="me-2 w-4 h-4" />
          )}
          {t("backToHome")}
        </Button>
        <LanguageToggle />
      </header>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center p-6 pb-24 md:pb-12">
        <div className="w-full max-w-5xl">

          {/* Context Banner */}
          {accessState === "trial_active" && (
            <div className="max-w-2xl mx-auto mb-6 rounded-xl px-5 py-4 flex items-start gap-3 border"
              style={{
                background: "rgba(0,212,255,0.06)",
                borderColor: "rgba(0,212,255,0.25)",
                boxShadow: "0 0 30px rgba(0,212,255,0.06)",
              }}
            >
              <Clock className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "hsl(195 85% 50%)" }} />
              <p className="text-sm leading-relaxed" style={{ color: "rgba(200,220,240,0.85)" }}>
                {isAr
                  ? `وصولك الكامل يستمر ${subscription?.trial_days_remaining ?? "..."} أيام — فعّل اشتراكك لضمان الاستمرارية`
                  : `Your full access continues ${subscription?.trial_days_remaining ?? "..."} days — activate subscription to ensure continuity`}
              </p>
            </div>
          )}

          {accessState === "trial_expired" && (
            <div className="max-w-2xl mx-auto mb-6 rounded-xl px-5 py-4 flex items-start gap-3 border"
              style={{
                background: "rgba(255,140,0,0.06)",
                borderColor: "rgba(255,140,0,0.25)",
                boxShadow: "0 0 30px rgba(255,140,0,0.06)",
              }}
            >
              <Sparkles className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#FF8C00" }} />
              <p className="text-sm leading-relaxed" style={{ color: "rgba(200,220,240,0.85)" }}>
                {isAr
                  ? "اكتملت تجربتك الهندسية — Pro يواصل هذا المستوى بلا قيود"
                  : "Your engineering trial is complete — Pro continues at this level with no limits"}
              </p>
            </div>
          )}

          {/* Page Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gradient mb-2">
              {isAr ? "فعّل اشتراكك" : "Activate Your Subscription"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isAr
                ? "استمر بما بدأته — وصول مهني كامل بلا انقطاع"
                : "Continue where you left off — full professional access, no interruptions"}
            </p>
          </div>

          {/* Billing Period Toggle */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-1 bg-card/60 border border-border/40 rounded-xl p-1">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  billingPeriod === "monthly"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isAr ? "شهري" : "Monthly"}
              </button>
              <button
                onClick={() => setBillingPeriod("yearly")}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                  billingPeriod === "yearly"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isAr ? "سنوي" : "Yearly"}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                  billingPeriod === "yearly"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-primary/15 text-primary"
                }`}>
                  {isAr ? "وفّر 17%" : "Save 17%"}
                </span>
              </button>
            </div>
          </div>

          {/* Plan Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {/* --- Starter --- */}
            {(() => {
              const starterPlan = plans.find((p) => p.slug === "starter");
              const isSelected = starterPlan ? starterPlan.id === selectedPlan : false;
              const meta = PLAN_META["starter"];
              return (
                <div
                  key="starter-card"
                  onClick={() => starterPlan && setSelectedPlan(starterPlan.id)}
                  className={`relative rounded-xl border transition-all duration-300 cursor-pointer ${
                    isSelected
                      ? "border-primary/50 bg-card/90 shadow-[0_0_25px_rgba(0,212,255,0.06)]"
                      : "border-border/50 bg-card/60 hover:border-primary/25 hover:bg-card/70"
                  }`}
                >
                  <div className="p-6">
                    {/* Plan name */}
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-lg font-semibold text-foreground">
                        {isAr ? "Starter" : "Starter"}
                      </h3>
                      {isSelected && <CheckCircle className="w-5 h-5 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {isAr ? "للاستخدام المهني الخفيف" : "For lighter professional use"}
                    </p>

                    {/* Price */}
                    <div className="mb-1">
                      <span className="text-3xl font-bold text-foreground">
                        {starterPlan ? getDisplayPrice(starterPlan, billingPeriod) : (billingPeriod === "monthly" ? "99" : "83")}
                      </span>
                      <span className="text-sm text-muted-foreground ms-1">
                        {isAr ? "ريال/شهر" : "SAR/mo"}
                      </span>
                    </div>
                    {billingPeriod === "yearly" && (
                      <p className="text-xs text-muted-foreground mb-4">
                        {isAr ? `يُدفع سنوياً — ${meta?.yearly_price ?? 990} ريال` : `Billed annually — ${meta?.yearly_price ?? 990} SAR`}
                      </p>
                    )}
                    {billingPeriod === "monthly" && <div className="mb-4" />}

                    {/* Features */}
                    <ul className="space-y-2">
                      {(isAr ? meta?.features_ar : meta?.features_en)?.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/60" />
                          {f}
                        </li>
                      ))}
                      <li className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/60" />
                        {isAr ? meta?.history_ar : meta?.history_en}
                      </li>
                    </ul>
                  </div>
                </div>
              );
            })()}

            {/* --- Pro (highlighted) --- */}
            {(() => {
              const proPlan = plans.find((p) => p.slug === "pro" || p.slug === "engineer");
              const isSelected = proPlan ? proPlan.id === selectedPlan : false;
              const meta = PLAN_META["pro"];
              return (
                <div
                  key="pro-card"
                  onClick={() => proPlan && setSelectedPlan(proPlan.id)}
                  className={`relative rounded-xl border transition-all duration-300 cursor-pointer ${
                    isSelected
                      ? "border-primary/70 bg-card/95 shadow-[0_0_45px_rgba(0,212,255,0.12)]"
                      : "border-primary/40 bg-card/80 shadow-[0_0_30px_rgba(0,212,255,0.06)] hover:border-primary/60"
                  }`}
                >
                  {/* Popular badge */}
                  <div className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 animate-pulse-glow whitespace-nowrap">
                      <Sparkles className="w-3 h-3 me-1" />
                      {isAr ? "الأكثر شيوعاً" : "Most Popular"}
                    </Badge>
                  </div>

                  <div className="p-6 pt-8">
                    {/* Plan name */}
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-lg font-semibold text-foreground">Pro</h3>
                      {isSelected && <CheckCircle className="w-5 h-5 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {isAr
                        ? "للمهندسين الذين يعتمدون على ConsultX يومياً"
                        : "For engineers who rely on ConsultX daily"}
                    </p>

                    {/* Price */}
                    <div className="mb-1">
                      <span className="text-3xl font-bold text-primary">
                        {proPlan ? getDisplayPrice(proPlan, billingPeriod) : (billingPeriod === "monthly" ? "249" : "208")}
                      </span>
                      <span className="text-sm text-muted-foreground ms-1">
                        {isAr ? "ريال/شهر" : "SAR/mo"}
                      </span>
                    </div>
                    {billingPeriod === "yearly" && (
                      <p className="text-xs text-muted-foreground mb-4">
                        {isAr
                          ? `يُدفع سنوياً — ${meta?.yearly_price ?? 2490} ريال`
                          : `Billed annually — ${meta?.yearly_price ?? 2490} SAR`}
                      </p>
                    )}
                    {billingPeriod === "monthly" && <div className="mb-4" />}

                    {/* Features */}
                    <ul className="space-y-2">
                      {(isAr ? meta?.features_ar : meta?.features_en)?.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                          {f}
                        </li>
                      ))}
                      <li className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                        {isAr ? meta?.history_ar : meta?.history_en}
                      </li>
                    </ul>
                  </div>
                </div>
              );
            })()}

            {/* --- Team --- */}
            {(() => {
              const teamPlan = plans.find((p) => p.slug === "team");
              const isSelected = teamPlan ? teamPlan.id === selectedPlan : false;
              const meta = PLAN_META["team"];
              return (
                <div
                  key="team-card"
                  onClick={() => teamPlan && setSelectedPlan(teamPlan.id)}
                  className={`relative rounded-xl border transition-all duration-300 cursor-pointer ${
                    isSelected
                      ? "border-primary/50 bg-card/90 shadow-[0_0_25px_rgba(0,212,255,0.06)]"
                      : "border-border/50 bg-card/60 hover:border-primary/25 hover:bg-card/70"
                  }`}
                >
                  <div className="p-6">
                    {/* Plan name */}
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary/70" />
                        {isAr ? "Team" : "Team"}
                      </h3>
                      {isSelected && <CheckCircle className="w-5 h-5 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {isAr ? "للمكاتب والفرق الهندسية" : "For offices and engineering teams"}
                    </p>

                    {/* Price */}
                    <div className="mb-1">
                      <span className="text-sm text-muted-foreground">
                        {isAr ? "يبدأ من" : "Starting at"}
                      </span>
                      <div>
                        <span className="text-3xl font-bold text-foreground">699</span>
                        <span className="text-sm text-muted-foreground ms-1">
                          {isAr ? "ريال/شهر" : "SAR/mo"}
                        </span>
                      </div>
                    </div>
                    <div className="mb-4" />

                    {/* Features */}
                    <ul className="space-y-2">
                      {(isAr ? meta?.features_ar : meta?.features_en)?.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/60" />
                          {f}
                        </li>
                      ))}
                      <li className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/60" />
                        {isAr ? meta?.history_ar : meta?.history_en}
                      </li>
                    </ul>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Payment Section or Team Contact CTA */}
          {currentPlan && (
            <div className="max-w-lg mx-auto mb-12">
              {isTeamSelected ? (
                /* Team — Contact CTA */
                <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-xl p-8 text-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
                    <Mail className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {isAr ? "تواصل معنا للتسعير" : "Contact us for pricing"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    {isAr
                      ? "سنقدم لك عرضاً مخصصاً يناسب حجم فريقك واحتياجات مكتبك."
                      : "We'll provide a custom quote tailored to your team size and office needs."}
                  </p>
                  <Button
                    variant="hero"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      window.location.href = "mailto:hello@consultx.sa?subject=Team%20Plan%20Inquiry";
                    }}
                  >
                    <Mail className="w-5 h-5 ms-2" />
                    {isAr ? "تواصل معنا" : "Contact Us"}
                  </Button>
                </div>
              ) : (
                /* Starter / Pro — Payment Form */
                <>
                  {/* Trust row */}
                  <div className="flex items-center justify-center gap-4 mb-5 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-primary" />
                      {isAr ? "إلغاء في أي وقت" : "Cancel anytime"}
                    </span>
                    <span className="text-border/60">·</span>
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-primary" />
                      {isAr ? "وصول فوري" : "Instant access"}
                    </span>
                    <span className="text-border/60">·</span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-primary" />
                      {isAr ? "تجديد تلقائي" : "Auto-renewal"}
                    </span>
                  </div>

                  {/* Verification note */}
                  <div className="bg-muted/20 border border-border/40 rounded-lg px-4 py-3 mb-5 text-xs text-muted-foreground text-center leading-relaxed">
                    <CreditCard className="w-3.5 h-3.5 inline-block me-1.5 mb-0.5" />
                    {isAr
                      ? "سيتم خصم 1 ريال للتحقق من بطاقتك ثم استرجاعها فوراً"
                      : "1 SAR verification charge will be applied and immediately refunded"}
                  </div>

                  {/* Card Element */}
                  <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-xl p-4 mb-5">
                    <div id="card-element" className="min-h-[120px] flex items-center justify-center">
                      {!sdkLoaded && (
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Subscribe Button */}
                  <Button
                    variant="hero"
                    size="lg"
                    className="w-full mb-3"
                    onClick={handleSubscribe}
                    disabled={!cardReady || processing || !selectedPlan}
                  >
                    {processing ? (
                      <Loader2 className="w-5 h-5 animate-spin ms-2" />
                    ) : (
                      <CreditCard className="w-5 h-5 ms-2" />
                    )}
                    {isAr ? "فعّل اشتراكك الآن" : "Activate Your Subscription"}
                  </Button>

                  {/* Microcopy */}
                  <p className="text-center text-xs text-muted-foreground/70">
                    {isAr
                      ? "وصول فوري بعد التفعيل · تجديد تلقائي · إلغاء في أي وقت بدون غرامة"
                      : "Instant access after activation · Auto-renewal · Cancel anytime with no penalty"}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Why Pro Section */}
          {accessState !== "paid_active" && accessState !== "active" && (
            <div className="mb-12">
              <h2 className="text-xl font-bold text-center text-foreground mb-6">
                {isAr ? "لماذا Pro؟" : "Why Pro?"}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card/60 border border-border/40 rounded-xl p-5 text-center">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3"
                    style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.15)" }}>
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    {isAr ? "مراجع قانونية دقيقة" : "Precise Legal References"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "كل إجابة مرتبطة بالمادة والبند الدقيق من الكود"
                      : "Every answer tied to the precise clause and section of the code"}
                  </p>
                </div>

                <div className="bg-card/60 border border-border/40 rounded-xl p-5 text-center">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3"
                    style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.15)" }}>
                    <Network className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    {isAr ? "GraphRAG — شبكة المراجع" : "GraphRAG — Reference Network"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "كل إجابة مرتبطة بشبكة المراجع الهندسية الكاملة"
                      : "Every answer linked to the full engineering reference graph"}
                  </p>
                </div>

                <div className="bg-card/60 border border-border/40 rounded-xl p-5 text-center">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3"
                    style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.15)" }}>
                    <Infinity className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    {isAr ? "استمرارية بلا قيود" : "Unlimited Continuity"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "استخدام يومي بدون انقطاع أو حد للرسائل"
                      : "Daily use without interruptions or message limits"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* FAQ Section */}
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-center text-foreground mb-6">
              {isAr ? "أسئلة شائعة" : "Frequently Asked Questions"}
            </h2>
            <div className="space-y-3">
              {faqItems.map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <div
                    key={i}
                    className={`bg-card/60 border rounded-xl overflow-hidden transition-all duration-200 ${
                      isOpen ? "border-primary/30" : "border-border/40"
                    }`}
                  >
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      className="w-full flex items-center justify-between px-5 py-4 text-start"
                    >
                      <span className="text-sm font-medium text-foreground">
                        {isAr ? item.q_ar : item.q_en}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-primary shrink-0 ms-3" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ms-3" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {isAr ? item.a_ar : item.a_en}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Subscribe;
