import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SubscriptionStatus {
  // Existing paid-subscription fields
  active: boolean;
  status: "none" | "trialing" | "active" | "expired" | "cancelled" | "past_due";
  trial_days_remaining: number;
  plan: { id: string; name_ar: string; name_en: string; price_amount: number; currency: string } | null;
  expires_at: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  daily_messages_used: number;
  daily_messages_limit: number;
  // Lifecycle fields
  cancel_at_period_end?: boolean;
  past_due_since?: string | null;

  // Launch trial fields
  access_state?: string;
  launch_trial_status?: string;
  launch_trial_active?: boolean;
  launch_trial_days_remaining?: number;
  launch_trial_hours_remaining?: number;
  launch_trial_end?: string | null;
  show_welcome_banner?: boolean;
  upgrade_context?: string | null;
  recommended_plan?: string;
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

  return { subscription, loading, error, refetch: checkSubscription };
}
