import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];
const CAMPAIGN_CODE = "EID50";
const SUBJECT = "Eid Offer: Upgrade Your Engineering Office with ConsultX at 50% Off";
const TEST_SUBJECT_SUFFIX = "[EID50 FINAL COPY TEST]";
const LOGO_URL = "https://www.consultx.app/assets/consultx-email-logo.png";
const PROD_ORIGIN = "https://www.consultx.app";
const BG_0D1425_URL = "https://www.consultx.app/assets/email-bg-0d1425.png";
const BG_070B15_URL = "https://www.consultx.app/assets/email-bg-070b15.png";

function ctaUrl(plan = "pro"): string {
  const params = new URLSearchParams({
    plan,
    promo: CAMPAIGN_CODE,
    utm_source: "email",
    utm_medium: "outbound",
    utm_campaign: "eid50",
    utm_content: "engineering_offices_ksa",
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

const BENEFITS_EN = [
  "Advisory Mode for code questions \u2014 ask SBC, NFPA, and fire/life-safety questions and get structured, source-aware answers.",
  "Analytical Mode for drawings and documents \u2014 upload drawings and documents to identify requirements, missing information, and review gaps before submission.",
  "Faster technical responses \u2014 reduce repeated searching through clauses and prepare clearer technical comments.",
  "Better engineering reports \u2014 create cleaner summaries, review notes, and client-ready technical replies.",
  "Saudi-focused review workflow \u2014 built around SBC, NFPA, fire safety review, and engineering office needs.",
];

const BENEFITS_AR = [
  "\u0648\u0636\u0639 Advisory \u0644\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0643\u0648\u062F\u064A\u0629 \u2014 \u0627\u0637\u0631\u062D \u0623\u0633\u0626\u0644\u0629 SBC \u0648NFPA \u0648\u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0648\u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u0645\u0646 \u0627\u0644\u062D\u0631\u064A\u0642 \u0648\u0627\u062D\u0635\u0644 \u0639\u0644\u0649 \u0625\u062C\u0627\u0628\u0627\u062A \u0645\u0646\u0638\u0645\u0629 \u0648\u0645\u062F\u0639\u0648\u0645\u0629 \u0628\u0627\u0644\u0645\u0631\u0627\u062C\u0639.",
  "\u0648\u0636\u0639 Analytical \u0644\u0644\u0645\u062E\u0637\u0637\u0627\u062A \u0648\u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A \u2014 \u0627\u0631\u0641\u0639 \u0627\u0644\u0645\u062E\u0637\u0637\u0627\u062A \u0648\u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A \u0644\u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0627\u0644\u0645\u062A\u0637\u0644\u0628\u0627\u062A\u060C \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0646\u0627\u0642\u0635\u0629\u060C \u0648\u0641\u062C\u0648\u0627\u062A \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0642\u0628\u0644 \u0627\u0644\u0631\u0641\u0639 \u0623\u0648 \u0627\u0644\u062A\u0633\u0644\u064A\u0645.",
  "\u0631\u062F\u0648\u062F \u0641\u0646\u064A\u0629 \u0623\u0633\u0631\u0639 \u2014 \u0642\u0644\u0651\u0644 \u0627\u0644\u0628\u062D\u062B \u0627\u0644\u0645\u062A\u0643\u0631\u0631 \u062F\u0627\u062E\u0644 \u0627\u0644\u0628\u0646\u0648\u062F\u060C \u0648\u062C\u0647\u0651\u0632 \u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0641\u0646\u064A\u0629 \u0623\u0648\u0636\u062D.",
  "\u062A\u0642\u0627\u0631\u064A\u0631 \u0647\u0646\u062F\u0633\u064A\u0629 \u0623\u0641\u0636\u0644 \u2014 \u0623\u0646\u0634\u0626 \u0645\u0644\u062E\u0635\u0627\u062A\u060C \u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0645\u0631\u0627\u062C\u0639\u0629\u060C \u0648\u0631\u062F\u0648\u062F \u0641\u0646\u064A\u0629 \u0623\u0643\u062B\u0631 \u062A\u0646\u0638\u064A\u0645\u064B\u0627 \u0644\u0644\u0639\u0645\u0644\u0627\u0621.",
  "\u0633\u064A\u0631 \u0645\u0631\u0627\u062C\u0639\u0629 \u0645\u0648\u062C\u0647 \u0644\u0644\u0633\u0648\u0642 \u0627\u0644\u0633\u0639\u0648\u062F\u064A \u2014 \u0645\u0635\u0645\u0645 \u062D\u0648\u0644 SBC \u0648NFPA \u0648\u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0648\u0627\u062D\u062A\u064A\u0627\u062C\u0627\u062A \u0627\u0644\u0645\u0643\u0627\u062A\u0628 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629.",
];

const ENTERPRISE_BENEFITS_EN = [
  "Shared organization workspace \u2014 manage your office team inside one ConsultX workspace instead of scattered individual accounts.",
  "Team seats with enforced seat limits \u2014 invite team members and manage paid seats with controlled access.",
  "Role-based access \u2014 separate owner/admin, engineers, reviewers, and finance-oriented access so each user sees the right workspace.",
  "Case workflow and status tracking \u2014 create and track engineering cases with status history instead of losing review progress across chats and files.",
  "Review and approval foundation \u2014 support internal engineering review and approval workflows before final delivery.",
  "AI report/session binding \u2014 keep AI review outputs linked to cases and reports so technical decisions are easier to trace.",
  "Better office-level quality control \u2014 help engineers, senior reviewers, and managers work from a more consistent review process.",
];

const ENTERPRISE_BENEFITS_AR = [
  "\u0645\u0633\u0627\u062D\u0629 \u0639\u0645\u0644 \u0645\u0634\u062A\u0631\u0643\u0629 \u0644\u0644\u0645\u0643\u062A\u0628 \u2014 \u0623\u062F\u0631 \u0641\u0631\u064A\u0642\u0643 \u062F\u0627\u062E\u0644 Workspace \u0648\u0627\u062D\u062F \u0628\u062F\u0644 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0641\u0631\u062F\u064A\u0629 \u0627\u0644\u0645\u062A\u0641\u0631\u0642\u0629.",
  "\u0645\u0642\u0627\u0639\u062F \u0641\u0631\u064A\u0642 \u0645\u0639 \u0636\u0628\u0637 \u0639\u062F\u062F \u0627\u0644\u0645\u0642\u0627\u0639\u062F \u2014 \u0627\u062F\u0639\u064F \u0623\u0639\u0636\u0627\u0621 \u0627\u0644\u0641\u0631\u064A\u0642 \u0648\u0623\u062F\u0631 \u0627\u0644\u0645\u0642\u0627\u0639\u062F \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0629 \u0628\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0648\u0627\u0636\u062D\u0629.",
  "\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u062D\u0633\u0628 \u0627\u0644\u062F\u0648\u0631 \u2014 \u0627\u0641\u0635\u0644 \u0628\u064A\u0646 \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u0643\u060C \u0627\u0644\u0625\u062F\u0627\u0631\u0629\u060C \u0627\u0644\u0645\u0647\u0646\u062F\u0633\u064A\u0646\u060C \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u064A\u0646\u060C \u0648\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629.",
  "\u0633\u064A\u0631 \u062D\u0627\u0644\u0627\u062A \u0648\u062A\u062A\u0628\u0639 \u0627\u0644\u062D\u0627\u0644\u0629 \u2014 \u0623\u0646\u0634\u0626 \u062D\u0627\u0644\u0627\u062A \u0647\u0646\u062F\u0633\u064A\u0629 \u0648\u062A\u0627\u0628\u0639 \u0633\u062C\u0644 \u0627\u0644\u062D\u0627\u0644\u0629 \u0628\u062F\u0644 \u0636\u064A\u0627\u0639 \u062A\u0642\u062F\u0645 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0628\u064A\u0646 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0627\u062A \u0648\u0627\u0644\u0645\u0644\u0641\u0627\u062A.",
  "\u0623\u0633\u0627\u0633 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062F\u0627\u062E\u0644\u064A \u2014 \u0627\u062F\u0639\u0645 \u0633\u064A\u0631 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629 \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062F\u0627\u062E\u0644\u064A \u0642\u0628\u0644 \u0627\u0644\u062A\u0633\u0644\u064A\u0645 \u0627\u0644\u0646\u0647\u0627\u0626\u064A.",
  "\u0631\u0628\u0637 \u0645\u062E\u0631\u062C\u0627\u062A \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0628\u0627\u0644\u062D\u0627\u0644\u0627\u062A \u0648\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u2014 \u0627\u062D\u062A\u0641\u0638 \u0628\u0645\u062E\u0631\u062C\u0627\u062A \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0648\u0631\u0628\u0637\u0647\u0627 \u0628\u0627\u0644\u062D\u0627\u0644\u0627\u062A \u0644\u062A\u0633\u0647\u064A\u0644 \u062A\u062A\u0628\u0639 \u0627\u0644\u0642\u0631\u0627\u0631\u0627\u062A \u0627\u0644\u0641\u0646\u064A\u0629.",
  "\u0636\u0628\u0637 \u062C\u0648\u062F\u0629 \u0639\u0644\u0649 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0645\u0643\u062A\u0628 \u2014 \u0633\u0627\u0639\u062F \u0627\u0644\u0645\u0647\u0646\u062F\u0633\u064A\u0646 \u0648\u0627\u0644\u0645\u0631\u0627\u062C\u0639\u064A\u0646 \u0648\u0627\u0644\u0645\u062F\u064A\u0631\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0639\u0645\u0644 \u0648\u0641\u0642 \u0633\u064A\u0631 \u0645\u0631\u0627\u062C\u0639\u0629 \u0623\u0643\u062B\u0631 \u0627\u062A\u0633\u0627\u0642\u064B\u0627.",
];

function buildHtml(recipient: string, subjectSuffix?: string): string {
  const cta = ctaUrl("pro");
  const entCta = ctaUrl("enterprise_team");
  const safeRecipient = escapeHtml(recipient);
  const titleSuffix = subjectSuffix ? ` ${subjectSuffix}` : "";
  const previewSuffix = subjectSuffix ? ` [${subjectSuffix}]` : "";
  const BG_IMG_CARD = `url('${BG_0D1425_URL}')`;
  const BG_IMG_OUTER = `url('${BG_070B15_URL}')`;
  const CARD = `background:#0d1425!important;background-color:#0d1425!important;background-image:${BG_IMG_CARD}!important;background-repeat:repeat!important`;
  const OUTER = `background:#070b15!important;background-color:#070b15!important;background-image:${BG_IMG_OUTER}!important;background-repeat:repeat!important`;

  function buildBenefitRows(items: string[]): string {
    return items.map((item) => `<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">\u25b8</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">${item}</td>
</tr></table>
</td>
</tr>`).join("");
  }

  function buildCTAHtml(buttonText: string, rtlArrow: string, href: string): string {
    const displayText = `${buttonText} ${rtlArrow}`;
    return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:52px;v-text-anchor:middle;width:280px" arcsize="20%" strokecolor="#0098b8" fillcolor="#00d4ff">
<w:anchorlock/>
<center style="color:#0a0e1a;font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:800;letter-spacing:0.5px">${displayText}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td align="center" bgcolor="#0098b8" style="border-radius:12px;background-color:#0098b8">
<a href="${href}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#0098b8);background-color:#0098b8;color:#0a0e1a;padding:14px 44px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:0.5px;mso-hide:all;min-height:44px;box-sizing:border-box" class="cta-btn">${displayText}</a>
</td>
</tr>
</table>
<!--<![endif]-->`;
  }

  const benefitRowsEn = buildBenefitRows(BENEFITS_EN);
  const benefitRowsAr = buildBenefitRows(BENEFITS_AR);
  const enterpriseRowsEn = buildBenefitRows(ENTERPRISE_BENEFITS_EN);
  const enterpriseRowsAr = buildBenefitRows(ENTERPRISE_BENEFITS_AR);

  const ctaEn = buildCTAHtml("Activate 50% Eid Offer", "\u2192", cta);
  const ctaAr = buildCTAHtml("\u0641\u0639\u0651\u0644 \u062E\u0635\u0645 \u0627\u0644\u0639\u064A\u062F 50%", "\u2190", cta);
  const entCtaEn = buildCTAHtml("Start Enterprise Team Offer", "\u2192", entCta);
  const entCtaAr = buildCTAHtml("\u0627\u0628\u062F\u0623 \u0639\u0631\u0636 Enterprise Team", "\u2190", entCta);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>${SUBJECT}${titleSuffix}</title>
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
<body bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${OUTER};margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;${OUTER};color:#070b15;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">Eid offer for Saudi engineering offices \u2014 ConsultX Pro and Enterprise at 50% off the first month.${previewSuffix} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#070b15" background="${BG_070B15_URL}" style="${OUTER}">

<tr><td align="center" bgcolor="#070b15" background="${BG_070B15_URL}" style="${OUTER};padding:24px 0 48px">

<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" width="640" align="center"><tr><td bgcolor="#0d1425"><![endif]-->

<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};max-width:640px;width:100%;border-radius:16px;border:1px solid #1a2744">

<!-- HERO -->
<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};background:linear-gradient(180deg,#0d1425 0%,#0a0e1a 100%);border-radius:16px 16px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:40px 22px 0" class="hero">
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 36px;border-radius:16px;border:1px solid #00d4ff22" class="glow-pulse">
<img src="${LOGO_URL}" alt="ConsultX" width="100" height="116" style="display:block;border:0;outline:none;margin:0 auto;max-width:100%;height:auto" />
</td>
</tr>
</table>
</td></tr>

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:20px 22px 4px" class="hero">
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td bgcolor="#f59e0b11" style="background-color:#f59e0b11;border:1.5px solid #f59e0b44;border-radius:30px;padding:8px 24px">
<span style="font-size:12px;font-weight:800;color:#fbbf24;letter-spacing:1px;text-transform:uppercase">&#9734;&nbsp; 50% OFF &mdash; 5 Days Only &nbsp;&#9734;</span>
</td>
</tr>
</table>
</td></tr>

<tr><td dir="ltr" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 44px 0" class="sec">
<h1 style="margin:0;font-size:26px;font-weight:900;color:#f8fbff;line-height:1.2;letter-spacing:-0.3px" class="head">Eid Al-Adha Offer for Engineering Offices</h1>
<p style="margin:8px 0 0;font-size:15px;font-weight:500;color:#d9e7ff;line-height:1.5">Upgrade your engineering review workflow &mdash; not just one engineer&rsquo;s inbox.</p>

<p style="margin:16px 0 0;font-size:18px;font-weight:700;color:#00d4ff;line-height:1.4">ConsultX Pro: 245 SAR &rarr; 122.50 SAR for the first month</p>
<p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#00d4ff;line-height:1.4">Enterprise Team: 399 SAR/seat &rarr; 199.50 SAR/seat for the first month</p>

<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:#f59e0b;line-height:1.4">Valid 26&ndash;30 May only</p>
</td></tr>

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 44px 0;font-size:13px;font-weight:600;color:#8fa3bf;letter-spacing:0.3px;text-transform:uppercase" class="sec">For individual engineers</td></tr>
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 0" class="sec">
${ctaEn}
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:12px 0 0;font-size:12px;color:#8fa3bf;line-height:1.4">No long-term commitment. Cancel anytime.</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:14px 0 0;font-size:12px;color:#8fa3bf;line-height:1.4">
<a href="${cta}" target="_blank" style="color:#8fa3bf;text-decoration:underline">Open offer in browser</a>
</td>
</tr>
</table>
</td></tr>
</table>
</td></tr>

<!-- ENGLISH VALUE: PRO -->
<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:28px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#d9e7ff">
Eid Mubarak from ConsultX. If your office handles SBC questions, NFPA references, fire and life safety reviews, drawing checks, client comments, and internal approvals, ConsultX gives your team a more organized way to review, document, and move faster.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">What does ConsultX Pro give one engineer?</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
${benefitRowsEn}
</table>
</td></tr>

<!-- TRUST SECTION -->
<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">Built for Saudi engineering compliance workflows</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#d9e7ff">
ConsultX supports engineering decision-making using structured references from Saudi Building Code requirements, NFPA standards, and fire and life safety review workflows. It helps engineering teams review faster, document clearer, and reduce repeated code-search effort while keeping final professional judgment with the licensed engineer.
</p>
</td></tr>

<!-- DIVIDER -->
<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ENGLISH VALUE: ENTERPRISE -->
<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">What does ConsultX Enterprise give your office?</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
${enterpriseRowsEn}
</table>
</td></tr>

<!-- ENTERPRISE NOTE -->
<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 0" class="sec">
<p style="margin:0;font-size:13px;line-height:1.5;color:#8fa3bf;font-style:italic">Enterprise is built for offices that need team access, case tracking, internal review workflows, and clearer technical accountability across engineering work.</p>
</td></tr>

<!-- ENTERPRISE CTA -->
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:14px 44px 0;font-size:13px;font-weight:600;color:#8fa3bf;letter-spacing:0.3px;text-transform:uppercase" class="sec">For office teams</td></tr>
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 0" class="sec">
${entCtaEn}
</td></tr>

<!-- RENEWAL NOTE -->
<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 24px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.5;color:#8fa3bf;font-style:italic">After the discounted first month, the plan renews at the normal monthly price unless canceled.</p>
</td></tr>

<!-- DIVIDER 2 -->
<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ARABIC SECTION -->
<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:28px 44px 0" class="sec">
<h1 style="margin:0;font-size:26px;font-weight:900;color:#f8fbff;line-height:1.3;letter-spacing:-0.2px" class="head">\u0639\u0631\u0636 \u0639\u064A\u062F \u0627\u0644\u0623\u0636\u062D\u0649 \u0644\u0644\u0645\u0643\u0627\u062A\u0628 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629</h1>
<p style="margin:8px 0 0;font-size:15px;font-weight:500;color:#d9e7ff;line-height:1.7">\u0637\u0648\u0651\u0631 \u0633\u064A\u0631 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u062F\u0627\u062E\u0644 \u0645\u0643\u062A\u0628\u0643 &mdash; \u0648\u0644\u064A\u0633 \u0645\u062C\u0631\u062F \u062D\u0633\u0627\u0628 \u0641\u0631\u062F\u064A \u0644\u0645\u0647\u0646\u062F\u0633 \u0648\u0627\u062D\u062F.</p>

<p style="margin:16px 0 0;font-size:18px;font-weight:700;color:#00d4ff;line-height:1.6">ConsultX Pro: 245 SAR &rarr; 122.50 SAR \u0644\u0623\u0648\u0644 \u0634\u0647\u0631</p>
<p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#00d4ff;line-height:1.6">Enterprise Team: 399 SAR/\u0645\u0642\u0639\u062F &rarr; 199.50 SAR/\u0645\u0642\u0639\u062F \u0644\u0623\u0648\u0644 \u0634\u0647\u0631</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:#f59e0b;line-height:1.6">\u0635\u0627\u0644\u062D \u0645\u0646 26 \u0625\u0644\u0649 30 \u0645\u0627\u064A\u0648 \u0641\u0642\u0637</p>
</td></tr>

<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:20px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#d9e7ff">
\u0643\u0644 \u0639\u0627\u0645 \u0648\u0623\u0646\u062A\u0645 \u0628\u062E\u064A\u0631 \u0645\u0646 ConsultX. \u0625\u0630\u0627 \u0643\u0627\u0646 \u0645\u0643\u062A\u0628\u0643 \u064A\u062A\u0639\u0627\u0645\u0644 \u064A\u0648\u0645\u064A\u064B\u0627 \u0645\u0639 \u0623\u0633\u0626\u0644\u0629 SBC\u060C \u0645\u0631\u0627\u062C\u0639 NFPA\u060C \u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0648\u0627\u0644\u0648\u0642\u0627\u064A\u0629 \u0645\u0646 \u0627\u0644\u062D\u0631\u064A\u0642\u060C \u0641\u062D\u0635 \u0627\u0644\u0645\u062E\u0637\u0637\u0627\u062A\u060C \u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0627\u0644\u0639\u0645\u0644\u0627\u0621\u060C \u0648\u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0627\u0644\u062F\u0627\u062E\u0644\u064A\u0629\u060C \u0641\u0625\u0646 ConsultX \u064A\u0645\u0646\u062D \u0641\u0631\u064A\u0642\u0643 \u0637\u0631\u064A\u0642\u0629 \u0623\u0643\u062B\u0631 \u062A\u0646\u0638\u064A\u0645\u064B\u0627 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629\u060C \u0648\u0627\u0644\u062A\u0648\u062B\u064A\u0642\u060C \u0648\u062A\u0633\u0631\u064A\u0639 \u0627\u0644\u0639\u0645\u0644.\n</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">\u0645\u0627\u0630\u0627 \u064A\u062D\u0635\u0644 \u0639\u0644\u064A\u0647 \u0627\u0644\u0645\u0647\u0646\u062F\u0633 \u0641\u064A ConsultX Pro\u061F</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
${benefitRowsAr}
</table>
</td></tr>

<!-- ARABIC TRUST SECTION -->
<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">\u0645\u0635\u0645\u0645 \u062D\u0648\u0644 \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629 \u0641\u064A \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#d9e7ff">
\u064A\u062F\u0639\u0645 ConsultX \u0627\u0644\u0642\u0631\u0627\u0631 \u0627\u0644\u0647\u0646\u062F\u0633\u064A \u0628\u0627\u0644\u0627\u0633\u062A\u0646\u0627\u062F \u0625\u0644\u0649 \u0645\u0631\u0627\u062C\u0639 \u0648\u0645\u062A\u0637\u0644\u0628\u0627\u062A \u0643\u0648\u062F \u0627\u0644\u0628\u0646\u0627\u0621 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u060C \u0648\u0645\u0639\u0627\u064A\u064A\u0631 NFPA\u060C \u0648\u0633\u064A\u0631 \u0639\u0645\u0644 \u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0648\u0627\u0644\u0648\u0642\u0627\u064A\u0629 \u0645\u0646 \u0627\u0644\u062D\u0631\u064A\u0642. \u064A\u0633\u0627\u0639\u062F \u0627\u0644\u0641\u0631\u0642 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0628\u0634\u0643\u0644 \u0623\u0633\u0631\u0639\u060C \u0648\u0627\u0644\u062A\u0648\u062B\u064A\u0642 \u0628\u0634\u0643\u0644 \u0623\u0648\u0636\u062D\u060C \u0648\u062A\u0642\u0644\u064A\u0644 \u0648\u0642\u062A \u0627\u0644\u0628\u062D\u062B \u0627\u0644\u0645\u062A\u0643\u0631\u0631\u060C \u0645\u0639 \u0628\u0642\u0627\u0621 \u0627\u0644\u0642\u0631\u0627\u0631 \u0627\u0644\u0645\u0647\u0646\u064A \u0627\u0644\u0646\u0647\u0627\u0626\u064A \u0644\u0644\u0645\u0647\u0646\u062F\u0633 \u0627\u0644\u0645\u062E\u062A\u0635.
</p>
</td></tr>

<!-- ARABIC DIVIDER -->
<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ARABIC ENTERPRISE SECTION -->
<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">\u0645\u0627\u0630\u0627 \u064A\u0645\u0646\u062D ConsultX Enterprise \u0644\u0645\u0643\u062A\u0628\u0643\u061F</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
${enterpriseRowsAr}
</table>
</td></tr>

<!-- ARABIC ENTERPRISE NOTE -->
<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 0" class="sec">
<p style="margin:0;font-size:13px;line-height:1.6;color:#8fa3bf;font-style:italic">تم تصميم Enterprise للمكاتب التي تحتاج وصولًا جماعيًا للفريق، وتتبعًا للحالات، وسير مراجعة داخليًا، ووضوحًا أكبر في المسؤوليات الفنية داخل العمل الهندسي.</p>
</td></tr>

<!-- ARABIC ENTERPRISE CTA -->
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:14px 44px 0;font-size:13px;font-weight:600;color:#8fa3bf" class="sec">للمكاتب والفرق</td></tr>
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 0" class="sec">
${entCtaAr}
</td></tr>

<!-- ARABIC RENEWAL NOTE -->
<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 20px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.6;color:#8fa3bf;font-style:italic">\u0628\u0639\u062F \u0623\u0648\u0644 \u0634\u0647\u0631 \u0645\u062E\u0641\u0636\u060C \u064A\u062A\u0645 \u0627\u0644\u062A\u062C\u062F\u064A\u062F \u0628\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0634\u0647\u0631\u064A \u0627\u0644\u0637\u0628\u064A\u0639\u064A \u0645\u0627 \u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0625\u0644\u063A\u0627\u0621.</p>
</td></tr>

<!-- ARABIC CTA -->
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:14px 44px 0;font-size:13px;font-weight:600;color:#8fa3bf" class="sec">للمهندس الفردي</td></tr>
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 28px" class="sec">
${ctaAr}
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:12px 0 0;font-size:12px;color:#8fa3bf;line-height:1.6">\u0628\u062F\u0648\u0646 \u0627\u0644\u062A\u0632\u0627\u0645 \u0637\u0648\u064A\u0644. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0641\u064A \u0623\u064A \u0648\u0642\u062A.</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:14px 0 0;font-size:12px;color:#8fa3bf;line-height:1.4">
<a href="${cta}" target="_blank" style="color:#8fa3bf;text-decoration:underline">\u0641\u062A\u062D \u0627\u0644\u0639\u0631\u0636 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D</a>
</td>
</tr>
</table>
</td></tr>

<!-- FOOTER -->
<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 28px" class="sec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table>

<p style="margin:16px 0 0;font-size:11px;color:#8fa3bf;line-height:1.6;direction:ltr;text-align:center">
ConsultX &middot; AI-Powered Engineering Decision Support &middot; Saudi Arabia<br>
You are receiving this email at <span style="color:#8fa3bf">${safeRecipient}</span> because your office contact was identified through publicly available engineering office listings in the Kingdom of Saudi Arabia.<br>
If you do not wish to receive future communications, <a href="mailto:support@consultx.app?subject=Unsubscribe%20-%20EID50%20Campaign" style="color:#8fa3bf;text-decoration:underline">unsubscribe here</a>.
</p>
</td></tr>

</table>

<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>`;
}

function buildText(recipient: string, subjectSuffix?: string): string {
  const cta = ctaUrl("pro");
  const entCta = ctaUrl("enterprise_team");
  const suf = subjectSuffix ? ` ${subjectSuffix}` : "";

  const benefitLinesEn = BENEFITS_EN.map((b) => `  ${b}`).join("\n");
  const benefitLinesAr = BENEFITS_AR.map((b) => `  ${b}`).join("\n");
  const enterpriseLinesEn = ENTERPRISE_BENEFITS_EN.map((b) => `  ${b}`).join("\n");
  const enterpriseLinesAr = ENTERPRISE_BENEFITS_AR.map((b) => `  ${b}`).join("\n");

  return [
    `Eid Offer: Upgrade Your Engineering Office with ConsultX at 50% Off${suf}`,
    `${"=".repeat(60)}`,
    "",
    "50% off your first month — valid only from 26 to 30 May 2026.",
    `${"=".repeat(60)}`,
    "",
    "Eid Mubarak from ConsultX. If your office handles SBC questions, NFPA references, fire and life safety reviews, drawing checks, client comments, and internal approvals, ConsultX gives your team a more organized way to review, document, and move faster.",
    "",
    "What does ConsultX Pro give one engineer?",
    benefitLinesEn,
    "",
    "Built for Saudi engineering compliance workflows:",
    "ConsultX supports engineering decision-making using structured references from Saudi Building Code requirements, NFPA standards, and fire and life safety review workflows. It helps engineering teams review faster, document clearer, and reduce repeated code-search effort while keeping final professional judgment with the licensed engineer.",
    "",
    "---",
    "",
    "What does ConsultX Enterprise give your office?",
    enterpriseLinesEn,
    "",
    "Enterprise is built for offices that need team access, case tracking, internal review workflows, and clearer technical accountability across engineering work.",
    "",
    "Start Enterprise Team Offer:",
    entCta,
    "",
    "After the discounted first month, the plan renews at the normal monthly price unless canceled.",
    "",
    "Activate 50% Eid Offer:",
    cta,
    "",
    "------------------------------------------------------------",
    "",
    "عرض عيد الأضحى للمكاتب الهندسية",
    `${"=".repeat(34)}`,
    "",
    "خصم 50% على أول شهر — صالح فقط من 26 إلى 30 مايو 2026.",
    `${"=".repeat(66)}`,
    "",
    "كل عام وأنتم بخير من ConsultX. إذا كان مكتبك يتعامل يوميًا مع أسئلة SBC، مراجع NFPA، مراجعات السلامة والوقاية من الحريق، فحص المخططات، ملاحظات العملاء، والمراجعات الداخلية، فإن ConsultX يمنح فريقك طريقة أكثر تنظيمًا للمراجعة، والتوثيق، وتسريع العمل.",
    "",
    "ماذا يحصل عليه المهندس في ConsultX Pro؟",
    benefitLinesAr,
    "",
    "مصمم حول أعمال المراجعة الهندسية في السعودية:",
    "يدعم ConsultX القرار الهندسي بالاستناد إلى مراجع ومتطلبات كود البناء السعودي، ومعايير NFPA، وسير عمل مراجعات السلامة والوقاية من الحريق. يساعد الفرق الهندسية على المراجعة بشكل أسرع، والتوثيق بشكل أوضح، وتقليل وقت البحث المتكرر، مع بقاء القرار المهني النهائي للمهندس المختص.",
    "",
    "---",
    "",
    "ماذا يمنح ConsultX Enterprise لمكتبك؟",
    enterpriseLinesAr,
    "",
    "تم تصميم Enterprise للمكاتب التي تحتاج وصولًا جماعيًا للفريق، وتتبعًا للحالات، وسير مراجعة داخليًا، ووضوحًا أكبر في المسؤوليات الفنية داخل العمل الهندسي.",
    "",
    "ابدأ عرض Enterprise Team:",
    entCta,
    "",
    "بعد أول شهر مخفض، يتم التجديد بالسعر الشهري الطبيعي ما لم يتم الإلغاء.",
    "",
    "فعّل خصم العيد 50%:",
    cta,
    "",
    "------------------------------------------------------------",
    `You are receiving this email at ${recipient} because your office contact was identified through publicly available engineering office listings in the Kingdom of Saudi Arabia.`,
    "If you do not wish to receive future communications, email support@consultx.app to unsubscribe.",
    "ConsultX · AI-Powered Engineering Decision Support · Saudi Arabia",
  ].join("\n");
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

    const body = await req.json().catch(() => ({}));
    const mode = typeof body?.mode === "string" ? body.mode : "";

    // ── Only testOnly mode is allowed ─────────────────────────────────────────
    if (mode !== "testOnly") {
      return new Response(
        JSON.stringify({
          error: "Only testOnly mode is supported. Full send is not yet configured for this campaign.",
          campaign_code: CAMPAIGN_CODE,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
      const subject = `${SUBJECT} ${TEST_SUBJECT_SUFFIX}`;
      try {
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
            html: buildHtml(email, TEST_SUBJECT_SUFFIX),
            text: buildText(email, TEST_SUBJECT_SUFFIX),
            tags: [
              { name: "campaign", value: "eid50" },
              { name: "mode", value: "testOnly" },
            ],
          }),
        });
        if (response.ok) {
          sent += 1;
          const json = await response.json().catch(() => ({}));
          sentList.push({ email, provider_id: typeof json?.id === "string" ? json.id : null });
        } else {
          failed += 1;
          const body = await response.text();
          failures.push({ email, error: body.slice(0, 240) });
        }
      } catch (err) {
        failed += 1;
        failures.push({ email, error: err instanceof Error ? err.message : String(err) });
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return new Response(
      JSON.stringify({
        mode: "testOnly",
        campaign_code: CAMPAIGN_CODE,
        subject: `${SUBJECT} ${TEST_SUBJECT_SUFFIX}`,
        sent,
        failed,
        attempted: normalized.length,
        sent_to: sentList,
        failures: failures.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-eid50-campaign error:", err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
