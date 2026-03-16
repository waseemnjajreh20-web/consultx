import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";

interface TrialExpiryModalProps {
  onClose: (subscribed: boolean) => void;
}

const CYAN = "hsl(195 85% 50%)";

export default function TrialExpiryModal({ onClose }: TrialExpiryModalProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isAr = language === "ar";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-8 text-center"
        style={{
          background: "rgba(17, 24, 39, 0.95)",
          border: "1.5px solid rgba(255,140,0,0.3)",
          boxShadow: "0 0 60px rgba(255,140,0,0.1)",
          backdropFilter: "blur(16px)",
          transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.97)",
          transition: "transform 0.35s ease",
        }}
      >
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "radial-gradient(circle, rgba(255,140,0,0.2) 0%, transparent 70%)" }}
        >
          <Clock size={40} strokeWidth={1.5} style={{ color: "#FF8C00" }} />
        </div>

        <h2 className="text-xl font-bold text-foreground mb-3">{isAr ? "انتهت تجربتك المجانية" : "Your free trial has ended"}</h2>
        <p className="text-sm mb-6" style={{ color: "rgba(200,220,240,0.6)" }}>
          {isAr ? "اشترك الآن للاستمرار بجميع المميزات." : "Subscribe now to continue with all features."}
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => { onClose(true); navigate("/subscribe"); }}
            className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all duration-300"
            style={{
              background: CYAN,
              color: "hsl(220 40% 6%)",
              boxShadow: "0 0 20px rgba(0,212,255,0.3)",
            }}
          >
            {isAr ? "اشترك في باقة مهندس" : "Subscribe to Engineer plan"}
          </button>
          <button
            onClick={() => onClose(false)}
            className="w-full py-2.5 rounded-xl text-sm transition-all duration-300"
            style={{ color: "rgba(200,220,240,0.45)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,220,240,0.7)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,220,240,0.45)"; }}
          >
            {isAr ? "الاستمرار بالباقة المجانية" : "Continue with free plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
