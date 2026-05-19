import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// send-founding10-campaign
//
// Admin-only Supabase Edge Function. Surveys eligible recipients
// and (optionally) emails them the "Founding Engineers Offer".
//
// Eligibility is computed server-side from auth + subscription
// state. Per-user de-duplication is tracked via
//   auth.users.app_metadata.founding10_sent_at
// because the project's controlled migration process did not allow
// a dedicated campaign_sends table to land for this release.
//
// Modes (request body):
//   { mode: "preview" }                  — count eligible/sent/skipped
//   { mode: "send", dryRun: true,        — pick up to `limit` eligible
//     limit?: number, allowResend?: bool   users and report what WOULD send
//   }                                      without calling Resend
//   { mode: "send", dryRun: false,       — actually send via Resend, mark
//     limit?: number, allowResend?: bool   app_metadata, return counts
//   }
//   { mode: "export" }                   — return CSV of eligible emails
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   RESEND_API_KEY  (only needed for non-dry-run sends)
//   FROM_EMAIL      (optional; defaults to "ConsultX <info@consultx.app>")
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];
const CAMPAIGN_CODE = "FOUNDING10";
const CAMPAIGN_FIRST_CHARGE_SAR = 10;
const SUBJECT = "Founding Engineers Offer: Try ConsultX Pro for 10 SAR";
const LOGO_URL = "https://www.consultx.app/consultx-icon.png";
const PROD_ORIGIN = "https://www.consultx.app";

const HARD_SEND_CAP = 500;        // safety: never send more than this in one call
const DEFAULT_PREVIEW_LIMIT = 1000;

