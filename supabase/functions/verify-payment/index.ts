import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const { charge_id } = await req.json();
    if (!charge_id) {
      return new Response(JSON.stringify({ error: "charge_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(`https://api.tap.company/v2/charges/${charge_id}`, {
      headers: { Authorization: `Bearer ${TAP_SECRET_KEY}` },
    });

    const data = await response.json();

    return new Response(JSON.stringify({
      status: data.status,
      plan: data.metadata?.plan,
      billing_cycle: data.metadata?.billing_cycle,
      amount: data.amount,
      currency: data.currency,
      user_id: data.metadata?.user_id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("verify-payment error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
