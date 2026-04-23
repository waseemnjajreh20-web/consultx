import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Shield, Clock, CheckCircle, Loader2, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LanguageToggle } from "@/components/LanguageToggle";
import consultxIcon from "@/assets/consultx-icon.png";

const MOYASAR_PUBLISHABLE_KEY = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY as string;

declare global {
  interface Window {
    Moyasar: any;
  }
}

/** Display name: use the DB plan name directly (matches PricingLanding). */
function getPlanDisplayName(slug: string, nameAr: string, nameEn: string, isAr: boolean): string {
  return isAr ? nameAr : nameEn;
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
    advisory_limit?: number;
    analysis_limit?: number;
  };
}

const Subscribe = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session, authLoading, subscription, subLoading, isReturningUser, isPaidActive, isTrialActive, trialDaysRemaining } = useEntitlement();
  const { t, dir, language } = useLanguage();
  const { toast } = useToast();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [pendingGivenId, setPendingGivenId] = useState<string | null>(null);
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Redirect paid active users only if they already have a card on file.
  // Users who are active but have no stored payment method must be allowed through
  // to complete the card-on-file recovery flow.
  useEffect(() => {
    if (!subLoading && isPaidActive && (subscription as any)?.card_on_file) navigate("/");
  }, [isPaidActive, subLoading, subscription, navigate]);

  // Fetch plans
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
          const proPlan = data.find((p) => p.slug === "pro");
          setSelectedPlan(proPlan?.id || data[0].id);
        }
      }
    };
    fetchPlans();
  }, [searchParams]);

  // Load Moyasar CSS + JS on mount
  useEffect(() => {
    if (window.Moyasar) {
      setSdkLoaded(true);
      return;
    }
    const existingScript = document.querySelector('script[src*="moyasar"]');
    if (existingScript) {
      setSdkLoaded(true);
      return;
    }
    if (!document.querySelector('link[href*="moyasar"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdn.moyasar.com/moyasar/1.14.0/moyasar.css";
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "https://cdn.moyasar.com/moyasar/1.14.0/moyasar.js";
    script.async = true;
    script.onload = () => setSdkLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Init Moyasar form once modal is open and we have the pending IDs
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (paymentModalOpen && sdkLoaded && pendingGivenId && pendingSubscriptionId) {
      timer = setTimeout(() => initMoyasarForm(pendingGivenId, pendingSubscriptionId), 300);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [paymentModalOpen, sdkLoaded, pendingGivenId, pendingSubscriptionId]);

  const initMoyasarForm = (givenId: string, subscriptionId: string) => {
    if (!window.Moyasar) return;
    const plan = plans.find((p) => p.id === selectedPlan);
    window.Moyasar.init({
      element: "#mysr-form",
      amount: 100, // 1 SAR in halalas — card verification charge
      currency: "SAR",
      description: plan ? `Card verification for ${plan.name_en}` : "Card verification",
      publishable_api_key: MOYASAR_PUBLISHABLE_KEY,
      callback_url: `${window.location.origin}/payment-callback`,
      metadata: {
        subscription_id: subscriptionId,
        given_id: givenId,
      },
      methods: ["creditcard"],
    });
  };

  // Call backend to create subscription record, then open payment modal
  const openPaymentModal = async () => {
    if (!selectedPlan || !session || processing) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("moyasar-create-subscription", {
        body: { plan_id: selectedPlan },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.given_id || !data?.subscription_id) {
        const desc =
          data?.error === "Active paid subscription already exists"
            ? language === "ar"
              ? "لديك اشتراك نشط بالفعل"
              : "You already have an active subscription."
            : language === "ar"
            ? "حدث خطأ في التحضير للدفع، يرجى المحاولة مرة أخرى"
            : "Failed to prepare payment. Please try again.";
        toast({ title: t("errorTitle"), description: desc, variant: "destructive" });
        return;
      }
      setPendingGivenId(data.given_id);
      setPendingSubscriptionId(data.subscription_id);
      setPaymentModalOpen(true);
    } catch (err: any) {
      console.error("openPaymentModal error:", err);
      toast({
        title: t("errorTitle"),
        description: language === "ar" ? "حدث خطأ غير متوقع" : "An unexpected error occurred.",
        variant: "destructive",
      });
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

  const getPriceLabel = (type: string) => {
    if (type === "weekly") return t("sarWeek");
    if (type === "yearly") return t("sarYear");
    return t("sarMonth");
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="fixed inset-0 blueprint-grid opacity-30 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/30">
        <Button variant="ghost" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
          {dir === "rtl" ? <ArrowRight className="ms-2 w-4 h-4" /> : <ArrowLeft className="me-2 w-4 h-4" />}
          {t("backToHome")}
        </Button>
        <LanguageToggle />
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center p-6 pb-24 md:pb-6">
        <div className="w-full max-w-4xl">
          {/* Icon & Title */}
          <div className="text-center mb-8">
            <img src={consultxIcon} alt="ConsultX" className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gradient">
              {isReturningUser ? t("resubscribeNow") : t("subscribePage")}
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              {isReturningUser ? t("resubscribeSubtitle") : t("subscribeSubtitle")}
            </p>
          </div>

          {/* Trial banner — shown for ALL active trial users (launch trial OR paid trialing) */}
          {isTrialActive && !isReturningUser && (
            <div className="max-w-lg mx-auto mb-6 bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 text-sm text-center text-primary">
              <Clock className="w-4 h-4 inline-block me-1 mb-0.5" />
              {language === "ar"
                ? `تجربتك المجانية تنتهي خلال ${trialDaysRemaining || subscription?.trial_days_remaining || 0} أيام — أضف بطاقتك الآن لمواصلة الاشتراك بدون انقطاع`
                : `Your free trial ends in ${trialDaysRemaining || subscription?.trial_days_remaining || 0} days — add your card now to continue without interruption`}
            </div>
          )}

          {/* Plan Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 max-w-4xl mx-auto">
            {plans.map((plan, i) => {
              const selected = plan.id === selectedPlan;
              const popular = plan.slug === "pro";
              return (
                <Card
                  key={plan.id}
                  className={`cursor-pointer transition-all duration-300 animate-fade-up hover:scale-[1.02] ${
                    selected
                      ? "border-glow bg-card/90"
                      : "border-border/50 bg-card/50 hover:border-primary/30"
                  }`}
                  style={{ animationDelay: `${i * 0.1}s` }}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  <CardHeader className="pb-2 relative">
                    {popular && (
                      <Badge className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 bg-primary text-primary-foreground text-xs animate-pulse-glow">
                        <Sparkles className="w-3 h-3 me-1" />
                        {t("mostPopular")}
                      </Badge>
                    )}
                    <CardTitle className="text-lg text-center mt-1">
                      {getPlanDisplayName(plan.slug, plan.name_ar, plan.name_en, language === "ar")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-center pb-4">
                    <div className="text-3xl font-bold text-primary">
                      {plan.price_amount === 0
                        ? language === "ar" ? "مجاني" : "Free"
                        : (plan.price_amount / 100).toFixed(0)}
                      {plan.price_amount > 0 && (
                        <span className="text-sm text-muted-foreground ms-1">{getPriceLabel(plan.type)}</span>
                      )}
                    </div>
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground text-start px-2">
                      <li>
                        {plan.features.graphrag
                          ? language === "ar" ? "✓ GraphRAG متاح" : "✓ GraphRAG enabled"
                          : language === "ar" ? "✗ GraphRAG غير متاح" : "✗ No GraphRAG"}
                      </li>
                      {Array.isArray(plan.features.modes) && plan.features.modes.length > 0 && (
                        <>
                          <li>
                            {language === "ar" ? "✓ الوضع السريع: غير محدود" : "✓ Quick mode: Unlimited"}
                          </li>
                          {plan.features.advisory_limit != null && (
                            <li>
                              {language === "ar"
                                ? `✓ الاستشاري: ${plan.features.advisory_limit} رسالة/يوم`
                                : `✓ Advisory: ${plan.features.advisory_limit} msgs/day`}
                            </li>
                          )}
                          {plan.features.analysis_limit != null && (
                            <li>
                              {language === "ar"
                                ? `✓ التحليلي: ${plan.features.analysis_limit} رسالة/يوم`
                                : `✓ Analysis: ${plan.features.analysis_limit} msgs/day`}
                            </li>
                          )}
                          {plan.features.advisory_limit == null && plan.features.analysis_limit == null && (
                            <li>
                              {language === "ar" ? "✓ جميع الأوضاع غير محدودة" : "✓ All modes unlimited"}
                            </li>
                          )}
                        </>
                      )}
                    </ul>
                    {plan.price_amount > 0 && (
                      <Badge className="mt-3 bg-primary/15 text-primary border border-primary/30 text-xs font-medium">
                        <Clock className="w-3 h-3 me-1" />
                        {language === "ar" ? "7 أيام تجربة مجانية" : "7-day free trial"}
                      </Badge>
                    )}
                    {selected && <CheckCircle className="w-5 h-5 text-primary mx-auto mt-2" />}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Selected Plan Summary */}
          {currentPlan && (
            <div className="max-w-lg mx-auto">
              <div className="flex items-center justify-center gap-2 mb-6 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-primary" />
                <span>{t("cancelAnytime")}</span>
                <span className="mx-2">•</span>
                <CheckCircle className="w-4 h-4 text-primary" />
                <span>{t("fullAccess")}</span>
              </div>

              <Button
                variant="hero"
                size="lg"
                className="w-full"
                onClick={openPaymentModal}
                disabled={!selectedPlan || !sdkLoaded || processing}
              >
                {isReturningUser ? t("startSubscription") : isTrialActive ? t("addCardContinue") : t("startFreeTrial")}
                {processing
                  ? <Loader2 className="w-5 h-5 ms-2 animate-spin" />
                  : dir === "rtl"
                    ? <ArrowLeft className="w-5 h-5 me-2" />
                    : <ArrowRight className="w-5 h-5 ms-2" />}
              </Button>
            </div>
          )}

          {/* Payment Modal — Moyasar form renders inside #mysr-form */}
          <Dialog
            open={paymentModalOpen}
            onOpenChange={(open) => {
              if (processing) return;
              setPaymentModalOpen(open);
              if (!open) {
                setPendingGivenId(null);
                setPendingSubscriptionId(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>{language === "ar" ? "تفاصيل الدفع" : "Payment Details"}</DialogTitle>
                <DialogDescription>
                  {isReturningUser ? t("verificationChargeReturning") : t("verificationCharge")}
                </DialogDescription>
              </DialogHeader>
              <div className="my-2" dir="ltr">
                <div id="mysr-form" className="min-h-[180px]">
                  {!sdkLoaded && (
                    <div className="flex items-center justify-center h-[180px]">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default Subscribe;
