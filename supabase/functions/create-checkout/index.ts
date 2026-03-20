import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const TAP_SECRET_KEY = Deno.env.get("TAP_SECRET_KEY");
    if (!TAP_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "TAP_SECRET_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { plan, billing_cycle } = await req.json();
    if (!plan || !billing_cycle) {
      return new Response(JSON.stringify({ error: "plan and billing_cycle are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Resolve plan from DB by slug — single source of truth for pricing
    const { data: planData, error: planError } = await adminClient
      .from("subscription_plans")
      .select("*")
      .eq("slug", plan)
      .eq("is_active", true)
      .neq("slug", "free")
      .single();

    if (planError || !planData) {
      return new Response(JSON.stringify({ error: "Plan not found or not subscribable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // price_amount is stored in halalas; TAP expects whole SAR units
    const amountSAR = planData.price_amount / 100;

    const origin = "https://www.consultx.app";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";
    const webhookUrl = projectRef
      ? `https://${projectRef}.supabase.co/functions/v1/tap-webhook`
      : `${supabaseUrl}/functions/v1/tap-webhook`;

    // Create pending subscription row so the webhook can activate it on CAPTURED
    const now = new Date();
    const periodEnd = new Date(now.getTime() + (planData.duration_days || 30) * 24 * 60 * 60 * 1000);
    const { data: newSub, error: subError } = await adminClient
      .from("user_subscriptions")
      .insert({
        user_id: user.id,
        plan_id: planData.id,
        status: "pending",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
      .select()
      .single();

    if (subError || !newSub) {
      console.error("Failed to create pending subscription:", subError);
      return new Response(JSON.stringify({ error: "Failed to initialise subscription" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tapResponse = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TAP_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountSAR,
        currency: "SAR",
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: `${planData.name_en} — ConsultX`,
        source: { id: "src_all" },
        metadata: { user_id: user.id, plan: planData.slug, billing_cycle },
        customer: {
          email: user.email,
          first_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "ConsultX User",
        },
        receipt: { email: true, sms: false },
        redirect: { url: `${origin}/payment-callback` },
        post: { url: webhookUrl },
      }),
    });

    const tapData = await tapResponse.json();

    if (!tapResponse.ok || !tapData.transaction?.url) {
      console.error("Tap charge error:", JSON.stringify(tapData));
      // Roll back the pending subscription row
      await adminClient.from("user_subscriptions").delete().eq("id", newSub.id);
      return new Response(JSON.stringify({ error: "Failed to create checkout", details: tapData }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the payment attempt with subscription_id so the webhook can process it
    const { error: txError } = await adminClient.from("payment_transactions").insert({
      user_id: user.id,
      subscription_id: newSub.id,
      tap_charge_id: tapData.id,
      amount: planData.price_amount,
      currency: "SAR",
      status: "initiated",
      payment_type: "checkout",
    });
    if (txError) {
      console.error("Failed to record checkout transaction:", txError);
    }

    return new Response(JSON.stringify({ checkout_url: tapData.transaction.url, charge_id: tapData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("create-checkout error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
