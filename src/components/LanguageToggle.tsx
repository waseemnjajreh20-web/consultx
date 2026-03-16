import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  const toggle = () => setLanguage(language === "ar" ? "en" : "ar");

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground px-2"
      title={language === "ar" ? "Switch to English" : "التبديل للعربية"}
      aria-label={language === "ar" ? "Switch to English" : "التبديل للعربية"}
    >
      <Globe className="w-4 h-4" />
      <span className="text-xs font-semibold tracking-wide">
        {language === "ar" ? "EN" : "عر"}
      </span>
    </Button>
  );
}
