import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";

interface WelcomeEngineerModalProps {
  trialEnd: string;
  onClose: () => void;
}

const CYAN = "hsl(195 85% 50%)";

export default function WelcomeEngineerModal({ trialEnd, onClose }: WelcomeEngineerModalProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isAr = language === "ar";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const formattedDate = new Date(trialEnd).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-8 text-center"
        style={{
          background: "rgba(17, 24, 39, 0.95)",
          border: "1.5px solid rgba(0, 212, 255, 0.35)",
          boxShadow: "0 0 60px rgba(0,212,255,0.12), 0 0 120px rgba(0,212,255,0.06)",
          backdropFilter: "blur(16px)",
          transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.97)",
          transition: "transform 0.35s ease, opacity 0.35s ease",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 rounded-lg transition-all duration-200"
          style={{ color: "rgba(200,220,240,0.4)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,220,240,0.8)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,220,240,0.4)"; }}
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        {/* Icon */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: "radial-gradient(circle, rgba(0,212,255,0.2) 0%, transparent 70%)" }}
        >
          <Gift size={48} strokeWidth={1.5} style={{ color: CYAN }} />
        </div>

        {/* Title */}
        <h2
          className="text-2xl font-bold mb-3 leading-relaxed"
          style={{
            background: "linear-gradient(135deg, hsl(195 85% 50%), #ffffff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {isAr ? "مبروك! حصلت على تجربة مجانية لباقة مهندس" : "Congratulations! You got a free trial for the Engineer plan"}
        </h2>

        {/* Body */}
        <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(200,220,240,0.7)" }}>
          {isAr
            ? "بمناسبة إطلاق ConsultX، حصلت على تجربة مجانية لمدة 7 أيام لباقة مهندس الكاملة — جميع الأوضاع، الـ 12 وكيل ذكي، والسند القانوني."
            : "To celebrate the launch of ConsultX, you got a 7-day free trial for the full Engineer plan — all modes, all 12 AI agents, and legal references."}
        </p>

        {/* Date */}
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm mb-6"
          style={{
            background: "rgba(0,212,255,0.08)",
            border: "1px solid rgba(0,212,255,0.2)",
            color: CYAN,
          }}
        >
          {isAr ? `تنتهي التجربة بتاريخ ${formattedDate}` : `Trial ends on ${formattedDate}`}
        </div>

        {/* CTA */}
        <button
          onClick={() => { onClose(); }}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300"
          style={{
            background: CYAN,
            color: "hsl(220 40% 6%)",
            boxShadow: "0 0 25px rgba(0,212,255,0.35)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 45px rgba(0,212,255,0.55)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 25px rgba(0,212,255,0.35)"; }}
        >
          {isAr ? "ابدأ استشارتك الأولى" : "Start your first consultation"}
        </button>

        {/* Footer */}
        <p className="text-xs mt-4" style={{ color: "rgba(200,220,240,0.3)" }}>
          {isAr ? "عرض لفترة محدودة بمناسبة الإطلاق" : "Limited time launch offer"}
        </p>
      </div>
    </div>
  );
}
