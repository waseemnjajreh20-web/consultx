import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeCharge,
  isUndefinedColumnError,
  OPTIONAL_TRANSACTION_COLUMNS,
  planPriceFor,
  splitVat,
  withoutKeys,
} from "../_shared/billing.ts";

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
// Pass 0 is what makes trials convert to revenue. Without it a
// trialing row stays trialing forever and is never billed.
//
// Contract: docs/launch/billing-contract-20260823.md
// Triggered by pg_cron via HTTP (hourly). Not user-callable.
// ============================================================

/** Columns every pass needs. card_verified_at is appended separately
 *  because it only exists after the Section 8 migration. */
const SUB_SELECT = `
      id, user_id, plan_id, moyasar_card_token, seat_count, status, trial_end,
      cancel_at_period_end, next_billing_date, current_period_end, past_due_since,
      subscription_plans ( price_amount, price_per_seat, min_seats, currency, duration_days, name_en, slug )
    `;

serve(async (req) => {
  // Auth: validate CRON_SECRET if configured
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
  const moyasarSecretKey = Deno.env.get("MOYASAR_SECRET_KEY");

  if (!moyasarSecretKey) {
    console.error("MOYASAR_SECRET_KEY not configured — cannot attempt renewal charges");
    return new Response(JSON.stringify({ error: "MOYASAR_SECRET_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

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
      JSON.stringify({ processed: 0, skipped: 0, failed: 0, total: 0, trials_converted: 0, trials_expired: expiredTrials }),
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

    const { count: failedCount } = await adminClient
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.id)
      .eq("payment_type", "renewal")
      .eq("status", "failed")
      .gte("created_at", periodWindowStart);

    // Insert renewal transaction row BEFORE charging (idempotency anchor).
    // Trial conversions are recorded as payment_type "renewal" too, so the
    // dunning / retry machinery and the "was this sub ever really paid?"
    // counter treat them uniformly.
    const vatSplit = splitVat(chargeAmount);
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
    trials_expired: expiredTrials,
  };
  console.log("Renewal job complete:", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});

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