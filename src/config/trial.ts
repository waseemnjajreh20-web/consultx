/**
 * Centralized Trial Configuration
 * Single source of truth for all trial-related constants
 * 
 * IMPORTANT: This file replaces ALL hardcoded trial values across the codebase.
 * Previously: 3 days (corporate), 7 days (auto), 7 days (launch) - INCONSISTENT
 * Now: Single TRIAL_DAYS = 7 for ALL trial types
 */

export const TRIAL_CONFIG = {
  /** Universal trial duration in days - applies to ALL trial types */
  trialDays: 7,

  /** Campaign/promo window */
  campaign: {
    /** Launch date when trial campaign starts */
    launchDate: new Date("2026-03-28T00:00:00.000Z"),
    /** Campaign end date - no new trials after this */
    endDate: new Date("2026-04-28T00:00:00.000Z"),
  },

  /** Trial types available in the system */
  types: {
    /** Auto-trial: Granted on first sign-in (auto-trial edge function) */
    auto: {
      name: "auto_trial",
      planGranted: "engineer",
      description: "Automatic 7-day trial on first sign-in",
    },
    /** Corporate trial: Granted for corporate email domains (corporate-trial edge function) */
    corporate: {
      name: "launch_engineer_trial",
      planGranted: "engineer",
      description: "7-day trial for corporate email domains",
    },
    /** Launch trial: General launch campaign trial (launch-trial-activate edge function) */
    launch: {
      name: "launch_trial",
      planGranted: "engineer",
      description: "General launch campaign trial",
    },
  } as const,

  /** Trial status values (must match database enum) */
  status: {
    active: "trial_active",
    expired: "trial_expired",
    pending: "eligible_existing_pending",
    consumed: "paid",
    ineligible: "ineligible",
  } as const,

  /** Trial-related profile fields */
  profileFields: {
    status: "launch_trial_status",
    start: "launch_trial_start",
    end: "launch_trial_end",
    consumed: "launch_trial_consumed",
    welcomed: "launch_trial_welcomed",
    source: "launch_source",
    type: "trial_type",
  } as const,

  /** Welcome banner configuration */
  welcomeBanner: {
    /** Show welcome banner for existing users on first trial activation */
    showForExistingUsers: true,
    /** Don't show again after user dismisses */
    persistDismissal: true,
    /** Storage key for dismissal */
    storageKey: "trial_welcome_dismissed_",
  },

  /** Free email domains that DON'T qualify for corporate trial */
  freeEmailDomains: new Set([
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
    "aol.com", "icloud.com", "mail.com", "protonmail.com", "zoho.com",
    "yandex.com", "gmx.com", "tutanota.com", "fastmail.com",
    "yahoo.co.uk", "hotmail.co.uk", "googlemail.com",
  ]),

  /** Corporate trial eligibility check */
  corporateEligibility: {
    /** Minimum domain length */
    minDomainLength: 3,
    /** Check MX record (future enhancement) */
    checkMxRecord: false,
  },
} as const;

export type TrialConfig = typeof TRIAL_CONFIG;
export type TrialType = keyof typeof TRIAL_CONFIG.types;
export type TrialStatus = typeof TRIAL_CONFIG.status[keyof typeof TRIAL_CONFIG.status];

/** Check if trial campaign is currently active */
export function isTrialCampaignActive(): boolean {
  const now = new Date();
  return now >= TRIAL_CONFIG.campaign.launchDate && now < TRIAL_CONFIG.campaign.endDate;
}

/** Check if email domain qualifies for corporate trial */
export function isCorporateEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain.length < TRIAL_CONFIG.corporateEligibility.minDomainLength) {
    return false;
  }
  return !TRIAL_CONFIG.freeEmailDomains.has(domain);
}

/** Get trial end date from start date */
export function getTrialEndDate(startDate: Date = new Date()): Date {
  const end = new Date(startDate);
  end.setDate(end.getDate() + TRIAL_CONFIG.trialDays);
  return end;
}

/** Get days remaining until trial end */
export function getTrialDaysRemaining(trialEnd: Date | string | null): number {
  if (!trialEnd) return 0;
  const end = new Date(trialEnd);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** Get hours remaining until trial end */
export function getTrialHoursRemaining(trialEnd: Date | string | null): number {
  if (!trialEnd) return 0;
  const end = new Date(trialEnd);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60));
}