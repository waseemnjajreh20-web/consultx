import { useState, useEffect } from "react";
import { LogOut, User, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { LanguageToggle } from "@/components/LanguageToggle";
import consultxIcon from "@/assets/consultx-platform-logo.png";

interface SiteHeaderProps {
  onStartChat?: () => void;
  isLoggedIn?: boolean;
}

const SiteHeader = ({ onStartChat, isLoggedIn }: SiteHeaderProps) => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const rawName =
    (user?.user_metadata as Record<string, string> | undefined)?.full_name ||
    (user?.user_metadata as Record<string, string> | undefined)?.name ||
    user?.email || "";
  const displayName = rawName.includes("@") ? rawName.split("@")[0] : rawName;
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
    <>
      {/* Glassmorphism Floating Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-6 transition-all duration-300 ${
          scrolled
            ? "py-2 bg-background/70 backdrop-blur-xl shadow-lg shadow-primary/5 border-b border-primary/10"
            : "py-4 bg-transparent border-b border-border/30"
        }`}
      >
        {/* Logo */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity"
        >
          <img
            src={consultxIcon}
            alt="ConsultX Icon"
            className="object-contain transition-all duration-300"
            style={{ height: scrolled ? "28px" : "32px", width: "auto" }}
          />
          <span
            className={`font-bold text-gradient transition-all duration-300 ${
              scrolled ? "text-base md:text-lg" : "text-lg md:text-xl"
            }`}
          >
            {t("appName")}
          </span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4">
          <LanguageToggle />
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => navigate("/account")}
                className="text-muted-foreground hover:text-foreground"
              >
                <User className="w-4 h-4 ms-2" />
                {displayName || t("accountLink")}
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
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => navigate("/auth")}
                className="text-muted-foreground hover:text-foreground"
              >
                {t("signIn")}
              </Button>
              <Button
                variant="hero"
                size="sm"
                onClick={onStartChat ?? (() => navigate("/auth"))}
                className="px-4"
              >
                {t("startFreeTrial")}
              </Button>
            </div>
          )}
        </nav>

        {/* Mobile hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <LanguageToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </Button>
        </div>
      </header>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="fixed top-16 left-0 right-0 z-40 md:hidden border-b border-border/30 bg-background/95 backdrop-blur-xl px-4 py-3 flex flex-col gap-2 animate-fade-in">
          {isLoggedIn ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/account");
                }}
                className="justify-start text-muted-foreground hover:text-foreground"
              >
                <User className="w-4 h-4 ms-2" />
                {t("accountLink")}
              </Button>
              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="justify-start text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4 ms-2" />
                {t("signOut")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/auth");
                }}
                className="justify-start text-muted-foreground hover:text-foreground"
              >
                {t("signIn")}
              </Button>
              <Button
                variant="hero"
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (onStartChat) onStartChat();
                  else navigate("/auth");
                }}
                className="w-full"
              >
                {t("startFreeTrial")}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Spacer to prevent content jump from fixed header */}
      <div className="h-16" />
    </>
  );
};

export default SiteHeader;
