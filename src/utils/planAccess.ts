/**
 * Plan access utilities for ConsultX
 * Determines a user's active plan based on their profile data.
 */

export function getUserActivePlan(profile: any): string {
  if (!profile) return "free";

  // Check paid subscription first (from direct checkout)
  if (profile.subscription_end && new Date() < new Date(profile.subscription_end)) {
    return profile.plan_type || "free";
  }

  // Check trial (from card-verified trial or corporate trial)
  if (profile.trial_end && new Date() < new Date(profile.trial_end)) {
    if (profile.trial_type === "launch_engineer" || profile.plan_type === "engineer") {
      return "engineer";
    }
    return profile.plan_type || "free";
  }

  // Check plan_type with user_subscriptions active state (handled by useSubscription hook)
  if (profile.plan_type && profile.plan_type !== "free") {
    // If plan_type is set but no dates, trust it (set by webhook/admin)
    return profile.plan_type;
  }

  return "free";
}

export function canAccessMode(plan: string, mode: string): boolean {
  // Main/رئيسي mode is always accessible
  if (mode === "رئيسي" || mode === "main" || mode === "standard") return true;

  // Advisory/Analytical modes require paid plan
  if (
    mode === "استشاري" || mode === "advisory" ||
    mode === "تحليلي" || mode === "analysis"
  ) {
    return plan === "engineer" || plan === "enterprise";
  }

  return false;
}

export function getDailyMessageLimit(plan: string): number {
  if (plan === "free") return 10;
  return Infinity;
}

export function getPlanLabel(plan: string, lang: "ar" | "en" = "ar"): string {
  const labels: Record<string, Record<string, string>> = {
    free: { ar: "مستكشف", en: "Explorer" },
    engineer: { ar: "مهندس", en: "Engineer" },
    enterprise: { ar: "مؤسسة", en: "Enterprise" },
  };
  return labels[plan]?.[lang] || (lang === "ar" ? "مستكشف" : "Explorer");
}
