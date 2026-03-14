import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Quote, Star } from "lucide-react";

const TESTIMONIALS = [
  {
    name: "م. خالد الشمري",
    role: "مهندس حماية من الحرائق — الرياض",
    nameEn: "Eng. Khalid Al-Shamari",
    roleEn: "Fire Protection Engineer — Riyadh",
    quote: "ConsultX وفّر عليّ ساعات من البحث في الكود. الإجابات دقيقة ومرجعية وسريعة، وأثق بها في عملي اليومي.",
    quoteEn: "ConsultX saved me hours of searching through code. The answers are accurate, referenced, and fast — I rely on them daily.",
    accent: "cyan",
    initials: "خ.ش",
  },
  {
    name: "م. سارة العتيبي",
    role: "مهندسة مراجعة مخططات — جدة",
    nameEn: "Eng. Sara Al-Otaibi",
    roleEn: "Drawings Review Engineer — Jeddah",
    quote: "ميزة تحليل المخططات غيّرت طريقة عملي تماماً. أرفع المخطط وأحصل على تحليل فوري ومفصّل.",
    quoteEn: "The drawing analysis feature completely changed my workflow. I upload the plan and get an instant, detailed analysis.",
    accent: "crimson",
    initials: "س.ع",
  },
  {
    name: "م. عبدالله الحربي",
    role: "استشاري سلامة — الدمام",
    nameEn: "Eng. Abdullah Al-Harbi",
    roleEn: "Safety Consultant — Dammam",
    quote: "الأوضاع الثلاثة فكرة عبقرية. أبدأ سريع بالوضع الرئيسي وأنتقل للاستشاري لما أحتاج تعمّق حقيقي.",
    quoteEn: "The three modes is a brilliant idea. I start fast in primary mode then switch to advisory when I need real depth.",
    accent: "amber",
    initials: "ع.ح",
  },
] as const;

const ACCENT_MAP = {
  cyan:    { border: "rgba(0,212,255,0.35)",  bg: "rgba(0,212,255,0.05)",  color: "#00D4FF", glow: "0 0 24px rgba(0,212,255,0.15)", ring: "rgba(0,212,255,0.4)"  },
  crimson: { border: "rgba(220,20,60,0.35)",  bg: "rgba(220,20,60,0.05)",  color: "#DC143C", glow: "0 0 24px rgba(220,20,60,0.15)", ring: "rgba(220,20,60,0.4)"  },
  amber:   { border: "rgba(255,140,0,0.35)",  bg: "rgba(255,140,0,0.05)",  color: "#FF8C00", glow: "0 0 24px rgba(255,140,0,0.15)", ring: "rgba(255,140,0,0.4)"  },
};

export default function TestimonialsSection() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="w-full max-w-5xl mx-auto px-4 py-12 md:py-20">
      {/* Title */}
      <div
        className="text-center mb-10 md:mb-14 transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)" }}
      >
        <h2
          className="text-2xl md:text-4xl font-bold mb-3"
          style={{
            background: "linear-gradient(135deg, #00D4FF 0%, #ffffff 60%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 18px rgba(0,212,255,0.3))",
          }}
        >
          {isAr ? "ماذا يقول المهندسون؟" : "What Engineers Say"}
        </h2>
        <p className="text-muted-foreground text-sm md:text-base">
          {isAr ? "تجارب حقيقية من مهندسي الحماية من الحرائق" : "Real experiences from fire protection engineers"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {TESTIMONIALS.map((t, i) => {
          const a = ACCENT_MAP[t.accent];
          return (
            <div
              key={i}
              className="relative rounded-2xl p-5 md:p-6 transition-all duration-300 cursor-default"
              style={{
                background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%), rgba(17,24,39,0.7)`,
                border: `1px solid ${a.border}`,
                borderInlineStart: `4px solid ${a.color}`,
                boxShadow: a.glow,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(24px)",
                transition: `opacity 0.6s ease ${i * 0.15}s, transform 0.6s ease ${i * 0.15}s, box-shadow 0.3s ease, border-color 0.3s ease`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = `0 0 40px -6px ${a.ring}, 0 8px 32px -8px ${a.ring}`;
                (e.currentTarget as HTMLElement).style.transform = `translateY(-4px)`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = a.glow;
                (e.currentTarget as HTMLElement).style.transform = `translateY(0)`;
              }}
            >
              {/* Quote icon */}
              <div
                className="absolute top-4 start-5"
                style={{ color: a.color, opacity: 0.3 }}
                aria-hidden
              >
                <Quote size={28} strokeWidth={1.5} />
              </div>

              {/* Stars */}
              <div className="flex gap-0.5 mb-4 mt-1">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} size={14} strokeWidth={1.5} style={{ fill: "#FFD700", color: "#FFD700" }} />
                ))}
              </div>

              {/* Quote text */}
              <p className="text-foreground/80 text-sm leading-relaxed mb-5 relative z-10">
                {isAr ? t.quote : t.quoteEn}
              </p>

              {/* Avatar + name */}
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{
                    background: a.bg,
                    border: `2px solid ${a.ring}`,
                    color: a.color,
                    boxShadow: `0 0 10px -2px ${a.ring}`,
                  }}
                >
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {isAr ? t.name : t.nameEn}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isAr ? t.role : t.roleEn}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
