import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeCharge, type ChargeDecision, type SubLike } from "../_shared/billing.ts";

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
    const promo_code = typeof body?.promo_code === "string" ? body.promo_code.trim() : null;
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

    // ── Checkout amount ──────────────────────────────────────────────────────
    // The displayed amount MUST be produced by the same helper that produces
    // the charged amount (see moyasar-initiate-token-payment), otherwise the
    // screen and the card can disagree. Billing contract Section 6.
    const decide = (subLike: SubLike): ChargeDecision =>
      computeCharge(plan as any, { ...subLike, seat_count: seatCount }, promo_code, 0);

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

    // ── In-flight check: reuse the existing live row ─────────────────────────
    // Rather than blocking the user with a 30-min TTL, refresh the given_id on
    // the existing row so a clean Moyasar form can be mounted immediately.
    //
    // `past_due` is included so a customer whose card is failing can start a
    // fresh payment session and update their card (billing contract 5.4).
    const { data: existingPendingSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status, trial_end, created_at, moyasar_card_token")
      .eq("user_id", userId)
      .in("status", ["trialing", "pending_activation", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPendingSub?.status === "pending_activation") {
      // No live trial — immediate charge at the full (or promo) plan price.
      const decision = decide({ status: "pending_activation", trial_end: null });
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
          flow: decision.flow,
          amount: decision.amount,
          currency: "SAR",
          amount_base: decision.base,
          amount_vat: decision.vat,
          plan_price: decision.planPrice,
          verification_credit: decision.verificationCredit,
          description: decision.description,
          promo_code: decision.appliedPromo,
          plan_id,
          seat_count: seatCount,
          monthly_total: monthlyTotal,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ARMED rows: `trialing` and `past_due` ────────────────────────────────
    // Defect C1. These two statuses hold a saved Moyasar card token and are
    // polled by process-subscription-renewal, so whatever plan_id / seat_count
    // sits on the row IS what an unattended cron charge will bill.
    //
    // Writing the requested plan/seats here (what this function used to do)
    // meant an ABANDONED checkout permanently escalated a live subscription:
    // pick enterprise_office x100, never complete the payment, close the tab —
    // and at trial_end the cron charged 100 x 54,900 halalas on the stored
    // token, with the webhook happily validating the amount because it
    // re-derived it from the same mutated row.
    //
    // The row is therefore left untouched except for the payment-session id.
    // The requested plan/seats travel in the Moyasar payment metadata
    // (moyasar-initiate-token-payment) and are promoted onto the row by
    // moyasar-webhook only when that payment is CAPTURED.
    if (existingPendingSub?.status === "trialing" || existingPendingSub?.status === "past_due") {
      const decision = decide({
        status: existingPendingSub.status,
        trial_end: existingPendingSub.trial_end ?? null,
        moyasar_card_token: (existingPendingSub as any).moyasar_card_token ?? null,
      });
      const freshGivenId = crypto.randomUUID();
      const { data: refreshedSub, error: refreshError } = await adminClient
        .from("user_subscriptions")
        .update({ moyasar_given_id: freshGivenId })
        .eq("id", existingPendingSub.id)
        .select("id")
        .single();
      if (refreshError || !refreshedSub) {
        console.error("Failed to refresh live payment session:", refreshError);
        return new Response(JSON.stringify({ error: "Failed to refresh payment session" }), {
          status: 500, headers: corsHeaders,
        });
      }
      return new Response(
        JSON.stringify({
          success: true,
          subscription_id: refreshedSub.id,
          given_id: freshGivenId,
          is_returning_user: existingPendingSub.status === "past_due",
          flow: decision.flow,
          amount: decision.amount,
          currency: "SAR",
          amount_base: decision.base,
          amount_vat: decision.vat,
          plan_price: decision.planPrice,
          verification_credit: decision.verificationCredit,
          description: decision.description,
          promo_code: decision.appliedPromo,
          // The plan/seats this payment session is FOR. Not yet written to the
          // subscription row — promoted by the webhook once the payment is
          // captured. The client must echo these back to
          // moyasar-initiate-token-payment.
          plan_id,
          seat_count: seatCount,
          monthly_total: monthlyTotal,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    if (hasPriorExpiredSub || isLaunchTrialConsumed) {
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

    // Decide the displayed amount from the row that was actually written.
    const decision = decide({
      status: subscription.status,
      trial_end: subscription.trial_end ?? null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: subscription.id,
        given_id: givenId,
        is_returning_user: hasPriorExpiredSub || isLaunchTrialConsumed,
        flow: decision.flow,
        amount: decision.amount,
        currency: "SAR",
        amount_base: decision.base,
        amount_vat: decision.vat,
        plan_price: decision.planPrice,
        verification_credit: decision.verificationCredit,
        description: decision.description,
        promo_code: decision.appliedPromo,
        plan_id,
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
