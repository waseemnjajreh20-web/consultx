/**
 * Conditional validation engine for analytical_report_intake_form_v1.
 *
 * RULES (per Phase 1.1 brief):
 *
 *  1. Global administrative fields are ALWAYS required (blocking):
 *     projectName, clientOwner, projectLocation, reportType, language,
 *     reportStatus, revisionNo, reportDate, preparedBy.
 *
 *  2. Report-type conditional requirements (blocking):
 *     - design_basis            ΓåÆ drawingBasis, occupancyBasis, selectedSystemsBasis, assumptions, limitations
 *     - code_requirements_plan  ΓåÆ drawingBasis, occupancyBasis, mandatoryRequirements ΓëÑ 1, missingDataRegister ΓëÑ 0 (entries optional but the register itself must exist ΓÇö array always present from defaults)
 *     - gap_deficiency          ΓåÆ gapItems ΓëÑ 1  OR  noGapsRecordedAck === true
 *     - authority_submission    ΓåÆ submissionChecklist ΓëÑ 1
 *     - case_study              ΓåÆ background, issue, optionsConsidered, recommendedApproach
 *     - receiving_conformity    ΓåÆ inspectionDate, systemInspected, approvedDrawingReference, receivingStatus, observations
 *
 *  3. System conditional requirements:
 *     If a system status is in SYSTEM_REQUIRES_DETAIL, then the
 *     corresponding detail field MUST be filled ΓÇö but a TechnicalUnknown
 *     placeholder counts as filled. If status is "NotIncluded", no
 *     detail field is required.
 *
 *  4. Technical unknowns NEVER block. They are aggregated into the
 *     "Missing Data / To Be Verified Register" by the DOCX generator,
 *     not blocked by the validator.
 *
 *  5. Administrative missing fields DO block.
 */

import type {
  AnalyticalReportIntakeFormV1,
  TechnicalField,
} from "./intakeFormTypes";
import { tfHasValue } from "./intakeFormTypes";

export interface FieldError {
  /** Dotted key into the form (e.g. "systems.firePumpCapacity"). */
  path: string;
  /** Step number (1-8) the field lives in ΓÇö drives navigation in the wizard. */
  step: number;
  /** Human-readable error message (English; the wizard maps to AR if needed). */
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: FieldError[];
  warnings: FieldError[];
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Helpers
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function fieldFilled(t: TechnicalField | undefined): boolean {
  return tfHasValue(t);
}

function err(path: string, step: number, message: string): FieldError {
  return { path, step, message };
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Top-level validator
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export function validateIntakeForm(
  form: AnalyticalReportIntakeFormV1,
): ValidationResult {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];

  // ΓöÇΓöÇ Step 1 & 2 ΓÇö global admin required fields ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  if (!isNonEmptyString(form.projectName)) {
    errors.push(err("projectName", 2, "Project name is required"));
  }
  if (!isNonEmptyString(form.clientOwner)) {
    errors.push(err("clientOwner", 2, "Client / owner is required"));
  }
  if (!isNonEmptyString(form.projectLocation)) {
    errors.push(err("projectLocation", 2, "Project location is required"));
  }
  if (!isNonEmptyString(form.preparedBy)) {
    errors.push(err("preparedBy", 2, "Prepared by is required"));
  }
  if (!form.reportType) {
    errors.push(err("reportType", 1, "Report type is required"));
  }
  if (!form.language) {
    errors.push(err("language", 1, "Report language is required"));
  }
  if (!form.reportStatus) {
    errors.push(err("reportStatus", 1, "Report status is required"));
  }
  if (!Number.isFinite(form.revisionNo) || form.revisionNo < 1) {
    errors.push(err("revisionNo", 2, "Revision number must be ΓëÑ 1"));
  }
  if (!isNonEmptyString(form.reportDate)) {
    errors.push(err("reportDate", 2, "Report date is required"));
  }

  // ΓöÇΓöÇ Step 6 ΓÇö system conditional requirements ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const s = form.systems;
  /**
   * A system "needs" detail when its inclusion status is one that
   * commits to including the system. CalculationRequired / ToBeVerified
   * are themselves explicit-unknown placeholders and do NOT require
   * detail fields. NotIncluded never requires detail.
   */
  const needs = (status: typeof s.fireAlarmSystem): boolean =>
    status !== "NotIncluded" &&
    status !== "CalculationRequired" &&
    status !== "ToBeVerified";

