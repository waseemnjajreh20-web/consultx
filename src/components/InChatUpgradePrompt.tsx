/**
 * InChatUpgradePrompt
 * Shown inside the chat conversation when a mode's daily trial limit is reached
 * or when the 7-day trial period has expired.
 *
 * Variant "mode_limit"  → user consumed today's standard/analysis quota
 * Variant "trial_expired" → 7-day window has ended
 */

import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";

type UpgradeVariant = "mode_limit" | "trial_expired";

interface InChatUpgradePromptProps {
  variant: UpgradeVariant;
  /** "standard" | "analysis" — only relevant for mode_limit variant */
  mode?: string;
  language?: string;
}

function ModeLabel(mode: string | undefined, isAr: boolean) {
  if (mode === "standard") return isAr ? "الوضع الاستشاري"  : "Advisory Mode";
  if (mode === "analysis") return isAr ? "الوضع التحليلي"  : "Analysis Mode";
  return isAr ? "هذا الوضع" : "this mode";
}

export default function InChatUpgradePrompt({ variant, mode, language }: InChatUpgradePromptProps) {
  const navigate  = useNavigate();
  const { language: ctxLang } = useLanguage();
  const isAr      = (language ?? ctxLang) !== "en";

  const isModeLimitVariant = variant === "mode_limit";
  const accentColor        = isModeLimitVariant
    ? (mode === "analysis" ? "#DC143C" : "#FF8C00")
    : "#00D4FF";
  const borderColor        = `${accentColor}55`;

  // Mode-specific title: speak to what the user just accomplished, not what they can't do
  const title = isModeLimitVariant
    ? (mode === "analysis"
        ? (isAr
            ? "اكتمل تحليلك الهندسي اليوم"
            : "Today's engineering analysis is complete")
        : (isAr
            ? "اكتملت استشاراتك الاستشارية اليوم"
            : "Today's advisory sessions are complete"))
    : (isAr
        ? "اكتملت تجربتك الهندسية الكاملة"
        : "Your full engineering trial is complete");

  // Body: value-forward, not restriction-forward
  const body = isModeLimitVariant
    ? (mode === "analysis"
        ? (isAr
            ? "الوضع التحليلي مخصص لكل متغيرات المشروع الحقيقي — معادلات، تحقق من الامتثال، ومسار قرار كامل. باقة مهندس تفتح التحليل غير المحدود يومياً."
            : "Analysis mode is built for real project variables — equations, compliance verification, full decision paths. Engineer plan unlocks unlimited daily analysis.")
        : (isAr
            ? "الوضع الاستشاري يقدم المرجع القانوني الدقيق، الفقرة، والاشتقاق الهندسي الكامل. باقة مهندس تتيح الرجوع إليه بلا قيود يومية."
            : "Advisory mode delivers precise legal references, clauses, and complete engineering derivations. Engineer plan removes the daily ceiling."))
    : (isAr
        ? "سبعة أيام أثبتت ما تستطيع باقة مهندس تقديمه. الخطوة التالية هي الوصول الكامل المستمر — بلا انقطاع، بلا قيود يومية."
        : "Seven days showed you what ConsultX Engineer can do. The next step is continuous full access — no interruptions, no daily ceilings.");

  const ctaLabel = isAr ? "فعّل اشتراكك الآن" : "Activate Your Subscription";

  // Value points: outcomes, not feature checklist
  const valuePoints = isModeLimitVariant
    ? (isAr
        ? [
            mode === "analysis"
              ? "تحليل هندسي كامل لكل مشروع، يومياً بدون حد"
              : "استشارات يومية غير محدودة مع المرجع والفقرة",
            "كل الأوضاع مفتوحة — رئيسي، استشاري، تحليلي",
            "وصول فوري بعد التفعيل",
          ]
        : [
            mode === "analysis"
              ? "Full engineering analysis for every project, every day"
              : "Unlimited daily advisory answers with legal references",
            "All modes unlocked — Primary, Advisory, Analysis",
            "Instant access from activation",
          ])
    : (isAr
        ? [
            "استشارات يومية غير محدودة في الوضع الاستشاري والتحليلي",
            "GraphRAG — كل إجابة مرتبطة بشبكة المراجع الهندسية",
            "الوصول الكامل إلى كود البناء السعودي (SBC)",
          ]
        : [
            "Unlimited daily use of Advisory and Analysis modes",
            "GraphRAG — every answer connected to the engineering reference graph",
            "Full access to Saudi Building Code (SBC) database",
          ]);

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      style={{
        margin:        "8px 0",
        padding:       "20px 24px",
        borderRadius:  "14px",
        background:    "rgba(17, 24, 39, 0.85)",
        border:        `1px solid ${borderColor}`,
        backdropFilter:"blur(12px)",
        boxShadow:     `0 4px 24px rgba(0,0,0,0.3), inset 0 0 0 1px ${borderColor}`,
      }}
    >
      {/* Icon + title row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px",
          background: `${accentColor}20`,
          border: `1px solid ${accentColor}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {isModeLimitVariant
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          }
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "#f0f4f8", lineHeight: 1.4 }}>
            {title}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#8fa3b0", lineHeight: 1.65 }}>
            {body}
          </p>
        </div>
      </div>

      {/* Value points */}
      <ul style={{ margin: "0 0 16px", padding: isAr ? "0 16px 0 0" : "0 0 0 16px", listStyle: "none" }}>
        {valuePoints.map((pt, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "6px", fontSize: "0.8rem", color: "#7a9aad" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "3px" }}>
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            {pt}
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <button
        onClick={() => navigate("/subscribe")}
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           "8px",
          padding:       "10px 22px",
          borderRadius:  "8px",
          background:    `linear-gradient(135deg, ${accentColor}22, ${accentColor}18)`,
          border:        `1px solid ${accentColor}80`,
          color:         accentColor,
          fontWeight:    700,
          fontSize:      "0.88rem",
          cursor:        "pointer",
          transition:    "all 0.2s ease",
          letterSpacing: "0.01em",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = `${accentColor}30`;
          (e.currentTarget as HTMLButtonElement).style.boxShadow  = `0 0 16px ${accentColor}40`;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(135deg, ${accentColor}22, ${accentColor}18)`;
          (e.currentTarget as HTMLButtonElement).style.boxShadow  = "none";
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        {ctaLabel}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: isAr ? "scaleX(-1)" : undefined }}>
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>

      {/* Friction reducer microcopy */}
      <p style={{ margin: "12px 0 0", fontSize: "0.73rem", color: "#4a6070", lineHeight: 1.5 }}>
        {isAr
          ? "وصول فوري بعد التفعيل · تجديد تلقائي · إلغاء في أي وقت بدون غرامة"
          : "Instant access after activation · Auto-renews · Cancel anytime, no penalty"}
      </p>
    </div>
  );
}
