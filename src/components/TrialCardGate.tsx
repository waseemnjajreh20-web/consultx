/**
 * TrialCardGate — billing contract 2026-08-23 (docs/launch/billing-contract-20260823.md
 * Sections 4-5). A card is required to start/keep the free trial.
 *
 * TrialCardBlockGate  — UX state 5.1 (trial_no_card): blocks chat entirely, shown by
 *                        Workspace.tsx in place of ChatInterface.
 * TrialCardBanner     — UX state 5.2 (trial_card_on_file): small non-blocking banner
 *                        with the trial countdown and the scheduled first charge.
 */
import { useNavigate } from "react-router-dom";
import { CreditCard, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import type { SubscriptionStatus } from "@/hooks/useSubscription";

export function TrialCardBlockGate() {
  const navigate = useNavigate();
  const { language, dir } = useLanguage();
  const isAr = language === "ar";

  return (
    <div dir={dir} className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-card/60 border border-primary/20 rounded-2xl p-8 space-y-5">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <CreditCard className="w-7 h-7 text-primary" />
        </div>

        <h2 className="text-lg font-bold text-foreground">
          {isAr ? "أضف بطاقتك لبدء التجربة المجانية" : "Add your card to start your free trial"}
        </h2>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {isAr
            ? "لبدء تجربتك المجانية أضف بطاقتك. سنخصم 1.00 ريال للتحقق من البطاقة فقط، يُخصم من أول فاتورة. لن نحصّل أي مبلغ آخر قبل انتهاء التجربة."
            : "Add your card to start your free trial. We charge SAR 1.00 to verify the card — it is deducted from your first invoice. Nothing else is charged before your trial ends."}
        </p>

        <p className="text-xs text-muted-foreground border-t border-border/40 pt-4">
          {isAr
            ? "أضف بطاقتك لبدء التجربة المجانية — 7 أيام، يُحصَّل سعر الخطة تلقائياً بعد انتهائها، يمكنك الإلغاء في أي وقت"
            : "7-day free trial — card required, the plan price is charged automatically after the trial ends, cancel anytime"}
        </p>

        <Button variant="hero" className="w-full" onClick={() => navigate("/subscribe")}>
          {isAr ? "إضافة البطاقة" : "Add card"}
        </Button>
      </div>
    </div>
  );
}

export function TrialCardBanner({
  subscription,
  trialDaysRemaining,
  trialHoursRemaining,
}: {
  subscription: SubscriptionStatus | null;
  trialDaysRemaining: number;
  trialHoursRemaining: number;
}) {
  const { language, dir } = useLanguage();
  const isAr = language === "ar";

  const expiresAtRaw = subscription?.expires_at ?? subscription?.launch_trial_end ?? null;
  const expiresAtLabel = expiresAtRaw
    ? new Date(expiresAtRaw).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
        month: "long",
        day: "numeric",
      })
    : null;

  const planPriceSar = subscription?.plan ? subscription.plan.price_amount / 100 : null;
  const firstChargeSar = planPriceSar != null ? Math.max(0, planPriceSar - 1) : null;

  const countdownLabel =
    trialDaysRemaining > 0
      ? `${trialDaysRemaining} ${isAr ? "يوم" : "days"}`
      : `${trialHoursRemaining} ${isAr ? "ساعة" : "hrs"}`;

  return (
    <div
      dir={dir}
      className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm text-foreground"
    >
      <Clock className="w-4 h-4 text-primary shrink-0" />
      <span className="min-w-0">
        {isAr ? (
          <>
            تجربتك المجانية فعّالة — {countdownLabel} متبقية
            {expiresAtLabel && firstChargeSar != null && (
              <>
                {" "}
                — عند انتهائها في {expiresAtLabel} سنحصّل {firstChargeSar.toFixed(2)} ريال (سعر
                الخطة {planPriceSar!.toFixed(0)} ريال ناقص 1.00 ريال التحقق المخصوم من أول فاتورة).
                الأسعار شاملة ضريبة القيمة المضافة 15%.
              </>
            )}
          </>
        ) : (
          <>
            Your free trial is active — {countdownLabel} remaining
            {expiresAtLabel && firstChargeSar != null && (
              <>
                {" "}
                — when it ends on {expiresAtLabel} we will charge SAR {firstChargeSar.toFixed(2)}{" "}
                (plan price SAR {planPriceSar!.toFixed(0)} minus the SAR 1.00 verification,
                deducted from your first invoice). Prices include 15% VAT.
              </>
            )}
          </>
        )}
      </span>
    </div>
  );
}
