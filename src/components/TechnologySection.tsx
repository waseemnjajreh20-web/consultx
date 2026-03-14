import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Workflow, BrainCircuit, GitBranch, Zap, FileCheck, GitMerge, Send,
  Table2 as Table, Link, Scale, Globe, Landmark,
  Network, Eye, Users, ShieldAlert,
  type LucideIcon,
} from "lucide-react";

/* ─────────────── DATA ─────────────── */

const tier1 = [
  {
    Icon: Workflow,
    titleAr: "وكيل الأوركسترا",
    subtitleAr: "مدير المشروع العام",
    descAr: "يستلم الطلب، يوزع المهام، يجمع النتائج",
    accentColor: "#00D4FF",
    borderColor: "rgba(0,212,255,0.5)",
    glowColor: "rgba(0,212,255,0.15)",
    shadowColor: "rgba(0,212,255,0.35)",
  },
];

const tier2 = [
  { Icon: BrainCircuit, titleAr: "وكيل التخطيط الذكي",       descAr: "يصنف المبنى وفئة الإشغال ومستوى الخطورة" },
  { Icon: GitBranch,   titleAr: "وكيل سلسلة تفكير الكود",    descAr: "يربط بين SBC 201 وSBC 801 منطقياً" },
  { Icon: Zap,         titleAr: "وكيل المعالجة المتوازية",    descAr: "استخراج وترجمة وتقييم في وقت واحد" },
  { Icon: FileCheck,   titleAr: "وكيل مراجعة الكود",          descAr: "المدقق القانوني: مطابقة حرفية وتحقق من أرقام السكاشن" },
  { Icon: GitMerge,    titleAr: "وكيل دمج التغييرات",         descAr: "يحل التعارضات بين الأكواد ويولد ملخص الفروقات" },
  { Icon: Send,        titleAr: "وكيل بروتوكول الاستجابة",    descAr: "يصيغ الرد النهائي بالسند القانوني الإلزامي" },
].map(n => ({ ...n, accentColor: "#FF8C00", borderColor: "rgba(255,140,0,0.45)", glowColor: "rgba(255,140,0,0.12)", shadowColor: "rgba(255,140,0,0.3)" }));

const tier3 = [
  { Icon: Table,    titleAr: "وكيل تحليل الجداول",         descAr: "فك شفرة البيانات الرقمية المعقدة" },
  { Icon: Link,     titleAr: "وكيل المراجع التقاطعية",      descAr: "تتبع الإحالات بين فقرات الكود" },
  { Icon: Scale,    titleAr: "وكيل تقييم الاستثناءات",      descAr: "البحث عن حالات الإعفاء الخاصة" },
  { Icon: Globe,    titleAr: "وكيل التوافق الدولي",          descAr: "ربط SBC بمعايير NFPA وSFPE العالمية" },
  { Icon: Landmark, titleAr: "وكيل صياغة المنطق الهندسي",   descAr: "يشرح لماذا تم القرار مع تأكيد سيادة الدفاع المدني" },
].map(n => ({ ...n, accentColor: "#DC143C", borderColor: "rgba(220,20,60,0.45)", glowColor: "rgba(220,20,60,0.12)", shadowColor: "rgba(220,20,60,0.3)" }));

