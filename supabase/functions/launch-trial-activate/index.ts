import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LAUNCH_DATE  = new Date("2026-03-28T00:00:00.000Z");
const CAMPAIGN_END = new Date("2026-04-28T00:00:00.000Z");
const TRIAL_DAYS   = 3;
const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
function daysUntil(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
}
function hoursUntil(end: Date, now: Date): number {
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 3_600_000));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon   = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Admin bypass
    if (user.email && ADMIN_EMAILS.includes(user.email)) {
      return new Response(JSON.stringify({
        access_state: "paid_active",
        is_paid: true,
        trial_active: false,
        trial_started_at: null,
        trial_ends_at: null,
        days_remaining: 0,
        hours_remaining: 0,
        show_welcome_banner: false,
        recommended_plan: "pro",
        upgrade_context: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const userId      = user.id;
    const now         = new Date();

    // ── 1. Check for active paid subscription ───────────────────────────────
    const { data: sub } = await adminClient
      .from("user_subscriptions")
      .select("status, current_period_end, trial_end")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isPaidActive =
      (sub?.status === "active" && sub.current_period_end && now < new Date(sub.current_period_end)) ||
      (sub?.status === "trialing" && sub.trial_end && now < new Date(sub.trial_end));

    if (isPaidActive) {
      // Ensure paid marker in profile
      await adminClient.from("profiles")
        .update({ launch_trial_status: "paid" })
        .eq("user_id", userId);

      return new Response(JSON.stringify({
        access_state: "paid_active",
        is_paid: true,
        trial_active: false,
        trial_started_at: null,
        trial_ends_at: null,
        days_remaining: 0,
        hours_remaining: 0,
        show_welcome_banner: false,
        recommended_plan: "pro",
        upgrade_context: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 2. Fetch current profile state ──────────────────────────────────────
    const { data: profile } = await adminClient
      .from("profiles")
      .select("launch_trial_status, launch_trial_start, launch_trial_end, launch_trial_welcomed, launch_trial_consumed, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    let status         = profile?.launch_trial_status ?? null;
    let trialStart     = profile?.launch_trial_start   ? new Date(profile.launch_trial_start)  : null;
    let trialEnd       = profile?.launch_trial_end     ? new Date(profile.launch_trial_end)    : null;
    let showWelcome    = false;
    const withinWindow = now < CAMPAIGN_END;
    const userCreatedAt = new Date(user.created_at ?? profile?.created_at ?? now.toISOString());
    const isNewUser    = userCreatedAt >= LAUNCH_DATE;

    // ── 3. State transitions ─────────────────────────────────────────────────
    if (!status) {
      // First-time initialization
      if (withinWindow) {
        if (isNewUser) {
          // New user: trial starts from account creation
          trialStart = userCreatedAt;
          trialEnd   = addDays(userCreatedAt, TRIAL_DAYS);
          status     = "trial_active";
          await adminClient.from("profiles").update({
            launch_trial_status:   "trial_active",
            launch_trial_start:    trialStart.toISOString(),
            launch_trial_end:      trialEnd.toISOString(),
            launch_trial_consumed: true,
            launch_source:         "new_signup",
          }).eq("user_id", userId);
        } else {
          // Existing user: pending until they interact
          status = "eligible_existing_pending";
          await adminClient.from("profiles").update({
            launch_trial_status: "eligible_existing_pending",
            launch_source:       "existing_user",
          }).eq("user_id", userId);
        }
      } else {
        status = "ineligible";
        await adminClient.from("profiles").update({ launch_trial_status: "ineligible" }).eq("user_id", userId);
      }
    }

    // Activate pending existing user on this call (they just logged in / opened chat)
    if (status === "eligible_existing_pending") {
      if (withinWindow) {
        trialStart  = now;
        trialEnd    = addDays(now, TRIAL_DAYS);
        status      = "trial_active";
        showWelcome = true;
        await adminClient.from("profiles").update({
          launch_trial_status:    "trial_active",
          launch_trial_start:     trialStart.toISOString(),
          launch_trial_end:       trialEnd.toISOString(),
          launch_trial_consumed:  true,
          launch_trial_welcomed:  false, // will be dismissed by user
        }).eq("user_id", userId);
      } else {
        status = "ineligible";
        await adminClient.from("profiles").update({ launch_trial_status: "ineligible" }).eq("user_id", userId);
      }
    }

    // Check if active trial has expired
    if (status === "trial_active" && trialEnd && now >= trialEnd) {
      status = "trial_expired";
      await adminClient.from("profiles").update({ launch_trial_status: "trial_expired" }).eq("user_id", userId);
    }

    // ── 4. Build response ────────────────────────────────────────────────────
    const trialIsActive = status === "trial_active" && trialEnd !== null && now < trialEnd;

    const accessState: string = (() => {
      if (status === "trial_active" && trialIsActive)    return "trial_active";
      if (status === "trial_expired")                    return "trial_expired";
      if (status === "paid")                             return "paid_active";
      if (status === "eligible_existing_pending")        return "eligible_existing_pending";
      return "ineligible";
    })();

    // show_welcome_banner: only for existing users on first activation this session
    // Also check DB welcomed flag — if already dismissed, don't show again
    const dbShowWelcome = showWelcome || (
      trialIsActive &&
      status === "trial_active" &&
      !profile?.launch_trial_welcomed &&
      !isNewUser
    );

    return new Response(JSON.stringify({
      access_state:     accessState,
      is_paid:          false,
      trial_active:     trialIsActive,
      trial_started_at: trialStart?.toISOString() ?? null,
      trial_ends_at:    trialEnd?.toISOString() ?? null,
      days_remaining:   trialIsActive && trialEnd ? daysUntil(trialEnd, now) : 0,
      hours_remaining:  trialIsActive && trialEnd ? hoursUntil(trialEnd, now) : 0,
      show_welcome_banner: dbShowWelcome,
      recommended_plan: "pro",
      upgrade_context:  status === "trial_expired" ? "trial_expired" : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[launch-trial-activate] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
