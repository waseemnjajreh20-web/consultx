import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeCharge, MAX_BILLABLE_SEATS } from "../_shared/billing.ts";

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
// The charged amount is decided SERVER-SIDE from the subscription
// row (see docs/launch/billing-contract-20260823.md, Section 2):
//   - inside the trial window  -> 1.00 SAR card verification,
//                                 deducted from the first invoice
//   - no active trial          -> full plan price,
//                                 activated immediately
// The client never supplies an amount.
//
// Moyasar returns either a 'paid' status (no 3DS) or 'initiated'
// with a transaction_url for 3DS redirect. The frontend redirects
// there. The webhook (moyasar-webhook) is the source of truth for
// activation; this function only kicks off the payment.
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   MOYASAR_SECRET_KEY  (Basic-auth credential for /v1/payments)
// ============================================================

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
    const promoCode = typeof body?.promo_code === "string" ? body.promo_code.trim() : null;
    // Defect C1. The plan/seats the customer is buying are NOT written onto a
    // live `trialing` / `past_due` row before payment (see
    // moyasar-create-subscription). The client echoes back the quote it was
    // issued; it is re-validated and re-priced here, travels in the Moyasar
    // payment metadata, and is promoted onto the subscription row by
    // moyasar-webhook only when the payment is CAPTURED.
    const requestedPlanId =
      typeof body?.plan_id === "string" && body.plan_id.trim() ? body.plan_id.trim() : null;
    const requestedSeatCountRaw = body?.seat_count;

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
      .select(
        "id, user_id, status, plan_id, seat_count, trial_end, moyasar_given_id, moyasar_payment_id, moyasar_card_token",
      )
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

    // `past_due` is admitted so a customer whose card is failing can pay with a
    // new card (billing contract 5.4 previously had no working endpoint).
    if (sub.status !== "trialing" && sub.status !== "pending_activation" && sub.status !== "past_due") {
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

    // NOTE - defect C1(b): there is deliberately NO `if (sub.moyasar_payment_id)`
    // guard here any more. `user_subscriptions.moyasar_payment_id` is stamped by
    // moyasar-webhook on EVERY paid event, including the 1.00 SAR trial card
    // verification, so that guard permanently locked out any trialing row whose
    // card had already been verified - the customer could never complete a real
    // payment on that subscription again. It also never protected a real
    // in-flight payment: this endpoint writes no payment id, and a captured
    // non-trial payment moves the row to `active`, which the status check above
    // already rejects. The replacement guards (already-captured + recent
    // duplicate attempt) live below, once the flow is known.

    // ── Origin for callback_url ──────────────────────────────────────────────
    // Trust only configured app URL; fall back to request origin for dev.
    const appUrl = Deno.env.get("APP_URL") || req.headers.get("origin") || "https://www.consultx.app";
    const callbackUrl = `${appUrl.replace(/\/+$/, "")}/payment-callback`;

    // ── card_verified_at is only present after the Section 8 migration ────────
    // Read it separately and tolerate its absence so the credit is applied as
    // soon as the column exists, without breaking before it does.
    let cardVerifiedAt: string | null = null;
    {
      const { data: verifiedRow, error: verifiedErr } = await adminClient
        .from("user_subscriptions")
        .select("card_verified_at")
        .eq("id", sub.id)
        .maybeSingle();
      if (!verifiedErr && verifiedRow) {
        cardVerifiedAt = (verifiedRow as any).card_verified_at ?? null;
      }
    }

    // ── Server-side charge decision ──────────────────────────────────────────
    // The amount is derived from the subscription + plan rows. Client input is
    // limited to the promo code, and promos apply to immediate charges only.
    const chargePlanId: string = requestedPlanId ?? sub.plan_id;

    // A plan the customer is switching TO must still be on sale. The plan
    // already stored on the row is looked up without that filter so an existing
    // subscriber on a retired plan can still pay.
    let planQuery = adminClient
      .from("subscription_plans")
      .select("id, slug, name_en, currency, price_amount, price_per_seat, min_seats, duration_days")
      .eq("id", chargePlanId);
    if (chargePlanId !== sub.plan_id) planQuery = planQuery.eq("is_active", true);
    const { data: planRow } = await planQuery.maybeSingle();

    if (!planRow) {
      console.error("Plan not found for subscription", { sub_id: sub.id });
      return new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // -- Seat count for THIS charge ------------------------------------------
    const isPerSeatPlan = (planRow as any).price_per_seat != null;
    const minSeatsRaw = Math.floor(Number((planRow as any).min_seats ?? 1));
    const minSeats = Number.isFinite(minSeatsRaw) && minSeatsRaw >= 1 ? minSeatsRaw : 1;
    const storedSeats = Math.floor(Number(sub.seat_count ?? 1));
    let chargeSeatCount = Number.isFinite(storedSeats) && storedSeats >= 1 ? storedSeats : 1;

    if (requestedSeatCountRaw !== undefined && requestedSeatCountRaw !== null) {
      const n = Number(requestedSeatCountRaw);
      if (!Number.isInteger(n) || n < 1 || n > MAX_BILLABLE_SEATS) {
        return new Response(
          JSON.stringify({ error: "seat_count must be an integer between 1 and " + MAX_BILLABLE_SEATS }),
          { status: 400, headers: corsHeaders },
        );
      }
      if (isPerSeatPlan && n < minSeats) {
        return new Response(
          JSON.stringify({ error: "seat_count must be at least " + minSeats + " for this plan" }),
          { status: 400, headers: corsHeaders },
        );
      }
      chargeSeatCount = n;
    }
    // Flat plans always bill one seat; per-seat plans never bill below min_seats.
    chargeSeatCount = isPerSeatPlan ? Math.max(chargeSeatCount, minSeats) : 1;

    // Promotions are for new immediate checkouts, never for repairing a failing
    // card on an existing subscription (billing contract Section 2).
    const effectivePromoCode = sub.status === "past_due" ? null : promoCode;

    // Prior non-verification captured transactions consume the 1 SAR credit.
    const { count: priorPaidCount, error: priorPaidError } = await adminClient
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.id)
      .eq("status", "captured")
      .neq("payment_type", "verification");

    if (priorPaidError) {
      // Unknown payment history means an unknown correct amount. Never guess.
      console.error("Prior-paid count failed; refusing to charge", { sub_id: sub.id });
      return new Response(JSON.stringify({ error: "Could not determine the amount to charge" }), {
        status: 503,
        headers: corsHeaders,
      });
    }

    // A captured 1.00 SAR verification is the migration-independent proof that
    // the credit is owed — card_verified_at does not exist in production until
    // the Section 8 migration is applied.
    const { count: verificationCount, error: verificationError } = await adminClient
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.id)
      .eq("status", "captured")
      .eq("payment_type", "verification");

    if (verificationError) {
      console.error("Verification count failed; refusing to charge", { sub_id: sub.id });
      return new Response(JSON.stringify({ error: "Could not determine the amount to charge" }), {
        status: 503,
        headers: corsHeaders,
      });
    }

    const decision = computeCharge(
      planRow as any,
      {
        ...(sub as any),
        seat_count: chargeSeatCount,
        card_verified_at: cardVerifiedAt,
        has_captured_verification: (verificationCount ?? 0) > 0,
      },
      effectivePromoCode,
      priorPaidCount ?? 0,
    );

    const chargeAmount = decision.amount;
    const chargeDescription = decision.description;

    // -- Double-charge guards (replace the old moyasar_payment_id check) ------
    // 1. Money already captured for a row that is still awaiting activation:
    //    charging again would take the customer's money twice. `past_due` is
    //    exempt - captured transactions from earlier periods are normal there.
    const isVerificationCharge = decision.flow === "trial_card_verification";
    if (!isVerificationCharge && sub.status !== "past_due" && (priorPaidCount ?? 0) > 0) {
      console.error("Refusing a second charge on an already-paid subscription", { sub_id: sub.id });
      return new Response(
        JSON.stringify({ error: "A payment for this subscription has already been received" }),
        { status: 409, headers: corsHeaders },
      );
    }

    // 2. Duplicate submit / double-click / retry of the same kind of charge.
    const INITIATE_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
    const dupWindowStart = new Date(Date.now() - INITIATE_DUPLICATE_WINDOW_MS).toISOString();
    let dupQuery = adminClient
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.id)
      .in("status", ["initiated", "captured"])
      .gte("created_at", dupWindowStart);
    dupQuery = isVerificationCharge
      ? dupQuery.eq("payment_type", "verification")
      : dupQuery.neq("payment_type", "verification");
    const { count: recentAttempts, error: recentAttemptsError } = await dupQuery;

    if (recentAttemptsError) {
      console.error("Duplicate-attempt check failed; refusing to charge", { sub_id: sub.id });
      return new Response(JSON.stringify({ error: "Could not verify the payment state" }), {
        status: 503,
        headers: corsHeaders,
      });
    }
    if ((recentAttempts ?? 0) > 0) {
      return new Response(
        JSON.stringify({ error: "Payment already initiated for this subscription" }),
        { status: 409, headers: corsHeaders },
      );
    }

    if (!Number.isInteger(chargeAmount) || chargeAmount <= 0) {
      console.error("Refusing to charge a non-positive amount", { sub_id: sub.id, flow: decision.flow });
      return new Response(JSON.stringify({ error: "Plan pricing is not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

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
            // The plan/seats THIS payment buys. moyasar-webhook promotes them
            // onto the subscription row when the payment is captured - never
            // before (defect C1).
            plan_id: chargePlanId,
            seat_count: chargeSeatCount,
            user_id: user.id,
            flow: decision.flow,
            purpose: decision.purpose,
            expected_amount: chargeAmount,
            amount_base: decision.base,
            amount_vat: decision.vat,
            ...(decision.appliedPromo ? { promo_code: decision.appliedPromo } : {}),
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
      promo_code: decision.appliedPromo,
      flow: decision.flow,
      amount: chargeAmount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: paymentId,
        status: paymentStatus,
        transaction_url: transactionUrl,
        // Billing contract Section 2 — lets the frontend render the honest
        // amount and the right post-payment copy without guessing.
        flow: decision.flow,
        amount: chargeAmount,
        currency: "SAR",
        amount_base: decision.base,
        amount_vat: decision.vat,
        plan_price: decision.planPrice,
        verification_credit: decision.verificationCredit,
        description: chargeDescription,
        plan_id: chargePlanId,
        seat_count: chargeSeatCount,
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
