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
              <strong style={{ color: "#00D4FF", fontWeight: 600 }}>مرحباً بعودتك!</strong>
              {" "}حصلت تلقائياً على وصول تجريبي{" "}
              <strong style={{ color: "#e2f4f9" }}>{daysRemaining} أيام</strong>
              {" "}للأوضاع المتقدمة — اكتشف عمق التحليل الهندسي في ConsultX.
            </>
          : <>
              <strong style={{ color: "#00D4FF", fontWeight: 600 }}>Welcome back!</strong>
              {" "}You've automatically received a{" "}
              <strong style={{ color: "#e2f4f9" }}>{daysRemaining}-day trial</strong>
              {" "}of advanced modes — explore the depth of engineering analysis in ConsultX.
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
