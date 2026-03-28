import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AccessState =
  | "trial_active"
  | "trial_expired"
  | "paid_active"
  | "eligible_existing_pending"
  | "ineligible"
  | null;

export type UpgradeContext = "trial_expired" | "account_upgrade" | "analysis_gate" | null;

export interface LaunchTrialData {
  access_state: AccessState;
  is_paid: boolean;
  trial_active: boolean;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  days_remaining: number;
  hours_remaining: number;
  show_welcome_banner: boolean;
  recommended_plan: "starter" | "pro" | "team";
  upgrade_context: UpgradeContext;
}

const DEFAULT: LaunchTrialData = {
  access_state: null,
  is_paid: false,
  trial_active: false,
  trial_started_at: null,
  trial_ends_at: null,
  days_remaining: 0,
  hours_remaining: 0,
  show_welcome_banner: false,
  recommended_plan: "pro",
  upgrade_context: null,
};

export function useLaunchTrial() {
  const { user, session } = useAuth();
  const [data, setData]       = useState<LaunchTrialData>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const activated             = useRef(false);

  const activate = useCallback(async () => {
    if (!user || !session) {
      setData(DEFAULT);
      setLoading(false);
      return;
    }

    try {
      const { data: result, error } = await supabase.functions.invoke("launch-trial-activate", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (result) setData(result as LaunchTrialData);
    } catch (err) {
      console.error("[useLaunchTrial] activate error:", err);
    } finally {
      setLoading(false);
    }
  }, [user, session]);

  useEffect(() => {
    if (user && session && !activated.current) {
      activated.current = true;
      activate();
    } else if (!user) {
      setData(DEFAULT);
      setLoading(false);
      activated.current = false;
    }
  }, [user, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissWelcomeBanner = useCallback(async () => {
    if (!user) return;
    setData(prev => ({ ...prev, show_welcome_banner: false }));
    // Mark as welcomed in DB (best-effort)
    await supabase
      .from("profiles")
      .update({ launch_trial_welcomed: true })
      .eq("user_id", user.id);
  }, [user]);

  return { trialData: data, loading, dismissWelcomeBanner, refetch: activate };
}
