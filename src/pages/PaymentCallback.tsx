import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, Loader2, CreditCard, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type CallbackStatus = "loading" | "success_trial" | "success_active" | "failed" | "pending";

const PaymentCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const { session } = useAuth();
  const [status, setStatus] = useState<CallbackStatus>("loading");

  useEffect(() => {
    const tapId = searchParams.get("tap_id");
    // Tap may include a ?status= param in the redirect URL (e.g. CAPTURED, FAILED, CANCELLED).
    // Only use it for fast-fail — never to confirm success, which must always be
    // verified against our own DB via check-subscription.
    const tapRedirectStatus = searchParams.get("status")?.toUpperCase();

    if (!tapId) {
      setStatus("failed");
      return;
    }

    // Fast-fail on definitive Tap-reported failures — skip polling entirely.
    if (tapRedirectStatus === "CANCELLED" || tapRedirectStatus === "FAILED") {
      setStatus("failed");
      return;
    }

    const checkPayment = async () => {
      // Wait up to 6s for auth session to be available (race condition on redirect)
      let activeSession = session;
      if (!activeSession) {
        for (let wait = 0; wait < 12; wait++) {
          await new Promise((r) => setTimeout(r, 500));
          const { data } = await supabase.auth.getSession();
          if (data?.session) {
            activeSession = data.session;
            break;
          }
        }
      }

      if (!activeSession) {
        setStatus("failed");
        return;
      }

      // Retry loop: wait up to 25s for webhook to process (10 attempts × 2.5s)
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 2500));
        try {
          const { data, error } = await supabase.functions.invoke("check-subscription", {
            headers: { Authorization: `Bearer ${activeSession.access_token}` },
          });

          if (error) continue;

          if (data?.active) {
            // Distinguish: active paid vs trialing with card
            if (data.status === "active") {
              setStatus("success_active");
            } else {
              // trialing — card was added, trial is running
              setStatus("success_trial");
            }
            return;
          }
        } catch {
          // continue retrying
        }
      }
      // After 10 attempts (25s) the subscription isn't confirmed yet.
      // This is likely a webhook delay, NOT a payment failure.
      // Show "pending" rather than "failed" to avoid alarming users whose payment succeeded.
      setStatus("pending");
    };

    checkPayment();
  }, [searchParams, session]);

  const isSuccess = status === "success_trial" || status === "success_active";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="fixed inset-0 blueprint-grid opacity-30 pointer-events-none" />
      <div className="relative z-10 text-center max-w-md">
        {status === "loading" && (
          <>
            <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t("processingPayment")}</h2>
            <p className="text-muted-foreground">{t("pleaseWait")}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {language === "ar"
                ? "جارٍ التحقق من حالة الدفع... قد يستغرق الأمر بضع ثوانٍ"
                : "Verifying payment status... this may take a few seconds"}
            </p>
          </>
        )}

        {status === "success_trial" && (
          <>
            <CheckCircle className="w-16 h-16 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t("paymentSuccess")}</h2>
            <p className="text-muted-foreground mb-2">{t("trialStarted")}</p>
            <p className="text-sm text-muted-foreground mb-6">
              {language === "ar"
                ? "بطاقتك محفوظة — سيتم تجديد اشتراكك تلقائياً بعد انتهاء الفترة التجريبية"
                : "Your card is saved — your subscription will auto-renew after the trial ends"}
            </p>
            <Button variant="hero" onClick={() => navigate("/")}>
              {t("startConsultation")}
            </Button>
          </>
        )}

        {status === "success_active" && (
          <>
            <CreditCard className="w-16 h-16 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">
              {language === "ar" ? "تم تفعيل الاشتراك!" : "Subscription Activated!"}
            </h2>
            <p className="text-muted-foreground mb-6">
              {language === "ar"
                ? "تم تفعيل اشتراكك بنجاح، يمكنك الآن الاستمتاع بالوصول الكامل"
                : "Your subscription is now active. Enjoy full access to ConsultX"}
            </p>
            <Button variant="hero" onClick={() => navigate("/")}>
              {t("startConsultation")}
            </Button>
          </>
        )}

        {status === "pending" && (
          <>
            <Clock className="w-16 h-16 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">
              {language === "ar" ? "جارٍ التحقق من الدفع..." : "Verifying your payment..."}
            </h2>
            <p className="text-muted-foreground mb-2">
              {language === "ar"
                ? "تمت معالجة دفعتك ولكن التأكيد يستغرق وقتاً أطول من المعتاد."
                : "Your payment was processed but confirmation is taking longer than usual."}
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              {language === "ar"
                ? "تحقق من صفحة حسابك خلال دقيقة للتأكد من تفعيل اشتراكك. إذا لم يتفعل خلال 5 دقائق، تواصل مع الدعم."
                : "Check your Account page in a minute to confirm your subscription is active. If it's not active within 5 minutes, please contact support."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="hero" onClick={() => navigate("/account")}>
                {language === "ar" ? "تحقق من حسابي" : "Check My Account"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/subscribe")}>
                {t("tryAgain")}
              </Button>
            </div>
          </>
        )}

        {status === "failed" && (
          <>
            <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t("paymentFailed")}</h2>
            <p className="text-muted-foreground mb-6">{t("paymentFailedDesc")}</p>
            <Button variant="hero" onClick={() => navigate("/subscribe")}>
              {t("tryAgain")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentCallback;
