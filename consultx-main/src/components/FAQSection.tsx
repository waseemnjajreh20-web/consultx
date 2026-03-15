import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const FAQS = [
  {
    qAr: "ما هو ConsultX؟",
    qEn: "What is ConsultX?",
    aAr: "أول منظومة ذكاء اصطناعي عالمياً لأتمتة الامتثال لكود البناء السعودي. تعتمد على 12 وكيلاً ذكياً متخصصاً وتقنية GraphRAG التي رفعت الدقة من 57% إلى 86%. ملتزمة بسياسة صفر هلوسة وسيادة الدفاع المدني.",
    aEn: "The world's first AI system for automating compliance with the Saudi Building Code. Built on 12 specialized AI agents and GraphRAG technology that raised accuracy from 57% to 86%. Committed to a zero-hallucination policy and Civil Defense sovereignty.",
  },
  {
    qAr: "هل الإجابات دقيقة ومرجعية؟",
    qEn: "Are the answers accurate and referenced?",
    aAr: "نعم. يلتزم النظام بسياسة صفر هلوسة — اقتباسات حرفية فقط من الكود السعودي (إصدار 2024) ومعايير NFPA/SFPE. كل استشارة تنتهي برقم القسم والصفحة. وكيل مراجعة الكود يطابق كل نص حرفياً، والمناظرة متعددة الوكلاء تكشف الأخطاء قبل تقديم الرد.",
    aEn: "Yes. The system enforces a zero-hallucination policy — verbatim quotes only from the Saudi Code (2024 edition) and NFPA/SFPE standards. Every consultation ends with a section number and page.",
  },
  {
    qAr: "ما الفرق بين الأوضاع الثلاثة؟",
    qEn: "What is the difference between the three modes?",
    aAr: "الوضع الرئيسي: محادثة سريعة لفهم مشكلتك وتصنيفها. الوضع الاستشاري: رحلة مهمة هندسية كاملة بالسند القانوني. الوضع التحليلي: إدراك بصري للمخططات مع فحص متوازي لعدة معايير.",
    aEn: "Primary mode: quick conversation to understand and classify your problem. Advisory mode: a full engineering mission journey with legal references. Analytical mode: visual perception of drawings with parallel inspection of multiple standards.",
  },
  {
    qAr: "ما هي منظومة الـ 12 وكيلاً ذكياً؟",
    qEn: "What is the 12-Agent AI system?",
    aAr: "فريق هرمي يحاكي شركة هندسية: وكيل الأوركسترا يقود 6 وكلاء أساسيين و5 وكلاء تخصص دقيق. يعملون معاً عبر رحلة مهمة هندسية صارمة من الاستقبال إلى الاستجابة الموثقة.",
    aEn: "A hierarchical team mirroring an engineering firm: the Orchestra Agent leads 6 core agents and 5 micro-specialization agents through a strict engineering mission journey.",
  },
  {
    qAr: "ما هي تقنية GraphRAG؟",
    qEn: "What is GraphRAG technology?",
    aAr: "بدلاً من البحث في صفحات معزولة، يحوّل ConsultX الكود السعودي إلى خريطة معرفية بيانية تفهم الروابط بين المجلدات المختلفة. هذا رفع الدقة من 57% إلى 86%.",
    aEn: "Instead of searching isolated pages, ConsultX converts the Saudi Code into a knowledge graph that understands relationships between volumes — raising accuracy from 57% to 86%.",
  },
  {
    qAr: "هل يمكنني رفع مخططات هندسية؟",
    qEn: "Can I upload engineering drawings?",
    aAr: "نعم. في الوضع التحليلي يمكنك رفع مخططات أنظمة الحماية من الحرائق والحصول على تحليل بصري فوري مع توصيات مرجعية.",
    aEn: "Yes. In analytical mode you can upload fire protection system drawings and receive an instant visual analysis with code-referenced recommendations.",
  },
  {
    qAr: "ما موقف ConsultX من صلاحيات الدفاع المدني؟",
    qEn: "What is ConsultX's position on Civil Defense authority?",
    aAr: "ConsultX يقر بأن الكود هو الحد الأدنى الفني فقط. الدفاع المدني يملك الحق الأصيل في تعديل الاشتراطات ميدانياً. كل استشارة تتضمن تنويهاً بذلك.",
    aEn: "ConsultX explicitly acknowledges that code requirements represent only the minimum technical standard, and that Civil Defense holds the inherent right to modify requirements based on field risk assessment.",
  },
  {
    qAr: "هل الخدمة مجانية؟",
    qEn: "Is the service free?",
    aAr: "باقة مستكشف مجانية بالكامل مع 10 رسائل يومياً. باقة مهندس بـ 99 ر.س/شهر (سنوي) توفر جميع الأوضاع والوكلاء. باقة مؤسسة بـ 349 ر.س/شهر للمكاتب والفرق.",
    aEn: "Explorer plan is completely free with 10 messages/day. Engineer plan at 99 SAR/month (annual) provides all modes and agents. Enterprise at 349 SAR/month for offices and teams.",
  },
  {
    qAr: "ما المعايير والأكواد المدعومة؟",
    qEn: "What standards and codes are supported?",
    aAr: "الكود السعودي SBC 201 وSBC 801 (إصدار 2024)، ومعايير NFPA 13, 14, 20, 72, 101, 3000، ومعايير SFPE. نعمل على إضافة المزيد باستمرار.",
    aEn: "Saudi Building Code SBC 201 and SBC 801 (2024 edition), NFPA 13, 14, 20, 72, 101, 3000, and SFPE standards. We continuously add more references.",
  },
];

