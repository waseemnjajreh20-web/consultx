/**
 * Founding Engineers Offer (FOUNDING10) campaign constants.
 *
 * Single source of truth shared by the in-app banner, the Subscribe
 * promo card, the email template, the admin preview, and the send
 * edge function. Server-side handlers re-implement the same constants
 * in Deno (they cannot import this module) so any change here MUST
 * be mirrored in supabase/functions/_shared/founding10.ts if added.
 */

export const FOUNDING10_CODE = "FOUNDING10";

// 10 SAR = 1000 halalas (Moyasar API uses minor units).
export const FOUNDING10_FIRST_CHARGE_HALALAS = 1000;
export const FOUNDING10_FIRST_CHARGE_SAR = 10;

// Plan slug the promo unlocks. Hard-bound to "pro" to avoid abuse
// against per-seat enterprise plans.
export const FOUNDING10_PLAN_SLUG = "pro";

// Campaign window — 7 days from deployment. Keep this in lockstep with
// the server-side check in moyasar-create-subscription.
// Set on first deploy; using start = today (2026-05-19).
export const FOUNDING10_STARTS_AT = "2026-05-19T00:00:00Z";
export const FOUNDING10_ENDS_AT   = "2026-05-26T23:59:59Z";

export interface UtmParams {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
}

export const FOUNDING10_BASE_UTM: Pick<UtmParams, "utm_campaign" | "utm_content"> = {
  utm_campaign: "founding10",
  utm_content: "founding_engineers_offer",
};

export const FOUNDING10_BANNER_UTM: UtmParams = {
  utm_source: "in_app",
  utm_medium: "banner",
  ...FOUNDING10_BASE_UTM,
};

export const FOUNDING10_EMAIL_UTM: UtmParams = {
  utm_source: "email",
  utm_medium: "reactivation",
  ...FOUNDING10_BASE_UTM,
};

export const FOUNDING10_OWNER_TEST_UTM: UtmParams = {
  utm_source: "manual",
  utm_medium: "owner_test",
  ...FOUNDING10_BASE_UTM,
};

/** Compose the canonical promo URL with the given UTM block. */
export function buildFounding10Url(
  origin: string,
  utm: UtmParams,
): string {
  const base = origin.replace(/\/+$/, "");
  const params = new URLSearchParams({
    plan: FOUNDING10_PLAN_SLUG,
    promo: FOUNDING10_CODE,
    ...utm,
  });
  return `${base}/subscribe?${params.toString()}`;
}

/** Localized copy used by the in-app banner and the Subscribe promo card. */
export const FOUNDING10_COPY = {
  en: {
    eyebrow: "Founding Engineers Offer",
    title: "Unlock ConsultX Pro for your first month at only 10 SAR",
    subtitle:
      "Full access to Main, Advisory, and Analytical modes for a limited launch period.",
    cta: "Activate for 10 SAR",
    disclosureShort:
      "First month 10 SAR. Renews at the normal Pro price unless canceled.",
    promoCardTitle: "Founding Engineers Offer",
    promoCardBody:
      "Your first month of ConsultX Pro is available for 10 SAR. After the first month, your subscription renews at the normal Pro price unless canceled.",
  },
  ar: {
    eyebrow: "عرض خاص للمهندسين الأوائل",
    title: "فعّل ConsultX Pro لأول شهر مقابل 10 ريال فقط",
    subtitle: "وصول كامل إلى Main و Advisory و Analytical لفترة إطلاق محدودة.",
    cta: "فعّل بـ 10 ريال",
    disclosureShort: "أول شهر 10 ريال. التجديد بسعر Pro الطبيعي ما لم يتم الإلغاء.",
    promoCardTitle: "عرض خاص للمهندسين الأوائل",
    promoCardBody:
      "أول شهر في ConsultX Pro مقابل 10 ريال فقط. بعد الشهر الأول، يتم التجديد بالسعر الطبيعي لخطة Pro ما لم يتم الإلغاء.",
  },
} as const;

/** Is the campaign currently within its active window? */
export function isFounding10Active(now: Date = new Date()): boolean {
  const start = new Date(FOUNDING10_STARTS_AT).getTime();
  const end = new Date(FOUNDING10_ENDS_AT).getTime();
  const t = now.getTime();
  return t >= start && t <= end;
}

/** Normalize a free-text promo code and check whether it matches FOUNDING10. */
export function isFounding10Code(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.trim().toUpperCase() === FOUNDING10_CODE;
}
