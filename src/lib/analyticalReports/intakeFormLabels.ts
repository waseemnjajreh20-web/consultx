/**
 * Localized labels for the intake form vocabularies. Pure presentation
 * data ΓÇö separated from the contract so the form/DOCX/validator can all
 * share one source of truth for human-readable strings.
 */

import type {
  AreaSource,
  ClassificationStatus,
  DrawingType,
  FinalOccupancyStatus,
  FinalReadinessStatus,
  MandatoryItemKey,
  SystemIncludeStatus,
  TechnicalUnknown,
  TriExtractStatus,
  TriYesNoConfirm,
  TriYesNoNA,
} from "./intakeFormTypes";
import type { CoverPageStyle } from "./reportArtifactTypes";

export const CLASSIFICATION_LABELS_EN: Record<ClassificationStatus, string> = {
  Mandatory: "Mandatory",
  Provided: "Provided",
  Missing: "Missing",
  OwnerRequested: "Owner Requested",
  AuthorityDependent: "Authority Dependent",
  CodeRequired: "Code Required",
  CalculationRequired: "Calculation Required",
  ToBeVerified: "To Be Verified",
  NotApplicable: "Not Applicable",
  NotIncluded: "Not Included",
};

export const CLASSIFICATION_LABELS_AR: Record<ClassificationStatus, string> = {
  Mandatory: "╪Ñ┘ä╪▓╪º┘à┘è",
  Provided: "┘à╪¬┘ê┘ü╪▒",
  Missing: "┘å╪º┘é╪╡",
  OwnerRequested: "╪¿┘å╪º╪í┘ï ╪╣┘ä┘ë ╪╖┘ä╪¿ ╪º┘ä┘à╪º┘ä┘â",
  AuthorityDependent: "┘à╪¬┘ê┘é┘ü ╪╣┘ä┘ë ╪º┘ä╪¼┘ç╪⌐ ╪º┘ä┘à╪«╪¬╪╡╪⌐",
  CodeRequired: "┘à╪¬╪╖┘ä╪¿ ┘â┘ê╪»┘è",
  CalculationRequired: "┘è╪¬╪╖┘ä╪¿ ╪¡╪│╪º╪¿╪º┘ï ┘ç┘å╪»╪│┘è╪º┘ï",
  ToBeVerified: "╪¿╪¡╪º╪¼╪⌐ ┘ä┘ä╪¬╪¡┘é┘é",
  NotApplicable: "╪║┘è╪▒ ┘à┘å╪╖╪¿┘é",
  NotIncluded: "╪║┘è╪▒ ┘à╪┤┘à┘ê┘ä",
};

export const SYSTEM_INCLUDE_LABELS_EN: Record<SystemIncludeStatus, string> = {
  NotIncluded: "Not Included",
  OwnerRequested: "Owner Requested",
  AuthorityRequired: "Authority Required",
  CodeRequired: "Code Required",
  CalculationRequired: "Calculation Required",
  ToBeVerified: "To Be Verified",
  Existing: "Existing",
  New: "New",
  Selected: "Selected",
};

export const SYSTEM_INCLUDE_LABELS_AR: Record<SystemIncludeStatus, string> = {
  NotIncluded: "╪║┘è╪▒ ┘à╪┤┘à┘ê┘ä",
  OwnerRequested: "╪¿╪╖┘ä╪¿ ╪º┘ä┘à╪º┘ä┘â",
  AuthorityRequired: "╪¿╪╖┘ä╪¿ ╪º┘ä╪¼┘ç╪⌐ ╪º┘ä┘à╪«╪¬╪╡╪⌐",
  CodeRequired: "┘à╪¬╪╖┘ä╪¿ ┘â┘ê╪»┘è",
  CalculationRequired: "┘è╪¬╪╖┘ä╪¿ ╪¡╪│╪º╪¿╪º┘ï ┘ç┘å╪»╪│┘è╪º┘ï",
  ToBeVerified: "╪¿╪¡╪º╪¼╪⌐ ┘ä┘ä╪¬╪¡┘é┘é",
  Existing: "┘é╪º╪ª┘à",
  New: "╪¼╪»┘è╪»",
  Selected: "┘à╪«╪¬╪º╪▒",
};

export const TECHNICAL_UNKNOWN_LABELS_EN: Record<TechnicalUnknown, string> = {
  ToBeVerified: "To be verified",
  ToBeCalculated: "To be calculated",
  AuthorityDependent: "Authority dependent",
  NotApplicable: "Not applicable",
  NotProvided: "Not provided",
};

