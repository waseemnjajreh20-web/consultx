/**
 * analytical_report_intake_form_v1
 *
 * Frontend data contract for the structured intake form that drives the
 * Analytical Mode Phase 1 DOCX report.
 *
 * The form is split into 8 wizard steps but lives as one flat object so
 * validation, persistence, and DOCX rendering can address fields by a
 * single dotted key.
 *
 * Design notes:
 *  - Classification is FIRST-CLASS: every fire/life-safety item carries
 *    one of 10 classification statuses. The DOCX generator separates
 *    items into matrices by classification.
 *  - System inclusion uses `SystemIncludeStatus` ΓÇö the conditional rules
 *    in validateIntakeForm.ts depend on this enum.
 *  - Technical-unknown fields are NEVER blanket-required. Users may
 *    explicitly mark them via `TechnicalUnknown` placeholders, which the
 *    DOCX surfaces in the "Missing Data / To Be Verified Register"
 *    instead of blocking generation.
 *  - Administrative required fields ARE blocking ΓÇö they are listed in
 *    GLOBAL_ADMIN_REQUIRED below.
 */

import type {
  ReportLanguage,
  ReportStatus,
  ReportType,
  ReportBranding,
} from "./reportArtifactTypes";

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Classification ΓÇö applied per fire/life-safety requirement item
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export type ClassificationStatus =
  | "Mandatory"
  | "Provided"
  | "Missing"
  | "OwnerRequested"
  | "AuthorityDependent"
  | "CodeRequired"
  | "CalculationRequired"
  | "ToBeVerified"
  | "NotApplicable"
  | "NotIncluded";

export const CLASSIFICATION_ORDER: ClassificationStatus[] = [
  "Mandatory",
  "Provided",
  "CodeRequired",
  "AuthorityDependent",
  "CalculationRequired",
  "ToBeVerified",
  "OwnerRequested",
  "Missing",
  "NotApplicable",
  "NotIncluded",
];

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// System include status ΓÇö drives conditional system rules
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export type SystemIncludeStatus =
  | "NotIncluded"
  | "OwnerRequested"
  | "AuthorityRequired"
  | "CodeRequired"
  | "CalculationRequired"
  | "ToBeVerified"
  | "Existing"
  | "New"
  | "Selected";

export const SYSTEM_INCLUDE_OPTIONS: SystemIncludeStatus[] = [
  "NotIncluded",
  "OwnerRequested",
  "AuthorityRequired",
  "CodeRequired",
  "CalculationRequired",
  "ToBeVerified",
  "Existing",
  "New",
  "Selected",
];

/**
 * Statuses that REQUIRE the system to be inventoried (with a technical
 * field present). When system status is in this set, the conditional
 * validator demands the corresponding detail field ΓÇö but it accepts a
 * TechnicalUnknown placeholder, never blocking on a technical unknown.
 *
 * Note: CalculationRequired and ToBeVerified are themselves explicit
 * unknown-style markers, so they do NOT require detail fields.
 */
export const SYSTEM_REQUIRES_DETAIL: SystemIncludeStatus[] = [
  "OwnerRequested",
  "AuthorityRequired",
  "CodeRequired",
  "Existing",
  "New",
  "Selected",
];

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Technical-unknown placeholders ΓÇö non-blocking
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export type TechnicalUnknown =
  | "ToBeVerified"
  | "ToBeCalculated"
  | "AuthorityDependent"
  | "NotApplicable"
  | "NotProvided";

export const TECHNICAL_UNKNOWN_OPTIONS: TechnicalUnknown[] = [
  "ToBeVerified",
  "ToBeCalculated",
  "AuthorityDependent",
  "NotApplicable",
  "NotProvided",
];

/** Field value that is either a concrete user string or an explicit unknown placeholder. */
export type TechnicalField =
  | { kind: "value"; value: string }
  | { kind: "unknown"; placeholder: TechnicalUnknown };

export function tfValue(value: string): TechnicalField {
  return { kind: "value", value };
}

export function tfUnknown(placeholder: TechnicalUnknown): TechnicalField {
  return { kind: "unknown", placeholder };
}

/** Returns true if the technical field has a non-empty resolved value. */
export function tfHasValue(t: TechnicalField | undefined): boolean {
  if (!t) return false;
  if (t.kind === "value") return t.value.trim().length > 0;
  return true; // unknown placeholders count as filled (explicitly marked)
}

