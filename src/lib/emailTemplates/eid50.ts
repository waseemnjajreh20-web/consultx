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

const ctaUrl = getEid50SubscribeUrl("email", "outbound", "pro");
const enterpriseCtaUrl = getEid50SubscribeUrl("email", "outbound", "enterprise_team");

const BENEFITS_EN = [
  "Advisory Mode for code questions \u2014 ask SBC, NFPA, and fire/life-safety questions and get structured, source-aware answers.",
  "Analytical Mode for drawings and documents \u2014 upload drawings and documents to identify requirements, missing information, and review gaps before submission.",
  "Faster technical responses \u2014 reduce repeated searching through clauses and prepare clearer technical comments.",
  "Better engineering reports \u2014 create cleaner summaries, review notes, and client-ready technical replies.",
  "Saudi-focused review workflow \u2014 built around SBC, NFPA, fire safety review, and engineering office needs.",
];

const BENEFITS_AR = [
  "وضع Advisory للأسئلة الكودية \u2014 اطرح أسئلة SBC وNFPA والسلامة والحماية من الحريق واحصل على إجابات منظمة ومدعومة بالمراجع.",
  "وضع Analytical للمخططات والمستندات \u2014 ارفع المخططات والمستندات لاستخراج المتطلبات، المعلومات الناقصة، وفجوات المراجعة قبل الرفع أو التسليم.",
  "ردود فنية أسرع \u2014 قلّل البحث المتكرر داخل البنود، وجهّز ملاحظات فنية أوضح.",
  "تقارير هندسية أفضل \u2014 أنشئ ملخصات، ملاحظات مراجعة، وردود فنية أكثر تنظيمًا للعملاء.",
  "سير مراجعة موجه للسوق السعودي \u2014 مصمم حول SBC وNFPA ومراجعات السلامة واحتياجات المكاتب الهندسية.",
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
  "مساحة عمل مشتركة للمكتب \u2014 أدر فريقك داخل Workspace واحد بدل الحسابات الفردية المتفرقة.",
  "مقاعد فريق مع ضبط عدد المقاعد \u2014 ادعُ أعضاء الفريق وأدر المقاعد المدفوعة بصلاحيات واضحة.",
  "صلاحيات حسب الدور \u2014 افصل بين صلاحيات المالك، الإدارة، المهندسين، المراجعين، والصلاحيات المالية.",
  "سير حالات وتتبع الحالة \u2014 أنشئ حالات هندسية وتابع سجل الحالة بدل ضياع تقدم المراجعة بين المحادثات والملفات.",
  "أساس للمراجعة والاعتماد الداخلي \u2014 ادعم سير المراجعة الهندسية والاعتماد الداخلي قبل التسليم النهائي.",
  "ربط مخرجات الذكاء الاصطناعي بالحالات والتقارير \u2014 احتفظ بمخرجات المراجعة وربطها بالحالات لتسهيل تتبع القرارات الفنية.",
  "ضبط جودة على مستوى المكتب \u2014 ساعد المهندسين والمراجعين والمديرين على العمل وفق سير مراجعة أكثر اتساقًا.",
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
<td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};width:22px;font-size:15px;color:${CYAN};vertical-align:top;padding-right:8px">\u25b8</td>
<td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};font-size:15px;line-height:1.55;color:${TEXT_BODY}">${item}</td>
</tr></table>
</td>
</tr>`,
    )
    .join("");
}

function buildBrowserLink(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr>
<td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:14px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.4">
<a href="${href}" target="_blank" style="color:${TEXT_MUTED};text-decoration:underline">${label}</a>
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
  const enterpriseRowsEn = buildBenefitRows(ENTERPRISE_BENEFITS_EN);
  const enterpriseRowsAr = buildBenefitRows(ENTERPRISE_BENEFITS_AR);

  const ctaEn = buildCTAHtml(EID50_CAMPAIGN.cta.en, "\u2192", ctaUrl);
  const ctaAr = buildCTAHtml(EID50_CAMPAIGN.cta.ar, "\u2190", ctaUrl);
  const entCtaEn = buildCTAHtml(EID50_CAMPAIGN.enterpriseCta.en, "\u2192", enterpriseCtaUrl);
  const entCtaAr = buildCTAHtml(EID50_CAMPAIGN.enterpriseCta.ar, "\u2190", enterpriseCtaUrl);

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
<div style="display:none;font-size:1px;${OUTER_STYLE};color:${BG_DARK};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">Eid offer for Saudi engineering offices \u2014 ConsultX Pro and Enterprise at 50% off the first month. &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>

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
<span style="font-size:12px;font-weight:800;color:${GOLD};letter-spacing:1px;text-transform:uppercase">\u2726&nbsp; 50% OFF \u2014 5 Days Only &nbsp;\u2726</span>
</td>
</tr>
</table>
</td></tr>

<tr><td dir="ltr" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0" class="sec">
<h1 style="margin:0;font-size:26px;font-weight:900;color:${TEXT_HEADING};line-height:1.2;letter-spacing:-0.3px" class="head">${EID50_CAMPAIGN.title.en}</h1>
<p style="margin:8px 0 0;font-size:15px;font-weight:500;color:${TEXT_BODY};line-height:1.5">Upgrade your engineering review workflow \u2014 not just one engineer\u2019s inbox.</p>

<p style="margin:16px 0 0;font-size:18px;font-weight:700;color:${CYAN};line-height:1.4">ConsultX Pro: ${EID50_PRICING.pro.normalLabel} \u2192 ${EID50_PRICING.pro.discountedLabel} for the first month</p>
<p style="margin:6px 0 0;font-size:18px;font-weight:700;color:${CYAN};line-height:1.4">Enterprise Team: ${EID50_PRICING.enterpriseTeam.normalLabel} \u2192 ${EID50_PRICING.enterpriseTeam.discountedLabel} for the first month</p>

<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:${GOLD_DARK};line-height:1.4">${EID50_CAMPAIGN.dateRange.en}</p>
</td></tr>

<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0;font-size:13px;font-weight:600;color:${TEXT_MUTED};letter-spacing:0.3px;text-transform:uppercase" class="sec">For individual engineers</td></tr>
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 0" class="sec">
${ctaEn}
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:12px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.4">No long-term commitment. Cancel anytime.</td></tr>
</table>
${buildBrowserLink("Open offer in browser", ctaUrl)}
</td></tr>
</table>
</td></tr>

<!-- ENGLISH VALUE: PRO -->
<tr><td dir="ltr" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:28px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:${TEXT_BODY}">
Eid Mubarak from ConsultX. If your office handles SBC questions, NFPA references, fire and life safety reviews, drawing checks, client comments, and internal approvals, ConsultX gives your team a more organized way to review, document, and move faster.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">What does ConsultX Pro give one engineer?</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
${benefitRowsEn}
</table>
</td></tr>

<!-- TRUST SECTION -->
<tr><td dir="ltr" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">Built for Saudi engineering compliance workflows</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:${TEXT_BODY}">
ConsultX supports engineering decision-making using structured references from Saudi Building Code requirements, NFPA standards, and fire and life safety review workflows. It helps engineering teams review faster, document clearer, and reduce repeated code-search effort while keeping final professional judgment with the licensed engineer.
</p>
</td></tr>

<!-- DIVIDER -->
<tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};border-top:1px solid ${CARD_BORDER};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ENGLISH VALUE: ENTERPRISE -->
<tr><td dir="ltr" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">What does ConsultX Enterprise give your office?</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
${enterpriseRowsEn}
</table>
</td></tr>

<!-- ENTERPRISE NOTE -->
<tr><td dir="ltr" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 0" class="sec">
<p style="margin:0;font-size:13px;line-height:1.5;color:${TEXT_MUTED};font-style:italic">${EID50_CAMPAIGN.enterpriseNote.en}</p>
</td></tr>

<!-- ENTERPRISE CTA -->
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:14px 44px 0;font-size:13px;font-weight:600;color:${TEXT_MUTED};letter-spacing:0.3px;text-transform:uppercase" class="sec">For office teams</td></tr>
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 0" class="sec">
${entCtaEn}
</td></tr>

<!-- RENEWAL NOTE -->
<tr><td dir="ltr" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 24px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.5;color:${TEXT_MUTED};font-style:italic">${EID50_CAMPAIGN.afterFirstMonth.en}</p>
</td></tr>

<!-- DIVIDER 2 -->
<tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};border-top:1px solid ${CARD_BORDER};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ARABIC SECTION -->
<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:28px 44px 0" class="sec">
<h1 style="margin:0;font-size:26px;font-weight:900;color:${TEXT_HEADING};line-height:1.3;letter-spacing:-0.2px" class="head">${EID50_CAMPAIGN.title.ar}</h1>
<p style="margin:8px 0 0;font-size:15px;font-weight:500;color:${TEXT_BODY};line-height:1.7">طوّر سير المراجعة داخل مكتبك \u2014 وليس مجرد حساب فردي لمهندس واحد.</p>

<p style="margin:16px 0 0;font-size:18px;font-weight:700;color:${CYAN};line-height:1.6">ConsultX Pro: ${EID50_PRICING.pro.normalLabel} \u2192 ${EID50_PRICING.pro.discountedLabel} لأول شهر</p>
<p style="margin:6px 0 0;font-size:18px;font-weight:700;color:${CYAN};line-height:1.6">Enterprise Team: ${EID50_PRICING.enterpriseTeam.normalLabel} \u2192 ${EID50_PRICING.enterpriseTeam.discountedLabel} لأول شهر</p>
<p style="margin:8px 0 0;font-size:12px;font-weight:600;color:${GOLD_DARK};line-height:1.6">${EID50_CAMPAIGN.dateRange.ar}</p>
</td></tr>

<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:20px 44px 0" class="sec">
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:${TEXT_BODY}">
كل عام وأنتم بخير من ConsultX. إذا كان مكتبك يتعامل يوميًا مع أسئلة SBC، مراجع NFPA، مراجعات السلامة والوقاية من الحريق، فحص المخططات، ملاحظات العملاء، والمراجعات الداخلية، فإن ConsultX يمنح فريقك طريقة أكثر تنظيمًا للمراجعة، والتوثيق، وتسريع العمل.
</p>
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">ماذا يحصل عليه المهندس في ConsultX Pro؟</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
${benefitRowsAr}
</table>
</td></tr>

<!-- ARABIC TRUST SECTION -->
<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">مصمم حول أعمال المراجعة الهندسية في السعودية</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:${TEXT_BODY}">
يدعم ConsultX القرار الهندسي بالاستناد إلى مراجع ومتطلبات كود البناء السعودي، ومعايير NFPA، وسير عمل مراجعات السلامة والوقاية من الحريق. يساعد الفرق الهندسية على المراجعة بشكل أسرع، والتوثيق بشكل أوضح، وتقليل وقت البحث المتكرر، مع بقاء القرار المهني النهائي للمهندس المختص.
</p>
</td></tr>

<!-- ARABIC DIVIDER -->
<tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:0 44px" class="sec"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}"><tr><td bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};border-top:1px solid ${CARD_BORDER};height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr></table></td></tr>

<!-- ARABIC ENTERPRISE SECTION -->
<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:18px 44px 0" class="sec">
<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${TEXT_HIGHLIGHT}">ماذا يمنح ConsultX Enterprise لمكتبك؟</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
${enterpriseRowsAr}
</table>
</td></tr>

<!-- ARABIC ENTERPRISE NOTE -->
<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 0" class="sec">
<p style="margin:0;font-size:13px;line-height:1.6;color:${TEXT_MUTED};font-style:italic">${EID50_CAMPAIGN.enterpriseNote.ar}</p>
</td></tr>

<!-- ARABIC ENTERPRISE CTA -->
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:14px 44px 0;font-size:13px;font-weight:600;color:${TEXT_MUTED}" class="sec">للمكاتب والفرق</td></tr>
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 0" class="sec">
${entCtaAr}
</td></tr>

<!-- ARABIC RENEWAL NOTE -->
<tr><td dir="rtl" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 20px" class="sec">
<p style="margin:0;font-size:13px;line-height:1.6;color:${TEXT_MUTED};font-style:italic">${EID50_CAMPAIGN.afterFirstMonth.ar}</p>
</td></tr>

<!-- ARABIC CTA -->
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:14px 44px 0;font-size:13px;font-weight:600;color:${TEXT_MUTED}" class="sec">للمهندس الفردي</td></tr>
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:8px 44px 28px" class="sec">
${ctaAr}
<table role="presentation" cellpadding="0" cellspacing="0" align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE}">
<tr><td align="center" bgcolor="${CARD_DARK}" background="${BG_0D1425_URL}" style="${CARD_STYLE};padding:12px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6">بدون التزام طويل. يمكنك الإلغاء في أي وقت.</td></tr>
</table>
${buildBrowserLink("فتح العرض في المتصفح", ctaUrl)}
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
  const enterpriseLinesEn = ENTERPRISE_BENEFITS_EN.map((b) => `  ${b}`).join("\n");
  const enterpriseLinesAr = ENTERPRISE_BENEFITS_AR.map((b) => `  ${b}`).join("\n");

  return `EID OFFER: UPGRADE YOUR ENGINEERING OFFICE WITH CONSULTX AT 50% OFF
