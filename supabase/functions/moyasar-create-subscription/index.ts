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
    const { plan_id } = await req.json();
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

    // ── Block double-active subscriptions ────────────────────────────────────
    const { data: activeSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status, moyasar_card_token")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (activeSub) {
      // Card-update path: active subscription with no payment method on file.
      // Return the existing subscription ID so the Moyasar form can collect a
      // card token without creating a new subscription row.
      if (!activeSub.moyasar_card_token) {
        const givenId = crypto.randomUUID();
        return new Response(
          JSON.stringify({
            success: true,
            subscription_id: activeSub.id,
            given_id: givenId,
            is_card_update: true,
            amount: 100,
            currency: "SAR",
            description: "Card verification",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "Active paid subscription already exists" }),
        { status: 409, headers: corsHeaders },
      );
    }

    // ── In-flight check (pending_activation with 30-min TTL) ─────────────────
    const { data: existingPendingSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status, trial_end, created_at")
      .eq("user_id", userId)
      .in("status", ["trialing", "pending_activation"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPendingSub?.status === "pending_activation") {
      const rowAgeMs = Date.now() - new Date(existingPendingSub.created_at).getTime();
      if (rowAgeMs < 30 * 60 * 1000) {
        return new Response(
          JSON.stringify({ error: "Payment verification already in progress", pending: true }),
          { status: 409, headers: corsHeaders },
        );
      }
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
