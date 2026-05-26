import { EID50_CAMPAIGN, EID50_PRICING, getEid50SubscribeUrl } from "@/lib/campaigns/eid50";

const APP_NAME = "ConsultX";
const BG_DARK = "#070b15";
const CARD_DARK = "#0d1425";
const CARD_BORDER = "#1a2744";
const TEXT_MUTED = "#8fa3bf";
const TEXT_BODY = "#d9e7ff";
const TEXT_HEADING = "#f8fbff";
const TEXT_HIGHLIGHT = "#f8fbff";
const CYAN = "#00d4ff";
const CYAN_DARK = "#0098b8";
const GOLD = "#fbbf24";
const GOLD_DARK = "#f59e0b";

const BG_0D1425_URL = "https://www.consultx.app/assets/email-bg-0d1425.png";
const BG_070B15_URL = "https://www.consultx.app/assets/email-bg-070b15.png";

const CARD_STYLE = `background:#${CARD_DARK}!important;background-color:#${CARD_DARK}!important;background-image:url('${BG_0D1425_URL}')!important;background-repeat:repeat!important`;
const OUTER_STYLE = `background:#${BG_DARK}!important;background-color:#${BG_DARK}!important;background-image:url('${BG_070B15_URL}')!important;background-repeat:repeat!important`;

const ctaUrl = getEid50SubscribeUrl("email", "outbound");

const BENEFITS_EN = [
  "Advisory Mode for SBC / NFPA questions — ask deep fire and life safety questions and get structured, source-aware answers.",
  "Analytical Mode for drawings and documents — upload drawings and documents to identify requirements, gaps, and review notes before submission.",
  "Faster technical decisions — reduce repeated searching through code clauses and move faster in daily engineering review work.",
  "Better reports and client responses — prepare clearer technical comments, summaries, and professional replies.",
  "Saudi-focused workflow — built around SBC, fire and life safety review, Civil Defense-oriented workflows, and engineering office needs.",
];

const BENEFITS_AR = [
  "وضع Advisory لأسئلة SBC / NFPA — اطرح أسئلة عميقة في السلامة والحماية من الحريق واحصل على إجابات منظمة ومدعومة بالمراجع.",
  "وضع Analytical للمخططات والمستندات — ارفع المخططات والمستندات لاستخراج المتطلبات، الفجوات، وملاحظات المراجعة قبل الرفع أو التسليم.",
  "قرارات فنية أسرع — قلّل وقت البحث المتكرر داخل البنود والكود، وتحرك أسرع في أعمال المراجعة اليومية.",
  "تقارير وردود أوضح للعملاء — جهّز ملاحظات فنية، ملخصات، وردود هندسية أكثر تنظيمًا واحترافية.",
  "سير عمل موجه للسوق السعودي — مصمم حول SBC، مراجعات السلامة والحماية من الحريق، ومتطلبات المكاتب الهندسية.",
];

function buildOutlookVmlButton(buttonText: string, href: string): string {
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:52px;v-text-anchor:middle;width:280px" arcsize="20%" strokecolor="${CYAN_DARK}" fillcolor="${CYAN}">
<w:anchorlock/>
<center style="color:#0a0e1a;font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:800;letter-spacing:0.5px">${buttonText}</center>
</v:roundrect>
<![endif]-->`;
}

function buildCTAHtml(buttonText: string, rtlArrow: string, href: string): string {
  const displayText = `${buttonText} ${rtlArrow}`;
  return `${buildOutlookVmlButton(displayText, href)}
<!--[if !mso]><!-- -->
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td align="center" bgcolor="${CYAN_DARK}" style="border-radius:12px;background-color:${CYAN_DARK}">
<a href="${href}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,${CYAN},${CYAN_DARK});background-color:${CYAN_DARK};color:#0a0e1a;padding:14px 44px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:0.5px;mso-hide:all;min-height:44px;box-sizing:border-box" class="cta-btn">${displayText}</a>
</td>
</tr>
</table>
<!--<![endif]-->`;
}

function buildBenefitRows(items: string[]): string {
  return items
    .map(
      (item) => `<tr>
<td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:6px 0;font-size:15px;line-height:1.55;color:${TEXT_BODY};vertical-align:top">
<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr>
<td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:${CYAN};vertical-align:top;padding-right:8px">▸</td>
<td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:${TEXT_BODY}">${item}</td>
</tr></table>
</td>
</tr>`,
    )
    .join("");
}

function buildBrowserLink(label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:14px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.4">
<a href="${ctaUrl}" target="_blank" style="color:${TEXT_MUTED};text-decoration:underline">${label}</a>
</td>
</tr>
</table>`;
}

