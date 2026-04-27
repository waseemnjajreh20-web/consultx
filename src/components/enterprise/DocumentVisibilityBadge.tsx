import { useLanguage } from "@/hooks/useLanguage";

const VISIBILITY_META: Record<string, { ar: string; en: string; cls: string }> = {
  internal_only:     { ar: "داخلي فقط",      en: "Internal",           cls: "bg-muted/40 text-muted-foreground border-border/40" },
  client_visible:    { ar: "مرئي للعميل",     en: "Client Visible",     cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  approval_required: { ar: "يستلزم اعتمادًا", en: "Approval Required",  cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  final_deliverable: { ar: "تسليم نهائي",     en: "Final Deliverable",  cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

interface DocumentVisibilityBadgeProps {
  visibility: string;
  className?: string;
}

export default function DocumentVisibilityBadge({ visibility, className = "" }: DocumentVisibilityBadgeProps) {
  const { language } = useLanguage();
  const meta = VISIBILITY_META[visibility] ?? { ar: visibility, en: visibility, cls: "bg-muted/40 text-muted-foreground border-border/40" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${meta.cls} ${className}`}>
      {language === "ar" ? meta.ar : meta.en}
    </span>
  );
}
