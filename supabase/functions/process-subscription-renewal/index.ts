import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CARD_VERIFICATION_AMOUNT,
  chargeRetryEligibility,
  computeCharge,
  isUndefinedColumnError,
  OPTIONAL_TRANSACTION_COLUMNS,
  type PaidPlanRef,
  parsePaidPlanRef,
  planPriceFor,
  chargeSplit,
  trialChargeAuthorized,
  withoutKeys,
} from "../_shared/billing.ts";
import {
  classifyLockResult,
  type LockOutcome,
  MAX_TRIAL_CONVERSION_REFUSALS,
  RENEWAL_JOB_LOCK_NAME,
  RENEWAL_JOB_LOCK_TTL_SECONDS,
  resolveStaleInitiated,
  STALE_INITIATED_AFTER_MS,
  STALE_INITIATED_LOOKUP_CAP,
  STALE_INITIATED_NO_PAYMENT_ID_CODE,
  TRIAL_CONVERSION_FORFEIT_REASON,
  TRIAL_CONVERSION_REFUSAL_REASON,
  trialRefusalOutcome,
} from "../_shared/renewalDecisions.ts";
import { getSecretKey } from "../_shared/supabaseKeys.ts";

// Must match GRACE_DAYS in check-subscription, moyasar-webhook,
// Workspace.tsx, and Account.tsx.
const GRACE_DAYS = 7;

// Skip a trial conversion if any non-verification charge was already
// attempted for the subscription inside this window.
const TRIAL_CONVERSION_IDEMPOTENCY_MS = 24 * 60 * 60 * 1000;

// `ReturnType<typeof createClient>` resolves the DEFAULT generic instantiation,
// whose schema type is `never` — every .update() against it fails to type-check.
// Instantiating with `any` matches what `createClient(url, key)` actually returns.
type AdminClient = ReturnType<typeof createClient<any>>;

// ============================================================
// process-subscription-renewal
//
// Passes, in order:
//   0.  TRIAL CONVERSION — trialing subscriptions whose trial_end has
//       passed. With a saved card token: charge the first real invoice
//       (plan price minus the 1.00 SAR card verification, credited
//       once) and activate. Without a usable token: expire.
//   1.  RENEWAL — active subscriptions whose next_billing_date has
//       arrived; charge the stored Moyasar card token (MIT).
//   1b. PAST-DUE RETRY — inside the GRACE_DAYS window.
//
// Housekeeping passes that run first, before anything is charged:
//   0b. expireUnbillableTrials      — lapsed trials with no usable card.
//   0c. expireLapsedPastDue         — past_due past the grace window, plus the
//                                     M14 stamping of past_due_since = now()
//                                     on rows that never got one.
//   0d. resolveStaleInitiatedTxs    — payment_transactions stuck at `initiated`
//                                     (M9 / M11); they block BOTH idempotency
//                                     guards below, so the subscription would
//                                     otherwise never be charged again.
//
// The whole run is serialised by a TTL lease in public.job_locks (H5).
//
// Pass 0 is what makes trials convert to revenue. Without it a
// trialing row stays trialing forever and is never billed.
//
// Contract: docs/launch/billing-contract-20260823.md
// Triggered by pg_cron via HTTP (hourly). Not user-callable.
// ============================================================

/** Columns every pass needs. card_verified_at is appended separately
 *  because it only exists after the Section 8 migration. */
const SUB_SELECT = `
      id, user_id, plan_id, moyasar_card_token, moyasar_payment_id, seat_count, status, trial_end,
      cancel_at_period_end, next_billing_date, current_period_end, past_due_since,
      subscription_plans ( price_amount, price_per_seat, min_seats, currency, duration_days, name_en, slug )
    `;

