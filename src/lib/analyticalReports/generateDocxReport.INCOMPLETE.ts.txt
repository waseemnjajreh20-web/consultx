import {
  Paragraph,
  Table,
  TableOfContents,
} from "docx";

// ============================================================
// Bilingual rendering helper
// ============================================================

function renderForLanguage(
  artifact: AnalyticalReportArtifactV1,
  cfg: ReportTypeConfig,
  lang: "ar" | "en",
): Array<Paragraph | Table | TableOfContents> {
  const rtl = lang === "ar";
  const s = stringsFor(lang);
  const body: Array<Paragraph | Table | TableOfContents> = [];

  // Cover page
  body.push(...buildCoverPage(artifact, cfg, s, rtl));

  // Revision table
  if (cfg.showRevisionTable) {
    body.push(...buildRevisionTable(artifact, s, rtl));
    body.push(
      new Paragraph({
        children: [new TextRun({ text: "", break: 1 } as IRunOptions)],
        pageBreakBefore: true,
      }),
    );
  }

  // TOC
  if (cfg.showTOC) {
    body.push(...buildToc(cfg, artifact.sections, s, rtl));
    body.push(
      new Paragraph({
        children: [new TextRun({ text: "", break: 1 } as IRunOptions)],
        pageBreakBefore: true,
      }),
    );
  }

  // Intake form sections (Phase 1.1) — emitted only when intake is present
  if (artifact.intake) {
    body.push(...buildIntakeSections(artifact, s, rtl));
  }

  // Main sections (AI-derived)
  body.push(...buildSections(artifact, cfg, s, rtl));

  // Sources
  body.push(...buildSources(artifact, s, rtl));

  // Limitations / engineer approval (always last)
  body.push(...buildLimitations(artifact, s, rtl));

  return body;
}

// ============================================================
// Main generator
// ============================================================

export async function generateDocxReport(
  artifact: AnalyticalReportArtifactV1,
): Promise<Blob> {
  const cfg = REPORT_TYPE_CONFIGS[artifact.reportType];
  const lang: ReportLanguage = artifact.language;

  let body: Array<Paragraph | Table | TableOfContents>;

  if (isBilingual(lang)) {
    // Render Arabic first (RTL), then English (LTR)
    const arabicBody = renderForLanguage(artifact, cfg, "ar");
    const englishBody = renderForLanguage(artifact, cfg, "en");

    // Add a page break and separator between languages
    const separator: Array<Paragraph | Table> = [
      new Paragraph({
        children: [new TextRun({ text: "", break: 1 } as IRunOptions)],
        pageBreakBefore: true,
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: "English Version / \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629",
            bold: true,
            size: 24,
            color: COLOR_HEADER_BG,
            font: "Calibri",
          } as IRunOptions),
        ],
      }),
    ];

    body = [...arabicBody, ...separator, ...englishBody];
  } else {
    body = renderForLanguage(artifact, cfg, lang);
  }

  // Build document
  const doc = new Document({
    creator: artifact.generatedBy || "ConsultX",
    title: cfg.titleEn,
    description: cfg.subtitleEn,
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22,
            color: COLOR_BODY,
          },
          paragraph: {
            spacing: { line: 320 },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 360, hanging: 200 } },
                run: { underline: { type: UnderlineType.NONE } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: { default: buildHeader(artifact, cfg, false) },
        footers: { default: buildFooter(artifact, stringsFor("en"), false) },
        children: body as any,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/**
 * Trigger a browser download for a generated artifact. Convenience
 * wrapper used by the drawer; consumers may also call generateDocxReport
 * directly and handle the blob themselves.
 */
export async function downloadDocxReport(
  artifact: AnalyticalReportArtifactV1,
): Promise<string> {
  const blob = await generateDocxReport(artifact);
  const filename = buildReportFileName(artifact);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Chrome reliably completes the download
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return filename;
}

// ============================================================
// Exported constants
// ============================================================

export const DEFAULT_DISCLAIMER_AR = `
إخلاء المسؤولية: تم إنشاء هذا التقرير بواسطة نظام ذكاء اصطناعي لأغراض إعلامية فقط ولا يُعتبر بديلاً عن المشورة الهندسية المهنية. يجب مراجعة جميع النتائج والتوصيات من قبل مهندس مؤهل قبل اتخاذ أي قرارات بناء عليها.
`;

export const DEFAULT_DISCLAIMER_EN = `
Disclaimer: This report was generated by an AI system for informational purposes only and does not constitute professional engineering advice. All findings and recommendations must be reviewed by a qualified engineer before making any decisions based on this report.
`;