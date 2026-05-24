import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Sparkles } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useEntitlement } from "@/hooks/useEntitlement";
import { FOUNDING10_CAMPAIGN, isFounding10Active, getFounding10SubscribeUrlInApp } from "@/lib/campaigns/founding10";

const DISMISSED_KEY_PREFIX = "founding10_dismissed_";

export default function Founding10Banner() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { user, isLoading, isFreeLoggedIn, isPaidActive, isTrialActive, isAdmin, hasEnterpriseAccess } = useEntitlement();

  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const stored = localStorage.getItem(DISMISSED_KEY_PREFIX + user.id);
    setDismissed(stored === "1");
  }, [user?.id]);

  if (isLoading) return null;

  const isEligible =
    !dismissed &&
    !!user &&
    !isAdmin &&
    !isPaidActive &&
    !isTrialActive &&
    !hasEnterpriseAccess &&
    isFreeLoggedIn &&
    isFounding10Active();

  if (!isEligible) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (user?.id) localStorage.setItem(DISMISSED_KEY_PREFIX + user.id, "1");
  };

  const handleCTA = () => {
    navigate(getFounding10SubscribeUrlInApp());
  };

  const isAr = language !== "en";

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="relative z-40 flex items-center justify-between gap-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-primary/20 px-4 py-3"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Sparkles className="w-5 h-5 text-primary shrink-0 animate-pulse-glow" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {isAr ? FOUNDING10_CAMPAIGN.title.ar : FOUNDING10_CAMPAIGN.title.en}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {isAr ? FOUNDING10_CAMPAIGN.offerShort.ar : FOUNDING10_CAMPAIGN.offerShort.en}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleCTA}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors whitespace-nowrap shadow-sm"
        >
          {isAr ? FOUNDING10_CAMPAIGN.cta.ar : FOUNDING10_CAMPAIGN.cta.en}
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label={isAr ? "إغلاق" : "Dismiss"}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