serve(async (req) => {
  // Auth: CRON_SECRET is MANDATORY and fails closed (finding H6).
  // This used to be `if (cronSecret) { ... }`, so an unset secret disabled the
  // check entirely and left an unauthenticated endpoint that charges saved
  // cards exposed to anyone who could reach the function URL.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error(
      "Renewal job refused: CRON_SECRET is not configured. This job charges stored cards " +
      "and will not run unauthenticated. Set CRON_SECRET on the function and on the pg_cron caller.",
    );
    return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const providedCronSecret = req.headers.get("x-cron-secret");
  if (providedCronSecret !== cronSecret) {
    console.error("Renewal job rejected: invalid or missing x-cron-secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = getSecretKey();
  const moyasarSecretKey = Deno.env.get("MOYASAR_SECRET_KEY");

  if (!moyasarSecretKey) {
    console.error("MOYASAR_SECRET_KEY not configured — cannot attempt renewal charges");
    return new Response(JSON.stringify({ error: "MOYASAR_SECRET_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // -- H5. Single-flight lease ------------------------------------------------
  // Two overlapping invocations of this job (the hourly pg_cron tick plus a
  // manual invocation, or a slow run overlapping the next tick) can BOTH pass
  // the per-subscription idempotency checks in the window between the SELECT
  // and the INSERT of the payment_transactions anchor row, and both then charge
  // the same stored card. A TTL lease in public.job_locks serialises the runs.
  // supabase/migrations/20260823000004_job_locks.sql explains why this is a
  // lease and not pg_try_advisory_lock (PostgREST pools connections, so a
  // session-scoped advisory lock is neither reliably held nor reliably freed).
  const lease = await acquireRenewalLease(adminClient);
  if (lease.outcome === "locked") {
    // A skipped tick is harmless: the work is picked up an hour later, and the
    // 24h/period idempotency windows are far wider than one tick. A double
    // charge on a stored card is not harmless. 200 so pg_cron does not retry.
    console.log("Renewal job: lease not acquired (another run holds it, or the lock state is unknown) — skipping this tick");
    return new Response(JSON.stringify({ skipped: "locked" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    return await runRenewalPasses(adminClient, supabaseUrl, moyasarSecretKey, lease);
  } finally {
    // Runs on EVERY exit path of runRenewalPasses, including a throw. If this
    // never runs at all (hard timeout, OOM, redeploy mid-run) the lease still
    // expires by itself after RENEWAL_JOB_LOCK_TTL_SECONDS — that is exactly
    // why this is a TTL lease and not a lock that has to be cleaned up.
    await releaseRenewalLease(adminClient, lease);
  }
});

// ── The passes ────────────────────────────────────────────────────────────────
// Lifted out of the serve() handler unchanged so the single-flight lease above
// can wrap all of it in ONE try/finally instead of chasing every return path.
async function runRenewalPasses(
  adminClient: AdminClient,
  supabaseUrl: string,
  moyasarSecretKey: string,
  lease: RenewalLease,
): Promise<Response> {
  const nowIso = new Date().toISOString();

  // ── 0. Trial conversion: trialing rows whose trial_end has passed ──────────
  // These are the users who paid 1.00 SAR to verify a card at trial start and
  // must now be charged the first real invoice. Nothing else in the system
  // moves a subscription out of "trialing".
  const { rows: trialDueSubs, error: trialQueryError } = await selectSubs(
    adminClient,
    (q: any) =>
      q.eq("status", "trialing")
        .eq("cancel_at_period_end", false)
        .not("trial_end", "is", null)
        .lte("trial_end", nowIso)
        .not("moyasar_card_token", "is", null),
  );
  if (trialQueryError) console.error("Failed to query trialing subscriptions:", trialQueryError);

  // ── 0b. Trials that ended with no usable card (or were cancelled) ─────────
  // Nothing to charge. Close them out so they stop being "trialing" forever.
  const expiredTrials = await expireUnbillableTrials(adminClient, nowIso);

  // -- 0c. Past-due rows whose grace window has closed (defect C2) -----------
  // Nothing used to move these: the retry pass below excludes them
  // (graceCutoff) and check-subscription only synced profiles.plan_type. They
  // stayed `past_due` forever, and because the partial unique index
  // user_subscriptions_one_live_row_per_user counts `past_due` as LIVE, that
  // zombie row blocked the activation of any new subscription the customer
  // bought afterwards.
  const pastDueSweep = await expireLapsedPastDue(adminClient);

  // -- 0d. payment_transactions stuck at `initiated` (M9 / M11) ---------------
  // Both idempotency guards below match `initiated` as well as `captured`, so a
  // transaction row that never reached a terminal status blocks its
  // subscription from ever being charged again. Resolving them is also the most
  // dangerous thing in this file — see resolveStaleInitiatedTransactions().
  const staleTx = await resolveStaleInitiatedTransactions(adminClient, moyasarSecretKey);

  // 1. Active subscriptions due for renewal (have moyasar_card_token)
  const safetyWindowMs = 60 * 60 * 1000;
  const cutoff = new Date(Date.now() + safetyWindowMs).toISOString();

  const { rows: dueSubscriptions, error: queryError } = await selectSubs(
    adminClient,
    (q: any) =>
      q.eq("status", "active")
        .eq("cancel_at_period_end", false)
        .not("next_billing_date", "is", null)
        .lte("next_billing_date", cutoff)
        .not("moyasar_card_token", "is", null),
  );

  if (queryError) {
    console.error("Failed to query due subscriptions:", queryError);
    return new Response(JSON.stringify({ error: "Query failed", details: queryError }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  // 1b. Past-due subscriptions within grace window
  const graceCutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { rows: pastDueSubs, error: pastDueError } = await selectSubs(
    adminClient,
    (q: any) =>
      q.eq("status", "past_due")
        .eq("cancel_at_period_end", false)
        .not("moyasar_card_token", "is", null)
        .not("past_due_since", "is", null)
        .gte("past_due_since", graceCutoff),
  );

  if (pastDueError) console.error("Failed to query past_due subscriptions:", pastDueError);

  const allDue = [
    ...(trialDueSubs ?? []).map((s: any) => ({ ...s, __flow: "post_trial_first_charge" as const })),
    ...(dueSubscriptions ?? []).map((s: any) => ({ ...s, __flow: "renewal" as const })),
    ...(pastDueSubs ?? []).map((s: any) => ({ ...s, __flow: "renewal" as const })),
  ];

  if (allDue.length === 0) {
    console.log("Renewal job: no subscriptions due for conversion, renewal or retry");
    return new Response(
      JSON.stringify({
        processed: 0, skipped: 0, failed: 0, total: 0,
        trials_converted: 0, trials_refused: 0, trials_forfeited: 0,
        trials_expired: expiredTrials,
        past_due_expired: pastDueSweep.closed, past_due_stamped: pastDueSweep.stamped,
        stale_tx_failed: staleTx.markedFailed,
        stale_tx_paid_needs_replay: staleTx.paidNeedsReplay,
        stale_tx_left_alone: staleTx.leftAlone,
        lock: lease.outcome,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(
    `Renewal job: ${trialDueSubs?.length ?? 0} trials to convert, ` +
    `${dueSubscriptions?.length ?? 0} active due, ` +
    `${pastDueSubs?.length ?? 0} past_due retries, ` +
    `${expiredTrials} trials expired (no card)`,
  );

  let processed = 0, skipped = 0, failed = 0, trialsConverted = 0;
  // H7 counters: `refused` is one permanent refusal, `forfeited` is a row that
  // was finally closed because it had accumulated MAX_TRIAL_CONVERSION_REFUSALS.
  let trialsRefused = 0, trialsForfeited = 0;

  for (const sub of allDue) {
    const plan = sub.subscription_plans as any;
    if (!plan || plan.price_amount == null) { skipped++; continue; }

    if (plan.price_amount === 0) {
      // Zero-priced plan: nothing to charge, just roll the period forward.
      // A trial conversion must ALSO leave "trialing", or the row stays
      // invisible to every pass forever.
      const now = new Date();
      const periodEnd = new Date(now.getTime() + (plan.duration_days || 30) * 24 * 60 * 60 * 1000);
      const zeroUpdate: Record<string, any> = {
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_billing_date: periodEnd.toISOString(),
      };
      if ((sub as any).__flow === "post_trial_first_charge") zeroUpdate.status = "active";
      await adminClient.from("user_subscriptions").update(zeroUpdate).eq("id", sub.id);
      processed++; continue;
    }

    const isTrialConversion = (sub as any).__flow === "post_trial_first_charge";
    const durationDays = plan.duration_days || 30;

    // Per-seat amount: enterprise_team / enterprise_office have price_per_seat
    // set; legacy enterprise / engineer / pro keep price_per_seat = null and
    // continue to charge the flat plan.price_amount.
    let chargeAmount = planPriceFor(plan, sub as any);
    let chargeDescription = `Subscription renewal — ${plan.name_en}`;
    let chargeFlow: string = "renewal";
    let verificationCredit = 0;

    if (isTrialConversion) {
      // First real invoice after the trial. The 1.00 SAR card verification is
      // credited exactly once — only when it was actually stamped and no
      // non-verification charge has ever been captured for this subscription.
      const { count: priorPaidCount, error: priorPaidError } = await adminClient
        .from("payment_transactions")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", sub.id)
        .eq("status", "captured")
        .neq("payment_type", "verification");

      // A discarded error here reads as "never charged before", which would both
      // re-grant the one-time verification credit and mask an existing charge.
      if (priorPaidError) {
        console.error(`Sub ${sub.id}: prior-paid count failed, skipping:`, priorPaidError.message);
        skipped++; continue;
      }

      const decision = computeCharge(plan, sub as any, null, priorPaidCount ?? 0);
      chargeAmount = decision.amount;
      chargeDescription = decision.description;
      chargeFlow = decision.flow;
      verificationCredit = decision.verificationCredit;

      if (!Number.isInteger(chargeAmount) || chargeAmount <= 0) {
        console.error(`Sub ${sub.id}: refusing non-positive trial conversion charge`);
        skipped++; continue;
      }

      // Idempotency: skip if any non-verification charge was attempted for this
      // subscription in the last 24h (covers duplicate cron ticks and retries).
      const recentWindow = new Date(Date.now() - TRIAL_CONVERSION_IDEMPOTENCY_MS).toISOString();
      const { count: recentAttempts, error: recentAttemptsError } = await adminClient
        .from("payment_transactions")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", sub.id)
        .neq("payment_type", "verification")
        .in("status", ["initiated", "captured"])
        .gte("created_at", recentWindow);

      // Same inversion as the renewal guard below: a discarded error would read
      // as "no recent attempt -> charge" and re-charge on every tick.
      if (recentAttemptsError) {
        console.error(`Sub ${sub.id}: conversion idempotency check failed, skipping:`, recentAttemptsError.message);
        skipped++; continue;
      }
      if ((recentAttempts ?? 0) > 0) { skipped++; continue; }

      // Defect C1. The stored card was verified against a SPECIFIC plan and
      // seat count (the 1.00 SAR verification payment's metadata). If the row
      // no longer matches, it was escalated outside a captured payment and this
      // unattended charge must not happen. Any lookup failure is treated as
      // "unknown authorization -> skip", never as "proceed to charge".
      const verified = await fetchVerifiedPlanRef(moyasarSecretKey, (sub as any).moyasar_payment_id);
      if (!verified.ok) {
        // TRANSIENT refusal (H7). Moyasar was unreachable or answered 5xx, so the
        // authorization is UNKNOWN — not refused. It is never counted toward the
        // give-up counter and never dead-lettered: closing a perfectly payable
        // subscription because of an upstream outage would be the worse error.
        console.error(`Sub ${sub.id}: verified-plan lookup failed, skipping this tick (transient — not counted)`);
        skipped++; continue;
      }
      const authz = trialChargeAuthorized(sub as any, verified.ref);
      if (!authz.authorized) {
        // PERMANENT refusal (H7). H9 made trialChargeAuthorized fail closed, and
        // its inputs are the row plus the IMMUTABLE metadata of an already
        // captured verification payment — every later tick reaches the same
        // answer, forever. Left alone the row never converts, never expires and
        // never reaches ops, while still counting as LIVE in
        // user_subscriptions_one_live_row_per_user and blocking any new
        // subscription the customer buys. Count it, and close it after
        // MAX_TRIAL_CONVERSION_REFUSALS.
        console.error(
          `Sub ${sub.id}: refusing post-trial charge (${authz.reason}) — row is plan ` +
          `${sub.plan_id} x${sub.seat_count}, card was verified for plan ` +
          `${verified.ref?.plan_id ?? "unknown"} x${verified.ref?.seat_count ?? "unknown"}`,
        );
        trialsRefused++;
        const refusal = await recordTrialConversionRefusal(
          adminClient, sub as any, authz.reason, verified.ref,
        );
        if (refusal.forfeited) trialsForfeited++;
        skipped++; continue;
      }
    } else {
      // Idempotency: skip if renewal tx already exists for this period
      const periodWindowStart = sub.current_period_end
        ? new Date(new Date(sub.current_period_end).getTime() - durationDays * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() - durationDays * 24 * 60 * 60 * 1000).toISOString();

      // .maybeSingle() returns {data:null, error:PGRST116} when MORE than one
      // row matches, which inverted this guard into "no prior attempt -> charge"
      // on every hourly tick. Two rows is reachable: the trial-conversion pass
      // writes payment_type "renewal" and its 24h retry window creates a second
      // `initiated` row. Any error here means unknown history -> skip, never charge.
      const { data: existingTxRows, error: existingTxError } = await adminClient
        .from("payment_transactions")
        .select("id, status")
        .eq("subscription_id", sub.id)
        .eq("payment_type", "renewal")
        .in("status", ["initiated", "captured"])
        .gte("created_at", periodWindowStart)
        .limit(1);

      if (existingTxError) {
        console.error(`Sub ${sub.id}: renewal idempotency check failed, skipping:`, existingTxError.message);
        skipped++; continue;
      }
      if (existingTxRows && existingTxRows.length > 0) { skipped++; continue; }
    }

    // Window used only for the failure-retry counter below.
    const periodWindowStart = sub.current_period_end
      ? new Date(new Date(sub.current_period_end).getTime() - durationDays * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() - durationDays * 24 * 60 * 60 * 1000).toISOString();

    // The most recent failure drives BOTH the retry counter and the backoff, so
    // fetch the row and the exact count in one query.
    const { data: failedRows, count: failedCount, error: failedCountError } = await adminClient
      .from("payment_transactions")
      .select("id, created_at", { count: "exact" })
      .eq("subscription_id", sub.id)
      .eq("payment_type", "renewal")
      .eq("status", "failed")
      .gte("created_at", periodWindowStart)
      .order("created_at", { ascending: false })
      .limit(1);

    if (failedCountError) {
      // Unknown failure history means an unknown attempt number. Never charge.
      console.error(`Sub ${sub.id}: failed-attempt lookup failed, skipping:`, failedCountError.message);
      skipped++; continue;
    }

    // Defect C3(a). The idempotency guards above only match `initiated` /
    // `captured` rows, so a `failed` transaction blocked nothing: a declining
    // card was re-charged on EVERY hourly tick for the whole 7-day grace window
    // (~168 attempts). Cap the attempts and space them out. A healthy renewal
    // has failedCount = 0 and is never affected. A subscription that exhausts
    // its attempts is simply left alone and is closed by expireLapsedPastDue()
    // when the grace window ends.
    const retryDecision = chargeRetryEligibility(
      failedCount ?? 0,
      (failedRows?.[0] as any)?.created_at ?? null,
    );
    if (!retryDecision.eligible) {
      console.log(
        `Sub ${sub.id}: charge attempt ${retryDecision.attemptNumber} withheld (${retryDecision.reason})` +
        (retryDecision.nextAttemptAtMs
          ? ` — next attempt no earlier than ${new Date(retryDecision.nextAttemptAtMs).toISOString()}`
          : ""),
      );
      skipped++; continue;
    }

    // Insert renewal transaction row BEFORE charging (idempotency anchor).
    // Trial conversions are recorded as payment_type "renewal" too, so the
    // dunning / retry machinery and the "was this sub ever really paid?"
    // counter treat them uniformly.
    // chargeSplit() records vat = 0 while VAT_REGISTERED is false (seller is not VAT-registered).
    const vatSplit = chargeSplit(chargeAmount);
    const txPayload: Record<string, any> = {
      user_id: sub.user_id,
      subscription_id: sub.id,
      moyasar_payment_id: null,
      amount: chargeAmount,
      amount_base: vatSplit.base,
      amount_vat: vatSplit.vat,
      currency: plan.currency || "SAR",
      status: "initiated",
      payment_type: "renewal",
      retry_count: failedCount ?? 0,
    };

    let txInsert = await adminClient
      .from("payment_transactions")
      .insert(txPayload)
      .select("id")
      .single();

    if (txInsert.error && isUndefinedColumnError(txInsert.error)) {
      // Section 8 migration not applied yet — persist without the VAT columns.
      txInsert = await adminClient
        .from("payment_transactions")
        .insert(withoutKeys(txPayload, OPTIONAL_TRANSACTION_COLUMNS))
        .select("id")
        .single();
    }

    if (txInsert.error || !txInsert.data) {
      console.error(`Sub ${sub.id}: transaction insert failed:`, txInsert.error?.message);
      skipped++; continue;
    }
    const txId = txInsert.data.id;

    // Charge via Moyasar MIT using stored card token
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";
    const webhookUrl = projectRef
      ? `https://${projectRef}.supabase.co/functions/v1/moyasar-webhook`
      : `${supabaseUrl}/functions/v1/moyasar-webhook`;

    let chargeData: any;
    let chargeResponseOk = false;
    try {
      const chargeResponse = await fetch("https://api.moyasar.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(moyasarSecretKey + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: chargeAmount,
          currency: plan.currency || "SAR",
          description: chargeDescription,
          callback_url: webhookUrl,
          source: { type: "token", token: sub.moyasar_card_token },
          metadata: {
            subscription_id: sub.id,
            plan_id: sub.plan_id,
            user_id: sub.user_id,
            payment_type: "renewal",
            flow: chargeFlow,
            purpose: chargeFlow,
            expected_amount: chargeAmount,
            amount_base: vatSplit.base,
            amount_vat: vatSplit.vat,
            verification_credit: verificationCredit,
          },
        }),
      });
      chargeData = await chargeResponse.json();
      chargeResponseOk = chargeResponse.ok;
    } catch (chargeErr) {
      const errMsg = chargeErr instanceof Error ? chargeErr.message : String(chargeErr);
      console.error(`Sub ${sub.id}: Moyasar network error:`, errMsg);
      await Promise.all([
        adminClient.from("payment_transactions").update({
          status: "failed", failure_code: "NETWORK_ERROR", failure_message: errMsg,
        }).eq("id", txId),
        markPastDue(adminClient, sub),
      ]);
      failed++; continue;
    }

    if (!chargeResponseOk) {
      const errCode = chargeData?.message ?? "CHARGE_REJECTED";
      await Promise.all([
        adminClient.from("payment_transactions").update({
          status: "failed", failure_code: errCode, failure_message: errCode,
        }).eq("id", txId),
        markPastDue(adminClient, sub),
      ]);
      failed++; continue;
    }

    // Moyasar statuses: "paid" | "failed" | "initiated" | "authorized"
    const mappedStatus =
      chargeData.status === "paid"     ? "captured"
      : chargeData.status === "failed" ? "failed"
      : "initiated";

    const txUpdate: Record<string, any> = { moyasar_payment_id: chargeData.id, status: mappedStatus };
    if (chargeData.status === "failed") txUpdate.failure_message = chargeData.source?.message ?? null;
    await adminClient.from("payment_transactions").update(txUpdate).eq("id", txId);

    if (chargeData.status === "paid") {
      const now = new Date();
      const newPeriodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      await adminClient.from("user_subscriptions").update({
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: newPeriodEnd.toISOString(),
        next_billing_date: newPeriodEnd.toISOString(),
        past_due_since: null,
        dunning_notified_at: null,
      }).eq("id", sub.id);
      if (isTrialConversion) {
        // Keep profiles.plan_type in step with the now-paid subscription,
        // the same sync moyasar-webhook performs on activation.
        if (plan.slug) {
          await adminClient.from("profiles").update({ plan_type: plan.slug }).eq("user_id", sub.user_id);
        }
        console.log(
          `Sub ${sub.id}: trial converted (paid ${chargeAmount}, credit ${verificationCredit}) — ` +
          `next billing ${newPeriodEnd.toISOString()}`,
        );
        trialsConverted++;
      } else {
        console.log(`Sub ${sub.id}: renewed (paid) — next billing ${newPeriodEnd.toISOString()}`);
      }
      processed++;
    } else if (chargeData.status === "failed") {
      await markPastDue(adminClient, sub);
      console.error(`Sub ${sub.id}: Moyasar charge failed — marked past_due`);
      failed++;
    } else {
      // initiated/authorized: moyasar-webhook will deliver final outcome
      console.log(`Sub ${sub.id}: charge ${chargeData.id} ${chargeData.status} — awaiting webhook`);
      processed++;
    }
  }

  const summary = {
    processed, skipped, failed,
    total: allDue.length,
    trials_converted: trialsConverted,
    trials_refused: trialsRefused,
    trials_forfeited: trialsForfeited,
    trials_expired: expiredTrials,
    past_due_expired: pastDueSweep.closed,
    past_due_stamped: pastDueSweep.stamped,
    stale_tx_failed: staleTx.markedFailed,
    stale_tx_paid_needs_replay: staleTx.paidNeedsReplay,
    stale_tx_left_alone: staleTx.leftAlone,
    lock: lease.outcome,
  };
  console.log("Renewal job complete:", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

// ── Subscription query helper ─────────────────────────────────────────────────
// card_verified_at only exists after the Section 8 migration. Try the richer
// select first and transparently fall back to the pre-migration column set.
async function selectSubs(
  adminClient: AdminClient,
  applyFilters: (q: any) => any,
): Promise<{ rows: any[] | null; error: unknown }> {
  const withOptional = await applyFilters(
    adminClient.from("user_subscriptions").select(`${SUB_SELECT}, card_verified_at`),
  );
  if (!withOptional.error) return { rows: withOptional.data as any[], error: null };
  if (!isUndefinedColumnError(withOptional.error)) {
    return { rows: null, error: withOptional.error };
  }
  const fallback = await applyFilters(
    adminClient.from("user_subscriptions").select(SUB_SELECT),
  );
  return { rows: (fallback.data as any[]) ?? null, error: fallback.error ?? null };
}

// ── Unbillable trial cleanup ──────────────────────────────────────────────────
// A trial whose window has closed and that has no saved card can never be
// charged. Leaving it "trialing" makes it invisible to every pass forever, so
// close it out: "cancelled" if the user opted out, otherwise "expired".
async function expireUnbillableTrials(
  adminClient: AdminClient,
  nowIso: string,
): Promise<number> {
  let closed = 0;
  try {
    const { data: noCard } = await adminClient
      .from("user_subscriptions")
      .update({ status: "expired" })
      .eq("status", "trialing")
      .not("trial_end", "is", null)
      .lte("trial_end", nowIso)
      .is("moyasar_card_token", null)
      .select("id, user_id");

    const { data: optedOut } = await adminClient
      .from("user_subscriptions")
      .update({ status: "cancelled" })
      .eq("status", "trialing")
      .eq("cancel_at_period_end", true)
      .not("trial_end", "is", null)
      .lte("trial_end", nowIso)
      .select("id, user_id");

    const affected = [...(noCard ?? []), ...(optedOut ?? [])] as Array<{ id: string; user_id: string }>;
    closed = affected.length;

    // Sync entitlement so a lapsed trial cannot keep a paid plan_type.
    for (const row of affected) {
      const { error } = await adminClient
        .from("profiles")
        .update({ plan_type: "free" })
        .eq("user_id", row.user_id);
      if (error) console.error(`expireUnbillableTrials: plan_type sync failed for ${row.user_id}:`, error.message);
    }

    if (closed > 0) console.log(`Renewal job: closed ${closed} unbillable trial(s)`);
  } catch (e) {
    console.error("expireUnbillableTrials threw (non-fatal):", e instanceof Error ? e.message : String(e));
  }
  return closed;
}

// -- Past-due expiry (defect C2) ----------------------------------------------
// A past_due row whose GRACE_DAYS window has closed is excluded from the retry
// pass and nothing else ever moved it, so it stayed `past_due` forever. Close it
// out: "cancelled" if the user opted out, otherwise "expired", and sync
// profiles.plan_type to free so entitlement cannot outlive the subscription.
async function expireLapsedPastDue(
  adminClient: AdminClient,
): Promise<{ closed: number; stamped: number }> {
  let closed = 0;
  let stamped = 0;
  try {
    const graceCutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: lapsed, error: lapsedError } = await adminClient
      .from("user_subscriptions")
      .update({ status: "expired" })
      .eq("status", "past_due")
      .eq("cancel_at_period_end", false)
      .not("past_due_since", "is", null)
      .lt("past_due_since", graceCutoff)
      .select("id, user_id");
    if (lapsedError) console.error("expireLapsedPastDue: expire failed:", lapsedError.message);

    const { data: optedOut, error: optedOutError } = await adminClient
      .from("user_subscriptions")
      .update({ status: "cancelled" })
      .eq("status", "past_due")
      .eq("cancel_at_period_end", true)
      .not("past_due_since", "is", null)
      .lt("past_due_since", graceCutoff)
      .select("id, user_id");
    if (optedOutError) console.error("expireLapsedPastDue: cancel failed:", optedOutError.message);

    const affected = [...(lapsed ?? []), ...(optedOut ?? [])] as Array<{ id: string; user_id: string }>;
    closed = affected.length;

    for (const row of affected) {
      const { error } = await adminClient
        .from("profiles")
        .update({ plan_type: "free" })
        .eq("user_id", row.user_id);
      if (error) console.error(`expireLapsedPastDue: plan_type sync failed for ${row.user_id}:`, error.message);
    }

    // -- M14 -----------------------------------------------------------------
    // A past_due row with no past_due_since can never leave past_due through any
    // pass: the retry query requires the column to be NOT NULL, and the expiry
    // above requires it to be older than the grace cutoff. Because
    // user_subscriptions_one_live_row_per_user counts `past_due` as LIVE, such a
    // row also blocks any new subscription the customer buys. Counting and
    // logging it (what this used to do) never moved it.
    //
    // Stamp it with now(), NEVER a back-dated value. Back-dating would place the
    // row past the grace cutoff and cut the customer off in this same run;
    // now() starts a full GRACE_DAYS window from this moment and the pass above
    // closes the row 7 days later if nothing is ever paid. The row also becomes
    // visible to the past-due retry pass, which is the customer-favouring
    // outcome: a successful retry puts them back to `active`. Attempts are still
    // capped by chargeRetryEligibility, so this cannot start a charge storm.
    const { data: stampedRows, error: stampError } = await adminClient
      .from("user_subscriptions")
      .update({ past_due_since: new Date().toISOString() })
      .eq("status", "past_due")
      .is("past_due_since", null)
      .select("id, user_id");
    if (stampError) {
      console.error("expireLapsedPastDue: past_due_since stamping failed:", stampError.message);
    }
    stamped = stampedRows?.length ?? 0;
    if (stamped > 0) {
      // Ops line kept deliberately: these rows WERE a stuck state, and ops must
      // still see that they existed even though the job has now unstuck them.
      console.error(
        `Renewal job: ${stamped} past_due row(s) carried no past_due_since and were stuck — ` +
        `stamped with now(); the ${GRACE_DAYS}-day grace window starts today`,
      );
      for (const row of (stampedRows ?? []) as Array<{ id: string; user_id: string }>) {
        console.error(`Renewal job: stamped stuck past_due row ${row.id} (user ${row.user_id})`);
      }
    }

    if (closed > 0) console.log(`Renewal job: closed ${closed} past_due subscription(s) past the grace window`);
  } catch (e) {
    console.error("expireLapsedPastDue threw (non-fatal):", e instanceof Error ? e.message : String(e));
  }
  return { closed, stamped };
}

// ── H5. Single-flight lease helpers ───────────────────────────────────────────
// The lease lives in public.job_locks and is taken/released through two
// SECURITY DEFINER RPCs (migration 20260823000004_job_locks.sql). It is a TTL
// lease rather than a session advisory lock because PostgREST answers from a
// CONNECTION POOL: a session-scoped lock taken in one HTTP round-trip is not
// reliably held for the next one, and leaks onto a pooled connection when the
// holder dies. A lease needs no cleanup — it expires.

export interface RenewalLease {
  outcome: LockOutcome;
  /** Opaque holder id. Only this id may release the lease. */
  holder: string;
}

async function acquireRenewalLease(adminClient: AdminClient): Promise<RenewalLease> {
  const holder = `${RENEWAL_JOB_LOCK_NAME}:${crypto.randomUUID()}`;
  let error: unknown = null;
  let data: unknown = null;

  try {
    const res = await adminClient.rpc("try_acquire_job_lock", {
      p_job: RENEWAL_JOB_LOCK_NAME,
      p_holder: holder,
      p_ttl_seconds: RENEWAL_JOB_LOCK_TTL_SECONDS,
    });
    error = res.error;
    data = res.data;
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }

  const outcome = classifyLockResult(error, data);

  if (outcome === "degraded_missing_rpc") {
    // FAIL SOFT, LOUDLY. The owner applies migrations by hand (CLAUDE.md forbids
    // `supabase db push`), so this state is expected between the code landing
    // and the SQL being run. Bricking the job here would mean no trial ever
    // converts and no subscription ever renews — strictly worse than the race.
    console.error(
      "Renewal job: SINGLE-FLIGHT LOCK UNAVAILABLE — public.try_acquire_job_lock does not exist. " +
      "Apply supabase/migrations/20260823000004_job_locks.sql by hand in the Supabase SQL Editor " +
      "(never `supabase db push`), then run: NOTIFY pgrst, 'reload schema'. " +
      "Continuing WITHOUT the lease so trials still convert and renewals still run — until the " +
      "migration is applied, two overlapping runs of this job could double-charge a stored card.",
    );
  } else if (outcome === "locked" && error) {
    // Any error that is NOT "the function is missing" leaves the lock state
    // UNKNOWN, and unknown is treated as HELD. Fail closed: skip the tick.
    const msg = (error as { message?: unknown })?.message;
    console.error(
      "Renewal job: lock acquisition failed — treating the lock as HELD and skipping this tick:",
      typeof msg === "string" ? msg : String(msg),
    );
  }

  return { outcome, holder };
}

async function releaseRenewalLease(adminClient: AdminClient, lease: RenewalLease): Promise<void> {
  // Nothing to release when the RPC is missing: this run never held a lease.
  if (lease.outcome !== "acquired") return;
  try {
    const { error } = await adminClient.rpc("release_job_lock", {
      p_job: RENEWAL_JOB_LOCK_NAME,
      p_holder: lease.holder,
    });
    if (error) {
      console.error(
        `Renewal job: lease release failed (${error.message}) — the lease expires by itself after ` +
        `${RENEWAL_JOB_LOCK_TTL_SECONDS}s, so at worst a few ticks are skipped.`,
      );
    }
  } catch (e) {
    console.error("Renewal job: lease release threw (non-fatal):", e instanceof Error ? e.message : String(e));
  }
}

// ── Local dead-letter writer ──────────────────────────────────────────────────
// Deliberately local rather than shared with moyasar-webhook's own
// insertDeadLetter: this job must stay editable without touching the webhook.
// It can NEVER throw — a failed dead letter must not abort a billing pass.
//
// `tap_status` is the historical column name in public.webhook_dead_letters.
// Tap is retired and is not coming back; the column is reused for "the upstream
// status that produced this dead letter" and is not evidence of a Tap code path.
async function insertDeadLetter(
  adminClient: AdminClient,
  params: { chargeId: string | null; status: string | null; reason: string; payload: unknown },
): Promise<void> {
  try {
    const { error } = await adminClient.from("webhook_dead_letters").insert({
      charge_id: params.chargeId,
      tap_status: params.status,
      reason: params.reason,
      payload: params.payload,
    });
    if (error) {
      console.error(`Dead-letter insert failed (non-fatal, reason=${params.reason}):`, error.message);
    }
  } catch (err) {
    console.error(
      `Dead-letter insert threw (non-fatal, reason=${params.reason}):`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Write a dead letter only if one with the same (reason, charge_id) does not
 * already exist. Used for conditions this job re-observes on EVERY tick and
 * never resolves by itself (a captured payment whose webhook was lost), so the
 * ledger does not grow by 24 rows a day per stuck payment. A failure of the
 * existence check falls through to inserting: a duplicate is better than
 * silence about money.
 */
async function insertDeadLetterOnce(
  adminClient: AdminClient,
  params: { chargeId: string | null; status: string | null; reason: string; payload: unknown },
): Promise<void> {
  try {
    const { count, error } = await adminClient
      .from("webhook_dead_letters")
      .select("id", { count: "exact", head: true })
      .eq("reason", params.reason)
      .eq("charge_id", params.chargeId);
    if (!error && (count ?? 0) > 0) return;
  } catch {
    // fall through and insert
  }
  await insertDeadLetter(adminClient, params);
}

// ── H7. The rejected-conversion zombie ────────────────────────────────────────
/**
 * Record ONE permanent refusal of the unattended post-trial charge and, once
 * MAX_TRIAL_CONVERSION_REFUSALS have accumulated, close the row.
 *
 * THE LEDGER. `user_subscriptions` has no refusal counter and none may be added,
 * so public.webhook_dead_letters carries the count. Column meanings for THESE
 * rows, which differ from the webhook's own use of the same table:
 *   charge_id  = the SUBSCRIPTION id (not a Moyasar payment id). This is the key
 *                the count is taken on.
 *   tap_status = the refusal reason from trialChargeAuthorized
 *                ("no_verified_plan_metadata" | "plan_mismatch" | "seat_escalation").
 *   reason     = TRIAL_CONVERSION_REFUSAL_REASON — the discriminator that keeps
 *                these rows out of every other dead-letter count.
 *   payload    = the full comparison, so ops can act without re-querying Moyasar.
 *
 * "Consecutive" needs no reset logic: a subscription that converts leaves
 * `trialing` and never re-enters this pass, so every counted row belongs to the
 * same unbroken episode.
 *
 * CUSTOMER MONEY — stated plainly. Expiring the row FORFEITS the customer's
 * 1.00 SAR card verification. The credit is only ever applied on a
 * `post_trial_first_charge` (computeCharge), and once the row is `expired` their
 * next checkout is an `immediate_charge` at the full plan price. That is a real,
 * small, one-off loss to the customer, accepted because the alternative is a row
 * that is refused forever and holds the customer's only LIVE subscription slot.
 */
async function recordTrialConversionRefusal(
  adminClient: AdminClient,
  sub: { id: string; user_id: string; plan_id: string | null; seat_count: number | null },
  refusalReason: string,
  verifiedRef: PaidPlanRef | null,
): Promise<{ forfeited: boolean }> {
  await insertDeadLetter(adminClient, {
    chargeId: sub.id,
    status: refusalReason,
    reason: TRIAL_CONVERSION_REFUSAL_REASON,
    payload: {
      subscription_id: sub.id,
      user_id: sub.user_id,
      row_plan_id: sub.plan_id ?? null,
      row_seat_count: sub.seat_count ?? null,
      verified_plan_id: verifiedRef?.plan_id ?? null,
      verified_seat_count: verifiedRef?.seat_count ?? null,
      refusal_reason: refusalReason,
      recorded_at: new Date().toISOString(),
    },
  });

  const { count, error } = await adminClient
    .from("webhook_dead_letters")
    .select("id", { count: "exact", head: true })
    .eq("reason", TRIAL_CONVERSION_REFUSAL_REASON)
    .eq("charge_id", sub.id);

  if (error) {
    // Unknown count -> do NOT close the row. Cutting a customer off on an
    // unreadable counter is the one outcome here that waiting cannot undo.
    console.error(`Sub ${sub.id}: refusal count failed, leaving the row open:`, error.message);
    return { forfeited: false };
  }

  const outcome = trialRefusalOutcome(count ?? 0);
  if (!outcome.expire) {
    console.error(
      `Sub ${sub.id}: permanent trial-conversion refusal ${count ?? 0}/${MAX_TRIAL_CONVERSION_REFUSALS} ` +
      `(${refusalReason}) — ${outcome.remaining} more before the row is expired`,
    );
    return { forfeited: false };
  }

  // Close it out. `expired`, not `cancelled`: the customer never asked for this
  // to end. A cancelled trial cannot reach here at all — the conversion query
  // filters cancel_at_period_end = false, and expireUnbillableTrials owns that
  // case. The .eq("status", "trialing") guard means a conversion that landed
  // concurrently (through the normal checkout) is never overwritten.
  const { data: closedRows, error: closeError } = await adminClient
    .from("user_subscriptions")
    .update({ status: "expired" })
    .eq("id", sub.id)
    .eq("status", "trialing")
    .select("id");

  if (closeError) {
    console.error(`Sub ${sub.id}: could not expire the refused trial:`, closeError.message);
    return { forfeited: false };
  }
  if (!closedRows || closedRows.length === 0) {
    console.log(`Sub ${sub.id}: refused trial had already left "trialing" — nothing to expire`);
    return { forfeited: false };
  }

  // Same entitlement sync expireUnbillableTrials performs: a closed trial must
  // never keep a paid plan_type.
  const { error: planTypeError } = await adminClient
    .from("profiles")
    .update({ plan_type: "free" })
    .eq("user_id", sub.user_id);
  if (planTypeError) {
    console.error(`Sub ${sub.id}: plan_type sync failed after expiring the refused trial:`, planTypeError.message);
  }

  console.error(
    `Sub ${sub.id}: EXPIRED after ${MAX_TRIAL_CONVERSION_REFUSALS} permanent trial-conversion refusals ` +
    `(${refusalReason}). The customer's ${CARD_VERIFICATION_AMOUNT}-halala card verification is FORFEITED: ` +
    `the credit only applies to a post_trial_first_charge, and their next checkout is an immediate_charge ` +
    `at the full plan price.`,
  );

  await insertDeadLetter(adminClient, {
    chargeId: sub.id,
    status: refusalReason,
    reason: TRIAL_CONVERSION_FORFEIT_REASON,
    payload: {
      subscription_id: sub.id,
      user_id: sub.user_id,
      refusals: count ?? 0,
      refusal_reason: refusalReason,
      forfeited_verification_halalas: CARD_VERIFICATION_AMOUNT,
      expired_at: new Date().toISOString(),
    },
  });

  return { forfeited: true };
}

// ── M9 / M11. payment_transactions stuck at `initiated` ───────────────────────
/**
 * A `payment_transactions` row left at `status = 'initiated'` blocks BOTH
 * idempotency guards in this job (each matches `initiated` as well as
 * `captured`), so its subscription is never charged again — the trial never
 * converts, the renewal never happens.
 *
 * This pass is also the single most dangerous thing in this file: flipping a row
 * that actually SUCCEEDED to `failed` unblocks the guard and lets the next tick
 * charge the customer a second time. Every branch is therefore biased toward
 * leaving the row alone:
 *
 *   moyasar_payment_id IS NULL -> the id was never stamped. This does NOT mean
 *                                 the charge never reached Moyasar: both writers
 *                                 insert the row BEFORE the POST, and
 *                                 moyasar-initiate-token-payment's stamp-failure
 *                                 path leaves exactly this shape AFTER a real
 *                                 charge. Closed anyway (an open row starves the
 *                                 subscription forever) but with an honest
 *                                 failure_message and a deduped dead letter, so
 *                                 a human can reconcile it against Moyasar.
 *                                 R4-CRITICAL-2.
 *   Moyasar "initiated"        -> created-but-not-captured; after
 *                                 STALE_INITIATED_AFTER_MS it will never
 *                                 complete. Closed.
 *   Moyasar "failed"           -> authoritative. Closed.
 *   Moyasar "paid"             -> NEVER closed. Logged loudly and dead-lettered:
 *                                 a captured payment whose webhook was lost
 *                                 needs a REPLAY, and stamping it `failed` is
 *                                 precisely how the customer gets charged twice.
 *   anything else / lookup err -> left exactly as it is, re-examined next tick.
 *
 * `created_at` is NEVER modified. chargeRetryEligibility derives the 24h backoff
 * from it, and preserving it is what stops a resolved row from being re-charged
 * in the same or the next tick.
 *
 * R4-CRITICAL-2 (iv) - are STALE_INITIATED_NO_PAYMENT_ID rows counted by
 * chargeRetryEligibility's failedCount? YES, deliberately, and they are not
 * excluded. The argument is asymmetric-risk, not tidiness:
 *   * If the charge truly never left, counting it costs the customer one of four
 *     attempts and delays their renewal by the 24h backoff. Recoverable, visible
 *     in the dead letter, and the past-due expiry closes the episode loudly.
 *   * If the charge DID leave and was captured, excluding it would clear the
 *     backoff and let the very next tick charge the same card again. That is an
 *     unrecoverable double charge on a real customer.
 * We cannot tell the two apart from inside this job - that is the entire reason
 * the dead letter exists - so the count stays, and the backoff it imposes is a
 * FEATURE: it buys 24h for the lost webhook to arrive or for ops to act.
 *
 * `user_subscriptions.status` is NEVER modified here either. The charge outcome
 * for a lost payment is not certain enough to cut access or to stamp `past_due`.
 */
interface StaleInitiatedSummary {
  markedFailed: number;
  paidNeedsReplay: number;
  leftAlone: number;
}

async function resolveStaleInitiatedTransactions(
  adminClient: AdminClient,
  moyasarSecretKey: string,
): Promise<StaleInitiatedSummary> {
  const out: StaleInitiatedSummary = { markedFailed: 0, paidNeedsReplay: 0, leftAlone: 0 };
  try {
    const staleCutoff = new Date(Date.now() - STALE_INITIATED_AFTER_MS).toISOString();

    // (a) No Moyasar payment id was ever stamped on this row.
    //
    // R4-CRITICAL-2. This branch used to claim "never reached Moyasar, so no
    // money can have moved". That premise is FALSE and it was load-bearing:
    //   * both writers INSERT the `initiated` row BEFORE the Moyasar POST and
    //     stamp the id afterwards, so the unstamped window covers a real charge;
    //   * moyasar-initiate-token-payment's stamp-failure path deliberately
    //     LEAVES this exact shape after a charge has already been sent, and its
    //     own comment records that no pass reconciles such rows.
    // An unstamped row therefore proves only that the id is missing. A payment
    // may exist upstream and may even have been captured.
    //
    // The row is still closed, because leaving it `initiated` blocks BOTH
    // idempotency guards and that subscription would never be charged again.
    // But it is closed HONESTLY and every closure is dead-lettered: the only way
    // to learn the truth is to search Moyasar by metadata.subscription_id around
    // the insert time, and that needs a human.
    const { data: noPaymentId, error: noPaymentIdError } = await adminClient
      .from("payment_transactions")
      .update({
        status: "failed",
        failure_code: STALE_INITIATED_NO_PAYMENT_ID_CODE,
        failure_message:
          "Closed by the stale-initiated pass: no Moyasar payment id was ever stamped on this row. " +
          "This does NOT prove the charge never reached Moyasar - a payment may exist upstream, " +
          "possibly captured. Search Moyasar by metadata.subscription_id around created_at.",
      })
      .eq("status", "initiated")
      .lt("created_at", staleCutoff)
      .is("moyasar_payment_id", null)
      .select("id, subscription_id, user_id, amount, currency, payment_type, created_at");

    if (noPaymentIdError) {
      console.error("Stale-initiated pass: bulk close failed:", noPaymentIdError.message);
    } else if (noPaymentId && noPaymentId.length > 0) {
      out.markedFailed += noPaymentId.length;
      console.warn(
        `Stale-initiated pass: closed ${noPaymentId.length} transaction(s) with no Moyasar payment id. ` +
        `A charge MAY exist upstream for each - see the stale_initiated_no_payment_id dead letters.`,
      );

      // R4-CRITICAL-2 (i). One deduped letter per closed row. Deduped on
      // (reason, charge_id) so a row can only ever produce one, and keyed by the
      // transaction id because these rows have no payment id to key on - that is
      // the whole condition being reported.
      for (const row of noPaymentId as Array<Record<string, any>>) {
        await insertDeadLetterOnce(adminClient, {
          chargeId: `tx:${row.id}`,
          status: "unknown",
          reason: "stale_initiated_no_payment_id",
          payload: {
            note:
              "payment_transactions row sat at `initiated` with no moyasar_payment_id for longer " +
              "than STALE_INITIATED_AFTER_MS and was closed as failed so it stops blocking the " +
              "idempotency guards. The charge may or may not have reached Moyasar. Search Moyasar " +
              "by metadata.subscription_id for payments created around inserted_at; if one was " +
              "captured, reconcile it manually and refund any duplicate.",
            transaction_id: row.id,
            subscription_id: row.subscription_id ?? null,
            user_id: row.user_id ?? null,
            amount: row.amount ?? null,
            currency: row.currency ?? null,
            payment_type: row.payment_type ?? null,
            inserted_at: row.created_at ?? null,
            closed_at: new Date().toISOString(),
          },
        });
      }
    }

    // (b) Reached Moyasar: the truth is upstream. Bounded to
    // STALE_INITIATED_LOOKUP_CAP HTTPS round-trips per run so this pass cannot
    // eat the wall-clock budget the charge loop needs. Oldest first; anything
    // not reached this tick is already hours old and waits another hour.
    const { data: withPaymentId, error: withPaymentIdError } = await adminClient
      .from("payment_transactions")
      .select("id, subscription_id, user_id, moyasar_payment_id, payment_type, amount, created_at")
      .eq("status", "initiated")
      .lt("created_at", staleCutoff)
      .not("moyasar_payment_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(STALE_INITIATED_LOOKUP_CAP);

    if (withPaymentIdError) {
      console.error("Stale-initiated pass: query failed:", withPaymentIdError.message);
      return out;
    }

    for (const tx of (withPaymentId ?? []) as any[]) {
      const looked = await fetchMoyasarPaymentStatus(moyasarSecretKey, tx.moyasar_payment_id);
      if (!looked.ok) {
        // Unknown upstream state -> leave the row exactly as it is.
        out.leftAlone++;
        continue;
      }

      const decision = resolveStaleInitiated(looked.status);

      if (decision.action === "mark_failed") {
        const { data: flipped, error: flipError } = await adminClient
          .from("payment_transactions")
          .update({
            status: "failed",
            failure_code: decision.failureCode,
            failure_message: `Resolved by the stale-initiated pass — Moyasar reports "${looked.status}"`,
          })
          .eq("id", tx.id)
          // Re-assert `initiated`: a webhook may have written the real outcome
          // between the SELECT above and this UPDATE, and it must win.
          .eq("status", "initiated")
          .select("id");

        if (flipError) {
          console.error(`Stale-initiated pass: could not close transaction ${tx.id}:`, flipError.message);
          out.leftAlone++;
        } else if (!flipped || flipped.length === 0) {
          console.log(`Stale-initiated pass: transaction ${tx.id} changed status concurrently — left alone`);
          out.leftAlone++;
        } else {
          out.markedFailed++;
          console.log(
            `Stale-initiated pass: transaction ${tx.id} (payment ${tx.moyasar_payment_id}) -> failed ` +
            `(${decision.failureCode}); created_at preserved so the 24h charge backoff still applies`,
          );
        }
        continue;
      }

      if (decision.action === "dead_letter_paid") {
        out.paidNeedsReplay++;
        console.error(
          `Stale-initiated pass: transaction ${tx.id} is still "initiated" locally but Moyasar reports ` +
          `PAID (payment ${tx.moyasar_payment_id}, subscription ${tx.subscription_id}). Its webhook was ` +
          `LOST. The row is left untouched ON PURPOSE: stamping it "failed" would unblock the idempotency ` +
          `guard and let the next tick charge this customer a SECOND time. Replay the webhook or reconcile ` +
          `by hand.`,
        );
      } else {
        out.leftAlone++;
        console.error(
          `Stale-initiated pass: transaction ${tx.id} left alone — Moyasar reports the unhandled status ` +
          `"${looked.status}" (payment ${tx.moyasar_payment_id}). An unknown state is never treated as ` +
          `safe to re-charge.`,
        );
      }

      // Written once per (reason, payment id): this job never resolves these
      // rows by itself, so it would otherwise re-report them on every tick.
      await insertDeadLetterOnce(adminClient, {
        chargeId: tx.moyasar_payment_id,
        status: looked.status,
        reason: decision.deadLetterReason ?? "stale_initiated_unexpected_status",
        payload: {
          transaction_id: tx.id,
          subscription_id: tx.subscription_id ?? null,
          user_id: tx.user_id ?? null,
          payment_type: tx.payment_type ?? null,
          amount: tx.amount ?? null,
          transaction_created_at: tx.created_at ?? null,
          moyasar_status: looked.status,
        },
      });
    }
  } catch (e) {
    console.error(
      "resolveStaleInitiatedTransactions threw (non-fatal):",
      e instanceof Error ? e.message : String(e),
    );
  }
  return out;
}

/** Read one payment's status from Moyasar. `ok:false` means "do not act". */
async function fetchMoyasarPaymentStatus(
  moyasarSecretKey: string,
  paymentId: string,
): Promise<{ ok: boolean; status: string | null }> {
  try {
    const res = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: { Authorization: `Basic ${btoa(moyasarSecretKey + ":")}` },
    });
    if (!res.ok) {
      console.error(`Stale-initiated lookup: Moyasar returned HTTP ${res.status} for payment ${paymentId}`);
      return { ok: false, status: null };
    }
    const body = await res.json();
    const status = typeof body?.status === "string" ? body.status : null;
    if (!status) {
      console.error(`Stale-initiated lookup: Moyasar payment ${paymentId} carries no status field`);
      return { ok: false, status: null };
    }
    return { ok: true, status };
  } catch (e) {
    console.error(
      `Stale-initiated lookup threw for payment ${paymentId}:`,
      e instanceof Error ? e.message : String(e),
    );
    return { ok: false, status: null };
  }
}

// -- Verified plan reference for the post-trial charge (defect C1) -------------
// The unattended trial conversion may only bill the plan/seats the stored card
// was actually VERIFIED against. That fact lives in the metadata of the 1.00 SAR
// verification payment, whose id is stamped on the subscription row by
// moyasar-webhook. A payment created before this change carries no plan_id, and
// trialChargeAuthorized() treats that as "nothing to compare" so pre-existing
// trials are not stranded.
async function fetchVerifiedPlanRef(
  moyasarSecretKey: string,
  paymentId: string | null | undefined,
): Promise<{ ok: boolean; ref: PaidPlanRef | null }> {
  if (!paymentId) return { ok: true, ref: null };
  try {
    const res = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: { Authorization: `Basic ${btoa(moyasarSecretKey + ":")}` },
    });
    if (!res.ok) {
      console.error(`Verified-plan lookup: Moyasar returned HTTP ${res.status}`);
      return { ok: false, ref: null };
    }
    const body = await res.json();
    return { ok: true, ref: parsePaidPlanRef(body?.metadata) };
  } catch (e) {
    console.error("Verified-plan lookup threw:", e instanceof Error ? e.message : String(e));
    return { ok: false, ref: null };
  }
}

// Mark subscription past_due; stamp past_due_since on first failure only (idempotent)
async function markPastDue(
  adminClient: AdminClient,
  sub: { id: string; user_id: string; past_due_since: string | null },
): Promise<void> {
  const pastDueSince = sub.past_due_since ?? new Date().toISOString();
  const updates: Record<string, any> = { status: "past_due" };
  if (!sub.past_due_since) updates.past_due_since = pastDueSince;
  const { error } = await adminClient.from("user_subscriptions").update(updates).eq("id", sub.id);
  if (error) { console.error(`markPastDue: failed on sub ${sub.id}:`, error); return; }

  // Atomic dunning claim — exactly one email per past_due episode
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
      if (userEmail) await sendDunningEmail({ userEmail, pastDueSince });
    } else {
      console.log("Dunning already claimed for sub:", sub.id);
    }
  } catch (e) {
    console.error("Dunning error (non-fatal):", e instanceof Error ? e.message : String(e));
  }
}

// Dunning email via Resend — bilingual AR/EN
async function sendDunningEmail(params: { userEmail: string; pastDueSince: string }): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) { console.warn("RESEND_API_KEY not configured — dunning email skipped"); return; }

  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ConsultX <noreply@consultx.app>";
  const accountUrl = "https://consultx.app/account";
  const graceEnd = new Date(new Date(params.pastDueSince).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
  const graceEndAr = graceEnd.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  const graceEndEn = graceEnd.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>ConsultX</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px 16px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:13px;margin:0 0 8px">ConsultX</p>
  <h1 style="color:#111827;font-size:20px;margin:0 0 16px;font-weight:700">تعذّر تجديد اشتراكك</h1>
  <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 12px">
    تعذّر على نظامنا تجديد اشتراكك تلقائيًا.
    يبقى وصولك الكامل محفوظًا حتى <strong>${graceEndAr}</strong>.
  </p>
  <a href="${accountUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">إدارة الاشتراك</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
  <div dir="ltr" style="text-align:left">
    <h2 style="color:#111827;font-size:16px;margin:0 0 10px;font-weight:700">Your ConsultX subscription renewal failed</h2>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 10px">
      Your full access is preserved until <strong>${graceEndEn}</strong>.
    </p>
    <a href="${accountUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">Manage Subscription</a>
  </div>
  <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#9ca3af;font-size:12px;margin:0;direction:ltr;text-align:left">
    ConsultX &middot; support@consultx.app
  </p>
</div></body></html>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [params.userEmail],
        subject: "تعذّر تجديد اشتراكك في ConsultX | Your ConsultX subscription renewal failed", html }),
    });
    if (!r.ok) { const b = await r.text(); console.error("Resend error:", r.status, b.slice(0, 300)); }
    else console.log("Dunning email sent to:", params.userEmail);
  } catch (e) { console.error("Dunning network error:", e instanceof Error ? e.message : String(e)); }
}