function ctaUrl(): string {
  const params = new URLSearchParams({
    plan: "pro",
    promo: CAMPAIGN_CODE,
    utm_source: "email",
    utm_medium: "reactivation",
    utm_campaign: "founding10",
    utm_content: "founding_engineers_offer",
  });
  return `${PROD_ORIGIN}/subscribe?${params.toString()}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(recipient: string): string {
  const cta = ctaUrl();
  const safeRecipient = escapeHtml(recipient);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ConsultX — Founding Engineers Offer</title>
</head>
<body style="margin:0;padding:0;background:#06090e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#dfe9f2">
<center style="width:100%;background:#06090e;padding:32px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#0a0f15;border:1px solid rgba(0,212,255,0.15);border-radius:14px;overflow:hidden">
    <tr>
      <td style="padding:28px 32px 8px;text-align:center;background:linear-gradient(135deg,rgba(0,212,255,0.10) 0%,rgba(10,15,21,0) 60%)">
        <img src="${LOGO_URL}" alt="ConsultX" width="48" height="48" style="display:inline-block;border:0;border-radius:8px">
        <div style="margin-top:14px;color:#00D4FF;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">Founding Engineers Offer</div>
        <h1 style="margin:8px 0 0;color:#e8f4fb;font-size:22px;font-weight:700;line-height:1.35">ConsultX Pro — first month for ${CAMPAIGN_FIRST_CHARGE_SAR} SAR</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 32px 8px;color:#cdd9e4;font-size:15px;line-height:1.7" dir="ltr">
        <p style="margin:14px 0 0">Hi Engineer,</p>
        <p style="margin:14px 0 0">You created a ConsultX account, but you may not have seen what the platform can really do yet.</p>
        <p style="margin:14px 0 0">ConsultX is built for engineers who deal with fire safety, Saudi Building Code, NFPA references, compliance reviews, and technical reports — the work that usually takes time, focus, and repeated checking.</p>
        <p style="margin:14px 0 0;color:#e8f4fb">For a limited launch period, you can activate your first month of <strong style="color:#e8f4fb">ConsultX Pro for only ${CAMPAIGN_FIRST_CHARGE_SAR} SAR</strong>.</p>
        <p style="margin:18px 0 0;font-weight:600;color:#e8f4fb">Use ConsultX Pro to:</p>
        <ul style="margin:8px 0 0;padding-left:20px;color:#cdd9e4">
          <li>Review fire and life safety requirements faster.</li>
          <li>Ask deeper SBC / NFPA questions in Advisory Mode.</li>
          <li>Analyze drawings and compliance notes in Analytical Mode.</li>
          <li>Generate clearer engineering reasoning with source-based answers.</li>
          <li>Save time before preparing reports, reviews, or client responses.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 32px 6px;text-align:center">
        <a href="${cta}" style="display:inline-block;padding:14px 30px;border-radius:8px;background:#00D4FF;color:#06090e;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 4px 16px rgba(0,212,255,0.28)">Activate for ${CAMPAIGN_FIRST_CHARGE_SAR} SAR</a>
        <div style="margin-top:10px;color:#7c8a99;font-size:12px">No long-term commitment. Cancel anytime. Promo code: <span style="color:#00D4FF;font-weight:700;letter-spacing:0.5px">${CAMPAIGN_CODE}</span></div>
      </td>
    </tr>
    <tr><td style="padding:6px 32px 0"><hr style="border:0;border-top:1px solid rgba(0,212,255,0.12);margin:22px 0 14px"></td></tr>
    <tr>
      <td dir="rtl" lang="ar" style="padding:6px 32px 14px;color:#cdd9e4;font-size:15px;line-height:1.85;text-align:right">
        <div style="color:#00D4FF;font-size:11px;font-weight:700;letter-spacing:0.6px">عرض خاص للمهندسين الأوائل</div>
        <h2 style="margin:8px 0 6px;color:#e8f4fb;font-size:18px;font-weight:700;line-height:1.5">ConsultX Pro — أول شهر بـ ${CAMPAIGN_FIRST_CHARGE_SAR} ريال</h2>
        <p style="margin:10px 0 0">مرحبًا مهندسنا العزيز،</p>
        <p style="margin:10px 0 0">قمت بإنشاء حساب في ConsultX، لكن ربما لم تجرّب بعد القيمة الحقيقية للمنصة.</p>
        <p style="margin:10px 0 0">تم بناء ConsultX للمهندسين الذين يتعاملون مع متطلبات السلامة والوقاية من الحريق، كود البناء السعودي، مراجع NFPA، مراجعة الامتثال، والتقارير الفنية — وهي أعمال تحتاج وقتًا وتركيزًا وتحققًا متكررًا.</p>
        <p style="margin:12px 0 0;color:#e8f4fb">لفترة إطلاق محدودة، يمكنك تفعيل أول شهر من <strong style="color:#e8f4fb">ConsultX Pro مقابل ${CAMPAIGN_FIRST_CHARGE_SAR} ريال فقط</strong>.</p>
        <p style="margin:14px 0 0;font-weight:600;color:#e8f4fb">مع ConsultX Pro يمكنك:</p>
        <ul style="margin:6px 22px 0 0;padding:0;list-style-position:inside;color:#cdd9e4">
          <li>مراجعة متطلبات السلامة والحماية من الحريق بسرعة أكبر.</li>
          <li>طرح أسئلة أعمق في وضع Advisory.</li>
          <li>تحليل المخططات وملاحظات الامتثال في وضع Analytical.</li>
          <li>الحصول على إجابات هندسية أوضح ومدعومة بالمصادر.</li>
          <li>توفير الوقت قبل إعداد التقارير أو الردود الفنية أو مراجعات العملاء.</li>
        </ul>
        <div style="margin-top:18px;text-align:center">
          <a href="${cta}" style="display:inline-block;padding:12px 28px;border-radius:8px;background:#00D4FF;color:#06090e;font-size:14px;font-weight:700;text-decoration:none">فعّل بـ ${CAMPAIGN_FIRST_CHARGE_SAR} ريال</a>
        </div>
        <p style="margin:10px 0 0;color:#7c8a99;font-size:12px;text-align:center">بدون التزام طويل. يمكنك الإلغاء في أي وقت.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 32px 26px;background:rgba(0,212,255,0.04);border-top:1px solid rgba(0,212,255,0.10)" dir="ltr">
        <p style="margin:0;color:#7c8a99;font-size:12px;text-align:center">You are receiving this email at <span style="color:#a4b3c1">${safeRecipient}</span> because you created a ConsultX account.</p>
        <p style="margin:8px 0 0;color:#7c8a99;font-size:12px;text-align:center">If you do not want to receive product updates, reply with "unsubscribe" or email <a href="mailto:info@consultx.app" style="color:#7c8a99">info@consultx.app</a>.</p>
        <p style="margin:14px 0 0;color:#536273;font-size:11px;text-align:center">ConsultX · <a href="mailto:info@consultx.app" style="color:#536273;text-decoration:none">info@consultx.app</a></p>
      </td>
    </tr>
  </table>
</center>
</body>
</html>`;
}

