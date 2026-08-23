import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey, getPublishableKey } from "../_shared/supabaseKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================
// cancel-subscription
//
// Business rules — cancelling NEVER destroys access already paid for:
//   TRIALING  -> cancel at trial end   (access kept until trial_end)
//   ACTIVE    -> cancel at period end  (access kept until current_period_end)
//   PAST_DUE  -> cancel at period end  (honours any remaining grace access)
//
// R3-C2 (2026-08-23). TRIALING used to be cancelled IMMEDIATELY
// (status = "cancelled"). That was wrong twice over:
//   1. The customer paid 1.00 SAR to verify their card and the product promises
//      "cancel anytime" — it does not promise "forfeit the rest of your trial".
//   2. It opened the activation race: the renewal cron creates the post-trial
//      charge at 09:00, the customer cancels at 09:02, and the webhook for that
//      charge lands at 09:05 on a row that is now `cancelled` — and the webhook
//      activated it anyway. (The webhook side is closed by
//      _shared/webhookDecisions.ts.)
//
// The status now stays `trialing`; only `cancel_at_period_end` is set. The row
// therefore stays in process-subscription-renewal's trialing work queue, and
// that job owns expiring it at trial_end WITHOUT charging it.
//
// Lifecycle columns written (every path, no exceptions):
//   cancel_at_period_end = true    (blocks the renewal / conversion charge)
//   cancelled_at         = now()
//   status               = UNCHANGED
//
// No path cancels immediately any more, so profiles.plan_type is never synced
// to "free" here — the user still has access. check-subscription and
// process-subscription-renewal perform that sync when access actually ends.
//
// Response contract (consumed by src/pages/Account.tsx):
//   { success, cancelled_immediately, access_until, already_scheduled? }
//   access_until = trial_end for a `trialing` row, current_period_end otherwise.
//   cancelled_immediately is retained (always false) so the existing frontend
//   toast keeps working unchanged.
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
    const supabaseAnonKey = getPublishableKey();
    const serviceRoleKey  = getSecretKey();

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
    // trial_end is selected because it is the access horizon reported for a
    // trialing row (see the accessUntil derivation below).
    const { data: sub, error: subError } = await adminClient
      .from("user_subscriptions")
      .select("id, status, current_period_end, trial_end, cancel_at_period_end")
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

    // The date the customer keeps access until. A trialing row has not opened a
    // paid period yet, so current_period_end is meaningless (and often null) for
    // it — trial_end is the real horizon.
    const accessUntil: string | null =
      sub.status === "trialing"
        ? ((sub as any).trial_end ?? sub.current_period_end ?? null)
        : (sub.current_period_end ?? null);

    // Already scheduled — idempotent: return success without re-processing.
    if (sub.cancel_at_period_end) {
      return new Response(
        JSON.stringify({
          success: true,
          already_scheduled: true,
          cancelled_immediately: false,
          access_until: accessUntil,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();

    // Identical for trialing, active and past_due: schedule the end, never
    // revoke access that has already been paid for.
    //
    // status is intentionally NOT changed:
    //   - active / past_due : check-subscription reads access until period end.
    //   - trialing          : the row must stay in the renewal job's trialing
    //                         queue so that job can expire it at trial_end.
    const updatePayload: Record<string, any> = {
      cancel_at_period_end: true,
      cancelled_at: now,
    };

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
      `Sub ${sub.id}: cancellation scheduled (status ${sub.status}, access until ${accessUntil})`,
    );

    // profiles.plan_type is deliberately NOT touched: the user still has access
    // until accessUntil. check-subscription / process-subscription-renewal sync
    // it to "free" when the period or trial actually ends.

    return new Response(
      JSON.stringify({
        success: true,
        cancelled_immediately: false,
        access_until: accessUntil,
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
