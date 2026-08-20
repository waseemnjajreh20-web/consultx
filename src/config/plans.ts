/**
 * Centralized Plan Configuration
 * Single source of truth for all subscription plans, limits, and features
 * 
 * IMPORTANT: This file replaces ALL hardcoded plan values across the codebase.
 * Plan definitions must match subscription_plans table in Supabase.
 */

export const PLAN_CONFIG = {
  /** Plan slugs - must match subscription_plans.slug in database */
  slugs: {
    free: "free",
    engineer: "engineer",
    pro: "pro",
    enterprise: "enterprise",
    enterpriseTeam: "enterprise_team",
    enterpriseOffice: "enterprise_office",
    owner: "owner", // Admin override only
  } as const,

  /** Plan display names */
  names: {
    ar: {
      free: "مجاني",
      engineer: "مهندس",
      pro: "برو",
      enterprise: "مؤسسة",
      enterpriseTeam: "فريق المؤسسة",
      enterpriseOffice: "مكتب المؤسسة",
      owner: "اشتراك المالك",
    },
    en: {
      free: "Free",
      engineer: "Engineer",
      pro: "Pro",
      enterprise: "Enterprise",
      enterpriseTeam: "Enterprise Team",
      enterpriseOffice: "Enterprise Office",
      owner: "Owner Mode",
    },
  } as const,

  /** Plan prices in HALALA (1 SAR = 100 HALALA) */
  prices: {
    free: { monthly: 0, yearly: 0, currency: "SAR" },
    engineer: { monthly: 9900, yearly: 99000, currency: "SAR" }, // 99 SAR/mo
    pro: { monthly: 19900, yearly: 199000, currency: "SAR" }, // 199 SAR/mo
    enterprise: { monthly: 34900, yearly: 349000, currency: "SAR" }, // 349 SAR/mo
    enterpriseTeam: { monthly: 29900, yearly: 299000, currency: "SAR", perSeat: true }, // 299 SAR/seat/mo
    enterpriseOffice: { monthly: 49900, yearly: 499000, currency: "SAR", perSeat: true }, // 499 SAR/seat/mo
    owner: { monthly: 0, yearly: 0, currency: "SAR" },
  } as const,

  /** Plan tier hierarchy (higher = more features) */
  tiers: {
    free: 0,
    engineer: 1,
    pro: 2,
    enterprise: 3,
    enterpriseTeam: 3,
    enterpriseOffice: 3,
    owner: 4, // Highest - admin override
  } as const,

  /** Plan feature limits */
  limits: {
    /** Daily message limits per mode */
    dailyMessages: {
      free: { advisory: 10, analysis: 5 },
      engineer: { advisory: 20, analysis: 10 },
      pro: { advisory: 100, analysis: 50 },
      enterprise: { advisory: null, analysis: null }, // null = unlimited
      enterpriseTeam: { advisory: null, analysis: null },
      enterpriseOffice: { advisory: null, analysis: null },
      owner: { advisory: null, analysis: null },
    },

    /** Per-seat configuration (for enterprise plans) */
    seats: {
      free: { min: 1, max: 1, pricePerSeat: null },
      engineer: { min: 1, max: 1, pricePerSeat: null },
      pro: { min: 1, max: 1, pricePerSeat: null },
      enterprise: { min: 1, max: 1, pricePerSeat: null }, // Legacy flat
      enterpriseTeam: { min: 2, max: 50, pricePerSeat: 29900 }, // 299 SAR/seat
      enterpriseOffice: { min: 5, max: 200, pricePerSeat: 49900 }, // 499 SAR/seat
      owner: { min: 1, max: 1, pricePerSeat: null },
    },

    /** Feature flags per plan */
    features: {
      free: {
        advisoryMode: true,
        analysisMode: false,
        planAnalysis: false,
        documentUpload: false,
        docxReports: false,
        apiAccess: false,
        prioritySupport: false,
        customBranding: false,
        sso: false,
        auditLogs: false,
      },
      engineer: {
        advisoryMode: true,
        analysisMode: true,
        planAnalysis: true,
        documentUpload: true,
        docxReports: true,
        apiAccess: false,
        prioritySupport: false,
        customBranding: false,
        sso: false,
        auditLogs: false,
      },
      pro: {
        advisoryMode: true,
        analysisMode: true,
        planAnalysis: true,
        documentUpload: true,
        docxReports: true,
        apiAccess: true,
        prioritySupport: true,
        customBranding: false,
        sso: false,
        auditLogs: false,
      },
      enterprise: {
        advisoryMode: true,
        analysisMode: true,
        planAnalysis: true,
        documentUpload: true,
        docxReports: true,
        apiAccess: true,
        prioritySupport: true,
        customBranding: true,
        sso: true,
        auditLogs: true,
      },
      enterpriseTeam: {
        advisoryMode: true,
        analysisMode: true,
        planAnalysis: true,
        documentUpload: true,
        docxReports: true,
        apiAccess: true,
        prioritySupport: true,
        customBranding: true,
        sso: true,
        auditLogs: true,
      },
      enterpriseOffice: {
        advisoryMode: true,
        analysisMode: true,
        planAnalysis: true,
        documentUpload: true,
        docxReports: true,
        apiAccess: true,
        prioritySupport: true,
        customBranding: true,
        sso: true,
        auditLogs: true,
      },
      owner: {
        advisoryMode: true,
        analysisMode: true,
        planAnalysis: true,
        documentUpload: true,
        docxReports: true,
        apiAccess: true,
        prioritySupport: true,
        customBranding: true,
        sso: true,
        auditLogs: true,
      },
    } as const,
  },

  /** Enterprise plan slugs (for tier checks) */
  enterpriseSlugs: [
    "enterprise",
    "enterprise_team",
    "enterprise_office",
  ] as const,

  /** Paid plan slugs (non-free) */
  paidSlugs: [
    "engineer",
    "pro",
    "enterprise",
    "enterprise_team",
    "enterprise_office",
  ] as const,

  /** Plan upgrade paths */
  upgradePaths: {
    free: ["engineer", "pro", "enterprise"],
    engineer: ["pro", "enterprise"],
    pro: ["enterprise"],
    enterprise: ["enterpriseTeam", "enterpriseOffice"],
    enterpriseTeam: ["enterpriseOffice"],
    enterpriseOffice: [],
  } as const,

  /** Default plan for new users */
  defaultPlan: "free",

  /** Trial plan (what trial users get) */
  trialPlan: "engineer",

  /** Plan colors for UI */
  colors: {
    free: "border-muted/50 text-muted-foreground",
    engineer: "border-accent/40 text-accent",
    pro: "border-primary/40 text-primary",
    enterprise: "border-purple-500/40 text-purple-400",
    enterpriseTeam: "border-purple-500/40 text-purple-400",
    enterpriseOffice: "border-purple-500/40 text-purple-400",
    owner: "border-primary/40 text-primary",
  } as const,
} as const;

