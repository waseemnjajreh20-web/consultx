import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function CTASection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isAr = language === "ar";

  return (
    <section
      className="relative w-full overflow-hidden py-16 md:py-24 px-4 md:px-6 flex flex-col items-center text-center"
      style={{
        background:
          "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,212,255,0.06) 0%, transparent 70%), linear-gradient(180deg, rgba(10,15,26,0) 0%, rgba(10,15,26,0.95) 100%), hsl(var(--background))",
      }}
    >
      {/* Decorative glow blob */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(0,212,255,0.07) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
        aria-hidden
      />

      {/* Heading */}
      <h2
        className="relative z-10 text-2xl md:text-4xl font-black mb-4 leading-tight px-2"
        style={{
          background: "linear-gradient(135deg, #00D4FF 0%, #ffffff 60%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          filter: "drop-shadow(0 0 24px rgba(0,212,255,0.35))",
        }}
      >
        {isAr ? "ابدأ استشارتك الهندسية الآن" : "Start Your Engineering Consultation Now"}
      </h2>

      {/* Subtitle */}
      <p className="relative z-10 text-sm md:text-base text-muted-foreground max-w-xl mb-8 md:mb-10">
        {isAr
          ? "انضم إلى المهندسين الذين يحصلون على إجابات دقيقة وموثّقة في ثوانٍ"
          : "Join engineers who get accurate, cited answers in seconds"}
      </p>

      {/* Button */}
      <div className="relative z-10 mb-4 w-full max-w-xs md:w-auto">
        <div
          className="absolute -inset-3 rounded-3xl pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(0,212,255,0.15) 0%, transparent 70%)",
            filter: "blur(8px)",
            animation: "heroCTAPulse 3s ease-in-out infinite",
          }}
        />
        <button
          onClick={() => navigate("/auth")}
          className="relative w-full md:w-auto flex items-center justify-center gap-3 px-8 md:px-10 py-4 rounded-2xl text-lg font-bold transition-all duration-300 hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #00D4FF 0%, #0099CC 100%)",
            color: "#0a0f1a",
            boxShadow: "0 0 25px rgba(0,212,255,0.4), 0 0 50px rgba(0,212,255,0.2)",
            animation: "heroCTAPulse 3s ease-in-out infinite",
            minHeight: "52px",
          }}
        >
          {isAr ? <ArrowLeft size={20} strokeWidth={2} /> : <ArrowRight size={20} strokeWidth={2} />}
          {isAr ? "ابدأ مجاناً — 7 أيام كاملة" : "Start Free — 7 Full Days"}
        </button>
      </div>

      {/* Fine print */}
      <p className="relative z-10 mt-2 text-xs text-muted-foreground/50">
        {isAr ? "لا يتطلب بطاقة ائتمان" : "No credit card required"}
      </p>

    </section>
  );
}