const STYLES = `
body{margin:0;padding:0;background:${OUTER_STYLE};background-color:${BG_DARK}!important;background-image:url('${BG_070B15_URL}')!important;background-repeat:repeat!important;-webkit-text-size-adjust:100%!important;-ms-text-size-adjust:100%!important}
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
`;

export function buildEid50HtmlEmail(): string {
  const benefitRowsEn = buildBenefitRows(BENEFITS_EN);
  const benefitRowsAr = buildBenefitRows(BENEFITS_AR);

  const ctaEn = buildCTAHtml(EID50_CAMPAIGN.cta.en, "→", ctaUrl);
  const ctaAr = buildCTAHtml(EID50_CAMPAIGN.cta.ar, "←", ctaUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>${EID50_CAMPAIGN.title.en}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${STYLES}</style>
</head>
<body bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${OUTER_STYLE};margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;${OUTER_STYLE};color:${BG_DARK};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">A 5-day Eid offer for engineering offices reviewing SBC, NFPA, fire and life safety requirements. &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG_DARK}" background="${BG_070B15_URL}" style="${OUTER_STYLE}">

<tr><td align="center" bgcolor="${BG_DARK}" background="${BG_070B15_URL}" style="${OUTER_STYLE};padding:24px 0 48px">

<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" width="640" align="center"><tr><td bgcolor="${CARD_DARK}"><![endif]-->

<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};max-width:640px;width:100%;border-radius:16px;border:1px solid ${CARD_BORDER}">

<!-- HERO -->
<tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};background:linear-gradient(180deg,${CARD_DARK} 0%,#0a0e1a 100%);border-radius:16px 16px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">

<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:40px 22px 0" class="hero">
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 36px;border-radius:16px;border:1px solid #00d4ff22" class="glow-pulse">
<img src="https://www.consultx.app/assets/consultx-email-logo.png" alt="${APP_NAME}" width="100" height="116" style="display:block;border:0;outline:none;margin:0 auto;max-width:100%;height:auto" />
</td>
</tr>
</table>
</td></tr>

<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:20px 22px 4px" class="hero">
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td bgcolor="#f59e0b11" style="background-color:#f59e0b11;border:1.5px solid #f59e0b44;border-radius:30px;padding:8px 24px">
<span style="font-size:12px;font-weight:800;color:${GOLD};letter-spacing:1px;text-transform:uppercase">✦&nbsp; 50% OFF — 5 Days Only &nbsp;✦</span>
</td>
</tr>
</table>
</td></tr>

<tr><td dir="ltr" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0" class="sec">
<h1 style="margin:0;font-size:26px;font-weight:900;color:${TEXT_HEADING};line-height:1.2;letter-spacing:-0.3px" class="head">${EID50_CAMPAIGN.title.en}</h1>
<p style="margin:8px 0 0;font-size:20px;font-weight:700;color:${CYAN};line-height:1.4">ConsultX Pro for ${EID50_PRICING.pro.discountedLabel} instead of ${EID50_PRICING.pro.normalLabel}</p>
<p style="margin:8px 0 0;font-size:16px;font-weight:500;color:${TEXT_BODY};line-height:1.5">${EID50_CAMPAIGN.subheadline.en}</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:${GOLD_DARK};line-height:1.4">${EID50_CAMPAIGN.dateRange.en}</p>
</td></tr>

<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:20px 44px 0" class="sec">
${ctaEn}
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:12px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.4">No long-term commitment. Cancel anytime.</td></tr>
</table>
${buildBrowserLink("Open offer in browser")}
</td></tr>
</table>
</td></tr>

<!-- ENGLISH VALUE SECTION -->
<tr><td dir="ltr" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:28px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:${TEXT_BODY}">
Eid Mubarak from ConsultX. For engineering offices and fire/life-safety consultants, this is a limited opportunity to test ConsultX Pro in real project work: code questions, drawing review, compliance notes, and technical reports — at half the first-month price.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">What do you get with ConsultX Pro?</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
${benefitRowsEn}
</table>
</td></tr>

<!-- TRUST SECTION -->
<tr><td dir="ltr" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">Built for Saudi engineering compliance workflows</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:${TEXT_BODY}">
ConsultX supports engineering decision-making using structured references from Saudi Building Code requirements, NFPA standards, and fire and life safety review workflows. It helps engineers review faster and document clearer while keeping final professional judgment with the licensed engineer.
</p>
</td></tr>

<!-- ENTERPRISE / TEAM SECTION -->
<tr><td dir="ltr" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 4px" class="sec">
<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">For engineering offices and teams</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:${TEXT_BODY}">
Need seats for your team? The Eid offer also applies to Enterprise/team subscriptions: ${EID50_PRICING.enterpriseTeam.discountedLabel} instead of ${EID50_PRICING.enterpriseTeam.normalLabel} per user for the first month.<br>
<a href="${ctaUrl}" target="_blank" style="color:${CYAN};text-decoration:underline">Contact us to activate the team offer</a>.
</p>
</td></tr>

<tr><td dir="ltr" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 24px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.5;color:${TEXT_MUTED};font-style:italic">${EID50_CAMPAIGN.afterFirstMonth.en}</p>
</td></tr>

<!-- DIVIDER -->
<tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};border-top:1px solid ${CARD_BORDER};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- CREDIBILITY -->
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 12px" class="sec">
<p style="margin:0;font-size:11px;line-height:1.5;color:${TEXT_MUTED}">Trusted by engineering offices across Saudi Arabia for SBC 201, SBC 801, NFPA compliance, fire &amp; life safety reviews, and engineering decision support.</p>
</td></tr>