export const TECHNICAL_UNKNOWN_LABELS_AR: Record<TechnicalUnknown, string> = {
  ToBeVerified: "╪¿╪¡╪º╪¼╪⌐ ┘ä┘ä╪¬╪¡┘é┘é",
  ToBeCalculated: "╪¿╪¡╪º╪¼╪⌐ ┘ä┘ä╪¡╪│╪º╪¿",
  AuthorityDependent: "┘à╪¬┘ê┘é┘ü ╪╣┘ä┘ë ╪º┘ä╪¼┘ç╪⌐ ╪º┘ä┘à╪«╪¬╪╡╪⌐",
  NotApplicable: "╪║┘è╪▒ ┘à┘å╪╖╪¿┘é",
  NotProvided: "╪║┘è╪▒ ┘à┘é╪»┘æ┘à",
};

export function classificationLabel(
  c: ClassificationStatus,
  lang: "ar" | "en",
): string {
  return lang === "en" ? CLASSIFICATION_LABELS_EN[c] : CLASSIFICATION_LABELS_AR[c];
}

export function systemIncludeLabel(
  s: SystemIncludeStatus,
  lang: "ar" | "en",
): string {
  return lang === "en" ? SYSTEM_INCLUDE_LABELS_EN[s] : SYSTEM_INCLUDE_LABELS_AR[s];
}

export function technicalUnknownLabel(
  u: TechnicalUnknown,
  lang: "ar" | "en",
): string {
  return lang === "en"
    ? TECHNICAL_UNKNOWN_LABELS_EN[u]
    : TECHNICAL_UNKNOWN_LABELS_AR[u];
}

