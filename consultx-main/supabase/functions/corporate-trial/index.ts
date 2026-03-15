import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "aol.com", "icloud.com", "mail.com", "protonmail.com", "zoho.com",
  "yandex.com", "gmx.com", "tutanota.com", "fastmail.com",
  "yahoo.co.uk", "hotmail.co.uk", "googlemail.com",
]);

const LAUNCH_PROMO = {
  enabled: true,
  name: "launch_engineer_trial",
  trialDays: 3,
  expiryDate: new Date("2026-06-30T23:59:59Z"),
  planGranted: "engineer",
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

    // Check if profile already exists
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, plan_type, trial_type")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ result: "already_exists", plan_type: existingProfile.plan_type }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine if corporate email
    const email = user.email ?? "";
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    const isCorporate = domain.length > 0 && !FREE_EMAIL_DOMAINS.has(domain);

    const now = new Date();
    const promoActive = LAUNCH_PROMO.enabled && now < LAUNCH_PROMO.expiryDate;
    const grantEngineerTrial = isCorporate && promoActive;

    let profileData: Record<string, unknown> = {
      user_id: user.id,
      plan_type: grantEngineerTrial ? "engineer" : "free",
    };

    let trialEnd: Date | null = null;

    if (grantEngineerTrial) {
      trialEnd = new Date(now.getTime() + LAUNCH_PROMO.trialDays * 24 * 60 * 60 * 1000);
      profileData = {
        ...profileData,
        trial_type: LAUNCH_PROMO.name,
        trial_start: now.toISOString(),
        trial_end: trialEnd.toISOString(),
        corporate_domain: domain,
      };
    }

    const { error: insertError } = await adminClient
      .from("profiles")
      .insert(profileData);

    if (insertError) {
      console.error("Profile insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create profile" }), { status: 500, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({
        result: "created",
        is_corporate: isCorporate,
        plan_type: profileData.plan_type,
        engineer_trial: grantEngineerTrial,
        trial_end: trialEnd?.toISOString() ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
