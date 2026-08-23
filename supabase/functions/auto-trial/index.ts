import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// auto-trial — READ-ONLY trial ELIGIBILITY probe.
//
// THIS FUNCTION NO LONGER WRITES TO THE DATABASE. Do not re-add an insert.
//
// WHY
// ---
// Until 2026-08-23 this function inserted a `user_subscriptions` row with
//     status = "trialing", trial_start = now, trial_end = now + 7 days
// and NO card, on every SIGNED_IN event (src/hooks/useAuth.tsx).
//
// The billing contract of 2026-08-23 made a card MANDATORY to start the free
// trial, and fire-safety-chat enforces it server-side (index.ts ~:2723): a row
// with status = "trialing" AND trial_end in the future AND no
// `moyasar_card_token` is answered 403 `trial_card_required`. That check runs
// BEFORE the free-tier fallback, so the row this function used to write hard
// locked EVERY brand-new signup out of the product — they could not even use
// the free 10-messages/day tier.
//
// It also started the 7-day clock at signup rather than at card verification,
// so a user who added a card on day 5 received 2 of the 7 days every surface
// promises.
//
// The 7-day trial is NOT removed. `moyasar-create-subscription` is, and always
// was, the other writer of that row ("Case 1: new user eligible for 7-day free
// trial"). It runs at checkout, immediately before the card is verified, which
// is where the contract says the clock starts. Making it the SINGLE writer:
//   * a signed-in user with no card has no subscription row at all, so
//     fire-safety-chat falls through to the free tier (10/day, primary mode);
//   * the trial window is stamped at checkout, seconds before card
//     verification, not days earlier at signup;
//   * only one code path can ever create a `trialing` row, which also removes
//     the historical check-then-insert race between this function and
//     moyasar-create-subscription against the partial unique index
//     `user_subscriptions_one_live_row_per_user`
//     (migration 20260501000002).
//
// The endpoint is KEPT (rather than deleted) on purpose:
//   1. Frontend bundles already in users' browsers still invoke it on
//      SIGNED_IN. A 404 would be log noise; re-adding the insert would
//      recreate the outage. A harmless 200 is the safe answer.
//   2. It is a useful side-effect-free probe of trial eligibility.
// Because the fix is present on BOTH sides (this function stops writing AND
// useAuth.tsx stops calling it), either deploy order — function first or
// frontend first — closes the outage.
//
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Statuses that make a user ineligible for a fresh 7-day trial.
 * MUST mirror `hasPriorExpiredSub` in moyasar-create-subscription/index.ts.
 */
const TRIAL_CONSUMING_STATUSES = ["expired", "cancelled", "pending_activation"];

/**
 * profiles.launch_trial_status values that mean the launch trial was already
 * used up. MUST mirror `isLaunchTrialConsumed` in
 * moyasar-create-subscription/index.ts.
 */
const LAUNCH_TRIAL_CONSUMED_STATUSES = ["trial_expired", "paid"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Read-only eligibility evaluation ─────────────────────────────────────
    // Newest row wins, matching check-subscription and fire-safety-chat, which
    // both order by created_at desc / limit 1.
    const [subResult, profileResult] = await Promise.all([
      adminClient
        .from("user_subscriptions")
        .select("id, status, trial_end, moyasar_card_token")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminClient
        .from("profiles")
        .select("launch_trial_status")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const sub = subResult.data;
    const launchTrialStatus = profileResult.data?.launch_trial_status ?? null;

    const now = Date.now();
    const trialEndMs = sub?.trial_end ? Date.parse(sub.trial_end) : NaN;

    // Mirrors isInTrial() in supabase/functions/_shared/billing.ts. Status alone
    // is never enough: a lapsed `trialing` row is deliberately left untouched by
    // check-subscription so the renewal job can convert it.
    const trialLive =
      sub?.status === "trialing" && Number.isFinite(trialEndMs) && trialEndMs > now;

    const cardOnFile = !!sub?.moyasar_card_token;

    const trialConsumed =
      (!!sub && TRIAL_CONSUMING_STATUSES.includes(sub.status)) ||
      (!!launchTrialStatus && LAUNCH_TRIAL_CONSUMED_STATUSES.includes(launchTrialStatus));

    // A fresh 7-day trial is still available when there is no live subscription
    // row and nothing has consumed the entitlement. It is CLAIMED at checkout by
    // moyasar-create-subscription, never here.
    const trialAvailable = !sub && !trialConsumed;

    return new Response(
      JSON.stringify({
        // `result` is retained for shape compatibility with the deployed
        // frontend, which ignores the body entirely.
        result: "noop",
        writes_performed: false,
        has_subscription_row: !!sub,
        status: sub?.status ?? "none",
        trial_live: trialLive,
        card_on_file: cardOnFile,
        trial_available: trialAvailable,
        // The trial window is stamped by moyasar-create-subscription at
        // checkout, immediately before card verification.
        trial_starts_on: "card_verification",
        launch_trial_status: launchTrialStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("auto-trial error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
