import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Must match GRACE_DAYS in check-subscription, moyasar-webhook,
// Workspace.tsx, and Account.tsx.
const GRACE_DAYS = 7;

// ============================================================
// process-subscription-renewal
//
// Mission: find active subscriptions whose next_billing_date
// has arrived, charge the stored Moyasar card token (MIT), and
// update the subscription period on success.
//
// Triggered by pg_cron via HTTP (hourly). Not user-callable.
// ============================================================

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

  // 1. Active subscriptions due for renewal (have moyasar_card_token)
  const safetyWindowMs = 60 * 60 * 1000;
  const cutoff = new Date(Date.now() + safetyWindowMs).toISOString();

  const { data: dueSubscriptions, error: queryError } = await adminClient
    .from("user_subscriptions")
    .select(`
      id, user_id, plan_id, moyasar_card_token,
      next_billing_date, current_period_end, past_due_since,
      subscription_plans ( price_amount, currency, duration_days, name_en, slug )
    `)
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .not("next_billing_date", "is", null)
    .lte("next_billing_date", cutoff)
    .not("moyasar_card_token", "is", null);

  if (queryError) {
    console.error("Failed to query due subscriptions:", queryError);
    return new Response(JSON.stringify({ error: "Query failed", details: queryError }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  // 1b. Past-due subscriptions within grace window
  const graceCutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: pastDueSubs, error: pastDueError } = await adminClient
    .from("user_subscriptions")
    .select(`
      id, user_id, plan_id, moyasar_card_token,
      next_billing_date, current_period_end, past_due_since,
      subscription_plans ( price_amount, currency, duration_days, name_en, slug )
    `)
    .eq("status", "past_due")
    .eq("cancel_at_period_end", false)
    .not("moyasar_card_token", "is", null)
    .not("past_due_since", "is", null)
    .gte("past_due_since", graceCutoff);

  if (pastDueError) console.error("Failed to query past_due subscriptions:", pastDueError);

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

  let processed = 0, skipped = 0, failed = 0;

  for (const sub of allDue) {
    const plan = sub.subscription_plans as any;
    if (!plan || plan.price_amount == null) { skipped++; continue; }

    if (plan.price_amount === 0) {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + (plan.duration_days || 30) * 24 * 60 * 60 * 1000);
      await adminClient.from("user_subscriptions").update({
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_billing_date: periodEnd.toISOString(),
      }).eq("id", sub.id);
      processed++; continue;
    }

    // Idempotency: skip if renewal tx already exists for this period
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

    if (existingTx) { skipped++; continue; }

    const { count: failedCount } = await adminClient
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.id)
      .eq("payment_type", "renewal")
      .eq("status", "failed")
      .gte("created_at", periodWindowStart);

    // Insert renewal transaction row BEFORE charging (idempotency anchor)
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
        retry_count: failedCount ?? 0,
      })
      .select("id")
      .single();

    if (txInsertError || !txRecord) { skipped++; continue; }
    const txId = txRecord.id;

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
          amount: plan.price_amount,
          currency: plan.currency || "SAR",
          description: `Subscription renewal — ${plan.name_en}`,
          callback_url: webhookUrl,
          source: { type: "token", token: sub.moyasar_card_token },
          metadata: { subscription_id: sub.id, payment_type: "renewal" },
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
      console.log(`Sub ${sub.id}: renewed (paid) — next billing ${newPeriodEnd.toISOString()}`);
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

  const summary = { processed, skipped, failed, total: allDue.length };
  console.log("Renewal job complete:", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});

// Mark subscription past_due; stamp past_due_since on first failure only (idempotent)
async function markPastDue(
  adminClient: ReturnType<typeof createClient>,
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