import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Profile {
  id: string;
  user_id: string;
  plan_type: string;
  trial_type: string | null;
  trial_start: string | null;
  trial_end: string | null;
  corporate_domain: string | null;
  trial_expired_modal_shown: boolean;
  // Launch trial fields
  launch_trial_status: string | null;
  launch_trial_start: string | null;
  launch_trial_end: string | null;
  launch_trial_welcomed: boolean;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [loading, setLoading]   = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return; }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setProfile(data as Profile | null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchProfile();
    else { setProfile(null); setLoading(false); }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const markTrialExpiredModalShown = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ trial_expired_modal_shown: true }).eq("user_id", user.id);
    setProfile(p => p ? { ...p, trial_expired_modal_shown: true } : p);
  };

  const isEngineerTrial = () => {
    if (!profile) return false;
    return profile.plan_type === "engineer" && !!profile.trial_end;
  };

  const isTrialExpired = () => {
    if (!profile?.trial_end) return false;
    return new Date(profile.trial_end) < new Date();
  };

  const isFreePlan = () => {
    if (!profile) return true;
    if (profile.plan_type === "engineer" && profile.trial_end) {
      return new Date(profile.trial_end) < new Date();
    }
    return profile.plan_type === "free";
  };

  const trialMsRemaining = () => {
    if (!profile?.trial_end) return 0;
    return Math.max(0, new Date(profile.trial_end).getTime() - Date.now());
  };

  const isLaunchTrialActive = () => {
    if (!profile?.launch_trial_end) return false;
    const status = profile.launch_trial_status;
    return (
      (status === "eligible_new" || status === "eligible_existing_active") &&
      new Date(profile.launch_trial_end) > new Date()
    );
  };

  const launchTrialDaysRemaining = () => {
    if (!isLaunchTrialActive() || !profile?.launch_trial_end) return 0;
    return Math.ceil((new Date(profile.launch_trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  return {
    profile, loading, fetchProfile,
    markTrialExpiredModalShown,
    isEngineerTrial, isTrialExpired, isFreePlan, trialMsRemaining,
    isLaunchTrialActive, launchTrialDaysRemaining,
  };
}
