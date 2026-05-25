import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// send-founding10-campaign
//
// Admin-only Supabase Edge Function. Surveys eligible recipients
// and (optionally) emails them the "Founding Engineers Offer".
//
// Eligibility is computed server-side from auth + subscription
// state. Per-user de-duplication is tracked via
//   auth.users.app_metadata.founding10_sent_at
// because the project's controlled migration process did not allow
// a dedicated campaign_sends table to land for this release.
//
// Modes (request body):
//   { mode: "preview" }                  — count eligible/sent/skipped
//   { mode: "send", dryRun: true,        — pick up to `limit` eligible
//     limit?: number, allowResend?: bool   users and report what WOULD send
//   }                                      without calling Resend
//   { mode: "send", dryRun: false,       — actually send via Resend, mark
//     limit?: number, allowResend?: bool   app_metadata, return counts
//   }
//   { mode: "testOnly", dryRun: true,    — dry-run for admin-only test send
//     targetEmails: string[]              showing would_send details without
//   }                                      calling Resend
//   { mode: "testOnly",                  — send only to targetEmails (must be
//     targetEmails: string[],              admin emails). Marks only the
//     dryRun?: false                       actual recipients in app_metadata.
//   }                                      Ignores normal eligibility ordering.
//   { mode: "export" }                   — return CSV of eligible emails
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   RESEND_API_KEY  (only needed for non-dry-run sends)
//   FROM_EMAIL      (optional; defaults to "ConsultX <noreply@consultx.app>")
//   REPLY_TO        (optional; defaults to "ConsultX <support@consultx.app>")
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];
const CAMPAIGN_CODE = "FOUNDING10";
const CAMPAIGN_FIRST_CHARGE_SAR = 10;
const SUBJECT = "Founding Engineers Offer: ConsultX Pro for 10 SAR";
const LOGO_URL = "https://www.consultx.app/assets/consultx-email-logo.png";
const PROD_ORIGIN = "https://www.consultx.app";

const HARD_SEND_CAP = 500;        // safety: never send more than this in one call
const DEFAULT_PREVIEW_LIMIT = 1000;
const TEST_SUBJECT_SUFFIX = "[iPhone dark image-bg v8]";
const BG_0D1425_URL = "https://www.consultx.app/assets/email-bg-0d1425.png";
const BG_070B15_URL = "https://www.consultx.app/assets/email-bg-070b15.png";

