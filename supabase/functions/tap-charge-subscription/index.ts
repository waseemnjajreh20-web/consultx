import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const tapSecretKey = Deno.env.get("TAP_SECRET_KEY");

    if (!tapSecretKey) {
      return new Response(JSON.stringify({ error: "TAP_SECRET_KEY not configured" }), { status: 500, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get subscription with saved card
    const { data: subscription, error: subError } = await adminClient
      .from("user_subscriptions")
      .select("*, subscription_plans(*)")
      .eq("user_id", userId)
      .in("status", ["trialing", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !subscription) {
      return new Response(JSON.stringify({ error: "No active subscription found" }), { status: 404, headers: corsHeaders });
    }

    if (!subscription.tap_card_id || !subscription.tap_customer_id) {
      return new Response(JSON.stringify({ error: "No saved card found" }), { status: 400, headers: corsHeaders });
    }

    const plan = subscription.subscription_plans as any;
    const amount = plan.price_amount / 100; // Convert halalas to SAR

    // Step 1: Create token from saved card
    const tokenResponse = await fetch("https://api.tap.company/v2/tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tapSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        saved_card: {
          card_id: subscription.tap_card_id,
          customer_id: subscription.tap_customer_id,
        },
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.id) {
      console.error("Token creation failed:", tokenData);
      return new Response(JSON.stringify({ error: "Failed to create token from saved card" }), { status: 400, headers: corsHeaders });
    }

    // Step 2: Create charge with token (MIT)
    const chargePayload = {
      amount,
      currency: plan.currency || "SAR",
      save_card: false,
      threeDSecure: false,
      description: `Subscription renewal - ${plan.name_en}`,
      statement_descriptor: "ConsultX Sub",
      reference: { transaction: `renewal_${subscription.id}_${Date.now()}`, order: `order_${userId}` },
      receipt: { email: true, sms: false },
      customer: { id: subscription.tap_customer_id },
      source: { id: tokenData.id },
      payment_agreement: {
        id: subscription.tap_payment_agreement_id || "",
        type: "UNSCHEDULED",
        contract: { id: `contract_${userId}`, type: "PAY_AS_YOU_GO" },
      },
      post: {
        url: `${supabaseUrl}/functions/v1/tap-webhook`,
      },
    };

    const chargeResponse = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tapSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chargePayload),
    });

    const chargeData = await chargeResponse.json();

    if (!chargeResponse.ok) {
      console.error("TAP charge creation failed:", chargeData);
      return new Response(JSON.stringify({ error: "Payment provider error", details: chargeData.errors }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Record transaction
    const { error: txError } = await adminClient.from("payment_transactions").insert({
      user_id: userId,
      subscription_id: subscription.id,
      tap_charge_id: chargeData.id,
      amount: plan.price_amount,
      currency: plan.currency || "SAR",
      status: chargeData.status === "CAPTURED" ? "captured" : "initiated",
      payment_type: "renewal",
    });

    if (txError) {
      console.error("Failed to record transaction:", txError);
      return new Response(JSON.stringify({ error: "Failed to record payment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If captured immediately, update subscription
    if (chargeData.status === "CAPTURED") {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + (plan.duration_days || 30) * 24 * 60 * 60 * 1000);
      await adminClient
        .from("user_subscriptions")
        .update({
          status: "active",
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        })
        .eq("id", subscription.id);
    }

    return new Response(
      JSON.stringify({ success: true, charge_status: chargeData.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
