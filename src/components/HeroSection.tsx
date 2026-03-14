import { useState } from "react";
import { Flame, LogOut, User, ChevronDown, ShieldCheck, ScanEye, FlameKindling, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { LanguageToggle } from "@/components/LanguageToggle";
import LogoMarquee from "@/components/LogoMarquee";
import HeroParticles from "@/components/HeroParticles";
import consultxIcon from "@/assets/consultx-icon.png";

interface HeroSectionProps {
  onStartChat: () => void;
  isLoggedIn?: boolean;
}

const HeroSection = ({ onStartChat, isLoggedIn }: HeroSectionProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-4 md:px-6 py-4 border-b border-border/30">
        {/* Logo */}
        <div className="flex items-center gap-2 md:gap-3">
          <img
            src={consultxIcon}
            alt="ConsultX Icon"
            className="object-contain"
            style={{ height: "32px", width: "auto" }}
          />
          <span className="text-lg md:text-xl font-bold text-gradient">{t("appName")}</span>
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

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="relative z-20 md:hidden border-b border-border/30 bg-background/95 backdrop-blur-xl px-4 py-3 flex flex-col gap-2 animate-fade-in">
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
          {/* Logo container */}
          <div
            className="relative p-3 rounded-3xl"
            style={{
              background: "rgba(17,24,39,0.4)",
              border: "1px solid rgba(0,212,255,0.25)",
              boxShadow: "0 0 30px rgba(0,212,255,0.25), inset 0 0 20px rgba(0,212,255,0.05)",
              animation: "avatarGlowBlue 5s ease-in-out infinite",
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
              src="/lovable-uploads/ee6d6730-a1f2-46b6-957c-92b8ed26eb64.png"
              loading="eager"
            />
          </div>
        </div>

        {/* Title */}
        <h1
          className="hero-heading text-3xl md:text-5xl font-bold text-center mb-4 animate-fade-up px-3 py-2"
          style={{
            background: "linear-gradient(135deg, #00D4FF 0%, #ffffff 60%, #00D4FF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 18px rgba(0,212,255,0.35))",
          }}
        >
          {t("heroTitle")}
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
          <Button
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
          </Button>
          <Button
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
          </Button>
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
    className="group p-5 md:p-6 rounded-xl transition-all duration-300 hover:-translate-y-1"
    style={{
      background: `radial-gradient(ellipse at top, ${glowColor}, transparent 70%), rgba(17,24,39,0.8)`,
      border: `1px solid ${borderColor}`,
      boxShadow: `0 0 18px -6px ${borderColor}`,
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
