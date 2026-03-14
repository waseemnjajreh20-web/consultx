import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Clock, CheckCircle, XCircle, ArrowRight, ArrowLeft, Loader2, LogOut, AlertTriangle, ShieldCheck } from "lucide-react";
import type { TranslationKey } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useToast } from "@/hooks/use-toast";
import consultxIcon from "@/assets/consultx-icon.png";

function CancelSubscriptionButton({ t, refetch, session }: { t: any; refetch: () => void; session: any }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleCancel = async () => {
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("cancel-subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      toast({ title: t("subscriptionCancelled") });
      refetch();
    } catch {
      toast({ title: t("errorTitle"), description: t("unexpectedError"), variant: "destructive" });
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
        <Button variant="destructive" size="sm" onClick={handleCancel} disabled={loading} className="flex-1">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t(confirming ? "confirmCancel" : "cancelSubscription")}
        </Button>
        {confirming && (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>{t("keepSubscription")}</Button>
        )}
      </div>
    </div>
  );
}
const Account = () => {
  const navigate = useNavigate();
  const { user, session, signOut, loading: authLoading } = useAuth();
  const { t, dir, language } = useLanguage();
  const { subscription, loading: subLoading, refetch } = useSubscription();
  const [transactions, setTransactions] = useState<any[]>([]);

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
      if (data && data.length > 0) {
        setTransactions(data);
      } else {
        // Fallback: try payment_history table if payment_transactions is empty
        const { data: historyData } = await supabase
          .from("payment_history" as any)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        if (historyData) setTransactions(historyData);
      }
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

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    trialing: { icon: <Clock className="w-5 h-5" />, color: "text-accent", label: t("statusTrialing") },
    active: { icon: <CheckCircle className="w-5 h-5" />, color: "text-primary", label: t("statusActive") },
    expired: { icon: <XCircle className="w-5 h-5" />, color: "text-destructive", label: t("statusExpired") },
    cancelled: { icon: <XCircle className="w-5 h-5" />, color: "text-muted-foreground", label: t("statusCancelled") },
    none: { icon: <XCircle className="w-5 h-5" />, color: "text-muted-foreground", label: t("statusNone") },
  };

  const status = statusConfig[subscription?.status || "none"];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="fixed inset-0 blueprint-grid opacity-30 pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/30">
        <Button variant="ghost" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
          {dir === "rtl" ? <ArrowRight className="ms-2 w-4 h-4" /> : <ArrowLeft className="me-2 w-4 h-4" />}
          {t("backToHome")}
        </Button>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          {(user?.email === "njajrehwaseem@gmail.com" || user?.email === "waseemnjajreh20@gmail.com") && (
            <Button variant="ghost" onClick={() => navigate("/admin")} className="text-muted-foreground">
              <ShieldCheck className="w-4 h-4 ms-2" />
              Admin
            </Button>
          )}
          <Button variant="ghost" onClick={signOut} className="text-muted-foreground">
            <LogOut className="w-4 h-4 ms-2" />
            {t("signOut")}
          </Button>
        </div>
      </header>

      <div className="relative z-10 flex-1 p-6 max-w-2xl mx-auto w-full">
        <div className="text-center mb-8">
          <img src={consultxIcon} alt="ConsultX" className="w-12 h-12 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gradient">{t("myAccount")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
        </div>

        {/* Subscription Status */}
        <Card className="mb-6 bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">{t("subscriptionStatus")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={status.color}>{status.icon}</span>
              <span className="font-medium">{status.label}</span>
            </div>

            {subscription?.plan && (
              <div className="text-sm text-muted-foreground">
                {t("currentPlan")}: {language === "ar" ? subscription.plan.name_ar : subscription.plan.name_en} -{" "}
                {(subscription.plan.price_amount / 100).toFixed(0)} {t("sar")}
              </div>
            )}

            {subscription?.trial_days_remaining > 0 && (
              <div className="text-sm text-accent">
                {t("trialRemaining")}: {subscription.trial_days_remaining} {t("days")}
              </div>
            )}

            {subscription?.daily_messages_limit !== undefined && subscription.daily_messages_limit < 9999 && (
              <div className="text-sm text-muted-foreground">
                {subscription.daily_messages_used ?? 0}/{subscription.daily_messages_limit} {t("dailyUsageCounter")} • {subscription.daily_messages_limit} {t("dailyMessagesLabel")}
              </div>
            )}

            {subscription?.expires_at && (
              <div className="text-sm text-muted-foreground">
                {t("expiresAt")}: {new Date(subscription.expires_at).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US")}
              </div>
            )}

            {subscription?.card_brand && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="w-4 h-4" />
                {subscription.card_brand} •••• {subscription.card_last_four}
              </div>
            )}

            {(!subscription?.active && subscription?.status !== "trialing") && (
              <Button variant="hero" onClick={() => navigate("/subscribe")} className="w-full mt-2">
                {t("subscribeNow")}
              </Button>
            )}
            {(subscription?.active || subscription?.status === "trialing") && (
              <CancelSubscriptionButton t={t} refetch={refetch} session={session} />
            )}
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">{t("paymentHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("noTransactions")}</p>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm border-b border-border/30 pb-2">
                    <div>
                      <span className="font-medium">{t(`paymentType_${tx.payment_type}` as TranslationKey)}</span>
                      <span className="text-muted-foreground ms-2">
                        {new Date(tx.created_at).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{(tx.amount / 100).toFixed(2)} {tx.currency}</span>
                      <span className={tx.status === "captured" ? "text-primary" : tx.status === "failed" ? "text-destructive" : "text-accent"}>
                        {t(`txStatus_${tx.status}` as TranslationKey)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Account;