export default function FAQSection() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const toggle = (i: number) => setOpenIndex(prev => (prev === i ? null : i));

  return (
    <section
      ref={sectionRef}
      className="w-full py-20"
      style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,212,255,0.02) 50%, transparent 100%)" }}
    >
    <div className="max-w-3xl mx-auto px-4">
      {/* Title */}
      <div
        className="text-center mb-12 transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)" }}
      >
        <h2
          className="text-3xl md:text-4xl font-bold mb-3"
          style={{
            background: "linear-gradient(135deg, #00D4FF 0%, #ffffff 60%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 18px rgba(0,212,255,0.3))",
          }}
        >
          {isAr ? "أسئلة شائعة" : "Frequently Asked Questions"}
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="rounded-xl overflow-hidden"
              style={{
                background: "rgba(17,24,39,0.7)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: isOpen
                  ? "1px solid rgba(0,212,255,0.4)"
                  : "1px solid rgba(0,212,255,0.1)",
                borderInlineStart: isOpen ? "3px solid #00D4FF" : "3px solid rgba(0,212,255,0.15)",
                boxShadow: isOpen ? "0 0 20px rgba(0,212,255,0.08)" : "none",
                opacity: visible ? 1 : 0,
                transition: `opacity 0.5s ease ${i * 0.06}s, border-color 0.3s ease, box-shadow 0.3s ease`,
              }}
            >
      {/* Question row */}
              <button
                className="w-full flex items-center justify-between gap-4 px-4 md:px-5 py-4 text-start"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                style={{ minHeight: "48px" }}
              >
                <span
                  className="font-semibold text-sm md:text-base leading-snug"
                  style={{ color: isOpen ? "#00D4FF" : "hsl(var(--foreground))" }}
                >
                  {isAr ? faq.qAr : faq.qEn}
                </span>
                <ChevronDown
                  size={20}
                  strokeWidth={1.5}
                  className="shrink-0"
                  style={{
                    color: "#00D4FF",
                    transition: "transform 0.3s ease",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>

              {/* Answer — animated height */}
              <div
                className="overflow-hidden"
                style={{
                  maxHeight: isOpen ? "500px" : "0px",
                  opacity: isOpen ? 1 : 0,
                  transition: "max-height 0.35s ease, opacity 0.25s ease",
                }}
              >
                <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                  {isAr ? faq.aAr : faq.aEn}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </section>
  );
}
