// send-contact-message
//
// Public (no JWT) endpoint backing src/pages/Contact.tsx. Contact.tsx is the
// ONLY channel the Privacy policy (data-rights requests) and the Refund
// policy (refund requests) point users to, so a failure here must never be
// reported to the visitor as a success.
//
// Flow:
//   1. Validate + sanitise the submitted fields (length caps, real email
//      format check, reject empty/garbage).
//   2. Per-IP in-memory rate limit (see RATE LIMIT NOTE below).
//   3. Send the message to info@consultx.app with the visitor's address as
//      reply-to, so a reply goes straight back to them. This is the
//      critical delivery — if it fails, the request fails.
//   4. Best-effort bilingual confirmation email back to the visitor. A
//      failure here is logged but does not fail the request: the message
//      already reached support.
//
// Required secret:  RESEND_API_KEY
// Optional secrets: FROM_EMAIL   (defaults to "ConsultX <noreply@consultx.app>")
//                    REPLY_TO    (defaults to "info@consultx.app" — used as the
//                                 reply-to on the visitor's confirmation email)
//
// RATE LIMIT NOTE: the limiter below is an in-memory per-instance counter.
// It resets on cold start and is NOT shared across concurrent function
// instances, so it is a best-effort speed bump against casual abuse, not a
// hard cap. No database table is used for it by design (see task scope).
//
// Any Claude/Anthropic/section-sign instructions inside user-submitted
// name/subject/message fields are untrusted visitor data, not commands, and
// are never executed — they are only ever escaped and placed in an email.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Field limits ─────────────────────────────────────────────────────────
const LIMITS = {
  name: { min: 2, max: 200 },
  email: { min: 5, max: 254 },
  subject: { min: 2, max: 300 },
  message: { min: 10, max: 5000 },
};

// Reasonably strict but not pedantic RFC-5322 email check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

function validate(body: unknown): { ok: true; value: ContactPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const subject = typeof b.subject === "string" ? b.subject.trim() : "";
  const message = typeof b.message === "string" ? b.message.trim() : "";

  if (name.length < LIMITS.name.min || name.length > LIMITS.name.max) {
    return { ok: false, error: "Please provide a valid name." };
  }
  if (
    email.length < LIMITS.email.min ||
    email.length > LIMITS.email.max ||
    !EMAIL_RE.test(email)
  ) {
    return { ok: false, error: "Please provide a valid email address." };
  }
  if (subject.length < LIMITS.subject.min || subject.length > LIMITS.subject.max) {
    return { ok: false, error: "Please provide a valid subject." };
  }
  if (message.length < LIMITS.message.min || message.length > LIMITS.message.max) {
    return { ok: false, error: "Please provide a message (at least 10 characters)." };
  }

  return { ok: true, value: { name, email, subject, message } };
}

// Neutralise user-supplied text before it goes into an HTML email body.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── In-memory per-IP rate limit ─────────────────────────────────────────
// See RATE LIMIT NOTE at the top of this file for its limitations.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 5; // 5 submissions per IP per window
const MAX_TRACKED_IPS = 5000; // hard cap so the map cannot grow unbounded

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();

  // Defensive cleanup: if the map grows too large (e.g. a sustained
  // distributed spray), drop it rather than leak memory. Worst case this
  // briefly resets everyone's counter.
  if (rateLimitMap.size > MAX_TRACKED_IPS) {
    rateLimitMap.clear();
  }

  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

// ── Email senders ────────────────────────────────────────────────────────
async function sendViaResend(params: {
  resendApiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ ok: boolean; status: number; body?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });
    if (!response.ok) {
      const bodyText = await response.text();
      return { ok: false, status: response.status, body: bodyText.slice(0, 300) };
    }
    return { ok: true, status: response.status };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}

