import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LAUNCH_DATE  = new Date("2026-03-28T00:00:00.000Z");
const CAMPAIGN_END = new Date("2026-04-28T00:00:00.000Z");
const TRIAL_DAYS   = 7;
const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}
function daysUntil(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
}
function hoursUntil(end: Date, now: Date): number {
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 3_600_000));
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
    if (user.email && ADMIN_EMAILS.includes(user.email)) {
      return new Response(
        JSON.stringify({
          active: true, status: "active", trial_days_remaining: 0,
          plan: { id: "enterprise", name_ar: "مؤسسة", name_en: "Enterprise", price_amount: 34900, currency: "SAR" },
          expires_at: null, card_brand: null, card_last_four: null,
          daily_messages_used: 0, daily_messages_limit: 9999,
          // Launch trial fields
          access_state: "paid_active",
          launch_trial_status: "paid",
          launch_trial_active: false,
          launch_trial_days_remaining: 0,
          launch_trial_hours_remaining: 0,
          launch_trial_end: null,
          show_welcome_banner: false,
          upgrade_context: null,
          recommended_plan: "pro",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId      = user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const now         = new Date();

    // ── Parallel fetches ────────────────────────────────────────────────────
    const [subResult, dailyUsageResult, profileResult] = await Promise.all([
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
        .select("launch_trial_status, launch_trial_start, launch_trial_end, launch_trial_welcomed, launch_trial_consumed, created_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const subscription = subResult.data;
    const messagesUsed = dailyUsageResult.data ?? 0;
    const profile      = profileResult.data;

    // ── Paid subscription check ─────────────────────────────────────────────
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
    const isPaidActive = active && subscription?.status === "active";

    // ── Launch trial state ──────────────────────────────────────────────────
    let launchTrialStatus   = profile?.launch_trial_status ?? null;
    let launchTrialActive   = false;
    let launchTrialDaysLeft = 0;
    let launchTrialHoursLeft = 0;
    let launchTrialEnd: string | null = null;
    let showWelcomeBanner   = false;

    if (isPaidActive) {
      if (launchTrialStatus !== "paid") {
        await adminClient.from("profiles").update({ launch_trial_status: "paid" }).eq("user_id", userId);
        launchTrialStatus = "paid";
      }
    } else {
      const userCreatedAt = new Date(user.created_at ?? profile?.created_at ?? now.toISOString());
      const isNewUser     = userCreatedAt >= LAUNCH_DATE;
      const withinWindow  = now < CAMPAIGN_END;

      // Auto-initialize if no status yet
      if (!launchTrialStatus) {
        if (withinWindow) {
          if (isNewUser) {
            const tStart = userCreatedAt;
            const tEnd   = addDays(userCreatedAt, TRIAL_DAYS);
            launchTrialStatus = "trial_active";
            await adminClient.from("profiles").update({
              launch_trial_status:   "trial_active",
              launch_trial_start:    tStart.toISOString(),
              launch_trial_end:      tEnd.toISOString(),
              launch_trial_consumed: true,
              launch_source:         "new_signup",
            }).eq("user_id", userId);
            // update local ref
            if (profile) {
              profile.launch_trial_end = tEnd.toISOString();
              profile.launch_trial_welcomed = false;
            }
          } else {
            launchTrialStatus = "eligible_existing_pending";
            await adminClient.from("profiles").update({
              launch_trial_status: "eligible_existing_pending",
              launch_source:       "existing_user",
            }).eq("user_id", userId);
          }
        } else {
          launchTrialStatus = "ineligible";
          await adminClient.from("profiles").update({ launch_trial_status: "ineligible" }).eq("user_id", userId);
        }
      }

      // Evaluate active trial
      if (launchTrialStatus === "trial_active") {
        const trialEndDate = profile?.launch_trial_end ? new Date(profile.launch_trial_end) : null;
        if (trialEndDate && now < trialEndDate) {
          launchTrialActive    = true;
          launchTrialEnd       = profile!.launch_trial_end;
          launchTrialDaysLeft  = daysUntil(trialEndDate, now);
          launchTrialHoursLeft = hoursUntil(trialEndDate, now);
          // Show welcome banner for existing users who haven't dismissed it yet
          showWelcomeBanner    = !isNewUser && !profile?.launch_trial_welcomed;
        } else if (trialEndDate && now >= trialEndDate) {
          await adminClient.from("profiles").update({ launch_trial_status: "trial_expired" }).eq("user_id", userId);
          launchTrialStatus = "trial_expired";
        }
      }
    }

    // ── Access state ────────────────────────────────────────────────────────
    // NOTE: launchTrialStatus === "paid" is intentionally NOT mapped to "paid_active" here.
    // isPaidActive (first branch) already covers all legitimate paid users.
    // A cancelled/expired subscription sets isPaidActive = false — these users must NOT
    // retain paid_active access just because their profile still shows launch_trial_status = "paid".
    const accessState: string = (() => {
      if (isPaidActive)                            return "paid_active";
      if (launchTrialActive)                       return "trial_active";
      if (launchTrialStatus === "trial_expired")   return "trial_expired";
      if (launchTrialStatus === "eligible_existing_pending") return "eligible_existing_pending";
      return "ineligible";
    })();

    const upgradeContext = launchTrialStatus === "trial_expired" ? "trial_expired" : null;

    return new Response(
      JSON.stringify({
        // Standard paid subscription fields (unchanged interface)
        active,
        status:               subscription?.status ?? "none",
        trial_days_remaining: trialDaysRemaining,
        plan:                 plan ? { id: plan.id, name_ar: plan.name_ar, name_en: plan.name_en, price_amount: plan.price_amount, currency: plan.currency } : null,
        expires_at:           expiresAt,
        card_brand:           subscription?.card_brand ?? null,
        card_last_four:       subscription?.card_last_four ?? null,
        daily_messages_used:  messagesUsed,
        daily_messages_limit: dailyLimit,

        // Launch trial fields (new unified access object)
        access_state:                accessState,
        launch_trial_status:         launchTrialStatus,
        launch_trial_active:         launchTrialActive,
        launch_trial_days_remaining: launchTrialDaysLeft,
        launch_trial_hours_remaining: launchTrialHoursLeft,
        launch_trial_end:            launchTrialEnd,
        show_welcome_banner:         showWelcomeBanner,
        upgrade_context:             upgradeContext,
        recommended_plan:            "pro",
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
