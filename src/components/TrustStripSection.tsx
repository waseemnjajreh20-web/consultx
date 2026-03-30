import { motion } from "framer-motion";
import { Shield, BookOpen, Flame, Brain } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const TrustStripSection = () => {
  const { t } = useLanguage();

  const badges = [
    { icon: Shield, labelKey: "trust1Label" as const, color: "#00D4FF" },
    { icon: BookOpen, labelKey: "trust2Label" as const, color: "#7C3AED" },
    { icon: Flame, labelKey: "trust3Label" as const, color: "#DC143C" },
    { icon: Brain, labelKey: "trust4Label" as const, color: "#FF8C00" },
  ];

  return (
    <section className="py-12 px-4 md:px-6">
      <div className="max-w-4xl mx-auto">
        {/* Optional title */}
        <motion.p
          className="text-center text-xs font-medium text-muted-foreground uppercase tracking-widest mb-6"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {t("trustTitle")}
        </motion.p>

        {/* Badges row */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-4 md:gap-8"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {badges.map(({ icon: Icon, labelKey, color }) => (
            <div
              key={labelKey}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
              style={{
                background: `${color}08`,
                border: `1px solid ${color}20`,
              }}
            >
              <Icon
                className="w-4 h-4 flex-shrink-0"
                style={{ color }}
                strokeWidth={1.5}
              />
              <span
                className="text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {t(labelKey)}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Subtle divider line */}
        <div
          className="mt-10 h-px mx-auto max-w-xs"
          style={{
            background:
              "linear-gradient(to right, transparent, rgba(0,212,255,0.2), transparent)",
          }}
        />
      </div>
    </section>
  );
};

export default TrustStripSection;
