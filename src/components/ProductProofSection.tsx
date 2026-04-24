import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/useLanguage";

const ProductProofSection = () => {
  const { t } = useLanguage();

  return (
    <section className="py-16 md:py-24 px-4 md:px-6">
      <div className="max-w-4xl mx-auto text-center">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            {t("productProofTitle")}
          </h2>
          <p className="text-muted-foreground">{t("productProofSubtitle")}</p>
        </motion.div>

        {/* Browser-frame mockup */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mx-auto max-w-2xl rounded-xl overflow-hidden shadow-2xl"
          style={{
            border: "1px solid rgba(0,212,255,0.2)",
            boxShadow:
              "0 0 60px rgba(0,212,255,0.08), 0 20px 40px rgba(0,0,0,0.4)",
          }}
        >
          {/* Browser chrome */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{
              background: "rgba(17,24,39,0.9)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
            <div
              className="flex-1 mx-4 h-6 rounded-md flex items-center px-3"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <span className="text-xs text-muted-foreground">consultx.app</span>
            </div>
          </div>

          {/* App mockup content */}
          <div
            className="p-6 text-start"
            style={{ background: "rgba(10,15,28,0.95)" }}
          >
            {/* User question */}
            <div className="flex justify-end mb-4">
              <div
                className="max-w-xs px-4 py-2.5 rounded-xl text-sm"
                style={{
                  background: "rgba(0,212,255,0.12)",
                  border: "1px solid rgba(0,212,255,0.2)",
                  color: "#e2e8f0",
                }}
              >
                ما هي المسافة القصوى لمسار الهروب في المبنى التجاري وفق SBC 201؟
              </div>
            </div>

            {/* AI answer */}
            <div
              className="px-4 py-4 rounded-xl text-sm leading-relaxed"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "#cbd5e1",
              }}
            >
              <p className="mb-3">
                وفق{" "}
                <span className="text-primary font-medium">
                  SBC 201 — الفقرة 1017.2
                </span>
                ، تحدّد المسافة القصوى لمسار الهروب في المباني التجارية
                (Occupancy Group B) بـ{" "}
                <span className="text-foreground font-semibold">61 متراً</span>{" "}
                في المباني المزودة بنظام رش تلقائي، و{" "}
                <span className="text-foreground font-semibold">46 متراً</span>{" "}
                في المباني غير المزودة به.
              </p>

              {/* Citation badges */}
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                <span
                  className="text-xs px-2 py-1 rounded-md"
                  style={{
                    background: "rgba(0,212,255,0.08)",
                    border: "1px solid rgba(0,212,255,0.2)",
                    color: "#67e8f9",
                  }}
                >
                  SBC 201 Section 1017.2
                </span>
                <span
                  className="text-xs px-2 py-1 rounded-md"
                  style={{
                    background: "rgba(0,212,255,0.08)",
                    border: "1px solid rgba(0,212,255,0.2)",
                    color: "#67e8f9",
                  }}
                >
                  NFPA 101 Section 7.6
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ProductProofSection;
