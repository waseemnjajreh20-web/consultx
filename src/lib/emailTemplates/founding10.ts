import { FOUNDING10_CAMPAIGN, getFounding10SubscribeUrl } from "@/lib/campaigns/founding10";

const APP_NAME = "ConsultX";
const ctaUrl = getFounding10SubscribeUrl("email", "reactivation");

const BENEFITS_EN = [
  "Review fire and life safety requirements faster.",
  "Use Advisory Mode for deeper SBC / NFPA questions.",
  "Use Analytical Mode for drawing and compliance review.",
  "Generate clearer engineering reasoning with source-based answers.",
  "Save time before reports, reviews, and client responses.",
];

const BENEFITS_AR = [
  "مراجعة متطلبات السلامة والحماية من الحريق بسرعة أكبر.",
  "استخدام الوضع الاستشاري للأسئلة الكودية العميقة.",
  "استخدام الوضع التحليلي لمراجعة المخططات والامتثال.",
  "الحصول على إجابات هندسية أوضح ومدعومة بالمصادر.",
  "توفير الوقت قبل إعداد التقارير والمراجعات والردود الفنية.",
];

function buildOutlookVmlButton(buttonText: string): string {
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaUrl}" style="height:52px;v-text-anchor:middle;width:280px" arcsize="20%" strokecolor="#0098b8" fillcolor="#00d4ff">
<w:anchorlock/>
<center style="color:#0a0e1a;font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:800;letter-spacing:0.5px">${buttonText}</center>
</v:roundrect>
<![endif]-->`;
}

function buildCTAHtml(buttonText: string, rtlArrow: string): string {
  const displayText = `${buttonText} ${rtlArrow}`;
  return `${buildOutlookVmlButton(displayText)}
<!--[if !mso]><!-- -->
<table role="presentation" cellpadding="0" cellspacing="0" align="center">
<tr>
<td align="center" bgcolor="#0098b8" style="border-radius:12px;background-color:#0098b8">
<a href="${ctaUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#0098b8);background-color:#0098b8;color:#0a0e1a;padding:14px 44px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:0.5px;mso-hide:all;min-height:44px;box-sizing:border-box" class="cta-btn">${displayText}</a>
</td>
</tr>
</table>
<!--<![endif]-->`;
}

function buildBenefitRows(items: string[]): string {
  return items
    .map(
      (item) => `<tr>
<td style="padding:6px 0;font-size:15px;line-height:1.55;color:#cbd5e1;vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:22px;font-size:15px;color:#00d4ff;vertical-align:top;padding-right:8px">▸</td>
<td style="font-size:15px;line-height:1.55;color:#cbd5e1">${item}</td>
</tr></table>
</td>
</tr>`,
    )
    .join("");
}

function buildBrowserLink(label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center">
<tr>
<td align="center" style="padding:14px 0 0;font-size:12px;color:#64748b;line-height:1.4">
<a href="${ctaUrl}" target="_blank" style="color:#64748b;text-decoration:underline">${label}</a>
</td>
</tr>
</table>`;
}

const STYLES = `
body{margin:0;padding:0;background-color:#070b15;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
img{border:0;outline:none;text-decoration:none;display:block}
@-ms-viewport{width:device-width}
@viewport{width:device-width}
@keyframes pulse-glow{0%,100%{box-shadow:0 0 18px rgba(0,212,255,0.35),0 0 40px rgba(0,212,255,0.12)}50%{box-shadow:0 0 30px rgba(0,212,255,0.55),0 0 60px rgba(0,212,255,0.20)}}
.glow-pulse{animation:pulse-glow 3s ease-in-out infinite}
.px{padding-left:44px!important;padding-right:44px!important}
.px-light{padding-left:44px!important;padding-right:44px!important}
.px-hero{padding-left:22px!important;padding-right:22px!important}
@media only screen and (max-width:640px){
.px{padding-left:26px!important;padding-right:26px!important}
.px-light{padding-left:26px!important;padding-right:26px!important}
.px-hero{padding-left:22px!important;padding-right:22px!important}
.head{font-size:24px!important}
}
@media only screen and (max-width:480px){
.px{padding-left:22px!important;padding-right:22px!important}
.px-light{padding-left:22px!important;padding-right:22px!important}
.px-hero{padding-left:18px!important;padding-right:18px!important}
.head{font-size:22px!important}
.cta-btn{padding-left:28px!important;padding-right:28px!important}
}
`;

