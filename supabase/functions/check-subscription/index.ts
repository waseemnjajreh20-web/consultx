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

    // Auth via getUser
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Admin bypass
    const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];
    if (user.email && ADMIN_EMAILS.includes(user.email)) {
      return new Response(
        JSON.stringify({
          active: true,
          status: "active",
          trial_days_remaining: 0,
          plan: { id: "admin", name_ar: "أدمن", name_en: "Admin", price_amount: 0, currency: "SAR" },
          expires_at: null,
          card_brand: null,
          card_last_four: null,
          daily_messages_used: 0,
          daily_messages_limit: 9999,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get latest subscription
    const { data: subscription } = await adminClient
      .from("user_subscriptions")
      .select("*, subscription_plans(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get daily usage
    const { data: dailyUsage } = await adminClient.rpc("get_daily_usage", { p_user_id: userId });
    const messagesUsed = dailyUsage ?? 0;

    if (!subscription) {
      return new Response(
        JSON.stringify({
          active: false, status: "none", trial_days_remaining: 0, plan: null, expires_at: null,
          card_brand: null, card_last_four: null,
          daily_messages_used: messagesUsed, daily_messages_limit: 10,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    let active = false;
    let trialDaysRemaining = 0;
    let expiresAt: string | null = null;
    let dailyLimit = 20; // default for trialing

    if (subscription.status === "trialing" && subscription.trial_end) {
      const trialEnd = new Date(subscription.trial_end);
      if (now < trialEnd) {
        active = true;
        trialDaysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        expiresAt = subscription.trial_end;
        dailyLimit = 20;
      } else {
        await adminClient.from("user_subscriptions").update({ status: "expired" }).eq("id", subscription.id);
        subscription.status = "expired";
        dailyLimit = 10;
      }
    } else if (subscription.status === "active" && subscription.current_period_end) {
      const periodEnd = new Date(subscription.current_period_end);
      if (now < periodEnd) {
        active = true;
        expiresAt = subscription.current_period_end;
        dailyLimit = 9999; // unlimited for active subscribers
      } else {
        await adminClient.from("user_subscriptions").update({ status: "expired" }).eq("id", subscription.id);
        subscription.status = "expired";
        dailyLimit = 10;
      }
    } else if (subscription.status === "expired" || subscription.status === "cancelled") {
      dailyLimit = 10;
    }

    const plan = subscription.subscription_plans as any;

    return new Response(
      JSON.stringify({
        active,
        status: subscription.status,
        trial_days_remaining: trialDaysRemaining,
        plan: plan ? { id: plan.id, name_ar: plan.name_ar, name_en: plan.name_en, price_amount: plan.price_amount, currency: plan.currency } : null,
        expires_at: expiresAt,
        card_brand: subscription.card_brand,
        card_last_four: subscription.card_last_four,
        daily_messages_used: messagesUsed,
        daily_messages_limit: dailyLimit,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
