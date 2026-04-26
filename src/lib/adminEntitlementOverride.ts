export const ADMIN_OVERRIDE_EMAILS = ["waseemnjajreh20@gmail.com", "njajrehwaseem@gmail.com"];
export const ADMIN_OVERRIDE_STORAGE_KEY = "cx_admin_entitlement_override";
export const ADMIN_OVERRIDE_HEADER = "X-ConsultX-Admin-Entitlement-Override";
export const ADMIN_OVERRIDE_EVENT = "consultx-admin-override-changed";

export type AdminEntitlementOverride = "free" | "engineer" | "pro" | "enterprise" | "owner";

export const OVERRIDE_LABELS: Record<AdminEntitlementOverride, { en: string; ar: string }> = {
  free:       { en: "Free",       ar: "العادي"        },
  engineer:   { en: "Engineer",   ar: "المهندس"       },
  pro:        { en: "Pro",        ar: "البرو"          },
  enterprise: { en: "Enterprise", ar: "المؤسسي"       },
  owner:      { en: "Owner Mode", ar: "اشتراك المالك" },
};

const VALID: AdminEntitlementOverride[] = ["free", "engineer", "pro", "enterprise", "owner"];

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  return !!(email && ADMIN_OVERRIDE_EMAILS.includes(email.toLowerCase()));
}

export function getAdminEntitlementOverride(): AdminEntitlementOverride | null {
  try {
    const v = localStorage.getItem(ADMIN_OVERRIDE_STORAGE_KEY);
    return v && VALID.includes(v as AdminEntitlementOverride) ? (v as AdminEntitlementOverride) : null;
  } catch {
    return null;
  }
}

export function setAdminEntitlementOverride(value: AdminEntitlementOverride): void {
  try {
    localStorage.setItem(ADMIN_OVERRIDE_STORAGE_KEY, value);
  } catch { /* storage unavailable */ }
  dispatchAdminOverrideChange(value);
}

export function clearAdminEntitlementOverride(): void {
  try {
    localStorage.removeItem(ADMIN_OVERRIDE_STORAGE_KEY);
  } catch { /* storage unavailable */ }
  dispatchAdminOverrideChange(null);
}

export function dispatchAdminOverrideChange(value: AdminEntitlementOverride | null): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(ADMIN_OVERRIDE_EVENT, { detail: { value } }));
  } catch { /* events unavailable */ }
}