  if (needs(s.fireAlarmSystem) && !fieldFilled(s.fireAlarmType)) {
    errors.push(
      err(
        "systems.fireAlarmType",
        6,
        "Fire alarm type is required when the fire alarm system is included (or mark as a technical unknown).",
      ),
    );
  }
  if (needs(s.fireHoseCabinets) && !fieldFilled(s.fireHoseCabinetQuantity)) {
    errors.push(
      err(
        "systems.fireHoseCabinetQuantity",
        6,
        "Fire hose cabinet quantity is required (or mark as a technical unknown).",
      ),
    );
  }
  if (needs(s.firePump) && !fieldFilled(s.firePumpCapacity)) {
    errors.push(
      err(
        "systems.firePumpCapacity",
        6,
        "Fire pump capacity is required (or mark as a technical unknown).",
      ),
    );
  }
  if (needs(s.fireWaterTank) && !fieldFilled(s.fireWaterTankCapacity)) {
    errors.push(
      err(
        "systems.fireWaterTankCapacity",
        6,
        "Fire water tank capacity is required (or mark as a technical unknown).",
      ),
    );
  }
  if (needs(s.sprinklerSystem)) {
    if (!fieldFilled(s.sprinklerHazardClassification)) {
      errors.push(
        err(
          "systems.sprinklerHazardClassification",
          6,
          "Sprinkler hazard classification is required (or mark as a technical unknown).",
        ),
      );
    }
    if (!fieldFilled(s.sprinklerHydraulicCalculation)) {
      errors.push(
        err(
          "systems.sprinklerHydraulicCalculation",
          6,
          "Sprinkler hydraulic calculation status is required (or mark as a technical unknown).",
        ),
      );
    }
  }
  if (
    s.fireExtinguishers &&
    s.fireExtinguishers !== "NotIncluded" &&
    !fieldFilled(s.fireExtinguisherClass)
  ) {
    warnings.push(
      err(
        "systems.fireExtinguisherClass",
        6,
        "Consider specifying extinguisher class (A/B/C/D/K) or a technical unknown placeholder.",
      ),
    );
  }