<!-- DIVIDER 2 -->
<tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};border-top:1px solid ${CARD_BORDER};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ARABIC SECTION -->
<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:28px 44px 0" class="sec">
<h1 style="margin:0;font-size:26px;font-weight:900;color:${TEXT_HEADING};line-height:1.3;letter-spacing:-0.2px" class="head">${EID50_CAMPAIGN.title.ar}</h1>
<p style="margin:8px 0 0;font-size:20px;font-weight:700;color:${CYAN};line-height:1.6">ConsultX Pro بـ ${EID50_PRICING.pro.discountedLabel} بدلًا من ${EID50_PRICING.pro.normalLabel}</p>
<p style="margin:8px 0 0;font-size:16px;font-weight:500;color:${TEXT_BODY};line-height:1.7">${EID50_CAMPAIGN.subheadline.ar}</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:${GOLD_DARK};line-height:1.6">${EID50_CAMPAIGN.dateRange.ar}</p>
</td></tr>

<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:20px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:${TEXT_BODY}">
كل عام وأنتم بخير من ConsultX. للمكاتب الهندسية واستشاريي السلامة والوقاية من الحريق، هذا عرض محدود لتجربة ConsultX Pro في العمل الهندسي اليومي: أسئلة الكود، مراجعة المخططات، ملاحظات الامتثال، والتقارير الفنية — بنصف سعر أول شهر.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">ماذا تحصل عليه في ConsultX Pro؟</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
${benefitRowsAr}
</table>
</td></tr>

<!-- ARABIC TRUST SECTION -->
<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">مصمم لسير عمل المكاتب الهندسية في السعودية</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:${TEXT_BODY}">
يدعم ConsultX القرار الهندسي بالاستناد إلى مراجع ومتطلبات كود البناء السعودي، ومعايير NFPA، وسير عمل مراجعات السلامة والوقاية من الحريق. يساعد المهندس على المراجعة بشكل أسرع والتوثيق بشكل أوضح، مع بقاء القرار المهني النهائي للمهندس المختص.
</p>
</td></tr>

<!-- ARABIC ENTERPRISE / TEAM SECTION -->
<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 4px" class="sec">
<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">للمكاتب الهندسية والشركات</p>
<p style="margin:0;font-size:14px;line-height:1.8;color:${TEXT_BODY}">
تحتاج مقاعد لفريقك؟ عرض العيد يشمل الاشتراكات المؤسسية وفرق العمل: ${EID50_PRICING.enterpriseTeam.discountedLabel} بدلًا من ${EID50_PRICING.enterpriseTeam.normalLabel} لكل مستخدم في أول شهر.<br>
<a href="${ctaUrl}" target="_blank" style="color:${CYAN};text-decoration:underline">تواصل معنا لتفعيل عرض الفريق</a>.
</p>
</td></tr>

<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 20px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.6;color:${TEXT_MUTED};font-style:italic">${EID50_CAMPAIGN.afterFirstMonth.ar}</p>
</td></tr>

<!-- ARABIC CTA -->
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:4px 44px 28px" class="sec">
${ctaAr}
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:12px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6">بدون التزام طويل. يمكنك الإلغاء في أي وقت.</td></tr>
</table>
${buildBrowserLink("فتح العرض في المتصفح")}
</td></tr>

<!-- FOOTER -->
<tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 28px" class="sec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};border-top:1px solid ${CARD_BORDER};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table>