export function buildFounding10HtmlEmail(): string {
  const benefitRowsEn = buildBenefitRows(BENEFITS_EN);
  const benefitRowsAr = buildBenefitRows(BENEFITS_AR);

  const ctaEn = buildCTAHtml("Activate for 10 SAR", "→");
  const ctaAr = buildCTAHtml(FOUNDING10_CAMPAIGN.cta.ar, "←");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>${FOUNDING10_CAMPAIGN.title.en} — ConsultX Pro for 10 SAR</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${STYLES}</style>
</head>
<body style="margin:0;padding:0;background-color:#070b15;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="display:none;font-size:1px;color:#070b15;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">ConsultX Pro first month for 10 SAR — limited launch offer for early engineers. &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#070b15">

<tr><td align="center" style="padding:24px 0 48px">

<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" width="640" align="center"><tr><td><![endif]-->

<!-- ===== MAIN CARD ===== -->
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background-color:#0d1425;border-radius:16px;border:1px solid #1a2744">

<!-- ===== HERO ===== -->
<tr><td style="background:linear-gradient(180deg,#0d1425 0%,#0a0e1a 100%);background-color:#0d1425;border-radius:16px 16px 0 0" bgcolor="#0d1425">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">

<!-- Logo -->
<tr><td align="center" style="padding:40px 22px 0" class="px-hero">
<table role="presentation" cellpadding="0" cellspacing="0" align="center">
<tr>
<td align="center" style="padding:18px 36px;border-radius:16px;background:linear-gradient(135deg,#00d4ff08,#00d4ff03);background-color:#0d1425;border:1px solid #00d4ff22" class="glow-pulse logo-frame">
<img src="https://www.consultx.app/assets/consultx-email-logo.png" alt="${APP_NAME}" width="100" height="116" style="display:block;border:0;outline:none;margin:0 auto;max-width:100%;height:auto" />
</td>
</tr>
</table>
</td></tr>

<!-- Offer badge -->
<tr><td align="center" style="padding:20px 22px 4px" class="px-hero">
<table role="presentation" cellpadding="0" cellspacing="0" align="center">
<tr>
<td bgcolor="#f59e0b11" style="background:linear-gradient(135deg,#f59e0b22,#f59e0b11);background-color:#f59e0b11;border:1.5px solid #f59e0b44;border-radius:30px;padding:8px 24px">
<span style="font-size:12px;font-weight:800;color:#fbbf24;letter-spacing:1px;text-transform:uppercase">✦&nbsp; First Month — 10 SAR &nbsp;✦</span>
</td>
</tr>
</table>
</td></tr>

<!-- Headline -->
<tr><td dir="ltr" align="center" style="padding:18px 0 0" class="px">
<h1 style="margin:0;font-size:26px;font-weight:900;color:#f1f5f9;line-height:1.2;letter-spacing:-0.3px" class="head">${FOUNDING10_CAMPAIGN.title.en}</h1>
<p style="margin:8px 0 0;font-size:16px;font-weight:500;color:#00d4ff;line-height:1.5">Activate your first month of ConsultX Pro for only <strong style="color:#fbbf24;font-weight:800">10 SAR</strong>.</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:#f59e0b;line-height:1.4">Limited launch offer for early engineers.</p>
</td></tr>

<!-- English CTA -->
<tr><td align="center" style="padding:20px 0 0" class="px">
${ctaEn}
<table role="presentation" cellpadding="0" cellspacing="0" align="center">
<tr><td align="center" style="padding:12px 0 0;font-size:12px;color:#64748b;line-height:1.4">No long-term commitment. Cancel anytime.</td></tr>
</table>
${buildBrowserLink("Open offer in browser")}
</td></tr>
</table>
</td></tr>

<!-- ===== ENGLISH VALUE SECTION ===== -->
<tr><td dir="ltr" style="padding:28px 0 0" class="px">
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#94a3b8">
ConsultX is built for engineers who review fire and life safety, Saudi Building Code, NFPA references, compliance notes, and technical reports. You may not have seen what it can really do yet.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#e2e8f0">With ConsultX Pro, you can:</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${benefitRowsEn}
</table>
</td></tr>

<tr><td dir="ltr" style="padding:8px 0 24px" class="px">
<p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;font-style:italic">After the first month, your subscription renews at the normal Pro price unless canceled.</p>
</td></tr>

<!-- ===== DIVIDER ===== -->
<tr><td style="padding:0" class="px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ===== CREDIBILITY ===== -->
<tr><td align="center" style="padding:18px 0 12px" class="px">
<p style="margin:0;font-size:11px;line-height:1.5;color:#475569">Built for SBC 201, SBC 801, NFPA, fire &amp; life safety reviews, and engineering decision support.</p>
</td></tr>

<!-- ===== DIVIDER 2 ===== -->
<tr><td style="padding:0" class="px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ===== ARABIC SECTION ===== -->
<tr><td dir="rtl" style="padding:28px 0 0" class="px">
<h1 style="margin:0;font-size:26px;font-weight:900;color:#f1f5f9;line-height:1.3;letter-spacing:-0.2px" class="head">${FOUNDING10_CAMPAIGN.title.ar}</h1>
<p style="margin:8px 0 0;font-size:16px;font-weight:500;color:#00d4ff;line-height:1.7">أول شهر في ConsultX Pro مقابل <strong style="color:#fbbf24;font-weight:800">10 ريال</strong> فقط.</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:#f59e0b;line-height:1.6">عرض إطلاق محدود للمهندسين الأوائل.</p>
</td></tr>

<tr><td dir="rtl" style="padding:20px 0 0" class="px">
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#94a3b8">
تم بناء ConsultX للمهندسين الذين يراجعون متطلبات السلامة من الحريق، كود البناء السعودي، مراجع NFPA، ملاحظات الامتثال، والتقارير الفنية. ربما لم تجرّب بعد قيمته الحقيقية.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#e2e8f0">مع ConsultX Pro يمكنك:</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${benefitRowsAr}
</table>
</td></tr>

<tr><td dir="rtl" style="padding:8px 0 20px" class="px">
<p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;font-style:italic">${FOUNDING10_CAMPAIGN.afterFirstMonth.ar}</p>
</td></tr>

<!-- ===== ARABIC CTA ===== -->
<tr><td align="center" style="padding:4px 0 28px" class="px">
${ctaAr}
<table role="presentation" cellpadding="0" cellspacing="0" align="center">
<tr><td align="center" style="padding:12px 0 0;font-size:12px;color:#64748b;line-height:1.6">بدون التزام طويل. يمكنك الإلغاء في أي وقت.</td></tr>
</table>
${buildBrowserLink("فتح العرض في المتصفح")}
</td></tr>

<!-- ===== FOOTER ===== -->
<tr><td style="padding:8px 0 28px" class="px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #1a2744;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table>

<p style="margin:16px 0 0;font-size:11px;color:#475569;line-height:1.6;direction:ltr;text-align:center">
${APP_NAME} &middot; Fire Safety Engineering &middot; Engineering Decision Support<br>
You are receiving this email because you created a ${APP_NAME} account.<br>
If you do not want to receive product updates, you can unsubscribe.
</p>
</td></tr>

</table>
<!-- ===== END MAIN CARD ===== -->

<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>`;
}

export function buildFounding10TextEmail(): string {
  const benefitLinesEn = BENEFITS_EN.map((b) => `  ▸ ${b}`).join("\n");
  const benefitLinesAr = BENEFITS_AR.map((b) => `  ▸ ${b}`).join("\n");

  return `FOUNDING ENGINEERS OFFER
${"=".repeat(22)}

Activate your first month of ConsultX Pro for only 10 SAR.

You created a ConsultX account, but you may not have seen what the platform can really do yet.

ConsultX is built for engineers who review fire and life safety requirements, Saudi Building Code, NFPA references, compliance notes, and technical reports.

With ConsultX Pro, you can:
${benefitLinesEn}

After the first month, your subscription renews at the normal Pro price unless canceled.

Activate for 10 SAR: ${ctaUrl}

---
${"=".repeat(40)}

عرض خاص للمهندسين الأوائل
${"=".repeat(28)}

فعّل أول شهر من ConsultX Pro مقابل 10 ريال فقط.

قمت بإنشاء حساب في ConsultX، لكن ربما لم تجرّب بعد القيمة الحقيقية للمنصة.

تم بناء ConsultX للمهندسين الذين يراجعون متطلبات السلامة والحماية من الحريق، كود البناء السعودي، مراجع NFPA، ملاحظات الامتثال، والتقارير الفنية.

مع ConsultX Pro يمكنك:
${benefitLinesAr}

بعد الشهر الأول، يتم التجديد بالسعر الطبيعي لخطة Pro ما لم يتم الإلغاء.

فعّل بـ 10 ريال: ${ctaUrl}

---
${"=".repeat(40)}
ConsultX — Fire Safety Engineering · Engineering Decision Support
Built for SBC 201, SBC 801, NFPA, fire & life safety reviews, and engineering decision support.

You are receiving this email because you created a ConsultX account.
If you do not want to receive product updates, you can unsubscribe.`;
}