  // ΓöÇΓöÇ Step 7 ΓÇö report-type conditional requirements ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const rs = form.reportSpecific;
  switch (form.reportType) {
    case "design_basis": {
      // Drawing basis: documents
      if (!isNonEmptyString(form.drawingBasis.documents)) {
        errors.push(
          err(
            "drawingBasis.documents",
            3,
            "Drawing basis (documents reviewed) is required for the Design Basis Report.",
          ),
        );
      }
      // Occupancy basis: primaryOccupancy
      if (!isNonEmptyString(form.occupancyBasis.primaryOccupancy)) {
        errors.push(
          err(
            "occupancyBasis.primaryOccupancy",
            4,
            "Primary occupancy is required for the Design Basis Report.",
          ),
        );
      }
      // Selected systems basis text
      if (!isNonEmptyString(rs.selectedSystemsBasis)) {
        errors.push(
          err(
            "reportSpecific.selectedSystemsBasis",
            7,
            "Selected systems basis is required for the Design Basis Report.",
          ),
        );
      }
      if (!isNonEmptyString(rs.assumptions)) {
        errors.push(
          err(
            "reportSpecific.assumptions",
            7,
            "Assumptions section is required for the Design Basis Report.",
          ),
        );
      }
      if (!isNonEmptyString(rs.limitations)) {
        errors.push(
          err(
            "reportSpecific.limitations",
            7,
            "Limitations section is required for the Design Basis Report.",
          ),
        );
      }
      break;
    }
    case "code_requirements_plan": {
      if (!isNonEmptyString(form.drawingBasis.documents)) {
        errors.push(
          err(
            "drawingBasis.documents",
            3,
            "Drawing basis is required for the Code Requirements & Plan Analysis Report.",
          ),
        );
      }
      if (!isNonEmptyString(form.occupancyBasis.primaryOccupancy)) {
        errors.push(
          err(
            "occupancyBasis.primaryOccupancy",
            4,
            "Primary occupancy is required for the Code Requirements & Plan Analysis Report.",
          ),
        );
      }
      // The 11-item canonical mandatory list is auto-seeded by
      // defaultIntakeForm, so we only block when the list is somehow
      // empty (e.g. user deleted everything).
      if (form.mandatoryRequirements.length === 0) {
        errors.push(
          err(
            "mandatoryRequirements",
            5,
            "Mandatory requirements list cannot be empty for the Code Requirements & Plan Analysis Report.",
          ),
        );
      }
      // Missing data register ΓÇö array must exist; entries are optional
      // (analysis-derived gaps acceptable). No block here.
      break;
    }
    case "gap_deficiency": {
      const gapsCount = rs.gapItems?.length ?? 0;
      if (gapsCount === 0 && !rs.noGapsRecordedAck) {
        errors.push(
          err(
            "reportSpecific.gapItems",
            7,
            "Add at least one gap/deficiency item, or check 'No gaps recorded by user; analysis-derived gaps only.'",
          ),
        );
      }
      break;
    }
    case "authority_submission": {
      const cl = rs.submissionChecklist?.length ?? 0;
      if (cl === 0) {
        errors.push(
          err(
            "reportSpecific.submissionChecklist",
            7,
            "Submission checklist must contain at least one item for the Authority Submission Readiness Report.",
          ),
        );
      }
      if (!rs.finalReadinessStatus) {
        errors.push(
          err(
            "reportSpecific.finalReadinessStatus",
            7,
            "Final readiness status (Ready / Conditionally Ready / Not Ready) is required for the Authority Submission Readiness Report.",
          ),
        );
      }
      break;
    }
    case "case_study": {
      if (!isNonEmptyString(rs.background)) {
        errors.push(
          err("reportSpecific.background", 7, "Background is required for the Case Study Report."),
        );
      }
      if (!isNonEmptyString(rs.issue)) {
        errors.push(
          err("reportSpecific.issue", 7, "Issue is required for the Case Study Report."),
        );
      }
      if (!isNonEmptyString(rs.optionsConsidered)) {
        errors.push(
          err(
            "reportSpecific.optionsConsidered",
            7,
            "Options considered is required for the Case Study Report.",
          ),
        );
      }
      if (!isNonEmptyString(rs.recommendedApproach)) {
        errors.push(
          err(
            "reportSpecific.recommendedApproach",
            7,
            "Recommended approach is required for the Case Study Report.",
          ),
        );
      }
      break;
    }
    case "receiving_conformity": {
      if (!isNonEmptyString(rs.inspectionDate)) {
        errors.push(
          err(
            "reportSpecific.inspectionDate",
            7,
            "Inspection date is required for the Receiving & Conformity Report.",
          ),
        );
      }
      if (!isNonEmptyString(rs.systemInspected)) {
        errors.push(
          err(
            "reportSpecific.systemInspected",
            7,
            "System inspected is required for the Receiving & Conformity Report.",
          ),
        );
      }
      if (!isNonEmptyString(rs.approvedDrawingReference)) {
        errors.push(
          err(
            "reportSpecific.approvedDrawingReference",
            7,
            "Approved drawing reference is required for the Receiving & Conformity Report.",
          ),
        );
      }
      if (!rs.receivingStatus) {
        errors.push(
          err(
            "reportSpecific.receivingStatus",
            7,
            "Pass/Fail/Pending status is required for the Receiving & Conformity Report.",
          ),
        );
      }
      if (!isNonEmptyString(rs.observations)) {
        errors.push(
          err(
            "reportSpecific.observations",
            7,
            "Observations are required for the Receiving & Conformity Report.",
          ),
        );
      }
      break;
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Validate ONLY the global administrative fields. Used by the wizard's
 * Step 2 to decide whether to advance to subsequent steps before the
 * report-type conditionals are checked at submission time.
 */
export function validateAdminOnly(
  form: AnalyticalReportIntakeFormV1,
): ValidationResult {
  const full = validateIntakeForm(form);
  const adminPaths = new Set([
    "projectName",
    "clientOwner",
    "projectLocation",
    "preparedBy",
    "reportType",
    "language",
    "reportStatus",
    "revisionNo",
    "reportDate",
  ]);
  const errors = full.errors.filter((e) => adminPaths.has(e.path));
  return { ok: errors.length === 0, errors, warnings: [] };
}
