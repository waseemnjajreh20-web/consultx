import { cn } from "@/lib/utils";
import {
  REPORT_TYPE_CONFIGS,
  REPORT_TYPE_ORDER,
} from "@/lib/analyticalReports/reportTypeConfigs";
import type { ReportType } from "@/lib/analyticalReports/reportArtifactTypes";

interface ReportTypeSelectorProps {
  value: ReportType;
  onChange: (type: ReportType) => void;
  language: "ar" | "en";
}

export default function ReportTypeSelector({
  value,
  onChange,
  language,
}: ReportTypeSelectorProps) {
  const isAr = language === "ar";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" dir={isAr ? "rtl" : "ltr"}>
      {REPORT_TYPE_ORDER.map((type) => {
        const cfg = REPORT_TYPE_CONFIGS[type];
        const selected = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              "text-start rounded-lg border p-3 transition-colors hover:bg-muted/40",
              selected
                ? "border-primary bg-primary/10"
                : "border-border bg-card",
            )}
          >
            <div className="text-sm font-semibold text-foreground">
              {isAr ? cfg.labelAr : cfg.labelEn}
            </div>
            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {isAr ? cfg.descriptionAr : cfg.descriptionEn}
            </div>
          </button>
        );
      })}
    </div>
  );
}