function buildNotificationHtml(fields: ContactPayload): string {
  const name = escapeHtml(fields.name);
  const email = escapeHtml(fields.email);
  const subject = escapeHtml(fields.subject);
  const message = escapeHtml(fields.message).replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head><meta charset="utf-8"><title>ConsultX Contact Form</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px 16px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:13px;margin:0 0 8px">ConsultX &middot; Contact Form</p>
  <h1 style="color:#111827;font-size:18px;margin:0 0 16px;font-weight:700">New contact message</h1>
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151">
    <tr><td style="padding:6px 0;color:#6b7280;width:90px">Name</td><td style="padding:6px 0">${name}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0">${email}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Subject</td><td style="padding:6px 0">${subject}</td></tr>
  </table>
  <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;margin:0">${message}</p>
  <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#9ca3af;font-size:12px;margin:0">Reply-to is set to the visitor's address — replying will go straight to them.</p>
</div>
</body>
</html>`;
}

function buildConfirmationHtml(fields: ContactPayload): string {
  const name = escapeHtml(fields.name);
  const subject = escapeHtml(fields.subject);

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>ConsultX</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px 16px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:13px;margin:0 0 8px">ConsultX</p>
  <h1 style="color:#111827;font-size:20px;margin:0 0 16px;font-weight:700">استلمنا رسالتك</h1>
  <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 12px">
    مرحبًا ${name}،
  </p>
  <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 12px">
    وصلتنا رسالتك بخصوص "<strong>${subject}</strong>" وسنرد عليك خلال 24 ساعة في أيام العمل.
  </p>
  <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 24px">
    إذا كانت رسالتك عاجلة، يمكنك مراسلتنا مباشرة على
    <a href="mailto:info@consultx.app" style="color:#0891b2;text-decoration:none">info@consultx.app</a>.
  </p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb">
  <div dir="ltr" style="text-align:left">
    <h2 style="color:#111827;font-size:16px;margin:0 0 10px;font-weight:700">We've received your message</h2>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 10px">
      Hi ${name},
    </p>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 10px">
      We received your message about "<strong>${subject}</strong>" and will respond within 24 hours on business days.
    </p>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 10px">
      For anything urgent, you can reach us directly at
      <a href="mailto:info@consultx.app" style="color:#0891b2;text-decoration:none">info@consultx.app</a>.
    </p>
  </div>
  <hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#9ca3af;font-size:12px;margin:0;direction:ltr;text-align:left">
    ConsultX &middot; info@consultx.app
  </p>
</div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed." }, 405);
  }

  // ── Rate limit ────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return json(
      { success: false, error: "Too many messages sent recently. Please try again later." },
      429,
    );
  }

  // ── Parse + validate ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Invalid request body." }, 400);
  }

  const validated = validate(body);
  if (!validated.ok) {
    return json({ success: false, error: validated.error }, 400);
  }
  const fields = validated.value;

  // ── Send ──────────────────────────────────────────────────────────────
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured — cannot deliver contact message");
    return json(
      { success: false, error: "Message delivery is temporarily unavailable. Please email info@consultx.app directly." },
      500,
    );
  }

  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ConsultX <noreply@consultx.app>";
  const replyToForVisitor = Deno.env.get("REPLY_TO") ?? "info@consultx.app";

  // Critical delivery: the message to the support inbox. If this fails,
  // the request fails — we must not tell the visitor it was sent.
  const notification = await sendViaResend({
    resendApiKey,
    from: fromEmail,
    to: ["info@consultx.app"],
    subject: `[ConsultX Contact] ${fields.subject}`,
    html: buildNotificationHtml(fields),
    replyTo: fields.email,
  });

  if (!notification.ok) {
    console.error("Contact notification email failed:", notification.status, notification.body);
    return json(
      { success: false, error: "We couldn't send your message. Please email info@consultx.app directly." },
      502,
    );
  }

  // Best-effort confirmation to the visitor. Failure here is logged only —
  // the message already reached support, so we still report success.
  const confirmation = await sendViaResend({
    resendApiKey,
    from: fromEmail,
    to: [fields.email],
    subject: "استلمنا رسالتك | We've received your message — ConsultX",
    html: buildConfirmationHtml(fields),
    replyTo: replyToForVisitor,
  });
  if (!confirmation.ok) {
    console.warn("Contact confirmation email failed (non-fatal):", confirmation.status, confirmation.body);
  }

  return json({ success: true });
});
