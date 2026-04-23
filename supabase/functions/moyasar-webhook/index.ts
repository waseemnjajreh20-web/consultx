import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Must match GRACE_DAYS in check-subscription, process-subscription-renewal,
// Workspace.tsx, and Account.tsx.
const GRACE_DAYS = 7;

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
// (set by Subscribe.tsx when initializing the Moyasar form).
//
// Required secrets:
//   MOYASAR_WEBHOOK_SECRET — from Moyasar Dashboard webhook config
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Moyasar payment event payload shape:
    //   { id, status, amount, currency, source: { token, card_number, ... }, metadata }
    const paymentId = payload.id;
    const status = payload.status; // "paid" | "failed" | "initiated" | "authorized"
    const moyasarCardToken = payload.source?.token ?? null;
    const subscriptionId: string | null = payload.metadata?.subscription_id ?? null;

    console.log("Moyasar webhook received:", {
      payment_id: paymentId,
      status,
      subscription_id: subscriptionId,
    });

    if (!paymentId) {
      console.error("Webhook payload missing payment ID");
      return new Response(JSON.stringify({ error: "Missing payment ID" }), {
        status: 400,
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
      .select("*, subscription_plans(duration_days, slug)")
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
    const { data: existingTx } = await adminClient
      .from("payment_transactions")
      .select("id, status")
      .eq("moyasar_payment_id", paymentId)
      .maybeSingle();

    if (existingTx?.status === "captured" && status === "paid") {
      console.log(`Idempotent paid: payment ${paymentId} already processed — ack without reprocessing`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const mappedStatus = status === "paid" ? "captured" : "failed";

    if (!existingTx) {
      // Insert transaction row (first delivery)
      await adminClient.from("payment_transactions").insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        moyasar_payment_id: paymentId,
        amount: payload.amount ?? 100,
        currency: payload.currency ?? "SAR",
        status: mappedStatus,
        payment_type: "verification",
      });
    } else {
      // Update existing row
      await adminClient
        .from("payment_transactions")
        .update({ status: mappedStatus })
        .eq("id", existingTx.id);
    }

    // ── Handle paid event ────────────────────────────────────────────────────
    if (status === "paid") {
      const updateData: Record<string, any> = {};

      if (moyasarCardToken) {
        updateData.moyasar_card_token = moyasarCardToken;
      }
      updateData.moyasar_payment_id = paymentId;

      // Token-update path: subscription is already active with no card on file.
      // Store the payment method for future renewals; preserve all existing period
      // dates to avoid clobbering admin-set or extended billing periods.
      if (sub.status === "active" && !sub.moyasar_card_token) {
        // If next_billing_date was never set, align it to the existing period end
        // so the renewal job can find this subscription when the time comes.
        if (!sub.next_billing_date && sub.current_period_end) {
          updateData.next_billing_date = sub.current_period_end;
        }
        console.log("Payment paid — token-update on active subscription, period preserved:", sub.id);
      } else {
        const now = new Date();
        const trialEndDate = sub.trial_end ? new Date(sub.trial_end) : null;
        const isTrialExpiredOrImmediate = !trialEndDate || trialEndDate <= now;
        const durationDays = (sub as any)?.subscription_plans?.duration_days || 30;
        const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

        if (isTrialExpiredOrImmediate) {
          // Returning user or no-trial case — activate immediately
          updateData.status = "active";
          updateData.current_period_start = now.toISOString();
          updateData.current_period_end = periodEnd.toISOString();
          updateData.next_billing_date = periodEnd.toISOString();
          console.log("Payment paid — activating subscription immediately:", sub.id);
        } else {
          // New user within trial window — keep trialing, card token saved
          updateData.status = "trialing";
          console.log("Payment paid — keeping trialing, card token saved:", sub.id);
        }
      }

      const { error: subUpdateError } = await adminClient
        .from("user_subscriptions")
        .update(updateData)
        .eq("id", sub.id);

      if (subUpdateError) {
        console.error("Failed to update subscription on paid event:", subUpdateError);
      } else {
        // Sync profiles.plan_type when subscription becomes active (fresh activation only)
        if (updateData.status === "active") {
          const { data: planInfo } = await adminClient
            .from("subscription_plans")
            .select("slug")
            .eq("id", sub.plan_id)
            .single();

          const planType = planInfo?.slug || "engineer";
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
      }
    }

    // ── Handle failed event ──────────────────────────────────────────────────
    if (status === "failed") {
      console.error("Payment failed for subscription:", sub.id, "payment:", paymentId);

      // Only stamp past_due_since on renewal failures, not verification failures.
      // A failed initial card verification means the user never subscribed — status
      // should remain pending_activation (or trialing), not past_due.
      const isRenewal = (existingTx as any)?.payment_type === "renewal";

      if (isRenewal) {
        const { data: subForFailure } = await adminClient
          .from("user_subscriptions")
          .select("past_due_since")
          .eq("id", sub.id)
          .single();

        if (subForFailure && !subForFailure.past_due_since) {
          const pastDueSince = new Date().toISOString();
          await adminClient
            .from("user_subscriptions")
            .update({ past_due_since: pastDueSince })
            .eq("id", sub.id);

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
async function insertDeadLetter(
  adminClient: ReturnType<typeof createClient>,
  params: {
    paymentId: string | null;
    moyasarStatus: string;
    reason: string;
    payload: unknown;
  },
): Promise<void> {
  try {
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
