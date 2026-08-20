/**
 * Compose an AnalyticalReportArtifactV1 from a raw analytical assistant
 * message + user-supplied metadata/branding. Pure function ΓÇö no side
 * effects, safe to call repeatedly.
 */

import type {
  AnalyticalReportArtifactV1,
  ReportBranding,
  ReportLanguage,
  ReportMetadata,
  ReportSourceMeta,
  ReportStatus,
  ReportType,
} from "./reportArtifactTypes";
import type { AnalyticalReportIntakeFormV1 } from "./intakeFormTypes";
import {
  extractComplianceMatrix,
  extractDisclaimer,
  extractRecommendations,
  parseAnalyticalMessage,
} from "./parseAnalyticalMessage";
import {
  DEFAULT_DISCLAIMER_AR,
  DEFAULT_DISCLAIMER_EN,
} from "./generateDocxReport";

export interface BuildReportArtifactInput {
  reportType: ReportType;
  language: ReportLanguage;
  status: ReportStatus;
  metadata: ReportMetadata;
  branding: ReportBranding;
  messageId: string;
  messageContent: string;
  sourceFiles?: string[];
  sourceMeta?: ReportSourceMeta[];
  generatedBy?: string;
  /**
   * Optional structured intake form. When present, the DOCX generator
   * emits the Phase 1.1 intake sections (drawing basis, occupancy,
   * mandatory matrix, owner-requested systems, etc.) in addition to the
   * AI-derived sections.
   */
  intake?: AnalyticalReportIntakeFormV1;
}

export function buildReportArtifact(
  input: BuildReportArtifactInput,
): AnalyticalReportArtifactV1 {
  const sections = parseAnalyticalMessage(input.messageContent);
  const complianceMatrix = extractComplianceMatrix(sections.engineeringAnalysis);
  const recommendations = extractRecommendations(sections.nextActions);

  const disclaimer =
    extractDisclaimer(input.messageContent) ||
    (input.language === "en" ? DEFAULT_DISCLAIMER_EN : DEFAULT_DISCLAIMER_AR);

  return {
    schema: "analytical_report_artifact_v1",
    reportType: input.reportType,
    language: input.language,
    status: input.status,
    metadata: input.metadata,
    branding: input.branding,
    intake: input.intake,
    source: {
      messageId: input.messageId,
      rawContent: input.messageContent,
    },
    sections,
    complianceMatrix,
    recommendations,
    limitations: disclaimer,
    sourceFiles: input.sourceFiles ?? [],
    sourceMeta: input.sourceMeta ?? [],
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy,
  };
}
