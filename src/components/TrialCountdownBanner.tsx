import { useState, useEffect } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCountdown } from "@/lib/corporatePromo";
import { useLanguage } from "@/hooks/useLanguage";

interface TrialCountdownBannerProps {
  trialEnd: string;
}

export default function TrialCountdownBanner({ trialEnd }: TrialCountdownBannerProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isAr = language === "ar";
  const [msRemaining, setMsRemaining] = useState(() =>
    Math.max(0, new Date(trialEnd).getTime() - Date.now())
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setMsRemaining(Math.max(0, new Date(trialEnd).getTime() - Date.now()));
    }, 60_000);
    return () => clearInterval(interval);
  }, [trialEnd]);

  if (msRemaining <= 0) return null;

  const isUrgent = msRemaining < 12 * 3600 * 1000;
  const countdown = formatCountdown(msRemaining);

  const bg = isUrgent ? "rgba(255,140,0,0.08)" : "rgba(0,212,255,0.08)";
  const borderColor = isUrgent ? "rgba(255,140,0,0.3)" : "rgba(0,212,255,0.2)";
  const accentColor = isUrgent ? "#FF8C00" : "hsl(195 85% 50%)";
  const IconComponent = isUrgent ? AlertTriangle : Clock;

  return (
    <div
      className="w-full flex items-center justify-between px-4 py-2.5 text-sm"
      style={{
        background: bg,
        borderBottom: `1px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center gap-2">
        <IconComponent size={14} strokeWidth={1.5} style={{ color: accentColor }} />
        <span style={{ color: "rgba(200,220,240,0.75)" }}>
          {isUrgent ? (
            <>
              {isAr ? "آخر ساعات الوصول الكامل — تنتهي خلال" : "Final hours of full access — ends in"}{" "}
              <span style={{ color: accentColor, fontWeight: 600 }}>{countdown}</span>
              {" "}{isAr ? "— أكمل الوصول" : "— Continue access"}
            </>
          ) : (
            <>
              {isAr ? "وصول كامل للأوضاع الاستشارية — متبقي" : "Full advisory access active — remaining"}{" "}
              <span style={{ color: accentColor, fontWeight: 600 }}>{countdown}</span>
            </>
          )}
        </span>
      </div>

      <button
        onClick={() => navigate("/subscribe")}
        className="text-xs font-semibold px-3 py-1 rounded-lg transition-all duration-200"
        style={{
          border: `1px solid ${accentColor}`,
          color: accentColor,
          background: isUrgent ? `${accentColor}20` : "transparent",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = `${accentColor}25`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = isUrgent ? `${accentColor}20` : "transparent";
        }}
      >
        {isAr ? "أكمل الوصول" : "Continue Access"}
      </button>
    </div>
  );
}
