import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const FAQS = [
  {
    qAr: "ما هو ConsultX؟",
    qEn: "What is ConsultX?",
    aAr: "ConsultX مستشار هندسي ذكي للحماية من الحرائق، يُجيب على أسئلتك الهندسية بإحالة مباشرة لفقرات كود البناء السعودي ومعايير NFPA.",
    aEn: "ConsultX is an intelligent engineering assistant for fire safety. It answers your questions with direct references to Saudi Building Code clauses and NFPA standards.",
  },
  {
    qAr: "ما مدى موثوقية الإجابات؟",
    qEn: "How reliable are the answers?",
    aAr: "كل إجابة تُحيل إلى الفقرة الدقيقة من المعيار المعتمد. ConsultX لا يخمّن — يستشهد بالمصدر الأصلي في كل مرة.",
    aEn: "Every answer cites the exact clause from the applicable standard. ConsultX doesn't guess — it references the original source every time.",
  },
  {
    qAr: "ماذا يشمل كل اشتراك؟",
    qEn: "What does each plan include?",
    aAr: "جميع الباقات تشمل الوصول لأكواد SBC وNFPA وأنظمة الدفاع المدني. الباقات الأعلى تشمل تحليل المخططات، محادثات غير محدودة، ودعماً أسرع.",
    aEn: "All plans include access to SBC and NFPA codes and Civil Defense regulations. Higher plans add plan analysis, unlimited conversations, and faster support.",
  },
  {
    qAr: "ماذا يحدث بعد انتهاء التجربة؟",
    qEn: "What happens after the trial ends?",
    aAr: "بعد 7 أيام، اختر أي باقة مدفوعة للاستمرار. إذا لم تختر، ستُوقف الميزات المتقدمة وتحتفظ بالوصول الأساسي.",
    aEn: "After 7 days, choose any paid plan to continue. If you don't, advanced features will be paused but basic access is retained.",
  },
  {
    qAr: "هل يمكنني رفع المخططات للتحليل؟",
    qEn: "Can I upload drawings for analysis?",
    aAr: "نعم، في وضع التحليل يمكنك رفع مخططاتك الهندسية للمراجعة بمقارنتها بمتطلبات الكود مباشرة.",
    aEn: "Yes. In Analysis mode you can upload engineering drawings for review against code requirements directly.",
  },
  {
    qAr: "هل يمكنني إلغاء الاشتراك في أي وقت؟",
    qEn: "Can I cancel my subscription at any time?",
    aAr: "نعم، يمكنك الإلغاء في أي وقت من صفحة حسابك. يستمر وصولك حتى نهاية فترة الاشتراك المدفوعة.",
    aEn: "Yes, you can cancel anytime from your account page. Access continues until the end of your paid billing period.",
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
