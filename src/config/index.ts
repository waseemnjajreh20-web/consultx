export { AUTH_CONFIG, isAdminEmail, validatePassword } from "./auth";
export type { AuthConfig, AdminEmail } from "./auth";

export { TRIAL_CONFIG, isTrialCampaignActive, isCorporateEmail, getTrialEndDate, getTrialDaysRemaining, getTrialHoursRemaining } from "./trial";
export type { TrialConfig, TrialType, TrialStatus } from "./trial";

export { PLAN_CONFIG, getPlanName, getPlanTier, isEnterprisePlan, isPaidPlan, getDailyLimits, getSeatConfig, planHasFeature, getUpgradePaths, comparePlans, getPlanMonthlyPrice, getPlanYearlyPrice, getPlanColor, isHigherTier, getAllPlanSlugs } from "./plans";
export type { PlanConfig, PlanSlug, PlanTier, PlanLimits } from "./plans";

export { SUBSCRIPTION_CONFIG, isActiveStatus, isTerminalStatus, hasActiveAccess } from "./subscription";
export type { SubscriptionStatus, AccessState, EffectiveAccessSource } from "./subscription";
