import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Must match GRACE_DAYS in check-subscription, fire-safety-chat,
// process-subscription-renewal, Workspace.tsx, and Account.tsx.
const GRACE_DAYS = 7;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Tap webhook signature verification (HMAC-SHA256) ─────────────────────
    // Must run before any DB access. Fail closed — no bypass paths.
    const tapSecretKey = Deno.env.get("TAP_SECRET_KEY");
    if (!tapSecretKey) {
      console.error("TAP_SECRET_KEY not configured — cannot verify webhook");
      return new Response(JSON.stringify({ error: "Webhook verification unavailable" }), { status: 500, headers: corsHeaders });
    }

    const receivedHash = req.headers.get("hashstring");
    if (!receivedHash) {
      console.error("Webhook rejected: missing hashstring header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Clone the request so the body can be read twice (once for HMAC, once for JSON parsing)
    const bodyText = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      console.error("Webhook rejected: invalid JSON body");
      return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: corsHeaders });
    }

    // Build the hash input string exactly as documented by Tap:
    // x_id + x_amount + x_currency + x_gateway_reference + x_payment_reference + x_status + x_created
    const hashInput =
      "x_id"                  + (payload.id                        ?? "") +
      "x_amount"              + String(payload.transaction?.amount  ?? "") +
      "x_currency"            + (payload.currency                   ?? "") +
      "x_gateway_reference"   + (payload.reference?.gateway         ?? "") +
      "x_payment_reference"   + (payload.reference?.payment         ?? "") +
      "x_status"              + (payload.status                     ?? "") +
      "x_created"             + String(payload.transaction?.created ?? "");

    console.log("Webhook HMAC input fields:", {
      x_id: payload.id ?? "",
      x_amount: String(payload.transaction?.amount ?? ""),
      x_currency: payload.currency ?? "",
      x_gateway_reference: payload.reference?.gateway ?? "",
      x_payment_reference: payload.reference?.payment ?? "",
      x_status: payload.status ?? "",
      x_created: String(payload.transaction?.created ?? ""),
    });

    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(tapSecretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(hashInput));
    const computedHash = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computedHash !== receivedHash) {
      console.error("Webhook rejected: HMAC mismatch", {
        computed_length: computedHash.length,
        received_length: receivedHash.length,
      });
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    console.log("Webhook signature verified successfully");
    // ── End signature verification ────────────────────────────────────────────

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    console.log("Tap webhook received:", JSON.stringify(payload));

    const chargeId = payload.id;
    const status = payload.status;
    const customerId = payload.customer?.id;
    const cardId = payload.card?.id;
    const cardBrand = payload.card?.brand;
    const cardLastFour = payload.card?.last_four;
    const paymentAgreementId = payload.payment_agreement?.id;

    if (!chargeId) {
      console.error("Webhook payload missing charge ID. Payload keys:", Object.keys(payload));
      return new Response(JSON.stringify({ error: "Missing charge ID" }), { status: 400, headers: corsHeaders });
    }

    // Find transaction by tap_charge_id
    // Destructure error explicitly — .maybeSingle() returns an error (not null data)
    // when multiple rows match, which would happen if the partial unique index is
    // somehow violated. Treating that as "not found" would silently drop the event.
    const { data: transaction, error: txLookupError } = await adminClient
      .from("payment_transactions")
      .select("*, user_subscriptions(*)")
      .eq("tap_charge_id", chargeId)
      .maybeSingle();

    if (txLookupError) {
      // DB error (network, RLS, duplicate rows) — return 5xx so Tap retries.
      console.error("Transaction lookup DB error for charge:", chargeId, txLookupError.message);
      await insertDeadLetter(adminClient, {
        chargeId,
        tapStatus: status,
        reason: "lookup_error",
        payload,
      });
      return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
    }

    if (!transaction) {
      // Verified payload but no matching row. Two causes:
      //   1. Race: process-subscription-renewal has not yet written tap_charge_id
      //      (inserted with null, Tap responded, but our UPDATE hasn't committed).
      //      Tap will retry delivery; the next attempt will find the row.
      //   2. Unknown charge: a Tap event for a charge created outside the app.
      //      Returning 5xx here would cause perpetual retries for truly unknown
      //      charges. Returning 200 acks the event; the dead-letter record gives
      //      an audit trail and manual-replay capability for the race case.
      // Decision: 200. The dead-letter table is the safety net.
      console.error("Transaction not found for verified charge:", chargeId);
      await insertDeadLetter(adminClient, {
        chargeId,
        tapStatus: status,
        reason: "transaction_not_found",
        payload,
      });
      return new Response(JSON.stringify({ message: "Transaction not found" }), { status: 200, headers: corsHeaders });
    }

    // ── Idempotency + status transition guard ────────────────────────────────
    // Read the current DB status once — all guard branches use this value.
    // This runs before any mutation so the guards are authoritative.
    const currentStatus = transaction.status;

    if (status === "CAPTURED" && currentStatus === "captured") {
      // Duplicate CAPTURED delivery. Subscription period was already updated on
      // the first delivery. Re-processing would silently reset current_period_end
      // to a slightly later now() — making period timestamps unreliable.
      // Acknowledge without touching billing state.
      console.log(
        "Idempotent CAPTURED: charge", chargeId,
        "already processed — ack without reprocessing",
      );
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    if (status === "FAILED" && currentStatus === "failed") {
      // Duplicate FAILED delivery. The past_due_since + dunning guards would
      // catch this downstream, but returning early is cleaner and explicit.
      console.log(
        "Idempotent FAILED: charge", chargeId,
        "already processed — ack without reprocessing",
      );
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    if (status === "FAILED" && currentStatus === "captured") {
      // Impossible transition: a Tap charge has a permanent outcome.
      // A charge that was captured cannot subsequently be reported as failed.
      // Processing this would stamp past_due_since on an active subscription.
      // Dead-letter for investigation; return 200 so Tap does not retry.
      console.error(
        "Impossible transition: FAILED webhook for already-captured charge", chargeId,
      );
      await insertDeadLetter(adminClient, {
        chargeId,
        tapStatus: status,
        reason: "impossible_transition_failed_after_captured",
        payload,
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    if (status === "CAPTURED" && currentStatus === "failed") {
      // Suspicious transition: each Tap charge has a unique, permanent outcome.
      // A charge we already recorded as failed cannot later be captured.
      // Processing this would wrongly activate a subscription for a bad charge.
      // Dead-letter for investigation; return 200 so Tap does not retry.
      console.error(
        "Suspicious transition: CAPTURED webhook for already-failed charge", chargeId,
      );
      await insertDeadLetter(adminClient, {
        chargeId,
        tapStatus: status,
        reason: "suspicious_transition_captured_after_failed",
        payload,
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }
    // ── End idempotency guard ─────────────────────────────────────────────────

    // Update transaction status (+ failure detail columns when FAILED)
    const mappedStatus = status === "CAPTURED" ? "captured" : status === "FAILED" ? "failed" : "initiated";
    const txUpdate: Record<string, any> = { status: mappedStatus };
    if (status === "FAILED") {
      txUpdate.failure_code    = payload.response?.code    ?? null;
      txUpdate.failure_message = payload.response?.message ?? null;
    }
    const { error: txUpdateError } = await adminClient
      .from("payment_transactions")
      .update(txUpdate)
      .eq("id", transaction.id);

    if (txUpdateError) {
      console.error("Failed to update transaction status:", {
        transaction_id: transaction.id,
        charge_id: chargeId,
        target_status: mappedStatus,
        error: txUpdateError,
      });
    }

    // Handle CAPTURED charge
    if (status === "CAPTURED" && transaction.subscription_id) {
      const updateData: Record<string, any> = {};

      // Always update card/customer info if available
      if (customerId) updateData.tap_customer_id = customerId;
      if (cardId) updateData.tap_card_id = cardId;
      if (cardBrand) updateData.card_brand = cardBrand;
      if (cardLastFour) updateData.card_last_four = cardLastFour;
      if (paymentAgreementId) updateData.tap_payment_agreement_id = paymentAgreementId;

      // Fetch the subscription with its plan details
      const { data: sub } = await adminClient
        .from("user_subscriptions")
        .select("id, status, trial_end, plan_id, subscription_plans(duration_days)")
        .eq("id", transaction.subscription_id)
        .single();

      if (!sub) {
        console.error("Subscription not found for captured charge:", chargeId,
          "subscription_id:", transaction.subscription_id);
        await insertDeadLetter(adminClient, {
          chargeId,
          tapStatus: status,
          reason: "subscription_not_found",
          payload,
        });
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      }

      const now = new Date();
      const trialEndDate = sub.trial_end ? new Date(sub.trial_end) : null;
      const isTrialExpiredOrImmediate = !trialEndDate || trialEndDate <= now;
      const durationDays = (sub as any)?.subscription_plans?.duration_days || 30;
      const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      if (transaction.payment_type === "verification") {
        if (isTrialExpiredOrImmediate) {
          // Returning user (trial_end = now) or no trial — activate immediately
          console.log("Verification captured for expired/immediate trial — activating subscription");
          updateData.status = "active";
          updateData.current_period_start = now.toISOString();
          updateData.current_period_end = periodEnd.toISOString();
          updateData.next_billing_date = periodEnd.toISOString();
        } else {
          // New user within trial window — keep trialing with card saved
          console.log("Verification captured for active trial — keeping trialing status");
          updateData.status = "trialing";
        }
      } else if (transaction.payment_type === "renewal" || transaction.payment_type === "subscription" || transaction.payment_type === "checkout") {
        // Paid renewal — activate subscription
        console.log("Renewal/subscription charge captured — activating subscription");
        updateData.status = "active";
        updateData.current_period_start = now.toISOString();
        updateData.current_period_end = periodEnd.toISOString();
        updateData.next_billing_date = periodEnd.toISOString();
        // Clear past-due and dunning flags so a future independent failure
        // can trigger a fresh dunning email (re-arms the deduplication gate).
        updateData.past_due_since = null;
        updateData.dunning_notified_at = null;
      }

      if (Object.keys(updateData).length > 0) {
        const { error: subUpdateError } = await adminClient
          .from("user_subscriptions")
          .update(updateData)
          .eq("id", transaction.subscription_id);

        if (subUpdateError) {
          console.error("Failed to update subscription:", {
            subscription_id: transaction.subscription_id,
            charge_id: chargeId,
            update_fields: Object.keys(updateData),
            error: subUpdateError,
          });
        } else {
          console.log("Subscription updated successfully:", {
            subscription_id: transaction.subscription_id,
            new_status: updateData.status || "(unchanged)",
            charge_id: chargeId,
          });

          // Sync profiles.plan_type when subscription becomes active
          if (updateData.status === "active" && transaction.user_id) {
            // Correct: read slug directly — it maps 1:1 to profiles.plan_type
            const { data: planInfo } = await adminClient
              .from("subscription_plans")
              .select("slug")
              .eq("id", sub.plan_id)
              .single();

            const planType = planInfo?.slug || "engineer";

            const { error: profileError } = await adminClient
              .from("profiles")
              .update({ plan_type: planType })
              .eq("user_id", transaction.user_id);

            if (profileError) {
              console.error("Failed to update profiles.plan_type:", profileError);
            } else {
              console.log(`profiles.plan_type updated to '${planType}' for user ${transaction.user_id}`);
            }
          }
        }
      }
    } else if (status === "FAILED" && transaction.subscription_id) {
      console.error("Payment FAILED for subscription:", {
        subscription_id: transaction.subscription_id,
        charge_id: chargeId,
        payment_type: transaction.payment_type,
        tap_response_code: payload.response?.code,
        tap_response_message: payload.response?.message,
      });

      // Mark past_due_since if this is a renewal charge (not a verification).
      // Only set it on the first failure — do not overwrite an existing timestamp
      // from a prior retry, so the grace-period clock starts from the first miss.
      if (transaction.payment_type === "renewal" || transaction.payment_type === "subscription") {
        const { data: subForFailure } = await adminClient
          .from("user_subscriptions")
          .select("past_due_since")
          .eq("id", transaction.subscription_id)
          .single();

        if (subForFailure && !subForFailure.past_due_since) {
          const pastDueSince = new Date().toISOString();
          const { error: pastDueError } = await adminClient
            .from("user_subscriptions")
            .update({ past_due_since: pastDueSince })
            .eq("id", transaction.subscription_id);

          if (pastDueError) {
            console.error("Failed to set past_due_since:", pastDueError);
          } else {
            console.log("past_due_since set for subscription:", transaction.subscription_id);

            // ── Dunning email — one send per past_due episode ─────────────────
            // Atomic claim on dunning_notified_at (WHERE IS NULL) ensures
            // exactly one email fires even if tap-webhook and
            // process-subscription-renewal race on the very first failure.
            try {
              const { data: claimed } = await adminClient
                .from("user_subscriptions")
                .update({ dunning_notified_at: new Date().toISOString() })
                .eq("id", transaction.subscription_id)
                .is("dunning_notified_at", null)
                .select("id");

              if (claimed && claimed.length > 0) {
                // Row claimed — we won the race; send the email.
                const { data: userData } = await adminClient.auth.admin.getUserById(
                  transaction.user_id,
                );
                const userEmail = userData?.user?.email;
                if (!userEmail) {
                  console.warn(
                    `Dunning: no email for user ${transaction.user_id} — email skipped`,
                  );
                } else {
                  await sendDunningEmail({ userEmail, pastDueSince });
                }
              } else {
                // dunning_notified_at was already set by process-subscription-renewal.
                console.log(
                  "Dunning already claimed for sub:",
                  transaction.subscription_id,
                  "— email skipped",
                );
              }
            } catch (dunningErr) {
              // Email failure must never surface to the webhook response.
              console.error(
                "Dunning email error (non-fatal):",
                dunningErr instanceof Error ? dunningErr.message : String(dunningErr),
              );
            }
            // ── End dunning email ─────────────────────────────────────────────
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("Webhook unhandled error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});

// ── Dead-letter helper ───────────────────────────────────────────────────────
// Inserts a record into webhook_dead_letters for a verified Tap event that
// could not be processed. Never throws — any insertion failure is logged and
// swallowed so the caller can still return a response to Tap.
//
// IMPORTANT: call this only after HMAC verification passes. Unverified payloads
// must never be stored here.
async function insertDeadLetter(
  adminClient: ReturnType<typeof createClient>,
  params: {
    chargeId: string | null;
    tapStatus: string;
    reason: string;
    payload: unknown;
  },
): Promise<void> {
  try {
    const { error } = await adminClient.from("webhook_dead_letters").insert({
      charge_id:  params.chargeId,
      tap_status: params.tapStatus,
      reason:     params.reason,
      payload:    params.payload,
    });
    if (error) {
      console.error("Dead-letter insert failed (non-fatal):", error.message);
    } else {
      console.log("Dead-letter recorded:", params.reason, "charge:", params.chargeId);
    }
  } catch (err) {
    console.error(
      "Dead-letter insert threw (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── Dunning email helper ──────────────────────────────────────────────────────
// Sends a single bilingual (Arabic primary / English secondary) payment-failure
// notification to the subscriber via Resend.
//
// Requires:
//   RESEND_API_KEY  — Resend API key (Edge Function secret)
//   FROM_EMAIL      — Sender address (optional; falls back to noreply@consultx.sa)
//
// All errors are caught and logged; this function never throws.
async function sendDunningEmail(params: {
  userEmail: string;
  pastDueSince: string; // ISO timestamp of the first missed payment
}): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not configured — dunning email skipped");
    return;
  }

  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ConsultX <noreply@consultx.sa>";
  const accountUrl = "https://consultx.sa/account";

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
    ConsultX &middot; support@consultx.sa &middot;
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
