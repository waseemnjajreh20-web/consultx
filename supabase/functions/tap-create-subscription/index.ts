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
    // Authenticate user
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

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;
    const userEmail = user.email || "";

    const { token_id, plan_id } = await req.json();
    if (!token_id || !plan_id) {
      return new Response(JSON.stringify({ error: "token_id and plan_id are required" }), { status: 400, headers: corsHeaders });
    }

    // Admin client for DB writes
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get plan details
    const { data: plan, error: planError } = await adminClient
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Plan not found" }), { status: 404, headers: corsHeaders });
    }

    // Check for ACTIVE subscription — block double subscriptions
    const { data: activeSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (activeSub) {
      return new Response(JSON.stringify({ error: "Active paid subscription already exists" }), { status: 409, headers: corsHeaders });
    }

    // Check for TRIALING subscription — allow card addition
    const { data: trialingSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status, trial_end")
      .eq("user_id", userId)
      .eq("status", "trialing")
      .maybeSingle();

    // Check if user ever had ANY prior subscription (to detect expired trial users)
    const { data: anyPriorSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status, trial_end")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasPriorExpiredSub =
      anyPriorSub && (anyPriorSub.status === "expired" || anyPriorSub.status === "cancelled");

    // Create Tap Charge (1 SAR verification)
    const origin = "https://www.consultx.app";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";
    const webhookUrl = projectRef
      ? `https://${projectRef}.supabase.co/functions/v1/tap-webhook`
      : `${supabaseUrl}/functions/v1/tap-webhook`;

    const isTestMode = tapSecretKey.startsWith("sk_test_") || tapSecretKey.startsWith("test");

    const chargePayload: Record<string, unknown> = {
      amount: 1,
      currency: "SAR",
      threeDSecure: true,
      description: `Card verification for ${plan.name_en}`,
      statement_descriptor: "ConsultX Verify",
      reference: { transaction: `sub_${userId}_${Date.now()}`, order: `order_${userId}` },
      receipt: { email: true, sms: false },
      customer: {
        first_name: userEmail.split("@")[0],
        email: userEmail,
      },
      source: { id: token_id },
      post: { url: webhookUrl },
      redirect: { url: `${origin}/payment-callback` },
    };

    // Only request save_card in live mode
    if (!isTestMode) {
      chargePayload.save_card = true;
      chargePayload.customer_initiated = true;
    }

    const tapResponse = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tapSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chargePayload),
    });

    const chargeData = await tapResponse.json();

    if (!tapResponse.ok) {
      console.error("Tap charge error:", chargeData);
      return new Response(JSON.stringify({ error: "Payment failed", details: chargeData }), { status: 400, headers: corsHeaders });
    }

    /**
     * Trial Logic — determines subscription behavior based on user history:
     *
     * 1. NEW USER (no prior subscription):
     *    - Gets a 3-day free trial (trial_end = now + 3 days)
     *    - Status is set to "trialing"
     *    - Card is saved; subscription auto-renews after trial ends
     *
     * 2. USER WITH ACTIVE TRIAL (status === "trialing"):
     *    - Keeps existing trial dates (trial_start and trial_end unchanged)
     *    - Updates plan_id and card info on the existing record
     *    - This handles the case where a trialing user re-enters card details
     *
     * 3. RETURNING USER (prior subscription expired or cancelled):
     *    - trial_end is set to NOW (immediate expiration)
     *    - Status is "trialing" temporarily, but because trial_end <= now,
     *      the webhook handler (tap-webhook) will detect this as
     *      "isTrialExpiredOrImmediate" and activate the subscription
     *      immediately upon CAPTURED charge
     *    - This ensures returning users do NOT get another free trial
     */
    const now = new Date();
    const trialEnd3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    let subscription: any;
    let subError: any;

    if (trialingSub) {
      /** Case 2: User has an active trial — update card info, keep trial dates */
      const result = await adminClient
        .from("user_subscriptions")
        .update({
          plan_id: plan_id,
          tap_customer_id: chargeData.customer?.id || null,
          tap_card_id: chargeData.card?.id || null,
          tap_payment_agreement_id: chargeData.payment_agreement?.id || null,
          card_brand: chargeData.card?.brand || null,
          card_last_four: chargeData.card?.last_four || null,
        })
        .eq("id", trialingSub.id)
        .select()
        .single();
      subscription = result.data;
      subError = result.error;
    } else if (hasPriorExpiredSub) {
      /** Case 3: Returning user (expired/cancelled) — trial_end = now for immediate activation on webhook capture */
      console.log("Returning user with prior expired sub — setting trial_end = now for immediate activation");
      const result = await adminClient
        .from("user_subscriptions")
        .insert({
          user_id: userId,
          plan_id: plan_id,
          status: "trialing",
          trial_start: now.toISOString(),
          trial_end: now.toISOString(), // expires immediately → activated by webhook
          tap_customer_id: chargeData.customer?.id || null,
          tap_card_id: chargeData.card?.id || null,
          tap_payment_agreement_id: chargeData.payment_agreement?.id || null,
          card_brand: chargeData.card?.brand || null,
          card_last_four: chargeData.card?.last_four || null,
        })
        .select()
        .single();
      subscription = result.data;
      subError = result.error;
    } else {
      /** Case 1: Brand new user — grant 3-day free trial */
      console.log("New user — granting 3-day free trial");
      const result = await adminClient
        .from("user_subscriptions")
        .insert({
          user_id: userId,
          plan_id: plan_id,
          status: "trialing",
          trial_start: now.toISOString(),
          trial_end: trialEnd3Days.toISOString(),
          tap_customer_id: chargeData.customer?.id || null,
          tap_card_id: chargeData.card?.id || null,
          tap_payment_agreement_id: chargeData.payment_agreement?.id || null,
          card_brand: chargeData.card?.brand || null,
          card_last_four: chargeData.card?.last_four || null,
        })
        .select()
        .single();
      subscription = result.data;
      subError = result.error;
    }

    if (subError) {
      console.error("Subscription insert error:", subError);
      return new Response(JSON.stringify({ error: "Failed to create subscription" }), { status: 500, headers: corsHeaders });
    }

    // Record transaction
    const { error: txError } = await adminClient.from("payment_transactions").insert({
      user_id: userId,
      subscription_id: subscription.id,
      tap_charge_id: chargeData.id,
      amount: 100, // 1 SAR in halalas
      currency: "SAR",
      status: chargeData.status === "CAPTURED" ? "captured" : "initiated",
      payment_type: "verification",
    });
    if (txError) {
      console.error("Failed to record verification transaction:", txError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: subscription.id,
        charge_status: chargeData.status,
        redirect_url: chargeData.transaction?.url || null,
        is_returning_user: hasPriorExpiredSub,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
