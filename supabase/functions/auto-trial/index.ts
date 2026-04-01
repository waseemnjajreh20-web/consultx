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

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check for existing subscription
    const { data: existing } = await adminClient
      .from("user_subscriptions")
      .select("id, status")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ result: "already_exists", status: existing.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the Pro (engineer) plan explicitly by slug — slug is the stable identifier.
    // We must NOT use a nondeterministic query (type+target+LIMIT 1) because it could
    // return the free plan. The trial must always be on the engineer/Pro plan.
    const { data: plan, error: planError } = await adminClient
      .from("subscription_plans")
      .select("id")
      .eq("is_active", true)
      .eq("slug", "engineer")
      .maybeSingle();

    if (planError || !plan) {
      console.error("Engineer plan not found — cannot create trial:", planError);
      return new Response(JSON.stringify({ error: "Pro plan not found" }), { status: 500, headers: corsHeaders });
    }

    // Create 7-day Pro trial
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { error: insertError } = await adminClient
      .from("user_subscriptions")
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        status: "trialing",
        trial_start: now.toISOString(),
        trial_end: trialEnd.toISOString(),
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create trial" }), { status: 500, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ result: "created", trial_end: trialEnd.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
