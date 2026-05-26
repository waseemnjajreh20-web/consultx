export const EID50_CODE = "EID50";

export const EID50_LIVE = () => import.meta.env.VITE_EID50_LIVE === "true";

export function isEid50Active(): boolean {
  return EID50_LIVE();
}

// Verified from DB subscription_plans table — stored in halalas, divided by 100.
export const EID50_PRICING = {
  pro: {
    normalSar: 245,
    discountedSar: 122.5,
    normalLabel: "245 SAR",
    discountedLabel: "122.50 SAR",
  },
  enterpriseTeam: {
    normalPerSeatSar: 399,
    discountedPerSeatSar: 199.5,
    normalLabel: "399 SAR/seat",
    discountedLabel: "199.50 SAR/seat",
  },
} as const;

export const EID50_SUBJECTS = {
  recommended: "Eid Al-Adha Offer: ConsultX Pro for 122.50 SAR Instead of 245 SAR",
  alternatives: [
    "Eid Al-Adha Offer: ConsultX Pro at 50% Off",
    "Special Eid Offer for Engineering Offices — 50% Off Pro",
  ],
};

export const EID50_CAMPAIGN = {
  code: EID50_CODE,
  title: {
    en: "Eid Al-Adha Offer for Engineering Offices",
    ar: "عرض عيد الأضحى للمكاتب الهندسية",
  },
  subheadline: {
    en: "50% off your first month — valid only from 26 to 30 May 2026.",
    ar: "خصم 50% على أول شهر — صالح فقط من 26 إلى 30 مايو 2026.",
  },
  offer: {
    en: "ConsultX Pro for 122.50 SAR instead of 245 SAR — first month only.",
    ar: "ConsultX Pro بـ 122.50 ريال بدلًا من 245 ريال — أول شهر فقط.",
  },
  offerShort: {
    en: "50% off — 5 days only",
    ar: "خصم 50٪ — 5 أيام فقط",
  },
  cta: {
    en: "Activate 50% Eid Offer",
    ar: "فعّل خصم العيد 50%",
  },
  afterFirstMonth: {
    en: "After the discounted first month, the plan renews at the normal monthly price unless canceled.",
    ar: "بعد أول شهر مخفض، يتم التجديد بالسعر الشهري الطبيعي ما لم يتم الإلغاء.",
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
