/**
 * E7.10A — Case status mapping for the public tracking surface.
 *
 * Single source of truth for the AR/EN labels and default progress percent
 * shown to external clients. Mirrored inside:
 *   - supabase/migrations/20260427000001_enterprise_public_tracking.sql
 *     (publish_case_public_update default-progress CASE block)
 *   - supabase/functions/get-public-case-tracking/index.ts
 *     (STATUS_MAP)
 *
 * If you change the labels here, update both mirrors. Progress defaults are
 * the safest fallback when no published update has overridden them.
 */

export type CaseInternalStatus =
  | "draft"
  | "submitted"
  | "assigned"
  | "under_engineering_review"
  | "ai_review_attached"
  | "engineer_review_completed"
  | "submitted_to_head"
  | "returned_for_revision"
  | "approved_internal"
  | "delivered_to_client"
  | "closed"
  | "cancelled";

export interface PublicStatusInfo {
  ar: string;
  en: string;
  progress: number;
}

export const PUBLIC_STATUS_MAP: Record<CaseInternalStatus, PublicStatusInfo> = {
  draft:                     { ar: "قيد إنشاء الطلب",            en: "Drafting request",         progress: 5   },
  submitted:                 { ar: "تم استلام الطلب",              en: "Request received",         progress: 15  },
  assigned:                  { ar: "تم تعيين المهندس",              en: "Engineer assigned",        progress: 25  },
  under_engineering_review:  { ar: "قيد المراجعة الهندسية",        en: "Under engineering review", progress: 40  },
  ai_review_attached:        { ar: "قيد التحليل الذكي",              en: "Under AI analysis",        progress: 55  },
  engineer_review_completed: { ar: "اكتملت مراجعة المهندس",         en: "Engineer review complete", progress: 65  },
  submitted_to_head:         { ar: "بانتظار اعتماد رئيس القسم",     en: "Awaiting head approval",   progress: 75  },
  returned_for_revision:     { ar: "بحاجة إلى استكمال / تعديل",     en: "Needs revision",           progress: 50  },
  approved_internal:         { ar: "معتمد داخليًا",                  en: "Internally approved",      progress: 85  },
  delivered_to_client:       { ar: "تم تسليم المخرجات",              en: "Deliverables sent",        progress: 95  },
  closed:                    { ar: "مغلق",                            en: "Closed",                   progress: 100 },
  cancelled:                  { ar: "ملغي",                            en: "Cancelled",                progress: 0   },
};

export function getPublicStatusInfo(status: string): PublicStatusInfo {
  return (PUBLIC_STATUS_MAP as Record<string, PublicStatusInfo>)[status] ?? {
    ar: status,
    en: status,
    progress: 0,
  };
}

export function getDefaultProgress(status: string): number {
  return getPublicStatusInfo(status).progress;
}

/** Build the canonical public tracking URL for a token. */
export function buildPublicTrackingUrl(token: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://www.consultx.app");
  return `${base.replace(/\/$/, "")}/track/${encodeURIComponent(token)}`;
}
