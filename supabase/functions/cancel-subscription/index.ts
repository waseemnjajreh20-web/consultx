import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================
// cancel-subscription
//
// Business rules:
//   TRIALING  → cancel immediately (no paid period was charged)
//   ACTIVE    → cancel at period end (user keeps access until current_period_end)
//   PAST_DUE  → cancel at period end (honours any remaining access)
//
// Lifecycle columns written:
//   cancel_at_period_end = true  (active/past_due — blocks renewal job)
//   cancelled_at         = now() (all paths)
//   status = "cancelled"         (trialing only — immediate)
//
// Side effects:
//   - Syncs profiles.plan_type = "free" on immediate cancel (trialing)
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

    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Find the specific subscription to cancel ─────────────────────────────
    // Target the single most recent active, trialing, or past_due row.
    // past_due is included: the user may want to cancel before a retry succeeds.
    const { data: sub, error: subError } = await adminClient
      .from("user_subscriptions")
      .select("id, status, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) {
      console.error("Subscription lookup error:", subError);
      return new Response(JSON.stringify({ error: "Failed to look up subscription" }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    if (!sub) {
      return new Response(JSON.stringify({ error: "No cancellable subscription found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Already scheduled — idempotent: return success without re-processing
    if (sub.cancel_at_period_end) {
      return new Response(
        JSON.stringify({
          success: true,
          already_scheduled: true,
          cancelled_immediately: false,
          access_until: sub.current_period_end,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();
    let updatePayload: Record<string, any>;
    let cancelledImmediately: boolean;

    if (sub.status === "trialing") {
      // Trialing subscriptions have not yet been charged for a real period.
      // The 1 SAR verification is a hold, not a subscription fee.
      // Cancel immediately — no access to preserve.
      updatePayload = {
        status: "cancelled",
        cancelled_at: now,
        cancel_at_period_end: false,
      };
      cancelledImmediately = true;
    } else {
      // Active or past_due: the user has paid for the current period.
      // Honour access until current_period_end by setting cancel_at_period_end.
      // The renewal job filters WHERE cancel_at_period_end = false so no further
      // charge will be attempted regardless of the value in next_billing_date.
      // check-subscription will transition status → "cancelled" when period ends.
      updatePayload = {
        cancel_at_period_end: true,
        cancelled_at: now,
        // status intentionally not changed here — stays "active" or "past_due"
        // so check-subscription can correctly read access until period end.
      };
      cancelledImmediately = false;
    }

    const { error: updateError } = await adminClient
      .from("user_subscriptions")
      .update(updatePayload)
      .eq("id", sub.id);

    if (updateError) {
      console.error("Subscription cancel update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to cancel subscription" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    console.log(
      cancelledImmediately
        ? `Sub ${sub.id}: cancelled immediately (was trialing)`
        : `Sub ${sub.id}: cancellation scheduled at period end (${sub.current_period_end})`,
    );

    // ── Immediate cancel: sync profiles.plan_type to "free" ──────────────────
    // For period-end cancels, check-subscription handles the sync when the
    // period actually expires, so we intentionally leave profiles.plan_type
    // unchanged here — the user still has active access.
    if (cancelledImmediately) {
      const { error: profileErr } = await adminClient
        .from("profiles")
        .update({ plan_type: "free" })
        .eq("user_id", user.id);
      if (profileErr) {
        // Non-fatal — log and continue. The plan_type will be corrected on
        // next check-subscription call.
        console.warn("Failed to sync profiles.plan_type after immediate cancel:", profileErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        cancelled_immediately: cancelledImmediately,
        access_until: cancelledImmediately ? null : sub.current_period_end,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("cancel-subscription unhandled error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
