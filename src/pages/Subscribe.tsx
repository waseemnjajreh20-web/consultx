import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, Shield, Clock, CheckCircle, Loader2, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LanguageToggle } from "@/components/LanguageToggle";
import consultxIcon from "@/assets/consultx-icon.png";

const TAP_PUBLISHABLE_KEY = import.meta.env.VITE_TAP_PUBLISHABLE_KEY || "pk_test_4QqUxKJotDilhnfGZ98ALrp3";

declare global {
  interface Window {
    CardSDK: any;
  }
}

interface Plan {
  id: string;
  name_ar: string;
  name_en: string;
  price_amount: number;
  type: string;
  target: string;
  duration_days: number;
}

const Subscribe = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session, loading: authLoading } = useAuth();
  const { t, dir, language } = useLanguage();
  const { subscription, loading: subLoading } = useSubscription();
  const { toast } = useToast();

  // Detect if user is a returning user (expired/cancelled — no free trial)
  const isReturningUser =
    subscription?.status === "expired" || subscription?.status === "cancelled";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("individual");
  const [cardReady, setCardReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Redirect users who already have an active/trialing subscription to chat
  useEffect(() => {
    if (!subLoading && subscription?.active) navigate("/");
  }, [subscription, subLoading, navigate]);

  // Fetch plans
  useEffect(() => {
    const fetchPlans = async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price_amount", { ascending: true });
      if (data && data.length > 0) {
        setPlans(data);
        const urlPlan = searchParams.get("plan");
        if (urlPlan && data.find((p) => p.id === urlPlan)) {
          setSelectedPlan(urlPlan);
          const found = data.find((p) => p.id === urlPlan);
          if (found) setActiveTab(found.target);
        } else {
          // Default to monthly individual
          const monthly = data.find((p) => p.type === "monthly" && p.target === "individual");
          setSelectedPlan(monthly?.id || data[0].id);
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

  const initTapCard = () => {
    if (!window.CardSDK) return;
    try {
      const { renderTapCard } = window.CardSDK;
      renderTapCard("card-element", {
        publicKey: TAP_PUBLISHABLE_KEY,
        transaction: { amount: "1", currency: "SAR" },
        customer: { editable: true },
        acceptance: { supportedBrands: ["VISA", "MASTERCARD", "MADA", "AMERICAN_EXPRESS"], supportedCards: "ALL" },
        fields: { cardHolder: true },
        addons: { displayPaymentBrands: true, loader: true },
        interface: { locale: language === "ar" ? "ar" : "en", theme: "dark", edges: "curved", direction: dir },
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
          description: language === "ar"
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
          description: language === "ar"
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
        description: language === "ar"
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
  const filteredPlans = plans.filter((p) => p.target === activeTab);

  const getPriceLabel = (type: string) => {
    if (type === "weekly") return t("sarWeek");
    if (type === "yearly") return t("sarYear");
    return t("sarMonth");
  };

  const isPopular = (plan: Plan) => plan.type === "monthly" && plan.target === "individual";

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
      <div className="relative z-10 flex-1 flex flex-col items-center p-6">
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

          {/* Trial banner */}
          {subscription?.status === "trialing" && (
            <div className="max-w-lg mx-auto mb-6 bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 text-sm text-center text-primary">
              <Clock className="w-4 h-4 inline-block me-1 mb-0.5" />
              {language === "ar"
                ? `تجربتك المجانية تنتهي خلال ${subscription.trial_days_remaining} أيام — أضف بطاقتك الآن لمواصلة الاشتراك بدون انقطاع`
                : `Your free trial ends in ${subscription.trial_days_remaining} days — add your card now to continue without interruption`}
            </div>
          )}

          {/* Plan Selection Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-8">
            <TabsList className="w-full max-w-md mx-auto bg-secondary/50 backdrop-blur-sm border border-border/50">
              <TabsTrigger value="individual" className="flex-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all">
                {t("tab_individual")}
              </TabsTrigger>
              <TabsTrigger value="corporate" className="flex-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all">
                {t("tab_corporate")}
              </TabsTrigger>
              <TabsTrigger value="contractor" className="flex-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all">
                {t("tab_contractor")}
              </TabsTrigger>
            </TabsList>

            {(["individual", "corporate", "contractor"] as const).map((tab) => (
              <TabsContent key={tab} value={tab}>
                <div className={`grid gap-4 mb-6 ${
                  tab === "individual" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 max-w-sm mx-auto"
                }`}>
                  {filteredPlans.map((plan, i) => {
                    const selected = plan.id === selectedPlan;
                    const popular = isPopular(plan);

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
                            {language === "ar" ? plan.name_ar : plan.name_en}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-center pb-4">
                          <div className="text-3xl font-bold text-primary">
                            {(plan.price_amount / 100).toFixed(0)}
                            <span className="text-sm text-muted-foreground ms-1">{getPriceLabel(plan.type)}</span>
                          </div>
                          <div className="flex items-center justify-center gap-2 mt-2 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3 text-primary" />
                            <span>{t("freeTrialDays")}</span>
                          </div>
                          {selected && (
                            <div className="mt-2">
                              <CheckCircle className="w-5 h-5 text-primary mx-auto" />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Selected Plan Summary */}
          {currentPlan && (
            <div className="max-w-lg mx-auto">
              <div className="flex items-center justify-center gap-2 mb-4 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-primary" />
                <span>{t("cancelAnytime")}</span>
                <span className="mx-2">•</span>
                <CheckCircle className="w-4 h-4 text-primary" />
                <span>{t("fullAccess")}</span>
              </div>

              {/* Verification note */}
              <div className="bg-muted/30 border border-border/50 rounded-lg p-3 mb-4 text-xs text-muted-foreground text-center">
                <CreditCard className="w-4 h-4 inline-block ms-1" />
                {isReturningUser ? t("verificationChargeReturning") : t("verificationCharge")}
              </div>

              {/* Card Element */}
              <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-xl p-4 mb-4">
                <div id="card-element" className="min-h-[120px] flex items-center justify-center">
                  {!sdkLoaded && <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}
                </div>
              </div>

              {/* Subscribe Button */}
              <Button
                variant="hero"
                size="lg"
                className="w-full"
                onClick={handleSubscribe}
                disabled={!cardReady || processing || !selectedPlan}
              >
                {processing ? (
                  <Loader2 className="w-5 h-5 animate-spin ms-2" />
                ) : (
                  <CreditCard className="w-5 h-5 ms-2" />
                )}
                {isReturningUser ? t("startSubscription") : t("startFreeTrial")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Subscribe;
