import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  BrandingMode,
  ReportBranding,
} from "@/lib/analyticalReports/reportArtifactTypes";

interface ReportBrandingFormProps {
  value: ReportBranding;
  onChange: (next: ReportBranding) => void;
  language: "ar" | "en";
}

const MAX_LOGO_BYTES = 200 * 1024;        // 200KB cap
const ACCEPT_MIMES = ["image/png", "image/jpeg", "image/jpg"];

const MODE_OPTIONS: { value: BrandingMode; ar: string; en: string }[] = [
  { value: "consultx_only", ar: "╪┤╪╣╪º╪▒ ConsultX ┘ü┘é╪╖", en: "ConsultX only" },
  { value: "company_only", ar: "╪┤╪╣╪º╪▒ ╪º┘ä╪┤╪▒┘â╪⌐ ┘ü┘é╪╖", en: "Company logo only" },
  { value: "both", ar: "╪º┘ä╪┤╪╣╪º╪▒╪º┘å ┘à╪╣┘ï╪º", en: "Both logos" },
  { value: "none", ar: "╪¿╪»┘ê┘å ╪┤╪╣╪º╪▒", en: "No logo" },
];

export default function ReportBrandingForm({
  value,
  onChange,
  language,
}: ReportBrandingFormProps) {
  const isAr = language === "ar";
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleLogoPick = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT_MIMES.includes(file.type)) {
      // Silent reject ΓÇö input visually shows the file but we don't load it.
      // Production hook-up could surface a toast; Phase 1 keeps minimal.
      return;
    }
    if (file.size > MAX_LOGO_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      if (url) onChange({ ...value, companyLogoDataUrl: url });
    };
    reader.readAsDataURL(file);
  };

  const showCompanyLogoControls =
    value.mode === "company_only" || value.mode === "both";

  return (
    <div className="space-y-3" dir={isAr ? "rtl" : "ltr"}>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          {isAr ? "┘å┘à╪╖ ╪º┘ä╪┤╪╣╪º╪▒" : "Branding mode"}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...value, mode: opt.value })}
              className={cn(
                "rounded-md border px-3 py-2 text-xs transition-colors hover:bg-muted/40",
                value.mode === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card",
              )}
            >
              {isAr ? opt.ar : opt.en}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground" htmlFor="cx-company-name">
          {isAr ? "╪º╪│┘à ╪º┘ä╪┤╪▒┘â╪⌐ (╪º╪«╪¬┘è╪º╪▒┘è)" : "Company name (optional)"}
        </Label>
        <Input
          id="cx-company-name"
          value={value.companyName ?? ""}
          onChange={(e) => onChange({ ...value, companyName: e.target.value })}
          placeholder={isAr ? "┘à╪½╪º┘ä: ┘à┘â╪¬╪¿ ╪º┘ä╪º╪│╪¬╪┤╪º╪▒╪º╪¬ ╪º┘ä┘ç┘å╪»╪│┘è╪⌐" : "e.g. Acme Engineering"}
        />
      </div>

      {showCompanyLogoControls && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {isAr ? "╪┤╪╣╪º╪▒ ╪º┘ä╪┤╪▒┘â╪⌐ (PNG / JPG╪î ╪¡╪¬┘ë 200KB)" : "Company logo (PNG / JPG, up to 200KB)"}
          </Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              {isAr ? "╪º╪«╪¬╪▒ ┘à┘ä┘ü ╪º┘ä╪┤╪╣╪º╪▒" : "Choose logo file"}
            </Button>
            {value.companyLogoDataUrl ? (
              <span className="flex items-center gap-2">
                <img
                  src={value.companyLogoDataUrl}
                  alt="logo preview"
                  className="h-8 w-auto rounded border border-border"
                />
                <button
                  type="button"
                  className="text-xs text-destructive hover:underline"
                  onClick={() =>
                    onChange({ ...value, companyLogoDataUrl: undefined })
                  }
                >
                  {isAr ? "╪Ñ╪▓╪º┘ä╪⌐" : "Remove"}
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {isAr ? "┘ä┘à ┘è╪¬┘à ╪º╪«╪¬┘è╪º╪▒ ╪┤╪╣╪º╪▒" : "No logo selected"}
              </span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => handleLogoPick(e.target.files?.[0])}
          />
        </div>
      )}
    </div>
  );
}
