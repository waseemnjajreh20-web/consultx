/**
 * Report type registry for Analytical Mode Phase 1.
 * Adding a new report type = adding a new entry here.
 */

import type {
  ReportType,
  ReportTypeConfig,
  ReportLanguage,
} from "./reportArtifactTypes";

export const REPORT_TYPE_CONFIGS: Record<ReportType, ReportTypeConfig> = {
  case_study: {
    type: "case_study",
    labelAr: "╪¬┘é╪▒┘è╪▒ ╪»╪▒╪º╪│╪⌐ ╪¡╪º┘ä╪⌐",
    labelEn: "Case Study Report",
    titleAr: "╪¬┘é╪▒┘è╪▒ ╪»╪▒╪º╪│╪⌐ ╪º┘ä╪¡╪º┘ä╪⌐ ╪º┘ä┘ç┘å╪»╪│┘è╪⌐",
    titleEn: "Engineering Case Study Report",
    subtitleAr: "┘à╪▒╪º╪¼╪╣╪⌐ ╪º╪┤╪¬╪▒╪º╪╖╪º╪¬ ╪º┘ä╪¡┘à╪º┘è╪⌐ ┘à┘å ╪º┘ä╪¡╪▒╪º╪ª┘é ┘ê╪│┘ä╪º┘à╪⌐ ╪º┘ä╪¡┘è╪º╪⌐",
    subtitleEn: "Fire & Life Safety Code Compliance Review",
    descriptionAr: "╪¬┘é╪▒┘è╪▒ ╪│╪▒╪»┘è ┘è┘ä╪«┘æ╪╡ ╪º┘ä╪¡╪º┘ä╪⌐ ┘ê╪º┘ä╪¬╪¡┘ä┘è┘ä ┘ê╪º┘ä╪¡┘â┘à ╪º┘ä┘å┘ç╪º╪ª┘è.",
    descriptionEn: "Narrative report summarizing the case, analysis, and verdict.",
    sections: [
      "intro",
      "classification",
      "inputsReviewed",
      "codePathGoverning",
      "engineeringAnalysis",
      "complianceVerdict",
      "nextActions",
    ],
    showRevisionTable: true,
    showTOC: true,
    showComplianceMatrix: true,
  },
  code_requirements_plan: {
    type: "code_requirements_plan",
    labelAr: "╪¬╪¡┘ä┘è┘ä ╪º┘ä┘â┘ê╪» ┘ê┘à╪¬╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘à╪«╪╖╪╖╪º╪¬",
    labelEn: "Code Requirements & Plan Analysis Report",
    titleAr: "╪¬┘é╪▒┘è╪▒ ╪¬╪¡┘ä┘è┘ä ╪º┘ä┘â┘ê╪» ┘ê┘à╪¬╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘à╪«╪╖╪╖╪º╪¬ ╪º┘ä╪¬╪╡┘à┘è┘à┘è╪⌐",
    titleEn: "Code Requirements & Plan Analysis Report",
    subtitleAr: "╪¬╪¡┘ä┘è┘ä ┘à╪«╪╖╪╖╪º╪¬ ╪º┘ä╪¬╪╡┘à┘è┘à ┘à┘é╪º╪¿┘ä ╪º╪┤╪¬╪▒╪º╪╖╪º╪¬ SBC",
    subtitleEn: "Design Drawing Analysis against SBC Requirements",
    descriptionAr: "╪¬┘é╪▒┘è╪▒ ┘à┘ü╪╡┘æ┘ä ┘ä┘ä┘à╪¬╪╖┘ä╪¿╪º╪¬ ┘ê╪¼╪»┘ê┘ä ╪º┘ä╪º┘à╪¬╪½╪º┘ä ┘ä┘ä┘à╪«╪╖╪╖╪º╪¬.",
    descriptionEn: "Detailed requirements and plan compliance matrix.",
    sections: [
      "intro",
      "classification",
      "inputsReviewed",
      "codePathGoverning",
      "keyRequirements",
      "engineeringAnalysis",
      "conflictsRisk",
      "nextActions",
    ],
    showRevisionTable: true,
    showTOC: true,
    showComplianceMatrix: true,
  },
  receiving_conformity: {
    type: "receiving_conformity",
    labelAr: "╪¬┘é╪▒┘è╪▒ ╪º┘ä╪º╪│╪¬┘ä╪º┘à ┘ê╪º┘ä┘à╪╖╪º╪¿┘é╪⌐",
    labelEn: "Receiving & Conformity Report",
    titleAr: "╪¬┘é╪▒┘è╪▒ ╪º┘ä╪º╪│╪¬┘ä╪º┘à ┘ê╪º┘ä┘à╪╖╪º╪¿┘é╪⌐ ╪º┘ä┘ü┘å┘è╪⌐",
    titleEn: "Receiving & Conformity Report",
    subtitleAr: "┘ü╪¡╪╡ ┘à╪╖╪º╪¿┘é╪⌐ ╪º┘ä╪¬┘å┘ü┘è╪░ ┘à╪╣ ┘à╪¬╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘â┘ê╪»",
    subtitleEn: "Implementation Conformity Check against Code Requirements",
    descriptionAr: "╪¬┘é╪▒┘è╪▒ ┘ä╪¬╪│╪¼┘è┘ä ┘å╪¬╪º╪ª╪¼ ╪º┘ä╪º╪│╪¬┘ä╪º┘à ┘ê╪º┘ä┘à╪╖╪º╪¿┘é╪⌐ ╪º┘ä┘ü┘å┘è╪⌐.",
    descriptionEn: "Records receiving inspection and technical conformity results.",
    sections: [
      "intro",
      "classification",
      "inputsReviewed",
      "keyRequirements",
      "engineeringAnalysis",
      "complianceVerdict",
    ],
    showRevisionTable: true,
    showTOC: true,
    showComplianceMatrix: true,
  },
  gap_deficiency: {
    type: "gap_deficiency",
    labelAr: "╪¬┘é╪▒┘è╪▒ ╪º┘ä┘ü╪¼┘ê╪º╪¬ ┘ê╪º┘ä┘é╪╡┘ê╪▒",
    labelEn: "Gap & Deficiency Report",
    titleAr: "╪¬┘é╪▒┘è╪▒ ╪º┘ä┘ü╪¼┘ê╪º╪¬ ┘ê╪º┘ä┘é╪╡┘ê╪▒ ┘ü┘è ╪º┘ä╪º┘à╪¬╪½╪º┘ä",
    titleEn: "Gap & Deficiency Report",
    subtitleAr: "╪▒╪╡╪» ╪º┘ä┘ü╪¼┘ê╪º╪¬ ┘ê╪¬╪¡╪»┘è╪» ╪º┘ä╪Ñ╪¼╪▒╪º╪í╪º╪¬ ╪º┘ä╪¬╪╡╪¡┘è╪¡┘è╪⌐",
    subtitleEn: "Gap Identification & Corrective Action Plan",
    descriptionAr: "╪¬┘é╪▒┘è╪▒ ┘è╪▒┘â┘æ╪▓ ╪╣┘ä┘ë ╪º┘ä┘ü╪¼┘ê╪º╪¬ ┘ê╪º┘ä┘à╪«╪º╪╖╪▒ ┘ê╪º┘ä╪Ñ╪¼╪▒╪º╪í╪º╪¬ ╪º┘ä╪¬╪╡╪¡┘è╪¡┘è╪⌐.",
    descriptionEn: "Focuses on gaps, risks, and corrective actions.",
    sections: [
      "intro",
      "classification",
      "engineeringAnalysis",
      "conflictsRisk",
      "missingInfo",
      "complianceVerdict",
      "nextActions",
    ],
    showRevisionTable: true,
    showTOC: true,
    showComplianceMatrix: true,
  },
  design_basis: {
    type: "design_basis",
    labelAr: "╪¬┘é╪▒┘è╪▒ ╪ú╪│╪º╪│ ╪º┘ä╪¬╪╡┘à┘è┘à ΓÇö ╪º┘ä╪¡┘à╪º┘è╪⌐ ┘à┘å ╪º┘ä╪¡╪▒┘è┘é",
    labelEn: "Fire & Life Safety Design Basis Report",
    titleAr: "┘ê╪½┘è┘é╪⌐ ╪ú╪│╪º╪│ ╪º┘ä╪¬╪╡┘à┘è┘à ΓÇö ╪º┘ä╪¡┘à╪º┘è╪⌐ ┘à┘å ╪º┘ä╪¡╪▒╪º╪ª┘é ┘ê╪│┘ä╪º┘à╪⌐ ╪º┘ä╪¡┘è╪º╪⌐",
    titleEn: "Fire & Life Safety Design Basis Report",
    subtitleAr: "╪º┘ä┘à╪╣╪º┘è┘è╪▒ ╪º┘ä╪¬╪╡┘à┘è┘à┘è╪⌐ ╪º┘ä┘à╪╣╪¬┘à╪»╪⌐ ┘ê┘ü┘é SBC 201 ┘ê SBC 801",
    subtitleEn: "Design Criteria per SBC 201 & SBC 801",
    descriptionAr: "┘ê╪½┘è┘é╪⌐ ╪º┘ä┘à╪╣╪º┘è┘è╪▒ ╪º┘ä╪¬╪╡┘à┘è┘à┘è╪⌐ ┘ä┘à╪▒╪º╪¡┘ä ╪º┘ä╪¬╪╡┘à┘è┘à.",
    descriptionEn: "Design criteria document for design-stage submissions.",
    sections: [
      "intro",
      "classification",
      "inputsReviewed",
      "codePathGoverning",
      "keyRequirements",
      "engineeringAnalysis",
      "nextActions",
    ],
    showRevisionTable: true,
    showTOC: true,
    showComplianceMatrix: true,
  },
  authority_submission: {
    type: "authority_submission",
    labelAr: "╪¬┘é╪▒┘è╪▒ ╪¼╪º┘ç╪▓┘è╪⌐ ╪º┘ä╪¬┘é╪»┘è┘à ┘ä┘ä╪¼┘ç╪º╪¬",
    labelEn: "Authority Submission Readiness Report",
    titleAr: "╪¬┘é╪▒┘è╪▒ ╪¼╪º┘ç╪▓┘è╪⌐ ╪º┘ä╪¬┘é╪»┘è┘à ┘ä┘ä╪¼┘ç╪º╪¬ ╪º┘ä┘à╪«╪¬╪╡╪⌐",
    titleEn: "Authority Submission Readiness Report",
    subtitleAr: "╪¬┘é┘è┘è┘à ╪¼╪º┘ç╪▓┘è╪⌐ ╪º┘ä┘à┘ä┘ü ┘ä┘ä╪¬┘é╪»┘è┘à ┘ä┘ä╪»┘ü╪º╪╣ ╪º┘ä┘à╪»┘å┘è",
    subtitleEn: "Civil Defence Submission Readiness Assessment",
    descriptionAr: "╪¬┘é┘è┘è┘à ╪¼╪º┘ç╪▓┘è╪⌐ ╪º┘ä┘à┘ä┘ü ┘ä┘ä╪¼┘ç╪º╪¬ ╪º┘ä╪▒┘é╪º╪¿┘è╪⌐.",
    descriptionEn: "Readiness assessment for authority submission.",
    sections: [
      "intro",
      "classification",
      "codePathGoverning",
      "keyRequirements",
      "engineeringAnalysis",
      "complianceVerdict",
      "nextActions",
    ],
    showRevisionTable: true,
    showTOC: true,
    showComplianceMatrix: true,
  },
};

export const REPORT_TYPE_ORDER: ReportType[] = [
  "case_study",
  "code_requirements_plan",
  "receiving_conformity",
  "gap_deficiency",
  "design_basis",
  "authority_submission",
];

export function getReportTypeLabel(
  type: ReportType,
  lang: ReportLanguage,
): string {
  const cfg = REPORT_TYPE_CONFIGS[type];
  return lang === "en" ? cfg.labelEn : cfg.labelAr;
}

export function getReportTypeTitle(
  type: ReportType,
  lang: ReportLanguage,
): string {
  const cfg = REPORT_TYPE_CONFIGS[type];
  // Bilingual reports use Arabic as primary in the title
  if (lang === "en") return cfg.titleEn;
  return cfg.titleAr;
}
