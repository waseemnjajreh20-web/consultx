import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  isAllowedAdminEmail,
  getAdminEntitlementOverride,
  ADMIN_OVERRIDE_HEADER,
} from "@/lib/adminEntitlementOverride";

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

  // Per-mode limits (new fields)
  plan_slug?: string;
  advisory_limit?: number | null;
  advisory_used?: number;
  analysis_limit?: number | null;
  analysis_used?: number;

  // E7.1: Admin entitlement override fields
  owner_mode?: boolean;

  // E6: Enterprise org access fields
  org_access?: {
    active: true;
    org_id: string;
    org_name: string;
    org_status: string;
    role: string;
    membership_status: string;
    trial_end: string | null;
    access_source: "organization";
    ai_access: boolean;
  } | null;
  effective_access_source?: string;
  effective_access?: string;
  effective_plan_slug?: string;
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

      const invokeHeaders: Record<string, string> = {
        Authorization: `Bearer ${session.access_token}`,
      };
      const adminOverride = isAllowedAdminEmail(user.email) ? getAdminEntitlementOverride() : null;
      if (adminOverride) invokeHeaders[ADMIN_OVERRIDE_HEADER] = adminOverride;

      const { data, error: fnError } = await supabase.functions.invoke("check-subscription", {
        headers: invokeHeaders,
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