const featureCards = [
  { Icon: Network,     titleAr: "ثورة GraphRAG",             textAr: "تحويل آلاف الصفحات المترابطة إلى خريطة معرفية بيانية. الدقة قفزت من 57% إلى 86% في الاستعلامات المعقدة.", accentColor: "#00D4FF", borderColor: "rgba(0,212,255,0.35)", glowColor: "rgba(0,212,255,0.1)", shadowColor: "rgba(0,212,255,0.25)" },
  { Icon: Eye,         titleAr: "إدراك بصري للمخططات",       textAr: "قراءة المخططات الهندسية بصيغ PDF وCAD، استخراج البيانات المكانية، وتحليل الفروقات بين الإصدارات.",         accentColor: "#DC143C", borderColor: "rgba(220,20,60,0.35)",  glowColor: "rgba(220,20,60,0.1)",  shadowColor: "rgba(220,20,60,0.25)"  },
  { Icon: Users,       titleAr: "12 وكيل ذكي متخصص",         textAr: "فريق هرمي من القيادة إلى التخصص الدقيق، يحاكي شركة هندسية متكاملة بقيادة وكيل الأوركسترا.",             accentColor: "#FF8C00", borderColor: "rgba(255,140,0,0.35)",  glowColor: "rgba(255,140,0,0.1)",  shadowColor: "rgba(255,140,0,0.25)"  },
  { Icon: ShieldAlert, titleAr: "سياسة صفر هلوسة",           textAr: "اقتباسات حرفية فقط. كل استشارة تنتهي برقم القسم والصفحة. المناظرة متعددة الوكلاء تكشف الأخطاء قبل الرد.", accentColor: "#00D4FF", borderColor: "rgba(0,212,255,0.35)", glowColor: "rgba(0,212,255,0.1)", shadowColor: "rgba(0,212,255,0.25)" },
  { Icon: Landmark,    titleAr: "سيادة الدفاع المدني",        textAr: "النظام يقر بأن الكود هو الحد الأدنى الفني فقط. الدفاع المدني يملك الحق الأصيل في تعديل الاشتراطات ميدانياً.", accentColor: "#FF8C00", borderColor: "rgba(255,140,0,0.35)", glowColor: "rgba(255,140,0,0.1)", shadowColor: "rgba(255,140,0,0.25)" },
];

/* ─────────────── NODE COMPONENT ─────────────── */

interface AgentNodeProps {
  Icon: LucideIcon;
  titleAr: string;
  subtitleAr?: string;
  descAr: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  shadowColor: string;
  visible: boolean;
  delay?: number;
  large?: boolean;
}

