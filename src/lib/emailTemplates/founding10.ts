/**
 * Founding Engineers Offer (FOUNDING10) — bilingual email template.
 *
 * One responsive HTML email + plain-text fallback. English copy first
 * (left-to-right), Arabic block below (right-to-left). Premium dark
 * "engineering" identity, single CTA, ConsultX logo URL referenced
 * from production assets (consultx.app).
 *
 * The same builder is used by:
 *   - the admin preview page (HTML render via iframe srcDoc)
 *   - the send edge function (HTML body for Resend)
 */

import {
  FOUNDING10_CODE,
  FOUNDING10_EMAIL_UTM,
  FOUNDING10_FIRST_CHARGE_SAR,
  buildFounding10Url,
} from "@/lib/campaigns/founding10";

export const FOUNDING10_EMAIL_SUBJECTS = {
  A: "Founding Engineers Offer: Try ConsultX Pro for 10 SAR",
  B: "Stop reviewing fire code manually — Try ConsultX Pro for 10 SAR",
  C: "Your ConsultX Pro first month is unlocked for 10 SAR",
} as const;

export const FOUNDING10_EMAIL_DEFAULT_SUBJECT = FOUNDING10_EMAIL_SUBJECTS.A;

export const FOUNDING10_PRODUCTION_ORIGIN = "https://www.consultx.app";

/** Public logo URL, served by the production deploy. */
export const FOUNDING10_LOGO_URL =
  "https://www.consultx.app/consultx-icon.png";

export interface Founding10EmailContext {
  /** Recipient email — used for the footer line. */
  recipientEmail: string;
  /** Optional explicit unsubscribe/preference URL. Leave undefined when none. */
  unsubscribeUrl?: string;
}

/** Build the canonical CTA URL with the email-channel UTM block. */
export function founding10EmailCtaUrl(): string {
  return buildFounding10Url(FOUNDING10_PRODUCTION_ORIGIN, FOUNDING10_EMAIL_UTM);
}

