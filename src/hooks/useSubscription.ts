import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SubscriptionStatus {
  active: boolean;
  status: "none" | "trialing" | "active" | "expired" | "cancelled";
  trial_days_remaining: number;
  plan: { id: string; name_ar: string; name_en: string; price_amount: number; currency: string } | null;
  expires_at: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  daily_messages_used: number;
  daily_messages_limit: number;
}

export function useSubscription() {
  const { user, session } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkSubscription = useCallback(async () => {
    if (!user || !session) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: fnError } = await supabase.functions.invoke("check-subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) throw fnError;
      setSubscription(data as SubscriptionStatus);
      setError(null);
    } catch (err: any) {
      console.error("Subscription check error:", err);
      setError(err.message);
      setSubscription(null);
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
