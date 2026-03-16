import { useState, useEffect, useRef, useCallback } from "react";
import { Flame, LogOut, User, ChevronDown, ShieldCheck, ScanEye, FlameKindling, Menu, X } from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { LanguageToggle } from "@/components/LanguageToggle";
import LogoMarquee from "@/components/LogoMarquee";
import HeroParticles from "@/components/HeroParticles";
import consultxIcon from "@/assets/consultx-icon.png";

// ===== MAGNETIC BUTTON (Phase 5) =====
function MagneticButton({ children, className, ...props }: React.ComponentProps<typeof Button>) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 200, damping: 20 });
  const springY = useSpring(y, { stiffness: 200, damping: 20 });

  const isTouchDevice = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isTouchDevice || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    x.set(dx * 0.3);
    y.set(dy * 0.3);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div style={{ x: springX, y: springY }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <Button ref={ref} className={className} {...props}>
        {children}
      </Button>
    </motion.div>
  );
}

// ===== TYPEWRITER TEXT (Phase 6 — Deep Space) =====
function TypewriterText({ text, speed = 45, className, style }: {
  text: string;
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span className={className} style={style}>
      {displayed}
      {!done && <span className="typewriter-cursor" />}
    </span>
  );
}

interface HeroSectionProps {
  onStartChat: () => void;
  isLoggedIn?: boolean;
}

