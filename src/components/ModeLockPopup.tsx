import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useLanguage } from "@/hooks/useLanguage";

interface ModeLockPopupProps {
  mode: "standard" | "analysis";
  onDismiss: () => void;
  anchorRef?: React.RefObject<HTMLElement>;
}

export default function ModeLockPopup({ mode, onDismiss }: ModeLockPopupProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isAr = language === "ar";

  const MODE_LABELS: Record<string, string> = {
    standard: isAr ? "الوضع الاستشاري" : "Advisory Mode",
    analysis: isAr ? "الوضع التحليلي" : "Analysis Mode",
  };

  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="absolute z-50 flex items-start gap-3 px-4 py-3 rounded-xl text-sm animate-fade-in"
      style={{
        background: "rgba(17, 24, 39, 0.92)",
        border: "1px solid rgba(0,212,255,0.2)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        minWidth: "240px",
        top: "calc(100% + 8px)",
        right: 0,
      }}
    >
      <Lock size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" style={{ color: "hsl(195 85% 50%)" }} />
      <div className="flex-1">
        <p className="font-medium text-foreground mb-1">
          {isAr ? `${MODE_LABELS[mode]} متاح في باقة مهندس` : `${MODE_LABELS[mode]} available in Engineer plan`}
        </p>
        <button
          onClick={() => { onDismiss(); navigate("/subscribe"); }}
          className="text-xs font-semibold transition-all duration-200"
          style={{ color: "hsl(195 85% 50%)" }}
        >
          {isAr ? "ترقية ←" : "Upgrade →"}
        </button>
      </div>
    </div>
  );
}
