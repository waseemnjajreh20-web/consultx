import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];
const CAMPAIGN_CODE = "EID50";
const SUBJECT = "Eid Al-Adha Offer: ConsultX Pro for 122.50 SAR Instead of 245 SAR";
const TEST_SUBJECT_SUFFIX = "[EID50 ADMIN TEST v2]";
const LOGO_URL = "https://www.consultx.app/assets/consultx-email-logo.png";
const PROD_ORIGIN = "https://www.consultx.app";
const BG_0D1425_URL = "https://www.consultx.app/assets/email-bg-0d1425.png";
const BG_070B15_URL = "https://www.consultx.app/assets/email-bg-070b15.png";

function ctaUrl(): string {
  const params = new URLSearchParams({
    plan: "pro",
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

function buildHtml(recipient: string, subjectSuffix?: string): string {
  const cta = ctaUrl();
  const safeRecipient = escapeHtml(recipient);
  const titleSuffix = subjectSuffix ? ` ${subjectSuffix}` : "";
  const previewSuffix = subjectSuffix ? ` [${subjectSuffix}]` : "";
  const BG_IMG_CARD = `url('${BG_0D1425_URL}')`;
  const BG_IMG_OUTER = `url('${BG_070B15_URL}')`;
  const CARD = `background:#0d1425!important;background-color:#0d1425!important;background-image:${BG_IMG_CARD}!important;background-repeat:repeat!important`;
  const OUTER = `background:#070b15!important;background-color:#070b15!important;background-image:${BG_IMG_OUTER}!important;background-repeat:repeat!important`;
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
<div style="display:none;font-size:1px;${OUTER};color:#070b15;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">A 5-day Eid offer for engineering offices reviewing SBC, NFPA, fire and life safety requirements.${previewSuffix} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>

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
<p style="margin:8px 0 0;font-size:20px;font-weight:700;color:#00d4ff;line-height:1.4">ConsultX Pro for 122.50 SAR instead of 245 SAR</p>
<p style="margin:8px 0 0;font-size:16px;font-weight:500;color:#d9e7ff;line-height:1.5">50% off your first month — valid only from 26 to 30 May 2026.</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:#f59e0b;line-height:1.4">Valid 26–30 May only</p>
</td></tr>

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:20px 44px 0" class="sec">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${cta}" style="height:52px;v-text-anchor:middle;width:280px" arcsize="20%" strokecolor="#0098b8" fillcolor="#00d4ff">
<w:anchorlock/>
<center style="color:#0a0e1a;font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:800;letter-spacing:0.5px">Activate 50% Eid Offer →</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td align="center" bgcolor="#0098b8" style="border-radius:12px;background-color:#0098b8">
<a href="${cta}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#0098b8);background-color:#0098b8;color:#0a0e1a;padding:14px 44px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:0.5px;mso-hide:all;min-height:44px;box-sizing:border-box" class="cta-btn">Activate 50% Eid Offer →</a>
</td>
</tr>
</table>
<!--<![endif]-->
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

<!-- ENGLISH VALUE SECTION -->
<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:28px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#d9e7ff">
Eid Mubarak from ConsultX. For engineering offices and fire/life-safety consultants, this is a limited opportunity to test ConsultX Pro in real project work: code questions, drawing review, compliance notes, and technical reports — at half the first-month price.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">What do you get with ConsultX Pro?</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">Advisory Mode for SBC / NFPA questions — ask deep fire and life safety questions and get structured, source-aware answers.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">Analytical Mode for drawings and documents — upload drawings and documents to identify requirements, gaps, and review notes before submission.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">Faster technical decisions — reduce repeated searching through code clauses and move faster in daily engineering review work.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">Better reports and client responses — prepare clearer technical comments, summaries, and professional replies.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">Saudi-focused workflow — built around SBC, fire and life safety review, Civil Defense-oriented workflows, and engineering office needs.</td>
</tr></table>
</td>
</tr>
</table>
</td></tr>

<!-- TRUST SECTION -->
<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">Built for Saudi engineering compliance workflows</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#d9e7ff">
ConsultX supports engineering decision-making using structured references from Saudi Building Code requirements, NFPA standards, and fire and life safety review workflows. It helps engineers review faster and document clearer while keeping final professional judgment with the licensed engineer.
</p>
</td></tr>

<!-- ENTERPRISE / TEAM SECTION -->
<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 4px" class="sec">
<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#f8fbff">For engineering offices and teams</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#d9e7ff">
Need seats for your team? The Eid offer also applies to Enterprise/team subscriptions: 199.50 SAR/seat instead of 399 SAR/seat per user for the first month.<br>
<a href="${cta}" target="_blank" style="color:#00d4ff;text-decoration:underline">Contact us to activate the team offer</a>.
</p>
</td></tr>

<tr><td dir="ltr" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 24px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.5;color:#8fa3bf;font-style:italic">After the discounted first month, the plan renews at the normal monthly price unless canceled.</p>
</td></tr>

<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 44px 12px" class="sec">
<p style="margin:0;font-size:11px;line-height:1.5;color:#8fa3bf">Trusted by engineering offices across Saudi Arabia for SBC 201, SBC 801, NFPA compliance, fire &amp; life safety reviews, and engineering decision support.</p>
</td></tr>

<tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr><td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ARABIC SECTION -->
<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:28px 44px 0" class="sec">
<h1 style="margin:0;font-size:26px;font-weight:900;color:#f8fbff;line-height:1.3;letter-spacing:-0.2px" class="head">عرض عيد الأضحى للمكاتب الهندسية</h1>
<p style="margin:8px 0 0;font-size:20px;font-weight:700;color:#00d4ff;line-height:1.6">ConsultX Pro بـ 122.50 ريال بدلًا من 245 ريال</p>
<p style="margin:8px 0 0;font-size:16px;font-weight:500;color:#d9e7ff;line-height:1.7">خصم 50% على أول شهر — صالح فقط من 26 إلى 30 مايو 2026.</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:#f59e0b;line-height:1.6">صالح من 26 إلى 30 مايو فقط</p>
</td></tr>

<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:20px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#d9e7ff">
كل عام وأنتم بخير من ConsultX. للمكاتب الهندسية واستشاريي السلامة والوقاية من الحريق، هذا عرض محدود لتجربة ConsultX Pro في العمل الهندسي اليومي: أسئلة الكود، مراجعة المخططات، ملاحظات الامتثال، والتقارير الفنية — بنصف سعر أول شهر.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">ماذا تحصل عليه في ConsultX Pro؟</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">وضع Advisory لأسئلة SBC / NFPA — اطرح أسئلة عميقة في السلامة والحماية من الحريق واحصل على إجابات منظمة ومدعومة بالمراجع.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">وضع Analytical للمخططات والمستندات — ارفع المخططات والمستندات لاستخراج المتطلبات، الفجوات، وملاحظات المراجعة قبل الرفع أو التسليم.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">قرارات فنية أسرع — قلّل وقت البحث المتكرر داخل البنود والكود، وتحرك أسرع في أعمال المراجعة اليومية.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">تقارير وردود أوضح للعملاء — جهّز ملاحظات فنية، ملخصات، وردود هندسية أكثر تنظيمًا واحترافية.</td>
</tr></table>
</td>
</tr>
<tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:6px 0;font-size:15px;line-height:1.55;color:#d9e7ff;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}"><tr>
<td bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};font-size:15px;line-height:1.55;color:#d9e7ff">سير عمل موجه للسوق السعودي — مصمم حول SBC، مراجعات السلامة والحماية من الحريق، ومتطلبات المكاتب الهندسية.</td>
</tr></table>
</td>
</tr>
</table>
</td></tr>

<!-- ARABIC TRUST SECTION -->
<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#f8fbff">مصمم لسير عمل المكاتب الهندسية في السعودية</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#d9e7ff">
يدعم ConsultX القرار الهندسي بالاستناد إلى مراجع ومتطلبات كود البناء السعودي، ومعايير NFPA، وسير عمل مراجعات السلامة والوقاية من الحريق. يساعد المهندس على المراجعة بشكل أسرع والتوثيق بشكل أوضح، مع بقاء القرار المهني النهائي للمهندس المختص.
</p>
</td></tr>

<!-- ARABIC ENTERPRISE / TEAM SECTION -->
<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 4px" class="sec">
<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#f8fbff">للمكاتب الهندسية والشركات</p>
<p style="margin:0;font-size:14px;line-height:1.8;color:#d9e7ff">
تحتاج مقاعد لفريقك؟ عرض العيد يشمل الاشتراكات المؤسسية وفرق العمل: 199.50 ريال/مستخدم بدلًا من 399 ريال/مستخدم لكل مستخدم في أول شهر.<br>
<a href="${cta}" target="_blank" style="color:#00d4ff;text-decoration:underline">تواصل معنا لتفعيل عرض الفريق</a>.
</p>
</td></tr>

<tr><td dir="rtl" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:8px 44px 20px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.6;color:#8fa3bf;font-style:italic">بعد أول شهر مخفض، يتم التجديد بالسعر الشهري الطبيعي ما لم يتم الإلغاء.</p>
</td></tr>

<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:4px 44px 28px" class="sec">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${cta}" style="height:52px;v-text-anchor:middle;width:280px" arcsize="20%" strokecolor="#0098b8" fillcolor="#00d4ff">
<w:anchorlock/>
<center style="color:#0a0e1a;font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:800;letter-spacing:0.5px">← فعّل خصم العيد 50%</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td align="center" bgcolor="#0098b8" style="border-radius:12px;background-color:#0098b8">
<a href="${cta}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#0098b8);background-color:#0098b8;color:#0a0e1a;padding:14px 44px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:0.5px;mso-hide:all;min-height:44px;box-sizing:border-box" class="cta-btn">← فعّل خصم العيد 50%</a>
</td>
</tr>
</table>
<!--<![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr><td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:12px 0 0;font-size:12px;color:#8fa3bf;line-height:1.6">بدون التزام طويل. يمكنك الإلغاء في أي وقت.</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD}">
<tr>
<td align="center" bgcolor="#0d1425" background="${BG_0D1425_URL}" style="${CARD};padding:14px 0 0;font-size:12px;color:#8fa3bf;line-height:1.4">
<a href="${cta}" target="_blank" style="color:#8fa3bf;text-decoration:underline">فتح العرض في المتصفح</a>
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
  const cta = ctaUrl();
  const suf = subjectSuffix ? ` ${subjectSuffix}` : "";
  return [
    `Eid Al-Adha Offer — ConsultX Pro for 122.50 SAR Instead of 245 SAR${suf}`,
    `${"=".repeat(60)}`,
    "",
    "50% off your first month — valid only from 26 to 30 May 2026.",
    `${"=".repeat(60)}`,
    "",
    "Eid Mubarak from ConsultX. For engineering offices and fire/life-safety consultants, this is a limited opportunity to test ConsultX Pro in real project work: code questions, drawing review, compliance notes, and technical reports — at half the first-month price.",
    "",
    "What do you get with ConsultX Pro?",
    "  Advisory Mode for SBC / NFPA questions — ask deep fire and life safety questions and get structured, source-aware answers.",
    "  Analytical Mode for drawings and documents — upload drawings and documents to identify requirements, gaps, and review notes before submission.",
    "  Faster technical decisions — reduce repeated searching through code clauses and move faster in daily engineering review work.",
    "  Better reports and client responses — prepare clearer technical comments, summaries, and professional replies.",
    "  Saudi-focused workflow — built around SBC, fire and life safety review, Civil Defense-oriented workflows, and engineering office needs.",
    "",
    "Built for Saudi engineering compliance workflows:",
    "ConsultX supports engineering decision-making using structured references from Saudi Building Code requirements, NFPA standards, and fire and life safety review workflows. It helps engineers review faster and document clearer while keeping final professional judgment with the licensed engineer.",
    "",
    "For engineering offices and teams:",
    "Need seats for your team? The Eid offer also applies to Enterprise/team subscriptions: 199.50 SAR/seat instead of 399 SAR/seat per user for the first month.",
    `Contact us to activate the team offer: ${cta}`,
    "",
    "After the discounted first month, the plan renews at the normal monthly price unless canceled.",
    "",
    "Activate 50% Eid Offer:",
    cta,
    "",
    "------------------------------------------------------------",
    "",
    `عرض عيد الأضحى — ConsultX Pro بـ 122.50 ريال بدلًا من 245 ريال${suf}`,
    `${"=".repeat(66)}`,
    "",
    "خصم 50% على أول شهر — صالح فقط من 26 إلى 30 مايو 2026.",
    `${"=".repeat(66)}`,
    "",
    "كل عام وأنتم بخير من ConsultX. للمكاتب الهندسية واستشاريي السلامة والوقاية من الحريق، هذا عرض محدود لتجربة ConsultX Pro في العمل الهندسي اليومي: أسئلة الكود، مراجعة المخططات، ملاحظات الامتثال، والتقارير الفنية — بنصف سعر أول شهر.",
    "",
    "ماذا تحصل عليه في ConsultX Pro؟",
    "  وضع Advisory لأسئلة SBC / NFPA — اطرح أسئلة عميقة في السلامة والحماية من الحريق واحصل على إجابات منظمة ومدعومة بالمراجع.",
    "  وضع Analytical للمخططات والمستندات — ارفع المخططات والمستندات لاستخراج المتطلبات، الفجوات، وملاحظات المراجعة قبل الرفع أو التسليم.",
    "  قرارات فنية أسرع — قلّل وقت البحث المتكرر داخل البنود والكود، وتحرك أسرع في أعمال المراجعة اليومية.",
    "  تقارير وردود أوضح للعملاء — جهّز ملاحظات فنية، ملخصات، وردود هندسية أكثر تنظيمًا واحترافية.",
    "  سير عمل موجه للسوق السعودي — مصمم حول SBC، مراجعات السلامة والحماية من الحريق، ومتطلبات المكاتب الهندسية.",
    "",
    "مصمم لسير عمل المكاتب الهندسية في السعودية:",
    "يدعم ConsultX القرار الهندسي بالاستناد إلى مراجع ومتطلبات كود البناء السعودي، ومعايير NFPA، وسير عمل مراجعات السلامة والوقاية من الحريق. يساعد المهندس على المراجعة بشكل أسرع والتوثيق بشكل أوضح، مع بقاء القرار المهني النهائي للمهندس المختص.",
    "",
    "للمكاتب الهندسية والشركات:",
    "تحتاج مقاعد لفريقك؟ عرض العيد يشمل الاشتراكات المؤسسية وفرق العمل: 199.50 ريال/مستخدم بدلًا من 399 ريال/مستخدم لكل مستخدم في أول شهر.",
    `تواصل معنا لتفعيل عرض الفريق: ${cta}`,
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