export type PlanConfig = typeof PLAN_CONFIG;
export type PlanSlug = typeof PLAN_CONFIG.slugs[keyof typeof PLAN_CONFIG.slugs];
export type PlanTier = keyof typeof PLAN_CONFIG.tiers;
export type PlanLimits = typeof PLAN_CONFIG.limits;

/** Get plan display name in specified language */
export function getPlanName(slug: PlanSlug, lang: "ar" | "en" = "ar"): string {
  return PLAN_CONFIG.names[lang][slug] ?? slug;
}

/** Get plan tier (higher = more features) */
export function getPlanTier(slug: PlanSlug): number {
  return PLAN_CONFIG.tiers[slug] ?? 0;
}

/** Check if plan is enterprise tier */
export function isEnterprisePlan(slug: PlanSlug): boolean {
  return PLAN_CONFIG.enterpriseSlugs.includes(slug as any);
}

/** Check if plan is paid (non-free) */
export function isPaidPlan(slug: PlanSlug): boolean {
  return PLAN_CONFIG.paidSlugs.includes(slug as any);
}

/** Get daily message limits for a plan */
export function getDailyLimits(slug: PlanSlug): { advisory: number | null; analysis: number | null } {
  return PLAN_CONFIG.limits.dailyMessages[slug] ?? PLAN_CONFIG.limits.dailyMessages.free;
}

/** Get seat configuration for a plan */
export function getSeatConfig(slug: PlanSlug): { min: number; max: number; pricePerSeat: number | null } {
  return PLAN_CONFIG.limits.seats[slug] ?? PLAN_CONFIG.limits.seats.free;
}

/** Check if plan has a specific feature */
export function planHasFeature(slug: PlanSlug, feature: keyof typeof PLAN_CONFIG.limits.features.free): boolean {
  return PLAN_CONFIG.limits.features[slug]?.[feature] ?? false;
}

/** Get available upgrade plans for current plan */
export function getUpgradePaths(slug: PlanSlug): PlanSlug[] {
  return PLAN_CONFIG.upgradePaths[slug] ?? [];
}

/** Compare two plans by tier (returns positive if a > b) */
export function comparePlans(a: PlanSlug, b: PlanSlug): number {
  return getPlanTier(a) - getPlanTier(b);
}

/** Get plan price in SAR (monthly) */
export function getPlanMonthlyPrice(slug: PlanSlug): number {
  return PLAN_CONFIG.prices[slug]?.monthly ?? 0;
}

/** Get plan price in SAR (yearly) */
export function getPlanYearlyPrice(slug: PlanSlug): number {
  return PLAN_CONFIG.prices[slug]?.yearly ?? 0;
}

/** Get plan color for UI */
export function getPlanColor(slug: PlanSlug): string {
  return PLAN_CONFIG.colors[slug] ?? PLAN_CONFIG.colors.free;
}

/** Check if plan A is higher tier than plan B */
export function isHigherTier(a: PlanSlug, b: PlanSlug): boolean {
  return comparePlans(a, b) > 0;
}

/** Get all plan slugs sorted by tier (lowest to highest) */
export function getAllPlanSlugs(): PlanSlug[] {
  return Object.entries(PLAN_CONFIG.tiers)
    .sort(([, a], [, b]) => a - b)
    .map(([slug]) => slug as PlanSlug);
}