function buildText(recipient: string): string {
  const cta = ctaUrl();
  return [
    "ConsultX — Founding Engineers Offer",
    "",
    "Hi Engineer,",
    "",
    "You created a ConsultX account, but you may not have seen what the platform can really do yet.",
    "",
    "ConsultX is built for engineers who deal with fire safety, Saudi Building Code, NFPA references,",
    "compliance reviews, and technical reports — the work that usually takes time, focus, and repeated checking.",
    "",
    `For a limited launch period, you can activate your first month of ConsultX Pro for only ${CAMPAIGN_FIRST_CHARGE_SAR} SAR.`,
    "",
    "Use ConsultX Pro to:",
    "  - Review fire and life safety requirements faster.",
    "  - Ask deeper SBC / NFPA questions in Advisory Mode.",
    "  - Analyze drawings and compliance notes in Analytical Mode.",
    "  - Generate clearer engineering reasoning with source-based answers.",
    "  - Save time before preparing reports, reviews, or client responses.",
    "",
    `Activate your first month for ${CAMPAIGN_FIRST_CHARGE_SAR} SAR:`,
    cta,
    "",
    "No long-term commitment. You can cancel anytime.",
    "",
    "------------------------------------------------------------",
    "",
    "مرحبًا مهندسنا العزيز،",
    "",
    "قمت بإنشاء حساب في ConsultX، لكن ربما لم تجرّب بعد القيمة الحقيقية للمنصة.",
    "",
    `لفترة إطلاق محدودة، يمكنك تفعيل أول شهر من ConsultX Pro مقابل ${CAMPAIGN_FIRST_CHARGE_SAR} ريال فقط.`,
    "",
    `فعّل أول شهر مقابل ${CAMPAIGN_FIRST_CHARGE_SAR} ريال:`,
    cta,
    "",
    "بدون التزام طويل. يمكنك الإلغاء في أي وقت.",
    "",
    "------------------------------------------------------------",
    `You are receiving this email at ${recipient} because you created a ConsultX account.`,
    "If you don't want product updates, email info@consultx.app to opt out.",
    "ConsultX · info@consultx.app",
  ].join("\n");
}

interface EligibleEntry {
  user_id: string;
  email: string;
  reason: "eligible";
}

interface IneligibleEntry {
  user_id: string;
  email: string;
  reason: "paid_active" | "admin" | "no_email" | "already_sent" | "trialing_active" | "anonymous";
}

interface SurveyResult {
  totalUsers: number;
  eligible: EligibleEntry[];
  skipped: IneligibleEntry[];
}

/**
 * Walk auth.users in pages, classifying each user. The page size is
 * capped by Supabase to 1000 — we paginate when total > 1000.
 */
async function surveyUsers(
  // deno-lint-ignore no-explicit-any
  admin: any,
): Promise<SurveyResult> {
  const eligible: EligibleEntry[] = [];
  const skipped: IneligibleEntry[] = [];
  let page = 1;
  const perPage = 1000;
  let totalUsers = 0;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);

    const users = data?.users ?? [];
    if (users.length === 0) break;
    totalUsers += users.length;

    const ids = users.map((u: any) => u.id);
    const { data: subs, error: subErr } = await admin
      .from("user_subscriptions")
      .select("user_id, status")
      .in("user_id", ids);
    if (subErr) throw new Error(`user_subscriptions query failed: ${subErr.message}`);

    const subByUser = new Map<string, string[]>();
    for (const row of subs ?? []) {
      const arr = subByUser.get(row.user_id) ?? [];
      arr.push(row.status);
      subByUser.set(row.user_id, arr);
    }

    for (const u of users) {
      const email = (u.email ?? "").trim().toLowerCase();
      const userId = u.id;
      const statuses = subByUser.get(userId) ?? [];

      if (!email) {
        skipped.push({ user_id: userId, email: "", reason: "no_email" });
        continue;
      }
      if (ADMIN_EMAILS.includes(email)) {
        skipped.push({ user_id: userId, email, reason: "admin" });
        continue;
      }
      if (statuses.includes("active") || statuses.includes("past_due")) {
        skipped.push({ user_id: userId, email, reason: "paid_active" });
        continue;
      }
      const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.founding10_sent_at === "string" && meta.founding10_sent_at.length > 0) {
        skipped.push({ user_id: userId, email, reason: "already_sent" });
        continue;
      }
      // Treat trialing subscriptions as eligible — the campaign is meant to
      // pull non-paying users (trialing without a card on file is still
      // non-paying).
      eligible.push({ user_id: userId, email, reason: "eligible" });
    }

    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break; // hard guard: 50k users
  }

  return { totalUsers, eligible, skipped };
}

