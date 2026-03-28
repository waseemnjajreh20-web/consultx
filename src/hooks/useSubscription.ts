import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type LaunchTrialStatus =
  | "eligible_new"
  | "eligible_existing_pending"
  | "eligible_existing_active"
  | "expired"
  | "paid"
  | "ineligible_window_closed"
  | null;

export interface ModeUsageToday {
  primary:  number;
  standard: number;
  analysis: number;
}

export interface SubscriptionStatus {
  // Existing paid-subscription fields
  active: boolean;
  status: "none" | "trialing" | "active" | "expired" | "cancelled";
  trial_days_remaining: number;
  plan: { id: string; name_ar: string; name_en: string; price_amount: number; currency: string } | null;
  expires_at: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  daily_messages_used: number;
  daily_messages_limit: number;

  // Launch trial fields
  launch_trial_status:          LaunchTrialStatus;
  launch_trial_active:          boolean;
  launch_trial_days_remaining:  number;
  launch_trial_end:             string | null;
  mode_limits:                  Record<string, number> | null;
  mode_usage_today:             ModeUsageToday;
  show_welcome_banner:          boolean;
}

export function useSubscription() {
  const { user, session } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const hasLoadedOnce             = useRef(false);

  const checkSubscription = useCallback(async () => {
    if (!user || !session) {
      setSubscription(null);
      setLoading(false);
      hasLoadedOnce.current = false;
      return;
    }

    try {
      if (!hasLoadedOnce.current) setLoading(true);

      const { data, error: fnError } = await supabase.functions.invoke("check-subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) throw fnError;
      setSubscription(data as SubscriptionStatus);
      setError(null);
      hasLoadedOnce.current = true;
    } catch (err: any) {
      console.error("Subscription check error:", err);
      setError(err.message);
      if (!hasLoadedOnce.current) setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [user, session]);

  useEffect(() => {
    if (user && session) checkSubscription();
    else { setSubscription(null); setLoading(false); }
  }, [user, session]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Optimistically increment a mode's usage count after a successful message */
  const incrementModeUsage = useCallback((mode: "primary" | "standard" | "analysis") => {
    setSubscription(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        mode_usage_today: {
          ...prev.mode_usage_today,
          [mode]: (prev.mode_usage_today?.[mode] ?? 0) + 1,
        },
      };
    });
  }, []);

  return { subscription, loading, error, refetch: checkSubscription, incrementModeUsage };
}
