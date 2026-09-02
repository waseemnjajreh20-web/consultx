/**
 * Tests for src/lib/complianceReport.ts (C1a, 2026-09-03).
 *
 * Covers: the report contains every required section, malicious markdown in
 * model output is always escaped (never injected as raw HTML), empty
 * citations degrade gracefully, the RTL attribute follows the report
 * language, and citation labels use "Section"/"القسم" — never the
 * section-sign symbol (CLAUDE.md hard rule).
 */
import { describe, it, expect } from "vitest";
import {
  buildComplianceReportHtml,
  buildComplianceReportFilename,
  formatCitationLabel,
  markdownToSafeHtml,
  escapeHtml,
  type ComplianceReportInput,
} from "../lib/complianceReport";

const NOW = "2026-09-03T10:00:00.000Z";

function baseInput(overrides: Partial<ComplianceReportInput> = {}): ComplianceReportInput {
  return {
    profile: null,
    items: [],
    assumptions: [],
    openItems: [],
    meta: { projectName: "Test Project", generatedAt: NOW, language: "ar" },
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
  it("stringifies null/undefined as an empty string", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("markdownToSafeHtml", () => {
  it("converts headings, bold, and both list types", () => {
    const out = markdownToSafeHtml(
      "# Title\n\nSome **bold** text.\n\n- item one\n- item two\n\n1. first\n2. second",
    );
    expect(out).toContain("<h2>Title</h2>"); // shifted down one level (report body starts under section <h2>s)
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<ul><li>item one</li><li>item two</li></ul>");
    expect(out).toContain("<ol><li>first</li><li>second</li></ol>");
  });

  it("never emits raw HTML from the input — escapes it instead", () => {
    const out = markdownToSafeHtml("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("handles empty/null input without throwing", () => {
    expect(markdownToSafeHtml("")).toBe("");
    expect(markdownToSafeHtml(null)).toBe("");
    expect(markdownToSafeHtml(undefined)).toBe("");
  });
});

describe("formatCitationLabel", () => {
  it("formats English citations as 'CODE — Section X (p. Y)'", () => {
    expect(formatCitationLabel({ code: "SBC 801", section: "903.2.11.3", page: 123 }, false)).toBe(
      "SBC 801 — Section 903.2.11.3 (p. 123)",
    );
  });

  it("formats Arabic citations with القسم / ص. — never the section-sign symbol", () => {
    const label = formatCitationLabel({ code: "SBC 801", section: "903.2.11.3", page: 123 }, true);
    expect(label).toBe("SBC 801 — القسم 903.2.11.3 (ص. 123)");
    expect(label).not.toContain("§");
  });

  it("omits the section/page parts when they are absent", () => {
    expect(formatCitationLabel({ code: "SBC 201" }, false)).toBe("SBC 201");
  });
});

describe("buildComplianceReportHtml", () => {
  it("contains every required section: profile, findings, assumptions, open items, footer, platform identity", () => {
    const html = buildComplianceReportHtml(
      baseInput({
        profile: { occupancy_group: "B", stories: 4, sprinklered: true },
        items: [
          {
            question: "What sprinkler coverage is required?",
            answerMarkdown: "Full coverage is required per the applicable chapter.",
            citations: [{ code: "SBC 801", section: "903.2.11.3", page: 123, status: "verified" }],
            mode: "analysis",
            createdAt: NOW,
          },
        ],
        assumptions: ["Occupant load estimated from gross area."],
        openItems: ["Confirm final sprinkler design with the contractor."],
        meta: { projectName: "Tower A", engineerName: "Eng. Waseem", generatedAt: NOW, language: "ar" },
      }),
    );

    expect(html).toContain("ConsultX");
    expect(html).toContain("بيانات المبنى"); // Building Profile section
    expect(html).toContain("النتائج"); // Findings section
    expect(html).toContain("الافتراضات والحدود"); // Assumptions & Limits section
    expect(html).toContain("بنود مفتوحة"); // Open Items section
    expect(html).toContain("What sprinkler coverage is required?");
    expect(html).toContain("Occupant load estimated from gross area.");
    expect(html).toContain("Confirm final sprinkler design with the contractor.");
    expect(html).toContain("Eng. Waseem");
    // Footer disclaimer: supports but does not replace the authority's review.
    expect(html).toContain("لا يُغني عن اعتماد الجهة المختصة");
    // Verification-status badge text rendered for the citation.
    expect(html).toContain("تم التحقق");
  });

  it("shows a fallback message instead of an empty table when no profile is attached", () => {
    const html = buildComplianceReportHtml(baseInput({ profile: null }));
    expect(html).toContain("لم يتم إرفاق معطيات مبنى");
  });

  it("handles empty citations with a fallback message instead of an empty list", () => {
    const html = buildComplianceReportHtml(
      baseInput({
        items: [{ question: "Q", answerMarkdown: "A", citations: [], mode: "primary", createdAt: NOW }],
      }),
    );
    expect(html).toContain("لا توجد استشهادات مرتبطة بهذه الإجابة");
  });

  it("escapes malicious markdown/HTML everywhere user or model text is interpolated", () => {
    const html = buildComplianceReportHtml(
      baseInput({
        items: [
          {
            question: "Q <script>alert(1)</script>",
            answerMarkdown: "Normal text <script>alert(1)</script> and **bold**.",
            citations: [{ code: "<img src=x onerror=alert(1)>", quote: "<script>bad()</script>" }],
            mode: "primary",
            createdAt: NOW,
          },
        ],
        assumptions: ["<img src=x onerror=alert(1)>"],
        openItems: ["<b>unclosed"],
        meta: { projectName: "<b>Proj</b>", generatedAt: NOW, language: "ar" },
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    // Legitimate markdown still renders as real HTML alongside the escaping.
    expect(html).toContain("<strong>bold</strong>");
  });

  it("sets dir=\"rtl\" lang=\"ar\" for Arabic and dir=\"ltr\" lang=\"en\" for English", () => {
    const ar = buildComplianceReportHtml(baseInput({ meta: { projectName: "P", generatedAt: NOW, language: "ar" } }));
    const en = buildComplianceReportHtml(baseInput({ meta: { projectName: "P", generatedAt: NOW, language: "en" } }));
    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain('lang="ar"');
    expect(en).toContain('dir="ltr"');
    expect(en).toContain('lang="en"');
  });

  it("never emits the section-sign symbol anywhere in the document", () => {
    const html = buildComplianceReportHtml(
      baseInput({
        items: [
          {
            question: "Q",
            answerMarkdown: "A",
            citations: [{ code: "SBC 801", section: "903.2.7", page: 10 }],
            mode: "standard",
            createdAt: NOW,
          },
        ],
      }),
    );
    expect(html).not.toContain("§");
  });

  it("renders cleanly with fully empty items/assumptions/openItems (no crash, fallback text shown)", () => {
    const html = buildComplianceReportHtml(baseInput());
    expect(html).toContain("في هذا التقرير"); // no-findings fallback ("لا توجد بنود ... في هذا التقرير.")
    expect(html).toContain("لا توجد افتراضات"); // no assumptions
    expect(html).toContain("لا توجد بنود مفتوحة"); // no open items
  });
});

describe("buildComplianceReportFilename", () => {
  it("sanitizes filesystem-illegal characters and appends the UTC date", () => {
    const name = buildComplianceReportFilename({
      projectName: "Tower A/B: Phase*1?",
      generatedAt: NOW,
      language: "en",
    });
    expect(name).toBe("Tower-A-B-Phase-1-2026-09-03.html");
  });

  it("falls back to a default English name when projectName is empty", () => {
    const name = buildComplianceReportFilename({ projectName: "", generatedAt: NOW, language: "en" });
    expect(name).toBe("compliance-report-2026-09-03.html");
  });

  it("falls back to a default Arabic name when projectName is empty", () => {
    const name = buildComplianceReportFilename({ projectName: "", generatedAt: NOW, language: "ar" });
    expect(name.startsWith("تقرير-الامتثال-")).toBe(true);
    expect(name.endsWith(".html")).toBe(true);
  });
});
