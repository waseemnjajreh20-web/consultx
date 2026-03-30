import { motion } from "framer-motion";
import { Clock, HelpCircle, FileSearch, ArrowRight, CheckCircle, LucideIcon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/translations";

const painItems: { icon: LucideIcon; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { icon: Clock, titleKey: "pain1Title", descKey: "pain1Desc" },
  { icon: HelpCircle, titleKey: "pain2Title", descKey: "pain2Desc" },
  { icon: FileSearch, titleKey: "pain3Title", descKey: "pain3Desc" },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const ProblemSolutionSection = () => {
  const { t } = useLanguage();

  return (
    <section className="py-16 md:py-24 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Left: Pain Points */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
              {t("problemTitle")}
            </h2>
            <div className="flex flex-col gap-4">
              {painItems.map(({ icon: Icon, titleKey, descKey }) => (
                <motion.div
                  key={titleKey}
                  variants={cardVariants}
                  className="flex items-start gap-4 p-4 rounded-xl"
                  style={{
                    background: "rgba(220,20,60,0.04)",
                    border: "1px solid rgba(220,20,60,0.12)",
                  }}
                >
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
                    style={{
                      background: "rgba(220,20,60,0.08)",
                      border: "1px solid rgba(220,20,60,0.2)",
                    }}
                  >
                    <Icon className="w-4 h-4 text-red-400" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">
                      {t(titleKey)}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t(descKey)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right: Solution */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            className="relative"
          >
            {/* Glow background */}
            <div
              className="absolute -inset-6 rounded-3xl pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(0,212,255,0.06) 0%, transparent 70%)",
              }}
            />

            <div
              className="relative p-6 md:p-8 rounded-2xl"
              style={{
                background: "rgba(0,212,255,0.03)",
                border: "1px solid rgba(0,212,255,0.15)",
              }}
            >
              {/* Divider arrow between problem and solution */}
              <div className="flex items-center gap-2 mb-5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(0,212,255,0.1)",
                    border: "1px solid rgba(0,212,255,0.25)",
                  }}
                >
                  <ArrowRight className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-primary uppercase tracking-wider">
                  ConsultX
                </span>
              </div>

              <p className="text-lg md:text-xl font-medium text-foreground leading-relaxed mb-6">
                {t("solutionStatement")}
              </p>

              {/* Mini benefit list */}
              <ul className="flex flex-col gap-2">
                {[
                  t("benefit1Title"),
                  t("benefit2Title"),
                  t("benefit3Title"),
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" strokeWidth={1.5} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSolutionSection;
