import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  BarChart2,
  Settings,
  HelpCircle,
  LogOut,
  AlertTriangle,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  ShieldCheck,
  MessageSquare,
  Zap,
  Mail,
  Phone,
  ExternalLink,
} from "lucide-react";
import type { TranslationKey } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useSubscription } from "@/hooks/useSubscription";
import { usePreferences } from "@/hooks/usePreferences";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// CancelSubscriptionButton — preserved exactly from original
// ---------------------------------------------------------------------------
function CancelSubscriptionButton({
  t,
  refetch,
  session,
}: {
  t: (key: TranslationKey) => string;
  refetch: () => void;
  session: any;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleCancel = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("cancel-subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      toast({ title: t("subscriptionCancelled") });
      refetch();
    } catch {
      toast({
        title: t("errorTitle"),
        description: t("unexpectedError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {confirming && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {t("cancelConfirm")}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          onClick={handleCancel}
          disabled={loading}
          className="flex-1"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            t(confirming ? "confirmCancel" : "cancelSubscription")
          )}
        </Button>
        {confirming && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            {t("keepSubscription")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SectionId =
  | "overview"
  | "subscription"
  | "billing"
  | "usage"
  | "settings"
  | "support";

interface NavItem {
  id: SectionId;
  labelAr: string;
  labelEn: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Main Account component
// ---------------------------------------------------------------------------
const Account = () => {
  const navigate = useNavigate();
  const { user, session, signOut, loading: authLoading } = useAuth();
  const { t, dir, language, setLanguage } = useLanguage();
  const { subscription, loading: subLoading, refetch } = useSubscription();
  const { preferences, updatePreferences } = usePreferences();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isRtl = dir === "rtl";

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchTransactions = async () => {
      const { data } = await supabase
        .from("payment_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setTransactions(data);
    };
    if (user) fetchTransactions();
  }, [user]);

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Navigation items
  // ---------------------------------------------------------------------------
  const navItems: NavItem[] = [
    {
      id: "overview",
      labelAr: "نظرة عامة",
      labelEn: "Overview",
      icon: <LayoutDashboard size={18} />,
    },
    {
      id: "subscription",
      labelAr: "الاشتراك",
      labelEn: "Subscription",
      icon: <CreditCard size={18} />,
    },
    {
      id: "billing",
      labelAr: "الفواتير",
      labelEn: "Billing",
      icon: <Receipt size={18} />,
    },
    {
      id: "usage",
      labelAr: "الاستخدام",
      labelEn: "Usage",
      icon: <BarChart2 size={18} />,
    },
    {
      id: "settings",
      labelAr: "الإعدادات",
      labelEn: "Settings",
      icon: <Settings size={18} />,
    },
    {
      id: "support",
      labelAr: "الدعم",
      labelEn: "Support",
      icon: <HelpCircle size={18} />,
    },
  ];

  // ---------------------------------------------------------------------------
  // Derived subscription state
  // ---------------------------------------------------------------------------
  const accessState = subscription?.access_state ?? "none";
  const trialDaysRemaining = subscription?.launch_trial_days_remaining ?? 0;
  const isPaidActive =
    accessState === "paid_active" || subscription?.status === "active";
  const isTrialActive =
    accessState === "trial_active" || subscription?.status === "trialing";
  const isTrialExpired = accessState === "trial_expired";
  const hasActiveAccess = isPaidActive || isTrialActive;

  const userInitials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "??";

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(
        language === "ar" ? "ar-SA" : "en-US",
        { year: "numeric", month: "long" }
      )
    : null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const navigate_section = (id: SectionId) => {
    setActiveSection(id);
    if (isMobile) setSidebarOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Sidebar content
  // ---------------------------------------------------------------------------
  const SidebarContent = ({ expanded }: { expanded: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Toggle button — desktop only */}
      {!isMobile && (
        <div className="flex items-center justify-end p-3 border-b border-border/30">
          <button
            onClick={() => setSidebarExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            aria-label="Toggle sidebar"
          >
            {isRtl ? (
              expanded ? (
                <ChevronRight size={16} />
              ) : (
                <ChevronLeft size={16} />
              )
            ) : expanded ? (
              <ChevronLeft size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </button>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate_section(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary/10 text-primary border-s-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              } ${expanded ? "" : "justify-center"}`}
              title={!expanded ? (language === "ar" ? item.labelAr : item.labelEn) : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {expanded && (
                <span className="truncate">
                  {language === "ar" ? item.labelAr : item.labelEn}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-2 border-t border-border/30">
        <button
          onClick={signOut}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all ${
            expanded ? "" : "justify-center"
          }`}
          title={!expanded ? t("signOut") : undefined}
        >
          <LogOut size={18} className="shrink-0" />
          {expanded && <span>{t("signOut")}</span>}
        </button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Section renderers
  // ---------------------------------------------------------------------------

  // Overview
  const renderOverview = () => {
    let glowClass = "border-border/40";
    let stateTitle = "";
    let stateSubtitle = "";
    let gradientClass = "";

    if (isTrialActive) {
      glowClass = "border-cyan-500/40 shadow-[0_0_24px_rgba(6,182,212,0.12)]";
      gradientClass = "from-cyan-500/10 to-transparent";
      stateTitle = language === "ar" ? "وصول كامل مفعّل" : "Full Access Active";
      stateSubtitle =
        language === "ar"
          ? `${trialDaysRemaining} أيام متبقية من التجربة`
          : `${trialDaysRemaining} days remaining in trial`;
    } else if (isTrialExpired) {
      glowClass = "border-amber-500/40 shadow-[0_0_24px_rgba(245,158,11,0.12)]";
      gradientClass = "from-amber-500/10 to-transparent";
      stateTitle =
        language === "ar"
          ? "اكتملت التجربة الهندسية"
          : "Engineering Trial Complete";
      stateSubtitle =
        language === "ar"
          ? "فعّل اشتراك Pro للوصول الكامل"
          : "Activate Pro subscription for full access";
    } else if (isPaidActive) {
      glowClass = "border-green-500/40 shadow-[0_0_24px_rgba(34,197,94,0.12)]";
      gradientClass = "from-green-500/10 to-transparent";
      const planName = subscription?.plan
        ? language === "ar"
          ? subscription.plan.name_ar
          : subscription.plan.name_en
        : "Pro";
      const expiryDate = subscription?.expires_at
        ? new Date(subscription.expires_at).toLocaleDateString(
            language === "ar" ? "ar-SA" : "en-US"
          )
        : "";
      stateTitle =
        language === "ar"
          ? `مشترك في ${planName}`
          : `Subscribed to ${planName}`;
      stateSubtitle =
        language === "ar" ? `ينتهي في ${expiryDate}` : `Expires ${expiryDate}`;
    } else {
      glowClass = "border-border/40";
      gradientClass = "from-muted/20 to-transparent";
      stateTitle =
        language === "ar" ? "لا يوجد اشتراك نشط" : "No Active Subscription";
      stateSubtitle =
        language === "ar"
          ? "اشترك للوصول الكامل"
          : "Subscribe for full access";
    }

    return (
      <div className="space-y-6">
        {/* State card */}
        <div
          className={`bg-card/60 rounded-xl border p-6 bg-gradient-to-br ${gradientClass} ${glowClass}`}
        >
          <h2 className="text-xl font-bold text-foreground mb-1">{stateTitle}</h2>
          <p className="text-sm text-muted-foreground">{stateSubtitle}</p>

          {(isTrialExpired || (!hasActiveAccess && accessState !== "trial_active")) && (
            <Button
              variant="hero"
              size="sm"
              className="mt-4"
              onClick={() => navigate("/subscribe")}
            >
              <Zap className="w-4 h-4 me-2" />
              {language === "ar" ? "فعّل اشتراك Pro" : "Activate Pro"}
            </Button>
          )}
        </div>

        {/* User info card */}
        <div className="bg-card/60 rounded-xl border border-border/40 p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-primary">{userInitials}</span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{user?.email}</p>
              {memberSince && (
                <p className="text-sm text-muted-foreground">
                  {language === "ar" ? `عضو منذ ${memberSince}` : `Member since ${memberSince}`}
                </p>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-3 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
            >
              <MessageSquare className="w-4 h-4 me-2" />
              {language === "ar" ? "الانتقال للدردشة" : "Go to Chat"}
            </Button>
            {!isPaidActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/subscribe")}
              >
                <Zap className="w-4 h-4 me-2" />
                {language === "ar" ? "فعّل اشتراكك" : "Activate Subscription"}
              </Button>
            )}
            {(user?.email === "njajrehwaseem@gmail.com" ||
              user?.email === "waseemnjajreh20@gmail.com") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
              >
                <ShieldCheck className="w-4 h-4 me-2" />
                Admin
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Subscription
  const renderSubscription = () => (
    <div className="space-y-4">
      <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          {language === "ar" ? "تفاصيل الاشتراك" : "Subscription Details"}
        </h2>

        {/* Status row */}
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              isPaidActive
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : isTrialActive
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                : isTrialExpired
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-muted/40 text-muted-foreground border border-border/40"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {isPaidActive
              ? t("statusActive")
              : isTrialActive
              ? t("statusTrialing")
              : isTrialExpired
              ? t("statusExpired")
              : t("statusNone")}
          </span>
        </div>

        {/* Plan */}
        {subscription?.plan && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-0.5">{t("currentPlan")}</p>
              <p className="font-medium">
                {language === "ar"
                  ? subscription.plan.name_ar
                  : subscription.plan.name_en}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">
                {language === "ar" ? "السعر" : "Price"}
              </p>
              <p className="font-medium">
                {(subscription.plan.price_amount / 100).toFixed(0)}{" "}
                {t("sar")}
              </p>
            </div>
          </div>
        )}

        {/* Trial end */}
        {isTrialActive && subscription?.launch_trial_end && (
          <div className="text-sm">
            <p className="text-muted-foreground mb-0.5">
              {language === "ar" ? "انتهاء التجربة" : "Trial ends"}
            </p>
            <p className="font-medium text-cyan-400">
              {new Date(subscription.launch_trial_end).toLocaleDateString(
                language === "ar" ? "ar-SA" : "en-US"
              )}{" "}
              — {trialDaysRemaining}{" "}
              {language === "ar" ? "أيام متبقية" : "days remaining"}
            </p>
          </div>
        )}

        {/* Expiry */}
        {isPaidActive && subscription?.expires_at && (
          <div className="text-sm">
            <p className="text-muted-foreground mb-0.5">{t("expiresAt")}</p>
            <p className="font-medium">
              {new Date(subscription.expires_at).toLocaleDateString(
                language === "ar" ? "ar-SA" : "en-US"
              )}
            </p>
          </div>
        )}

        {/* Card */}
        {subscription?.card_brand && (
          <div className="flex items-center gap-2 text-sm">
            <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              {subscription.card_brand} •••• {subscription.card_last_four}
            </span>
          </div>
        )}

        {/* Actions */}
        {(isTrialActive || isPaidActive) && session && (
          <CancelSubscriptionButton t={t} refetch={refetch} session={session} />
        )}

        {(isTrialExpired || (!hasActiveAccess)) && (
          <Button
            variant="hero"
            className="w-full mt-2"
            onClick={() => navigate("/subscribe")}
          >
            {t("subscribeNow")}
          </Button>
        )}
      </div>

      {isTrialActive && (
        <div className="bg-cyan-500/5 rounded-xl border border-cyan-500/20 p-4 text-sm text-cyan-300">
          {language === "ar"
            ? "اشتراكك Pro سيبدأ تلقائياً بعد انتهاء فترة التجربة"
            : "Your Pro subscription will auto-start after the trial ends"}
        </div>
      )}
    </div>
  );

  // Billing
  const renderBilling = () => (
    <div className="space-y-4">
      {/* Payment method */}
      {subscription?.card_brand && (
        <div className="bg-card/60 rounded-xl border border-border/40 p-6">
          <h2 className="text-lg font-semibold mb-4">
            {language === "ar" ? "طريقة الدفع" : "Payment Method"}
          </h2>
          <div className="flex items-center gap-3">
            <div className="w-10 h-7 bg-muted/40 rounded border border-border/40 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {subscription.card_brand} •••• {subscription.card_last_four}
              </p>
              <p className="text-xs text-muted-foreground">
                {language === "ar" ? "البطاقة المسجلة" : "Registered card"}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {language === "ar"
              ? "1 ريال تحقق من البطاقة يُسترد تلقائياً"
              : "1 SAR card verification charge is automatically refunded"}
          </p>
        </div>
      )}

      {/* Transactions */}
      <div className="bg-card/60 rounded-xl border border-border/40 p-6">
        <h2 className="text-lg font-semibold mb-4">{t("paymentHistory")}</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t("noTransactions")}
          </p>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between text-sm border-b border-border/20 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {t(`paymentType_${tx.payment_type}` as TranslationKey)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.created_at).toLocaleDateString(
                      language === "ar" ? "ar-SA" : "en-US"
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium">
                    {(tx.amount / 100).toFixed(2)} {tx.currency}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      tx.status === "captured"
                        ? "text-green-400"
                        : tx.status === "failed"
                        ? "text-destructive"
                        : tx.status === "refunded"
                        ? "text-muted-foreground"
                        : "text-amber-400"
                    }`}
                  >
                    {t(`txStatus_${tx.status}` as TranslationKey)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Usage
  const renderUsage = () => {
    const isUnlimited =
      subscription?.daily_messages_limit === undefined ||
      subscription?.daily_messages_limit >= 9999;

    return (
      <div className="space-y-4">
        {isTrialActive && (
          <div className="bg-cyan-500/5 rounded-xl border border-cyan-500/30 p-6 text-center">
            <Zap className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-cyan-300 mb-1">
              {language === "ar"
                ? "وصول كامل غير محدود نشط"
                : "Full Unlimited Access Active"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {language === "ar"
                ? "استمتع بجميع ميزات ConsultX خلال فترة التجربة"
                : "Enjoy all ConsultX features during your trial period"}
            </p>
          </div>
        )}

        {isPaidActive && (
          <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              {language === "ar" ? "استخدام اليوم" : "Today's Usage"}
            </h2>

            {isUnlimited ? (
              <div className="text-sm text-green-400">
                {language === "ar"
                  ? "لا يوجد حد يومي في خطة Pro"
                  : "No daily limit on Pro plan"}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    {t("dailyUsageCounter")}
                  </span>
                  <span className="font-medium">
                    {subscription?.daily_messages_used ?? 0} /{" "}
                    {subscription?.daily_messages_limit}
                  </span>
                </div>
                <div className="w-full bg-muted/30 rounded-full h-2">
                  <div
                    className="bg-primary rounded-full h-2 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        ((subscription?.daily_messages_used ?? 0) /
                          (subscription?.daily_messages_limit ?? 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {subscription?.daily_messages_limit} {t("dailyMessagesLabel")}
                </p>
              </div>
            )}
          </div>
        )}

        {!hasActiveAccess && (
          <div className="bg-card/60 rounded-xl border border-border/40 p-6 text-center">
            <p className="text-muted-foreground text-sm mb-4">
              {language === "ar"
                ? "اشترك للوصول إلى إحصائيات الاستخدام"
                : "Subscribe to access usage statistics"}
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate("/subscribe")}>
              {t("subscribeNow")}
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Settings (Brain)
  const renderSettings = () => (
    <div className="space-y-6">
      {/* Email + language info */}
      <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          {language === "ar" ? "معلومات الحساب" : "Account Information"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-0.5">
              {language === "ar" ? "البريد الإلكتروني" : "Email"}
            </p>
            <p className="font-medium truncate">{user?.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">
              {language === "ar" ? "اللغة" : "Language"}
            </p>
            <div className="flex items-center gap-2">
              <p className="font-medium">
                {language === "ar" ? "العربية" : "English"}
              </p>
              <button
                onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
                className="text-xs text-primary hover:underline"
              >
                {language === "ar" ? "Switch to English" : "التبديل للعربية"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Memory Level */}
      <div className="bg-card/60 rounded-xl border border-border/40 p-6">
        <h2 className="text-lg font-semibold mb-4">{t("prefsMemoryTitle")}</h2>
        <div className="space-y-3">
          {(["none", "session", "persistent"] as const).map((level) => {
            const isActive = preferences.ai_memory_level === level;
            return (
              <button
                key={level}
                onClick={() => {
                  updatePreferences({ ai_memory_level: level });
                  toast({ title: t("prefsSaved") });
                }}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-start transition-all ${
                  isActive
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-secondary/30 border border-transparent hover:border-border/50"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 ${
                    isActive ? "border-primary bg-primary" : "border-muted-foreground"
                  }`}
                />
                <div>
                  <p className="font-medium text-sm">
                    {t(
                      `prefsMemory${
                        level.charAt(0).toUpperCase() + level.slice(1)
                      }` as TranslationKey
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      `prefsMemory${
                        level.charAt(0).toUpperCase() + level.slice(1)
                      }Desc` as TranslationKey
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Output Format */}
      <div className="bg-card/60 rounded-xl border border-border/40 p-6">
        <h2 className="text-lg font-semibold mb-4">{t("prefsOutputTitle")}</h2>
        <div className="space-y-3">
          {(["concise", "detailed", "report"] as const).map((fmt) => {
            const isActive = preferences.output_format === fmt;
            return (
              <button
                key={fmt}
                onClick={() => {
                  updatePreferences({ output_format: fmt });
                  toast({ title: t("prefsSaved") });
                }}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-start transition-all ${
                  isActive
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-secondary/30 border border-transparent hover:border-border/50"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 ${
                    isActive ? "border-primary bg-primary" : "border-muted-foreground"
                  }`}
                />
                <div>
                  <p className="font-medium text-sm">
                    {t(
                      `prefsOutput${
                        fmt.charAt(0).toUpperCase() + fmt.slice(1)
                      }` as TranslationKey
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      `prefsOutput${
                        fmt.charAt(0).toUpperCase() + fmt.slice(1)
                      }Desc` as TranslationKey
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preferred Standards */}
      <div className="bg-card/60 rounded-xl border border-border/40 p-6">
        <h2 className="text-lg font-semibold mb-4">{t("prefsStandardsTitle")}</h2>
        <div className="flex flex-wrap gap-2">
          {["SBC 201", "SBC 801", "NFPA 13", "NFPA 72", "NFPA 101", "SFPE"].map(
            (std) => {
              const isSelected = preferences.preferred_standards.includes(std);
              return (
                <button
                  key={std}
                  onClick={() => {
                    const updated = isSelected
                      ? preferences.preferred_standards.filter((s) => s !== std)
                      : [...preferences.preferred_standards, std];
                    updatePreferences({ preferred_standards: updated });
                    toast({ title: t("prefsSaved") });
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    isSelected
                      ? "bg-primary/20 text-primary border border-primary/40"
                      : "bg-secondary/50 text-muted-foreground border border-border/50 hover:border-primary/30"
                  }`}
                >
                  {std}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Clear Memory */}
      <div className="bg-card/60 rounded-xl border border-destructive/20 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm text-destructive">
              {t("prefsClearMemory")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("prefsClearMemoryDesc")}
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (!user) return;
              await supabase
                .from("conversations")
                .delete()
                .eq("user_id", user.id);
              toast({ title: t("prefsClearMemory") });
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  // Support
  const renderSupport = () => (
    <div className="space-y-4">
      <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          {language === "ar"
            ? "للتواصل مع فريق الدعم"
            : "Contact Support Team"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {language === "ar"
            ? "فريق الدعم جاهز لمساعدتك في أسئلة الاشتراك، المشكلات التقنية، وإرشادات المنتج"
            : "Our support team is ready to help you with subscription questions, technical issues, and product guidance"}
        </p>

        <div className="space-y-3">
          <a
            href="mailto:support@consultx.ai"
            className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all"
          >
            <Mail className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">
                {language === "ar" ? "البريد الإلكتروني" : "Email Support"}
              </p>
              <p className="text-xs text-muted-foreground">support@consultx.ai</p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground ms-auto" />
          </a>
        </div>
      </div>

      <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-3">
        <h3 className="font-semibold text-sm">
          {language === "ar" ? "موضوعات الدعم" : "Support Topics"}
        </h3>
        {[
          {
            icon: <CreditCard className="w-4 h-4" />,
            titleAr: "مساعدة في الفواتير",
            titleEn: "Billing Help",
            descAr: "استفسارات الاشتراك، المدفوعات، والاسترداد",
            descEn: "Subscription, payments, and refund inquiries",
          },
          {
            icon: <Settings className="w-4 h-4" />,
            titleAr: "الدعم التقني",
            titleEn: "Technical Support",
            descAr: "مشكلات في الأداء أو الوصول إلى الخدمة",
            descEn: "Performance issues or service access problems",
          },
          {
            icon: <HelpCircle className="w-4 h-4" />,
            titleAr: "إرشادات المنتج",
            titleEn: "Product Guidance",
            descAr: "كيفية الاستفادة القصوى من ConsultX",
            descEn: "How to get the most out of ConsultX",
          },
        ].map((item, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-muted/20"
          >
            <span className="text-muted-foreground mt-0.5 shrink-0">
              {item.icon}
            </span>
            <div>
              <p className="text-sm font-medium">
                {language === "ar" ? item.titleAr : item.titleEn}
              </p>
              <p className="text-xs text-muted-foreground">
                {language === "ar" ? item.descAr : item.descEn}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card/60 rounded-xl border border-border/40 p-6">
        <h3 className="font-semibold text-sm mb-2">
          {language === "ar" ? "الإبلاغ عن مشكلة" : "Report an Issue"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {language === "ar"
            ? "إذا واجهت خطأً أو سلوكاً غير متوقع، أرسل لنا تفاصيل المشكلة عبر البريد الإلكتروني مع وصف ما حدث."
            : "If you encounter a bug or unexpected behaviour, send us the issue details via email with a description of what happened."}
        </p>
        <a
          href="mailto:support@consultx.ai?subject=Issue Report"
          className="inline-flex items-center gap-2 mt-3 text-sm text-primary hover:underline"
        >
          <Phone className="w-3.5 h-3.5" />
          {language === "ar" ? "إرسال تقرير المشكلة" : "Send Issue Report"}
        </a>
      </div>
    </div>
  );

  const sectionTitle = () => {
    const item = navItems.find((n) => n.id === activeSection);
    if (!item) return "";
    return language === "ar" ? item.labelAr : item.labelEn;
  };

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return renderOverview();
      case "subscription":
        return renderSubscription();
      case "billing":
        return renderBilling();
      case "usage":
        return renderUsage();
      case "settings":
        return renderSettings();
      case "support":
        return renderSupport();
    }
  };

  // ---------------------------------------------------------------------------
  // Sidebar width classes
  // ---------------------------------------------------------------------------
  const sidebarWidthClass = sidebarExpanded ? "w-[220px]" : "w-14";

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  return (
    <div
      className="min-h-dvh flex bg-background"
      dir={dir}
    >
      {/* Blueprint grid */}
      <div className="fixed inset-0 blueprint-grid opacity-30 pointer-events-none" />

      {/* ------------------------------------------------------------------ */}
      {/* Mobile overlay */}
      {/* ------------------------------------------------------------------ */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Sidebar — desktop fixed, mobile drawer */}
      {/* ------------------------------------------------------------------ */}
      {isMobile ? (
        /* Mobile drawer */
        <aside
          className={`fixed inset-y-0 z-40 flex flex-col bg-card/95 backdrop-blur-xl border-e border-border/40 w-64 transition-transform duration-300 ${
            isRtl ? "right-0" : "left-0"
          } ${
            sidebarOpen
              ? "translate-x-0"
              : isRtl
              ? "translate-x-full"
              : "-translate-x-full"
          }`}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <span className="font-semibold text-sm text-foreground">
              {t("myAccount")}
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <SidebarContent expanded />
        </aside>
      ) : (
        /* Desktop sidebar */
        <aside
          className={`relative z-10 flex flex-col bg-card/95 backdrop-blur-xl border-e border-border/40 transition-all duration-300 shrink-0 ${sidebarWidthClass}`}
        >
          <SidebarContent expanded={sidebarExpanded} />
        </aside>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Main area */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Mobile header */}
        {isMobile && (
          <header className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <Menu size={18} />
              </button>
              <button
                onClick={() => navigate("/")}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            </div>
            <span className="font-semibold text-sm text-foreground">
              {sectionTitle()}
            </span>
            <LanguageToggle />
          </header>
        )}

        {/* Desktop header */}
        {!isMobile && (
          <header className="flex items-center justify-between px-6 py-3.5 border-b border-border/30">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isRtl ? (
                  <ChevronRight size={16} />
                ) : (
                  <ChevronLeft size={16} />
                )}
                {t("backToHome")}
              </button>
              <span className="text-border/50 select-none">·</span>
              <span className="text-sm font-medium text-foreground">
                {sectionTitle()}
              </span>
            </div>
            <LanguageToggle />
          </header>
        )}

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 pb-20 sm:pb-8 overflow-y-auto">
          <div className="max-w-2xl mx-auto w-full">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
};

export default Account;
