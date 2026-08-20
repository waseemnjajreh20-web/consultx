import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";

import consultxLogo from "@/assets/consultx-platform-logo.png";

import IntakeFormWizard from "./IntakeFormWizard";

import { buildReportArtifact } from "@/lib/analyticalReports/buildReportArtifact";
import { downloadDocxReport } from "@/lib/analyticalReports/generateDocxReport";
import { defaultIntakeForm } from "@/lib/analyticalReports/intakeFormDefaults";
import type {
  AnalyticalReportIntakeFormV1,
} from "@/lib/analyticalReports/intakeFormTypes";
import type {
  ReportBranding,
  ReportSourceMeta,
} from "@/lib/analyticalReports/reportArtifactTypes";

export interface ReportArtifactDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  messageContent: string;
  sources?: string[];
  sourceMeta?: ReportSourceMeta[];
  /** Engineer / preparer name pre-fill (from profile). */
  preparedByDefault?: string;
  /** Current UI language ΓÇö drives the drawer chrome and wizard labels. */
  uiLanguage: "ar" | "en";
}

function readLocalStorage(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

let logoPromise: Promise<void> | null = null;
function ensureConsultxLogoLoaded(): Promise<void> {
  if (logoPromise) return logoPromise;
  logoPromise = (async () => {
    try {
      const resp = await fetch(consultxLogo);
      const blob = await resp.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
      if (dataUrl) {
        // Logo loaded, could store it if needed
        console.log("[ReportArtifactDrawer] ConsultX logo loaded");
      }
    } catch (err) {
      console.warn("[ReportArtifactDrawer] Failed to load ConsultX logo:", err);
    }
  })();
  return logoPromise;
}

export default function ReportArtifactDrawer({
  open,
  onOpenChange,
  messageId,
  messageContent,
  sources,
  sourceMeta,
  preparedByDefault,
  uiLanguage,
}: ReportArtifactDrawerProps) {
  const isAr = uiLanguage === "ar";
  const { toast } = useToast();

  // Initial branding from localStorage (carryover from Phase 1)
  const initialBranding: ReportBranding = useMemo(() => {
    const companyName = readLocalStorage("cx_company_name");
    const companyLogo = readLocalStorage("cx_company_logo");
    if (companyLogo && companyName) {
      return {
        mode: "both",
        companyName,
        companyLogoDataUrl: companyLogo.startsWith("data:") ? companyLogo : undefined,
      };
    }
    if (companyName) {
      return { mode: "consultx_only", companyName };
    }
    return { mode: "consultx_only" };
  }, []);

  const [form, setForm] = useState<AnalyticalReportIntakeFormV1>(() =>
    defaultIntakeForm({
      language: isAr ? "ar" : "en",
      preparedBy: preparedByDefault ?? "",
      branding: initialBranding,
    }),
  );
  const [generating, setGenerating] = useState(false);

  // Re-sync preparedBy and language when drawer opens
  useEffect(() => {
    if (!open) return;
    ensureConsultxLogoLoaded();
    setForm((prev) => ({
      ...prev,
      preparedBy: prev.preparedBy || preparedByDefault || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (validatedForm: AnalyticalReportIntakeFormV1) => {
    setGenerating(true);
    try {
      await ensureConsultxLogoLoaded();
      const artifact = buildReportArtifact({
        reportType: validatedForm.reportType,
        language: validatedForm.language,
        status: validatedForm.reportStatus,
        metadata: {
          projectName: validatedForm.projectName,
          projectNumber: validatedForm.projectNumber,
          clientName: validatedForm.clientOwner,
          location: validatedForm.projectLocation,
          preparedBy: validatedForm.preparedBy,
          reviewedBy: validatedForm.reviewedBy,
          revisionNumber: validatedForm.revisionNo,
          revisionDate: validatedForm.reportDate,
        },
        branding: validatedForm.branding,
        intake: validatedForm,
        messageId,
        messageContent,
        sourceFiles: sources,
        sourceMeta,
        generatedBy: preparedByDefault,
      });
      const filename = await downloadDocxReport(artifact);
      toast({
        title: isAr ? "╪¬┘à ╪Ñ┘å╪┤╪º╪í ╪º┘ä╪¬┘é╪▒┘è╪▒" : "Report generated",
        description: filename,
      });
      onOpenChange(false);
    } catch (err) {
      console.error("[ReportArtifactDrawer] generation failed:", err);
      toast({
        title: isAr ? "╪¬╪╣╪░┘æ╪▒ ╪Ñ┘å╪┤╪º╪í ╪º┘ä╪¬┘é╪▒┘è╪▒" : "Report generation failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isAr ? "left" : "right"}
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader className="text-start" dir={isAr ? "rtl" : "ltr"}>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {isAr ? "╪¬┘é╪▒┘è╪▒ ╪º╪¡╪¬╪▒╪º┘ü┘è" : "Professional Report"}
          </SheetTitle>
          <SheetDescription>
            {isAr
              ? "╪ú┘â┘à┘ä ╪º╪│╪¬┘à╪º╪▒╪⌐ ╪º┘ä╪Ñ╪»╪«╪º┘ä ╪╣┘ä┘ë ╪½┘à╪º┘å┘è ╪«╪╖┘ê╪º╪¬╪î ╪½┘à ╪ú┘å╪┤╪ª ╪¬┘é╪▒┘è╪▒╪º┘ï ╪º╪¡╪¬╪▒╪º┘ü┘è╪º┘ï ╪¿╪╡┘è╪║╪⌐ Word."
              : "Complete the 8-step intake form, then generate a professional Word report."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <IntakeFormWizard
            value={form}
            onChange={setForm}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            uiLanguage={uiLanguage}
            generating={generating}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
