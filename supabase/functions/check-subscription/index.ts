import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Campaign constants (must match launch-trial-activate)
const LAUNCH_DATE  = new Date("2026-03-28T00:00:00.000Z");
const CAMPAIGN_END = new Date("2026-04-28T00:00:00.000Z");
const TRIAL_DAYS   = 3;

const LAUNCH_TRIAL_LIMITS: Record<string, number> = {
  primary:  50,
  standard:  2,
  analysis:  1,
};

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon   = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    // Admin bypass
    const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];
    if (user.email && ADMIN_EMAILS.includes(user.email)) {
      return new Response(
        JSON.stringify({
          active: true, status: "active", trial_days_remaining: 0,
          plan: { id: "enterprise", name_ar: "مؤسسة", name_en: "Enterprise", price_amount: 34900, currency: "SAR" },
          expires_at: null, card_brand: null, card_last_four: null,
          daily_messages_used: 0, daily_messages_limit: 9999,
          launch_trial_status: "paid", launch_trial_active: false,
          launch_trial_days_remaining: 0, launch_trial_end: null,
          mode_limits: null, mode_usage_today: { primary: 0, standard: 0, analysis: 0 },
          show_welcome_banner: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId      = user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const now         = new Date();

    // ── Parallel fetches ────────────────────────────────────────────────────────
    const [subResult, dailyUsageResult, profileResult, modeUsageResult] = await Promise.all([
      adminClient
        .from("user_subscriptions")
        .select("*, subscription_plans(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminClient.rpc("get_daily_usage", { p_user_id: userId }),
      adminClient
        .from("profiles")
        .select("launch_trial_status, launch_trial_start, launch_trial_end, launch_trial_welcomed, created_at")
        .eq("user_id", userId)
        .maybeSingle(),
      // Fetch today's mode-specific usage in one query
      adminClient
        .from("mode_daily_usage")
        .select("mode, count")
        .eq("user_id", userId)
        .eq("usage_date", new Date().toISOString().split("T")[0]),
    ]);

    const subscription    = subResult.data;
    const messagesUsed    = dailyUsageResult.data ?? 0;
    const profile         = profileResult.data;
    const modeUsageRows   = modeUsageResult.data ?? [];

    // Build mode usage map
    const modeUsageToday: Record<string, number> = { primary: 0, standard: 0, analysis: 0 };
    for (const row of modeUsageRows) {
      if (row.mode in modeUsageToday) modeUsageToday[row.mode] = row.count;
    }

    // ── Paid subscription check ─────────────────────────────────────────────────
    let active            = false;
    let trialDaysRemaining = 0;
    let expiresAt: string | null = null;
    let dailyLimit        = 10;

    if (subscription) {
      if (subscription.status === "trialing" && subscription.trial_end) {
        const trialEnd = new Date(subscription.trial_end);
        if (now < trialEnd) {
          active             = true;
          trialDaysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          expiresAt          = subscription.trial_end;
          dailyLimit         = 20;
        } else {
          await adminClient.from("user_subscriptions").update({ status: "expired" }).eq("id", subscription.id);
          subscription.status = "expired";
          dailyLimit          = 10;
        }
      } else if (subscription.status === "active" && subscription.current_period_end) {
        const periodEnd = new Date(subscription.current_period_end);
        if (now < periodEnd) {
          active    = true;
          expiresAt = subscription.current_period_end;
          dailyLimit = 9999;
        } else {
          await adminClient.from("user_subscriptions").update({ status: "expired" }).eq("id", subscription.id);
          subscription.status = "expired";
          dailyLimit          = 10;
        }
      } else if (subscription.status === "expired" || subscription.status === "cancelled") {
        dailyLimit = 10;
      }
    }

    const plan = subscription?.subscription_plans as any;

    // ── Launch trial logic ───────────────────────────────────────────────────────
    // If user already has an active paid subscription, mark as paid and skip trial
    const isPaidActive = active && subscription?.status === "active";

    let launchTrialStatus      = profile?.launch_trial_status ?? null;
    let launchTrialActive      = false;
    let launchTrialDaysLeft    = 0;
    let launchTrialEnd: string | null = null;
    let showWelcomeBanner      = false;
    let effectiveModeLimit: Record<string, number> | null = null;

    if (isPaidActive) {
      // Mark paid if not already
      if (launchTrialStatus !== "paid") {
        await adminClient.from("profiles").update({ launch_trial_status: "paid" }).eq("user_id", userId);
        launchTrialStatus = "paid";
      }
    } else {
      // Check and potentially auto-init trial for users who haven't hit the activate endpoint yet
      const userCreatedAt = new Date(user.created_at ?? profile?.created_at ?? now.toISOString());
      const isNewUser     = userCreatedAt >= LAUNCH_DATE;
      const withinWindow  = now < CAMPAIGN_END;

      if (!launchTrialStatus && withinWindow) {
        // Auto-initialize
        if (isNewUser) {
          const trialStart = userCreatedAt;
          const trialEnd   = addDays(userCreatedAt, TRIAL_DAYS);
          launchTrialStatus = "eligible_new";
          await adminClient.from("profiles").update({
            launch_trial_status:   "eligible_new",
            launch_trial_start:    trialStart.toISOString(),
            launch_trial_end:      trialEnd.toISOString(),
            launch_trial_welcomed: false,
          }).eq("user_id", userId);
          profile && (profile.launch_trial_end = trialEnd.toISOString());
        } else {
          launchTrialStatus = "eligible_existing_pending";
          await adminClient.from("profiles").update({
            launch_trial_status: "eligible_existing_pending",
          }).eq("user_id", userId);
        }
      } else if (!launchTrialStatus && !withinWindow) {
        launchTrialStatus = "ineligible_window_closed";
        await adminClient.from("profiles").update({
          launch_trial_status: "ineligible_window_closed",
        }).eq("user_id", userId);
      }

      // Evaluate active trial
      if (
        launchTrialStatus === "eligible_new" ||
        launchTrialStatus === "eligible_existing_active"
      ) {
        const trialEndDate = profile?.launch_trial_end ? new Date(profile.launch_trial_end) : null;
        if (trialEndDate && now < trialEndDate) {
          launchTrialActive   = true;
          launchTrialEnd      = profile!.launch_trial_end;
          launchTrialDaysLeft = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          effectiveModeLimit  = LAUNCH_TRIAL_LIMITS;
          showWelcomeBanner   =
            launchTrialStatus === "eligible_existing_active" && !profile?.launch_trial_welcomed;
        } else if (trialEndDate && now >= trialEndDate) {
          // Expired — update
          await adminClient.from("profiles").update({ launch_trial_status: "expired" }).eq("user_id", userId);
          launchTrialStatus = "expired";
        }
      }
    }

    return new Response(
      JSON.stringify({
        // Paid subscription fields (unchanged interface)
        active,
        status:                subscription?.status ?? "none",
        trial_days_remaining:  trialDaysRemaining,
        plan:                  plan ? { id: plan.id, name_ar: plan.name_ar, name_en: plan.name_en, price_amount: plan.price_amount, currency: plan.currency } : null,
        expires_at:            expiresAt,
        card_brand:            subscription?.card_brand ?? null,
        card_last_four:        subscription?.card_last_four ?? null,
        daily_messages_used:   messagesUsed,
        daily_messages_limit:  dailyLimit,

        // Launch trial fields
        launch_trial_status:         launchTrialStatus,
        launch_trial_active:         launchTrialActive,
        launch_trial_days_remaining: launchTrialDaysLeft,
        launch_trial_end:            launchTrialEnd,
        mode_limits:                 effectiveModeLimit,
        mode_usage_today:            modeUsageToday,
        show_welcome_banner:         showWelcomeBanner,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("check-subscription error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
