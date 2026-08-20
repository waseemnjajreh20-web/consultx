import { isCorporateEmail as isCorporateEmailConfig, TRIAL_CONFIG } from "@/config/trial";

export const FREE_EMAIL_DOMAINS = TRIAL_CONFIG.freeEmailDomains;

export const LAUNCH_PROMO = {
  enabled: true,
  name: "launch_engineer_trial",
  trialDays: TRIAL_CONFIG.trialDays,
  expiryDate: new Date("2026-06-30T23:59:59Z"),
  planGranted: "engineer",
};

export function isCorporateEmail(email: string): boolean {
  return isCorporateEmailConfig(email);
}

export function isPromoActive(): boolean {
  return LAUNCH_PROMO.enabled && new Date() < LAUNCH_PROMO.expiryDate;
}

export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "0 دقيقة";
  const totalMinutes = Math.floor(msRemaining / 60000);
  const totalHours = Math.floor(msRemaining / 3600000);
  const totalDays = Math.floor(msRemaining / 86400000);

  if (totalMinutes < 60) {
    return `${totalMinutes} دقيقة`;
  }
  if (totalHours < 24) {
    const h = totalHours;
    const m = totalMinutes % 60;
    return m > 0 ? `${h} ساعة و ${m} دقيقة` : `${h} ساعة`;
  }
  const d = totalDays;
  const h = totalHours % 24;
  return h > 0 ? `${d} يوم و ${h} ساعة` : `${d} يوم`;
}