/** Plain-text fallback — used when the recipient's client can't render HTML. */
export function buildFounding10TextEmail(ctx: Founding10EmailContext): string {
  const cta = founding10EmailCtaUrl();
  const unsub = ctx.unsubscribeUrl
    ? `\nUnsubscribe: ${ctx.unsubscribeUrl}\n`
    : "";

  return [
    "ConsultX — Founding Engineers Offer",
    "",
    "Hi Engineer,",
    "",
    "You created a ConsultX account, but you may not have seen what the platform can really do yet.",
    "",
    "ConsultX is built for engineers who deal with fire safety, Saudi Building Code, NFPA references,",
    "compliance reviews, and technical reports — the work that usually takes time, focus,",
    "and repeated checking.",
    "",
    `For a limited launch period, you can activate your first month of ConsultX Pro for only ${FOUNDING10_FIRST_CHARGE_SAR} SAR.`,
    "",
    "Use ConsultX Pro to:",
    "  - Review fire and life safety requirements faster.",
    "  - Ask deeper SBC / NFPA questions in Advisory Mode.",
    "  - Analyze drawings and compliance notes in Analytical Mode.",
    "  - Generate clearer engineering reasoning with source-based answers.",
    "  - Save time before preparing reports, reviews, or client responses.",
    "",
    `Activate your first month for ${FOUNDING10_FIRST_CHARGE_SAR} SAR:`,
    cta,
    "",
    "No long-term commitment. You can cancel anytime.",
    "",
    "------------------------------------------------------------",
    "",
    "مرحبًا مهندسنا العزيز،",
    "",
    "قمت بإنشاء حساب في ConsultX، لكن ربما لم تجرّب بعد القيمة الحقيقية للمنصة.",
    "",
    "تم بناء ConsultX للمهندسين الذين يتعاملون مع متطلبات السلامة والوقاية من الحريق،",
    "كود البناء السعودي، مراجع NFPA، مراجعة الامتثال، والتقارير الفنية —",
    "وهي أعمال تحتاج وقتًا وتركيزًا وتحققًا متكررًا.",
    "",
    `لفترة إطلاق محدودة، يمكنك تفعيل أول شهر من ConsultX Pro مقابل ${FOUNDING10_FIRST_CHARGE_SAR} ريال فقط.`,
    "",
    "مع ConsultX Pro يمكنك:",
    "  - مراجعة متطلبات السلامة والحماية من الحريق بسرعة أكبر.",
    "  - طرح أسئلة أعمق في وضع Advisory.",
    "  - تحليل المخططات وملاحظات الامتثال في وضع Analytical.",
    "  - الحصول على إجابات هندسية أوضح ومدعومة بالمصادر.",
    "  - توفير الوقت قبل إعداد التقارير أو الردود الفنية أو مراجعات العملاء.",
    "",
    `فعّل أول شهر مقابل ${FOUNDING10_FIRST_CHARGE_SAR} ريال:`,
    cta,
    "",
    "بدون التزام طويل. يمكنك الإلغاء في أي وقت.",
    "",
    "------------------------------------------------------------",
    `You are receiving this email at ${ctx.recipientEmail} because you created a ConsultX account.`,
    unsub,
    "ConsultX · info@consultx.app",
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Bilingual HTML email body. English first, Arabic below in an RTL block. */
export function buildFounding10HtmlEmail(ctx: Founding10EmailContext): string {
  const cta = founding10EmailCtaUrl();
  const recipient = escapeHtml(ctx.recipientEmail);
  const unsubBlock = ctx.unsubscribeUrl
    ? `<p style="margin:8px 0 0;color:#7c8a99;font-size:12px;text-align:center">
         <a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#7c8a99;text-decoration:underline">Unsubscribe</a>
       </p>`
    : `<p style="margin:8px 0 0;color:#7c8a99;font-size:12px;text-align:center">
         If you do not want to receive product updates,
         reply with "unsubscribe" or email
         <a href="mailto:info@consultx.app" style="color:#7c8a99">info@consultx.app</a>.
       </p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ConsultX — Founding Engineers Offer</title>
</head>
<body style="margin:0;padding:0;background:#06090e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#dfe9f2">
<center style="width:100%;background:#06090e;padding:32px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#0a0f15;border:1px solid rgba(0,212,255,0.15);border-radius:14px;overflow:hidden">
    <tr>
      <td style="padding:28px 32px 8px;text-align:center;background:linear-gradient(135deg,rgba(0,212,255,0.10) 0%,rgba(10,15,21,0) 60%)">
        <img src="${FOUNDING10_LOGO_URL}" alt="ConsultX" width="48" height="48" style="display:inline-block;border:0;border-radius:8px">
        <div style="margin-top:14px;color:#00D4FF;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">
          Founding Engineers Offer
        </div>
        <h1 style="margin:8px 0 0;color:#e8f4fb;font-size:22px;font-weight:700;line-height:1.35">
          ConsultX Pro — first month for ${FOUNDING10_FIRST_CHARGE_SAR} SAR
        </h1>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 32px 8px;color:#cdd9e4;font-size:15px;line-height:1.7" dir="ltr">
        <p style="margin:14px 0 0">Hi Engineer,</p>
        <p style="margin:14px 0 0">
          You created a ConsultX account, but you may not have seen what the platform can really do yet.
        </p>
        <p style="margin:14px 0 0">
          ConsultX is built for engineers who deal with fire safety, Saudi Building Code, NFPA references,
          compliance reviews, and technical reports — the work that usually takes time, focus, and repeated checking.
        </p>
        <p style="margin:14px 0 0;color:#e8f4fb">
          For a limited launch period, you can activate your first month of
          <strong style="color:#e8f4fb">ConsultX Pro for only ${FOUNDING10_FIRST_CHARGE_SAR} SAR</strong>.
        </p>
        <p style="margin:18px 0 0;font-weight:600;color:#e8f4fb">Use ConsultX Pro to:</p>
        <ul style="margin:8px 0 0;padding-left:20px;color:#cdd9e4">
          <li>Review fire and life safety requirements faster.</li>
          <li>Ask deeper SBC / NFPA questions in Advisory Mode.</li>
          <li>Analyze drawings and compliance notes in Analytical Mode.</li>
          <li>Generate clearer engineering reasoning with source-based answers.</li>
          <li>Save time before preparing reports, reviews, or client responses.</li>
        </ul>
      </td>
    </tr>

    <tr>
      <td style="padding:22px 32px 6px;text-align:center">
        <a href="${cta}"
           style="display:inline-block;padding:14px 30px;border-radius:8px;background:#00D4FF;color:#06090e;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 4px 16px rgba(0,212,255,0.28)">
          Activate for ${FOUNDING10_FIRST_CHARGE_SAR} SAR
        </a>
        <div style="margin-top:10px;color:#7c8a99;font-size:12px">
          No long-term commitment. Cancel anytime. Promo code:
          <span style="color:#00D4FF;font-weight:700;letter-spacing:0.5px">${FOUNDING10_CODE}</span>
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:6px 32px 0">
        <hr style="border:0;border-top:1px solid rgba(0,212,255,0.12);margin:22px 0 14px">
      </td>
    </tr>

    <tr>
      <td dir="rtl" lang="ar" style="padding:6px 32px 14px;color:#cdd9e4;font-size:15px;line-height:1.85;text-align:right">
        <div style="color:#00D4FF;font-size:11px;font-weight:700;letter-spacing:0.6px">
          عرض خاص للمهندسين الأوائل
        </div>
        <h2 style="margin:8px 0 6px;color:#e8f4fb;font-size:18px;font-weight:700;line-height:1.5">
          ConsultX Pro — أول شهر بـ ${FOUNDING10_FIRST_CHARGE_SAR} ريال
        </h2>
        <p style="margin:10px 0 0">مرحبًا مهندسنا العزيز،</p>
        <p style="margin:10px 0 0">
          قمت بإنشاء حساب في ConsultX، لكن ربما لم تجرّب بعد القيمة الحقيقية للمنصة.
        </p>
        <p style="margin:10px 0 0">
          تم بناء ConsultX للمهندسين الذين يتعاملون مع متطلبات السلامة والوقاية من الحريق،
          كود البناء السعودي، مراجع NFPA، مراجعة الامتثال، والتقارير الفنية —
          وهي أعمال تحتاج وقتًا وتركيزًا وتحققًا متكررًا.
        </p>
        <p style="margin:12px 0 0;color:#e8f4fb">
          لفترة إطلاق محدودة، يمكنك تفعيل أول شهر من
          <strong style="color:#e8f4fb">ConsultX Pro مقابل ${FOUNDING10_FIRST_CHARGE_SAR} ريال فقط</strong>.
        </p>
        <p style="margin:14px 0 0;font-weight:600;color:#e8f4fb">مع ConsultX Pro يمكنك:</p>
        <ul style="margin:6px 22px 0 0;padding:0;list-style-position:inside;color:#cdd9e4">
          <li>مراجعة متطلبات السلامة والحماية من الحريق بسرعة أكبر.</li>
          <li>طرح أسئلة أعمق في وضع Advisory.</li>
          <li>تحليل المخططات وملاحظات الامتثال في وضع Analytical.</li>
          <li>الحصول على إجابات هندسية أوضح ومدعومة بالمصادر.</li>
          <li>توفير الوقت قبل إعداد التقارير أو الردود الفنية أو مراجعات العملاء.</li>
        </ul>
        <div style="margin-top:18px;text-align:center">
          <a href="${cta}"
             style="display:inline-block;padding:12px 28px;border-radius:8px;background:#00D4FF;color:#06090e;font-size:14px;font-weight:700;text-decoration:none">
            فعّل بـ ${FOUNDING10_FIRST_CHARGE_SAR} ريال
          </a>
        </div>
        <p style="margin:10px 0 0;color:#7c8a99;font-size:12px;text-align:center">
          بدون التزام طويل. يمكنك الإلغاء في أي وقت.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:18px 32px 26px;background:rgba(0,212,255,0.04);border-top:1px solid rgba(0,212,255,0.10)" dir="ltr">
        <p style="margin:0;color:#7c8a99;font-size:12px;text-align:center">
          You are receiving this email at <span style="color:#a4b3c1">${recipient}</span> because you created a ConsultX account.
        </p>
        ${unsubBlock}
        <p style="margin:14px 0 0;color:#536273;font-size:11px;text-align:center">
          ConsultX · <a href="mailto:info@consultx.app" style="color:#536273;text-decoration:none">info@consultx.app</a>
        </p>
      </td>
    </tr>
  </table>
</center>
</body>
</html>`;
}
