import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Layers, ScanEye, Settings2, ChevronDown } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const benefitIcons = [BookOpen, Layers, ScanEye, Settings2];
const benefitAccents = ["#00D4FF", "#7C3AED", "#DC143C", "#FF8C00"];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const CoreBenefitsSection = () => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const benefits = [
    { titleKey: "benefit1Title" as const, descKey: "benefit1Desc" as const },
    { titleKey: "benefit2Title" as const, descKey: "benefit2Desc" as const },
    { titleKey: "benefit3Title" as const, descKey: "benefit3Desc" as const },
    { titleKey: "benefit4Title" as const, descKey: "benefit4Desc" as const },
  ];

  return (
    <section className="py-16 md:py-24 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            {t("benefitsTitle")}
          </h2>
        </div>

        {/* 4 Benefit Cards */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-5"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          {benefits.map(({ titleKey, descKey }, index) => {
            const Icon = benefitIcons[index];
            const accent = benefitAccents[index];
            return (
              <motion.div
                key={titleKey}
                variants={cardVariants}
                className="p-5 md:p-6 rounded-xl transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: `rgba(10,15,28,0.4)`,
                  border: `1px solid ${accent}22`,
                  backdropFilter: "blur(20px) saturate(1.2)",
                  WebkitBackdropFilter: "blur(20px) saturate(1.2)",
                  boxShadow: `0 0 20px -8px ${accent}30`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{
                    background: `${accent}12`,
                    border: `1px solid ${accent}30`,
                    color: accent,
                  }}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">
                  {t(titleKey)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(descKey)}
                </p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Under the Hood collapsible */}
        <div className="mt-10 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{t("underTheHood")}</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-6 mx-auto max-w-2xl text-sm text-muted-foreground text-start p-5 rounded-xl"
              style={{
                background: "rgba(0,212,255,0.03)",
                border: "1px solid rgba(0,212,255,0.12)",
              }}
            >
              <ul className="space-y-2 list-disc list-inside">
                <li>12 متخصص ذكاء اصطناعي متوازٍ يعمل على استفسارك</li>
                <li>GraphRAG — شبكة معرفية تربط الفقرات والمصطلحات والمعايير</li>
                <li>+5,700 عقدة معرفية مستخرجة من الأكواد الرسمية</li>
                <li>Gemini 2.5 Pro مدرّب على المصطلحات الهندسية السعودية</li>
              </ul>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CoreBenefitsSection;
