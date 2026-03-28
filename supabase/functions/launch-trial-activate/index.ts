import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Campaign constants ────────────────────────────────────────────────────────
const LAUNCH_DATE    = new Date("2026-03-28T00:00:00.000Z"); // campaign start
const CAMPAIGN_END   = new Date("2026-04-28T00:00:00.000Z"); // 1-month window
const TRIAL_DAYS     = 3;

// Mode limits during the launch trial
export const LAUNCH_TRIAL_LIMITS: Record<string, number> = {
  primary:  50,
  standard:  2,
  analysis:  1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon   = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate caller
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const now          = new Date();
    const userId       = user.id;

    // ── 1. Check for active paid subscription ─────────────────────────────────
    const { data: activeSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status, current_period_end")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("current_period_end", now.toISOString())
      .limit(1)
      .maybeSingle();

    if (activeSub) {
      // Mark as paid in profiles (ensure status is correct)
      await adminClient
        .from("profiles")
        .update({ launch_trial_status: "paid" })
        .eq("user_id", userId);

      return new Response(
        JSON.stringify({
          status: "paid",
          trial_active: false,
          trial_start: null,
          trial_end: null,
          days_remaining: 0,
          mode_limits: null,
          show_welcome_banner: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Load current profile ────────────────────────────────────────────────
    const { data: profile } = await adminClient
      .from("profiles")
      .select("launch_trial_status, launch_trial_start, launch_trial_end, launch_trial_welcomed, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    const currentStatus      = profile?.launch_trial_status ?? null;
    const userCreatedAt      = new Date(user.created_at ?? profile?.created_at ?? now.toISOString());
    const isNewUser          = userCreatedAt >= LAUNCH_DATE;        // created after campaign start
    const withinWindow       = now < CAMPAIGN_END;

    // ── 3. Branch on current status ────────────────────────────────────────────

    // 3a. Already expired → no changes, return expired
    if (currentStatus === "expired") {
      return new Response(
        JSON.stringify({
          status: "expired",
          trial_active: false,
          trial_start: profile?.launch_trial_start ?? null,
          trial_end:   profile?.launch_trial_end   ?? null,
          days_remaining: 0,
          mode_limits: null,
          show_welcome_banner: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3b. Campaign window closed and user was still pending → mark ineligible
    if (currentStatus === "eligible_existing_pending" && !withinWindow) {
      await adminClient
        .from("profiles")
        .update({ launch_trial_status: "ineligible_window_closed" })
        .eq("user_id", userId);

      return new Response(
        JSON.stringify({
          status: "ineligible_window_closed",
          trial_active: false,
          trial_start: null,
          trial_end:   null,
          days_remaining: 0,
          mode_limits: null,
          show_welcome_banner: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3c. Already ineligible → return
    if (currentStatus === "ineligible_window_closed") {
      return new Response(
        JSON.stringify({
          status: "ineligible_window_closed",
          trial_active: false,
          trial_start: null,
          trial_end:   null,
          days_remaining: 0,
          mode_limits: null,
          show_welcome_banner: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3d. Active trial (new or existing activated) — check if expired
    if (
      currentStatus === "eligible_new" ||
      currentStatus === "eligible_existing_active"
    ) {
      const trialEnd = profile?.launch_trial_end ? new Date(profile.launch_trial_end) : null;

      if (trialEnd && now >= trialEnd) {
        // Trial has expired — mark it
        await adminClient
          .from("profiles")
          .update({ launch_trial_status: "expired" })
          .eq("user_id", userId);

        return new Response(
          JSON.stringify({
            status: "expired",
            trial_active: false,
            trial_start: profile?.launch_trial_start,
            trial_end:   profile?.launch_trial_end,
            days_remaining: 0,
            mode_limits: null,
            show_welcome_banner: false,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Trial is still running
      const msRemaining   = trialEnd ? trialEnd.getTime() - now.getTime() : 0;
      const daysRemaining = trialEnd ? Math.ceil(msRemaining / (1000 * 60 * 60 * 24)) : 0;
      const showWelcome   = currentStatus === "eligible_existing_active" && !profile?.launch_trial_welcomed;

      return new Response(
        JSON.stringify({
          status: currentStatus,
          trial_active: true,
          trial_start: profile?.launch_trial_start,
          trial_end:   profile?.launch_trial_end,
          days_remaining: daysRemaining,
          mode_limits: LAUNCH_TRIAL_LIMITS,
          show_welcome_banner: showWelcome,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3e. First time: status is null or needs initialization
    if (!currentStatus) {
      if (withinWindow) {
        let newStatus: string;
        let trialStart: Date;
        let trialEnd: Date;

        if (isNewUser) {
          // New user: trial starts from account creation
          newStatus  = "eligible_new";
          trialStart = userCreatedAt;
          trialEnd   = addDays(userCreatedAt, TRIAL_DAYS);
        } else {
          // Existing user: trial starts from this first interaction
          newStatus  = "eligible_existing_active";
          trialStart = now;
          trialEnd   = addDays(now, TRIAL_DAYS);
        }

        await adminClient
          .from("profiles")
          .update({
            launch_trial_status:    newStatus,
            launch_trial_start:     trialStart.toISOString(),
            launch_trial_end:       trialEnd.toISOString(),
            launch_trial_welcomed:  false,
          })
          .eq("user_id", userId);

        const msRemaining   = trialEnd.getTime() - now.getTime();
        const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
        const showWelcome   = !isNewUser; // existing users get the welcome banner

        return new Response(
          JSON.stringify({
            status:              newStatus,
            trial_active:        true,
            trial_start:         trialStart.toISOString(),
            trial_end:           trialEnd.toISOString(),
            days_remaining:      daysRemaining,
            mode_limits:         LAUNCH_TRIAL_LIMITS,
            show_welcome_banner: showWelcome,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Campaign window over, first time hitting endpoint
        await adminClient
          .from("profiles")
          .update({ launch_trial_status: "ineligible_window_closed" })
          .eq("user_id", userId);

        return new Response(
          JSON.stringify({
            status: "ineligible_window_closed",
            trial_active: false,
            trial_start: null,
            trial_end:   null,
            days_remaining: 0,
            mode_limits: null,
            show_welcome_banner: false,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 3f. pending status — activate on first real interaction
    if (currentStatus === "eligible_existing_pending") {
      if (withinWindow) {
        const trialStart = now;
        const trialEnd   = addDays(now, TRIAL_DAYS);

        await adminClient
          .from("profiles")
          .update({
            launch_trial_status:    "eligible_existing_active",
            launch_trial_start:     trialStart.toISOString(),
            launch_trial_end:       trialEnd.toISOString(),
            launch_trial_welcomed:  false,
          })
          .eq("user_id", userId);

        const daysRemaining = TRIAL_DAYS; // just activated

        return new Response(
          JSON.stringify({
            status:              "eligible_existing_active",
            trial_active:        true,
            trial_start:         trialStart.toISOString(),
            trial_end:           trialEnd.toISOString(),
            days_remaining:      daysRemaining,
            mode_limits:         LAUNCH_TRIAL_LIMITS,
            show_welcome_banner: true, // show welcome for existing users
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        await adminClient
          .from("profiles")
          .update({ launch_trial_status: "ineligible_window_closed" })
          .eq("user_id", userId);

        return new Response(
          JSON.stringify({
            status: "ineligible_window_closed",
            trial_active: false,
            trial_start: null,
            trial_end:   null,
            days_remaining: 0,
            mode_limits: null,
            show_welcome_banner: false,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fallback
    return new Response(
      JSON.stringify({ status: "unknown", trial_active: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("launch-trial-activate error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
