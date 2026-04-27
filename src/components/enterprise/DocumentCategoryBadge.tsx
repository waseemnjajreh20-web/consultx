import { useLanguage } from "@/hooks/useLanguage";

const CATEGORY_META: Record<string, { ar: string; en: string; cls: string }> = {
  architectural_drawings:  { ar: "رسومات معمارية",      en: "Architectural",    cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  life_safety_drawings:    { ar: "رسومات السلامة",       en: "Life Safety",      cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  fire_alarm_drawings:     { ar: "رسومات إنذار الحريق",  en: "Fire Alarm",       cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  fire_fighting_drawings:  { ar: "رسومات إطفاء الحريق", en: "Fire Fighting",    cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  pump_tank_details:       { ar: "تفاصيل المضخات",       en: "Pump & Tank",      cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  calculations:            { ar: "الحسابات",              en: "Calculations",     cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  technical_reports:       { ar: "التقارير التقنية",      en: "Technical Reports",cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  client_documents:        { ar: "مستندات العميل",        en: "Client Docs",      cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  internal_notes:          { ar: "ملاحظات داخلية",        en: "Internal Notes",   cls: "bg-muted/40 text-muted-foreground border-border/40" },
  final_deliverables:      { ar: "المخرجات النهائية",     en: "Deliverables",     cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

interface DocumentCategoryBadgeProps {
  category: string;
  className?: string;
}

export default function DocumentCategoryBadge({ category, className = "" }: DocumentCategoryBadgeProps) {
  const { language } = useLanguage();
  const meta = CATEGORY_META[category] ?? { ar: category, en: category, cls: "bg-muted/40 text-muted-foreground border-border/40" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${meta.cls} ${className}`}>
      {language === "ar" ? meta.ar : meta.en}
    </span>
  );
}

export { CATEGORY_META };
