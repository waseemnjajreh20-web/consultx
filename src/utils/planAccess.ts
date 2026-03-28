/**
 * Plan access utilities for ConsultX
 * Determines a user's active plan and mode access based on profile data.
 * Launch trial gives access to standard/analysis with per-mode daily limits.
 */

export function getUserActivePlan(profile: any): string {
  if (!profile) return "free";

  // Check paid subscription first
  if (profile.subscription_end && new Date() < new Date(profile.subscription_end)) {
    return profile.plan_type || "free";
  }

  // Check legacy trial (card-verified or corporate)
  if (profile.trial_end && new Date() < new Date(profile.trial_end)) {
    if (profile.trial_type === "launch_engineer" || profile.plan_type === "engineer") {
      return "engineer";
    }
    return profile.plan_type || "free";
  }

  if (profile.plan_type && profile.plan_type !== "free") {
    return profile.plan_type;
  }

  return "free";
}

/**
 * Returns true if user has access to the given mode.
 * During a launch trial, standard and analysis are accessible (with daily limits).
 */
export function canAccessMode(plan: string, mode: string, launchTrialActive?: boolean): boolean {
  // Primary/رئيسي is always accessible
  if (mode === "رئيسي" || mode === "main" || mode === "primary") return true;

  // Paid engineer/enterprise plans have full mode access
  if (plan === "engineer" || plan === "enterprise") return true;

  // Launch trial: standard and analysis are accessible (server enforces per-mode limits)
  if (launchTrialActive) return true;

  // Free plan without trial: standard and analysis are locked
  return false;
}

export function getDailyMessageLimit(plan: string): number {
  if (plan === "free") return 10;
  return Infinity;
}

export function getPlanLabel(plan: string, lang: "ar" | "en" = "ar"): string {
  const labels: Record<string, Record<string, string>> = {
    free:       { ar: "مستكشف", en: "Explorer" },
    engineer:   { ar: "مهندس",  en: "Engineer"  },
    enterprise: { ar: "مؤسسة",  en: "Enterprise" },
  };
  return labels[plan]?.[lang] || (lang === "ar" ? "مستكشف" : "Explorer");
}

/** Returns the per-mode daily limit for the launch trial. */
export function getLaunchTrialModeLimit(mode: string): number {
  if (mode === "primary")  return 50;
  if (mode === "standard") return 2;
  if (mode === "analysis") return 1;
  return 50;
}
