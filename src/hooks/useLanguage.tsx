import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { Language, translations, TranslationKey } from "@/lib/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  dir: "rtl" | "ltr";
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "consultx-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "en" || saved === "ar" ? saved : "ar";
    } catch {
      return "ar";
    }
  });

  // Stable reference — never changes between renders
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
  }, []);

  // Re-created ONLY when language changes — guarantees fresh translations
  const t = useCallback(
    (key: TranslationKey): string => translations[language][key] ?? key,
    [language]
  );

  const dir: "rtl" | "ltr" = language === "ar" ? "rtl" : "ltr";

  // Update document dir/lang whenever language changes
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [language, dir]);

  // Update document title + meta description/og tags to follow the UI language
  useEffect(() => {
    const title =
      language === "ar"
        ? "ConsultX | مستشارك الهندسي الذكي للحماية من الحرائق"
        : "ConsultX | AI Fire-Safety Code Assistant for Saudi Building Code";
    const description =
      language === "ar"
        ? "احصل على إجابات دقيقة وموثقة حول الكود السعودي للحماية من الحرائق SBC 201 و SBC 801 مع تحليل المخططات الهندسية باستخدام الذكاء الاصطناعي"
        : "Cited answers from Saudi Building Code SBC 201 and SBC 801 for fire and life safety compliance. Built for engineering consultancies.";

    document.title = title;

    const descTag = document.querySelector('meta[name="description"]');
    if (descTag) descTag.setAttribute("content", description);

    const ogTitleTag = document.querySelector('meta[property="og:title"]');
    if (ogTitleTag) ogTitleTag.setAttribute("content", title);

    const ogDescTag = document.querySelector('meta[property="og:description"]');
    if (ogDescTag) ogDescTag.setAttribute("content", description);
  }, [language]);

  // Context value only changes when language changes — forces global re-render
  const contextValue = useMemo(
    () => ({ language, setLanguage, t, dir }),
    [language, setLanguage, t, dir]
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
