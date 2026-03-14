import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    console.log("payment-webhook received:", JSON.stringify(body));

    const chargeId = body.id;
    const status = body.status;
    const { user_id, plan, billing_cycle } = body.metadata || {};

    // Always update payment_transactions if we have a charge id
    if (chargeId) {
      const mappedStatus = status === "CAPTURED" ? "captured" : status === "FAILED" ? "failed" : "initiated";
      await adminClient
        .from("payment_transactions")
        .update({ status: mappedStatus })
        .eq("tap_charge_id", chargeId);
    }

    // Only activate profile on CAPTURED
    if (status !== "CAPTURED") {
      console.log("Status not CAPTURED:", status);
      return new Response(JSON.stringify({ message: "Not captured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!user_id || !plan) {
      console.error("Missing metadata — user_id or plan");
      return new Response(JSON.stringify({ error: "Missing metadata" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const endDate = new Date(now);
    if (billing_cycle === "annual") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Update profiles table with subscription info
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        plan_type: plan,
        subscription_start: now.toISOString(),
        subscription_end: endDate.toISOString(),
        billing_cycle: billing_cycle || "monthly",
        tap_charge_id: chargeId,
        trial_type: null,
        trial_end: null,
      })
      .eq("user_id", user_id);

    if (profileError) {
      console.error("Profile update error:", profileError);
      return new Response(JSON.stringify({ error: "Profile update failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Profile updated for user ${user_id}: plan=${plan}, cycle=${billing_cycle}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("payment-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