function AgentNode({ Icon, titleAr, subtitleAr, descAr, accentColor, borderColor, glowColor, shadowColor, visible, delay = 0, large = false }: AgentNodeProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex flex-col items-center cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {/* Node circle */}
      <div
        className="flex flex-col items-center gap-1.5 rounded-2xl px-3 py-3 text-center"
        style={{
          background: `radial-gradient(ellipse at top, ${glowColor}, transparent 70%), rgba(17,24,39,0.9)`,
          border: `1.5px solid ${hovered ? accentColor : borderColor}`,
          boxShadow: hovered
            ? `0 0 28px -4px ${shadowColor}, 0 0 60px -12px ${shadowColor}40, inset 0 0 12px -6px ${glowColor}`
            : `0 0 14px -6px ${shadowColor}`,
          minWidth: large ? "140px" : "96px",
          maxWidth: large ? "180px" : "136px",
          backdropFilter: "blur(8px)",
          transition: "all 0.3s ease",
          transform: hovered ? "scale(1.08) translateY(-2px)" : "scale(1)",
        }}
      >
        {/* Icon inside radial glow circle */}
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: large ? "52px" : "40px",
            height: large ? "52px" : "40px",
            background: `radial-gradient(circle, ${glowColor.replace("0.15","0.25").replace("0.12","0.22")} 0%, transparent 70%)`,
            border: `1px solid ${borderColor}`,
          }}
        >
          <Icon
            size={large ? 24 : 18}
            strokeWidth={1.5}
            style={{ color: accentColor, filter: `drop-shadow(0 0 4px ${accentColor}80)` }}
          />
        </div>
        <p className="text-xs font-bold leading-tight" style={{ color: accentColor, fontSize: large ? "11px" : "9.5px" }}>
          {titleAr}
        </p>
        {subtitleAr && (
          <p className="text-xs leading-none" style={{ color: "rgba(255,255,255,0.45)", fontSize: "8px" }}>
            {subtitleAr}
          </p>
        )}
      </div>

      {/* Tooltip on hover */}
      {hovered && (
        <div
          className="absolute z-50 bottom-full mb-2 rounded-xl px-3 py-2 text-xs text-white/90 leading-relaxed pointer-events-none animate-fade-in"
          style={{
            background: "rgba(6,10,18,0.97)",
            border: `1px solid ${borderColor}`,
            boxShadow: `0 0 20px -4px ${shadowColor}`,
            maxWidth: "200px",
            whiteSpace: "normal",
            backdropFilter: "blur(12px)",
          }}
        >
          {descAr}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: `5px solid ${borderColor}`,
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ─────────────── MAIN COMPONENT ─────────────── */

export default function TechnologySection() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setCardsVisible(true); }, { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="w-full px-4 py-12 md:py-20 overflow-hidden" dir={isAr ? "rtl" : "ltr"}>
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div
          className="text-center mb-10 md:mb-14 transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)" }}
        >
          <h2
            className="text-2xl md:text-4xl font-bold mb-4"
            style={{
              background: "linear-gradient(135deg, #00D4FF 0%, #ffffff 60%, #00D4FF 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 18px rgba(0,212,255,0.3))",
            }}
          >
            {isAr ? "البنية الذكية وراء ConsultX" : "The Intelligence Architecture Behind ConsultX"}
          </h2>
          <p className="text-muted-foreground text-sm md:text-lg max-w-3xl mx-auto leading-relaxed">
            {isAr
              ? "12 وكيلاً ذكياً يحاكون شركة هندسية متكاملة"
              : "12 specialized AI agents that mirror a complete engineering firm"}
          </p>
        </div>

        {/* ── Agent Diagram ── */}
        <div ref={sectionRef} className="mb-12 md:mb-16">
          <div className="flex flex-col items-center gap-2 md:gap-3">

            {/* TIER LABEL 1 */}
            <div
              className="text-xs font-bold tracking-widest uppercase transition-all duration-500"
              style={{ color: "rgba(0,212,255,0.6)", opacity: visible ? 1 : 0, transitionDelay: "0s" }}
            >
              {isAr ? "الطبقة الأولى — القيادة" : "Tier 1 — Command"}
            </div>

            {/* TIER 1 */}
            <div className="flex justify-center gap-4 w-full">
              {tier1.map((node, i) => (
                <AgentNode key={i} {...node} visible={visible} delay={0.1} large />
              ))}
            </div>

            {/* CONNECTOR T1→T2 */}
            <div className="flex flex-col items-center w-full">
              <div style={{ width: "2px", height: "24px", background: "linear-gradient(to bottom,#00D4FF,#FF8C00)", opacity: 0.45, margin: "0 auto" }} />
              <div
                className="relative hidden md:block"
                style={{ width: "82%", height: "1.5px", background: "linear-gradient(to right,rgba(0,212,255,0.05),rgba(255,140,0,0.5),rgba(0,212,255,0.05))", opacity: 0.6 }}
              >
                <span className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ background: "#FF8C00", boxShadow: "0 0 8px #FF8C00", animation: "techDotFlow 2.5s linear infinite", left: "0%" }} />
              </div>
              <div className="hidden md:grid grid-cols-6 w-[82%]">
                {tier2.map((_, i) => (
                  <div key={i} style={{ width: "1.5px", height: "18px", background: "linear-gradient(to bottom,#FF8C00,rgba(255,140,0,0.25))", opacity: 0.5, margin: "0 auto" }} />
                ))}
              </div>
            </div>

            {/* TIER LABEL 2 */}
            <div
              className="text-xs font-bold tracking-widest uppercase transition-all duration-500"
              style={{ color: "rgba(255,140,0,0.7)", opacity: visible ? 1 : 0, transitionDelay: "0.2s" }}
            >
              {isAr ? "الطبقة الثانية — الأعمدة الستة" : "Tier 2 — Six Pillars"}
            </div>

            {/* TIER 2 — horizontal scroll on mobile */}
            <div className="w-full">
              <div className="hidden md:grid md:grid-cols-6 gap-3 w-full">
                {tier2.map((node, i) => (
                  <AgentNode key={i} {...node} visible={visible} delay={0.15 + i * 0.07} />
                ))}
              </div>
              <div className="tier-row md:hidden">
                {tier2.map((node, i) => (
                  <div key={i} className="agent-node">
                    <AgentNode {...node} visible={visible} delay={0.15 + i * 0.07} />
                  </div>
                ))}
              </div>
            </div>

            {/* CONNECTOR T2→T3 */}
            <div className="flex flex-col items-center w-full">
              <div className="hidden md:grid grid-cols-5 w-[68%]" style={{ margin: "0 auto" }}>
                {tier3.map((_, i) => (
                  <div key={i} style={{ width: "1.5px", height: "18px", background: "linear-gradient(to bottom,#FF8C00,#DC143C)", opacity: 0.45, margin: "0 auto" }} />
                ))}
              </div>
              <div
                className="hidden md:block relative"
                style={{ width: "68%", height: "1.5px", background: "linear-gradient(to right,rgba(220,20,60,0.05),rgba(220,20,60,0.55),rgba(220,20,60,0.05))", opacity: 0.6 }}
              >
                <span className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ background: "#DC143C", boxShadow: "0 0 8px #DC143C", animation: "techDotFlow 3.5s linear infinite", left: "0%" }} />
              </div>
              <div style={{ width: "1.5px", height: "24px", background: "linear-gradient(to bottom,#FF8C00,#DC143C)", opacity: 0.45, margin: "0 auto" }} />
            </div>

            {/* TIER LABEL 3 */}
            <div
              className="text-xs font-bold tracking-widest uppercase transition-all duration-500"
              style={{ color: "rgba(220,20,60,0.7)", opacity: visible ? 1 : 0, transitionDelay: "0.5s" }}
            >
              {isAr ? "الطبقة الثالثة — التخصص الدقيق" : "Tier 3 — Deep Specialization"}
            </div>

            {/* TIER 3 — horizontal scroll on mobile */}
            <div className="w-full">
              <div className="hidden md:grid md:grid-cols-5 gap-3 w-full">
                {tier3.map((node, i) => (
                  <AgentNode key={i} {...node} visible={visible} delay={0.5 + i * 0.07} />
                ))}
              </div>
              <div className="tier-row md:hidden">
                {tier3.map((node, i) => (
                  <div key={i} className="agent-node">
                    <AgentNode {...node} visible={visible} delay={0.5 + i * 0.07} />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── Feature Cards ── */}
        <div ref={cardsRef}>
          <div className="w-full h-px mb-12" style={{ background: "linear-gradient(to right, transparent, rgba(0,212,255,0.3), transparent)" }} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {featureCards.map((card, i) => (
              <div
                key={i}
                className="rounded-2xl p-5 flex flex-col gap-3 cursor-default"
                style={{
                  background: `radial-gradient(ellipse at top, ${card.glowColor}, transparent 70%), rgba(17,24,39,0.85)`,
                  border: `1px solid ${card.borderColor}`,
                  borderLeft: `3px solid ${card.accentColor}`,
                  boxShadow: `0 0 20px -8px ${card.shadowColor}`,
                  backdropFilter: "blur(12px)",
                  opacity: cardsVisible ? 1 : 0,
                  transform: cardsVisible ? "translateY(0)" : "translateY(20px)",
                  transition: `opacity 0.5s ease ${i * 0.1}s, transform 0.5s ease ${i * 0.1}s, box-shadow 0.3s ease, border-color 0.3s ease`,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = `0 0 36px -6px ${card.shadowColor}`;
                  el.style.transform = `translateY(-4px)`;
                  el.style.borderColor = card.accentColor + "66";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = `0 0 20px -8px ${card.shadowColor}`;
                  el.style.transform = `translateY(0)`;
                  el.style.borderColor = card.borderColor;
                }}
              >
                {/* Icon container with radial glow */}
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{
                    width: "52px",
                    height: "52px",
                    background: `radial-gradient(circle, ${card.glowColor.replace("0.1","0.2")} 0%, transparent 70%)`,
                    border: `1px solid ${card.borderColor}`,
                  }}
                >
                  <card.Icon
                    size={24}
                    strokeWidth={1.5}
                    style={{ color: card.accentColor, filter: `drop-shadow(0 0 5px ${card.accentColor}80)` }}
                  />
                </div>

                <h3 className="text-sm font-bold text-foreground">{card.titleAr}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.textAr}</p>
              </div>
            ))}
          </div>

          {/* Tagline */}
          <p
            className="text-center text-xs text-muted-foreground/60 tracking-wide transition-all duration-700"
            style={{ opacity: cardsVisible ? 1 : 0, transitionDelay: "0.6s" }}
          >
            {isAr
              ? "مبني على Gemini 2.5 Pro • مدعوم بـ GraphRAG • محكوم بـ 12 وكيلاً ذكياً • ملتزم بسيادة الدفاع المدني"
              : "Built on Gemini 2.5 Pro • Powered by GraphRAG • Governed by 12 AI Agents • Committed to Civil Defense Sovereignty"}
          </p>
        </div>

      </div>
    </section>
  );
}
