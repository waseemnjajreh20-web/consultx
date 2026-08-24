import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type BillingFlow,
  deriveFlow,
  expectedAmountsFor,
  isUndefinedColumnError,
  OPTIONAL_SUBSCRIPTION_COLUMNS,
  OPTIONAL_TRANSACTION_COLUMNS,
  parseFlow,
  parsePaidPlanRef,
  chargeSplit,
  withoutKeys,
} from "../_shared/billing.ts";
import {
  decideActivation,
  decideExpectedAmount,
  decideTrialCancelClear,
  isDuplicateTransactionInsert,
  isOneLiveRowPerUserViolation,
  parseTimestampMs,
} from "../_shared/webhookDecisions.ts";
import { getSecretKey } from "../_shared/supabaseKeys.ts";

// Must match GRACE_DAYS in check-subscription, process-subscription-renewal,
// Workspace.tsx, and Account.tsx.
const GRACE_DAYS = 7;

// `ReturnType<typeof createClient>` resolves the DEFAULT generic instantiation,
// whose schema type is `never` — passing the real client to a helper typed that
// way fails to type-check. Instantiating with `any` matches what
// `createClient(url, key)` actually returns.
type AdminClient = ReturnType<typeof createClient<any>>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// moyasar-webhook
//
// Receives payment event notifications from Moyasar.
// Verifies the X-Moyasar-Signature header (HMAC-SHA256,
// Base64-encoded) before any DB access.
//
// Looks up the target subscription via metadata.subscription_id
// (set server-side when the payment was created).
//
// The state transition is decided by metadata.flow, read from the
// RE-VERIFIED payment fetched from the Moyasar API — never from the
// webhook body and never from client input:
//   trial_card_verification -> stay trialing, store the token, stamp
//                              card_verified_at, schedule the first
//                              charge for trial_end
//   immediate_charge /
//   post_trial_first_charge /
//   renewal                 -> active, new period, next_billing_date
// Payments created before this change carry no flow; the flow is then
// derived from the subscription row. See
// docs/launch/billing-contract-20260823.md
//
// RETURN-PATH CLASSIFICATION (M10). Every exit from this handler is one of:
//
//   TRANSIENT  — the SAME event could succeed on a later delivery, because what
//                failed was our ability to reach an answer (network, upstream
//                5xx, 401/403/429 from Moyasar, an unreadable response body, a
//                database read or write that errored).
//                => non-2xx so Moyasar redelivers. A deduped dead letter is
//                   written whenever money is already captured, so a failure
//                   that outlives the redelivery window is still visible.
//
//   PERMANENT  — we DID reach an answer and rejected it (amount mismatch,
//                expected_amount mismatch, currency mismatch, id / status /
//                subscription mismatch, verification 404, unknown subscription,
//                activation refused after cancellation). Redelivering replays
//                the same comparison against the same facts and reaches the
//                same refusal.
//                => 200 so Moyasar stops, ALWAYS with a deduped dead letter so
//                   a human sees it. A permanent refusal with no dead letter is
//                   a silent loss and is never acceptable.
//
// The dividing line is deliberately "did we obtain the authority's answer?",
// not "did something go wrong?": a 429 and a 404 are both 4xx, but only one of
// them is a property of the payment.
//
// Required secrets:
//   MOYASAR_WEBHOOK_SECRET — from Moyasar Dashboard webhook config
//   SUPABASE_URL, plus the service-role key resolved via
//   _shared/supabaseKeys.ts (SUPABASE_SECRET_KEYS when configured, else the
//   legacy SUPABASE_SERVICE_ROLE_KEY)
// Optional secrets:
//   RESEND_API_KEY, FROM_EMAIL — for dunning emails on failure
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Signature verification (HMAC-SHA256, Base64) ──────────────────────────
    const webhookSecret = Deno.env.get("MOYASAR_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("MOYASAR_WEBHOOK_SECRET not configured — cannot verify webhook");
      return new Response(JSON.stringify({ error: "Webhook verification unavailable" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const receivedSignature = req.headers.get("X-Moyasar-Signature");
    if (!receivedSignature) {
      console.error("Webhook rejected: missing X-Moyasar-Signature header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const bodyText = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      console.error("Webhook rejected: invalid JSON body");
      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(bodyText));
    const computedSignature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    if (computedSignature !== receivedSignature) {
      console.error("Webhook rejected: signature mismatch");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    console.log("Webhook signature verified");
    // ── End signature verification ────────────────────────────────────────────

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = getSecretKey();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Moyasar payment event payload shape:
    //   { id, status, amount, currency, source: { token, card_number, ... }, metadata }
    const paymentId = payload.id;
    const status = payload.status; // "paid" | "failed" | "initiated" | "authorized"
    const subscriptionId: string | null = payload.metadata?.subscription_id ?? null;

    console.log("Moyasar webhook received:", {
      payment_id: paymentId,
      status,
      subscription_id: subscriptionId,
    });

    if (!paymentId) {
      // M10 — PERMANENT. The payload is authentic (the signature passed) but
      // carries no payment id, so nothing can ever be looked up, matched or
      // re-verified from it. This used to return 400, which asks Moyasar to
      // redeliver an event that can never be processed and left ops nothing to
      // look at. Ack it and record it instead.
      console.error("Webhook payload missing payment ID");
      await insertDeadLetter(adminClient, {
        paymentId: null,
        moyasarStatus: typeof status === "string" ? status : "unknown",
        reason: "missing_payment_id",
        payload,
      });
      return new Response(JSON.stringify({ message: "Missing payment ID" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ── Only process terminal states ──────────────────────────────────────────
    if (status !== "paid" && status !== "failed") {
      console.log(`Webhook: ignoring non-terminal status '${status}' for payment ${paymentId}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (!subscriptionId) {
      console.error("Webhook payload missing metadata.subscription_id — cannot route event");
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "missing_subscription_id",
        payload,
      });
      return new Response(JSON.stringify({ message: "No subscription_id in metadata" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ── Find subscription ─────────────────────────────────────────────────────
    const { data: sub, error: subLookupError } = await adminClient
      .from("user_subscriptions")
      .select("*, subscription_plans(duration_days, slug, currency, price_amount, price_per_seat, min_seats)")
      .eq("id", subscriptionId)
      .maybeSingle();

    if (subLookupError) {
      console.error("Subscription lookup error:", subLookupError.message);
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "lookup_error",
        payload,
      });
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!sub) {
      console.error("Subscription not found for payment:", paymentId, "sub_id:", subscriptionId);
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "subscription_not_found",
        payload,
      });
      return new Response(JSON.stringify({ message: "Subscription not found" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ── Find or create payment_transactions row ───────────────────────────────
    // Look up by moyasar_payment_id for idempotency on duplicate delivery.
    // NOTE: payment_type MUST be selected here — the renewal-vs-verification
    // branches below read it. It was previously omitted from the select, so
    // `existingTx.payment_type` was always undefined and every renewal webhook
    // was validated against the 1 SAR verification rule and dead-lettered.
    const { data: existingTx } = await adminClient
      .from("payment_transactions")
      .select("id, status, payment_type, created_at")
      .eq("moyasar_payment_id", paymentId)
      .maybeSingle();

    if (existingTx?.status === "captured" && status === "paid") {
      // Defect C2. A captured transaction is only a genuine no-op when the
      // subscription ACTUALLY reached the state that payment was supposed to
      // produce. The transaction row is written BEFORE the subscription update,
      // so an activation that failed (for example on the
      // `user_subscriptions_one_live_row_per_user` unique index) left a
      // captured transaction beside a subscription that never activated — and
      // this early ack then swallowed every Moyasar redelivery, making the
      // dead-letter + non-2xx retry below useless.
      //
      // Re-applying is bounded to Moyasar's own retry window so an ancient
      // redelivery can never resurrect a closed period.
      const REPROCESS_WINDOW_MS = 24 * 60 * 60 * 1000;
      const txCreatedAt = (existingTx as any).created_at;
      const txAgeMs = txCreatedAt ? Date.now() - Date.parse(txCreatedAt) : Number.NaN;
      const withinRetryWindow = Number.isFinite(txAgeMs) && txAgeMs >= 0 && txAgeMs < REPROCESS_WINDOW_MS;

      // States that mean "this subscription is still waiting for money to land".
      const awaitingActivation = sub.status === "pending_activation" || sub.status === "past_due";
      // A captured verification whose card token never made it onto the row.
      const verificationUnapplied =
        (existingTx as any).payment_type === "verification" &&
        sub.status === "trialing" &&
        !(sub as any).moyasar_card_token;

      if (!withinRetryWindow || (!awaitingActivation && !verificationUnapplied)) {
        console.log(`Idempotent paid: payment ${paymentId} already processed — ack without reprocessing`);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: corsHeaders,
        });
      }

      console.warn(
        `Payment ${paymentId} is captured but subscription ${sub.id} is still '${sub.status}' — ` +
        `re-applying the state transition (defect C2)`,
      );
    }

    // ── Independent Moyasar API re-verification ───────────────────────────────
    // Never trust the webhook payload alone. Re-fetch the canonical payment
    // from Moyasar and compare critical fields before any DB activation.
    const moyasarSecretKey = Deno.env.get("MOYASAR_SECRET_KEY");
    if (!moyasarSecretKey) {
      // R4-HIGH-3. Transient (a missing secret is fixed by configuring it, and
      // Moyasar will redeliver), but the event concerns a payment that may
      // already be CAPTURED, and this file's own invariant is that no captured
      // payment leaves without a trace. A misconfigured function would otherwise
      // 500 silently for as long as the secret is missing, and once Moyasar
      // exhausts its retries the capture is gone with nothing recorded anywhere.
      console.error("MOYASAR_SECRET_KEY not configured — cannot re-verify payment");
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_secret_missing",
        payload,
      });
      return new Response(JSON.stringify({ error: "Verification unavailable" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    let verifyResponse: Response;
    try {
      verifyResponse = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${btoa(moyasarSecretKey + ":")}`,
        },
      });
    } catch (verifyNetErr) {
      // R4-HIGH-3. Transient, and redelivery is the right answer — but the
      // deduped letter is what makes a sustained outage visible instead of a
      // silent run of 500s against captured payments.
      console.error(
        "Moyasar re-verification network error:",
        verifyNetErr instanceof Error ? verifyNetErr.message : String(verifyNetErr),
      );
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_network_error",
        payload,
      });
      return new Response(JSON.stringify({ error: "Verification network error" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (verifyResponse.status >= 400 && verifyResponse.status < 500) {
      // M10 — not every 4xx is permanent. 401/403 mean OUR credential is wrong
      // (rotated, unset, mis-scoped) and 408/429 mean the request was refused
      // for pace, not for content: none of those is a property of the payment,
      // and acking them would silently strand every captured payment for the
      // whole duration of the outage. Redelivery genuinely helps, so they are
      // TRANSIENT. Everything else in the 4xx range (404 unknown payment, 400 /
      // 422 malformed id) is a decided answer about this payment and can never
      // change on redelivery — PERMANENT.
      const transientVerify =
        verifyResponse.status === 401 ||
        verifyResponse.status === 403 ||
        verifyResponse.status === 408 ||
        verifyResponse.status === 429;

      console.error("Moyasar re-verification 4xx:", verifyResponse.status, {
        classification: transientVerify ? "transient" : "permanent",
      });
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: transientVerify
          ? "verification_api_auth_or_rate_limited"
          : "verification_api_error_4xx",
        payload,
      });

      if (transientVerify) {
        return new Response(JSON.stringify({ error: "Verification temporarily refused" }), {
          status: 500,
          headers: corsHeaders,
        });
      }
      return new Response(JSON.stringify({ message: "Verification failed (4xx)" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (verifyResponse.status >= 500) {
      // R4-HIGH-3. Same reasoning as the two paths above, and the structurally
      // identical invalid-JSON path below already did this — the omission here
      // was an inconsistency, not a decision.
      console.error("Moyasar re-verification 5xx:", verifyResponse.status);
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_api_error_5xx",
        payload,
      });
      return new Response(JSON.stringify({ error: "Verification upstream error" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    let verifiedPayment: any;
    try {
      verifiedPayment = await verifyResponse.json();
    } catch {
      // M10 — TRANSIENT. A 2xx whose body does not parse means we never got the
      // authority's answer at all (an edge/proxy error page, a truncated
      // response). Nothing about THIS payment was decided, so acking it would
      // discard a possibly captured payment on the strength of one bad read.
      // The dead letter is still written — deduped, so an outage produces one
      // row per payment, not one row per redelivery — so a failure that outlives
      // Moyasar's retry window is still visible to ops.
      console.error("Moyasar re-verification: invalid JSON (transient — will be redelivered)");
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_invalid_json",
        payload,
      });
      return new Response(JSON.stringify({ error: "Verification parse error" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Compare critical fields between verified payment and event/local sub.
    //
    // The CURRENCY comparison is deliberately not here. Under Section 12.1 a
    // payment may legitimately be for a different plan than the one stored on
    // the row, and that plan can sit on the other side of a currency boundary.
    // The currency must therefore be checked against the plan actually PAID
    // FOR, which is only resolved further down — see the currency block just
    // before the amount validation. Nothing between here and there reads the
    // currency.
    if (verifiedPayment?.id !== paymentId) {
      console.error("Re-verification mismatch: payment id");
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_id_mismatch",
        payload,
      });
      return new Response(JSON.stringify({ message: "Verification mismatch" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (verifiedPayment?.status !== status) {
      console.error("Re-verification mismatch: status");
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_status_mismatch",
        payload,
      });
      return new Response(JSON.stringify({ message: "Verification mismatch" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (verifiedPayment?.metadata?.subscription_id !== sub.id) {
      console.error("Re-verification mismatch: subscription_id");
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_subscription_mismatch",
        payload,
      });
      return new Response(JSON.stringify({ message: "Verification mismatch" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ── Flow-aware amount validation ─────────────────────────────────────────
    // `metadata` comes from the re-fetched Moyasar payment, not from the
    // webhook body and never from client input, so it is trustworthy. If a
    // payment predates this change it has no `flow`; fall back to deriving the
    // flow from the database row (or from the local transaction type).
    const verifiedPromoCode = verifiedPayment?.metadata?.promo_code ?? null;
    const nowMs = Date.now();
    const localTxType = (existingTx as any)?.payment_type ?? null;

    const flow: BillingFlow =
      parseFlow(verifiedPayment?.metadata?.flow) ??
      (localTxType === "renewal" ? "renewal" : deriveFlow(sub as any, nowMs));

    // -- Plan / seats this payment was actually created FOR (defect C1) ------
    // moyasar-create-subscription no longer writes a requested plan/seat change
    // onto a live `trialing` / `past_due` row: an abandoned checkout used to
    // leave the row escalated and the cron then billed the escalated price on
    // the stored card without the customer ever paying for it. The request now
    // rides in the payment metadata (written server-side by
    // moyasar-initiate-token-payment, re-read here from the RE-VERIFIED
    // payment) and is promoted onto the row further down, only on capture.
    const paidPlanRef = parsePaidPlanRef(verifiedPayment?.metadata);
    let paidPlanRow: any = (sub as any)?.subscription_plans ?? null;
    let promotePlanId: string | null = null;
    let promoteSeatCount: number | null = null;
    let planRefUsable = true;

    if (paidPlanRef.plan_id && paidPlanRef.plan_id !== (sub as any).plan_id) {
      const { data: switchedPlan } = await adminClient
        .from("subscription_plans")
        .select("id, slug, name_en, currency, price_amount, price_per_seat, min_seats, duration_days")
        .eq("id", paidPlanRef.plan_id)
        .maybeSingle();
      if (switchedPlan) {
        paidPlanRow = switchedPlan;
        promotePlanId = paidPlanRef.plan_id;
      } else {
        // Metadata names a plan that no longer exists. Ignore the whole
        // reference and fall back to the plan stored on the row.
        planRefUsable = false;
        console.error("Paid-plan metadata names an unknown plan", { sub_id: sub.id });
      }
    }
    if (planRefUsable && paidPlanRef.seat_count != null && paidPlanRef.seat_count !== (sub as any).seat_count) {
      promoteSeatCount = paidPlanRef.seat_count;
    }

    // ── Currency of the plan ACTUALLY paid for ───────────────────────────────
    // This check used to sit above, reading `sub.subscription_plans.currency` —
    // the plan stored on the ROW. Under Section 12.1 the payment may be for a
    // different plan (`paidPlanRow`, resolved just above), so a plan switch
    // across a currency boundary was validated against the wrong plan: the
    // stored plan's currency was accepted while the amount was then validated
    // against the NEW plan's prices, i.e. 245.00 of one currency compared with
    // a price expressed in another.
    //
    // Order matters and is load-bearing: this must stay AFTER `paidPlanRow` is
    // resolved and BEFORE the amount validation below, because comparing
    // integer halalas only means anything once the currency is known to match.
    // Nothing between the plan resolution above and this point reads the
    // currency.
    //
    // Fail-closed: an unexpected currency is a decided answer about this
    // payment (PERMANENT) — deduped dead letter plus 200.
    const expectedCurrency =
      paidPlanRow?.currency || (sub as any)?.subscription_plans?.currency || "SAR";

    if (verifiedPayment?.currency !== expectedCurrency) {
      console.error("Re-verification mismatch: currency", {
        expected: expectedCurrency,
        got: verifiedPayment?.currency ?? null,
      });
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_currency_mismatch",
        payload,
      });
      return new Response(JSON.stringify({ message: "Verification mismatch" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ── M13: the amount the SERVER committed to when it created the payment ──
    // Contract Section 7 writes `metadata.expected_amount` on every payment this
    // codebase creates (moyasar-initiate-token-payment and
    // process-subscription-renewal), always next to `metadata.flow`. Nothing
    // read it back, so the server's own intent was never verified.
    //
    // This is IN ADDITION to the `expectedAmountsFor` validation below, not a
    // replacement: `expected_amount` proves the captured amount is what THIS
    // payment was created for, `expectedAmountsFor` proves it is what the plan
    // is worth NOW. A payment can satisfy either one alone and still be wrong.
    //
    // Payments with no `metadata.flow` predate this scheme and carry no
    // `expected_amount` either; they are skipped exactly as the flow-derivation
    // fallback above skips them, so no legacy payment is stranded.
    const expectedAmountDecision = decideExpectedAmount({
      rawFlow: verifiedPayment?.metadata?.flow,
      rawExpectedAmount: verifiedPayment?.metadata?.expected_amount,
      verifiedAmount: verifiedPayment?.amount,
    });

    if (!expectedAmountDecision.ok) {
      // PERMANENT: the amount captured is not the amount the server intended.
      // No redelivery can change either number.
      console.error("Re-verification mismatch: expected_amount", {
        reason: expectedAmountDecision.reason,
        expected: expectedAmountDecision.expected,
        got: verifiedPayment?.amount ?? null,
        flow,
      });
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: expectedAmountDecision.reason,
        payload,
      });
      return new Response(JSON.stringify({ message: "Verification mismatch" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Validate the amount against the plan/seats actually paid for, not against
    // whatever is currently stored on the row.
    const subForAmount = promoteSeatCount != null
      ? { ...(sub as any), seat_count: promoteSeatCount }
      : (sub as any);
    const allowedAmounts = expectedAmountsFor(paidPlanRow, subForAmount, flow, verifiedPromoCode);
    const verifiedAmountRaw = verifiedPayment?.amount;

    if (
      typeof verifiedAmountRaw !== "number" ||
      (allowedAmounts.length > 0 && !allowedAmounts.includes(verifiedAmountRaw))
    ) {
      console.error("Re-verification mismatch: amount", { flow, allowed: allowedAmounts });
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_amount_mismatch",
        payload,
      });
      return new Response(JSON.stringify({ message: "Verification mismatch" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const isRenewalTx = flow === "renewal" || flow === "post_trial_first_charge" || localTxType === "renewal";

    // Optional given_id check.
    const verifiedGivenId = verifiedPayment?.metadata?.given_id;
    const localGivenId = (sub as any)?.moyasar_given_id;
    if (verifiedGivenId && localGivenId && verifiedGivenId !== localGivenId) {
      console.error("Re-verification mismatch: given_id");
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "verification_given_id_mismatch",
        payload,
      });
      return new Response(JSON.stringify({ message: "Verification mismatch" }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    console.log("Webhook re-verification passed");

    // Use the verified payment from here on — never the raw webhook payload.
    const moyasarCardToken = verifiedPayment?.source?.token ?? null;
    const moyasarCardBrand = verifiedPayment?.source?.company ?? null;
    const moyasarCardLastFour = extractLastFour(verifiedPayment?.source?.number) ?? null;
    const verifiedAmount: number = verifiedAmountRaw;
    const verifiedCurrency = verifiedPayment?.currency ?? "SAR";
    // ── End re-verification ───────────────────────────────────────────────────

    const mappedStatus = status === "paid" ? "captured" : "failed";

    // The seller is NOT VAT-registered: no tax component is charged, so the
    // whole amount is recorded as base and amount_vat is 0.
    const vatSplit = chargeSplit(verifiedAmount);

    // payment_type mirrors the flow so the renewal machinery and the
    // "has this subscription ever been really paid?" checks stay correct.
    const txPaymentType =
      flow === "trial_card_verification" ? "verification"
      : flow === "renewal" || flow === "post_trial_first_charge" ? "renewal"
      : "subscription";

    // ── Persist the transaction row ──────────────────────────────────────────
    // M10. This write used to be best-effort: a failure was console.error'd and
    // the run continued straight into activation. On a `paid` event that is
    // money captured with NO transaction row — and every downstream counter
    // reads this table: `priorPaidCount` (whether the 1.00 SAR verification
    // credit was already consumed), the renewal idempotency guards,
    // `has_captured_verification`, and the C3 retry cap's `failedCount`. A lost
    // `paid` row re-grants a consumed credit and re-opens an already-settled
    // invoice; a lost `failed` row resets the retry cap to zero and returns the
    // system to re-charging a declining card on every cron tick.
    //
    // TRANSIENT: a database write error is not a property of the payment, and
    // reprocessing is safe — the paid path is idempotent through `existingTx`,
    // and the failed path re-marks `past_due` idempotently with an atomic
    // dunning claim. So: deduped dead letter, then non-2xx so Moyasar
    // redelivers. Nothing below this point runs on a failed write.
    let txWriteError: any = null;

    if (!existingTx) {
      // Insert transaction row (first delivery)
      const txInsert: Record<string, any> = {
        user_id: sub.user_id,
        subscription_id: sub.id,
        moyasar_payment_id: paymentId,
        amount: verifiedAmount,
        amount_base: vatSplit.base,
        amount_vat: vatSplit.vat,
        currency: verifiedCurrency,
        status: mappedStatus,
        payment_type: txPaymentType,
      };
      const { error: txErr } = await adminClient.from("payment_transactions").insert(txInsert);
      if (txErr && isUndefinedColumnError(txErr)) {
        // Section 8 migration not applied yet — persist without the split columns.
        const retryTx = await adminClient
          .from("payment_transactions")
          .insert(withoutKeys(txInsert, OPTIONAL_TRANSACTION_COLUMNS));
        // The retry's own error was previously discarded, so a real insert
        // failure hiding behind a missing column was invisible.
        txWriteError = retryTx.error ?? null;
      } else if (txErr) {
        txWriteError = txErr;
      }
      if (txWriteError) {
        console.error("payment_transactions insert failed:", txWriteError.message);
      }
    } else {
      // Update existing row
      const txUpdate: Record<string, any> = {
        status: mappedStatus,
        amount_base: vatSplit.base,
        amount_vat: vatSplit.vat,
      };
      const { error: txUpdErr } = await adminClient
        .from("payment_transactions")
        .update(txUpdate)
        .eq("id", existingTx.id);
      if (txUpdErr && isUndefinedColumnError(txUpdErr)) {
        const retryTx = await adminClient
          .from("payment_transactions")
          .update(withoutKeys(txUpdate, OPTIONAL_TRANSACTION_COLUMNS))
          .eq("id", existingTx.id);
        txWriteError = retryTx.error ?? null;
      } else if (txUpdErr) {
        txWriteError = txUpdErr;
      }
      if (txWriteError) {
        console.error("payment_transactions update failed:", txWriteError.message);
      }
    }

    if (txWriteError && isDuplicateTransactionInsert(txWriteError)) {
      // The ONE transaction-write error that is not a failure to persist: a
      // concurrent delivery of this same event inserted the row microseconds
      // earlier (the `existingTx` lookup runs before the insert, so two
      // overlapping deliveries can both see "no row" and both try). The row
      // exists, that delivery owns the rest of the processing, and this one has
      // nothing left to do. Acking it keeps the pair from ping-ponging
      // redeliveries at each other, and files no misleading dead letter.
      console.warn(
        `payment_transactions row for ${paymentId} was written by a concurrent delivery — ` +
        `acking this duplicate without reprocessing`,
      );
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (txWriteError) {
      // See the note above this block: the transaction row is load-bearing for
      // the credit, idempotency and retry-cap logic, so a failed write must not
      // be followed by an activation that pretends it succeeded.
      await insertDeadLetter(adminClient, {
        paymentId,
        moyasarStatus: status,
        reason: "transaction_write_failed",
        payload,
      });
      return new Response(JSON.stringify({ error: "Transaction write failed" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // ── Handle paid event ────────────────────────────────────────────────────
    if (status === "paid") {
      const updateData: Record<string, any> = {};

      if (moyasarCardToken) {
        updateData.moyasar_card_token = moyasarCardToken;
      }
      if (moyasarCardBrand) updateData.card_brand = moyasarCardBrand;
      if (moyasarCardLastFour) updateData.card_last_four = moyasarCardLastFour;
      updateData.moyasar_payment_id = paymentId;

      // Defect C1: promote the plan/seats this payment actually bought. This is
      // the ONLY place a plan or seat escalation may land on a live
      // subscription row, so an abandoned checkout can never arm a larger
      // unattended charge.
      if (promotePlanId) updateData.plan_id = promotePlanId;
      if (promoteSeatCount != null) updateData.seat_count = promoteSeatCount;

      const now = new Date();
      const trialEndDate = sub.trial_end ? new Date(sub.trial_end) : null;
      const durationDays = paidPlanRow?.duration_days || 30;
      const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      if (flow === "trial_card_verification") {
        // 1.00 SAR card verification. The card token and the verification stamp
        // are always safe to record.
        updateData.card_verified_at = now.toISOString();

        if (sub.status === "trialing") {
          // Normal case: still inside the trial. Stay trialing and schedule the
          // first real charge for the moment the trial ends.
          updateData.status = "trialing";
          if (trialEndDate) updateData.next_billing_date = trialEndDate.toISOString();
          updateData.past_due_since = null;
          updateData.dunning_notified_at = null;

          // A scheduled end-of-trial cancellation is withdrawn ONLY here, and
          // only for a verification payment created AFTER that cancellation and
          // still inside the resubscribe window. Without this, a customer who
          // cancelled during the trial and then checked out again paid a second
          // 1.00 SAR while the row stayed scheduled to close (the renewal
          // conversion passes filter on `cancel_at_period_end = false`).
          //
          // The guard is the same discriminator R3-C2 uses, so the
          // 09:00-payment / 09:02-cancel / 09:05-webhook race can NEVER
          // un-cancel anything. `cancelled_at` is deliberately left in place as
          // the historical stamp; nothing reads it once
          // `cancel_at_period_end` is false (decideActivation returns ALLOW
          // before it looks at the timestamp).
          const trialCancelClear = decideTrialCancelClear({
            subStatus: (sub as any).status ?? null,
            cancelAtPeriodEnd: (sub as any).cancel_at_period_end ?? null,
            cancelledAtMs: parseTimestampMs((sub as any).cancelled_at),
            paymentCreatedAtMs: parseTimestampMs(verifiedPayment?.created_at),
            nowMs: now.getTime(),
          });

          if (trialCancelClear.clear) {
            updateData.cancel_at_period_end = false;
            console.log(
              `Card verified AFTER a trial cancellation — withdrawing the scheduled ` +
              `cancellation for sub ${sub.id} (payment ${paymentId})`,
            );
          } else if (trialCancelClear.reason !== "nothing_to_clear") {
            // Money captured against a trial that is still scheduled to close.
            // PERMANENT (the timestamps will not change on redelivery), so the
            // event is still acked below — but ops gets one deduped letter so
            // the 1.00 SAR can be judged and refunded if it was a resubscribe
            // we could not prove.
            console.warn(
              `Verification paid on a cancelled trial ${sub.id} — cancellation NOT withdrawn ` +
              `(${trialCancelClear.reason}); payment ${paymentId}`,
            );
            await insertDeadLetter(adminClient, {
              paymentId,
              moyasarStatus: status,
              reason: "verification_paid_on_cancelled_trial",
              payload: {
                event: payload,
                context: {
                  note:
                    "1.00 SAR card verification captured for a trial that is scheduled to end. " +
                    "The cancellation was left in place. Refund or re-arm manually.",
                  decision: trialCancelClear.reason,
                  moyasar_payment_id: paymentId,
                  payment_created_at: verifiedPayment?.created_at ?? null,
                  subscription_id: sub.id,
                  user_id: sub.user_id,
                  cancelled_at: (sub as any).cancelled_at ?? null,
                  trial_end: (sub as any).trial_end ?? null,
                },
              },
            });
          }

          console.log("Payment paid — card verified, trial continues:", sub.id);
        } else {
          // A late/retried delivery of the FIRST verification webhook, arriving
          // after the renewal cron already converted this subscription (or after
          // it was cancelled/expired). Writing status = "trialing" here would
          // demote a paying customer back into a trial and set next_billing_date
          // to a date in the past, so the conversion pass would charge them the
          // full plan price a second time. Lifecycle stays untouched.
          console.warn(
            `Late trial_card_verification webhook for sub ${sub.id} in status ${sub.status} — ` +
            `card recorded, subscription lifecycle left untouched`,
          );
        }
      } else {
        // immediate_charge / post_trial_first_charge / renewal — a real
        // invoice was paid.
        //
        // R3-C2. Before activating, re-read the CURRENT lifecycle state. The
        // renewal cron can create a charge at 09:00, the customer can cancel at
        // 09:02, and this webhook can land at 09:05 — activating here would
        // revive a subscription the customer already ended and keep the money.
        // A deliberate resubscribe (a fresh `immediate_charge` created AFTER the
        // cancellation) is still allowed through. See _shared/webhookDecisions.ts.
        const activation = decideActivation({
          subStatus: (sub as any).status ?? null,
          cancelAtPeriodEnd: (sub as any).cancel_at_period_end ?? null,
          cancelledAtMs: parseTimestampMs((sub as any).cancelled_at),
          flow,
          paymentCreatedAtMs: parseTimestampMs(verifiedPayment?.created_at),
          nowMs: now.getTime(),
        });

        if (!activation.activate) {
          // Money is captured (the payment_transactions row above already
          // records it) but the customer is not entitled to a new period.
          // This state is FINAL, not transient: return 200 so Moyasar stops
          // redelivering, and leave a dead letter a human can refund from.
          console.error(
            `Refusing to activate cancelled subscription ${sub.id} from payment ${paymentId} ` +
            `(flow=${flow}, status=${(sub as any).status}, ` +
            `cancel_at_period_end=${(sub as any).cancel_at_period_end}) — REFUND REQUIRED`,
          );
          await insertDeadLetter(adminClient, {
            paymentId,
            moyasarStatus: status,
            reason: "paid_after_cancel",
            payload: {
              event: payload,
              refund_context: {
                note: "Captured payment for a cancelled/ending subscription. Activation refused. Refund the customer.",
                moyasar_payment_id: paymentId,
                payment_created_at: verifiedPayment?.created_at ?? null,
                amount: verifiedAmount,
                currency: verifiedCurrency,
                flow,
                subscription_id: sub.id,
                user_id: sub.user_id,
                subscription_status: (sub as any).status ?? null,
                cancel_at_period_end: (sub as any).cancel_at_period_end ?? null,
                cancelled_at: (sub as any).cancelled_at ?? null,
                trial_end: (sub as any).trial_end ?? null,
                current_period_end: (sub as any).current_period_end ?? null,
              },
            },
          });
          return new Response(
            JSON.stringify({ message: "Activation refused: subscription cancelled" }),
            { status: 200, headers: corsHeaders },
          );
        }

        // Activate and open a new billing period.
        updateData.status = "active";
        // A real invoice was paid on a row that the guard above cleared, so any
        // pending end-of-period cancellation is superseded by this purchase.
        updateData.cancel_at_period_end = false;
        updateData.current_period_start = now.toISOString();
        updateData.current_period_end = periodEnd.toISOString();
        updateData.next_billing_date = periodEnd.toISOString();
        updateData.past_due_since = null;
        updateData.dunning_notified_at = null;
        console.log(`Payment paid — activating subscription (${flow}):`, sub.id);
      }

      let { error: subUpdateError } = await adminClient
        .from("user_subscriptions")
        .update(updateData)
        .eq("id", sub.id);

      if (subUpdateError && isUndefinedColumnError(subUpdateError)) {
        // Section 8 migration not applied yet — retry without card_verified_at.
        const retry = await adminClient
          .from("user_subscriptions")
          .update(withoutKeys(updateData, OPTIONAL_SUBSCRIPTION_COLUMNS))
          .eq("id", sub.id);
        subUpdateError = retry.error;
      }

      if (
        subUpdateError &&
        isOneLiveRowPerUserViolation(subUpdateError) &&
        updateData.status === "active"
      ) {
        // M17. The predicate is `isOneLiveRowPerUserViolation`, NOT the generic
        // `isUniqueViolationError`: what follows EXPIRES other subscription rows
        // belonging to this user, and that is only ever the right response to a
        // violation of `user_subscriptions_one_live_row_per_user`. Any other
        // 23505 — from an existing index or one added by a later migration —
        // would have destroyed live rows for a reason that had nothing to do
        // with them. An unrecognised violation now falls through to the
        // `subscription_update_failed_on_paid` path below: dead letter plus
        // non-2xx, which strands the payment loudly instead of deleting data
        // silently. See _shared/webhookDecisions.ts for the full reasoning.
        //
        // Defect C2. `user_subscriptions_one_live_row_per_user` is a partial
        // unique index over ('active','trialing','past_due'). A lapsed customer
        // who resubscribes gets a NEW `pending_activation` row (allowed by the
        // partial index) whose activation then collides with the live row they
        // lapsed on. The payment is already captured, so the new subscription
        // must win: retire the superseded rows and retry once. An `active` row
        // is deliberately NOT retired - that would be a genuine double
        // subscription and needs a human.
        const { data: superseded, error: supersededError } = await adminClient
          .from("user_subscriptions")
          .update({ status: "expired" })
          .eq("user_id", sub.user_id)
          .neq("id", sub.id)
          .in("status", ["trialing", "past_due"])
          .select("id");

        if (supersededError) {
          console.error("Failed to retire superseded live rows:", supersededError.message);
        } else if (superseded && superseded.length > 0) {
          console.warn(
            `Retired ${superseded.length} superseded live subscription row(s) for user ${sub.user_id} ` +
            `so captured payment ${paymentId} could activate subscription ${sub.id}`,
          );
          const retry = await adminClient
            .from("user_subscriptions")
            .update(updateData)
            .eq("id", sub.id);
          subUpdateError = retry.error;
          if (subUpdateError && isUndefinedColumnError(subUpdateError)) {
            const retryNoOptional = await adminClient
              .from("user_subscriptions")
              .update(withoutKeys(updateData, OPTIONAL_SUBSCRIPTION_COLUMNS))
              .eq("id", sub.id);
            subUpdateError = retryNoOptional.error;
          }
        }
      }

      if (subUpdateError) {
        // Defect C2. This used to be console.error'd while the handler still
        // returned 200: money captured, no subscription, no dead letter, no
        // retry. A failed activation on a PAID event is now dead-lettered AND
        // not acknowledged, so Moyasar redelivers the event.
        console.error("Failed to update subscription on paid event:", subUpdateError);
        await insertDeadLetter(adminClient, {
          paymentId,
          moyasarStatus: status,
          reason: "subscription_update_failed_on_paid",
          payload,
        });
        return new Response(JSON.stringify({ error: "Subscription update failed" }), {
          status: 500,
          headers: corsHeaders,
        });
      } else {
        // Plan slug is needed by both the profiles.plan_type sync (active path)
        // and the enterprise org auto-link (any paid path), so fetch it once.
        // It must come from the plan actually PAID FOR, not the stale row.
        const planSlug = paidPlanRow?.slug ?? (sub as any)?.subscription_plans?.slug ?? null;

        // Sync profiles.plan_type when subscription becomes active.
        if (updateData.status === "active") {
          const planType = planSlug || "engineer";
          const { error: profileError } = await adminClient
            .from("profiles")
            .update({ plan_type: planType })
            .eq("user_id", sub.user_id);

          if (profileError) {
            console.error("Failed to update profiles.plan_type:", profileError);
          } else {
            console.log(`profiles.plan_type updated to '${planType}' for user ${sub.user_id}`);
          }
        }

        // Enterprise org auto-link: only for the per-seat plans
        // (enterprise_team / enterprise_office). Legacy slug='enterprise'
        // is intentionally NOT auto-linked. Service role bypasses RLS.
        if (planSlug === "enterprise_team" || planSlug === "enterprise_office") {
          try {
            const { data: existingOrg } = await adminClient
              .from("organizations")
              .select("id, subscription_id")
              .eq("owner_user_id", sub.user_id)
              .maybeSingle();

            if (!existingOrg) {
              // Create org + owner membership, link subscription.
              const orgName = "ConsultX Enterprise Workspace";
              const { data: newOrg, error: orgErr } = await adminClient
                .from("organizations")
                .insert({
                  name: orgName,
                  owner_user_id: sub.user_id,
                  status: "active",
                  subscription_id: sub.id,
                })
                .select("id")
                .single();
              if (orgErr || !newOrg) {
                console.error("Org auto-create failed for sub", sub.id, ":", orgErr?.message);
              } else {
                const { error: memErr } = await adminClient
                  .from("org_members")
                  .insert({
                    org_id: newOrg.id,
                    user_id: sub.user_id,
                    role: "owner",
                    status: "active",
                    joined_at: new Date().toISOString(),
                  });
                if (memErr) {
                  console.error("Owner member insert failed for org", newOrg.id, ":", memErr.message);
                } else {
                  console.log(`Auto-created org ${newOrg.id} and linked to subscription ${sub.id} (${planSlug})`);
                }
              }
            } else if (existingOrg.subscription_id === null) {
              const { error: linkErr } = await adminClient
                .from("organizations")
                .update({ subscription_id: sub.id })
                .eq("id", existingOrg.id);
              if (linkErr) {
                console.error("Org link update failed for org", existingOrg.id, ":", linkErr.message);
              } else {
                console.log(`Linked existing org ${existingOrg.id} to subscription ${sub.id} (${planSlug})`);
              }
            } else if (existingOrg.subscription_id !== sub.id) {
              // Owner already has an org linked to a different subscription —
              // do not overwrite, just log a warning for ops to investigate.
              console.warn(
                `Org ${existingOrg.id} already linked to subscription ${existingOrg.subscription_id}, ` +
                `not overwriting with new subscription ${sub.id} (${planSlug})`,
              );
            } else {
              console.log(`Org ${existingOrg.id} already linked to this subscription ${sub.id} — idempotent`);
            }
          } catch (linkErr) {
            // Never let org-link failure break the webhook ack.
            console.error(
              "Enterprise org auto-link threw (non-fatal):",
              linkErr instanceof Error ? linkErr.message : String(linkErr),
            );
          }
        }
      }
    }

    // ── Handle failed event ──────────────────────────────────────────────────
    if (status === "failed") {
      console.error("Payment failed for subscription:", sub.id, "payment:", paymentId);

      // Only stamp past_due_since on renewal / post-trial-conversion failures,
      // not on verification or first-checkout failures. A failed card
      // verification means the user never subscribed — status should remain
      // pending_activation (or trialing), not past_due.
      const isRenewal = isRenewalTx;

      if (isRenewal) {
        const { data: subForFailure, error: subForFailureError } = await adminClient
          .from("user_subscriptions")
          .select("status, past_due_since")
          .eq("id", sub.id)
          .single();

        if (subForFailureError) {
          // L18. This error used to be discarded. `subForFailure` is then null,
          // every branch below is skipped, and the handler still returned 200:
          // a declined renewal that never marks the row `past_due`, never sends
          // the dunning email, and leaves the customer on full access until the
          // period end with no grace clock started and no ops signal.
          //
          // TRANSIENT: the row demonstrably exists (it was read at the top of
          // this handler); only this second read failed. Redelivery is exactly
          // what fixes it, and reprocessing is safe — the past_due write is
          // idempotent and the dunning email is claimed atomically.
          console.error(
            "Failed-event subscription re-read failed:",
            subForFailureError.message,
          );
          await insertDeadLetter(adminClient, {
            paymentId,
            moyasarStatus: status,
            reason: "failure_lookup_error",
            payload,
          });
          return new Response(JSON.stringify({ error: "Subscription lookup failed" }), {
            status: 500,
            headers: corsHeaders,
          });
        }

        // Defect C3(b). This branch used to stamp past_due_since but NEVER set
        // status, so an async decline left the row `active` with a
        // next_billing_date in the past - and the cron's active-due pass then
        // re-charged the declining card every single hour, forever. The status
        // and the stamp must move together, exactly as markPastDue does in
        // process-subscription-renewal.
        const currentStatus = (subForFailure as any)?.status ?? null;
        const canMarkPastDue =
          currentStatus === "active" || currentStatus === "trialing" || currentStatus === "past_due";
        const firstFailureOfEpisode = !!subForFailure && !subForFailure.past_due_since;
        const pastDueSince = subForFailure?.past_due_since ?? new Date().toISOString();

        if (subForFailure && canMarkPastDue) {
          const failureUpdate: Record<string, any> = { status: "past_due" };
          if (firstFailureOfEpisode) failureUpdate.past_due_since = pastDueSince;

          const { error: pastDueError } = await adminClient
            .from("user_subscriptions")
            .update(failureUpdate)
            .eq("id", sub.id);
          if (pastDueError) {
            console.error("Failed to mark subscription past_due:", pastDueError.message);
          }
        }

        if (subForFailure && canMarkPastDue && firstFailureOfEpisode) {
          // Atomic dunning claim
          try {
            const { data: claimed } = await adminClient
              .from("user_subscriptions")
              .update({ dunning_notified_at: new Date().toISOString() })
              .eq("id", sub.id)
              .is("dunning_notified_at", null)
              .select("id");

            if (claimed && claimed.length > 0) {
              const { data: userData } = await adminClient.auth.admin.getUserById(sub.user_id);
              const userEmail = userData?.user?.email;
              if (userEmail) {
                await sendDunningEmail({ userEmail, pastDueSince });
              }
            } else {
              console.log("Dunning already claimed for sub:", sub.id);
            }
          } catch (dunningErr) {
            console.error(
              "Dunning email error (non-fatal):",
              dunningErr instanceof Error ? dunningErr.message : String(dunningErr),
            );
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    // R4-HIGH-3, deliberately NOT given a dead letter. `adminClient` is declared
    // inside the try block, so it is out of scope here and may legitimately not
    // exist yet (this catch also covers failures before the client is built, and
    // before signature verification — where an unauthenticated caller could
    // otherwise write rows into webhook_dead_letters at will). The 500 makes
    // Moyasar redeliver, and the redelivery is then handled by the classified
    // paths above, which do write letters. Constructing a second admin client
    // just for this catch was considered and rejected: it would hand an
    // unauthenticated request a write primitive.
    console.error("Webhook unhandled error:", {
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

// ── Dead-letter helper ────────────────────────────────────────────────────────
//
// H8 — DEDUPED ON (charge_id, reason).
//
// Moyasar redelivers an event until it is acked, and several paths here
// deliberately answer non-2xx to ask for exactly that. Every redelivery used to
// append another row, so `webhook_dead_letters` filled with copies of one fact
// precisely when ops needed to read it. The reported case: a redelivered `paid`
// event on a `past_due` subscription with `cancel_at_period_end = true` wrote a
// second `paid_after_cancel` letter for the same captured payment, inviting a
// second refund for money that was only taken once.
//
// The dedupe is UNBOUNDED IN TIME, on purpose. `charge_id` is one immutable
// Moyasar payment and `reason` is one classification, so the pair identifies a
// FACT, not an occurrence — "this payment was refused for this reason" is true
// once and stays true. A time-bounded window would let a redelivery that
// arrives after the window write a second letter, which is the one thing this
// must never do. Recurrence is not lost: it is logged on every delivery.
//
// CONTRACT (unchanged): this function never throws and never blocks the
// caller's own error handling. The dedupe lookup is inside the same try/catch,
// and a lookup ERROR falls through to the insert — a duplicate letter is a
// nuisance, a lost letter is money nobody knows about.
async function insertDeadLetter(
  adminClient: AdminClient,
  params: {
    paymentId: string | null;
    moyasarStatus: string;
    reason: string;
    payload: unknown;
  },
): Promise<void> {
  try {
    if (params.paymentId) {
      // `charge_id` is nullable and a NULL cannot be matched by equality, so a
      // letter with no payment id (a malformed event) is never deduped — it is
      // also never redelivered, because that path answers 200.
      const { data: existing, error: lookupError } = await adminClient
        .from("webhook_dead_letters")
        .select("id")
        .eq("charge_id", params.paymentId)
        .eq("reason", params.reason)
        .limit(1);

      if (lookupError) {
        console.error(
          "Dead-letter dedupe lookup failed — inserting anyway (non-fatal):",
          lookupError.message,
        );
      } else if (existing && existing.length > 0) {
        console.warn(
          `Dead letter already recorded for payment ${params.paymentId} ` +
          `reason '${params.reason}' — recurrence logged, duplicate row skipped`,
        );
        return;
      }
    }

    const { error } = await adminClient.from("webhook_dead_letters").insert({
      charge_id: params.paymentId,
      tap_status: params.moyasarStatus,
      reason: params.reason,
      payload: params.payload,
    });
    if (error) {
      console.error("Dead-letter insert failed (non-fatal):", error.message);
    }
  } catch (err) {
    console.error("Dead-letter insert threw (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

// ── Dunning email helper ──────────────────────────────────────────────────────
async function sendDunningEmail(params: {
  userEmail: string;
  pastDueSince: string;
}): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not configured — dunning email skipped");
    return;
  }

  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ConsultX <noreply@consultx.app>";
  const accountUrl = "https://consultx.app/account";

  const graceEnd = new Date(
    new Date(params.pastDueSince).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
  const graceEndAr = graceEnd.toLocaleDateString("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const graceEndEn = graceEnd.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>ConsultX</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px 16px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:13px;margin:0 0 8px">ConsultX</p>
  <h1 style="color:#111827;font-size:20px;margin:0 0 16px;font-weight:700">تعذّر تجديد اشتراكك</h1>
  <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 12px">
    تعذّر على نظامنا تجديد اشتراكك تلقائيًا.
    يبقى وصولك الكامل محفوظًا حتى <strong>${graceEndAr}</strong>.
  </p>
  <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px">
    يرجى مراجعة بيانات الدفع أو الاشتراك من جديد قبل انتهاء فترة السماح للحفاظ على وصولك.
  </p>
  <a href="${accountUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">إدارة الاشتراك</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
  <div dir="ltr" style="text-align:left">
    <h2 style="color:#111827;font-size:16px;margin:0 0 10px;font-weight:700">Your ConsultX subscription renewal failed</h2>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 10px">
      We were unable to renew your subscription automatically.
      Your full access is preserved until <strong>${graceEndEn}</strong>.
    </p>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 20px">
      Please update your payment details or resubscribe before the grace period ends.
    </p>
    <a href="${accountUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">Manage Subscription</a>
  </div>
  <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#9ca3af;font-size:12px;margin:0;direction:ltr;text-align:left">
    ConsultX &middot; support@consultx.app &middot;
    You are receiving this because you have an active or recent subscription.
  </p>
</div>
</body>
</html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.userEmail],
        subject: "تعذّر تجديد اشتراكك في ConsultX | Your ConsultX subscription renewal failed",
        html,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("Resend API error:", response.status, body.slice(0, 300));
    } else {
      console.log("Dunning email sent to:", params.userEmail);
    }
  } catch (err) {
    console.error("Dunning email network error:", err instanceof Error ? err.message : String(err));
  }
}

// ── Last-four helper ──────────────────────────────────────────────────────────
function extractLastFour(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
