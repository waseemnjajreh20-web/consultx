import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useProfile } from "@/hooks/useProfile";
import { useLanguage } from "@/hooks/useLanguage";
import LoadingSpinner from "@/components/LoadingSpinner";
import WelcomeEngineerModal from "@/components/WelcomeEngineerModal";
import AppShell from "@/components/AppShell";
import { CLOSED_PANEL } from "@/components/SourcePanel";
import type { SourcePanelState } from "@/components/SourcePanel";
import type { SourceMeta } from "@/utils/sourceMetadata";

const ChatInterface = lazy(() => import("@/components/ChatInterface"));

// Mirrors GRACE_DAYS in check-subscription and fire-safety-chat.
const GRACE_DAYS = 7;

const Workspace = () => {
  const navigate = useNavigate();
  const { user, isLoading, canAccessChat, subscription, isPaidActive } = useEntitlement();
  const { profile } = useProfile();
  const { language } = useLanguage();

  const [isReady, setIsReady] = useState(false);
  const [welcomeTrialEnd, setWelcomeTrialEnd] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Source panel state — lifted so AppShell can render it as a 3rd pane
  const [sourcePanel, setSourcePanel] = useState<SourcePanelState>(CLOSED_PANEL);

  // Imperative ref so AppShell sidebar can trigger ChatInterface history modal
  const historyTriggerRef = useRef<(() => void) | null>(null);

  // Restore banner-dismissed state from sessionStorage on mount / user change.
  useEffect(() => {
    if (user?.id && sessionStorage.getItem(`pastdue_dismissed_${user.id}`)) {
      setBannerDismissed(true);
    }
  }, [user?.id]);

  // Show welcome modal once for new corporate trial users
  useEffect(() => {
    if (
      profile?.trial_type === "launch_engineer_trial" &&
      profile?.trial_end &&
      !sessionStorage.getItem("welcome_shown_" + user?.id)
    ) {
      sessionStorage.setItem("welcome_shown_" + user?.id, "1");
      setWelcomeTrialEnd(profile.trial_end);
    }
  }, [profile, user?.id]);

  // Access gate — runs once loading resolves
  useEffect(() => {
    if (isLoading) return;
    if (!user) { navigate("/auth"); return; }
    if (canAccessChat) setIsReady(true);
  }, [isLoading, user, canAccessChat, navigate]);

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    if (user?.id) sessionStorage.setItem(`pastdue_dismissed_${user.id}`, "1");
  };

  const isPastDueInGrace = subscription?.status === "past_due" && isPaidActive;
  const graceEndDate =
    isPastDueInGrace && subscription?.past_due_since
      ? new Date(new Date(subscription.past_due_since).getTime() + GRACE_DAYS * 86_400_000)
      : null;

  if (isLoading || !isReady) return <LoadingSpinner />;

  return (
    <>
      {/* Past-due grace banner — fixed top, non-blocking, dismissible per session */}
      {isPastDueInGrace && !bannerDismissed && (
        <div
          dir={language === "ar" ? "rtl" : "ltr"}
          className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-3 bg-orange-600/95 backdrop-blur-sm px-4 py-2.5 text-sm text-white shadow-lg"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {language === "ar"
                ? graceEndDate
                  ? `تعذّر تجديد الدفع — وصولك الكامل محفوظ حتى ${graceEndDate.toLocaleDateString("ar-SA", { month: "long", day: "numeric" })}`
                  : "تعذّر تجديد الدفع — يرجى مراجعة حسابك"
                : graceEndDate
                ? `Payment renewal failed — full access preserved until ${graceEndDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
                : "Payment renewal failed — please review your account"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate("/account")}
              className="px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 transition-colors text-xs font-medium whitespace-nowrap"
            >
              {language === "ar" ? "← الذهاب إلى الحساب" : "Go to Account →"}
            </button>
            <button
              onClick={handleDismissBanner}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              aria-label={language === "ar" ? "إغلاق" : "Dismiss"}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {welcomeTrialEnd && (
        <WelcomeEngineerModal
          trialEnd={welcomeTrialEnd}
          onClose={() => setWelcomeTrialEnd(null)}
        />
      )}

      <AppShell
        sourcePanel={sourcePanel}
        onSourceClose={() => setSourcePanel(CLOSED_PANEL)}
        onSourceSelectSource={(meta: SourceMeta) =>
          setSourcePanel(prev => ({ ...prev, activeMeta: meta }))
        }
        onSourceBack={() =>
          setSourcePanel(prev => ({ ...prev, activeMeta: null }))
        }
        historyTriggerRef={historyTriggerRef}
      >
        <Suspense fallback={<LoadingSpinner />}>
          <ChatInterface
            onBack={() => navigate("/")}
            onSourceStateChange={setSourcePanel}
            historyTriggerRef={historyTriggerRef}
          />
        </Suspense>
      </AppShell>
    </>
  );
};

export default Workspace;