${"=".repeat(58)}

${EID50_CAMPAIGN.subheadline.en}
${"=".repeat(58)}

Eid Mubarak from ConsultX. If your office handles SBC questions, NFPA references, fire and life safety reviews, drawing checks, client comments, and internal approvals, ConsultX gives your team a more organized way to review, document, and move faster.

What does ConsultX Pro give one engineer?
${benefitLinesEn}

Built for Saudi engineering compliance workflows:
ConsultX supports engineering decision-making using structured references from Saudi Building Code requirements, NFPA standards, and fire and life safety review workflows. It helps engineering teams review faster, document clearer, and reduce repeated code-search effort while keeping final professional judgment with the licensed engineer.

---
What does ConsultX Enterprise give your office?
${enterpriseLinesEn}

${EID50_CAMPAIGN.enterpriseNote.en}

Start Enterprise Team Offer:
${enterpriseCtaUrl}

${EID50_CAMPAIGN.afterFirstMonth.en}

Activate 50% Eid Offer:
${ctaUrl}

---
${"=".repeat(60)}

عرض عيد الأضحى للمكاتب الهندسية
${"=".repeat(34)}

${EID50_CAMPAIGN.subheadline.ar}
${"=".repeat(66)}

كل عام وأنتم بخير من ConsultX. إذا كان مكتبك يتعامل يوميًا مع أسئلة SBC، مراجع NFPA، مراجعات السلامة والوقاية من الحريق، فحص المخططات، ملاحظات العملاء، والمراجعات الداخلية، فإن ConsultX يمنح فريقك طريقة أكثر تنظيمًا للمراجعة، والتوثيق، وتسريع العمل.

ماذا يحصل عليه المهندس في ConsultX Pro؟
${benefitLinesAr}

مصمم حول أعمال المراجعة الهندسية في السعودية:
يدعم ConsultX القرار الهندسي بالاستناد إلى مراجع ومتطلبات كود البناء السعودي، ومعايير NFPA، وسير عمل مراجعات السلامة والوقاية من الحريق. يساعد الفرق الهندسية على المراجعة بشكل أسرع، والتوثيق بشكل أوضح، وتقليل وقت البحث المتكرر، مع بقاء القرار المهني النهائي للمهندس المختص.

---
ماذا يمنح ConsultX Enterprise لمكتبك؟
${enterpriseLinesAr}

${EID50_CAMPAIGN.enterpriseNote.ar}

ابدأ عرض Enterprise Team:
${enterpriseCtaUrl}

${EID50_CAMPAIGN.afterFirstMonth.ar}

فعّل خصم العيد 50%:
${ctaUrl}

---
${"=".repeat(60)}
ConsultX · AI-Powered Engineering Decision Support · Saudi Arabia

You are receiving this email because your office contact was identified through publicly available engineering office listings in the Kingdom of Saudi Arabia.
If you do not wish to receive future communications, email support@consultx.app to unsubscribe.`;
}
