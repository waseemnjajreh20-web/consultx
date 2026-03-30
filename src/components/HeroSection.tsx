import { motion } from "framer-motion";
import { Flame, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import consultxIcon from "@/assets/consultx-platform-logo.png";

interface HeroSectionProps {
  onStartChat: () => void;
  isLoggedIn?: boolean;
}

const HeroSection = ({ onStartChat, isLoggedIn }: HeroSectionProps) => {
  const { t } = useLanguage();

  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-4 md:px-6 py-16 md:py-24 text-center">
      {/* Blueprint grid background */}
      <div className="absolute inset-0 blueprint-grid opacity-20 pointer-events-none" />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background pointer-events-none" />

      {/* Logo with glow */}
      <motion.div
        className="relative mb-8 group"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Soft glow blob */}
        <div className="absolute -inset-4 bg-gradient-to-r from-primary/25 via-primary/15 to-primary/25 blur-2xl rounded-3xl opacity-60 group-hover:opacity-80 transition-opacity duration-500 pointer-events-none" />
        {/* Logo container */}
        <div
          className="relative p-3 rounded-3xl"
          style={{
            background: "rgba(17,24,39,0.4)",
            border: "1px solid rgba(0,212,255,0.25)",
            boxShadow:
              "0 0 30px rgba(0,212,255,0.2), inset 0 0 20px rgba(0,212,255,0.04)",
            animation: "avatarGlowBlue 5s ease-in-out infinite, heroFloat 6s ease-in-out infinite",
          }}
        >
          <img
            src={consultxIcon}
            alt="ConsultX Logo"
            className="relative z-10"
            style={{
              height: "clamp(72px, 16vw, 110px)",
              width: "clamp(72px, 16vw, 110px)",
              objectFit: "contain",
              display: "block",
            }}
            loading="eager"
          />
        </div>
      </motion.div>

      {/* Headline */}
      <motion.h1
        className="relative z-10 font-sans text-3xl md:text-5xl font-bold mb-4 max-w-3xl"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
        style={{
          background: "linear-gradient(135deg, #00D4FF 0%, #ffffff 60%, #00D4FF 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          filter: "drop-shadow(0 0 16px rgba(0,212,255,0.3))",
        }}
      >
        {t("heroHeadline")}
      </motion.h1>

      {/* Subline */}
      <motion.p
        className="relative z-10 text-base md:text-lg text-foreground/70 max-w-xl mb-3 leading-relaxed"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.18, ease: "easeOut" }}
      >
        {t("heroSubline")}
      </motion.p>

      {/* Trust line */}
      <motion.p
        className="relative z-10 text-xs md:text-sm text-muted-foreground mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.26 }}
      >
        {t("heroTrustLine")}
      </motion.p>

      {/* CTA Buttons */}
      <motion.div
        className="relative z-10 flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.32 }}
      >
        <Button
          variant="hero"
          size="lg"
          onClick={onStartChat}
          className="group w-full sm:w-auto"
          style={{
            boxShadow:
              "0 0 20px rgba(0,212,255,0.28), 0 0 40px rgba(0,212,255,0.12)",
            animation: "heroCTAPulse 3s ease-in-out infinite",
            minHeight: "48px",
          }}
        >
          <Flame className="w-5 h-5 ms-2 group-hover:animate-pulse" />
          {isLoggedIn ? t("startConsultation") : t("startFreeTrial")}
        </Button>

        <Button
          variant="heroOutline"
          size="lg"
          onClick={() =>
            document
              .getElementById("how-it-works")
              ?.scrollIntoView({ behavior: "smooth" })
          }
          className="flex items-center justify-center gap-2 w-full sm:w-auto"
          style={{ minHeight: "48px" }}
        >
          <ChevronDown className="w-5 h-5" strokeWidth={1.5} />
          {t("learnMore")}
        </Button>
      </motion.div>
    </div>
  );
};

export default HeroSection;
