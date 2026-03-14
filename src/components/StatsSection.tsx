import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { BookOpen, FlameKindling, BrainCircuit, Target, type LucideIcon } from "lucide-react";

interface Stat {
  valueTarget: number;
  prefix: string;
  suffix: string;
  labelAr: string;
  labelEn: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  Icon: LucideIcon;
}

const stats: Stat[] = [
  {
    valueTarget: 28,
    prefix: "",
    suffix: "+",
    labelAr: "كوداً متخصصاً في مجموعة SBC",
    labelEn: "Specialized SBC Code Volumes",
    accentColor: "#00D4FF",
    borderColor: "rgba(0, 212, 255, 0.3)",
    glowColor: "rgba(0, 212, 255, 0.12)",
    Icon: BookOpen,
  },
  {
    valueTarget: 70,
    prefix: "",
    suffix: "+",
    labelAr: "معياراً من NFPA كمرجع ملزم في SBC 801",
    labelEn: "NFPA Standards Referenced in SBC 801",
    accentColor: "#FF8C00",
    borderColor: "rgba(255, 140, 0, 0.3)",
    glowColor: "rgba(255, 140, 0, 0.1)",
    Icon: FlameKindling,
  },
  {
    valueTarget: 12,
    prefix: "",
    suffix: "",
    labelAr: "وكيلاً ذكياً متخصصاً",
    labelEn: "Specialized AI Agents",
    accentColor: "#00D4FF",
    borderColor: "rgba(0, 212, 255, 0.3)",
    glowColor: "rgba(0, 212, 255, 0.12)",
    Icon: BrainCircuit,
  },
  {
    valueTarget: 100,
    prefix: "",
    suffix: "%",
    labelAr: "سياسة صفر هلوسة — اقتباسات حرفية فقط",
    labelEn: "Zero Hallucination — Verbatim Citations Only",
    accentColor: "#DC143C",
    borderColor: "rgba(220, 20, 60, 0.3)",
    glowColor: "rgba(220, 20, 60, 0.1)",
    Icon: Target,
  },
];

function useCountUp(target: number, active: boolean, duration = 1800) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [active, target, duration]);

  return count;
}

function StatCard({ stat, active, index }: { stat: Stat; active: boolean; index: number }) {
  const { language } = useLanguage();
  const count = useCountUp(stat.valueTarget, active);
  const Icon = stat.Icon;

  return (
    <div
      className="relative rounded-2xl p-4 md:p-6 text-center transition-all duration-700 hover:-translate-y-1"
      style={{
        background: `radial-gradient(ellipse at top, ${stat.glowColor}, transparent 70%), rgba(17,24,39,0.8)`,
        border: `1px solid ${stat.borderColor}`,
        borderTop: `3px solid ${stat.accentColor}`,
        boxShadow: `0 0 25px -8px ${stat.borderColor}`,
        backdropFilter: "blur(12px)",
        opacity: active ? 1 : 0,
        transform: active ? "translateY(0)" : "translateY(20px)",
        transitionDelay: `${index * 0.1}s`,
      }}
    >
      {/* Icon */}
      <div
        className="flex items-center justify-center rounded-full mx-auto mb-3"
        style={{
          width: "44px",
          height: "44px",
          background: `radial-gradient(circle, ${stat.glowColor.replace("0.12","0.25").replace("0.1","0.2")} 0%, transparent 70%)`,
          border: `1px solid ${stat.borderColor}`,
        }}
      >
        <Icon size={20} strokeWidth={1.5} style={{ color: stat.accentColor }} />
      </div>

      {/* Number */}
      <div
        className="font-black mb-2 tabular-nums"
        style={{ color: stat.accentColor, textShadow: `0 0 20px ${stat.accentColor}60`, fontSize: "clamp(24px, 6vw, 36px)" }}
      >
        {stat.prefix}{count.toLocaleString()}{stat.suffix}
      </div>

      {/* Label */}
      <p className="text-sm text-muted-foreground font-medium">
        {language === "ar" ? stat.labelAr : stat.labelEn}
      </p>
    </div>
  );
}

export default function StatsSection() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="w-full max-w-5xl mx-auto px-4 py-12 md:py-16">
      {/* Title */}
      <div
        className="text-center mb-10 md:mb-12 transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)" }}
      >
        <h2
          className="text-2xl md:text-4xl font-bold text-gradient mb-3"
          style={{ textShadow: "0 0 20px rgba(0,212,255,0.3)" }}
        >
          {isAr ? "أرقام تتحدث" : "Numbers That Speak"}
        </h2>
      </div>

      {/* Cards grid — always 2x2 on mobile, 4 cols on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        {stats.map((stat, i) => (
          <StatCard key={i} stat={stat} active={visible} index={i} />
        ))}
      </div>

      {/* Tagline */}
      <p
        className="text-center text-xs md:text-sm text-muted-foreground/70 tracking-wide transition-all duration-700 px-2"
        style={{ opacity: visible ? 1 : 0, transitionDelay: "0.5s" }}
      >
        {isAr
          ? "28 كوداً سعودياً. 70+ معياراً دولياً. صفر هلوسة. سيادة الدفاع المدني."
          : "28 Saudi Codes. 70+ International Standards. Zero Hallucination. Civil Defense Authority."}
      </p>
    </section>
  );
}
