import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Must match GRACE_DAYS in check-subscription, process-subscription-renewal,
// Workspace.tsx, and Account.tsx.
const GRACE_DAYS = 7;

// ============================================================
// moyasar-webhook
//
// Receives Moyasar payment events and updates subscription state.
//
// Signature verification:
//   X-Moyasar-Signature = Base64(HMAC-SHA256(rawBody, MOYASAR_WEBHOOK_SECRET))
//
// Event routing:
//   "paid"   → store card token, activate or keep trialing
//   "failed" → mark past_due, send dunning email (atomic claim)
//   other    → acknowledge and ignore (non-terminal)
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                   MOYASAR_WEBHOOK_SECRET, RESEND_API_KEY (optional)
// ============================================================

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-moyasar-signature");
  const webhookSecret = Deno.env.get("MOYASAR_WEBHOOK_SECRET");

  if (!webhookSecret) {
    console.error("MOYASAR_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (signature) {
    const valid = await verifySignature(rawBody, signature, webhookSecret);
    if (!valid) {
      console.error("Invalid Moyasar webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("No X-Moyasar-Signature header — proceeding unverified");
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  // Moyasar can send the payment object flat OR wrapped as {type, data: {...}}
  const payment = event.data ?? event;
  const paymentId: string = payment.id;
  const paymentStatus: string = payment.status;
  const metadata: Record<string, string> = payment.metadata ?? {};

  // Only process terminal statuses
  if (paymentStatus !== "paid" && paymentStatus !== "failed") {
    console.log(`Webhook: ignoring non-terminal status "${paymentStatus}" for ${paymentId}`);
    return new Response(JSON.stringify({ received: true, action: "ignored" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const subscriptionId = metadata.subscription_id;

  if (!subscriptionId) {
    console.error(`Webhook: payment ${paymentId} has no metadata.subscription_id — dead letter`);
    await insertDeadLetter(adminClient, paymentId, paymentStatus, rawBody, "no_subscription_id");
    return new Response(JSON.stringify({ received: true, action: "dead_letter" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: sub, error: subError } = await adminClient
    .from("user_subscriptions")
    .select("id, user_id, status, past_due_since, dunning_notified_at, subscription_plans(duration_days, name_en)")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (subError || !sub) {
    console.error(`Webhook: subscription ${subscriptionId} not found — dead letter`);
    await insertDeadLetter(adminClient, paymentId, paymentStatus, rawBody, "subscription_not_found");
    return new Response(JSON.stringify({ received: true, action: "dead_letter" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const originalStatus = sub.status;

  if (paymentStatus === "paid") {
    const cardToken: string | undefined = payment.source?.token;
    const plan = sub.subscription_plans as any;
    const durationDays = plan?.duration_days ?? 30;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    if (originalStatus === "trialing") {
      // Card added during active trial — store token, trial continues unchanged
      await adminClient
        .from("user_subscriptions")
        .update({
          moyasar_card_token: cardToken ?? null,
          moyasar_payment_id: paymentId,
        })
        .eq("id", sub.id);
      console.log(`Webhook: trialing sub ${sub.id} — card stored, trial continues`);

    } else if (originalStatus === "pending_activation") {
      // First payment for no-trial user — activate
      await adminClient
        .from("user_subscriptions")
        .update({
          status: "active",
          moyasar_card_token: cardToken ?? null,
          moyasar_payment_id: paymentId,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          next_billing_date: periodEnd.toISOString(),
          past_due_since: null,
          dunning_notified_at: null,
        })
        .eq("id", sub.id);
      console.log(`Webhook: sub ${sub.id} activated from pending_activation`);

    } else if (originalStatus === "active") {
      // Renewal payment confirmed via webhook (async path from process-subscription-renewal)
      await adminClient
        .from("user_subscriptions")
        .update({
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          next_billing_date: periodEnd.toISOString(),
          past_due_since: null,
          dunning_notified_at: null,
        })
        .eq("id", sub.id);
      await adminClient
        .from("payment_transactions")
        .update({ status: "captured" })
        .eq("moyasar_payment_id", paymentId);
      console.log(`Webhook: renewal confirmed for sub ${sub.id}`);

    } else {
      console.warn(`Webhook: unexpected sub status "${originalStatus}" for paid event on ${sub.id}`);
      await insertDeadLetter(adminClient, paymentId, paymentStatus, rawBody, `unexpected_sub_status_${originalStatus}`);
      return new Response(JSON.stringify({ received: true, action: "dead_letter" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log to payment_transactions if not already recorded by renewal job
    const { data: existingTx } = await adminClient
      .from("payment_transactions")
      .select("id")
      .eq("moyasar_payment_id", paymentId)
      .maybeSingle();

    if (!existingTx) {
      const isActivation = originalStatus === "pending_activation" || originalStatus === "trialing";
      await adminClient.from("payment_transactions").insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        moyasar_payment_id: paymentId,
        amount: payment.amount ?? 0,
        currency: payment.currency ?? "SAR",
        status: "captured",
        payment_type: isActivation ? "activation" : "renewal",
      });
    }

  } else if (paymentStatus === "failed") {
    // Only act on renewals — failed card-add (trialing/pending_activation) is user's problem
    if (originalStatus === "active" || originalStatus === "past_due") {
      await markPastDue(adminClient, sub);
      await adminClient
        .from("payment_transactions")
        .update({
          status: "failed",
          failure_code: payment.source?.message ?? null,
          failure_message: payment.source?.message ?? null,
        })
        .eq("moyasar_payment_id", paymentId);
      console.log(`Webhook: renewal failed for sub ${sub.id} — marked past_due`);
    } else {
      console.log(`Webhook: failed payment ${paymentId} on sub ${sub.id} (${originalStatus}) — no action`);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Signature verification ────────────────────────────────────────────────────
async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
    return computed === signature;
  } catch {
    return false;
  }
}

// ── Mark subscription past_due; atomic dunning email claim ───────────────────
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
      if (userEmail) {
        await sendDunningEmail({ userEmail, pastDueSince });
      } else {
        console.warn(`Dunning: no email for user ${sub.user_id}`);
      }
    } else {
      console.log(`Dunning already claimed for sub ${sub.id} — email skipped`);
    }
  } catch (dunningErr) {
    console.error(
      "Dunning error (non-fatal):",
      dunningErr instanceof Error ? dunningErr.message : String(dunningErr),
    );
  }
}

// ── Dead-letter insert ────────────────────────────────────────────────────────
async function insertDeadLetter(
  adminClient: ReturnType<typeof createClient>,
  paymentId: string,
  status: string,
  rawBody: string,
  reason: string,
): Promise<void> {
  try {
    await adminClient.from("webhook_dead_letters").insert({
      provider: "moyasar",
      event_id: paymentId,
      tap_status: status, // column name preserved from original schema
      raw_payload: rawBody,
      reason,
    });
  } catch (err) {
    console.error("insertDeadLetter failed:", err instanceof Error ? err.message : String(err));
  }
}

// ── Dunning email (bilingual AR/EN) ──────────────────────────────────────────
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
  <h1 style="color:#111827;font-size:20px;margin:0 0 16px;font-weight:700">تعذّر تجديد اشتراكك</h1>
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
      console.log("Dunning email sent to:", params.userEmail);
    }
  } catch (err) {
    console.error(
      "Dunning email network error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
