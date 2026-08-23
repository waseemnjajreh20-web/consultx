import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Shield, Clock, CheckCircle, Loader2, ArrowRight, ArrowLeft, Sparkles, Lock, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LanguageToggle } from "@/components/LanguageToggle";
import consultxIcon from "@/assets/consultx-icon.png";
import { isFounding10Active, FOUNDING10_CODE, FOUNDING10_CAMPAIGN } from "@/lib/campaigns/founding10";
import { isEid50Active, EID50_CODE, EID50_CAMPAIGN, EID50_PRICING } from "@/lib/campaigns/eid50";
import {
  EMPTY_CARD,
  formatCardNumber,
  validateCard,
  buildMoyasarTokenPayload,
  type CardForm,
} from "@/lib/payment/card";

const MOYASAR_PUBLISHABLE_KEY = (import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY as string)?.trim();
const MOYASAR_TOKENS_ENDPOINT = "https://api.moyasar.com/v1/tokens";

function getPlanDisplayName(_slug: string, nameAr: string, nameEn: string, isAr: boolean): string {
  return isAr ? nameAr : nameEn;
}

interface Plan {
  id: string;
  name_ar: string;
  name_en: string;
  slug: string;
  price_amount: number;
  price_per_seat: number | null;
  min_seats: number;
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

// Slugs hidden from public self-service checkout.
// 'enterprise' is the legacy 349 SAR flat plan — kept active in DB for the
// existing trialing subscriber but no longer publicly purchasable.
const HIDDEN_PUBLIC_SLUGS = new Set(["free", "enterprise"]);
const PER_SEAT_SLUGS = new Set(["enterprise_team", "enterprise_office"]);

type SeatState = Record<string, number>;

/**
 * Exactly the pricing fields moyasar-create-subscription returns
 * (supabase/functions/moyasar-create-subscription/index.ts). Amounts are
 * halalas and are produced by the same helper that produces the real charge.
 */
type CheckoutQuote = {
  flow: string;
  amount: number;
  plan_price: number;
  verification_credit: number;
  description: string;
  promo_code: string | null;
  // The plan/seats this payment session is FOR. On a live `trialing` /
  // `past_due` row the backend deliberately does NOT write them to the
  // subscription before payment (defect C1), so they must be echoed back to
  // moyasar-initiate-token-payment, which re-validates and re-prices them.
  plan_id: string | null;
  seat_count: number | null;
};

const Subscribe = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session, authLoading, subscription, subLoading, isReturningUser, isPaidActive, isTrialActive, trialDaysRemaining } = useEntitlement();
  const { t, dir, language } = useLanguage();
  const { toast } = useToast();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [seatCounts, setSeatCounts] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [pendingGivenId, setPendingGivenId] = useState<string | null>(null);
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Server-computed checkout quote (billing contract Section 6). The amount the
  // user sees must be the amount the server will charge, so once
  // moyasar-create-subscription has answered we render ITS amount/description
  // and stop recomputing anything locally.
  const [checkoutQuote, setCheckoutQuote] = useState<CheckoutQuote | null>(null);

  const promoCode = searchParams.get("promo");
  const founding10Active = promoCode === FOUNDING10_CODE && isFounding10Active();
  const eid50Active = promoCode === EID50_CODE && isEid50Active();

  const [card, setCard] = useState<CardForm>(EMPTY_CARD);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CardForm, true>>>({});

  const debugMode = searchParams.get("debugPayment") === "1" || searchParams.get("debugPayment") === "true";

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!subLoading && isPaidActive) navigate("/");
  }, [isPaidActive, subLoading, navigate]);

  // A quote is only valid for the plan + seat count it was requested with.
  // Drop it the moment either changes so a stale amount can never be displayed.
  useEffect(() => {
    setCheckoutQuote(null);
  }, [selectedPlan, seatCounts]);

  useEffect(() => {
    const fetchPlans = async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price_amount", { ascending: true });
      if (data && data.length > 0) {
        // Hide free + legacy 'enterprise' from public checkout.
        const visible: Plan[] = (data as unknown as Plan[]).filter((p) => !HIDDEN_PUBLIC_SLUGS.has(p.slug));
        // For EID50, restrict visible plans to "pro" only (enterprise deferred)
        const campaignVisible = eid50Active
          ? visible.filter((p) => p.slug === "pro")
          : visible;
        setPlans(campaignVisible);
        // Initialise seat count for per-seat plans at min_seats.
        const initialSeats: Record<string, number> = {};
        for (const p of campaignVisible) {
          if (PER_SEAT_SLUGS.has(p.slug)) {
            initialSeats[p.id] = Math.max(1, p.min_seats ?? 1);
          }
        }
        setSeatCounts(initialSeats);
        const urlPlan = searchParams.get("plan");
        const matchedPlan = urlPlan ? campaignVisible.find((p) => p.id === urlPlan || p.slug === urlPlan) : null;
        if (founding10Active || eid50Active) {
          const proPlan = campaignVisible.find((p) => p.slug === "pro");
          setSelectedPlan(proPlan?.id || campaignVisible[0].id);
        } else if (matchedPlan) {
          setSelectedPlan(matchedPlan.id);
        } else {
          const proPlan = visible.find((p) => p.slug === "pro");
          setSelectedPlan(proPlan?.id || visible[0].id);
        }
      }
    };
    fetchPlans();
  }, [searchParams, eid50Active, founding10Active]);

  const resetCardState = () => {
    setCard(EMPTY_CARD);
    setFieldErrors({});
    setFormError(null);
  };

  const openPaymentModal = async () => {
    if (!selectedPlan || !session || processing) return;
    const plan = plans.find((p) => p.id === selectedPlan);
    const isPerSeat = plan ? PER_SEAT_SLUGS.has(plan.slug) : false;
    const seatCount = isPerSeat ? seatCounts[selectedPlan] : undefined;
    if (isPerSeat && plan) {
      const minSeats = Math.max(1, plan.min_seats ?? 1);
      if (!seatCount || seatCount < minSeats) {
        toast({
          title: t("errorTitle"),
          description: language === "ar"
            ? `الحد الأدنى لعدد المستخدمين هو ${minSeats}`
            : `Minimum seat count is ${minSeats}`,
          variant: "destructive",
        });
        return;
      }
    }
    setProcessing(true);
    try {
      const body: Record<string, unknown> = isPerSeat ? { plan_id: selectedPlan, seat_count: seatCount } : { plan_id: selectedPlan };
      if (founding10Active) {
        body.promo_code = FOUNDING10_CODE;
      } else if (eid50Active) {
        body.promo_code = EID50_CODE;
      }
      const { data, error } = await supabase.functions.invoke("moyasar-create-subscription", {
        body,
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
      // Billing contract Section 6: display the server's amount + description,
      // never a locally recomputed one. Only accept a well-formed quote.
      setCheckoutQuote(
        typeof data.amount === "number" && Number.isFinite(data.amount) && typeof data.description === "string"
          ? {
              flow: String(data.flow ?? ""),
              amount: data.amount,
              plan_price: typeof data.plan_price === "number" ? data.plan_price : data.amount,
              verification_credit: typeof data.verification_credit === "number" ? data.verification_credit : 0,
              description: data.description,
              promo_code: typeof data.promo_code === "string" ? data.promo_code : null,
              plan_id: typeof data.plan_id === "string" ? data.plan_id : null,
              seat_count: typeof data.seat_count === "number" ? data.seat_count : null,
            }
          : null,
      );
      resetCardState();
      setPaymentModalOpen(true);
    } catch (err) {
      console.error("openPaymentModal error:", err instanceof Error ? err.message : err);
      toast({
        title: t("errorTitle"),
        description: language === "ar" ? "حدث خطأ غير متوقع" : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    if (!MOYASAR_PUBLISHABLE_KEY) {
      setFormError(language === "ar" ? "خطأ في إعدادات الدفع" : "Payment configuration error");
      return;
    }
    if (!pendingGivenId || !pendingSubscriptionId || !session) {
      setFormError(language === "ar" ? "انتهت جلسة الدفع، يرجى المحاولة مرة أخرى" : "Payment session expired. Please retry.");
      return;
    }

    const { ok, errors } = validateCard(card);
    setFieldErrors(errors);
    if (!ok) {
      setFormError(language === "ar" ? "يرجى التحقق من بيانات البطاقة" : "Please check the card details.");
      return;
    }

    setSubmitting(true);

    const tokenPayload = buildMoyasarTokenPayload(card, MOYASAR_PUBLISHABLE_KEY);

    let token: string | null = null;
    try {
      const tokenResp = await fetch(MOYASAR_TOKENS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenPayload),
      });
      const tokenJson: { id?: unknown; message?: unknown } = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok) {
        const safeMessage = typeof tokenJson?.message === "string"
          ? tokenJson.message
          : language === "ar" ? "تعذّر التحقق من البطاقة" : "Card could not be verified";
        setFormError(safeMessage);
        setSubmitting(false);
        return;
      }
      if (typeof tokenJson?.id !== "string" || !tokenJson.id) {
        setFormError(language === "ar" ? "تعذّر إنشاء رمز البطاقة" : "Failed to create card token.");
        setSubmitting(false);
        return;
      }
      token = tokenJson.id;
    } catch {
      setFormError(language === "ar" ? "تعذّر الاتصال بمزود الدفع" : "Could not reach payment provider.");
      setSubmitting(false);
      return;
    } finally {
      // Wipe card state from React immediately, regardless of outcome.
      setCard(EMPTY_CARD);
    }

    if (!token) {
      setSubmitting(false);
      return;
    }

    try {
      const initiateBody: Record<string, unknown> = {
        token,
        subscription_id: pendingSubscriptionId,
        given_id: pendingGivenId,
      };
      // Echo the quoted plan/seats so the server charges — and later promotes —
      // exactly what was quoted. Server-side re-validated; omitted values fall
      // back to whatever is stored on the subscription row.
      if (checkoutQuote?.plan_id) initiateBody.plan_id = checkoutQuote.plan_id;
      if (typeof checkoutQuote?.seat_count === "number") initiateBody.seat_count = checkoutQuote.seat_count;
      if (founding10Active) {
        initiateBody.promo_code = FOUNDING10_CODE;
      } else if (eid50Active) {
        initiateBody.promo_code = EID50_CODE;
      }
      const { data, error } = await supabase.functions.invoke("moyasar-initiate-token-payment", {
        body: initiateBody,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error || !data?.success) {
        const detail = (data?.error || data?.detail);
        setFormError(typeof detail === "string"
          ? detail
          : language === "ar" ? "تعذّر بدء عملية الدفع" : "Could not start payment.");
        setSubmitting(false);
        return;
      }

      const transactionUrl: string | null = data.transaction_url ?? null;
      const paymentId: string | null = data.payment_id ?? null;

      if (transactionUrl) {
        // 3DS / authorize redirect — Moyasar will eventually redirect to /payment-callback.
        window.location.assign(transactionUrl);
        return;
      }

      // No transaction_url means the payment did not enter 3DS — poll via the
      // existing PaymentCallback flow which is the source of truth.
      const callbackUrl = paymentId
        ? `/payment-callback?id=${encodeURIComponent(paymentId)}&status=${encodeURIComponent(data.status ?? "")}`
        : `/payment-callback`;
      navigate(callbackUrl);
    } catch (err) {
      console.error("initiate-token-payment error:", err instanceof Error ? err.message : err);
      setFormError(language === "ar" ? "حدث خطأ غير متوقع" : "An unexpected error occurred.");
      setSubmitting(false);
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

  // Billing contract 2026-08-23 (docs/launch/billing-contract-20260823.md Section 1):
  // the seller is NOT VAT-registered, so the plan price is the whole amount
  // charged — no tax component is computed, displayed, or implied here.
  const isPerSeatSelected = currentPlan ? PER_SEAT_SLUGS.has(currentPlan.slug) : false;
  const selectedSeatCount = currentPlan && isPerSeatSelected
    ? (seatCounts[currentPlan.id] ?? Math.max(1, currentPlan.min_seats ?? 1))
    : 1;
  const selectedTotalHalalas = currentPlan
    ? (isPerSeatSelected ? (currentPlan.price_per_seat ?? 0) * selectedSeatCount : currentPlan.price_amount)
    : 0;
  const selectedTotalSar = selectedTotalHalalas / 100;

  // Billing contract Section 6: once moyasar-create-subscription has answered,
  // the screen renders ITS amount and description. The local figures above are
  // only a pre-checkout estimate for the plan grid, used until the quote exists.
  // Never decide the trial copy from `isTrialActive` when a quote is available —
  // the server's `flow` is the authority (a lapsed `trialing` row is charged
  // post_trial_first_charge, not 1.00 SAR).
  const quoteIsCardVerification = checkoutQuote
    ? checkoutQuote.flow === "trial_card_verification"
    : isTrialActive;
  const displayTotalHalalas = checkoutQuote ? checkoutQuote.amount : selectedTotalHalalas;
  const displayTotalSar = displayTotalHalalas / 100;
  const displayDescription = checkoutQuote?.description ?? null;

  const getPriceLabel = (type: string) => {
    if (type === "weekly") return t("sarWeek");
    if (type === "yearly") return t("sarYear");
    return t("sarMonth");
  };

  const inputBase = "h-11 bg-background/60";
  const fieldClass = (key: keyof CardForm) =>
    `${inputBase} ${fieldErrors[key] ? "border-destructive focus-visible:ring-destructive" : ""}`;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="fixed inset-0 blueprint-grid opacity-30 pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/30">
        <Button variant="ghost" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
          {dir === "rtl" ? <ArrowRight className="ms-2 w-4 h-4" /> : <ArrowLeft className="me-2 w-4 h-4" />}
          {t("backToHome")}
        </Button>
        <LanguageToggle />
      </header>

      <div className="relative z-10 flex-1 flex flex-col items-center p-6 pb-24 md:pb-6">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <img src={consultxIcon} alt="ConsultX" className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gradient">
              {isReturningUser ? t("resubscribeNow") : t("subscribePage")}
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              {isReturningUser ? t("resubscribeSubtitle") : t("subscribeSubtitle")}
            </p>
          </div>

          {isTrialActive && !isReturningUser && (
            <div className="max-w-lg mx-auto mb-6 bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 text-sm text-center text-primary">
              <Clock className="w-4 h-4 inline-block me-1 mb-0.5" />
              {language === "ar"
                ? `تجربتك المجانية تنتهي خلال ${trialDaysRemaining || subscription?.trial_days_remaining || 0} أيام — أضف بطاقتك الآن لمواصلة الاشتراك بدون انقطاع`
                : `Your free trial ends in ${trialDaysRemaining || subscription?.trial_days_remaining || 0} days — add your card now to continue without interruption`}
            </div>
          )}

          {founding10Active && (
            <div className="max-w-lg mx-auto mb-6 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent border border-primary/40 rounded-xl px-5 py-4 text-center">
              <Gift className="w-6 h-6 text-primary mx-auto mb-2" />
              <h3 className="text-base font-bold text-foreground mb-1">
                {language === "ar" ? FOUNDING10_CAMPAIGN.title.ar : FOUNDING10_CAMPAIGN.title.en}
              </h3>
              <p className="text-sm text-muted-foreground mb-1">
                {language === "ar" ? FOUNDING10_CAMPAIGN.offer.ar : FOUNDING10_CAMPAIGN.offer.en}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {language === "ar" ? FOUNDING10_CAMPAIGN.afterFirstMonth.ar : FOUNDING10_CAMPAIGN.afterFirstMonth.en}
              </p>
            </div>
          )}

          {eid50Active && (
            <div className="max-w-lg mx-auto mb-6 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/40 rounded-xl px-5 py-4 text-center">
              <Gift className="w-6 h-6 text-amber-500 mx-auto mb-2" />
              <h3 className="text-base font-bold text-foreground mb-1">
                {language === "ar" ? EID50_CAMPAIGN.title.ar : EID50_CAMPAIGN.title.en}
              </h3>
              <p className="text-sm text-muted-foreground mb-1">
                {language === "ar" ? EID50_CAMPAIGN.offer.ar : EID50_CAMPAIGN.offer.en}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {language === "ar" ? EID50_CAMPAIGN.afterFirstMonth.ar : EID50_CAMPAIGN.afterFirstMonth.en}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 max-w-4xl mx-auto">
            {plans.map((plan, i) => {
              const selected = plan.id === selectedPlan;
              const popular = plan.slug === "pro";
              const isPerSeat = PER_SEAT_SLUGS.has(plan.slug);
              const minSeats = Math.max(1, plan.min_seats ?? 1);
              const seatCount = isPerSeat ? (seatCounts[plan.id] ?? minSeats) : 1;
              const perSeatSar = (plan.price_per_seat ?? 0) / 100;
              const monthlyTotalSar = isPerSeat
                ? perSeatSar * seatCount
                : plan.price_amount / 100;
              return (
                <Card
                  key={plan.id}
                  className={`cursor-pointer transition-all duration-300 animate-fade-up hover:scale-[1.02] ${
                    selected
                      ? "border-glow bg-card/90"
                      : "border-border/50 bg-card/50 hover:border-primary/30"
                  }`}
                  style={{ animationDelay: `${i * 0.1}s` }}
                  onClick={() => {
                    if ((founding10Active || eid50Active) && plan.slug !== "pro") return;
                    setSelectedPlan(plan.id);
                  }}
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
                    {isPerSeat ? (
                      <>
                        <div className="text-3xl font-bold text-primary">
                          {perSeatSar.toFixed(0)}
                          <span className="text-sm text-muted-foreground ms-1">
                            {language === "ar" ? "ريال / مستخدم / شهر" : "SAR / user / mo"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {language === "ar"
                            ? `الحد الأدنى ${minSeats} مستخدمين`
                            : `Minimum ${minSeats} users`}
                        </div>
                        <div
                          className="mt-3 flex items-center justify-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="w-8 h-8 rounded-md border border-border/60 text-foreground hover:border-primary/60 disabled:opacity-40"
                            disabled={seatCount <= minSeats}
                            onClick={() => setSeatCounts((prev) => ({
                              ...prev,
                              [plan.id]: Math.max(minSeats, (prev[plan.id] ?? minSeats) - 1),
                            }))}
                            aria-label={language === "ar" ? "إنقاص" : "Decrease"}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={minSeats}
                            max={100}
                            value={seatCount}
                            onChange={(e) => {
                              const raw = parseInt(e.target.value, 10);
                              const clamped = Math.min(100, Math.max(minSeats, Number.isFinite(raw) ? raw : minSeats));
                              setSeatCounts((prev) => ({ ...prev, [plan.id]: clamped }));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-16 h-8 text-center text-sm rounded-md bg-background/60 border border-border/60"
                            dir="ltr"
                            aria-label={language === "ar" ? "عدد المستخدمين" : "Seat count"}
                          />
                          <button
                            type="button"
                            className="w-8 h-8 rounded-md border border-border/60 text-foreground hover:border-primary/60 disabled:opacity-40"
                            disabled={seatCount >= 100}
                            onClick={() => setSeatCounts((prev) => ({
                              ...prev,
                              [plan.id]: Math.min(100, (prev[plan.id] ?? minSeats) + 1),
                            }))}
                            aria-label={language === "ar" ? "زيادة" : "Increase"}
                          >
                            +
                          </button>
                        </div>
                        <div className="text-sm font-semibold text-foreground mt-2">
                          {language === "ar"
                            ? `الإجمالي: ${monthlyTotalSar.toFixed(0)} ريال / شهر`
                            : `Total: ${monthlyTotalSar.toFixed(0)} SAR / month`}
                        </div>
                      </>
                    ) : (
                      <div className="text-3xl font-bold text-primary">
                        {plan.price_amount === 0
                          ? language === "ar" ? "مجاني" : "Free"
                          : (plan.price_amount / 100).toFixed(0)}
                        {plan.price_amount > 0 && (
                          <span className="text-sm text-muted-foreground ms-1">{getPriceLabel(plan.type)}</span>
                        )}
                      </div>
                    )}
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

          {currentPlan && (
            <div className="max-w-lg mx-auto">
              <div className="flex items-center justify-center gap-2 mb-6 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-primary" />
                <span>{t("cancelAnytime")}</span>
                <span className="mx-2">•</span>
                <CheckCircle className="w-4 h-4 text-primary" />
                <span>{t("fullAccess")}</span>
              </div>

              {/* Honest trial/immediate-charge copy — billing contract 2026-08-23 Section 5 */}
              <div className="mb-4 rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-center text-muted-foreground">
                <p>
                  {quoteIsCardVerification
                    ? (language === "ar"
                        ? `سيتم خصم ${displayTotalSar.toFixed(2)} ريال للتحقق من البطاقة، ويُخصم من أول فاتورة`
                        : `SAR ${displayTotalSar.toFixed(2)} will be charged to verify the card — deducted from your first invoice`)
                    : (language === "ar"
                        ? `سيتم تحصيل ${displayTotalSar.toFixed(2)} ريال الآن`
                        : `SAR ${displayTotalSar.toFixed(2)} will be charged now`)}
                </p>
                {displayDescription && (
                  <p className="mt-1 text-xs text-muted-foreground/80" dir="ltr">{displayDescription}</p>
                )}
              </div>

              <label className="flex items-start gap-2 mb-4 text-sm text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={termsAccepted}
                  onCheckedChange={(v) => setTermsAccepted(v === true)}
                  className="mt-0.5"
                />
                <span>
                  {language === "ar" ? "أوافق على " : "I agree to the "}
                  <a href="/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {language === "ar" ? "الشروط والأحكام" : "Terms & Conditions"}
                  </a>
                  {language === "ar" ? " و" : " and "}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {language === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
                  </a>
                </span>
              </label>

              <Button
                variant="hero"
                size="lg"
                className="w-full"
                onClick={openPaymentModal}
                disabled={!selectedPlan || processing || !termsAccepted}
              >
                {processing ? (
                  <>
                    {quoteIsCardVerification ? t("activateAndAddCard") : t("startSubscription")}
                    <Loader2 className="w-5 h-5 ms-2 animate-spin" />
                  </>
                ) : (
                  <>
                    {quoteIsCardVerification ? t("activateAndAddCard") : t("startSubscription")}
                    {dir === "rtl"
                      ? <ArrowLeft className="w-5 h-5 me-2" />
                      : <ArrowRight className="w-5 h-5 ms-2" />}
                  </>
                )}
              </Button>
            </div>
          )}

          <Dialog
            open={paymentModalOpen}
            onOpenChange={(open) => {
              if (submitting) return;
              setPaymentModalOpen(open);
              if (!open) {
                setPendingGivenId(null);
                setPendingSubscriptionId(null);
                setCheckoutQuote(null);
                resetCardState();
              }
            }}
          >
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{language === "ar" ? "تفاصيل الدفع" : "Payment Details"}</DialogTitle>
                <DialogDescription>
                  {quoteIsCardVerification
                    ? (language === "ar"
                        ? `سيتم خصم ${displayTotalSar.toFixed(2)} ريال للتحقق من البطاقة، ويُخصم من أول فاتورة.`
                        : `SAR ${displayTotalSar.toFixed(2)} will be charged to verify the card — deducted from your first invoice.`)
                    : (language === "ar"
                        ? `سيتم تحصيل ${displayTotalSar.toFixed(2)} ريال الآن.`
                        : `SAR ${displayTotalSar.toFixed(2)} will be charged now.`)}
                  {displayDescription && (
                    <span className="block mt-1 text-xs" dir="ltr">{displayDescription}</span>
                  )}
                </DialogDescription>
              </DialogHeader>

              {debugMode && (
                <div className="px-2 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded text-xs font-mono text-yellow-400 text-center" dir="ltr">
                  ⚙ debug=on — flow: tokens.moyasar.com → moyasar-initiate-token-payment → callback
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 mt-2" dir={dir}>
                <div className="space-y-1.5">
                  <Label htmlFor="card-name">
                    {language === "ar" ? "اسم حامل البطاقة" : "Cardholder name"}
                  </Label>
                  <Input
                    id="card-name"
                    type="text"
                    autoComplete="cc-name"
                    inputMode="text"
                    placeholder={language === "ar" ? "كما هو مطبوع على البطاقة" : "As printed on the card"}
                    value={card.name}
                    onChange={(e) => setCard({ ...card, name: e.target.value })}
                    className={fieldClass("name")}
                    disabled={submitting}
                    dir="ltr"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="card-number">
                    {language === "ar" ? "رقم البطاقة" : "Card number"}
                  </Label>
                  <Input
                    id="card-number"
                    type="text"
                    autoComplete="cc-number"
                    inputMode="numeric"
                    placeholder="1234 5678 9012 3456"
                    value={card.number}
                    onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                    className={fieldClass("number")}
                    disabled={submitting}
                    dir="ltr"
                    maxLength={23}
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="card-month">
                      {language === "ar" ? "الشهر" : "Month"}
                    </Label>
                    <Input
                      id="card-month"
                      type="text"
                      autoComplete="cc-exp-month"
                      inputMode="numeric"
                      placeholder="MM"
                      value={card.month}
                      onChange={(e) => setCard({ ...card, month: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                      className={fieldClass("month")}
                      disabled={submitting}
                      dir="ltr"
                      maxLength={2}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card-year">
                      {language === "ar" ? "السنة" : "Year"}
                    </Label>
                    <Input
                      id="card-year"
                      type="text"
                      autoComplete="cc-exp-year"
                      inputMode="numeric"
                      placeholder="YY"
                      value={card.year}
                      onChange={(e) => setCard({ ...card, year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      className={fieldClass("year")}
                      disabled={submitting}
                      dir="ltr"
                      maxLength={4}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card-cvc">
                      {language === "ar" ? "CVC" : "CVC"}
                    </Label>
                    <Input
                      id="card-cvc"
                      type="text"
                      autoComplete="cc-csc"
                      inputMode="numeric"
                      placeholder="123"
                      value={card.cvc}
                      onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      className={fieldClass("cvc")}
                      disabled={submitting}
                      dir="ltr"
                      maxLength={4}
                      required
                    />
                  </div>
                </div>

                {formError && (
                  <div className="text-sm text-destructive text-center" role="alert">
                    {formError}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="hero"
                  className="w-full mt-2"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      {language === "ar" ? "جارٍ التحقق..." : "Verifying…"}
                    </>
                  ) : (
                    language === "ar" ? "التحقق من البطاقة والمتابعة" : "Verify card and continue"
                  )}
                </Button>

                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
                  <Lock className="w-3 h-3" />
                  {language === "ar"
                    ? "ترسل بيانات البطاقة مباشرة إلى Moyasar وليس إلى ConsultX."
                    : "Card details are sent directly to Moyasar, never to ConsultX."}
                </p>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default Subscribe;