const HeroSection = ({ onStartChat, isLoggedIn }: HeroSectionProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Glassmorphism: detect scroll position
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSignOut = async () => {
    setMobileMenuOpen(false);
    await signOut();
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Blueprint grid background */}
      <div className="absolute inset-0 blueprint-grid opacity-30" />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />

      {/* Floating particles — hidden on mobile via CSS */}
      <div className="particles-container">
        <HeroParticles />
      </div>

      {/* ── Glassmorphism Floating Header ── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-6 transition-all duration-300 ${
          scrolled
            ? "py-2 bg-background/70 backdrop-blur-xl shadow-lg shadow-primary/5 border-b border-primary/10"
            : "py-4 bg-transparent border-b border-border/30"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 md:gap-3">
          <img
            src={consultxIcon}
            alt="ConsultX Icon"
            className="object-contain transition-all duration-300"
            style={{ height: scrolled ? "28px" : "32px", width: "auto" }}
          />
          <span className={`font-bold text-gradient transition-all duration-300 ${scrolled ? "text-base md:text-lg" : "text-lg md:text-xl"}`}>{t("appName")}</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4">
          <LanguageToggle />
          {isLoggedIn ? (
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate("/account")}
                className="text-muted-foreground hover:text-foreground"
              >
                <User className="w-4 h-4 ms-2" />
                {t("accountLink")}
              </Button>
              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4 ms-2" />
                {t("signOut")}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => navigate("/auth")}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("signIn")}
            </Button>
          )}
        </nav>

        {/* Mobile hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <LanguageToggle />
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      {/* Spacer to prevent content jump from fixed header */}
      <div className="h-16" />

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="fixed top-16 left-0 right-0 z-40 md:hidden border-b border-border/30 bg-background/95 backdrop-blur-xl px-4 py-3 flex flex-col gap-2 animate-fade-in">
          {isLoggedIn ? (
            <>
              <Button variant="ghost" onClick={() => { setMobileMenuOpen(false); navigate("/account"); }} className="justify-start text-muted-foreground hover:text-foreground">
                <User className="w-4 h-4 ms-2" />
                {t("accountLink")}
              </Button>
              <Button variant="ghost" onClick={handleSignOut} className="justify-start text-muted-foreground hover:text-foreground">
                <LogOut className="w-4 h-4 ms-2" />
                {t("signOut")}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => { setMobileMenuOpen(false); navigate("/auth"); }} className="justify-start text-muted-foreground hover:text-foreground">
              {t("signIn")}
            </Button>
          )}
        </div>
      )}

      {/* Logo Marquee */}
      <LogoMarquee />

      {/* Hero Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-10 md:py-12">
        {/* Logo Card */}
        <div className="mb-6 md:mb-8 relative group">
          {/* Outer rotating glow ring */}
          <div
            className="absolute -inset-6 rounded-3xl pointer-events-none"
            style={{
              background: "conic-gradient(from 0deg, transparent 60%, rgba(0,212,255,0.3) 80%, transparent 100%)",
              animation: "heroLogoRingRotate 9s linear infinite",
            }}
          />
          {/* Soft glow blob */}
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/30 via-primary/20 to-primary/30 blur-2xl rounded-3xl opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
          {/* Logo container — breathing float */}
          <div
            className="relative p-3 rounded-3xl animate-float"
            style={{
              background: "rgba(17,24,39,0.4)",
              border: "1px solid rgba(0,212,255,0.25)",
              boxShadow: "0 0 30px rgba(0,212,255,0.25), inset 0 0 20px rgba(0,212,255,0.05)",
              animation: "avatarGlowBlue 5s ease-in-out infinite, heroFloat 6s ease-in-out infinite",
            }}
          >
            <img
              alt="ConsultX Logo"
              className="relative z-10"
              style={{
                height: "clamp(80px, 18vw, 120px)",
                width: "clamp(80px, 18vw, 120px)",
                objectFit: "contain",
                borderRadius: 0,
                display: "block",
              }}
              src={consultxIcon}
              loading="eager"
            />
          </div>
        </div>

        {/* Title */}
        <h1
          className="hero-heading font-sans text-3xl md:text-5xl font-bold text-center mb-4 animate-fade-up px-3 py-2"
          style={{
            background: "linear-gradient(135deg, #00D4FF 0%, #ffffff 60%, #00D4FF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 18px rgba(0,212,255,0.35))",
          }}
        >
          <TypewriterText text={t("heroTitle")} speed={40} />
        </h1>

        {/* Subtitle */}
        <p
          className="text-sm md:text-lg text-foreground/70 max-w-[90%] md:max-w-2xl mb-8 animate-fade-up text-center leading-relaxed"
          style={{ animationDelay: "0.1s" }}
        >
          {t("heroSubtitle")}
        </p>

        {/* CTA Buttons */}
        <div
          className="flex flex-col sm:flex-row gap-3 mb-10 md:mb-12 animate-fade-up w-full max-w-xs sm:max-w-none sm:w-auto"
          style={{ animationDelay: "0.2s" }}
        >
          <MagneticButton
            variant="hero"
            size="lg"
            onClick={onStartChat}
            className="group relative w-full sm:w-auto"
            style={{
              boxShadow: "0 0 20px rgba(0,212,255,0.3), 0 0 40px rgba(0,212,255,0.15)",
              animation: "heroCTAPulse 3s ease-in-out infinite",
              minHeight: "48px",
            }}
          >
            <Flame className="w-5 h-5 ms-2 group-hover:animate-pulse" />
            {isLoggedIn ? t("startConsultation") : t("signInToConsult")}
          </MagneticButton>
          <MagneticButton
            variant="heroOutline"
            size="lg"
            onClick={() => {
              document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex items-center justify-center gap-2 w-full sm:w-auto"
            style={{ minHeight: "48px" }}
          >
            <ChevronDown className="w-5 h-5" strokeWidth={1.5} />
            {t("learnMore")}
          </MagneticButton>
        </div>

        {/* Feature Cards */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl w-full animate-fade-up"
          style={{ animationDelay: "0.3s" }}
        >
          <FeatureCard
            icon={<ShieldCheck className="w-8 h-8" strokeWidth={1.5} />}
            title={t("feature1Title")}
            description={t("feature1Desc")}
            accentColor="#00D4FF"
            borderColor="rgba(0,212,255,0.3)"
            glowColor="rgba(0,212,255,0.08)"
          />
          <FeatureCard
            icon={<ScanEye className="w-8 h-8" strokeWidth={1.5} />}
            title={t("feature2Title")}
            description={t("feature2Desc")}
            accentColor="#DC143C"
            borderColor="rgba(220,20,60,0.3)"
            glowColor="rgba(220,20,60,0.08)"
          />
          <FeatureCard
            icon={<FlameKindling className="w-8 h-8" strokeWidth={1.5} />}
            title={t("feature3Title")}
            description={t("feature3Desc")}
            accentColor="#FF8C00"
            borderColor="rgba(255,140,0,0.3)"
            glowColor="rgba(255,140,0,0.08)"
          />
        </div>
      </div>
    </div>
  );
};

const FeatureCard = ({
  icon,
  title,
  description,
  accentColor,
  borderColor,
  glowColor,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
}) => (
  <div
    className="group glass-card-interactive p-5 md:p-6 rounded-xl transition-all duration-300 hover:-translate-y-1"
    style={{
      background: `radial-gradient(ellipse at top, ${glowColor}, transparent 70%), rgba(10,15,28,0.4)`,
      border: `1px solid ${borderColor}`,
      boxShadow: `0 0 18px -6px ${borderColor}`,
      backdropFilter: "blur(24px) saturate(1.2)",
      WebkitBackdropFilter: "blur(24px) saturate(1.2)",
    }}
    onMouseMove={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
      e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLElement).style.boxShadow = `0 0 28px -4px ${borderColor}`;
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLElement).style.boxShadow = `0 0 18px -6px ${borderColor}`;
    }}
  >
    <div
      className="mb-4 w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
      style={{
        color: accentColor,
        background: `${glowColor}`,
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 16px ${accentColor}40`,
      }}
    >
      {icon}
    </div>
    <h3 className="text-base md:text-lg font-semibold text-foreground mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground">{description}</p>
  </div>
);

export default HeroSection;
