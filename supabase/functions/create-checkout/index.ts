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

    // Verify user auth
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

    // Price map in SAR (whole units, not halalas)
    const prices: Record<string, Record<string, number>> = {
      engineer: { monthly: 149, annual: 1188 },   // 99*12
      enterprise: { monthly: 499, annual: 4188 },  // 349*12
    };

    const amount = prices[plan]?.[billing_cycle];
    if (!amount) {
      return new Response(JSON.stringify({ error: "Invalid plan or billing_cycle" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const planNames: Record<string, string> = {
      engineer: "باقة مهندس — ConsultX",
      enterprise: "باقة مؤسسة — ConsultX",
    };

    const origin = req.headers.get("origin") || "https://www.consultx.app";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";
    const webhookUrl = projectRef
      ? `https://${projectRef}.supabase.co/functions/v1/payment-webhook`
      : `${supabaseUrl}/functions/v1/payment-webhook`;

    const tapResponse = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TAP_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "SAR",
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: planNames[plan] || plan,
        source: { id: "src_all" },
        metadata: {
          user_id: user.id,
          plan,
          billing_cycle,
        },
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
      return new Response(JSON.stringify({ error: "Failed to create checkout", details: tapData }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the payment attempt in payment_history
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    await adminClient.from("payment_history").insert({
      user_id: user.id,
      tap_charge_id: tapData.id,
      amount,
      currency: "SAR",
      plan,
      billing_cycle,
      status: "INITIATED",
    });

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
