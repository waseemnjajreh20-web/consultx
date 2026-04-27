// E7.10A — Public case tracking endpoint.
//
// Anonymous (no JWT). Validates a 32-char public_token issued by
// public.ensure_case_public_tracking RPC, then returns a strict allow-listed
// payload describing the case to an external client. Internal data
// (case_notes, internal case_status_history, raw AI reports, internal
// case_reviews / approvals decision_notes, member emails) is never exposed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Mirrors src/lib/enterprise/casePublicMapping.ts and the CASE block in
// publish_case_public_update. Single source of truth for the AR/EN labels +
// default progress percent the public portal renders when no published
// update has overridden the value.
const STATUS_MAP: Record<string, { ar: string; en: string; progress: number }> = {
  draft:                    { ar: "قيد إنشاء الطلب",          en: "Drafting request",         progress: 5   },
  submitted:                { ar: "تم استلام الطلب",            en: "Request received",         progress: 15  },
  assigned:                 { ar: "تم تعيين المهندس",            en: "Engineer assigned",        progress: 25  },
  under_engineering_review: { ar: "قيد المراجعة الهندسية",      en: "Under engineering review", progress: 40  },
  ai_review_attached:       { ar: "قيد التحليل الذكي",            en: "Under AI analysis",        progress: 55  },
  engineer_review_completed:{ ar: "اكتملت مراجعة المهندس",       en: "Engineer review complete", progress: 65  },
  submitted_to_head:        { ar: "بانتظار اعتماد رئيس القسم",   en: "Awaiting head approval",   progress: 75  },
  returned_for_revision:    { ar: "بحاجة إلى استكمال / تعديل",   en: "Needs revision",           progress: 50  },
  approved_internal:        { ar: "معتمد داخليًا",                en: "Internally approved",      progress: 85  },
  delivered_to_client:      { ar: "تم تسليم المخرجات",            en: "Deliverables sent",        progress: 95  },
  closed:                   { ar: "مغلق",                          en: "Closed",                   progress: 100 },
  cancelled:                { ar: "ملغي",                          en: "Cancelled",                progress: 0   },
};

function mapStatus(s: string) {
  return STATUS_MAP[s] ?? { ar: s, en: s, progress: 0 };
}