<p style="margin:16px 0 0;font-size:11px;color:${TEXT_MUTED};line-height:1.6;direction:ltr;text-align:center">
${APP_NAME} &middot; AI-Powered Engineering Decision Support &middot; Saudi Arabia<br>
You are receiving this email because your office contact was identified through publicly available engineering office listings in the Kingdom of Saudi Arabia.<br>
If you do not wish to receive future communications, <a href="mailto:support@consultx.app?subject=Unsubscribe%20-%20EID50%20Campaign" style="color:${TEXT_MUTED};text-decoration:underline">unsubscribe here</a>.
</p>
</td></tr>

</table>

<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>`;
}

export function buildEid50TextEmail(): string {
  const benefitLinesEn = BENEFITS_EN.map((b) => `  ${b}`).join("\n");
  const benefitLinesAr = BENEFITS_AR.map((b) => `  ${b}`).join("\n");

  return `EID AL-ADHA OFFER — CONSULTX PRO FOR ${EID50_PRICING.pro.discountedLabel.toUpperCase()} INSTEAD OF ${EID50_PRICING.pro.normalLabel.toUpperCase()}
${"=".repeat(56)}

${EID50_CAMPAIGN.subheadline.en}
${"=".repeat(56)}

Eid Mubarak from ConsultX. For engineering offices and fire/life-safety consultants, this is a limited opportunity to test ConsultX Pro in real project work: code questions, drawing review, compliance notes, and technical reports — at half the first-month price.

What do you get with ConsultX Pro?
${benefitLinesEn}

Built for Saudi engineering compliance workflows:
ConsultX supports engineering decision-making using structured references from Saudi Building Code requirements, NFPA standards, and fire and life safety review workflows. It helps engineers review faster and document clearer while keeping final professional judgment with the licensed engineer.

For engineering offices and teams:
Need seats for your team? The Eid offer also applies to Enterprise/team subscriptions: ${EID50_PRICING.enterpriseTeam.discountedLabel} instead of ${EID50_PRICING.enterpriseTeam.normalLabel} per user for the first month.
Contact us to activate the team offer: ${ctaUrl}

${EID50_CAMPAIGN.afterFirstMonth.en}

Activate 50% Eid Offer:
${ctaUrl}

---
${"=".repeat(60)}

عرض عيد الأضحى — ConsultX Pro بـ ${EID50_PRICING.pro.discountedLabel} بدلًا من ${EID50_PRICING.pro.normalLabel}
${"=".repeat(66)}

${EID50_CAMPAIGN.subheadline.ar}
${"=".repeat(66)}

كل عام وأنتم بخير من ConsultX. للمكاتب الهندسية واستشاريي السلامة والوقاية من الحريق، هذا عرض محدود لتجربة ConsultX Pro في العمل الهندسي اليومي: أسئلة الكود، مراجعة المخططات، ملاحظات الامتثال، والتقارير الفنية — بنصف سعر أول شهر.

ماذا تحصل عليه في ConsultX Pro؟
${benefitLinesAr}

مصمم لسير عمل المكاتب الهندسية في السعودية:
يدعم ConsultX القرار الهندسي بالاستناد إلى مراجع ومتطلبات كود البناء السعودي، ومعايير NFPA، وسير عمل مراجعات السلامة والوقاية من الحريق. يساعد المهندس على المراجعة بشكل أسرع والتوثيق بشكل أوضح، مع بقاء القرار المهني النهائي للمهندس المختص.

للمكاتب الهندسية والشركات:
تحتاج مقاعد لفريقك؟ عرض العيد يشمل الاشتراكات المؤسسية وفرق العمل: ${EID50_PRICING.enterpriseTeam.discountedLabel} بدلًا من ${EID50_PRICING.enterpriseTeam.normalLabel} لكل مستخدم في أول شهر.
تواصل معنا لتفعيل عرض الفريق: ${ctaUrl}

بعد أول شهر مخفض، يتم التجديد بالسعر الشهري الطبيعي ما لم يتم الإلغاء.

فعّل خصم العيد 50%:
${ctaUrl}

---
${"=".repeat(60)}
ConsultX · AI-Powered Engineering Decision Support · Saudi Arabia
Trusted by engineering offices across Saudi Arabia for SBC 201, SBC 801, NFPA compliance, fire & life safety reviews, and engineering decision support.

You are receiving this email because your office contact was identified through publicly available engineering office listings in the Kingdom of Saudi Arabia.
If you do not wish to receive future communications, email support@consultx.app to unsubscribe.`;
}
