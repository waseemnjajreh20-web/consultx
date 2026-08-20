/**
 * Centralized Authentication Configuration
 * Single source of truth for all auth-related constants
 * 
 * IMPORTANT: This file replaces ALL hardcoded auth values across the codebase.
 * Do NOT duplicate these values elsewhere.
 */

export const AUTH_CONFIG = {
  /** Admin emails - authoritative list for super-admin access */
  adminEmails: [
    "njajrehwaseem@gmail.com",
    "waseemnjajreh20@gmail.com",
  ] as const,

  /** Password requirements */
  password: {
    minLength: 6,
    maxLength: 128,
    requireUppercase: false,
    requireLowercase: false,
    requireNumbers: false,
    requireSpecialChars: false,
  },

  /** Session configuration */
  session: {
    /** Time in seconds before session is considered stale */
    maxAge: 60 * 60 * 24 * 7, // 7 days
    /** Auto-refresh threshold in seconds */
    refreshThreshold: 60 * 60, // 1 hour
  },

  /** OAuth providers configuration */
  oauth: {
    google: {
      enabled: true,
      redirectTo: typeof window !== "undefined" ? window.location.origin : "",
    },
  },

  /** Email confirmation */
  emailConfirmation: {
    /** Redirect after email confirmation */
    redirectTo: typeof window !== "undefined" ? window.location.origin : "",
  },

  /** Rate limiting (client-side hints) */
  rateLimits: {
    signUp: { maxAttempts: 5, windowMinutes: 15 },
    signIn: { maxAttempts: 10, windowMinutes: 15 },
    passwordReset: { maxAttempts: 3, windowMinutes: 60 },
    resendConfirmation: { maxAttempts: 3, windowMinutes: 60 },
  },

  /** Error messages keys (for translation) */
  errorKeys: {
    invalidCredentials: "invalidCredentials",
    emailNotConfirmed: "emailNotConfirmed",
    userAlreadyExists: "accountExists",
    weakPassword: "passwordMinLength",
    invalidEmail: "invalidEmail",
    passwordMismatch: "passwordMismatch",
    tooManyRequests: "tooManyRequests",
    networkError: "unexpectedError",
    sessionExpired: "sessionExpired",
  },
} as const;

export type AuthConfig = typeof AUTH_CONFIG;
export type AdminEmail = typeof AUTH_CONFIG.adminEmails[number];

/** Helper to check if email is admin */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return AUTH_CONFIG.adminEmails.includes(email.toLowerCase() as AdminEmail);
}

/** Helper to validate password */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < AUTH_CONFIG.password.minLength) {
    errors.push(AUTH_CONFIG.errorKeys.weakPassword);
  }
  if (password.length > AUTH_CONFIG.password.maxLength) {
    errors.push("passwordMaxLength");
  }
  return { valid: errors.length === 0, errors };
}