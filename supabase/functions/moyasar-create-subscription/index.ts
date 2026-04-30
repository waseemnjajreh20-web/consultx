import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================
// moyasar-create-subscription
//
// Called by Subscribe.tsx BEFORE the Moyasar payment form is
// rendered. Creates the subscription record and returns a
// given_id (UUID) and subscription_id so the frontend can
// initialize the Moyasar form with correct metadata.
//
// Does NOT call Moyasar API — the frontend Moyasar.js form
// handles payment initiation using the publishable key.
//
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY,
//                   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = user.id;
    const body = await req.json();
    const plan_id = body?.plan_id;
    const requestedSeatCount = body?.seat_count;
    if (!plan_id) {
      return new Response(JSON.stringify({ error: "plan_id is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Plan lookup ───────────────────────────────────────────────────────────
    const { data: plan, error: planError } = await adminClient
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // ── Seat count resolution ────────────────────────────────────────────────
    // Per-seat plans (price_per_seat IS NOT NULL) require seat_count >= min_seats.
    // Flat plans (engineer / pro / legacy enterprise) default to seat_count=1.
    const SEAT_CAP = 100;
    const isPerSeatPlan = plan.price_per_seat != null;
    const minSeats = Math.max(1, plan.min_seats ?? 1);
    let seatCount = 1;
    if (isPerSeatPlan) {
      const raw = Number(requestedSeatCount);
      if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
        return new Response(
          JSON.stringify({ error: "seat_count is required for this plan and must be an integer" }),
          { status: 400, headers: corsHeaders },
        );
      }
      if (raw < minSeats) {
        return new Response(
          JSON.stringify({ error: `seat_count must be at least ${minSeats} for plan ${plan.slug}` }),
          { status: 400, headers: corsHeaders },
        );
      }
      if (raw > SEAT_CAP) {
        return new Response(
          JSON.stringify({ error: `seat_count exceeds the maximum of ${SEAT_CAP}; contact sales for larger orders` }),
          { status: 400, headers: corsHeaders },
        );
      }
      seatCount = raw;
    }
    const monthlyTotal = isPerSeatPlan
      ? (plan.price_per_seat as number) * seatCount
      : (plan.price_amount as number);

    // ── Block double-active subscriptions ────────────────────────────────────
    const { data: activeSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (activeSub) {
      return new Response(
        JSON.stringify({ error: "Active paid subscription already exists" }),
        { status: 409, headers: corsHeaders },
      );
    }

    // ── In-flight check: reuse existing pending_activation rows ──────────────
    // Rather than blocking the user with a 30-min TTL, refresh the given_id on
    // the existing row so a clean Moyasar form can be mounted immediately.
    const { data: existingPendingSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status, trial_end, created_at")
      .eq("user_id", userId)
      .in("status", ["trialing", "pending_activation"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPendingSub?.status === "pending_activation") {
      const freshGivenId = crypto.randomUUID();
      const { data: refreshedSub, error: refreshError } = await adminClient
        .from("user_subscriptions")
        .update({ plan_id, moyasar_given_id: freshGivenId, seat_count: seatCount })
        .eq("id", existingPendingSub.id)
        .select()
        .single();
      if (refreshError || !refreshedSub) {
        return new Response(JSON.stringify({ error: "Failed to refresh payment session" }), {
          status: 500, headers: corsHeaders,
        });
      }
      return new Response(
        JSON.stringify({
          success: true,
          subscription_id: refreshedSub.id,
          given_id: freshGivenId,
          is_returning_user: true,
          amount: 100,
          currency: "SAR",
          description: `Card verification for ${plan.name_en}`,
          seat_count: seatCount,
          monthly_total: monthlyTotal,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const trialingSub = existingPendingSub?.status === "trialing" ? existingPendingSub : null;

    // ── Prior subscription history ────────────────────────────────────────────
    const { data: anyPriorSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status, trial_end")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasPriorExpiredSub =
      anyPriorSub &&
      (anyPriorSub.status === "expired" ||
        anyPriorSub.status === "cancelled" ||
        anyPriorSub.status === "pending_activation");

    const { data: profile } = await adminClient
      .from("profiles")
      .select("launch_trial_status")
      .eq("user_id", userId)
      .maybeSingle();

    const isLaunchTrialConsumed =
      profile?.launch_trial_status === "trial_expired" ||
      profile?.launch_trial_status === "paid";

    // ── Idempotency key for Moyasar payment form ──────────────────────────────
    const givenId = crypto.randomUUID();

    const now = new Date();
    const trialEnd7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let subscription: any;
    let subError: any;

    if (trialingSub) {
      // Case 2: user has an active trial — update plan, preserve trial dates
      const result = await adminClient
        .from("user_subscriptions")
        .update({
          plan_id,
          moyasar_given_id: givenId,
          seat_count: seatCount,
        })
        .eq("id", trialingSub.id)
        .select()
        .single();
      subscription = result.data;
      subError = result.error;
    } else if (hasPriorExpiredSub || isLaunchTrialConsumed) {
      // Case 3: no-trial user — pending_activation (immediate on webhook paid event)
      const result = await adminClient
        .from("user_subscriptions")
        .insert({
          user_id: userId,
          plan_id,
          status: "pending_activation",
          trial_start: null,
          trial_end: null,
          moyasar_given_id: givenId,
          seat_count: seatCount,
        })
        .select()
        .single();
      subscription = result.data;
      subError = result.error;
    } else {
      // Case 1: new user eligible for 7-day free trial
      const result = await adminClient
        .from("user_subscriptions")
        .insert({
          user_id: userId,
          plan_id,
          status: "trialing",
          trial_start: now.toISOString(),
          trial_end: trialEnd7Days.toISOString(),
          moyasar_given_id: givenId,
          seat_count: seatCount,
        })
        .select()
        .single();
      subscription = result.data;
      subError = result.error;
    }

    if (subError) {
      console.error("Subscription record error:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to create subscription" }),
        { status: 500, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: subscription.id,
        given_id: givenId,
        is_returning_user: hasPriorExpiredSub || isLaunchTrialConsumed,
        amount: 100,
        currency: "SAR",
        description: `Card verification for ${plan.name_en}`,
        seat_count: seatCount,
        monthly_total: monthlyTotal,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("moyasar-create-subscription error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
