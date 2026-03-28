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

export interface LaunchTrialData {
  status: LaunchTrialStatus;
  trial_active: boolean;
  trial_start: string | null;
  trial_end: string | null;
  days_remaining: number;
  mode_limits: Record<string, number> | null;   // { primary: 50, standard: 2, analysis: 1 }
  show_welcome_banner: boolean;
}

export interface ModeUsageToday {
  primary: number;
  standard: number;
  analysis: number;
}

const DEFAULT: LaunchTrialData = {
  status: null,
  trial_active: false,
  trial_start: null,
  trial_end: null,
  days_remaining: 0,
  mode_limits: null,
  show_welcome_banner: false,
};

export function useLaunchTrial() {
  const { user, session } = useAuth();
  const [data, setData]     = useState<LaunchTrialData>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const activated = useRef(false);

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
