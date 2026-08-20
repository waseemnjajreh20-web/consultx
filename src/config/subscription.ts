export const SUBSCRIPTION_CONFIG = {
  statuses: {
    none: "none",
    trialing: "trialing",
    active: "active",
    expired: "expired",
    cancelled: "cancelled",
    pastDue: "past_due",
    pendingActivation: "pending_activation",
  } as const,

  accessStates: {
    paidActive: "paid_active",
    trialActive: "trial_active",
    trialExpired: "trial_expired",
    eligibleExistingPending: "eligible_existing_pending",
    ineligible: "ineligible",
  } as const,

  effectiveAccessSources: {
    organization: "organization",
    individualSubscription: "individual_subscription",
    launchTrial: "launch_trial",
    adminOverride: "admin_override",
    admin: "admin",
    free: "free",
  } as const,

  gracePeriodDays: 7,

  dailyLimits: {
    free: { advisory: 10, analysis: 5 },
    trial: { advisory: 20, analysis: 10 },
    paid: { advisory: 9999, analysis: 9999 },
  } as const,
} as const;

export type SubscriptionStatus = typeof SUBSCRIPTION_CONFIG.statuses[keyof typeof SUBSCRIPTION_CONFIG.statuses];
export type AccessState = typeof SUBSCRIPTION_CONFIG.accessStates[keyof typeof SUBSCRIPTION_CONFIG.accessStates];
export type EffectiveAccessSource = typeof SUBSCRIPTION_CONFIG.effectiveAccessSources[keyof typeof SUBSCRIPTION_CONFIG.effectiveAccessSources];

export function isActiveStatus(status: string): boolean {
  return status === "active" || status === "trialing";
}

export function isTerminalStatus(status: string): boolean {
  return status === "expired" || status === "cancelled";
}

export function hasActiveAccess(accessState: string): boolean {
  return accessState === "paid_active" || accessState === "trial_active" || accessState === "enterprise";
}