/** Convert a technical field to a human-readable cell string. */
export function tfDisplay(
  t: TechnicalField | undefined,
  unknownLabels: Record<TechnicalUnknown, string>,
): string {
  if (!t) return "";
  if (t.kind === "value") return t.value;
  return unknownLabels[t.placeholder];
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Sub-records
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export type DrawingType = "PDF" | "CAD" | "DXF" | "DWG" | "Mixed";

export type AreaSource =
  | "CADMeasured"
  | "PDFEstimated"
  | "UserProvided"
  | "Unknown";

export type TriYesNoNA = "Yes" | "No" | "NotAvailable";
export type TriExtractStatus = "Yes" | "No" | "Partial";

export interface DrawingBasis {
  documents?: string;                 // list of drawings reviewed (free text or csv)
  drawingType?: DrawingType;
  floorsReviewed?: string;            // CSV / free-text list of floors
  areaSource?: AreaSource;
  groundFloorArea?: string;
  mezzanineArea?: string;
  drawingScaleVerified?: TriYesNoNA;
  roomNamesExtracted?: TriExtractStatus;
  missingDrawings?: string;           // CSV / free-text list
  revisionNumbers?: string;
  drawingDate?: string;               // ISO date
  notes?: string;
}

export type TriYesNoConfirm = "Yes" | "No" | "ToBeConfirmed";
export type FinalOccupancyStatus =
  | "Confirmed"
  | "Preliminary"
  | "AuthorityDependent";

export interface OccupancyBasis {
  primaryOccupancy?: string;          // e.g. "A-2 / Assembly"
  additionalActivities?: string;      // CSV / free-text list
  secondaryOccupancy?: string;        // kept for backward-compat with Phase 1.1 v1
  mixedOccupancyStatus?: TriYesNoConfirm;
  mezzaninePresent?: "Yes" | "No";
  specialHazardAreas?: string;
  finalOccupancyStatus?: FinalOccupancyStatus;
  /** Deprecated: kept for backward compat with the boolean field used in Phase 1.1 v1. */
  mixedUse?: boolean;
  occupantLoad?: TechnicalField;
  floorAreas?: TechnicalField;        // e.g. "GF: 1,200 m┬▓; F1: 900 m┬▓"
  storiesAboveGrade?: string;
  storiesBelowGrade?: string;
  buildingHeight?: TechnicalField;    // metric
  hazardCategory?: string;            // Low / Ordinary G1 / G2 / Extra
  notes?: string;
}

/**
 * Canonical fixed list of fire & life-safety items per the Phase 1.1
 * spec ┬º7. The wizard pre-seeds these 11 items so every report covers
 * the same scope. Engineers may still add custom items via the wizard.
 */
export const MANDATORY_ITEM_KEYS = [
  "portableFireExtinguishers",
  "emergencyLighting",
  "exitSigns",
  "directionalExitSigns",
  "groundFloorEmergencyExit",
  "mezzanineExternalStair",
  "meansOfEgressReview",
  "occupantLoadCalculation",
  "travelDistanceReview",
  "exitWidthDoorSwingReview",
  "commonPathDeadEndCorridorReview",
] as const;

export type MandatoryItemKey = (typeof MANDATORY_ITEM_KEYS)[number];

export interface MandatoryRequirementItem {
  id: string;
  /** When set, this item is one of the canonical fixed-list items. */
  itemKey?: MandatoryItemKey;
  requirement: string;             // human-readable
  reference: string;               // code section
  classification: ClassificationStatus;
  statusNote?: string;             // free-text status
  notes?: string;
}

export interface SystemsInventory {
  // Fire alarm
  fireAlarmSystem: SystemIncludeStatus;
  fireAlarmType?: TechnicalField;
  fireAlarmCoverage?: TechnicalField;
  fireAlarmCauseEffectStatus?: TechnicalField;
  fireAlarmNotes?: string;

  // Fire hose cabinets
  fireHoseCabinets: SystemIncludeStatus;
  fireHoseCabinetQuantity?: TechnicalField;
  fireHoseCabinetDistributionBasis?: TechnicalField;
  fireHoseReachVerification?: TechnicalField;
  fireHoseCabinetNotes?: string;

  // Fire pump
  firePump: SystemIncludeStatus;
  firePumpType?: TechnicalField;
  firePumpCapacity?: TechnicalField;
  firePumpHydraulicCalculationStatus?: TechnicalField;
  firePumpNotes?: string;

  // Fire water tank
  fireWaterTank: SystemIncludeStatus;
  fireWaterTankCapacity?: TechnicalField;
  fireWaterTankBasis?: TechnicalField;
  fireWaterTankNotes?: string;

  // Sprinklers
  sprinklerSystem: SystemIncludeStatus;
  sprinklerHazardClassification?: TechnicalField;
  sprinklerHydraulicCalculation?: TechnicalField;
  sprinklerDesignBasis?: TechnicalField;
  sprinklerNotes?: string;

  // Secondary systems
  emergencyLighting?: SystemIncludeStatus;
  emergencyLightingNotes?: string;
  exitSignage?: SystemIncludeStatus;
  exitSignageNotes?: string;
  smokeControl?: SystemIncludeStatus;
  smokeControlNotes?: string;
  fireExtinguishers?: SystemIncludeStatus;
  fireExtinguisherClass?: TechnicalField;
  fireExtinguisherNotes?: string;

  otherSystems?: Array<{
    id: string;
    name: string;
    status: SystemIncludeStatus;
    notes?: string;
  }>;
}

export interface MissingDataItem {
  id: string;
  item: string;
  impact?: string;
  priority: "critical" | "high" | "medium" | "low";
}

export interface GapItem {
  id: string;
  description: string;
  reference?: string;
  recommendedAction?: string;
  priority: "critical" | "high" | "medium" | "low";
}

export interface SubmissionChecklistItem {
  id: string;
  item: string;
  status: "Ready" | "InProgress" | "Missing" | "NotApplicable";
  notes?: string;
}

export type FinalReadinessStatus = "Ready" | "ConditionallyReady" | "NotReady";

export interface ReportSpecificInputs {
  // ΓöÇΓöÇ A. Design Basis ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  designAssumptions?: string;          // dedicated assumptions field per spec
  selectedSystemsBasis?: string;
  assumptions?: string;                // legacy alias for designAssumptions
  limitations?: string;
  mandatoryRequirementsSummary?: string;
  optionalSystemsSummary?: string;

  // ΓöÇΓöÇ B. Code Requirements & Plan Analysis ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  codeBasis?: string;
  drawingList?: string;
  extractedRoomNames?: string;
  areaScheduleStatus?: string;
  occupancyAnalysis?: string;
  requiredSystems?: string;
  missingSystems?: string;
  complianceMatrixNote?: string;
  correctiveActions?: string;
  missingDataRegister?: MissingDataItem[];

  // ΓöÇΓöÇ C. Gap & Deficiency ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  gapItems?: GapItem[];
  /** Explicit acknowledgement that user did not record gaps (analysis-derived only). */
  noGapsRecordedAck?: boolean;

  // ΓöÇΓöÇ D. Authority Submission Readiness ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  submissionChecklist?: SubmissionChecklistItem[];
  finalReadinessStatus?: FinalReadinessStatus;

  // ΓöÇΓöÇ E. Case Study ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  background?: string;
  existingCondition?: string;
  issue?: string;
  optionsConsidered?: string;
  recommendedApproach?: string;
  risks?: string;
  finalConclusion?: string;

  // ΓöÇΓöÇ F. Receiving & Conformity ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  inspectionDate?: string;
  systemInspected?: string;
  approvedDrawingReference?: string;
  installedCondition?: string;
  receivingStatus?: "Pass" | "Fail" | "Pending";
  observations?: string;
  receivingCorrectiveActions?: string;
  inspectorName?: string;
  contractorRepresentative?: string;
  consultantApprovalStatus?: string;
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Top-level intake form contract
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export interface AnalyticalReportIntakeFormV1 {
  schema: "analytical_report_intake_form_v1";

  // Step 1 ΓÇö Report Type & Output
  reportType: ReportType;
  language: ReportLanguage;
  reportStatus: ReportStatus;

  // Step 2 ΓÇö Project Information
  // Required (admin):
  projectName: string;
  clientOwner: string;
  projectLocation: string;
  revisionNo: number;
  reportDate: string;          // ISO date
  preparedBy: string;
  // Optional / conditional:
  projectNumber?: string;
  reviewedBy?: string;
  facilityType?: string;            // e.g. "Restaurant", "Warehouse" ΓÇö conditional
  buildingDescription?: string;     // free-text
  consultantName?: string;
  authoritySubmissionBody?: string;

  // Step 3 ΓÇö Building & Drawing Basis
  drawingBasis: DrawingBasis;

  // Step 4 ΓÇö Occupancy & Use
  occupancyBasis: OccupancyBasis;

  // Step 5 ΓÇö Mandatory Safety Requirements (free list)
  mandatoryRequirements: MandatoryRequirementItem[];

  // Step 6 ΓÇö Optional / Selected Systems
  systems: SystemsInventory;

  // Step 7 ΓÇö Report-Specific Inputs
  reportSpecific: ReportSpecificInputs;

  // Branding (carried into the artifact; not validated here)
  branding: ReportBranding;
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Global administrative required fields ΓÇö blocking
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

/**
 * The administrative fields that MUST be filled before DOCX generation.
 * These are blocked-on-missing ΓÇö see validateIntakeForm.ts.
 *
 * Technical / engineering fields are NOT in this list ΓÇö those are
 * conditionally required per the report-type and system-inclusion rules.
 */
export const GLOBAL_ADMIN_REQUIRED: Array<keyof AnalyticalReportIntakeFormV1> = [
  "projectName",
  "clientOwner",
  "projectLocation",
  "reportType",
  "language",
  "reportStatus",
  "revisionNo",
  "reportDate",
  "preparedBy",
];
