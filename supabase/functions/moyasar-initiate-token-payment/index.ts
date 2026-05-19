import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================
// moyasar-initiate-token-payment
//
// Called by Subscribe.tsx AFTER the browser tokenizes card details
// directly with https://api.moyasar.com/v1/tokens. Card details
// never reach this function — only the resulting opaque token.
//
// Creates a verification payment using the token. The default
// amount is 100 halalas (1 SAR card verification). When the caller
// passes a valid FOUNDING10 promo and the subscription is bound to
// the flat Pro plan, the amount becomes 1000 halalas (10 SAR) — the
// "Founding Engineers first month" charge. Moyasar returns either
// a 'paid' status (no 3DS) or 'initiated' with a transaction_url
// for 3DS redirect; the webhook (moyasar-webhook) is the source of
// truth for activation.
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   MOYASAR_SECRET_KEY  (Basic-auth credential for /v1/payments)
// ============================================================

// ── FOUNDING10 campaign constants ────────────────────────────────────────────
// Keep in lockstep with src/lib/campaigns/founding10.ts.
const FOUNDING10_CODE = "FOUNDING10";
const FOUNDING10_FIRST_CHARGE_HALALAS = 1000; // 10 SAR
const FOUNDING10_PLAN_SLUG = "pro";
const FOUNDING10_STARTS_AT_MS = Date.parse("2026-05-19T00:00:00Z");
const FOUNDING10_ENDS_AT_MS   = Date.parse("2026-05-26T23:59:59Z");

function isFounding10Active(): boolean {
  const t = Date.now();
  return t >= FOUNDING10_STARTS_AT_MS && t <= FOUNDING10_ENDS_AT_MS;
}

function isFounding10Code(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  return raw.trim().toUpperCase() === FOUNDING10_CODE;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const moyasarSecretKey = Deno.env.get("MOYASAR_SECRET_KEY");

    if (!moyasarSecretKey) {
      console.error("MOYASAR_SECRET_KEY not configured");
      return new Response(JSON.stringify({ error: "Payment provider not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const subscriptionId = typeof body?.subscription_id === "string" ? body.subscription_id : "";
    const givenId = typeof body?.given_id === "string" ? body.given_id : "";
    const rawPromoCode = typeof body?.promo_code === "string" ? body.promo_code : "";

    if (!token || !subscriptionId || !givenId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Token format sanity check — Moyasar tokens are short opaque strings.
    // Reject anything that smells like raw card data so it's never logged.
    if (/\d{12}/.test(token) || token.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid token format" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Subscription ownership + state validation ─────────────────────────────
    const { data: sub, error: subError } = await adminClient
      .from("user_subscriptions")
      .select("id, user_id, status, plan_id, moyasar_given_id, moyasar_payment_id, moyasar_card_token, subscription_plans(slug, price_amount, price_per_seat)")
      .eq("id", subscriptionId)
      .maybeSingle();

    if (subError || !sub) {
      return new Response(JSON.stringify({ error: "Subscription not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (sub.user_id !== user.id) {
      console.error("Ownership mismatch on initiate", { sub_id: sub.id });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    if (sub.status !== "trialing" && sub.status !== "pending_activation") {
      return new Response(JSON.stringify({ error: "Subscription not awaiting payment" }), {
        status: 409,
        headers: corsHeaders,
      });
    }

    if (sub.moyasar_given_id !== givenId) {
      console.error("given_id mismatch", { sub_id: sub.id });
      return new Response(JSON.stringify({ error: "Stale payment session" }), {
        status: 409,
        headers: corsHeaders,
      });
    }

    if (sub.moyasar_payment_id) {
      return new Response(JSON.stringify({ error: "Payment already initiated for this subscription" }), {
        status: 409,
        headers: corsHeaders,
      });
    }

    // ── FOUNDING10 promo re-validation (server-side authority) ───────────────
    // Promo is honored only when: code matches, campaign window open,
    // subscription's plan is the flat Pro plan (price_per_seat is NULL).
    const planRow = (sub as any)?.subscription_plans;
    const planIsPro = planRow?.slug === FOUNDING10_PLAN_SLUG;
    const planIsFlat = planRow?.price_per_seat == null;
    const founding10Active =
      isFounding10Code(rawPromoCode) &&
      isFounding10Active() &&
      planIsPro &&
      planIsFlat;
    const chargeAmount = founding10Active ? FOUNDING10_FIRST_CHARGE_HALALAS : 100;
    const chargeDescription = founding10Active
      ? "ConsultX Pro — Founding Engineers first month"
      : "ConsultX card verification";

    // ── Origin for callback_url ──────────────────────────────────────────────
    // Trust only configured app URL; fall back to request origin for dev.
    const appUrl = Deno.env.get("APP_URL") || req.headers.get("origin") || "https://www.consultx.app";
    const callbackUrl = `${appUrl.replace(/\/+$/, "")}/payment-callback`;

    // ── Create Moyasar payment from token ────────────────────────────────────
    let chargeData: any;
    let chargeOk = false;
    let chargeStatus = 0;
    try {
      const chargeResponse = await fetch("https://api.moyasar.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(moyasarSecretKey + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: chargeAmount,
          currency: "SAR",
          description: chargeDescription,
          callback_url: callbackUrl,
          source: { type: "token", token },
          metadata: {
            subscription_id: sub.id,
            given_id: givenId,
            plan_id: sub.plan_id,
            user_id: user.id,
            purpose: founding10Active ? "founding10_first_month" : "card_verification",
            ...(founding10Active ? { promo_code: FOUNDING10_CODE } : {}),
          },
        }),
      });
      chargeStatus = chargeResponse.status;
      chargeOk = chargeResponse.ok;
      chargeData = await chargeResponse.json().catch(() => ({}));
    } catch (chargeErr) {
      const msg = chargeErr instanceof Error ? chargeErr.message : String(chargeErr);
      console.error("Moyasar network error on token payment:", msg);
      return new Response(JSON.stringify({ error: "Payment provider unreachable" }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    if (!chargeOk) {
      const safeMsg = typeof chargeData?.message === "string" ? chargeData.message.slice(0, 200) : "charge_rejected";
      console.error("Moyasar charge rejected", { sub_id: sub.id, http_status: chargeStatus });
      return new Response(JSON.stringify({ error: "Payment was declined", detail: safeMsg }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const paymentId = typeof chargeData?.id === "string" ? chargeData.id : null;
    const paymentStatus = typeof chargeData?.status === "string" ? chargeData.status : "unknown";
    const transactionUrl = typeof chargeData?.source?.transaction_url === "string"
      ? chargeData.source.transaction_url
      : null;

    if (!paymentId) {
      console.error("Moyasar response missing payment id");
      return new Response(JSON.stringify({ error: "Invalid payment provider response" }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    // Safe-only logging — never log token, card data, or full provider payload.
    console.log("Token payment initiated", {
      sub_id: sub.id,
      payment_id: paymentId,
      status: paymentStatus,
      has_transaction_url: !!transactionUrl,
    });

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: paymentId,
        status: paymentStatus,
        transaction_url: transactionUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("moyasar-initiate-token-payment error:", {
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