// 404 for any failure mode -- avoid leaking enumeration signal to a casual
// scanner. The client UI shows a single generic "tracking unavailable" state
// regardless of whether the token was malformed, missing, or revoked.
function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── 1. Extract token (query string or POST body) ───────────────────────
    let token: string | null = null;
    try {
      const url = new URL(req.url);
      token = url.searchParams.get("token");
    } catch {
      return notFound();
    }
    if (!token && req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.token === "string") token = body.token;
      } catch {
        // ignore -- fall through to notFound below
      }
    }
    if (!token || typeof token !== "string" || token.length < 16 || token.length > 64) {
      return notFound();
    }

    // ── 2. Service role client (bypasses RLS — strict allow-list filtering
    //       happens below; no anonymous direct table access) ───────────────
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── 3. Resolve token → tracking row ────────────────────────────────────
    const { data: tracking, error: trackingErr } = await supabase
      .from("case_public_tracking")
      .select(
        "case_id, org_id, public_token, public_enabled, public_title, public_summary, " +
        "show_engineer_contact, show_progress_percent, last_published_at"
      )
      .eq("public_token", token)
      .maybeSingle();

    if (trackingErr) {
      console.error("tracking lookup error:", trackingErr.message);
      return notFound();
    }
    if (!tracking || !tracking.public_enabled) {
      return notFound();
    }

    // ── 4. Load case (public-safe fields only) ─────────────────────────────
    const { data: enterpriseCase, error: caseErr } = await supabase
      .from("enterprise_cases")
      .select("id, org_id, case_number, status, title, assigned_engineer_id")
      .eq("id", tracking.case_id)
      .maybeSingle();

    if (caseErr || !enterpriseCase) {
      return notFound();
    }

    // ── 5. Organization name + branding ────────────────────────────────────
    const [{ data: org }, { data: branding }] = await Promise.all([
      supabase
        .from("organizations")
        .select("id, name")
        .eq("id", tracking.org_id)
        .maybeSingle(),
      supabase
        .from("organization_branding_settings")
        .select("logo_url, report_header_ar, report_header_en, primary_color, secondary_color")
        .eq("org_id", tracking.org_id)
        .maybeSingle(),
    ]);

    // ── 6. Latest 20 published updates (timeline) ──────────────────────────
    const { data: updatesRaw } = await supabase
      .from("case_public_updates")
      .select(
        "id, title_ar, title_en, body_ar, body_en, public_status, progress_percent, " +
        "client_action_required, required_action_ar, required_action_en, published_at"
      )
      .eq("case_id", tracking.case_id)
      .order("published_at", { ascending: false })
      .limit(20);

    const updates = updatesRaw ?? [];
    const latestUpdate = updates[0] ?? null;

    // ── 7. Compute current public status / progress to display ─────────────
    const fallback = mapStatus(enterpriseCase.status);
    const currentSource = latestUpdate
      ? {
          public_status: latestUpdate.public_status,
          ar: mapStatus(latestUpdate.public_status).ar,
          en: mapStatus(latestUpdate.public_status).en,
          progress: latestUpdate.progress_percent,
        }
      : {
          public_status: enterpriseCase.status,
          ar: fallback.ar,
          en: fallback.en,
          progress: fallback.progress,
        };

    // ── 8. Engineer info (only if explicitly opted in) ─────────────────────
    let assignedEngineer: {
      display_name: string | null;
      role_title_ar: string | null;
      role_title_en: string | null;
    } | null = null;
    if (tracking.show_engineer_contact && enterpriseCase.assigned_engineer_id) {
      const [{ data: userProfile }, { data: orgMemberProfile }] = await Promise.all([
        supabase
          .from("user_public_profiles")
          .select("display_name")
          .eq("user_id", enterpriseCase.assigned_engineer_id)
          .maybeSingle(),
        supabase
          .from("org_member_profiles")
          .select("display_name_override, role_title_ar, role_title_en")
          .eq("user_id", enterpriseCase.assigned_engineer_id)
          .eq("org_id", tracking.org_id)
          .maybeSingle(),
      ]);
      if (userProfile || orgMemberProfile) {
        assignedEngineer = {
          display_name:
            (orgMemberProfile?.display_name_override?.trim() || null) ??
            userProfile?.display_name ??
            null,
          role_title_ar: orgMemberProfile?.role_title_ar ?? null,
          role_title_en: orgMemberProfile?.role_title_en ?? null,
        };
      }
    }

    // ── 9. Surface the most recent client action request, if any ───────────
    const requiredAction = updates.find(
      (u) =>
        u.client_action_required &&
        ((u.required_action_ar && u.required_action_ar.trim()) ||
          (u.required_action_en && u.required_action_en.trim())),
    );

    // ── 10. Strict allow-list payload ──────────────────────────────────────
    return json({
      organization: {
        name: org?.name ?? null,
      },
      branding: {
        logo_url: branding?.logo_url ?? null,
        header_ar: branding?.report_header_ar ?? null,
        header_en: branding?.report_header_en ?? null,
        primary_color: branding?.primary_color ?? null,
        secondary_color: branding?.secondary_color ?? null,
      },
      case: {
        case_number: enterpriseCase.case_number,
        public_title: tracking.public_title || enterpriseCase.title,
        public_summary: tracking.public_summary ?? null,
        status_public_label_ar: currentSource.ar,
        status_public_label_en: currentSource.en,
        progress_percent: tracking.show_progress_percent ? currentSource.progress : null,
        last_published_at: tracking.last_published_at,
      },
      assigned_engineer: assignedEngineer,
      updates: updates.map((u) => ({
        id: u.id,
        title_ar: u.title_ar,
        title_en: u.title_en,
        body_ar: u.body_ar,
        body_en: u.body_en,
        public_status: u.public_status,
        public_status_label_ar: mapStatus(u.public_status).ar,
        public_status_label_en: mapStatus(u.public_status).en,
        progress_percent: tracking.show_progress_percent ? u.progress_percent : null,
        client_action_required: u.client_action_required,
        published_at: u.published_at,
      })),
      client_action_required: !!requiredAction,
      latest_required_action: requiredAction
        ? {
            title_ar: requiredAction.title_ar,
            title_en: requiredAction.title_en,
            action_ar: requiredAction.required_action_ar,
            action_en: requiredAction.required_action_en,
            published_at: requiredAction.published_at,
          }
        : null,
    });
  } catch (err) {
    console.error("get-public-case-tracking unhandled:", err);
    // Even on internal errors, return 404 to avoid leaking signal
    return notFound();
  }
});
