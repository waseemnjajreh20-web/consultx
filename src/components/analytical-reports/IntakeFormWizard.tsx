/**
 * IntakeFormWizard
 *
 * 8-step wizard that captures analytical_report_intake_form_v1 before
 * DOCX generation. Conditional rules:
 *  - Global admin fields are blocking.
 *  - Engineering fields are NEVER globally required ΓÇö only when the
 *    selected report type or selected system status demands them.
 *  - Technical unknowns are explicitly markable and never blocking.
 *
 * The wizard is intentionally a single file: each step is a small
 * inline subcomponent. State management is local; the parent (drawer)
 * receives onSubmit with the validated intake form.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { REPORT_TYPE_CONFIGS } from "@/lib/analyticalReports/reportTypeConfigs";
import type {
  AnalyticalReportIntakeFormV1,
  AreaSource,
  ClassificationStatus,
  DrawingType,
  FinalOccupancyStatus,
  FinalReadinessStatus,
  GapItem,
  MandatoryRequirementItem,
  MissingDataItem,
  SubmissionChecklistItem,
  SystemIncludeStatus,
  SystemsInventory,
  TechnicalField,
  TechnicalUnknown,
  TriExtractStatus,
  TriYesNoConfirm,
  TriYesNoNA,
} from "@/lib/analyticalReports/intakeFormTypes";
import {
  CLASSIFICATION_ORDER,
  SYSTEM_INCLUDE_OPTIONS,
  TECHNICAL_UNKNOWN_OPTIONS,
  tfUnknown,
  tfValue,
} from "@/lib/analyticalReports/intakeFormTypes";
import {
  AREA_SOURCE_LABELS,
  COVER_STYLE_LABELS,
  DRAWING_TYPE_LABELS,
  FINAL_OCCUPANCY_LABELS,
  FINAL_READINESS_LABELS,
  TRI_EXTRACT_LABELS,
  TRI_YES_NO_CONFIRM_LABELS,
  TRI_YES_NO_NA_LABELS,
  classificationLabel,
  enumLabel,
  mandatoryItemLabel,
  systemIncludeLabel,
  technicalUnknownLabel,
} from "@/lib/analyticalReports/intakeFormLabels";
import {
  newGapItem,
  newMandatoryItem,
  newMissingDataItem,
  newSubmissionChecklistItem,
} from "@/lib/analyticalReports/intakeFormDefaults";
import {
  validateAdminOnly,
  validateIntakeForm,
  type FieldError,
} from "@/lib/analyticalReports/validateIntakeForm";
import ReportTypeSelector from "./ReportTypeSelector";
import ReportBrandingForm from "./ReportBrandingForm";

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Props & local types
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export interface IntakeFormWizardProps {
  value: AnalyticalReportIntakeFormV1;
  onChange: (next: AnalyticalReportIntakeFormV1) => void;
  onSubmit: (form: AnalyticalReportIntakeFormV1) => void;
  onCancel: () => void;
  uiLanguage: "ar" | "en";
  generating: boolean;
}

interface StepDef {
  id: number;
  titleAr: string;
  titleEn: string;
}

const STEPS: StepDef[] = [
  { id: 1, titleAr: "┘å┘ê╪╣ ╪º┘ä╪¬┘é╪▒┘è╪▒", titleEn: "Report type & output" },
  { id: 2, titleAr: "╪¿┘è╪º┘å╪º╪¬ ╪º┘ä┘à╪┤╪▒┘ê╪╣", titleEn: "Project information" },
  { id: 3, titleAr: "╪ú╪│╪º╪│ ╪º┘ä┘à╪«╪╖╪╖╪º╪¬", titleEn: "Building & drawing basis" },
  { id: 4, titleAr: "╪º┘ä╪Ñ╪┤╪║╪º┘ä ┘ê╪º┘ä╪º╪│╪¬╪«╪»╪º┘à", titleEn: "Occupancy & use" },
  { id: 5, titleAr: "╪º┘ä╪º╪┤╪¬╪▒╪º╪╖╪º╪¬ ╪º┘ä╪Ñ┘ä╪▓╪º┘à┘è╪⌐", titleEn: "Mandatory requirements" },
  { id: 6, titleAr: "╪º┘ä╪ú┘å╪╕┘à╪⌐ ╪º┘ä┘à╪«╪¬╪º╪▒╪⌐", titleEn: "Selected systems" },
  { id: 7, titleAr: "┘à╪»╪«┘ä╪º╪¬ ╪¡╪│╪¿ ┘å┘ê╪╣ ╪º┘ä╪¬┘é╪▒┘è╪▒", titleEn: "Report-specific inputs" },
  { id: 8, titleAr: "┘à╪▒╪º╪¼╪╣╪⌐ ┘ê╪Ñ┘å╪┤╪º╪í", titleEn: "Review & generate" },
];

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Component
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export default function IntakeFormWizard({
  value,
  onChange,
  onSubmit,
  onCancel,
  uiLanguage,
  generating,
}: IntakeFormWizardProps) {
  const isAr = uiLanguage === "ar";
  const [step, setStep] = useState(1);
  const [showErrors, setShowErrors] = useState(false);

  const validation = useMemo(() => validateIntakeForm(value), [value]);
  const adminValidation = useMemo(() => validateAdminOnly(value), [value]);

  const stepErrors = (n: number): FieldError[] =>
    validation.errors.filter((e) => e.step === n);

  const goNext = () => {
    // From step 1+2, gate on admin validity. From later steps allow free movement.
    if (step <= 2 && !adminValidation.ok) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(8, s + 1));
  };
  const goPrev = () => {
    setShowErrors(false);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleGenerate = () => {
    if (!validation.ok) {
      setShowErrors(true);
      // Jump to the first step with an error
      const firstStep = validation.errors[0]?.step ?? 1;
      setStep(firstStep);
      return;
    }
    onSubmit(value);
  };

  const set = <K extends keyof AnalyticalReportIntakeFormV1>(
    key: K,
    v: AnalyticalReportIntakeFormV1[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <StepIndicator step={step} steps={STEPS} isAr={isAr} stepErrors={(n) => stepErrors(n).length} />

      <div className="rounded-lg border border-border bg-card/40 p-4">
        {step === 1 && <Step1 value={value} set={set} isAr={isAr} />}
        {step === 2 && <Step2 value={value} set={set} isAr={isAr} showErrors={showErrors} errors={stepErrors(2)} />}
        {step === 3 && <Step3 value={value} set={set} isAr={isAr} showErrors={showErrors} errors={stepErrors(3)} />}
        {step === 4 && <Step4 value={value} set={set} isAr={isAr} showErrors={showErrors} errors={stepErrors(4)} />}
        {step === 5 && <Step5 value={value} set={set} isAr={isAr} showErrors={showErrors} errors={stepErrors(5)} />}
        {step === 6 && <Step6 value={value} set={set} isAr={isAr} showErrors={showErrors} errors={stepErrors(6)} />}
        {step === 7 && <Step7 value={value} set={set} isAr={isAr} showErrors={showErrors} errors={stepErrors(7)} />}
        {step === 8 && (
          <Step8
            value={value}
            isAr={isAr}
            validation={validation}
            onJumpToStep={(n) => setStep(n)}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={generating}>
            {isAr ? "╪Ñ┘ä╪║╪º╪í" : "Cancel"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={goPrev} disabled={generating}>
              {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {isAr ? "╪º┘ä╪│╪º╪¿┘é" : "Back"}
            </Button>
          )}
          {step < 8 && (
            <Button onClick={goNext} disabled={generating}>
              {isAr ? "╪º┘ä╪¬╪º┘ä┘è" : "Next"}
              {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
          {step === 8 && (
            <Button onClick={handleGenerate} disabled={generating || !validation.ok}>
              {generating ? (isAr ? "╪¼╪º╪▒┘ì ╪º┘ä╪Ñ┘å╪┤╪º╪íΓÇª" : "GeneratingΓÇª") : isAr ? "╪Ñ┘å╪┤╪º╪í DOCX" : "Generate DOCX"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step indicator
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function StepIndicator({
  step,
  steps,
  isAr,
  stepErrors,
}: {
  step: number;
  steps: StepDef[];
  isAr: boolean;
  stepErrors: (n: number) => number;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {steps.map((s, i) => {
        const isCurrent = s.id === step;
        const isDone = s.id < step;
        const errCount = stepErrors(s.id);
        return (
          <li key={s.id} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 border",
                isCurrent
                  ? "border-primary bg-primary/10 text-foreground"
                  : isDone
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                    : "border-border bg-card/40 text-muted-foreground",
              )}
            >
              <span className="font-mono">{s.id}.</span>
              <span className="whitespace-nowrap">{isAr ? s.titleAr : s.titleEn}</span>
              {errCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                  {errCount}
                </Badge>
              )}
            </div>
            {i < steps.length - 1 && <span className="text-muted-foreground/40">┬╖</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Reusable: field error label
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function FieldErrorMsg({ errors, path }: { errors: FieldError[]; path: string }) {
  const e = errors.find((er) => er.path === path);
  if (!e) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
      <AlertTriangle className="h-3 w-3" />
      {e.message}
    </p>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Reusable: labelled field wrapper
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Reusable: TechnicalField input with unknown placeholder dropdown
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function TechnicalFieldInput({
  value,
  onChange,
  placeholder,
  isAr,
}: {
  value: TechnicalField | undefined;
  onChange: (next: TechnicalField | undefined) => void;
  placeholder?: string;
  isAr: boolean;
}) {
  const isUnknown = value?.kind === "unknown";
  return (
    <div className="flex items-center gap-2">
      <Input
        value={value?.kind === "value" ? value.value : ""}
        onChange={(e) => onChange(e.target.value ? tfValue(e.target.value) : undefined)}
        disabled={isUnknown}
        placeholder={placeholder}
        className="flex-1"
      />
      <select
        value={isUnknown ? value!.placeholder : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) onChange(undefined);
          else onChange(tfUnknown(v as TechnicalUnknown));
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">{isAr ? "ΓÇö ╪ú┘ê ┘ê╪╢╪╣ ╪║┘è╪▒ ┘à╪╣╪▒┘ê┘ü ΓÇö" : "ΓÇö or mark unknown ΓÇö"}</option>
        {TECHNICAL_UNKNOWN_OPTIONS.map((u) => (
          <option key={u} value={u}>
            {technicalUnknownLabel(u, isAr ? "ar" : "en")}
          </option>
        ))}
      </select>
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Reusable: simple select wrapper (native <select> styled like Input)
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function NativeSelect<T extends string>({
  value,
  onChange,
  options,
  labelOf,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly T[];
  labelOf: (v: T) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labelOf(o)}
        </option>
      ))}
    </select>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step 1 ΓÇö Report Type & Output
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

interface StepProps {
  value: AnalyticalReportIntakeFormV1;
  set: <K extends keyof AnalyticalReportIntakeFormV1>(
    key: K,
    v: AnalyticalReportIntakeFormV1[K],
  ) => void;
  isAr: boolean;
  showErrors?: boolean;
  errors?: FieldError[];
}

function Step1({ value, set, isAr }: StepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{isAr ? "┘å┘ê╪╣ ╪º┘ä╪¬┘é╪▒┘è╪▒" : "Report type"}</h3>
        <ReportTypeSelector
          value={value.reportType}
          onChange={(t) => set("reportType", t)}
          language={isAr ? "ar" : "en"}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={isAr ? "┘ä╪║╪⌐ ╪º┘ä╪¬┘é╪▒┘è╪▒" : "Report language"} required>
          <NativeSelect
            value={value.language}
            onChange={(v) => set("language", v)}
            options={["ar", "en", "bilingual"] as const}
            labelOf={(v) =>
              isAr
                ? v === "ar"
                  ? "╪º┘ä╪╣╪▒╪¿┘è╪⌐"
                  : v === "en"
                    ? "╪º┘ä╪Ñ┘å╪¼┘ä┘è╪▓┘è╪⌐"
                    : "╪½┘å╪º╪ª┘è ╪º┘ä┘ä╪║╪⌐"
                : v === "ar"
                  ? "Arabic"
                  : v === "en"
                    ? "English"
                    : "Bilingual"
            }
          />
        </Field>
        <Field label={isAr ? "╪¡╪º┘ä╪⌐ ╪º┘ä╪¬┘é╪▒┘è╪▒" : "Report status"} required>
          <NativeSelect
            value={value.reportStatus}
            onChange={(v) => set("reportStatus", v)}
            options={["draft", "for_review", "final"] as const}
            labelOf={(v) =>
              isAr
                ? v === "draft"
                  ? "┘à╪│┘ê╪»╪⌐"
                  : v === "for_review"
                    ? "┘é┘è╪» ╪º┘ä┘à╪▒╪º╪¼╪╣╪⌐"
                    : "┘å┘ç╪º╪ª┘è"
                : v === "draft"
                  ? "Draft"
                  : v === "for_review"
                    ? "For Review"
                    : "Final"
            }
          />
        </Field>
      </div>
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step 2 ΓÇö Project Information (global required)
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function Step2({ value, set, isAr, errors = [] }: StepProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={isAr ? "╪º╪│┘à ╪º┘ä┘à╪┤╪▒┘ê╪╣" : "Project name"} required>
          <Input
            value={value.projectName}
            onChange={(e) => set("projectName", e.target.value)}
            placeholder={isAr ? "┘à╪½╪º┘ä: ┘à╪¼┘à╪╣ ╪º┘ä┘ê╪º╪¡╪⌐" : "e.g. Oasis Complex"}
          />
          <FieldErrorMsg errors={errors} path="projectName" />
        </Field>
        <Field label={isAr ? "╪▒┘é┘à ╪º┘ä┘à╪┤╪▒┘ê╪╣" : "Project number"}>
          <Input
            value={value.projectNumber ?? ""}
            onChange={(e) => set("projectNumber", e.target.value)}
            placeholder="PRJ-2026-001"
          />
        </Field>
        <Field label={isAr ? "╪º┘ä╪╣┘à┘è┘ä / ╪º┘ä┘à╪º┘ä┘â" : "Client / Owner"} required>
          <Input
            value={value.clientOwner}
            onChange={(e) => set("clientOwner", e.target.value)}
          />
          <FieldErrorMsg errors={errors} path="clientOwner" />
        </Field>
        <Field label={isAr ? "┘à┘ê┘é╪╣ ╪º┘ä┘à╪┤╪▒┘ê╪╣" : "Project location"} required>
          <Input
            value={value.projectLocation}
            onChange={(e) => set("projectLocation", e.target.value)}
            placeholder={isAr ? "╪º┘ä┘à╪»┘è┘å╪⌐ / ╪º┘ä╪¡┘è" : "City / District"}
          />
          <FieldErrorMsg errors={errors} path="projectLocation" />
        </Field>
        <Field label={isAr ? "╪Ñ╪╣╪»╪º╪» ╪º┘ä┘à┘ç┘å╪»╪│" : "Prepared by"} required>
          <Input
            value={value.preparedBy}
            onChange={(e) => set("preparedBy", e.target.value)}
          />
          <FieldErrorMsg errors={errors} path="preparedBy" />
        </Field>
        <Field label={isAr ? "╪º┘ä┘à╪▒╪º╪¼╪╣" : "Reviewed by"}>
          <Input
            value={value.reviewedBy ?? ""}
            onChange={(e) => set("reviewedBy", e.target.value)}
          />
        </Field>
        <Field label={isAr ? "╪▒┘é┘à ╪º┘ä┘à╪▒╪º╪¼╪╣╪⌐" : "Revision"} required>
          <Input
            type="number"
            min={1}
            value={value.revisionNo}
            onChange={(e) =>
              set("revisionNo", Math.max(1, parseInt(e.target.value || "1", 10) || 1))
            }
          />
          <FieldErrorMsg errors={errors} path="revisionNo" />
        </Field>
        <Field label={isAr ? "╪¬╪º╪▒┘è╪« ╪º┘ä╪¬┘é╪▒┘è╪▒" : "Report date"} required>
          <Input
            type="date"
            value={value.reportDate}
            onChange={(e) => set("reportDate", e.target.value)}
          />
          <FieldErrorMsg errors={errors} path="reportDate" />
        </Field>
        <Field label={isAr ? "┘å┘ê╪╣ ╪º┘ä┘à┘å╪┤╪ú╪⌐" : "Facility type"}>
          <Input
            value={value.facilityType ?? ""}
            onChange={(e) => set("facilityType", e.target.value)}
            placeholder={isAr ? "┘à╪╖╪╣┘à / ┘à┘â╪¬╪¿ / ┘à╪│╪¬┘ê╪»╪╣ ΓÇª" : "Restaurant / Office / Warehouse ΓÇª"}
          />
        </Field>
        <Field label={isAr ? "╪º╪│┘à ╪º┘ä╪º╪│╪¬╪┤╪º╪▒┘è" : "Consultant name"}>
          <Input
            value={value.consultantName ?? ""}
            onChange={(e) => set("consultantName", e.target.value)}
          />
        </Field>
        <Field label={isAr ? "╪º┘ä╪¼┘ç╪⌐ ╪º┘ä┘à╪«╪¬╪╡╪⌐ ┘ä┘ä╪¬┘é╪»┘è┘à" : "Authority / Submission body"}>
          <Input
            value={value.authoritySubmissionBody ?? ""}
            onChange={(e) => set("authoritySubmissionBody", e.target.value)}
            placeholder={isAr ? "╪º┘ä╪»┘ü╪º╪╣ ╪º┘ä┘à╪»┘å┘è╪î ╪º┘ä╪¿┘ä╪»┘è╪⌐╪î ΓÇª" : "Civil Defence, Municipality, ΓÇª"}
          />
        </Field>
      </div>
      <Field label={isAr ? "┘ê╪╡┘ü ╪º┘ä┘à╪¿┘å┘ë" : "Building description"}>
        <Textarea
          rows={2}
          value={value.buildingDescription ?? ""}
          onChange={(e) => set("buildingDescription", e.target.value)}
        />
      </Field>

      <div className="pt-2">
        <h3 className="text-sm font-semibold mb-2">{isAr ? "╪º┘ä╪╣┘ä╪º┘à╪⌐ ╪º┘ä╪¬╪¼╪º╪▒┘è╪⌐" : "Branding"}</h3>
        <ReportBrandingForm
          value={value.branding}
          onChange={(b) => set("branding", b)}
          language={isAr ? "ar" : "en"}
        />
        <div className="mt-3">
          <Field label={isAr ? "┘å┘à╪╖ ╪╡┘ü╪¡╪⌐ ╪º┘ä╪║┘ä╪º┘ü" : "Cover page style"} required>
            <NativeSelect
              value={value.branding.coverPageStyle ?? "Professional"}
              onChange={(v) =>
                set("branding", { ...value.branding, coverPageStyle: v })
              }
              options={["Professional", "Authority", "Internal"] as const}
              labelOf={(v) => enumLabel(COVER_STYLE_LABELS, v, isAr ? "ar" : "en")}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step 3 ΓÇö Building & Drawing Basis
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function Step3({ value, set, isAr, errors = [] }: StepProps) {
  const db = value.drawingBasis;
  const update = (patch: Partial<typeof db>) =>
    set("drawingBasis", { ...db, ...patch });
  const requiredForType =
    value.reportType === "design_basis" || value.reportType === "code_requirements_plan";
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "╪ú╪│╪º╪│ ╪º┘ä┘à╪«╪╖╪╖╪º╪¬ ┘è┘Å╪¡╪»╪» ╪º┘ä┘à╪▒╪º╪¼╪╣ ╪º┘ä╪¬╪╡┘à┘è┘à┘è╪⌐ ┘ä┘ä╪¬┘é╪▒┘è╪▒. ┘à╪╖┘ä┘ê╪¿ ┘ä╪¬┘é╪º╪▒┘è╪▒ ╪ú╪│╪º╪│ ╪º┘ä╪¬╪╡┘à┘è┘à ┘ê╪¬╪¡┘ä┘è┘ä ╪º┘ä┘â┘ê╪»."
          : "Drawing basis identifies the design references used. Required for Design Basis and Code Requirements & Plan Analysis."}
      </p>
      <Field
        label={isAr ? "╪º┘ä┘à╪«╪╖╪╖╪º╪¬ ╪º┘ä┘à╪▒┘ü┘ê╪╣╪⌐ (┘é╪º╪ª┘à╪⌐ ╪ú┘ê ┘ê╪╡┘ü)" : "Drawings reviewed (list or description)"}
        required={requiredForType}
      >
        <Textarea
          rows={3}
          value={db.documents ?? ""}
          onChange={(e) => update({ documents: e.target.value })}
          placeholder={
            isAr
              ? "┘à╪½╪º┘ä: A-100 ╪º┘ä╪╖╪º╪¿┘é ╪º┘ä╪ú╪▒╪╢┘è╪î A-101 ╪º┘ä╪╖╪º╪¿┘é ╪º┘ä╪ú┘ê┘ä╪î FP-001 ┘à╪«╪╖╪╖ ╪º┘ä╪¡┘à╪º┘è╪⌐"
              : "e.g. A-100 Ground floor, A-101 First floor, FP-001 Fire protection"
          }
        />
        <FieldErrorMsg errors={errors} path="drawingBasis.documents" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={isAr ? "┘å┘ê╪╣ ╪º┘ä┘à╪«╪╖╪╖" : "Drawing type"}>
          <NativeSelect
            value={db.drawingType ?? "PDF"}
            onChange={(v) => update({ drawingType: v as DrawingType })}
            options={["PDF", "CAD", "DXF", "DWG", "Mixed"] as const}
            labelOf={(v) => enumLabel(DRAWING_TYPE_LABELS, v, isAr ? "ar" : "en")}
          />
        </Field>
        <Field label={isAr ? "╪º┘ä╪╖┘ê╪º╪¿┘é ╪º┘ä┘à┘Å╪▒╪º╪¼╪╣╪⌐" : "Floors reviewed"}>
          <Input
            value={db.floorsReviewed ?? ""}
            onChange={(e) => update({ floorsReviewed: e.target.value })}
            placeholder={isAr ? "╪ú╪▒╪╢┘è╪î ╪ú┘ê┘ä╪î ┘à┘è╪▓╪º┘å┘è┘å" : "GF, F1, Mezz"}
          />
        </Field>
        <Field label={isAr ? "┘à╪╡╪»╪▒ ╪º┘ä┘à╪│╪º╪¡╪º╪¬" : "Area source"}>
          <NativeSelect
            value={db.areaSource ?? "Unknown"}
            onChange={(v) => update({ areaSource: v as AreaSource })}
            options={["CADMeasured", "PDFEstimated", "UserProvided", "Unknown"] as const}
            labelOf={(v) => enumLabel(AREA_SOURCE_LABELS, v, isAr ? "ar" : "en")}
          />
        </Field>
        <Field label={isAr ? "┘à╪│╪º╪¡╪⌐ ╪º┘ä╪╖╪º╪¿┘é ╪º┘ä╪ú╪▒╪╢┘è" : "Ground floor area"}>
          <Input
            value={db.groundFloorArea ?? ""}
            onChange={(e) => update({ groundFloorArea: e.target.value })}
            placeholder={isAr ? "┘à┬▓" : "m┬▓"}
          />
        </Field>
        <Field label={isAr ? "┘à╪│╪º╪¡╪⌐ ╪º┘ä┘à┘è╪▓╪º┘å┘è┘å" : "Mezzanine area"}>
          <Input
            value={db.mezzanineArea ?? ""}
            onChange={(e) => update({ mezzanineArea: e.target.value })}
            placeholder={isAr ? "┘à┬▓ ΓÇö ╪Ñ┘å ┘ê┘Å╪¼╪»" : "m┬▓ ΓÇö if any"}
          />
        </Field>
        <Field label={isAr ? "┘à┘é┘è╪º╪│ ╪º┘ä╪▒╪│┘à ┘à╪¬╪¡┘é┘é" : "Drawing scale verified"}>
          <NativeSelect
            value={db.drawingScaleVerified ?? "NotAvailable"}
            onChange={(v) => update({ drawingScaleVerified: v as TriYesNoNA })}
            options={["Yes", "No", "NotAvailable"] as const}
            labelOf={(v) => enumLabel(TRI_YES_NO_NA_LABELS, v, isAr ? "ar" : "en")}
          />
        </Field>
        <Field label={isAr ? "╪ú╪│┘à╪º╪í ╪º┘ä╪║╪▒┘ü ┘à╪│╪¬╪«╪▒╪¼╪⌐" : "Room names extracted"}>
          <NativeSelect
            value={db.roomNamesExtracted ?? "No"}
            onChange={(v) => update({ roomNamesExtracted: v as TriExtractStatus })}
            options={["Yes", "No", "Partial"] as const}
            labelOf={(v) => enumLabel(TRI_EXTRACT_LABELS, v, isAr ? "ar" : "en")}
          />
        </Field>
        <Field label={isAr ? "╪ú╪▒┘é╪º┘à ╪º┘ä┘à╪▒╪º╪¼╪╣╪º╪¬" : "Revision numbers"}>
          <Input
            value={db.revisionNumbers ?? ""}
            onChange={(e) => update({ revisionNumbers: e.target.value })}
            placeholder="Rev 03"
          />
        </Field>
        <Field label={isAr ? "╪¬╪º╪▒┘è╪« ╪º┘ä┘à╪«╪╖╪╖" : "Drawing date"}>
          <Input
            type="date"
            value={db.drawingDate ?? ""}
            onChange={(e) => update({ drawingDate: e.target.value })}
          />
        </Field>
      </div>
      <Field label={isAr ? "╪º┘ä┘à╪«╪╖╪╖╪º╪¬ ╪º┘ä┘å╪º┘é╪╡╪⌐" : "Missing drawings"}>
        <Textarea
          rows={2}
          value={db.missingDrawings ?? ""}
          onChange={(e) => update({ missingDrawings: e.target.value })}
          placeholder={isAr ? "┘à╪½╪º┘ä: ┘à╪«╪╖╪╖ ╪º┘ä╪Ñ┘å╪░╪º╪▒╪î ┘à┘é╪º╪╖╪╣ ╪º┘ä┘à╪»╪º╪«┘åΓÇª" : "e.g. Alarm layout, smoke vent sectionsΓÇª"}
        />
      </Field>
      <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪º╪¬" : "Notes"}>
        <Textarea
          rows={2}
          value={db.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step 4 ΓÇö Occupancy & Use
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function Step4({ value, set, isAr, errors = [] }: StepProps) {
  const o = value.occupancyBasis;
  const update = (patch: Partial<typeof o>) =>
    set("occupancyBasis", { ...o, ...patch });
  const requiredForType =
    value.reportType === "design_basis" || value.reportType === "code_requirements_plan";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={isAr ? "╪º┘ä╪Ñ╪┤╪║╪º┘ä ╪º┘ä╪ú╪│╪º╪│┘è" : "Main occupancy"} required={requiredForType}>
          <Input
            value={o.primaryOccupancy ?? ""}
            onChange={(e) => update({ primaryOccupancy: e.target.value })}
            placeholder="A-2 / Mercantile-M / I-2 ΓÇª"
          />
          <FieldErrorMsg errors={errors} path="occupancyBasis.primaryOccupancy" />
        </Field>
        <Field label={isAr ? "╪º┘ä╪ú┘å╪┤╪╖╪⌐ ╪º┘ä╪Ñ╪╢╪º┘ü┘è╪⌐" : "Additional activities"}>
          <Input
            value={o.additionalActivities ?? o.secondaryOccupancy ?? ""}
            onChange={(e) => update({ additionalActivities: e.target.value })}
            placeholder={isAr ? "┘é╪º╪ª┘à╪⌐ ┘à┘ü╪╡┘ê┘ä╪⌐ ╪¿┘ü┘ê╪º╪╡┘ä" : "Comma-separated list"}
          />
        </Field>
<Field label={isAr ? "╪¡╪º┘ä╪⌐ ╪º┘ä╪Ñ╪┤╪║╪º┘ä ╪º┘ä┘à╪«╪¬┘ä╪╖" : "Mixed occupancy status"}>
          <NativeSelect
            value={o.mixedOccupancyStatus ?? "No"}
            onChange={(v) => update({ mixedOccupancyStatus: v as TriYesNoConfirm })}
            options={["Yes", "No", "ToBeConfirmed"] as const}
            labelOf={(v) => enumLabel(TRI_YES_NO_CONFIRM_LABELS, v, isAr ? "ar" : "en")}
          />
        </Field>
        <Field label={isAr ? "┘ê╪¼┘ê╪» ┘à┘è╪▓╪º┘å┘è┘å" : "Mezzanine present"}>
          <NativeSelect
            value={o.mezzaninePresent ?? "No"}
            onChange={(v) => update({ mezzaninePresent: v as "Yes" | "No" })}
            options={["Yes", "No"] as const}
            labelOf={(v) => (isAr ? (v === "Yes" ? "┘å╪╣┘à" : "┘ä╪º") : v)}
          />
        </Field>
        <Field label={isAr ? "┘à┘å╪º╪╖┘é ╪░╪º╪¬ ╪«╪╖╪▒ ╪«╪º╪╡" : "Special hazard areas"}>
          <Input
            value={o.specialHazardAreas ?? ""}
            onChange={(e) => update({ specialHazardAreas: e.target.value })}
            placeholder={isAr ? "╪║╪▒┘ü╪⌐ ╪│┘è╪▒┘ü╪▒╪î ┘à╪╖╪¿╪« ╪╡┘å╪º╪╣┘èΓÇª" : "Server room, commercial kitchenΓÇª"}
          />
        </Field>
        <Field label={isAr ? "╪¡╪º┘ä╪⌐ ╪º┘ä╪Ñ╪┤╪║╪º┘ä ╪º┘ä┘å┘ç╪º╪ª┘è╪⌐" : "Final occupancy status"}>
          <NativeSelect
            value={o.finalOccupancyStatus ?? "Preliminary"}
            onChange={(v) => update({ finalOccupancyStatus: v as FinalOccupancyStatus })}
            options={["Confirmed", "Preliminary", "AuthorityDependent"] as const}
            labelOf={(v) => enumLabel(FINAL_OCCUPANCY_LABELS, v, isAr ? "ar" : "en")}
          />
        </Field>
        <Field label={isAr ? "┘ü╪ª╪⌐ ╪º┘ä╪«╪╖╪▒" : "Hazard category"}>
          <Input
            value={o.hazardCategory ?? ""}
            onChange={(e) => update({ hazardCategory: e.target.value })}
            placeholder="Low / Ordinary G1 / G2 / Extra"
          />
        </Field>
        <Field label={isAr ? "╪¡┘à┘ä ╪º┘ä╪Ñ╪┤╪║╪º┘ä" : "Occupant load"}>
          <TechnicalFieldInput
            value={o.occupantLoad}
            onChange={(v) => update({ occupantLoad: v })}
            placeholder={isAr ? "┘à╪½╪º┘ä: 240 ╪┤╪«╪╡╪º┘ï" : "e.g. 240 persons"}
            isAr={isAr}
          />
        </Field>
        <Field label={isAr ? "┘à╪│╪º╪¡╪º╪¬ ╪º┘ä╪╖┘ê╪º╪¿┘é" : "Floor areas"}>
          <TechnicalFieldInput
            value={o.floorAreas}
            onChange={(v) => update({ floorAreas: v })}
            placeholder={isAr ? "╪ú╪▒╪╢┘è: 1,200 ┘à┬▓╪¢ ╪ú┘ê┘ä: 900 ┘à┬▓" : "GF: 1,200 m┬▓; F1: 900 m┬▓"}
            isAr={isAr}
          />
        </Field>
        <Field label={isAr ? "╪╣╪»╪» ╪º┘ä╪╖┘ê╪º╪¿┘é ┘ü┘ê┘é ╪º┘ä╪ú╪▒╪╢" : "Stories above grade"}>
          <Input
            value={o.storiesAboveGrade ?? ""}
            onChange={(e) => update({ storiesAboveGrade: e.target.value })}
          />
        </Field>
        <Field label={isAr ? "╪╣╪»╪» ╪º┘ä╪╖┘ê╪º╪¿┘é ╪¬╪¡╪¬ ╪º┘ä╪ú╪▒╪╢" : "Stories below grade"}>
          <Input
            value={o.storiesBelowGrade ?? ""}
            onChange={(e) => update({ storiesBelowGrade: e.target.value })}
          />
        </Field>
        <Field label={isAr ? "╪º╪▒╪¬┘ü╪º╪╣ ╪º┘ä┘à╪¿┘å┘ë" : "Building height"}>
          <TechnicalFieldInput
            value={o.buildingHeight}
            onChange={(v) => update({ buildingHeight: v })}
            placeholder={isAr ? "┘à" : "metres"}
            isAr={isAr}
          />
        </Field>
      </div>
      <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪º╪¬" : "Notes"}>
        <Textarea
          rows={2}
          value={o.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step 5 ΓÇö Mandatory Safety Requirements (list editor)
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function Step5({ value, set, isAr, errors = [] }: StepProps) {
  const items = value.mandatoryRequirements;
  const update = (next: MandatoryRequirementItem[]) =>
    set("mandatoryRequirements", next);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "╪ú╪»╪«┘ä ╪º┘ä╪º╪┤╪¬╪▒╪º╪╖╪º╪¬ ╪º┘ä╪Ñ┘ä╪▓╪º┘à┘è╪⌐ ╪º┘ä┘à┘å╪╖╪¿┘é╪⌐ ╪╣┘ä┘ë ╪º┘ä┘à╪┤╪▒┘ê╪╣. ┘â┘ä ╪¿┘å╪» ┘è╪¡┘à┘ä ╪¬╪╡┘å┘è┘ü╪º┘ï ┘ê╪º╪¡╪»╪º┘ï."
            : "Add mandatory requirements applicable to this project. Each item carries one classification."}
        </p>
        <Button size="sm" variant="outline" onClick={() => update([...items, newMandatoryItem()])}>
          <Plus className="h-4 w-4" />
          {isAr ? "╪Ñ╪╢╪º┘ü╪⌐" : "Add"}
        </Button>
      </div>
      <FieldErrorMsg errors={errors} path="mandatoryRequirements" />
      {items.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          {isAr ? "┘ä╪º ╪¬┘ê╪¼╪» ╪º╪┤╪¬╪▒╪º╪╖╪º╪¬ ┘à╪╢╪º┘ü╪⌐." : "No requirements added."}
        </div>
      )}
      <div className="space-y-2">
        {items.map((it, i) => {
          const isFixed = !!it.itemKey;
          const displayName = it.itemKey
            ? mandatoryItemLabel(it.itemKey, isAr ? "ar" : "en")
            : it.requirement;
          return (
          <div key={it.id} className="rounded-md border border-border bg-card/40 p-3">
            {isFixed && (
              <div className="mb-2 text-sm font-semibold text-foreground">
                {displayName}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {!isFixed && (
                <Field label={isAr ? "╪º┘ä╪º╪┤╪¬╪▒╪º╪╖" : "Requirement"} required>
                  <Input
                    value={it.requirement}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...it, requirement: e.target.value };
                      update(next);
                    }}
                  />
                </Field>
              )}
              <Field label={isAr ? "╪º┘ä┘à╪▒╪¼╪╣" : "Reference"}>
                <Input
                  value={it.reference}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...it, reference: e.target.value };
                    update(next);
                  }}
                  placeholder="SBC 801 - 903.2.7"
                />
              </Field>
              <Field label={isAr ? "╪º┘ä╪¬╪╡┘å┘è┘ü" : "Classification"}>
                <NativeSelect
                  value={it.classification}
                  onChange={(v) => {
                    const next = [...items];
                    next[i] = { ...it, classification: v as ClassificationStatus };
                    update(next);
                  }}
                  options={CLASSIFICATION_ORDER}
                  labelOf={(v) => classificationLabel(v, isAr ? "ar" : "en")}
                />
              </Field>
              <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪⌐ ╪º┘ä╪¡╪º┘ä╪⌐" : "Status note"}>
                <Input
                  value={it.statusNote ?? ""}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...it, statusNote: e.target.value };
                    update(next);
                  }}
                />
              </Field>
              <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪º╪¬" : "Notes"}>
                <Input
                  value={it.notes ?? ""}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...it, notes: e.target.value };
                    update(next);
                  }}
                />
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => update(items.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
                {isAr ? "╪¡╪░┘ü" : "Remove"}
              </Button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step 6 ΓÇö Selected Systems (conditional details)
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function Step6({ value, set, isAr, errors = [] }: StepProps) {
  const s = value.systems;
  const update = (patch: Partial<SystemsInventory>) =>
    set("systems", { ...s, ...patch });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "╪¡╪»┘æ╪» ╪¡╪º┘ä╪⌐ ┘â┘ä ┘å╪╕╪º┘à. ╪╣┘å╪»┘à╪º ┘è┘â┘ê┘å ╪º┘ä┘å╪╕╪º┘à ╪║┘è╪▒ ┘à╪┤┘à┘ê┘ä ┘ä╪º ┘è┘Å╪╖┘ä╪¿ ╪ú┘è ╪¬┘ü╪╡┘è┘ä ╪¬┘é┘å┘è."
          : "Set status of each system. When 'Not Included', no detail field is required."}
      </p>

      <SystemRow
        label={isAr ? "┘å╪╕╪º┘à ╪Ñ┘å╪░╪º╪▒ ╪º┘ä╪¡╪▒┘è┘é" : "Fire alarm system"}
        status={s.fireAlarmSystem}
        onStatusChange={(v) => update({ fireAlarmSystem: v })}
        isAr={isAr}
      >
        <Field label={isAr ? "┘å┘ê╪╣ ┘å╪╕╪º┘à ╪º┘ä╪Ñ┘å╪░╪º╪▒" : "Fire alarm type"}>
          <TechnicalFieldInput
            value={s.fireAlarmType}
            onChange={(v) => update({ fireAlarmType: v })}
            placeholder={isAr ? "Addressable / Conventional / ┘ä┘ä╪¬┘é╪▒┘è╪▒" : "Addressable / Conventional / To be decided"}
            isAr={isAr}
          />
          <FieldErrorMsg errors={errors} path="systems.fireAlarmType" />
        </Field>
        <Field label={isAr ? "┘å╪╖╪º┘é ╪º┘ä╪¬╪║╪╖┘è╪⌐" : "Coverage"}>
          <TechnicalFieldInput
            value={s.fireAlarmCoverage}
            onChange={(v) => update({ fireAlarmCoverage: v })}
            placeholder={isAr ? "┘â╪º┘à┘ä / ╪¼╪▓╪ª┘è" : "Full / Partial"}
            isAr={isAr}
          />
        </Field>
        <Field label={isAr ? "╪¡╪º┘ä╪⌐ ┘à╪╡┘ü┘ê┘ü╪⌐ ╪º┘ä╪│╪¿╪¿ ┘ê╪º┘ä╪ú╪½╪▒" : "Cause & Effect matrix status"}>
          <TechnicalFieldInput
            value={s.fireAlarmCauseEffectStatus}
            onChange={(v) => update({ fireAlarmCauseEffectStatus: v })}
            placeholder={isAr ? "┘à┘Å┘å╪¼╪▓╪⌐ / ┘é┘è╪» ╪º┘ä╪Ñ╪╣╪»╪º╪»" : "Completed / In progress"}
            isAr={isAr}
          />
        </Field>
        <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪º╪¬" : "Notes"}>
          <Input
            value={s.fireAlarmNotes ?? ""}
            onChange={(e) => update({ fireAlarmNotes: e.target.value })}
          />
        </Field>
      </SystemRow>

      <SystemRow
        label={isAr ? "╪«╪▓╪º╪ª┘å ╪«╪▒╪º╪╖┘è┘à ╪º┘ä╪¡╪▒┘è┘é" : "Fire hose cabinets"}
        status={s.fireHoseCabinets}
        onStatusChange={(v) => update({ fireHoseCabinets: v })}
        isAr={isAr}
      >
        <Field label={isAr ? "╪º┘ä╪╣╪»╪»" : "Quantity"}>
          <TechnicalFieldInput
            value={s.fireHoseCabinetQuantity}
            onChange={(v) => update({ fireHoseCabinetQuantity: v })}
            placeholder={isAr ? "┘à╪½╪º┘ä: 3 / ┘à┘é╪»┘æ┘à ┘à┘å ╪º┘ä┘à╪│╪¬╪«╪»┘à" : "e.g. 3 / User provided"}
            isAr={isAr}
          />
          <FieldErrorMsg errors={errors} path="systems.fireHoseCabinetQuantity" />
        </Field>
        <Field label={isAr ? "╪ú╪│╪º╪│ ╪º┘ä╪¬┘ê╪▓┘è╪╣" : "Distribution basis"}>
          <TechnicalFieldInput
            value={s.fireHoseCabinetDistributionBasis}
            onChange={(v) => update({ fireHoseCabinetDistributionBasis: v })}
            placeholder={isAr ? "NFPA 14 / SBC 801" : "NFPA 14 / SBC 801"}
            isAr={isAr}
          />
        </Field>
        <Field label={isAr ? "╪¬╪¡┘é┘é ┘à╪»┘ë ╪º┘ä╪«╪▒╪╖┘ê┘à" : "Hose reach verification"}>
          <TechnicalFieldInput
            value={s.fireHoseReachVerification}
            onChange={(v) => update({ fireHoseReachVerification: v })}
            placeholder={isAr ? "┘à╪¬╪¡┘é┘é / ╪║┘è╪▒ ┘à╪¬╪¡┘é┘é" : "Verified / Not verified"}
            isAr={isAr}
          />
        </Field>
        <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪º╪¬" : "Notes"}>
          <Input
            value={s.fireHoseCabinetNotes ?? ""}
            onChange={(e) => update({ fireHoseCabinetNotes: e.target.value })}
          />
        </Field>
      </SystemRow>

      <SystemRow
        label={isAr ? "┘à╪╢╪«╪⌐ ╪º┘ä╪¡╪▒┘è┘é" : "Fire pump"}
        status={s.firePump}
        onStatusChange={(v) => update({ firePump: v })}
        isAr={isAr}
      >
        <Field label={isAr ? "┘å┘ê╪╣ ╪º┘ä┘à╪╢╪«╪⌐" : "Pump type"}>
          <TechnicalFieldInput
            value={s.firePumpType}
            onChange={(v) => update({ firePumpType: v })}
            placeholder={isAr ? "┘â┘ç╪▒╪¿╪º╪ª┘è / ╪»┘è╪▓┘ä / Jockey" : "Electric / Diesel / Jockey"}
            isAr={isAr}
          />
        </Field>
        <Field label={isAr ? "╪º┘ä╪│╪╣╪⌐" : "Capacity"}>
          <TechnicalFieldInput
            value={s.firePumpCapacity}
            onChange={(v) => update({ firePumpCapacity: v })}
            placeholder={isAr ? "120 GPM / 250ΓÇô350 GPM / ╪¿╪¡╪º╪¼╪⌐ ┘ä┘ä╪¡╪│╪º╪¿" : "120 GPM / 250ΓÇô350 GPM / To be calculated"}
            isAr={isAr}
          />
          <FieldErrorMsg errors={errors} path="systems.firePumpCapacity" />
        </Field>
        <Field label={isAr ? "╪¡╪º┘ä╪⌐ ╪º┘ä╪¡╪│╪º╪¿ ╪º┘ä┘ç┘è╪»╪▒┘ê┘ä┘è┘â┘è" : "Hydraulic calculation status"}>
          <TechnicalFieldInput
            value={s.firePumpHydraulicCalculationStatus}
            onChange={(v) => update({ firePumpHydraulicCalculationStatus: v })}
            placeholder={isAr ? "┘à┘å╪¼╪▓ / ┘é┘è╪» ╪º┘ä╪Ñ╪╣╪»╪º╪»" : "Completed / In progress"}
            isAr={isAr}
          />
        </Field>
        <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪º╪¬" : "Notes"}>
          <Input
            value={s.firePumpNotes ?? ""}
            onChange={(e) => update({ firePumpNotes: e.target.value })}
          />
        </Field>
      </SystemRow>

      <SystemRow
        label={isAr ? "╪«╪▓╪º┘å ┘à┘è╪º┘ç ╪º┘ä╪¡╪▒┘è┘é" : "Fire water tank"}
        status={s.fireWaterTank}
        onStatusChange={(v) => update({ fireWaterTank: v })}
        isAr={isAr}
      >
        <Field label={isAr ? "╪º┘ä╪│╪╣╪⌐" : "Capacity"}>
          <TechnicalFieldInput
            value={s.fireWaterTankCapacity}
            onChange={(v) => update({ fireWaterTankCapacity: v })}
            placeholder={isAr ? "27 ┘à┬│ / ╪¡╪¬┘ë 80 ┘à┬│ / ╪¿╪¡╪º╪¼╪⌐ ┘ä┘ä╪¡╪│╪º╪¿" : "27 m┬│ / up to 80 m┬│ / To be calculated"}
            isAr={isAr}
          />
          <FieldErrorMsg errors={errors} path="systems.fireWaterTankCapacity" />
        </Field>
        <Field label={isAr ? "╪ú╪│╪º╪│ ╪º┘ä╪│╪╣╪⌐" : "Tank basis"}>
          <TechnicalFieldInput
            value={s.fireWaterTankBasis}
            onChange={(v) => update({ fireWaterTankBasis: v })}
            placeholder={isAr ? "NFPA 22 / SBC 801" : "NFPA 22 / SBC 801"}
            isAr={isAr}
          />
        </Field>
        <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪º╪¬" : "Notes"}>
          <Input
            value={s.fireWaterTankNotes ?? ""}
            onChange={(e) => update({ fireWaterTankNotes: e.target.value })}
          />
        </Field>
      </SystemRow>

      <SystemRow
        label={isAr ? "┘å╪╕╪º┘à ╪º┘ä╪▒╪┤╪º╪┤╪º╪¬" : "Sprinkler system"}
        status={s.sprinklerSystem}
        onStatusChange={(v) => update({ sprinklerSystem: v })}
        isAr={isAr}
      >
        <Field label={isAr ? "╪¬╪╡┘å┘è┘ü ╪º┘ä╪«╪╖╪▒" : "Hazard classification"}>
          <TechnicalFieldInput
            value={s.sprinklerHazardClassification}
            onChange={(v) => update({ sprinklerHazardClassification: v })}
            placeholder="Light / Ord. G1 / G2 / Extra"
            isAr={isAr}
          />
          <FieldErrorMsg errors={errors} path="systems.sprinklerHazardClassification" />
        </Field>
        <Field label={isAr ? "╪¡╪º┘ä╪⌐ ╪º┘ä╪¡╪│╪º╪¿ ╪º┘ä┘ç┘è╪»╪▒┘ê┘ä┘è┘â┘è" : "Hydraulic calculation status"}>
          <TechnicalFieldInput
            value={s.sprinklerHydraulicCalculation}
            onChange={(v) => update({ sprinklerHydraulicCalculation: v })}
            placeholder={isAr ? "┘à┘Å┘å╪¼╪▓ / ┘é┘è╪» ╪º┘ä╪Ñ╪╣╪»╪º╪»" : "Completed / In progress"}
            isAr={isAr}
          />
          <FieldErrorMsg errors={errors} path="systems.sprinklerHydraulicCalculation" />
        </Field>
        <Field label={isAr ? "╪ú╪│╪º╪│ ╪º┘ä╪¬╪╡┘à┘è┘à" : "Design basis"}>
          <TechnicalFieldInput
            value={s.sprinklerDesignBasis}
            onChange={(v) => update({ sprinklerDesignBasis: v })}
            placeholder="NFPA 13 / SBC 801 ch.9"
            isAr={isAr}
          />
        </Field>
      </SystemRow>

      <SystemRow
        label={isAr ? "╪Ñ┘å╪º╪▒╪⌐ ╪º┘ä╪╖┘ê╪º╪▒╪ª" : "Emergency lighting"}
        status={s.emergencyLighting ?? "NotIncluded"}
        onStatusChange={(v) => update({ emergencyLighting: v })}
        isAr={isAr}
      />
      <SystemRow
        label={isAr ? "╪╣┘ä╪º┘à╪º╪¬ ╪º┘ä┘à╪«╪º╪▒╪¼" : "Exit signage"}
        status={s.exitSignage ?? "NotIncluded"}
        onStatusChange={(v) => update({ exitSignage: v })}
        isAr={isAr}
      />
      <SystemRow
        label={isAr ? "╪º┘ä╪¬╪¡┘â┘à ╪¿╪º┘ä╪»╪«╪º┘å" : "Smoke control"}
        status={s.smokeControl ?? "NotIncluded"}
        onStatusChange={(v) => update({ smokeControl: v })}
        isAr={isAr}
      />
      <SystemRow
        label={isAr ? "╪╖┘ü╪º┘è╪º╪¬ ╪º┘ä╪¡╪▒┘è┘é" : "Fire extinguishers"}
        status={s.fireExtinguishers ?? "NotIncluded"}
        onStatusChange={(v) => update({ fireExtinguishers: v })}
        isAr={isAr}
      >
        <Field label={isAr ? "╪¬╪╡┘å┘è┘ü ╪º┘ä╪╖┘ü╪º┘è╪º╪¬" : "Extinguisher class"}>
          <TechnicalFieldInput
            value={s.fireExtinguisherClass}
            onChange={(v) => update({ fireExtinguisherClass: v })}
            placeholder="A / B / C / D / K"
            isAr={isAr}
          />
        </Field>
      </SystemRow>
    </div>
  );
}

function SystemRow({
  label,
  status,
  onStatusChange,
  isAr,
  children,
}: {
  label: string;
  status: SystemIncludeStatus;
  onStatusChange: (v: SystemIncludeStatus) => void;
  isAr: boolean;
  children?: React.ReactNode;
}) {
  const isExpanded = status !== "NotIncluded" && !!children;
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
        <div className="text-sm font-medium pt-1">{label}</div>
        <NativeSelect
          value={status}
          onChange={onStatusChange}
          options={SYSTEM_INCLUDE_OPTIONS}
          labelOf={(v) => systemIncludeLabel(v, isAr ? "ar" : "en")}
        />
        <div className="text-[11px] text-muted-foreground pt-2">
          {status === "NotIncluded"
            ? isAr
              ? "┘ä╪º ╪¬┘ü╪º╪╡┘è┘ä ┘à╪╖┘ä┘ê╪¿╪⌐."
              : "No details required."
            : isAr
              ? "╪ú┘â┘à┘ä ╪º┘ä╪¬┘ü╪º╪╡┘è┘ä ╪ú┘ê ╪╢╪╣ '┘ê╪╢╪╣ ╪║┘è╪▒ ┘à╪╣╪▒┘ê┘ü'."
              : "Provide details or mark as a technical unknown."}
        </div>
      </div>
      {isExpanded && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border/60 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step 7 ΓÇö Report-Specific Inputs
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function Step7({ value, set, isAr, errors = [] }: StepProps) {
  const rs = value.reportSpecific;
  const update = (patch: Partial<typeof rs>) =>
    set("reportSpecific", { ...rs, ...patch });

  return (
    <div className="space-y-4">
      {value.reportType === "design_basis" && (
        <div className="space-y-3">
          <Field label={isAr ? "╪ú╪│╪º╪│ ╪º┘ä╪ú┘å╪╕┘à╪⌐ ╪º┘ä┘à╪«╪¬╪º╪▒╪⌐" : "Selected systems basis"} required>
            <Textarea
              rows={3}
              value={rs.selectedSystemsBasis ?? ""}
              onChange={(e) => update({ selectedSystemsBasis: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.selectedSystemsBasis" />
          </Field>
          <Field label={isAr ? "╪º┘ä╪º┘ü╪¬╪▒╪º╪╢╪º╪¬" : "Assumptions"} required>
            <Textarea
              rows={3}
              value={rs.assumptions ?? ""}
              onChange={(e) => update({ assumptions: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.assumptions" />
          </Field>
          <Field label={isAr ? "╪¡╪»┘ê╪» ╪º┘ä╪º╪│╪¬╪«╪»╪º┘à" : "Limitations"} required>
            <Textarea
              rows={3}
              value={rs.limitations ?? ""}
              onChange={(e) => update({ limitations: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.limitations" />
          </Field>
        </div>
      )}

      {value.reportType === "code_requirements_plan" && (
        <MissingDataEditor
          items={rs.missingDataRegister ?? []}
          onChange={(arr) => update({ missingDataRegister: arr })}
          isAr={isAr}
        />
      )}

      {value.reportType === "gap_deficiency" && (
        <GapItemsEditor
          items={rs.gapItems ?? []}
          ack={!!rs.noGapsRecordedAck}
          onChange={(arr, ack) =>
            update({ gapItems: arr, noGapsRecordedAck: ack })
          }
          isAr={isAr}
          error={errors.find((e) => e.path === "reportSpecific.gapItems")?.message}
        />
      )}

      {value.reportType === "authority_submission" && (
        <div className="space-y-3">
          <SubmissionChecklistEditor
            items={rs.submissionChecklist ?? []}
            onChange={(arr) => update({ submissionChecklist: arr })}
            isAr={isAr}
            error={errors.find((e) => e.path === "reportSpecific.submissionChecklist")?.message}
          />
          <Field label={isAr ? "╪¡╪º┘ä╪⌐ ╪º┘ä╪¼╪º┘ç╪▓┘è╪⌐ ╪º┘ä┘å┘ç╪º╪ª┘è╪⌐" : "Final readiness status"} required>
            <NativeSelect
              value={rs.finalReadinessStatus ?? "ConditionallyReady"}
              onChange={(v) => update({ finalReadinessStatus: v as FinalReadinessStatus })}
              options={["Ready", "ConditionallyReady", "NotReady"] as const}
              labelOf={(v) => enumLabel(FINAL_READINESS_LABELS, v, isAr ? "ar" : "en")}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.finalReadinessStatus" />
          </Field>
        </div>
      )}

      {value.reportType === "case_study" && (
        <div className="space-y-3">
          <Field label={isAr ? "╪º┘ä╪«┘ä┘ü┘è╪⌐" : "Background"} required>
            <Textarea
              rows={3}
              value={rs.background ?? ""}
              onChange={(e) => update({ background: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.background" />
          </Field>
          <Field label={isAr ? "╪º┘ä┘à╪│╪ú┘ä╪⌐" : "Issue"} required>
            <Textarea
              rows={3}
              value={rs.issue ?? ""}
              onChange={(e) => update({ issue: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.issue" />
          </Field>
          <Field label={isAr ? "╪º┘ä╪«┘è╪º╪▒╪º╪¬ ╪º┘ä┘à╪»╪▒┘ê╪│╪⌐" : "Options considered"} required>
            <Textarea
              rows={3}
              value={rs.optionsConsidered ?? ""}
              onChange={(e) => update({ optionsConsidered: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.optionsConsidered" />
          </Field>
          <Field label={isAr ? "╪º┘ä┘å┘ç╪¼ ╪º┘ä┘à┘ê╪╡┘ë ╪¿┘ç" : "Recommended approach"} required>
            <Textarea
              rows={3}
              value={rs.recommendedApproach ?? ""}
              onChange={(e) => update({ recommendedApproach: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.recommendedApproach" />
          </Field>
          <Field label={isAr ? "╪º┘ä┘ê╪╢╪╣ ╪º┘ä┘é╪º╪ª┘à" : "Existing condition"}>
            <Textarea
              rows={2}
              value={rs.existingCondition ?? ""}
              onChange={(e) => update({ existingCondition: e.target.value })}
            />
          </Field>
          <Field label={isAr ? "╪º┘ä┘à╪«╪º╪╖╪▒" : "Risks"}>
            <Textarea
              rows={2}
              value={rs.risks ?? ""}
              onChange={(e) => update({ risks: e.target.value })}
            />
          </Field>
          <Field label={isAr ? "╪º┘ä╪«┘ä╪º╪╡╪⌐ ╪º┘ä┘å┘ç╪º╪ª┘è╪⌐" : "Final conclusion"}>
            <Textarea
              rows={2}
              value={rs.finalConclusion ?? ""}
              onChange={(e) => update({ finalConclusion: e.target.value })}
            />
          </Field>
        </div>
      )}

      {value.reportType === "receiving_conformity" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={isAr ? "╪¬╪º╪▒┘è╪« ╪º┘ä╪¬┘ü╪¬┘è╪┤" : "Inspection date"} required>
            <Input
              type="date"
              value={rs.inspectionDate ?? ""}
              onChange={(e) => update({ inspectionDate: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.inspectionDate" />
          </Field>
          <Field label={isAr ? "╪º┘ä┘å╪╕╪º┘à ╪º┘ä┘à┘Å┘ü╪¬┘Ä┘æ╪┤" : "System inspected"} required>
            <Input
              value={rs.systemInspected ?? ""}
              onChange={(e) => update({ systemInspected: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.systemInspected" />
          </Field>
          <Field label={isAr ? "┘à╪▒╪¼╪╣ ╪º┘ä┘à╪«╪╖╪╖ ╪º┘ä┘à╪╣╪¬┘à╪»" : "Approved drawing reference"} required>
            <Input
              value={rs.approvedDrawingReference ?? ""}
              onChange={(e) => update({ approvedDrawingReference: e.target.value })}
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.approvedDrawingReference" />
          </Field>
          <Field label={isAr ? "╪¡╪º┘ä╪⌐ ╪º┘ä╪º╪│╪¬┘ä╪º┘à" : "Receiving status"} required>
            <NativeSelect
              value={(rs.receivingStatus ?? "Pending") as "Pass" | "Fail" | "Pending"}
              onChange={(v) => update({ receivingStatus: v })}
              options={["Pass", "Fail", "Pending"] as const}
              labelOf={(v) =>
                isAr
                  ? v === "Pass"
                    ? "┘å╪¼╪º╪¡"
                    : v === "Fail"
                      ? "╪Ñ╪«┘ü╪º┘é"
                      : "┘à╪╣┘ä┘æ┘é"
                  : v
              }
            />
            <FieldErrorMsg errors={errors} path="reportSpecific.receivingStatus" />
          </Field>
          <div className="sm:col-span-2">
            <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪º╪¬ ╪º┘ä┘ü╪¡╪╡" : "Observations"} required>
              <Textarea
                rows={3}
                value={rs.observations ?? ""}
                onChange={(e) => update({ observations: e.target.value })}
              />
              <FieldErrorMsg errors={errors} path="reportSpecific.observations" />
            </Field>
          </div>
          <Field label={isAr ? "╪º┘ä╪¡╪º┘ä╪⌐ ╪º┘ä┘à┘å┘ü╪░╪⌐" : "Installed condition"}>
            <Input
              value={rs.installedCondition ?? ""}
              onChange={(e) => update({ installedCondition: e.target.value })}
            />
          </Field>
          <Field label={isAr ? "╪º╪│┘à ╪º┘ä┘à┘Å┘ü╪¬╪┤" : "Inspector name"}>
            <Input
              value={rs.inspectorName ?? ""}
              onChange={(e) => update({ inspectorName: e.target.value })}
            />
          </Field>
          <Field label={isAr ? "┘à┘à╪½┘ä ╪º┘ä┘à┘é╪º┘ê┘ä" : "Contractor representative"}>
            <Input
              value={rs.contractorRepresentative ?? ""}
              onChange={(e) => update({ contractorRepresentative: e.target.value })}
            />
          </Field>
          <Field label={isAr ? "╪¡╪º┘ä╪⌐ ╪º╪╣╪¬┘à╪º╪» ╪º┘ä╪º╪│╪¬╪┤╪º╪▒┘è" : "Consultant approval status"}>
            <Input
              value={rs.consultantApprovalStatus ?? ""}
              onChange={(e) => update({ consultantApprovalStatus: e.target.value })}
              placeholder={isAr ? "┘à╪╣╪¬┘à╪» / ╪║┘è╪▒ ┘à╪╣╪¬┘à╪» / ┘à╪╣┘ä┘æ┘é" : "Approved / Rejected / Pending"}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={isAr ? "╪Ñ╪¼╪▒╪º╪í╪º╪¬ ╪¬╪╡╪¡┘è╪¡┘è╪⌐" : "Corrective actions"}>
              <Textarea
                rows={2}
                value={rs.receivingCorrectiveActions ?? ""}
                onChange={(e) => update({ receivingCorrectiveActions: e.target.value })}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function MissingDataEditor({
  items,
  onChange,
  isAr,
}: {
  items: MissingDataItem[];
  onChange: (arr: MissingDataItem[]) => void;
  isAr: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {isAr ? "╪│╪¼┘ä ╪º┘ä┘à╪╣┘ä┘ê┘à╪º╪¬ ╪º┘ä┘å╪º┘é╪╡╪⌐" : "Missing data register"}
        </h4>
        <Button size="sm" variant="outline" onClick={() => onChange([...items, newMissingDataItem()])}>
          <Plus className="h-4 w-4" />
          {isAr ? "╪Ñ╪╢╪º┘ü╪⌐" : "Add"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "╪º╪«╪¬┘è╪º╪▒┘è ┘ü┘è ╪º┘ä╪¬╪¡╪▒┘è╪▒ ╪º┘ä┘è╪»┘ê┘è ΓÇö ┘è┘à┘â┘å ┘ä┘ä╪¬┘é╪▒┘è╪▒ ╪ú┘å ┘è╪¡╪¬┘ê┘è ╪╣┘ä┘ë ┘ü╪¼┘ê╪º╪¬ ┘à╪│╪¬╪«╪▒╪¼╪⌐ ┘à┘å ╪º┘ä╪¬╪¡┘ä┘è┘ä ╪¬┘ä┘é╪º╪ª┘è┘ï╪º."
          : "Optional here ΓÇö analysis-derived gaps will also surface in the report."}
      </p>
      {items.map((it, i) => (
        <div key={it.id} className="rounded-md border border-border p-2 grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Field label={isAr ? "╪º┘ä╪¿┘å╪»" : "Item"}>
            <Input
              value={it.item}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...it, item: e.target.value };
                onChange(next);
              }}
            />
          </Field>
          <Field label={isAr ? "╪º┘ä╪ú╪½╪▒" : "Impact"}>
            <Input
              value={it.impact ?? ""}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...it, impact: e.target.value };
                onChange(next);
              }}
            />
          </Field>
          <Field label={isAr ? "╪º┘ä╪ú┘ê┘ä┘ê┘è╪⌐" : "Priority"}>
            <NativeSelect
              value={it.priority}
              onChange={(v) => {
                const next = [...items];
                next[i] = { ...it, priority: v };
                onChange(next);
              }}
              options={["critical", "high", "medium", "low"] as const}
              labelOf={(v) =>
                isAr
                  ? v === "critical"
                    ? "╪¡╪▒╪¼╪⌐"
                    : v === "high"
                      ? "╪╣╪º┘ä┘è╪⌐"
                      : v === "medium"
                        ? "┘à╪¬┘ê╪│╪╖╪⌐"
                        : "┘à┘å╪«┘ü╪╢╪⌐"
                  : v[0].toUpperCase() + v.slice(1)
              }
            />
          </Field>
          <div className="flex items-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function GapItemsEditor({
  items,
  ack,
  onChange,
  isAr,
  error,
}: {
  items: GapItem[];
  ack: boolean;
  onChange: (arr: GapItem[], ack: boolean) => void;
  isAr: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {isAr ? "╪¿┘å┘ê╪» ╪º┘ä┘ü╪¼┘ê╪º╪¬ ┘ê╪º┘ä┘é╪╡┘ê╪▒" : "Gap / deficiency items"}
        </h4>
        <Button size="sm" variant="outline" onClick={() => onChange([...items, newGapItem()], ack)}>
          <Plus className="h-4 w-4" />
          {isAr ? "╪Ñ╪╢╪º┘ü╪⌐" : "Add"}
        </Button>
      </div>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={ack}
          onCheckedChange={(c) => onChange(items, c === true)}
        />
        <span className="text-xs text-muted-foreground">
          {isAr
            ? "┘ä┘à ╪ú┘Å╪│╪¼┘æ┘ä ┘ü╪¼┘ê╪º╪¬ ┘è╪»┘ê┘è╪º┘ï ΓÇö ╪º┘â╪¬┘ü┘É ╪¿╪º┘ä┘ü╪¼┘ê╪º╪¬ ╪º┘ä┘à╪│╪¬╪«╪▒╪¼╪⌐ ┘à┘å ╪º┘ä╪¬╪¡┘ä┘è┘ä."
            : "No gaps recorded by user; analysis-derived gaps only."}
        </span>
      </label>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}
      {items.map((it, i) => (
        <div key={it.id} className="rounded-md border border-border p-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Field label={isAr ? "╪º┘ä┘ê╪╡┘ü" : "Description"}>
              <Input
                value={it.description}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...it, description: e.target.value };
                  onChange(next, ack);
                }}
              />
            </Field>
            <Field label={isAr ? "╪º┘ä┘à╪▒╪¼╪╣" : "Reference"}>
              <Input
                value={it.reference ?? ""}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...it, reference: e.target.value };
                  onChange(next, ack);
                }}
              />
            </Field>
            <Field label={isAr ? "╪º┘ä╪ú┘ê┘ä┘ê┘è╪⌐" : "Priority"}>
              <NativeSelect
                value={it.priority}
                onChange={(v) => {
                  const next = [...items];
                  next[i] = { ...it, priority: v };
                  onChange(next, ack);
                }}
                options={["critical", "high", "medium", "low"] as const}
                labelOf={(v) =>
                  isAr
                    ? v === "critical"
                      ? "╪¡╪▒╪¼╪⌐"
                      : v === "high"
                        ? "╪╣╪º┘ä┘è╪⌐"
                        : v === "medium"
                          ? "┘à╪¬┘ê╪│╪╖╪⌐"
                          : "┘à┘å╪«┘ü╪╢╪⌐"
                    : v[0].toUpperCase() + v.slice(1)
                }
              />
            </Field>
          </div>
          <Field label={isAr ? "╪º┘ä╪Ñ╪¼╪▒╪º╪í ╪º┘ä┘à┘ê╪╡┘ë ╪¿┘ç" : "Recommended action"}>
            <Input
              value={it.recommendedAction ?? ""}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...it, recommendedAction: e.target.value };
                onChange(next, ack);
              }}
            />
          </Field>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(items.filter((_, j) => j !== i), ack)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SubmissionChecklistEditor({
  items,
  onChange,
  isAr,
  error,
}: {
  items: SubmissionChecklistItem[];
  onChange: (arr: SubmissionChecklistItem[]) => void;
  isAr: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {isAr ? "┘é╪º╪ª┘à╪⌐ ╪¼╪º┘ç╪▓┘è╪⌐ ╪º┘ä╪¬┘é╪»┘è┘à" : "Submission checklist"}
        </h4>
        <Button size="sm" variant="outline" onClick={() => onChange([...items, newSubmissionChecklistItem()])}>
          <Plus className="h-4 w-4" />
          {isAr ? "╪Ñ╪╢╪º┘ü╪⌐" : "Add"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}
      {items.map((it, i) => (
        <div key={it.id} className="rounded-md border border-border p-2 grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Field label={isAr ? "╪º┘ä╪¿┘å╪»" : "Item"}>
            <Input
              value={it.item}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...it, item: e.target.value };
                onChange(next);
              }}
            />
          </Field>
          <Field label={isAr ? "╪º┘ä╪¡╪º┘ä╪⌐" : "Status"}>
            <NativeSelect
              value={it.status}
              onChange={(v) => {
                const next = [...items];
                next[i] = { ...it, status: v };
                onChange(next);
              }}
              options={["Ready", "InProgress", "Missing", "NotApplicable"] as const}
              labelOf={(v) =>
                isAr
                  ? v === "Ready"
                    ? "╪¼╪º┘ç╪▓"
                    : v === "InProgress"
                      ? "┘é┘è╪» ╪º┘ä╪Ñ╪╣╪»╪º╪»"
                      : v === "Missing"
                        ? "┘å╪º┘é╪╡"
                        : "╪║┘è╪▒ ┘à┘å╪╖╪¿┘é"
                  : v === "InProgress"
                    ? "In Progress"
                    : v === "NotApplicable"
                      ? "Not Applicable"
                      : v
              }
            />
          </Field>
          <Field label={isAr ? "┘à┘ä╪º╪¡╪╕╪º╪¬" : "Notes"}>
            <Input
              value={it.notes ?? ""}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...it, notes: e.target.value };
                onChange(next);
              }}
            />
          </Field>
          <div className="flex items-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Step 8 ΓÇö Review & Generate
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function Step8({
  value,
  isAr,
  validation,
  onJumpToStep,
}: {
  value: AnalyticalReportIntakeFormV1;
  isAr: boolean;
  validation: { ok: boolean; errors: FieldError[]; warnings: FieldError[] };
  onJumpToStep: (n: number) => void;
}) {
  const reportLabel = isAr
    ? REPORT_TYPE_CONFIGS[value.reportType].labelAr
    : REPORT_TYPE_CONFIGS[value.reportType].labelEn;
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-card/40 p-3">
        <h3 className="text-sm font-semibold mb-2">{isAr ? "┘à┘ä╪«╪╡ ╪º┘ä╪Ñ╪»╪«╪º┘ä" : "Intake summary"}</h3>
        <dl className="grid grid-cols-2 gap-1.5 text-xs">
          <dt className="text-muted-foreground">{isAr ? "┘å┘ê╪╣ ╪º┘ä╪¬┘é╪▒┘è╪▒" : "Report type"}</dt>
          <dd>{reportLabel}</dd>
          <dt className="text-muted-foreground">{isAr ? "╪º┘ä┘à╪┤╪▒┘ê╪╣" : "Project"}</dt>
          <dd>{value.projectName || "ΓÇö"}</dd>
          <dt className="text-muted-foreground">{isAr ? "╪º┘ä╪╣┘à┘è┘ä" : "Client"}</dt>
          <dd>{value.clientOwner || "ΓÇö"}</dd>
          <dt className="text-muted-foreground">{isAr ? "╪º┘ä┘à┘ê┘é╪╣" : "Location"}</dt>
          <dd>{value.projectLocation || "ΓÇö"}</dd>
          <dt className="text-muted-foreground">{isAr ? "╪Ñ╪╣╪»╪º╪»" : "Prepared by"}</dt>
          <dd>{value.preparedBy || "ΓÇö"}</dd>
          <dt className="text-muted-foreground">{isAr ? "╪º┘ä┘à╪▒╪º╪¼╪╣╪⌐" : "Revision"}</dt>
          <dd>{value.revisionNo}</dd>
          <dt className="text-muted-foreground">{isAr ? "╪º╪┤╪¬╪▒╪º╪╖╪º╪¬ ╪Ñ┘ä╪▓╪º┘à┘è╪⌐" : "Mandatory items"}</dt>
          <dd>{value.mandatoryRequirements.length}</dd>
        </dl>
      </div>

      {validation.ok ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {isAr
            ? "╪º┘ä╪º╪│╪¬┘à╪º╪▒╪⌐ ╪╡╪º┘ä╪¡╪⌐ ┘ê╪¼╪º┘ç╪▓╪⌐ ┘ä┘ä╪Ñ┘å╪┤╪º╪í."
            : "Form is valid and ready to generate."}
        </div>
      ) : (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {isAr
              ? `┘è┘ê╪¼╪» ${validation.errors.length} ╪¡┘é┘ä/╪¡┘é┘ê┘ä ┘à╪╖┘ä┘ê╪¿╪⌐ ╪║┘è╪▒ ┘à┘â╪¬┘à┘ä╪⌐`
              : `${validation.errors.length} required field(s) missing`}
          </div>
          <ul className="text-xs space-y-1">
            {validation.errors.slice(0, 10).map((e, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {isAr ? "╪º┘ä╪«╪╖┘ê╪⌐" : "Step"} {e.step}
                </Badge>
                <button
                  className="underline text-foreground hover:text-primary"
                  onClick={() => onJumpToStep(e.step)}
                >
                  {e.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
