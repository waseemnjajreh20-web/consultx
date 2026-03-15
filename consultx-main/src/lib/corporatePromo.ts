export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "aol.com", "icloud.com", "mail.com", "protonmail.com", "zoho.com",
  "yandex.com", "gmx.com", "tutanota.com", "fastmail.com",
  "yahoo.co.uk", "hotmail.co.uk", "googlemail.com",
]);

export const LAUNCH_PROMO = {
  enabled: true,
  name: "launch_engineer_trial",
  trialDays: 3,
  expiryDate: new Date("2026-06-30T23:59:59Z"),
  planGranted: "engineer",
};

export function isCorporateEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domain.length > 0 && !FREE_EMAIL_DOMAINS.has(domain);
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
