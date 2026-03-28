/**
 * LaunchTrialWelcomeBanner
 * Light, non-intrusive banner shown to existing users when their trial is
 * first activated after the launch campaign starts.
 * Dismisses on close and marks launch_trial_welcomed = true in DB.
 */

import { X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

interface LaunchTrialWelcomeBannerProps {
  daysRemaining: number;
  onDismiss: () => void;
}

export default function LaunchTrialWelcomeBanner({ daysRemaining, onDismiss }: LaunchTrialWelcomeBannerProps) {
  const { language } = useLanguage();
  const isAr = language !== "en";

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      style={{
        display:         "flex",
        alignItems:      "center",
        gap:             "12px",
        padding:         "10px 16px",
        background:      "linear-gradient(90deg, rgba(0,212,255,0.06) 0%, rgba(0,212,255,0.03) 100%)",
        borderBottom:    "1px solid rgba(0,212,255,0.15)",
        fontSize:        "0.83rem",
        color:           "#8ecfdd",
        position:        "relative",
      }}
    >
      {/* Pulse dot */}
      <span style={{
        display:      "inline-block",
        width:        "8px",
        height:       "8px",
        borderRadius: "50%",
        background:   "#00D4FF",
        flexShrink:   0,
        animation:    "pulse-slow 2s infinite",
      }} />

      <span style={{ flex: 1, lineHeight: 1.5 }}>
        {isAr
          ? <>
              <strong style={{ color: "#00D4FF", fontWeight: 600 }}>وصول كامل مفعّل.</strong>
              {" "}الوضع الاستشاري والتحليلي متاحان لك{" "}
              <strong style={{ color: "#e2f4f9" }}>{daysRemaining} أيام</strong>
              {" "}— اكتشف عمق المراجع الهندسية التي بني عليها ConsultX.
            </>
          : <>
              <strong style={{ color: "#00D4FF", fontWeight: 600 }}>Full access activated.</strong>
              {" "}Advisory and Analysis modes are yours for{" "}
              <strong style={{ color: "#e2f4f9" }}>{daysRemaining} days</strong>
              {" "}— explore the engineering reference depth behind ConsultX.
            </>
        }
      </span>

      <button
        onClick={onDismiss}
        aria-label={isAr ? "إغلاق" : "Dismiss"}
        style={{
          background: "transparent",
          border:     "none",
          cursor:     "pointer",
          color:      "#4a8a9a",
          padding:    "2px",
          display:    "flex",
          flexShrink:  0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
