import { useState, useEffect, useRef } from "react";
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

const MOYASAR_PUBLISHABLE_KEY = (import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY as string)?.trim();
const SDK_JS_URL = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
const SDK_CSS_URL = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";

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
  const [formError, setFormError] = useState<string | null>(null);

  // Debug mode: ?debugPayment=1 or ?debugPayment=true
  const dbgParam = searchParams.get("debugPayment");
  const debugMode = dbgParam === "1" || dbgParam === "true";
  const [dbgLines, setDbgLines] = useState<string[]>([]);
  const [dbgReady, setDbgReady] = useState(false); // true as soon as modal opens
  interface DbgFinal {
    initCalled: boolean; initThrew: boolean; initError: string | null;
    children8s: number | null; inputs8s: number | null; iframes8s: number | null;
    network: string[]; rootCause: string;
  }
  const [dbgFinal, setDbgFinal] = useState<DbgFinal | null>(null);
  const dbgLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!subLoading && isPaidActive) navigate("/");
  }, [isPaidActive, subLoading, navigate]);

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
        const matchedPlan = urlPlan ? data.find((p) => p.id === urlPlan || p.slug === urlPlan) : null;
        if (matchedPlan) {
          setSelectedPlan(matchedPlan.id);
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
      if (window.Moyasar) setSdkLoaded(true);
      else existingScript.addEventListener('load', () => setSdkLoaded(true));
      return;
    }
    if (!document.querySelector('link[href*="moyasar"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = SDK_CSS_URL;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = SDK_JS_URL;
    script.async = true;
    script.onload = () => setSdkLoaded(true);
    script.onerror = () => console.error("Moyasar SDK failed to load");
    document.body.appendChild(script);
  }, []);

  // Capture initial debug state immediately when modal opens
  useEffect(() => {
    if (!paymentModalOpen) return;
    if (!debugMode) return;
    setDbgReady(true);
    const keyRaw = MOYASAR_PUBLISHABLE_KEY ?? "";
    const keyLen = keyRaw.length;
    const keyPreview = keyLen > 10
      ? `${keyRaw.slice(0, 6)}...${keyRaw.slice(-4)} (len=${keyLen})`
      : `(len=${keyLen} — POSSIBLY MISSING OR TOO SHORT)`;
    const keyHasWs = /\s/.test(keyRaw);
    const cssPresent = !!document.querySelector(`link[href*="moyasar"]`);
    const scriptPresent = !!document.querySelector(`script[src*="moyasar"]`);
    setDbgLines([
      `=== DEBUG PAYMENT v2 ===`,
      `url: ${window.location.href}`,
      `debugPayment param: "${dbgParam}"`,
      `sdk js url: ${SDK_JS_URL}`,
      `sdk script tag in DOM: ${scriptPresent}`,
      `sdkLoaded (onload fired): ${sdkLoaded}`,
      `window.Moyasar exists: ${!!window.Moyasar}`,
      `typeof window.Moyasar: ${typeof window.Moyasar}`,
      `typeof window.Moyasar?.init: ${typeof window.Moyasar?.init}`,
      `sdk css tag in DOM: ${cssPresent}`,
      `key preview: ${keyPreview}`,
      `key has whitespace: ${keyHasWs}`,
      `amount: 100 SAR-halalas (=1 SAR)`,
      `currency: SAR`,
      `methods: ["creditcard"]`,
      `supported_networks: ["mada","visa","mastercard"]`,
      `--- waiting for init (300ms delay) ---`,
    ]);
  }, [paymentModalOpen]);

  // Init Moyasar form once modal is open and we have the pending IDs
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (paymentModalOpen && sdkLoaded && pendingGivenId && pendingSubscriptionId) {
      timer = setTimeout(() => initMoyasarForm(pendingGivenId, pendingSubscriptionId), 300);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [paymentModalOpen, sdkLoaded, pendingGivenId, pendingSubscriptionId]);

  const dbg = (line: string) => {
    if (debugMode) setDbgLines(prev => [...prev, line]);
  };

  const domSnapshot = (label: string) => {
    const el = document.getElementById("mysr-form");
    if (!el) { dbg(`[${label}] #mysr-form NOT in DOM`); return; }
    const children = el.childElementCount;
    const inputs = el.querySelectorAll("input").length;
    const iframes = el.querySelectorAll("iframe").length;
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
    dbg(`[${label}] children=${children} inputs=${inputs} iframes=${iframes} text="${text}"`);
  };

  const initMoyasarForm = (givenId: string, subscriptionId: string) => {
    setFormError(null);
    setDbgFinal(null);

    if (!window.Moyasar) {
      dbg(`[init] ABORT — window.Moyasar is ${typeof window.Moyasar}`);
      setFormError(language === "ar"
        ? "لم يتم تحميل بوابة الدفع. يرجى المحاولة مرة أخرى."
        : "Payment SDK unavailable. Please retry.");
      setDbgFinal({ initCalled: false, initThrew: false, initError: null, children8s: null, inputs8s: null, iframes8s: null, network: [], rootCause: "✗ ABORT: window.Moyasar missing after onload" });
      return;
    }

    const el = document.getElementById("mysr-form");
    if (!el) {
      dbg(`[init] ABORT — #mysr-form not found in DOM`);
      setFormError(language === "ar"
        ? "خطأ في تهيئة نموذج الدفع."
        : "Payment form container not found.");
      setDbgFinal({ initCalled: false, initThrew: false, initError: null, children8s: null, inputs8s: null, iframes8s: null, network: [], rootCause: "✗ ABORT: #mysr-form not in DOM when init called" });
      return;
    }

    dbg(`[init] #mysr-form found — childCount before: ${el.childElementCount}`);
    dbg(`[init] calling Moyasar.init...`);

    const plan = plans.find((p) => p.id === selectedPlan);
    let threw = false;
    let threwMsg = "";
    try {
      window.Moyasar.init({
        element: "#mysr-form",
        amount: 100,
        currency: "SAR",
        description: plan ? `Card verification for ${plan.name_en}` : "Card verification",
        publishable_api_key: MOYASAR_PUBLISHABLE_KEY,
        callback_url: `${window.location.origin}/payment-callback`,
        metadata: { subscription_id: subscriptionId, given_id: givenId },
        methods: ["creditcard"],
        supported_networks: ["mada", "visa", "mastercard"],
      });
      dbg(`[init] Moyasar.init() returned without throwing`);
    } catch (err: any) {
      threw = true;
      threwMsg = (err?.message || String(err)).slice(0, 200);
      dbg(`[init] THREW: ${threwMsg}`);
      setFormError(language === "ar"
        ? `خطأ في تهيئة الدفع: ${threwMsg}`
        : `Payment init error: ${threwMsg}`);
      setDbgFinal({ initCalled: true, initThrew: true, initError: threwMsg, children8s: null, inputs8s: null, iframes8s: null, network: [], rootCause: `✗ INIT THREW: ${threwMsg}` });
    }

    // Snapshots at 1s and 3s (scroll log only)
    setTimeout(() => domSnapshot("1s"), 1000);
    setTimeout(() => domSnapshot("3s"), 3000);

    // 8s: final diagnosis
    setTimeout(() => {
      if (threw) return; // already set dbgFinal in catch
      const el2 = document.getElementById("mysr-form");
      const children8s = el2?.childElementCount ?? -1;
      const inputs8s = el2 ? el2.querySelectorAll("input").length : -1;
      const iframes8s = el2 ? el2.querySelectorAll("iframe").length : -1;
      const text8s = (el2?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
      dbg(`[8s] children=${children8s} inputs=${inputs8s} iframes=${iframes8s} text="${text8s}"`);

      const netLines: string[] = [];
      try {
        const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const mpfEntries = entries.filter(e =>
          e.name.includes("moyasar") || e.name.includes("mpf") || e.name.includes("api.moyasar")
        );
        if (mpfEntries.length === 0) {
          netLines.push("no moyasar entries in performance API (XHR/fetch not visible here)");
        } else {
          mpfEntries.forEach(e => {
            const blocked = e.transferSize === 0 && e.duration < 5;
            netLines.push(`${e.name.split("/").slice(-2).join("/")} — ${Math.round(e.duration)}ms — size=${e.transferSize}${blocked ? " ⚠BLOCKED?" : ""}`);
          });
        }
        netLines.push("open DevTools > Network > filter 'moyasar' for XHR/fetch calls");
      } catch {
        netLines.push("performance API unavailable");
      }
      netLines.forEach(l => dbg(`[network] ${l}`));

      let rootCause: string;
      if (inputs8s > 0) {
        rootCause = "✓ FORM OK — input fields visible (form rendered successfully)";
      } else if (iframes8s > 0) {
        rootCause = "⚠ iframe rendered but inputs=0 — card fields may be inside iframe (normal for some SDKs); check if iframe loaded or shows error";
      } else if (children8s > 0) {
        rootCause = "⚠ DOM children exist but no inputs/iframes — SDK stuck in 'Loading' state; likely cause: Apple Pay check or api.moyasar.com call hanging/failing (CORS or 401)";
      } else {
        rootCause = "✗ SDK rendered NOTHING — likely: API key rejected by api.moyasar.com, CORS block on api.moyasar.com, or Moyasar.init() returned without mounting";
      }

      setDbgFinal({ initCalled: true, initThrew: false, initError: null, children8s, inputs8s, iframes8s, network: netLines, rootCause });
    }, 8000);
  };

  // Fail-fast: if no inputs after 8s, show error + retry
  useEffect(() => {
    if (!paymentModalOpen) return;
    const failTimer = setTimeout(() => {
      if (formError) return;
      const el = document.getElementById("mysr-form");
      const hasInput = !!el?.querySelector("input");
      if (!hasInput) {
        dbg(`[fail-fast] no input after 8s — triggering error state`);
        setFormError(language === "ar"
          ? "لم يتم تحميل نموذج الدفع خلال الوقت المحدد. يرجى المحاولة مرة أخرى."
          : "Payment form did not load in time. Please retry.");
      }
    }, 8000);
    return () => clearTimeout(failTimer);
  }, [paymentModalOpen, formError]);

  // Auto-scroll log to bottom on new lines
  useEffect(() => {
    if (dbgLogRef.current) {
      dbgLogRef.current.scrollTop = dbgLogRef.current.scrollHeight;
    }
  }, [dbgLines]);

  const retryPaymentForm = () => {
    setFormError(null);
    setDbgFinal(null);
    dbg(`--- RETRY ---`);
    const el = document.getElementById("mysr-form");
    if (el) el.innerHTML = "";
    if (pendingGivenId && pendingSubscriptionId) {
      setTimeout(() => initMoyasarForm(pendingGivenId, pendingSubscriptionId), 150);
    }
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

          {/* Trial banner */}
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
                {!sdkLoaded ? (
                  <>
                    <Loader2 className="w-5 h-5 me-2 animate-spin" />
                    {language === "ar" ? "جاري التحميل..." : "Loading..."}
                  </>
                ) : processing ? (
                  <>
                    {isTrialActive ? t("activateAndAddCard") : t("startSubscription")}
                    <Loader2 className="w-5 h-5 ms-2 animate-spin" />
                  </>
                ) : (
                  <>
                    {isTrialActive ? t("activateAndAddCard") : t("startSubscription")}
                    {dir === "rtl"
                      ? <ArrowLeft className="w-5 h-5 me-2" />
                      : <ArrowRight className="w-5 h-5 ms-2" />}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Payment Modal */}
          <Dialog
            open={paymentModalOpen}
            onOpenChange={(open) => {
              if (processing) return;
              setPaymentModalOpen(open);
              if (!open) {
                setPendingGivenId(null);
                setPendingSubscriptionId(null);
                setFormError(null);
                setDbgLines([]);
                setDbgReady(false);
                setDbgFinal(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{language === "ar" ? "تفاصيل الدفع" : "Payment Details"}</DialogTitle>
                <DialogDescription>
                  {isReturningUser ? t("verificationChargeReturning") : t("verificationCharge")}
                </DialogDescription>
              </DialogHeader>

              {/* DEBUG BANNER — always visible when debug mode active, independent of logs */}
              {debugMode && (
                <div className="px-2 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded text-xs font-mono text-yellow-400 text-center" dir="ltr">
                  ⚙ DEBUG PAYMENT MODE ACTIVE — dbgReady={String(dbgReady)} sdkLoaded={String(sdkLoaded)}
                </div>
              )}

              {/* Error state */}
              {formError && (
                <div className="my-4 flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-destructive">{formError}</p>
                  <Button variant="outline" size="sm" onClick={retryPaymentForm}>
                    {language === "ar" ? "إعادة المحاولة" : "Retry"}
                  </Button>
                </div>
              )}

              {/* Moyasar form container — always in DOM when modal is open so snapshots can check it */}
              <div className={formError ? "hidden" : "my-2"} dir="ltr">
                <div id="mysr-form" className="min-h-[180px]">
                  {!sdkLoaded && (
                    <div className="flex items-center justify-center h-[180px]">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>

              {/* FINAL DIAGNOSIS — pinned, always above scroll, populated at 8s */}
              {debugMode && dbgFinal && (
                <div className="mt-2 border border-orange-500/60 rounded bg-black/80 overflow-hidden" dir="ltr">
                  <div className="px-2 py-1 bg-orange-500/20 text-orange-300 text-xs font-mono font-bold">
                    ⚡ FINAL DIAGNOSIS
                  </div>
                  <div className="p-2 text-xs font-mono space-y-1">
                    <div className={dbgFinal.initCalled ? "text-green-400" : "text-red-400"}>
                      init called: {String(dbgFinal.initCalled)}
                    </div>
                    <div className={dbgFinal.initThrew ? "text-red-400" : "text-green-400"}>
                      init threw: {String(dbgFinal.initThrew)}{dbgFinal.initError ? ` — ${dbgFinal.initError}` : ""}
                    </div>
                    {dbgFinal.children8s !== null && (
                      <div className={dbgFinal.inputs8s === 0 ? "text-red-400" : "text-green-400"}>
                        @8s — children: {dbgFinal.children8s} | inputs: {dbgFinal.inputs8s} | iframes: {dbgFinal.iframes8s}
                      </div>
                    )}
                    {dbgFinal.network.map((n, i) => (
                      <div key={i} className={n.includes("⚠") ? "text-yellow-400" : "text-cyan-300"}>{n}</div>
                    ))}
                    <div className={dbgFinal.rootCause.startsWith("✓") ? "text-green-400 font-bold" : dbgFinal.rootCause.startsWith("⚠") ? "text-yellow-400 font-bold" : "text-red-400 font-bold"}>
                      ROOT CAUSE: {dbgFinal.rootCause}
                    </div>
                  </div>
                </div>
              )}

              {/* DEBUG LOG — scrollable, auto-scrolls to bottom */}
              {debugMode && (
                <div className="mt-2 border border-yellow-500/30 rounded bg-black/60 overflow-hidden" dir="ltr">
                  <div className="px-2 py-1 bg-yellow-500/10 text-yellow-400 text-xs font-mono font-bold">
                    PAYMENT DEBUG LOG ({dbgLines.length} lines)
                  </div>
                  <div ref={dbgLogRef} className="p-2 text-xs font-mono space-y-0.5 max-h-48 overflow-y-auto text-green-300">
                    {dbgLines.length === 0
                      ? <div className="text-yellow-400/60">waiting for modal init...</div>
                      : dbgLines.map((line, i) => (
                          <div key={i} className={line.includes("ABORT") || line.includes("THREW") || line.includes("MISSING") || line.includes("FAIL") ? "text-red-400" : line.startsWith("===") || line.startsWith("---") ? "text-yellow-400" : "text-green-300"}>
                            {line}
                          </div>
                        ))
                    }
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default Subscribe;