function ctaUrl(): string {
  const params = new URLSearchParams({
    plan: "pro",
    promo: CAMPAIGN_CODE,
    utm_source: "email",
    utm_medium: "reactivation",
    utm_campaign: "founding10",
    utm_content: "founding_engineers_offer",
  });
  return `${PROD_ORIGIN}/subscribe?${params.toString()}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(recipient: string, subjectSuffix?: string): string {
  const cta = ctaUrl();
  const safeRecipient = escapeHtml(recipient);
  const titleSuffix = subjectSuffix ? ` ${subjectSuffix}` : "";
  const previewSuffix = subjectSuffix ? ` [${subjectSuffix}]` : "";
  const BG_IMG_CARD = `url('${BG_0D1425_URL}')`;
  const BG_IMG_OUTER = `url('${BG_070B15_URL}')`;
  const CARD_STYLE = `background:#0d1425!important;background-color:#0d1425!important;background-image:${BG_IMG_CARD}!important;background-repeat:repeat!important`;
  const OUTER_STYLE = `background:#070b15!important;background-color:#070b15!important;background-image:${BG_IMG_OUTER}!important;background-repeat:repeat!important`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>Founding Engineers Offer — ConsultX Pro for ${CAMPAIGN_FIRST_CHARGE_SAR} SAR${titleSuffix}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body{margin:0;padding:0;background:#070b15!important;background-color:#070b15!important;background-image:${BG_IMG_OUTER}!important;background-repeat:repeat!important;-webkit-text-size-adjust:100%!important;-ms-text-size-adjust:100%!important}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
img{border:0;outline:none;text-decoration:none;display:block}
@-ms-viewport{width:device-width}
@viewport{width:device-width}
@keyframes pulse-glow{0%,100%{box-shadow:0 0 18px rgba(0,212,255,0.35),0 0 40px rgba(0,212,255,0.12)}50%{box-shadow:0 0 30px rgba(0,212,255,0.55),0 0 60px rgba(0,212,255,0.20)}}
.glow-pulse{animation:pulse-glow 3s ease-in-out infinite}
.sec{padding-left:44px!important;padding-right:44px!important}
.hero{padding-left:22px!important;padding-right:22px!important}
@media only screen and (max-width:640px){
.sec{padding-left:26px!important;padding-right:26px!important}
.hero{padding-left:22px!important;padding-right:22px!important}
.head{font-size:24px!important}
}
@media only screen and (max-width:480px){
.sec{padding-left:22px!important;padding-right:22px!important}
.hero{padding-left:18px!important;padding-right:18px!important}
.head{font-size:22px!important}
.cta-btn{padding-left:28px!important;padding-right:28px!important}
}
</style>
</head>
<body bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${OUTER_STYLE};margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;${OUTER_STYLE};color:#070b15;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">ConsultX Pro first month for ${CAMPAIGN_FIRST_CHARGE_SAR} SAR — limited launch offer for early engineers.${previewSuffix} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#070b15" background="${BG_070B15_URL}" style="${OUTER_STYLE}">

<tr><td align="center" bgcolor="#070b15" background="${BG_070B15_URL}" style="${OUTER_STYLE};padding:24px 0 48px">

<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" width="640" align="center"><tr><td bgcolor="#0d1425"><![endif]-->

<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};max-width:640px;width:100%;border-radius:16px;border:1px solid #1a2744">

<!-- HERO -->
<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};background:linear-gradient(180deg,#0d1425 0%,#0a0e1a 100%);border-radius:16px 16px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:40px 22px 0" class="hero">
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 36px;border-radius:16px;border:1px solid #00d4ff22" class="glow-pulse">
<img src="${LOGO_URL}" alt="ConsultX" width="100" height="116" style="display:block;border:0;outline:none;margin:0 auto;max-width:100%;height:auto" />
</td>
</tr>
</table>
</td></tr>

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:20px 22px 4px" class="hero">
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td bgcolor="#f59e0b11" style="background-color:#f59e0b11;border:1.5px solid #f59e0b44;border-radius:30px;padding:8px 24px">
<span style="font-size:12px;font-weight:800;color:#fbbf24;letter-spacing:1px;text-transform:uppercase">✦&nbsp; First Month — ${CAMPAIGN_FIRST_CHARGE_SAR} SAR &nbsp;✦</span>
</td>
</tr>
</table>
</td></tr>

<tr><td dir="ltr" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0" class="sec">
<h1 style="margin:0;font-size:26px;font-weight:900;color:#f8fbff;line-height:1.2;letter-spacing:-0.3px" class="head">Founding Engineers Offer</h1>
<p style="margin:8px 0 0;font-size:16px;font-weight:500;color:#00d4ff;line-height:1.5">Activate your first month of ConsultX Pro for only <strong style="color:#fbbf24;font-weight:800">${CAMPAIGN_FIRST_CHARGE_SAR} SAR</strong>.</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:#f59e0b;line-height:1.4">Limited launch offer for early engineers.</p>
</td></tr>

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:20px 44px 0" class="sec">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${cta}" style="height:52px;v-text-anchor:middle;width:280px" arcsize="20%" strokecolor="#0098b8" fillcolor="#00d4ff">
<w:anchorlock/>
<center style="color:#0a0e1a;font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:800;letter-spacing:0.5px">Activate for ${CAMPAIGN_FIRST_CHARGE_SAR} SAR →</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td align="center" bgcolor="#0098b8" style="border-radius:12px;background-color:#0098b8">
<a href="${cta}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#0098b8);background-color:#0098b8;color:#0a0e1a;padding:14px 44px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:0.5px;mso-hide:all;min-height:44px;box-sizing:border-box" class="cta-btn">Activate for ${CAMPAIGN_FIRST_CHARGE_SAR} SAR →</a>
</td>
</tr>
</table>
<!--<![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:12px 0 0;font-size:12px;color:#8fa3bf;line-height:1.4">No long-term commitment. Cancel anytime.</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:14px 0 0;font-size:12px;color:#8fa3bf;line-height:1.4">
<a href="${cta}" target="_blank" style="color:#8fa3bf;text-decoration:underline">Open offer in browser</a>
</td>
</tr>
</table>
</td></tr>
</table>
</td></tr>

<!-- ENGLISH VALUE SECTION -->
<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:28px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#d9e7ff">
ConsultX is built for engineers who review fire and life safety, Saudi Building Code, NFPA references, compliance notes, and technical reports. You may not have seen what it can really do yet.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#ffffff">With ConsultX Pro, you can:</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">Review fire and life safety requirements faster.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">Use Advisory Mode for deeper SBC / NFPA questions.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">Use Analytical Mode for drawing and compliance review.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">Generate clearer engineering reasoning with source-based answers.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">Save time before reports, reviews, and client responses.</td>
</tr></table>
</td>
</tr>
</table>
</td></tr>

<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 24px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.5;color:#8fa3bf;font-style:italic">After the first month, your subscription renews at the normal Pro price unless canceled.</p>
</td></tr>

<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 12px" class="sec">
<p style="margin:0;font-size:11px;line-height:1.5;color:#8fa3bf">Built for SBC 201, SBC 801, NFPA, fire &amp; life safety reviews, and engineering decision support.</p>
</td></tr>

<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ARABIC SECTION -->
<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:28px 44px 0" class="sec">
<h1 style="margin:0;font-size:26px;font-weight:900;color:#f8fbff;line-height:1.3;letter-spacing:-0.2px" class="head">عرض خاص للمهندسين الأوائل</h1>
<p style="margin:8px 0 0;font-size:16px;font-weight:500;color:#00d4ff;line-height:1.7">أول شهر في ConsultX Pro مقابل <strong style="color:#fbbf24;font-weight:800">${CAMPAIGN_FIRST_CHARGE_SAR} ريال</strong> فقط.</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:#f59e0b;line-height:1.6">عرض إطلاق محدود للمهندسين الأوائل.</p>
</td></tr>

<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:20px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#d9e7ff">
تم بناء ConsultX للمهندسين الذين يراجعون متطلبات السلامة من الحريق، كود البناء السعودي، مراجع NFPA، ملاحظات الامتثال، والتقارير الفنية. ربما لم تجرّب بعد قيمته الحقيقية.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#ffffff">مع ConsultX Pro يمكنك:</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">مراجعة متطلبات السلامة والحماية من الحريق بسرعة أكبر.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">استخدام الوضع الاستشاري للأسئلة الكودية العميقة.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">استخدام الوضع التحليلي لمراجعة المخططات والامتثال.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">الحصول على إجابات هندسية أوضح ومدعومة بالمصادر.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:#d9e7ff">توفير الوقت قبل إعداد التقارير والمراجعات والردود الفنية.</td>
</tr></table>
</td>
</tr>
</table>
</td></tr>

<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 20px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.6;color:#8fa3bf;font-style:italic">بعد الشهر الأول، يتم التجديد بالسعر الطبيعي لخطة Pro ما لم يتم الإلغاء.</p>
</td></tr>

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:4px 44px 28px" class="sec">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${cta}" style="height:52px;v-text-anchor:middle;width:280px" arcsize="20%" strokecolor="#0098b8" fillcolor="#00d4ff">
<w:anchorlock/>
<center style="color:#0a0e1a;font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:800;letter-spacing:0.5px">← فعّل بـ ${CAMPAIGN_FIRST_CHARGE_SAR} ريال</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td align="center" bgcolor="#0098b8" style="border-radius:12px;background-color:#0098b8">
<a href="${cta}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#0098b8);background-color:#0098b8;color:#0a0e1a;padding:14px 44px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:0.5px;mso-hide:all;min-height:44px;box-sizing:border-box" class="cta-btn">← فعّل بـ ${CAMPAIGN_FIRST_CHARGE_SAR} ريال</a>
</td>
</tr>
</table>
<!--<![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:12px 0 0;font-size:12px;color:#8fa3bf;line-height:1.6">بدون التزام طويل. يمكنك الإلغاء في أي وقت.</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:14px 0 0;font-size:12px;color:#8fa3bf;line-height:1.4">
<a href="${cta}" target="_blank" style="color:#8fa3bf;text-decoration:underline">فتح العرض في المتصفح</a>
</td>
</tr>
</table>
</td></tr>

<!-- FOOTER -->
<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 28px" class="sec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD_STYLE};border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table>

<p style="margin:16px 0 0;font-size:11px;color:#8fa3bf;line-height:1.6;direction:ltr;text-align:center">
ConsultX &middot; Fire Safety Engineering &middot; Engineering Decision Support<br>
You are receiving this email at <span style="color:#8fa3bf">${safeRecipient}</span> because you created a ConsultX account.<br>
If you do not want to receive product updates, email <a href="mailto:support@consultx.app" style="color:#8fa3bf;text-decoration:underline">support@consultx.app</a>.
</p>
</td></tr>

</table>
<!-- END MAIN CARD -->

<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>`;
}

function buildText(recipient: string, subjectSuffix?: string): string {
  const cta = ctaUrl();
  const suf = subjectSuffix ? ` ${subjectSuffix}` : "";
  return [
    `ConsultX — Founding Engineers Offer${suf}`,
    "",
    `Activate your first month of ConsultX Pro for only ${CAMPAIGN_FIRST_CHARGE_SAR} SAR.`,
    "",
    "Limited launch offer for early engineers.",
    "",
    "ConsultX is built for engineers who review fire and life safety, Saudi Building Code, NFPA references, compliance notes, and technical reports. You may not have seen what it can really do yet.",
    "",
    "With ConsultX Pro, you can:",
    "  - Review fire and life safety requirements faster.",
    "  - Use Advisory Mode for deeper SBC / NFPA questions.",
    "  - Use Analytical Mode for drawing and compliance review.",
    "  - Generate clearer engineering reasoning with source-based answers.",
    "  - Save time before reports, reviews, and client responses.",
    "",
    `Activate for ${CAMPAIGN_FIRST_CHARGE_SAR} SAR:`,
    cta,
    "",
    "No long-term commitment. Cancel anytime.",
    "",
    "------------------------------------------------------------",
    "",
    "عرض خاص للمهندسين الأوائل",
    "",
    `أول شهر في ConsultX Pro مقابل ${CAMPAIGN_FIRST_CHARGE_SAR} ريال فقط.`,
    "",
    "عرض إطلاق محدود للمهندسين الأوائل.",
    "",
    "تم بناء ConsultX للمهندسين الذين يراجعون متطلبات السلامة من الحريق، كود البناء السعودي، مراجع NFPA، ملاحظات الامتثال، والتقارير الفنية. ربما لم تجرّب بعد قيمته الحقيقية.",
    "",
    "مع ConsultX Pro يمكنك:",
    "  - مراجعة متطلبات السلامة والحماية من الحريق بسرعة أكبر.",
    "  - استخدام الوضع الاستشاري للأسئلة الكودية العميقة.",
    "  - استخدام الوضع التحليلي لمراجعة المخططات والامتثال.",
    "  - الحصول على إجابات هندسية أوضح ومدعومة بالمصادر.",
    "  - توفير الوقت قبل إعداد التقارير والمراجعات والردود الفنية.",
    "",
    `فعّل بـ ${CAMPAIGN_FIRST_CHARGE_SAR} ريال:`,
    cta,
    "",
    "بدون التزام طويل. يمكنك الإلغاء في أي وقت.",
    "",
    "------------------------------------------------------------",
    `You are receiving this email at ${recipient} because you created a ConsultX account.`,
    "If you do not want to receive product updates, email support@consultx.app to opt out.",
    "ConsultX · Fire Safety Engineering · Engineering Decision Support",
  ].join("\n");
}

interface EligibleEntry {
  user_id: string;
  email: string;
}

interface IneligibleEntry {
  user_id: string;
  email: string;
  reason: "no_email";
}

interface SurveyResult {
  totalUsers: number;
  eligible: EligibleEntry[];
  skipped: IneligibleEntry[];
}

/**
 * Walk auth.users in pages, classifying each user. The page size is
 * capped by Supabase to 1000 — we paginate when total > 1000.
 */
async function surveyUsers(
  // deno-lint-ignore no-explicit-any
  admin: any,
): Promise<SurveyResult> {
  const eligible: EligibleEntry[] = [];
  const skipped: IneligibleEntry[] = [];
  let page = 1;
  const perPage = 1000;
  let totalUsers = 0;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);

    const users = data?.users ?? [];
    if (users.length === 0) break;
    totalUsers += users.length;

    for (const u of users) {
      const email = (u.email ?? "").trim().toLowerCase();
      const userId = u.id;

      if (!email) {
        skipped.push({ user_id: userId, email: "", reason: "no_email" });
        continue;
      }
      // All registered users with a valid email receive the campaign
      eligible.push({ user_id: userId, email });
    }

    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  return { totalUsers, eligible, skipped };
}

async function markSent(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  status: "sent" | "failed",
  providerId: string | null,
  error: string | null,
): Promise<void> {
  try {
    const stampKey = status === "sent" ? "founding10_sent_at" : "founding10_failed_at";
    const update: Record<string, unknown> = {
      [stampKey]: new Date().toISOString(),
      founding10_status: status,
    };
    if (providerId) update.founding10_provider_id = providerId;
    if (error) update.founding10_error = error.slice(0, 240);
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    const prevMeta = (existing?.user?.app_metadata ?? {}) as Record<string, unknown>;
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...prevMeta, ...update },
    });
  } catch (err) {
    console.error(
      "markSent failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function sendOne(
  resendApiKey: string,
  fromEmail: string,
  replyToEmail: string,
  email: string,
  subjectSuffix?: string,
): Promise<{ ok: boolean; id: string | null; error: string | null }> {
  try {
    const subject = subjectSuffix ? `${SUBJECT} ${subjectSuffix}` : SUBJECT;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        reply_to: replyToEmail,
        to: [email],
        subject,
        html: buildHtml(email, subjectSuffix),
        text: buildText(email, subjectSuffix),
        // Sending one message at a time so a single failure does not
        // poison the whole batch.
        tags: [
          { name: "campaign", value: "founding10" },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, id: null, error: body.slice(0, 240) };
    }
    const json = await response.json().catch(() => ({}));
    return { ok: true, id: typeof json?.id === "string" ? json.id : null, error: null };
  } catch (err) {
    return {
      ok: false,
      id: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Verify caller is admin ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (
      userError ||
      !user ||
      !user.email ||
      !ADMIN_EMAILS.includes(user.email.toLowerCase())
    ) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const mode = typeof body?.mode === "string" ? body.mode : "preview";
    const dryRun = body?.dryRun === true;
    const rawLimit = Number(body?.limit);
    const allowResend = body?.allowResend === true;

    // ── Always start with a survey ────────────────────────────────────────────
    const survey = await surveyUsers(admin);

    if (mode === "preview") {
      return new Response(
        JSON.stringify({
          mode: "preview",
          campaign_code: CAMPAIGN_CODE,
          subject: SUBJECT,
          totals: {
            total_users: survey.totalUsers,
            eligible: survey.eligible.length,
            skipped: survey.skipped.length,
            skipped_breakdown: tally(survey.skipped.map((s) => s.reason)),
          },
          eligible_sample: survey.eligible.slice(0, 10).map((e) => e.email),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "export") {
      const lines = [
        "email,user_id",
        ...survey.eligible.map((e) => `${e.email},${e.user_id}`),
      ];
      return new Response(lines.join("\n"), {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="founding10-eligible.csv"`,
        },
      });
    }

    if (mode === "send") {
      const limit = Math.min(
        HARD_SEND_CAP,
        Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_PREVIEW_LIMIT,
      );
      const targets = survey.eligible.slice(0, limit);

      if (dryRun) {
        return new Response(
          JSON.stringify({
            mode: "send",
            dry_run: true,
            campaign_code: CAMPAIGN_CODE,
            subject: SUBJECT,
            would_send: targets.length,
            eligible_total: survey.eligible.length,
            skipped_total: survey.skipped.length,
            limit,
            sample: targets.slice(0, 10).map((t) => t.email),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        return new Response(
          JSON.stringify({
            error: "Email provider not configured",
            blocker: "RESEND_API_KEY",
            campaign_code: CAMPAIGN_CODE,
          }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ConsultX <noreply@consultx.app>";
      const replyToEmail = Deno.env.get("REPLY_TO") ?? "support@consultx.app";

      let sent = 0;
      let failed = 0;
      const failures: Array<{ email: string; error: string }> = [];

      for (const t of targets) {
        const r = await sendOne(resendApiKey, fromEmail, replyToEmail, t.email);
        if (r.ok) {
          sent += 1;
          await markSent(admin, t.user_id, "sent", r.id, null);
        } else {
          failed += 1;
          failures.push({ email: t.email, error: r.error ?? "unknown_error" });
          await markSent(admin, t.user_id, "failed", null, r.error ?? "unknown_error");
        }
        // Gentle pacing — 120ms between calls = ~8 req/s, well under Resend's
        // 100 req/s limit and friendly to mailbox providers.
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      return new Response(
        JSON.stringify({
          mode: "send",
          dry_run: false,
          campaign_code: CAMPAIGN_CODE,
          subject: SUBJECT,
          sent,
          failed,
          attempted: targets.length,
          eligible_total: survey.eligible.length,
          skipped_total: survey.skipped.length,
          failures: failures.slice(0, 20),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "testOnly") {
      const targetEmails = body?.targetEmails;
      if (!Array.isArray(targetEmails) || targetEmails.length === 0) {
        return new Response(
          JSON.stringify({ error: "targetEmails must be a non-empty array" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const invalid = targetEmails.filter(
        (e: string) => !ADMIN_EMAILS.includes(e.trim().toLowerCase()),
      );
      if (invalid.length > 0) {
        return new Response(
          JSON.stringify({
            error: "testOnly mode only allows sending to admin email addresses",
            invalid_emails: invalid,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const normalized = targetEmails.map((e: string) => e.trim().toLowerCase());

      if (dryRun) {
        const details = normalized.map((email: string) => {
          const found = survey.eligible.find((e) => e.email === email) ||
            survey.skipped.find((e) => e.email === email);
          return { email, user_id: found ? found.user_id : null, found_in_survey: !!found };
        });

        return new Response(
          JSON.stringify({
            mode: "testOnly",
            dry_run: true,
            campaign_code: CAMPAIGN_CODE,
            subject: SUBJECT,
            would_send: normalized.length,
            target_emails: normalized,
            details,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        return new Response(
          JSON.stringify({
            error: "Email provider not configured",
            blocker: "RESEND_API_KEY",
            campaign_code: CAMPAIGN_CODE,
          }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ConsultX <noreply@consultx.app>";
      const replyToEmail = Deno.env.get("REPLY_TO") ?? "support@consultx.app";

      let sent = 0;
      let failed = 0;
      const failures: Array<{ email: string; error: string }> = [];
      const sentList: Array<{ email: string; provider_id: string | null }> = [];

      for (const email of normalized) {
        const found = survey.eligible.find((e) => e.email === email) ||
          survey.skipped.find((e) => e.email === email);
        const userId = found ? found.user_id : null;

        const r = await sendOne(resendApiKey, fromEmail, replyToEmail, email, TEST_SUBJECT_SUFFIX);
        if (r.ok) {
          sent += 1;
          sentList.push({ email, provider_id: r.id });
          if (userId) {
            await markSent(admin, userId, "sent", r.id, null);
          }
        } else {
          failed += 1;
          failures.push({ email, error: r.error ?? "unknown_error" });
          if (userId) {
            await markSent(admin, userId, "failed", null, r.error ?? "unknown_error");
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      return new Response(
        JSON.stringify({
          mode: "testOnly",
          sent,
          failed,
          attempted: normalized.length,
          sent_to: sentList,
          failures: failures.slice(0, 20),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown mode: ${String(mode)}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-founding10-campaign error:", err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
