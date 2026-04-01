import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Tap webhook signature verification (HMAC-SHA256) ─────────────────────
    // Must run before any DB access. Fail closed — no bypass paths.
    const tapSecretKey = Deno.env.get("TAP_SECRET_KEY");
    if (!tapSecretKey) {
      console.error("TAP_SECRET_KEY not configured — cannot verify webhook");
      return new Response(JSON.stringify({ error: "Webhook verification unavailable" }), { status: 500, headers: corsHeaders });
    }

    const receivedHash = req.headers.get("hashstring");
    if (!receivedHash) {
      console.error("Webhook rejected: missing hashstring header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Clone the request so the body can be read twice (once for HMAC, once for JSON parsing)
    const bodyText = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      console.error("Webhook rejected: invalid JSON body");
      return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: corsHeaders });
    }

    // Build the hash input string exactly as documented by Tap:
    // x_id + x_amount + x_currency + x_gateway_reference + x_payment_reference + x_status + x_created
    const hashInput =
      "x_id"                  + (payload.id                        ?? "") +
      "x_amount"              + String(payload.transaction?.amount  ?? "") +
      "x_currency"            + (payload.currency                   ?? "") +
      "x_gateway_reference"   + (payload.reference?.gateway         ?? "") +
      "x_payment_reference"   + (payload.reference?.payment         ?? "") +
      "x_status"              + (payload.status                     ?? "") +
      "x_created"             + String(payload.transaction?.created ?? "");

    console.log("Webhook HMAC input fields:", {
      x_id: payload.id ?? "",
      x_amount: String(payload.transaction?.amount ?? ""),
      x_currency: payload.currency ?? "",
      x_gateway_reference: payload.reference?.gateway ?? "",
      x_payment_reference: payload.reference?.payment ?? "",
      x_status: payload.status ?? "",
      x_created: String(payload.transaction?.created ?? ""),
    });

    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(tapSecretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(hashInput));
    const computedHash = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computedHash !== receivedHash) {
      console.error("Webhook rejected: HMAC mismatch", {
        computed_length: computedHash.length,
        received_length: receivedHash.length,
      });
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    console.log("Webhook signature verified successfully");
    // ── End signature verification ────────────────────────────────────────────

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    console.log("Tap webhook received:", JSON.stringify(payload));

    const chargeId = payload.id;
    const status = payload.status;
    const customerId = payload.customer?.id;
    const cardId = payload.card?.id;
    const cardBrand = payload.card?.brand;
    const cardLastFour = payload.card?.last_four;
    const paymentAgreementId = payload.payment_agreement?.id;

    if (!chargeId) {
      console.error("Webhook payload missing charge ID. Payload keys:", Object.keys(payload));
      return new Response(JSON.stringify({ error: "Missing charge ID" }), { status: 400, headers: corsHeaders });
    }

    // Find transaction by tap_charge_id
    const { data: transaction } = await adminClient
      .from("payment_transactions")
      .select("*, user_subscriptions(*)")
      .eq("tap_charge_id", chargeId)
      .maybeSingle();

    if (!transaction) {
      console.log("Transaction not found for charge:", chargeId);
      return new Response(JSON.stringify({ message: "Transaction not found" }), { status: 200, headers: corsHeaders });
    }

    // Update transaction status (+ failure detail columns when FAILED)
    const mappedStatus = status === "CAPTURED" ? "captured" : status === "FAILED" ? "failed" : "initiated";
    const txUpdate: Record<string, any> = { status: mappedStatus };
    if (status === "FAILED") {
      txUpdate.failure_code    = payload.response?.code    ?? null;
      txUpdate.failure_message = payload.response?.message ?? null;
    }
    const { error: txUpdateError } = await adminClient
      .from("payment_transactions")
      .update(txUpdate)
      .eq("id", transaction.id);

    if (txUpdateError) {
      console.error("Failed to update transaction status:", {
        transaction_id: transaction.id,
        charge_id: chargeId,
        target_status: mappedStatus,
        error: txUpdateError,
      });
    }

    // Handle CAPTURED charge
    if (status === "CAPTURED" && transaction.subscription_id) {
      const updateData: Record<string, any> = {};

      // Always update card/customer info if available
      if (customerId) updateData.tap_customer_id = customerId;
      if (cardId) updateData.tap_card_id = cardId;
      if (cardBrand) updateData.card_brand = cardBrand;
      if (cardLastFour) updateData.card_last_four = cardLastFour;
      if (paymentAgreementId) updateData.tap_payment_agreement_id = paymentAgreementId;

      // Fetch the subscription with its plan details
      const { data: sub } = await adminClient
        .from("user_subscriptions")
        .select("id, status, trial_end, plan_id, subscription_plans(duration_days)")
        .eq("id", transaction.subscription_id)
        .single();

      if (!sub) {
        console.error("Subscription not found:", transaction.subscription_id);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      }

      const now = new Date();
      const trialEndDate = sub.trial_end ? new Date(sub.trial_end) : null;
      const isTrialExpiredOrImmediate = !trialEndDate || trialEndDate <= now;
      const durationDays = (sub as any)?.subscription_plans?.duration_days || 30;
      const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      if (transaction.payment_type === "verification") {
        if (isTrialExpiredOrImmediate) {
          // Returning user (trial_end = now) or no trial — activate immediately
          console.log("Verification captured for expired/immediate trial — activating subscription");
          updateData.status = "active";
          updateData.current_period_start = now.toISOString();
          updateData.current_period_end = periodEnd.toISOString();
          updateData.next_billing_date = periodEnd.toISOString();
        } else {
          // New user within trial window — keep trialing with card saved
          console.log("Verification captured for active trial — keeping trialing status");
          updateData.status = "trialing";
        }
      } else if (transaction.payment_type === "renewal" || transaction.payment_type === "subscription" || transaction.payment_type === "checkout") {
        // Paid renewal — activate subscription
        console.log("Renewal/subscription charge captured — activating subscription");
        updateData.status = "active";
        updateData.current_period_start = now.toISOString();
        updateData.current_period_end = periodEnd.toISOString();
        updateData.next_billing_date = periodEnd.toISOString();
        // Clear any past-due flag from prior failed attempts on this renewal cycle
        updateData.past_due_since = null;
      }

      if (Object.keys(updateData).length > 0) {
        const { error: subUpdateError } = await adminClient
          .from("user_subscriptions")
          .update(updateData)
          .eq("id", transaction.subscription_id);

        if (subUpdateError) {
          console.error("Failed to update subscription:", {
            subscription_id: transaction.subscription_id,
            charge_id: chargeId,
            update_fields: Object.keys(updateData),
            error: subUpdateError,
          });
        } else {
          console.log("Subscription updated successfully:", {
            subscription_id: transaction.subscription_id,
            new_status: updateData.status || "(unchanged)",
            charge_id: chargeId,
          });

          // Sync profiles.plan_type when subscription becomes active
          if (updateData.status === "active" && transaction.user_id) {
            // Correct: read slug directly — it maps 1:1 to profiles.plan_type
            const { data: planInfo } = await adminClient
              .from("subscription_plans")
              .select("slug")
              .eq("id", sub.plan_id)
              .single();

            const planType = planInfo?.slug || "engineer";

            const { error: profileError } = await adminClient
              .from("profiles")
              .update({ plan_type: planType })
              .eq("user_id", transaction.user_id);

            if (profileError) {
              console.error("Failed to update profiles.plan_type:", profileError);
            } else {
              console.log(`profiles.plan_type updated to '${planType}' for user ${transaction.user_id}`);
            }
          }
        }
      }
    } else if (status === "FAILED" && transaction.subscription_id) {
      console.error("Payment FAILED for subscription:", {
        subscription_id: transaction.subscription_id,
        charge_id: chargeId,
        payment_type: transaction.payment_type,
        tap_response_code: payload.response?.code,
        tap_response_message: payload.response?.message,
      });

      // Mark past_due_since if this is a renewal charge (not a verification).
      // Only set it on the first failure — do not overwrite an existing timestamp
      // from a prior retry, so the grace-period clock starts from the first miss.
      if (transaction.payment_type === "renewal" || transaction.payment_type === "subscription") {
        const { data: subForFailure } = await adminClient
          .from("user_subscriptions")
          .select("past_due_since")
          .eq("id", transaction.subscription_id)
          .single();

        if (subForFailure && !subForFailure.past_due_since) {
          const { error: pastDueError } = await adminClient
            .from("user_subscriptions")
            .update({ past_due_since: new Date().toISOString() })
            .eq("id", transaction.subscription_id);

          if (pastDueError) {
            console.error("Failed to set past_due_since:", pastDueError);
          } else {
            console.log("past_due_since set for subscription:", transaction.subscription_id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("Webhook unhandled error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
