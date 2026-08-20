/**
 * Factories that produce empty/default values for the intake form and
 * its sub-records. Used by IntakeFormWizard's initial state.
 */

import type {
  AnalyticalReportIntakeFormV1,
  DrawingBasis,
  GapItem,
  MandatoryItemKey,
  MandatoryRequirementItem,
  MissingDataItem,
  OccupancyBasis,
  ReportSpecificInputs,
  SubmissionChecklistItem,
  SystemsInventory,
} from "./intakeFormTypes";
import { MANDATORY_ITEM_KEYS } from "./intakeFormTypes";
import { MANDATORY_ITEM_LABELS_EN } from "./intakeFormLabels";
import type { ReportBranding } from "./reportArtifactTypes";

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function defaultDrawingBasis(): DrawingBasis {
  return {};
}

export function defaultOccupancyBasis(): OccupancyBasis {
  return { mixedOccupancyStatus: "No", mixedUse: false };
}

export function defaultSystemsInventory(): SystemsInventory {
  return {
    fireAlarmSystem: "NotIncluded",
    fireHoseCabinets: "NotIncluded",
    firePump: "NotIncluded",
    fireWaterTank: "NotIncluded",
    sprinklerSystem: "NotIncluded",
    emergencyLighting: "NotIncluded",
    exitSignage: "NotIncluded",
    smokeControl: "NotIncluded",
    fireExtinguishers: "NotIncluded",
    otherSystems: [],
  };
}

export function defaultReportSpecific(): ReportSpecificInputs {
  return {
    missingDataRegister: [],
    gapItems: [],
    submissionChecklist: [],
  };
}

export function newMandatoryItem(
  init?: Partial<MandatoryRequirementItem>,
): MandatoryRequirementItem {
  return {
    id: genId(),
    requirement: "",
    reference: "",
    classification: "Mandatory",
    statusNote: "",
    notes: "",
    ...init,
  };
}

/**
 * Build the canonical fixed list of 11 mandatory items (spec ┬º7).
 * Each item is pre-classified as "Mandatory"; the user adjusts the
 * classification, status note, and notes per item via the wizard.
 *
 * Uses the English label as the default `requirement` text so the
 * DOCX renders cleanly even when the user does not edit the field.
 * The Arabic localized label is applied at render time by the DOCX
 * generator and wizard based on the `itemKey`.
 */
export function seedFixedMandatoryItems(): MandatoryRequirementItem[] {
  return MANDATORY_ITEM_KEYS.map<MandatoryRequirementItem>((key: MandatoryItemKey) => ({
    id: genId(),
    itemKey: key,
    requirement: MANDATORY_ITEM_LABELS_EN[key],
    reference: "",
    classification: "Mandatory",
    statusNote: "",
    notes: "",
  }));
}

export function newMissingDataItem(
  init?: Partial<MissingDataItem>,
): MissingDataItem {
  return {
    id: genId(),
    item: "",
    impact: "",
    priority: "medium",
    ...init,
  };
}

export function newGapItem(init?: Partial<GapItem>): GapItem {
  return {
    id: genId(),
    description: "",
    reference: "",
    recommendedAction: "",
    priority: "medium",
    ...init,
  };
}

export function newSubmissionChecklistItem(
  init?: Partial<SubmissionChecklistItem>,
): SubmissionChecklistItem {
  return {
    id: genId(),
    item: "",
    status: "InProgress",
    notes: "",
    ...init,
  };
}

export function defaultIntakeForm(
  init?: Partial<AnalyticalReportIntakeFormV1>,
): AnalyticalReportIntakeFormV1 {
  const branding: ReportBranding = init?.branding ?? {
    mode: "consultx_only",
    coverPageStyle: "Professional",
  };
  return {
    schema: "analytical_report_intake_form_v1",
    reportType: init?.reportType ?? "case_study",
    language: init?.language ?? "ar",
    reportStatus: init?.reportStatus ?? "draft",
    projectName: init?.projectName ?? "",
    clientOwner: init?.clientOwner ?? "",
    projectLocation: init?.projectLocation ?? "",
    projectNumber: init?.projectNumber ?? "",
    revisionNo: init?.revisionNo ?? 1,
    reportDate: init?.reportDate ?? todayIso(),
    preparedBy: init?.preparedBy ?? "",
    reviewedBy: init?.reviewedBy ?? "",
    facilityType: init?.facilityType ?? "",
    buildingDescription: init?.buildingDescription ?? "",
    consultantName: init?.consultantName ?? "",
    authoritySubmissionBody: init?.authoritySubmissionBody ?? "",
    drawingBasis: init?.drawingBasis ?? defaultDrawingBasis(),
    occupancyBasis: init?.occupancyBasis ?? defaultOccupancyBasis(),
    mandatoryRequirements:
      init?.mandatoryRequirements ?? seedFixedMandatoryItems(),
    systems: init?.systems ?? defaultSystemsInventory(),
    reportSpecific: init?.reportSpecific ?? defaultReportSpecific(),
    branding,
  };
}

export { genId };