async function markSent(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  status: "sent" | "failed",
  providerId: string | null,
  error: string | null,
): Promise<void> {
  try {
    const stampKey = status === "sent" ? "founding10_sent_at" : "founding10_failed_at";
    const update: Record<string, unknown> = {
      [stampKey]: new Date().toISOString(),
      founding10_status: status,
    };
    if (providerId) update.founding10_provider_id = providerId;
    if (error) update.founding10_error = error.slice(0, 240);
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    const prevMeta = (existing?.user?.app_metadata ?? {}) as Record<string, unknown>;
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...prevMeta, ...update },
    });
  } catch (err) {
    console.error(
      "markSent failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function sendOne(
  resendApiKey: string,
  fromEmail: string,
  email: string,
): Promise<{ ok: boolean; id: string | null; error: string | null }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: SUBJECT,
        html: buildHtml(email),
        text: buildText(email),
        // Sending one message at a time so a single failure does not
        // poison the whole batch.
        tags: [
          { name: "campaign", value: "founding10" },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, id: null, error: body.slice(0, 240) };
    }
    const json = await response.json().catch(() => ({}));
    return { ok: true, id: typeof json?.id === "string" ? json.id : null, error: null };
  } catch (err) {
    return {
      ok: false,
      id: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Verify caller is admin ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (
      userError ||
      !user ||
      !user.email ||
      !ADMIN_EMAILS.includes(user.email.toLowerCase())
    ) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const mode = typeof body?.mode === "string" ? body.mode : "preview";
    const dryRun = body?.dryRun === true;
    const rawLimit = Number(body?.limit);
    const allowResend = body?.allowResend === true;

    // ── Always start with a survey ────────────────────────────────────────────
    const survey = await surveyUsers(admin);

    if (mode === "preview") {
      return new Response(
        JSON.stringify({
          mode: "preview",
          campaign_code: CAMPAIGN_CODE,
          subject: SUBJECT,
          totals: {
            total_users: survey.totalUsers,
            eligible: survey.eligible.length,
            skipped: survey.skipped.length,
            skipped_breakdown: tally(survey.skipped.map((s) => s.reason)),
          },
          eligible_sample: survey.eligible.slice(0, 10).map((e) => e.email),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "export") {
      const lines = [
        "email,user_id",
        ...survey.eligible.map((e) => `${e.email},${e.user_id}`),
      ];
      return new Response(lines.join("\n"), {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="founding10-eligible.csv"`,
        },
      });
    }

    if (mode === "send") {
      const limit = Math.min(
        HARD_SEND_CAP,
        Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_PREVIEW_LIMIT,
      );
      const targets = (
        allowResend
          ? [
              ...survey.eligible,
              ...survey.skipped.filter((s) => s.reason === "already_sent").map((s) => ({
                user_id: s.user_id,
                email: s.email,
                reason: "eligible" as const,
              })),
            ]
          : survey.eligible
      ).slice(0, limit);

      if (dryRun) {
        return new Response(
          JSON.stringify({
            mode: "send",
            dry_run: true,
            campaign_code: CAMPAIGN_CODE,
            subject: SUBJECT,
            would_send: targets.length,
            eligible_total: survey.eligible.length,
            skipped_total: survey.skipped.length,
            limit,
            sample: targets.slice(0, 10).map((t) => t.email),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        return new Response(
          JSON.stringify({
            error: "Email provider not configured",
            blocker: "RESEND_API_KEY",
            campaign_code: CAMPAIGN_CODE,
          }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ConsultX <info@consultx.app>";

      let sent = 0;
      let failed = 0;
      const failures: Array<{ email: string; error: string }> = [];

      for (const t of targets) {
        const r = await sendOne(resendApiKey, fromEmail, t.email);
        if (r.ok) {
          sent += 1;
          await markSent(admin, t.user_id, "sent", r.id, null);
        } else {
          failed += 1;
          failures.push({ email: t.email, error: r.error ?? "unknown_error" });
          await markSent(admin, t.user_id, "failed", null, r.error ?? "unknown_error");
        }
        // Gentle pacing — 120ms between calls = ~8 req/s, well under Resend's
        // 100 req/s limit and friendly to mailbox providers.
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      return new Response(
        JSON.stringify({
          mode: "send",
          dry_run: false,
          campaign_code: CAMPAIGN_CODE,
          subject: SUBJECT,
          sent,
          failed,
          attempted: targets.length,
          eligible_total: survey.eligible.length,
          skipped_total: survey.skipped.length,
          failures: failures.slice(0, 20),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown mode: ${String(mode)}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-founding10-campaign error:", err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
