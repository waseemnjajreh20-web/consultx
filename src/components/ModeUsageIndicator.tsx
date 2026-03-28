/**
 * ModeUsageIndicator
 * Subtle inline badge showing how many standard/analysis responses
 * remain today during a launch trial. Not shown for primary mode
 * (high limit) or for paid users.
 *
 * Updates in real-time after each successful message (parent passes usage).
 */

import { useLanguage } from "@/hooks/useLanguage";

interface ModeUsageIndicatorProps {
  mode: "primary" | "standard" | "analysis";
  used: number;
  limit: number;
}

export default function ModeUsageIndicator({ mode, used, limit }: ModeUsageIndicatorProps) {
  const { language } = useLanguage();
  const isAr = language !== "en";

  // Only shown for limited modes (standard=2, analysis=1)
  if (mode === "primary" || limit >= 50) return null;

  const remaining = Math.max(0, limit - used);
  const isLast    = remaining === 1;
  const isDone    = remaining === 0;

  const accentColor = mode === "analysis" ? "#DC143C" : "#FF8C00";
  const bgAlpha     = isDone ? 0.18 : isLast ? 0.12 : 0.07;
  const textColor   = isDone ? accentColor : isLast ? `${accentColor}dd` : `${accentColor}99`;

  const label = isDone
    ? (isAr ? "نفدت الحصة اليومية" : "Daily quota used")
    : isAr
      ? `${remaining} إجابة متبقية اليوم`
      : `${remaining} response${remaining !== 1 ? "s" : ""} remaining today`;

  return (
    <div
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          "5px",
        padding:      "3px 10px",
        borderRadius: "20px",
        background:   `rgba(${mode === "analysis" ? "220,20,60" : "255,140,0"},${bgAlpha})`,
        border:       `1px solid ${accentColor}30`,
        fontSize:     "0.72rem",
        fontWeight:   500,
        color:        textColor,
        transition:   "all 0.3s ease",
      }}
    >
      {/* Dot */}
      <span style={{
        width:        "5px",
        height:       "5px",
        borderRadius: "50%",
        background:   isDone ? accentColor : `${accentColor}80`,
        flexShrink:   0,
      }} />
      {label}
    </div>
  );
}

/**
 * TrialDaysIndicator
 * Shows the remaining trial days in a minimal pill in the header area.
 */
export function TrialDaysIndicator({ daysRemaining }: { daysRemaining: number }) {
  const { language } = useLanguage();
  const isAr = language !== "en";

  if (daysRemaining <= 0) return null;

  const isUrgent = daysRemaining === 1;
  const color    = isUrgent ? "#FF8C00" : "#00D4FF";

  return (
    <div
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          "5px",
        padding:      "3px 10px",
        borderRadius: "20px",
        background:   `${color}12`,
        border:       `1px solid ${color}30`,
        fontSize:     "0.72rem",
        fontWeight:   500,
        color:        `${color}cc`,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
      {isAr
        ? `${daysRemaining} ${daysRemaining === 1 ? "يوم" : "أيام"} تجريبية`
        : `${daysRemaining} trial day${daysRemaining !== 1 ? "s" : ""}`
      }
    </div>
  );
}
