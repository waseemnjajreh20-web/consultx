import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// process-subscription-renewal
//
// Mission: find active subscriptions whose next_billing_date
// has arrived, charge the stored card via Tap, and update the
// subscription period on success.
//
// Triggered by pg_cron via HTTP (hourly). Not user-callable.
// ============================================================

serve(async (req) => {
  // ── Auth: validate CRON_SECRET if configured ─────────────────────────────
  // Set CRON_SECRET in Edge Function secrets (Supabase dashboard) AND in
  // Postgres: ALTER DATABASE postgres SET app.cron_secret = 'same-value';
  // If CRON_SECRET is not set, the function is open (internal-network only).
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      console.error("Renewal job rejected: invalid or missing x-cron-secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const tapSecretKey = Deno.env.get("TAP_SECRET_KEY");

  if (!tapSecretKey) {
    console.error("TAP_SECRET_KEY not configured — cannot attempt renewal charges");
    return new Response(JSON.stringify({ error: "TAP_SECRET_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── 1. Query renewal-eligible subscriptions ───────────────────────────────
  //
  // Eligibility rules (all must be true):
  //   • status = 'active'         — only charge subscriptions currently active
  //   • cancel_at_period_end = false — user has NOT requested cancellation
  //   • next_billing_date IS NOT NULL — column must be set (safety guard)
  //   • next_billing_date <= NOW() + 1 hour (safety window against clock skew)
  //   • tap_card_id IS NOT NULL AND tap_customer_id IS NOT NULL — card on file
  //   • plan_id IS NOT NULL — required to look up the charge amount
  //
  // Safety window: pick up subscriptions due within the next 60 minutes so a
  // cron job that fires slightly late never silently skips a due subscription.
  const safetyWindowMs = 60 * 60 * 1000; // 1 hour
  const cutoff = new Date(Date.now() + safetyWindowMs).toISOString();

  const { data: dueSubscriptions, error: queryError } = await adminClient
    .from("user_subscriptions")
    .select(`
      id,
      user_id,
      plan_id,
      tap_customer_id,
      tap_card_id,
      tap_payment_agreement_id,
      next_billing_date,
      current_period_end,
      past_due_since,
      subscription_plans (
        price_amount,
        currency,
        duration_days,
        name_en,
        slug
      )
    `)
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .not("next_billing_date", "is", null)
    .lte("next_billing_date", cutoff)
    .not("tap_card_id", "is", null)
    .not("tap_customer_id", "is", null);

  if (queryError) {
    console.error("Failed to query due subscriptions:", queryError);
    return new Response(JSON.stringify({ error: "Query failed", details: queryError }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 1b. Past-due retry: subscriptions that failed renewal within grace window ─
  //
  // Eligibility rules (all must be true):
  //   • status = 'past_due'
  //   • cancel_at_period_end = false  — user has NOT requested cancellation
  //   • past_due_since >= NOW() - GRACE_DAYS  — within the 7-day retry window
  //   • tap_card_id + tap_customer_id present — card on file
  //
  // GRACE_DAYS must match the constant in check-subscription so access and
  // retry windows are coherent. Both currently use 7 days.
  const GRACE_DAYS  = 7;
  const graceCutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: pastDueSubs, error: pastDueError } = await adminClient
    .from("user_subscriptions")
    .select(`
      id,
      user_id,
      plan_id,
      tap_customer_id,
      tap_card_id,
      tap_payment_agreement_id,
      next_billing_date,
      current_period_end,
      past_due_since,
      subscription_plans (
        price_amount,
        currency,
        duration_days,
        name_en,
        slug
      )
    `)
    .eq("status", "past_due")
    .eq("cancel_at_period_end", false)
    .not("tap_card_id", "is", null)
    .not("tap_customer_id", "is", null)
    .not("past_due_since", "is", null)
    .gte("past_due_since", graceCutoff);

  if (pastDueError) {
    console.error("Failed to query past_due subscriptions:", pastDueError);
    // Non-fatal: continue with active-only results
  }

  // Merge both sets. Statuses are mutually exclusive so no deduplication needed.
  const allDue = [...(dueSubscriptions ?? []), ...(pastDueSubs ?? [])];

  if (allDue.length === 0) {
    console.log("Renewal job: no subscriptions due for renewal or retry");
    return new Response(
      JSON.stringify({ processed: 0, skipped: 0, failed: 0, total: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(
    `Renewal job: ${dueSubscriptions?.length ?? 0} active due, ` +
    `${pastDueSubs?.length ?? 0} past_due retries`,
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of allDue) {
    const plan = sub.subscription_plans as any;
    if (!plan || plan.price_amount == null) {
      console.error(`Sub ${sub.id}: no plan data — skipping`);
      skipped++;
      continue;
    }

    // Skip free plans (price = 0) — no charge needed
    if (plan.price_amount === 0) {
      console.log(`Sub ${sub.id}: free plan (price = 0) — skipping charge, extending period`);
      const now = new Date();
      const periodEnd = new Date(now.getTime() + (plan.duration_days || 30) * 24 * 60 * 60 * 1000);
      await adminClient
        .from("user_subscriptions")
        .update({
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          next_billing_date: periodEnd.toISOString(),
        })
        .eq("id", sub.id);
      processed++;
      continue;
    }

    // ── 2. Idempotency: skip if a live renewal tx already exists this period ─
    //
    // "Current period" starts at (current_period_end - duration_days). Any
    // 'initiated' or 'captured' renewal tx created after that date means a
    // charge is already in flight or succeeded — do not double-charge.
    const durationDays = plan.duration_days || 30;
    const periodWindowStart = sub.current_period_end
      ? new Date(new Date(sub.current_period_end).getTime() - durationDays * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() - durationDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: existingTx } = await adminClient
      .from("payment_transactions")
      .select("id, status")
      .eq("subscription_id", sub.id)
      .eq("payment_type", "renewal")
      .in("status", ["initiated", "captured"])
      .gte("created_at", periodWindowStart)
      .maybeSingle();

    if (existingTx) {
      console.log(
        `Sub ${sub.id}: renewal tx ${existingTx.id} already ${existingTx.status} — skipping`,
      );
      skipped++;
      continue;
    }

    // ── 3. Determine retry_count (count prior failed attempts this period) ──
    const { count: failedCount } = await adminClient
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.id)
      .eq("payment_type", "renewal")
      .eq("status", "failed")
      .gte("created_at", periodWindowStart);

    const retryCount = failedCount ?? 0;

    // ── 4. Insert renewal transaction BEFORE calling Tap ────────────────────
    // tap_charge_id is null initially; updated after Tap responds.
    // This ensures the webhook can always find a matching row by charge ID.
    const { data: txRecord, error: txInsertError } = await adminClient
      .from("payment_transactions")
      .insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        tap_charge_id: null,
        amount: plan.price_amount,
        currency: plan.currency || "SAR",
        status: "initiated",
        payment_type: "renewal",
        retry_count: retryCount,
      })
      .select("id")
      .single();

    if (txInsertError || !txRecord) {
      console.error(`Sub ${sub.id}: failed to insert renewal transaction:`, txInsertError);
      skipped++;
      continue;
    }

    const txId = txRecord.id;

    // ── 5. Create Tap token from stored card ──────────────────────────────────
    // Tap requires a fresh single-use token each time, created from the
    // stored card + customer IDs. This is the MIT (Merchant Initiated
    // Transaction) token path used throughout this project.
    let tokenData: any;
    try {
      const tokenResponse = await fetch("https://api.tap.company/v2/tokens", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tapSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          saved_card: {
            card_id: sub.tap_card_id,
            customer_id: sub.tap_customer_id,
          },
        }),
      });
      tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.id) {
        const errMsg = tokenData?.message || tokenData?.errors?.[0]?.description || "Token creation failed";
        throw new Error(errMsg);
      }
    } catch (tokenErr) {
      const errMsg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      console.error(`Sub ${sub.id}: Tap token creation failed:`, errMsg);
      await Promise.all([
        adminClient.from("payment_transactions").update({
          status: "failed",
          failure_code: "TOKEN_ERROR",
          failure_message: errMsg,
        }).eq("id", txId),
        markPastDue(adminClient, sub),
      ]);
      failed++;
      continue;
    }

    // ── 6. Create Tap charge (MIT — Merchant Initiated Transaction) ───────────
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";
    const webhookUrl = projectRef
      ? `https://${projectRef}.supabase.co/functions/v1/tap-webhook`
      : `${supabaseUrl}/functions/v1/tap-webhook`;

    const chargeAmount = plan.price_amount / 100; // halalas → SAR
    const chargePayload: Record<string, any> = {
      amount: chargeAmount,
      currency: plan.currency || "SAR",
      save_card: false,
      threeDSecure: false, // MIT — 3DS not required for merchant-initiated renewals
      description: `Subscription renewal — ${plan.name_en}`,
      statement_descriptor: "ConsultX Sub",
      reference: {
        transaction: `renewal_${sub.id}_${Date.now()}`,
        order: `order_${sub.user_id}`,
      },
      receipt: { email: true, sms: false },
      customer: { id: sub.tap_customer_id },
      source: { id: tokenData.id },
      post: { url: webhookUrl },
    };

    // Include payment agreement if available — improves MIT approval rates
    if (sub.tap_payment_agreement_id) {
      chargePayload.payment_agreement = {
        id: sub.tap_payment_agreement_id,
        type: "UNSCHEDULED",
        contract: {
          id: `contract_${sub.user_id}`,
          type: "PAY_AS_YOU_GO",
        },
      };
    }

    let chargeData: any;
    let chargeResponseOk = false;
    try {
      const chargeResponse = await fetch("https://api.tap.company/v2/charges", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tapSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chargePayload),
      });
      chargeData = await chargeResponse.json();
      chargeResponseOk = chargeResponse.ok;
    } catch (chargeErr) {
      const errMsg = chargeErr instanceof Error ? chargeErr.message : String(chargeErr);
      console.error(`Sub ${sub.id}: Tap charge request network error:`, errMsg);
      await Promise.all([
        adminClient.from("payment_transactions").update({
          status: "failed",
          failure_code: "NETWORK_ERROR",
          failure_message: errMsg,
        }).eq("id", txId),
        markPastDue(adminClient, sub),
      ]);
      failed++;
      continue;
    }

    if (!chargeResponseOk) {
      // Tap returned a 4xx/5xx — charge was rejected before processing
      const errCode =
        chargeData?.errors?.[0]?.code ?? chargeData?.code ?? "CHARGE_REJECTED";
      const errMsg =
        chargeData?.errors?.[0]?.description ??
        chargeData?.message ??
        JSON.stringify(chargeData);
      console.error(`Sub ${sub.id}: Tap rejected charge (${errCode}):`, errMsg);
      await Promise.all([
        adminClient.from("payment_transactions").update({
          status: "failed",
          failure_code: errCode,
          failure_message: errMsg,
        }).eq("id", txId),
        markPastDue(adminClient, sub),
      ]);
      failed++;
      continue;
    }

    // ── 7. Charge accepted by Tap — stamp charge ID and handle outcome ────────
    const mappedStatus =
      chargeData.status === "CAPTURED" ? "captured"
      : chargeData.status === "FAILED"  ? "failed"
      : "initiated"; // INITIATED / PENDING — webhook will deliver final outcome

    const txUpdate: Record<string, any> = {
      tap_charge_id: chargeData.id,
      status: mappedStatus,
    };
    if (chargeData.status === "FAILED") {
      txUpdate.failure_code    = chargeData.response?.code    ?? null;
      txUpdate.failure_message = chargeData.response?.message ?? null;
    }
    await adminClient.from("payment_transactions").update(txUpdate).eq("id", txId);

    if (chargeData.status === "CAPTURED") {
      // Immediate capture — update subscription period directly.
      // The webhook will also fire but the idempotent update is harmless.
      const now = new Date();
      const newPeriodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      await adminClient.from("user_subscriptions").update({
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: newPeriodEnd.toISOString(),
        next_billing_date: newPeriodEnd.toISOString(),
        past_due_since: null,
      }).eq("id", sub.id);
      console.log(
        `Sub ${sub.id}: renewed immediately (CAPTURED) — ` +
        `next billing ${newPeriodEnd.toISOString()}`,
      );
      processed++;
    } else if (chargeData.status === "FAILED") {
      await markPastDue(adminClient, sub);
      console.error(`Sub ${sub.id}: charge returned FAILED immediately — marked past_due`);
      failed++;
    } else {
      // Async path (INITIATED/PENDING): tap-webhook will deliver CAPTURED or FAILED
      console.log(
        `Sub ${sub.id}: charge ${chargeData.id} initiated ` +
        `(${chargeData.status}) — awaiting webhook`,
      );
      processed++;
    }
  }

  const summary = {
    processed,
    skipped,
    failed,
    total: allDue.length,
  };
  console.log("Renewal job complete:", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Helper: mark subscription past_due; stamp past_due_since on first failure ─
// Idempotent: only writes past_due_since if it is currently NULL so the
// grace-period clock always reflects the first missed payment, not the
// most recent retry.
async function markPastDue(
  adminClient: ReturnType<typeof createClient>,
  sub: { id: string; past_due_since: string | null },
): Promise<void> {
  const updates: Record<string, any> = { status: "past_due" };
  if (!sub.past_due_since) {
    updates.past_due_since = new Date().toISOString();
  }
  const { error } = await adminClient
    .from("user_subscriptions")
    .update(updates)
    .eq("id", sub.id);
  if (error) {
    console.error(`markPastDue: failed on sub ${sub.id}:`, error);
  }
}
