import { useEffect, useRef, useState } from "react";
import { MessageCircle, BookOpenCheck, ScanSearch } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const steps = [
  {
    num: "01",
    icon: MessageCircle,
    numColor: "rgba(0, 212, 255, 0.25)",
    borderColor: "rgba(0, 212, 255, 0.35)",
    glowColor: "rgba(0, 212, 255, 0.15)",
    iconColor: "#00D4FF",
    iconGlow: "0 0 20px rgba(0,212,255,0.5)",
    titleAr: "اطرح سؤالك الهندسي",
    titleEn: "Ask Your Engineering Question",
    descAr: "اكتب سؤالك بأي صياغة — ConsultX يفهم السياق الهندسي ويوجهك للوضع المناسب تلقائياً.",
    descEn: "Type your question in any phrasing — ConsultX understands engineering context and guides you to the right mode automatically.",
    lineGradient: "from-[#00D4FF] to-[#FF8C00]",
  },
  {
    num: "02",
    icon: BookOpenCheck,
    numColor: "rgba(255, 140, 0, 0.25)",
    borderColor: "rgba(255, 140, 0, 0.35)",
    glowColor: "rgba(255, 140, 0, 0.12)",
    iconColor: "#FF8C00",
    iconGlow: "0 0 20px rgba(255,140,0,0.5)",
    titleAr: "احصل على إجابة موثقة بالكود",
    titleEn: "Get a Code-Referenced Answer",
    descAr: "إجابة فورية مع إحالة مباشرة لفقرة الكود أو المعيار المعتمد — SBC أو NFPA أو الدفاع المدني.",
    descEn: "Instant answer with a direct citation to the exact code clause or applicable standard — SBC, NFPA, or Civil Defense.",
    lineGradient: "from-[#FF8C00] to-[#DC143C]",
  },
  {
    num: "03",
    icon: ScanSearch,
    numColor: "rgba(220, 20, 60, 0.25)",
    borderColor: "rgba(220, 20, 60, 0.35)",
    glowColor: "rgba(220, 20, 60, 0.12)",
    iconColor: "#DC143C",
    iconGlow: "0 0 20px rgba(220,20,60,0.5)",
    titleAr: "ارفع المخططات وراجع أسرع",
    titleEn: "Upload Plans and Review Faster",
    descAr: "ارفع مخططاتك الهندسية للمراجعة مقابل متطلبات الكود تلقائياً — بدلاً من المراجعة اليدوية الطويلة.",
    descEn: "Upload your engineering drawings for automatic review against code requirements — instead of slow manual checking.",
    lineGradient: "",
  },
];

export default function HowItWorksSection() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="w-full max-w-5xl mx-auto px-4 py-12 md:py-20">
      {/* Title */}
      <div className={`text-center mb-10 md:mb-14 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        <h2
          className="text-2xl md:text-4xl font-bold text-gradient mb-3"
          style={{ textShadow: "0 0 20px rgba(0,212,255,0.3)" }}
        >
          {isAr ? "كيف يعمل ConsultX؟" : "How Does ConsultX Work?"}
        </h2>
        <p className="text-muted-foreground text-base md:text-lg">
          {isAr ? "ثلاث خطوات بسيطة للحصول على استشارة هندسية دقيقة" : "Three simple steps to get accurate engineering guidance"}
        </p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 relative">
        {/* Connecting lines (desktop only) */}
        <div className="hidden md:block absolute top-14 left-[33%] w-[34%] h-0.5 bg-gradient-to-r from-[#00D4FF] via-[#FF8C00] to-[#DC143C] opacity-30 z-0" />

        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div
              key={i}
              className="relative group rounded-2xl border p-5 md:p-6 backdrop-blur-sm transition-all duration-700 hover:-translate-y-1"
              style={{
                borderColor: step.borderColor,
                background: `radial-gradient(ellipse at top, ${step.glowColor}, transparent 70%), rgba(17,24,39,0.8)`,
                boxShadow: `0 0 20px -5px ${step.borderColor}`,
                transitionDelay: `${i * 0.15}s`,
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(24px)",
              }}
            >
              {/* Large faint number */}
              <div
                className="absolute top-3 end-4 font-black leading-none select-none pointer-events-none"
                style={{ color: step.numColor, fontSize: "clamp(40px, 12vw, 72px)" }}
              >
                {step.num}
              </div>

              {/* Icon */}
              <div
                className="relative z-10 w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center mb-4 md:mb-5"
                style={{
                  background: `${step.glowColor}`,
                  border: `1px solid ${step.borderColor}`,
                  boxShadow: step.iconGlow,
                }}
              >
                <Icon size={20} style={{ color: step.iconColor }} />
              </div>

              <h3 className="text-base md:text-lg font-bold text-foreground mb-2 relative z-10">
                {isAr ? step.titleAr : step.titleEn}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed relative z-10">
                {isAr ? step.descAr : step.descEn}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
