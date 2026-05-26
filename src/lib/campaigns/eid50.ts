export const EID50_CODE = "EID50";

export const EID50_LIVE = () => import.meta.env.VITE_EID50_LIVE === "true";

export function isEid50Active(): boolean {
  return EID50_LIVE();
}

export const EID50_SUBJECTS = {
  recommended: "Eid Al-Adha Offer: 50% Off ConsultX Pro",
  alternatives: [
    "Eid Mubarak from ConsultX — 50% Off for 5 Days",
    "Special Eid Offer for Engineering Offices in Saudi Arabia",
  ],
};

export const EID50_CAMPAIGN = {
  code: EID50_CODE,
  title: {
    en: "Eid Al-Adha Offer for Engineering Offices",
    ar: "عرض عيد الأضحى للمكاتب الهندسية",
  },
  subheadline: {
    en: "Celebrate Eid with 50% off your first month of ConsultX Pro — valid for 5 days only.",
    ar: "بمناسبة عيد الأضحى، احصل على خصم 50% على أول شهر من ConsultX Pro لمدة 5 أيام فقط.",
  },
  offer: {
    en: "50% off your first month of ConsultX Pro — for engineering offices and consultants in Saudi Arabia.",
    ar: "خصم 50٪ على أول شهر من ConsultX Pro — للمكاتب الهندسية والاستشاريين في المملكة العربية السعودية.",
  },
  offerShort: {
    en: "50% off — 5 days only",
    ar: "خصم 50٪ — 5 أيام فقط",
  },
  cta: {
    en: "Claim 50% Eid Offer",
    ar: "احصل على خصم العيد 50%",
  },
  afterFirstMonth: {
    en: "After the discounted first month, your subscription renews at the normal Pro price unless canceled.",
    ar: "بعد أول شهر مخفض، يتم التجديد بالسعر الطبيعي لخطة Pro ما لم يتم الإلغاء.",
  },
  dateRange: {
    en: "Valid 26–30 May only",
    ar: "صالح من 26 إلى 30 مايو فقط",
  },
  durationDays: 5,
};

const BASE_URL = import.meta.env.VITE_APP_URL || "https://www.consultx.app";

export function getEid50SubscribeUrl(utmSource = "email", utmMedium = "outbound"): string {
  return `${BASE_URL}/subscribe?plan=pro&promo=${EID50_CODE}&utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=eid50&utm_content=engineering_offices_ksa`;
}
