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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const payload = await req.json();
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

    // Update transaction status
    const mappedStatus = status === "CAPTURED" ? "captured" : status === "FAILED" ? "failed" : "initiated";
    const { error: txUpdateError } = await adminClient
      .from("payment_transactions")
      .update({ status: mappedStatus })
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
        } else {
          // New user within trial window — keep trialing with card saved
          console.log("Verification captured for active trial — keeping trialing status");
          updateData.status = "trialing";
        }
      } else if (transaction.payment_type === "renewal" || transaction.payment_type === "subscription") {
        // Paid renewal — activate subscription
        console.log("Renewal/subscription charge captured — activating subscription");
        updateData.status = "active";
        updateData.current_period_start = now.toISOString();
        updateData.current_period_end = periodEnd.toISOString();
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
      // Optionally mark subscription as payment_failed
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