export function technicalUnknownLabels(
  lang: "ar" | "en",
): Record<TechnicalUnknown, string> {
  return lang === "en"
    ? TECHNICAL_UNKNOWN_LABELS_EN
    : TECHNICAL_UNKNOWN_LABELS_AR;
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Fixed mandatory item labels (spec ┬º7)
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export const MANDATORY_ITEM_LABELS_EN: Record<MandatoryItemKey, string> = {
  portableFireExtinguishers: "Portable Fire Extinguishers",
  emergencyLighting: "Emergency Lighting",
  exitSigns: "Exit Signs",
  directionalExitSigns: "Directional Exit Signs",
  groundFloorEmergencyExit: "Ground Floor Emergency Exit",
  mezzanineExternalStair: "Mezzanine External Stair",
  meansOfEgressReview: "Means of Egress Review",
  occupantLoadCalculation: "Occupant Load Calculation",
  travelDistanceReview: "Travel Distance Review",
  exitWidthDoorSwingReview: "Exit Width / Door Swing Review",
  commonPathDeadEndCorridorReview: "Common Path / Dead-End Corridor Review",
};

export const MANDATORY_ITEM_LABELS_AR: Record<MandatoryItemKey, string> = {
  portableFireExtinguishers: "╪╖┘ü╪º┘è╪º╪¬ ╪º┘ä╪¡╪▒┘è┘é ╪º┘ä┘à╪¡┘à┘ê┘ä╪⌐",
  emergencyLighting: "╪Ñ┘å╪º╪▒╪⌐ ╪º┘ä╪╖┘ê╪º╪▒╪ª",
  exitSigns: "╪╣┘ä╪º┘à╪º╪¬ ╪º┘ä┘à╪«╪º╪▒╪¼",
  directionalExitSigns: "╪╣┘ä╪º┘à╪º╪¬ ╪º┘ä╪º╪¬╪¼╪º┘ç ┘ä┘ä┘à╪«╪º╪▒╪¼",
  groundFloorEmergencyExit: "┘à╪«╪▒╪¼ ╪º┘ä╪╖┘ê╪º╪▒╪ª ╪¿╪º┘ä╪╖╪º╪¿┘é ╪º┘ä╪ú╪▒╪╢┘è",
  mezzanineExternalStair: "╪º┘ä╪│┘ä┘à ╪º┘ä╪«╪º╪▒╪¼┘è ┘ä┘ä┘à┘è╪▓╪º┘å┘è┘å",
  meansOfEgressReview: "┘à╪▒╪º╪¼╪╣╪⌐ ┘ê╪│╪º╪ª┘ä ╪º┘ä┘ç╪▒┘ê╪¿",
  occupantLoadCalculation: "╪¡╪│╪º╪¿ ╪¡┘à┘ä ╪º┘ä╪Ñ╪┤╪║╪º┘ä",
  travelDistanceReview: "┘à╪▒╪º╪¼╪╣╪⌐ ┘à╪│╪º┘ü╪⌐ ╪º┘ä╪│┘ü╪▒",
  exitWidthDoorSwingReview: "┘à╪▒╪º╪¼╪╣╪⌐ ╪╣╪▒╪╢ ╪º┘ä┘à╪«╪º╪▒╪¼ ┘ê╪º╪¬╪¼╪º┘ç ┘ü╪¬╪¡ ╪º┘ä╪ú╪¿┘ê╪º╪¿",
  commonPathDeadEndCorridorReview: "┘à╪▒╪º╪¼╪╣╪⌐ ╪º┘ä┘à╪│╪º╪▒╪º╪¬ ╪º┘ä┘à╪┤╪¬╪▒┘â╪⌐ ┘ê╪º┘ä┘à┘à╪▒╪º╪¬ ╪º┘ä┘à╪║┘ä┘é╪⌐",
};

export function mandatoryItemLabel(
  k: MandatoryItemKey,
  lang: "ar" | "en",
): string {
  return lang === "en"
    ? MANDATORY_ITEM_LABELS_EN[k]
    : MANDATORY_ITEM_LABELS_AR[k];
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Misc small enum labels ΓÇö drawing/occupancy/readiness/cover style
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export const DRAWING_TYPE_LABELS: Record<DrawingType, { ar: string; en: string }> = {
  PDF: { ar: "PDF", en: "PDF" },
  CAD: { ar: "CAD", en: "CAD" },
  DXF: { ar: "DXF", en: "DXF" },
  DWG: { ar: "DWG", en: "DWG" },
  Mixed: { ar: "┘à╪«╪¬┘ä╪╖", en: "Mixed" },
};

export const AREA_SOURCE_LABELS: Record<AreaSource, { ar: string; en: string }> = {
  CADMeasured: { ar: "┘à┘é╪º╪│╪⌐ ┘à┘å CAD", en: "CAD measured" },
  PDFEstimated: { ar: "╪¬┘é╪»┘è╪▒ ┘à┘å PDF", en: "PDF estimated" },
  UserProvided: { ar: "┘à┘é╪»┘æ┘à╪⌐ ┘à┘å ╪º┘ä┘à╪│╪¬╪«╪»┘à", en: "User provided" },
  Unknown: { ar: "╪║┘è╪▒ ┘à╪╣╪▒┘ê┘ü", en: "Unknown" },
};

export const TRI_YES_NO_NA_LABELS: Record<TriYesNoNA, { ar: string; en: string }> = {
  Yes: { ar: "┘å╪╣┘à", en: "Yes" },
  No: { ar: "┘ä╪º", en: "No" },
  NotAvailable: { ar: "╪║┘è╪▒ ┘à╪¬╪º╪¡", en: "Not Available" },
};

export const TRI_EXTRACT_LABELS: Record<TriExtractStatus, { ar: string; en: string }> = {
  Yes: { ar: "┘å╪╣┘à", en: "Yes" },
  No: { ar: "┘ä╪º", en: "No" },
  Partial: { ar: "╪¼╪▓╪ª┘è", en: "Partial" },
};

export const TRI_YES_NO_CONFIRM_LABELS: Record<TriYesNoConfirm, { ar: string; en: string }> = {
  Yes: { ar: "┘å╪╣┘à", en: "Yes" },
  No: { ar: "┘ä╪º", en: "No" },
  ToBeConfirmed: { ar: "╪¿╪¡╪º╪¼╪⌐ ┘ä┘ä╪¬╪ú┘â┘è╪»", en: "To be confirmed" },
};

export const FINAL_OCCUPANCY_LABELS: Record<FinalOccupancyStatus, { ar: string; en: string }> = {
  Confirmed: { ar: "┘à╪ñ┘â╪»", en: "Confirmed" },
  Preliminary: { ar: "┘à╪¿╪»╪ª┘è", en: "Preliminary" },
  AuthorityDependent: { ar: "┘à╪¬┘ê┘é┘ü ╪╣┘ä┘ë ╪º┘ä╪¼┘ç╪⌐ ╪º┘ä┘à╪«╪¬╪╡╪⌐", en: "Authority-dependent" },
};

export const FINAL_READINESS_LABELS: Record<FinalReadinessStatus, { ar: string; en: string }> = {
  Ready: { ar: "╪¼╪º┘ç╪▓", en: "Ready" },
  ConditionallyReady: { ar: "╪¼╪º┘ç╪▓ ┘à╪┤╪▒┘ê╪╖", en: "Conditionally Ready" },
  NotReady: { ar: "╪║┘è╪▒ ╪¼╪º┘ç╪▓", en: "Not Ready" },
};

export const COVER_STYLE_LABELS: Record<CoverPageStyle, { ar: string; en: string }> = {
  Professional: { ar: "╪º╪¡╪¬╪▒╪º┘ü┘è", en: "Professional" },
  Authority: { ar: "┘ä┘ä╪¼┘ç╪º╪¬ ╪º┘ä┘à╪«╪¬╪╡╪⌐", en: "Authority" },
  Internal: { ar: "╪»╪º╪«┘ä┘è", en: "Internal" },
};

export function enumLabel<T extends string>(
  map: Record<T, { ar: string; en: string }>,
  v: T,
  lang: "ar" | "en",
): string {
  return map[v]?.[lang] ?? String(v);
}
