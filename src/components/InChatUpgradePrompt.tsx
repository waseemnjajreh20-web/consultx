/**
 * InChatUpgradePrompt
 * Shown inside the chat conversation when a mode's daily trial limit is reached
 * or when the 3-day trial period has expired.
 *
 * Variant "mode_limit"  → user consumed today's standard/analysis quota
 * Variant "trial_expired" → 3-day window has ended
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

  const title = isModeLimitVariant
    ? (isAr
        ? `لقد استخدمت حد التجربة في ${ModeLabel(mode, true)}`
        : `You've reached today's trial limit for ${ModeLabel(mode, false)}`)
    : (isAr
        ? "انتهت فترتك التجريبية المجانية"
        : "Your free trial has ended");

  const body = isModeLimitVariant
    ? (isAr
        ? "فعّل Pro لمواصلة الوصول إلى الإجابات الاستشارية الكاملة والتحليل المتقدم بشكل مستمر دون قيود يومية."
        : "Activate Pro to continue full advisory answers and advanced analysis with no daily limits.")
    : (isAr
        ? "فعّل اشتراكك الآن لمواصلة الوصول إلى ConsultX دون قيود، مع جميع الأوضاع غير المحدودة."
        : "Activate your subscription now to continue accessing ConsultX without restrictions, including all unlimited modes.");

  const ctaLabel = isAr ? "اشترك في Pro الآن" : "Subscribe to Pro Now";

  const valuePoints = isAr
    ? [
        "إجابات استشارية كاملة مع المرجع والفقرة والاشتقاق الهندسي",
        "تحليل غير محدود للمخططات الهندسية",
        "وصول مستمر بدون انقطاع يومي",
      ]
    : [
        "Full advisory answers with references, clauses, and engineering logic",
        "Unlimited engineering drawing analysis",
        "Continuous access with no daily interruptions",
      ];

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

      {/* Plan comparison hint */}
      <p style={{ margin: "12px 0 0", fontSize: "0.73rem", color: "#4a6070", lineHeight: 1.5 }}>
        {isAr
          ? "باقة المهندس Pro: وصول كامل لكل الأوضاع، مراجع قانونية دقيقة، تصدير PDF، وحفظ المحادثات 90 يوماً."
          : "Engineer Pro plan: full access to all modes, precise legal references, PDF export, and 90-day history."}
      </p>
    </div>
  );
}
