export const FOUNDING10_CODE = "FOUNDING10";

export const FOUNDING10_LIVE = () => import.meta.env.VITE_FOUNDING10_LIVE === "true";

export function isFounding10Active(): boolean {
  return FOUNDING10_LIVE();
}

export const FOUNDING10_CAMPAIGN = {
  code: FOUNDING10_CODE,
  title: {
    en: "Founding Engineers Offer",
    ar: "عرض خاص للمهندسين الأوائل",
  },
  offer: {
    en: "Your first month of ConsultX Pro is available for 10 SAR.",
    ar: "أول شهر في ConsultX Pro مقابل 10 ريال فقط.",
  },
  offerShort: {
    en: "First month for 10 SAR",
    ar: "أول شهر بـ 10 ريال",
  },
  cta: {
    en: "Activate for 10 SAR",
    ar: "فعّل بـ 10 ريال",
  },
  afterFirstMonth: {
    en: "After the first month, your subscription renews at the normal Pro price unless canceled.",
    ar: "بعد الشهر الأول، يتم التجديد بالسعر الطبيعي لخطة Pro ما لم يتم الإلغاء.",
  },
  durationDays: 7,
};

const BASE_URL = import.meta.env.VITE_APP_URL || "https://www.consultx.app";

export function getFounding10SubscribeUrl(utmSource = "email", utmMedium = "reactivation"): string {
  return `${BASE_URL}/subscribe?plan=pro&promo=${FOUNDING10_CODE}&utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=founding10&utm_content=founding_engineers_offer`;
}

export function getFounding10SubscribeUrlInApp(): string {
  return getFounding10SubscribeUrl("in_app", "banner");
}
