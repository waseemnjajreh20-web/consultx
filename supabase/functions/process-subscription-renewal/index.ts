import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Must match GRACE_DAYS in check-subscription, moyasar-webhook,
// Workspace.tsx, and Account.tsx.
const GRACE_DAYS = 7;

// ============================================================
// process-subscription-renewal
//
// Mission: find active subscriptions whose next_billing_date
// has arrived, charge the stored card via Moyasar MIT, and
// update the subscription period on success.
//
// Triggered by pg_cron via HTTP (hourly). Not user-callable.
// ============================================================

serve(async (req) => {
  // ── Auth: validate CRON_SECRET if configured ─────────────────────────────
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

  // ── 1. Query renewal-eligible subscriptions ───────────────────────────────
  // Safety window: pick up subscriptions due within the next 60 minutes so a
  // cron job that fires slightly late never silently skips a due subscription.
  const safetyWindowMs = 60 * 60 * 1000;
  const cutoff = new Date(Date.now() + safetyWindowMs).toISOString();

  const { data: dueSubscriptions, error: queryError } = await adminClient
    .from("user_subscriptions")
    .select(`
      id,
      user_id,
      plan_id,
      moyasar_card_token,
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
    .not("moyasar_card_token", "is", null);

  if (queryError) {
    console.error("Failed to query due subscriptions:", queryError);
    return new Response(JSON.stringify({ error: "Query failed", details: queryError }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 1b. Past-due retry: subscriptions that failed renewal within grace window ─
  const graceCutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: pastDueSubs, error: pastDueError } = await adminClient
    .from("user_subscriptions")
    .select(`
      id,
      user_id,
      plan_id,
      moyasar_card_token,
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
    .not("moyasar_card_token", "is", null)
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

    // ── 3. Determine retry_count ──────────────────────────────────────────────
    const { count: failedCount } = await adminClient
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.id)
      .eq("payment_type", "renewal")
      .eq("status", "failed")
      .gte("created_at", periodWindowStart);

    const retryCount = failedCount ?? 0;
    const givenId = crypto.randomUUID();

    // ── 4. Insert renewal transaction BEFORE calling Moyasar ─────────────────
    const { data: txRecord, error: txInsertError } = await adminClient
      .from("payment_transactions")
      .insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        moyasar_payment_id: null,
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

    // ── 5. Charge via Moyasar MIT (stored card token — no separate tokenize step) ─
    const chargePayload = {
      amount: plan.price_amount, // already in halalas
      currency: plan.currency || "SAR",
      description: `Subscription renewal — ${plan.name_en}`,
      given_id: givenId,
      source: {
        type: "token",
        token: sub.moyasar_card_token,
      },
      metadata: {
        subscription_id: sub.id,
        payment_type: "renewal",
        tx_id: txId,
      },
    };

    const moyasarAuth = "Basic " + btoa(moyasarSecretKey + ":");

    let chargeData: any;
    let chargeResponseOk = false;
    try {
      const chargeResponse = await fetch("https://api.moyasar.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: moyasarAuth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chargePayload),
      });
      chargeData = await chargeResponse.json();
      chargeResponseOk = chargeResponse.ok;
    } catch (chargeErr) {
      const errMsg = chargeErr instanceof Error ? chargeErr.message : String(chargeErr);
      console.error(`Sub ${sub.id}: Moyasar charge network error:`, errMsg);
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
      const errCode = chargeData?.type ?? "CHARGE_REJECTED";
      const errMsg = chargeData?.message ?? JSON.stringify(chargeData);
      console.error(`Sub ${sub.id}: Moyasar rejected charge (${errCode}):`, errMsg);
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

    // ── 6. Map Moyasar status and update records ──────────────────────────────
    const mappedStatus =
      chargeData.status === "paid"     ? "captured"
      : chargeData.status === "failed" ? "failed"
      : "initiated"; // async path — moyasar-webhook will deliver final outcome

    const txUpdate: Record<string, any> = {
      moyasar_payment_id: chargeData.id,
      status: mappedStatus,
    };
    if (chargeData.status === "failed") {
      txUpdate.failure_code    = chargeData.source?.message ?? null;
      txUpdate.failure_message = chargeData.source?.message ?? null;
    }
    await adminClient.from("payment_transactions").update(txUpdate).eq("id", txId);

    if (chargeData.status === "paid") {
      // Immediate capture — update subscription period directly.
      // The webhook may also fire but the idempotent update is harmless.
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
      console.log(
        `Sub ${sub.id}: renewed (paid) — next billing ${newPeriodEnd.toISOString()}`,
      );
      processed++;
    } else if (chargeData.status === "failed") {
      await markPastDue(adminClient, sub);
      console.error(`Sub ${sub.id}: Moyasar returned failed — marked past_due`);
      failed++;
    } else {
      // Async path (initiated): moyasar-webhook will deliver final outcome
      console.log(
        `Sub ${sub.id}: payment ${chargeData.id} ${chargeData.status} — awaiting webhook`,
      );
      processed++;
    }
  }

  const summary = { processed, skipped, failed, total: allDue.length };
  console.log("Renewal job complete:", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Helper: mark subscription past_due; atomic dunning email claim ────────────
async function markPastDue(
  adminClient: ReturnType<typeof createClient>,
  sub: { id: string; user_id: string; past_due_since: string | null },
): Promise<void> {
  const pastDueSince = sub.past_due_since ?? new Date().toISOString();
  const updates: Record<string, any> = { status: "past_due" };
  if (!sub.past_due_since) updates.past_due_since = pastDueSince;

  const { error } = await adminClient
    .from("user_subscriptions")
    .update(updates)
    .eq("id", sub.id);

  if (error) {
    console.error(`markPastDue: failed on sub ${sub.id}:`, error);
    return;
  }

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
      if (!userEmail) {
        console.warn(`Dunning: no email for user ${sub.user_id} — email skipped`);
      } else {
        await sendDunningEmail({ userEmail, pastDueSince });
      }
    } else {
      console.log("Dunning already claimed for sub:", sub.id, "— email skipped");
    }
  } catch (dunningErr) {
    console.error(
      "Dunning email error (non-fatal):",
      dunningErr instanceof Error ? dunningErr.message : String(dunningErr),
    );
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
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const graceEndEn = graceEnd.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>ConsultX</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px 16px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">

  <p style="color:#6b7280;font-size:13px;margin:0 0 8px">ConsultX</p>
  <h1 style="color:#111827;font-size:20px;margin:0 0 16px;font-weight:700">
    تعذّر تجديد اشتراكك
  </h1>
  <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 12px">
    تعذّر على نظامنا تجديد اشتراكك تلقائيًا.
    يبقى وصولك الكامل محفوظًا حتى <strong>${graceEndAr}</strong>.
  </p>
  <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px">
    يرجى مراجعة بيانات الدفع أو الاشتراك من جديد قبل انتهاء فترة السماح للحفاظ على وصولك.
  </p>
  <a href="${accountUrl}"
     style="display:inline-block;background:#dc2626;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">
    إدارة الاشتراك
  </a>

  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">

  <div dir="ltr" style="text-align:left">
    <h2 style="color:#111827;font-size:16px;margin:0 0 10px;font-weight:700">
      Your ConsultX subscription renewal failed
    </h2>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 10px">
      We were unable to renew your subscription automatically.
      Your full access is preserved until <strong>${graceEndEn}</strong>.
    </p>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 20px">
      Please update your payment details or resubscribe before the grace period ends
      to maintain uninterrupted access.
    </p>
    <a href="${accountUrl}"
       style="display:inline-block;background:#dc2626;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">
      Manage Subscription
    </a>
  </div>

  <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#9ca3af;font-size:12px;margin:0;direction:ltr;text-align:left">
    ConsultX &middot; info@consultx.app &middot;
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
        subject:
          "تعذّر تجديد اشتراكك في ConsultX | Your ConsultX subscription renewal failed",
        html,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("Resend API error:", response.status, body.slice(0, 300));
    } else {
      console.log("Dunning email sent successfully to:", params.userEmail);
    }
  } catch (err) {
    console.error(
      "Dunning email network error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
