/**
 * complianceReport.ts — pure, framework-free module for the Building Profile
 * feature (C1a, 2026-09-03). No React, no DOM APIs beyond string building —
 * produces a complete, print-ready A4 HTML document as a string. Safe to
 * import from tests or the browser.
 *
 * Visual/branding conventions (Cairo font, teal/blue palette, A4 print
 * rules, footer with a page counter) are carried over from the existing
 * branded print export in src/components/ChatInterface.tsx (UtilityBar's
 * "PDF" button, `handlePdf`) so a compliance report reads as the same
 * product, not a bolted-on tool. The wiring that would call this from the
 * app (a report button, window.open + Blob + window.print, same pattern as
 * handlePdf) is described in docs/launch/building-profile-notes.md, not
 * implemented here.
 *
 * Markdown handling: ChatMarkdownRenderer.tsx exports `applyInlineMarkdown`,
 * but that export is explicitly documented there as "for tests ONLY ...
 * not part of the component's public API — no production code outside this
 * module imports it", and it also renders clickable SBC citation chips,
 * which this report must NOT do (citations here are pre-resolved, static,
 * print-only text). So this file implements its own minimal safe markdown
 * -> HTML converter (`markdownToSafeHtml`) instead of reusing it.
 */

import type { BuildingProfile } from "./buildingProfile";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplianceCitation {
  /** e.g. "SBC 801" */
  code: string;
  /** e.g. "903.2.11.3" — rendered with the word "Section"/"القسم", never "§". */
  section?: string | null;
  page?: number | string | null;
  quote?: string | null;
  /** Free text, or one of "verified" | "unverified" | "flagged" for a labelled badge. */
  status?: string | null;
}

export interface ComplianceReportItem {
  question: string;
  answerMarkdown: string;
  citations: ComplianceCitation[];
  mode: "primary" | "standard" | "analysis" | string;
  createdAt: string;
}

export interface ComplianceReportMeta {
  projectName: string;
  engineerName?: string;
  generatedAt: string;
  language: "ar" | "en";
}

export interface ComplianceReportInput {
  profile: Partial<BuildingProfile> | null;
  items: ComplianceReportItem[];
  assumptions: string[];
  openItems: string[];
  meta: ComplianceReportMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe markdown -> HTML (headings, lists, bold/italic/code, paragraphs)
// ─────────────────────────────────────────────────────────────────────────────

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdown(text: string): string {
  // Escape FIRST — every substitution below only ever re-introduces tags for
  // markdown markers matched in the ALREADY-ESCAPED string, so raw HTML or
  // script in the input can never reach the page.
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  return s;
}

/**
 * Minimal safe markdown -> HTML: headings (# .. ####), ordered/unordered
 * lists, bold/italic/inline-code, paragraphs. Never injects raw input HTML —
 * see inlineMarkdown/escapeHtml above.
 */
export function markdownToSafeHtml(markdown: string | null | undefined): string {
  const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    parts.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length + 1, 6); // report body starts below the section <h2>s
      parts.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ordered) {
      if (!list || list.tag !== "ol") {
        flushList();
        list = { tag: "ol", items: [] };
      }
      list.items.push(inlineMarkdown(ordered[1]));
      continue;
    }

    const unordered = trimmed.match(/^[-*•]\s+(.*)$/);
    if (unordered) {
      if (!list || list.tag !== "ul") {
        flushList();
        list = { tag: "ul", items: [] };
      }
      list.items.push(inlineMarkdown(unordered[1]));
      continue;
    }

    flushList();
    parts.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }
  flushList();
  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Citation formatting
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  verified: { ar: "تم التحقق", en: "Verified" },
  unverified: { ar: "غير مُتحقَّق", en: "Unverified" },
  flagged: { ar: "بحاجة مراجعة", en: "Flagged for review" },
};

function statusBadgeText(status: string | null | undefined, isAr: boolean): string | null {
  if (!status) return null;
  const known = STATUS_LABELS[status.toLowerCase()];
  return known ? (isAr ? known.ar : known.en) : status;
}

/**
 * "SBC 801 — Section 903.2.11.3 (p. 123)" in English; the Arabic form uses
 * "القسم" and "ص." instead — never the section-sign symbol in either
 * language (CLAUDE.md hard rule: write "Section" / "القسم").
 */
export function formatCitationLabel(citation: ComplianceCitation, isAr: boolean): string {
  const parts: string[] = [citation.code];
  if (citation.section) {
    parts.push(`${isAr ? "القسم" : "Section"} ${citation.section}`);
  }
  let label = parts.join(" — ");
  if (citation.page !== null && citation.page !== undefined && citation.page !== "") {
    label += ` (${isAr ? "ص." : "p."} ${citation.page})`;
  }
  return label;
}

// UTC getters throughout: the input is an ISO timestamp (normally carrying a
// "Z"/UTC offset), and using LOCAL getters (getFullYear/getHours/...) would
// make the rendered date/time — and buildComplianceReportFilename's date
// suffix below — depend on the host machine's timezone, which is both
// non-deterministic for tests and pointless for a report meant to be
// reproducible regardless of where it was generated or opened.
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? "");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────────────────────────────────────

function buildHeaderHtml(meta: ComplianceReportMeta, isAr: boolean): string {
  const platform = isAr ? "ConsultX — منصة الاستشارات الهندسية" : "ConsultX — Engineering Consulting Platform";
  const subtitle = isAr
    ? "تقرير امتثال هندسي — كود البناء السعودي"
    : "Engineering Compliance Report — Saudi Building Code";
  const projectLine = meta.projectName && meta.projectName.trim()
    ? escapeHtml(meta.projectName)
    : (isAr ? "بدون اسم مشروع" : "Untitled project");
  const engineerLine = meta.engineerName && meta.engineerName.trim()
    ? `<div><strong>${isAr ? "المهندس المسؤول:" : "Engineer:"}</strong> ${escapeHtml(meta.engineerName)}</div>`
    : "";

  return [
    '<div class="cr-hdr">',
    '  <div class="cr-hdr-brand">',
    `    <h1>${platform}</h1>`,
    `    <p>${subtitle}</p>`,
    "  </div>",
    '  <div class="cr-hdr-meta">',
    `    <div><strong>${isAr ? "المشروع:" : "Project:"}</strong> ${projectLine}</div>`,
    `    ${engineerLine}`,
    `    <div><strong>${isAr ? "تاريخ الإصدار:" : "Generated:"}</strong> ${escapeHtml(formatTimestamp(meta.generatedAt))}</div>`,
    "  </div>",
    "</div>",
  ].join("\n");
}

function buildProfileSectionHtml(profile: Partial<BuildingProfile> | null | undefined, isAr: boolean): string {
  const title = isAr ? "بيانات المبنى" : "Building Profile";
  const rows: Array<[string, string]> = [];

  const push = (labelAr: string, labelEn: string, value: string | number | null | undefined, suffix = "") => {
    if (value === null || value === undefined || value === "") return;
    rows.push([isAr ? labelAr : labelEn, `${value}${suffix}`]);
  };

  if (profile) {
    push("اسم المبنى", "Building name", profile.name);
    push("تصنيف الإشغال", "Occupancy group", profile.occupancy_group ?? undefined);
    push("عدد الطوابق", "Stories", profile.stories ?? undefined);
    push("الارتفاع", "Height", profile.height_m ?? undefined, isAr ? " م" : " m");
    push("المساحة الإجمالية", "Gross area", profile.gross_area_m2 ?? undefined, isAr ? " م²" : " m²");
    if (profile.sprinklered !== null && profile.sprinklered !== undefined) {
      push(
        "مرشات الحريق",
        "Sprinklers",
        profile.sprinklered ? (isAr ? "مرشات مركّبة" : "Sprinklered") : (isAr ? "لا توجد مرشات" : "Not sprinklered"),
      );
    }
    push("نوع الإنشاء", "Construction type", profile.construction_type ?? undefined);
    push("تصنيف الخطورة", "Hazard classification", profile.hazard_class ?? undefined);
    push("عدد الشاغلين المصمَّم", "Design occupant load", profile.occupant_load ?? undefined);
    push("ملاحظات", "Notes", profile.notes);
  }

  if (rows.length === 0) {
    const empty = isAr
      ? "لم يتم إرفاق معطيات مبنى بهذه المحادثة."
      : "No building profile was attached to this conversation.";
    return `<section class="cr-section"><h2>${title}</h2><p class="cr-empty">${escapeHtml(empty)}</p></section>`;
  }

  const rowsHtml = rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("");
  return `<section class="cr-section"><h2>${title}</h2><table class="cr-profile-table">${rowsHtml}</table></section>`;
}

const MODE_LABELS: Record<string, { ar: string; en: string }> = {
  primary: { ar: "رئيسي", en: "Main" },
  standard: { ar: "استشاري", en: "Advisory" },
  analysis: { ar: "تحليلي", en: "Analytical" },
};

function modeLabel(mode: string, isAr: boolean): string {
  const m = MODE_LABELS[mode];
  return m ? (isAr ? m.ar : m.en) : mode;
}

function buildFindingsSectionHtml(items: ComplianceReportItem[], isAr: boolean): string {
  const title = isAr ? "النتائج" : "Findings";
  if (!items || items.length === 0) {
    const empty = isAr ? "لا توجد بنود مسجَّلة في هذا التقرير." : "No items were recorded in this report.";
    return `<section class="cr-section"><h2>${title}</h2><p class="cr-empty">${escapeHtml(empty)}</p></section>`;
  }

  const findingsHtml = items
    .map((item, idx) => {
      const citations = item.citations ?? [];
      const citationsHtml =
        citations.length > 0
          ? `<ul class="cr-citations">${citations
              .map((c) => {
                const label = escapeHtml(formatCitationLabel(c, isAr));
                const badge = statusBadgeText(c.status, isAr);
                const badgeHtml = badge ? ` <span class="cr-badge">${escapeHtml(badge)}</span>` : "";
                const quoteHtml = c.quote ? `<div class="cr-quote">${escapeHtml(c.quote)}</div>` : "";
                return `<li>${label}${badgeHtml}${quoteHtml}</li>`;
              })
              .join("")}</ul>`
          : `<p class="cr-empty cr-citations-empty">${escapeHtml(
              isAr ? "لا توجد استشهادات مرتبطة بهذه الإجابة." : "No citations linked to this answer.",
            )}</p>`;

      return [
        '<article class="cr-finding">',
        `  <h3>${idx + 1}. ${escapeHtml(item.question)}</h3>`,
        `  <div class="cr-finding-meta">${escapeHtml(modeLabel(item.mode, isAr))} — ${escapeHtml(formatTimestamp(item.createdAt))}</div>`,
        `  <div class="cr-answer">${markdownToSafeHtml(item.answerMarkdown)}</div>`,
        '  <div class="cr-citations-block">',
        `    <h4>${isAr ? "الاستشهادات" : "Citations"}</h4>`,
        `    ${citationsHtml}`,
        "  </div>",
        "</article>",
      ].join("\n");
    })
    .join("\n");

  return `<section class="cr-section"><h2>${title}</h2>${findingsHtml}</section>`;
}

function buildListSectionHtml(title: string, items: string[], emptyText: string, checklist: boolean): string {
  const safeItems = items ?? [];
  if (safeItems.length === 0) {
    return `<section class="cr-section"><h2>${escapeHtml(title)}</h2><p class="cr-empty">${escapeHtml(emptyText)}</p></section>`;
  }
  const itemsHtml = safeItems
    .map(
      (raw) =>
        `<li>${checklist ? '<span class="cr-checkbox" aria-hidden="true">&#9744;</span> ' : ""}${escapeHtml(raw)}</li>`,
    )
    .join("");
  return `<section class="cr-section"><h2>${escapeHtml(title)}</h2><ul class="${
    checklist ? "cr-checklist" : "cr-list"
  }">${itemsHtml}</ul></section>`;
}

function buildFooterHtml(isAr: boolean): string {
  const disclaimer = isAr
    ? "هذا التقرير أداة مساعدة تدعم عملية المراجعة الهندسية ولا يُغني عن اعتماد الجهة المختصة (الدفاع المدني / البلدية) للمخططات والإجراءات النهائية."
    : "This report is a supporting reference tool and does not replace the Authority Having Jurisdiction's (Civil Defense / Municipality) formal review and approval of final drawings and procedures.";
  return [
    '<footer class="cr-footer">',
    `  <p>${escapeHtml(disclaimer)}</p>`,
    '  <div class="cr-footer-bar">',
    "    <span>ConsultX</span>",
    `    <span class="cr-page-num">${isAr ? "صفحة " : "Page "}</span>`,
    "  </div>",
    "</footer>",
  ].join("\n");
}

function buildStyle(isAr: boolean): string {
  const start = isAr ? "right" : "left";
  return `
    *, *::before, *::after { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Cairo', system-ui, sans-serif; line-height: 1.85; color: #111827; background: #ffffff; margin: 0; padding: 0 0 60px; }
    .cr-hdr { background: linear-gradient(135deg, #e8f4fd 0%, #f0f8ff 100%); border-bottom: 3px solid #00D4FF; padding: 18px 28px 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; page-break-inside: avoid; }
    .cr-hdr-brand h1 { margin: 0 0 2px; font-size: 1.05rem; font-weight: 700; color: #0369a1; }
    .cr-hdr-brand p { margin: 0; font-size: 0.78rem; color: #475569; }
    .cr-hdr-meta { font-size: 0.75rem; color: #475569; line-height: 1.9; }
    .cr-hdr-meta strong { color: #1e3a5f; font-weight: 600; }
    .cr-content { padding: 20px 28px 0; max-width: 760px; margin: 0 auto; }
    .cr-section { margin-bottom: 22px; page-break-inside: avoid; }
    .cr-section h2 { color: #0c2a4a; border-bottom: 2px solid #93c5fd; padding-bottom: 4px; font-size: 1rem; margin: 0 0 10px; }
    .cr-profile-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 0.85rem; }
    .cr-profile-table th { text-align: ${start}; background: #dbeafe; color: #1e3a5f; font-weight: 700; padding: 7px 12px; width: 38%; border-bottom: 1px solid #e5e7eb; }
    .cr-profile-table td { padding: 7px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; }
    .cr-finding { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; page-break-inside: avoid; }
    .cr-finding h3 { margin: 0 0 4px; font-size: 0.92rem; color: #0c2a4a; }
    .cr-finding-meta { font-size: 0.7rem; color: #64748b; margin-bottom: 8px; }
    .cr-answer p { margin: 4px 0 8px; }
    .cr-answer h2, .cr-answer h3, .cr-answer h4, .cr-answer h5 { color: #1e3a5f; }
    .cr-citations-block h4 { font-size: 0.78rem; color: #005B70; margin: 10px 0 4px; }
    .cr-citations { list-style: none; margin: 0; padding: 0; font-size: 0.8rem; }
    .cr-citations li { padding: 4px 0; border-top: 1px dashed #e2e8f0; }
    .cr-badge { display: inline-block; font-size: 0.68rem; padding: 1px 8px; border-radius: 999px; background: #ecfdf5; color: #047857; margin-${start}: 6px; }
    .cr-quote { font-size: 0.75rem; color: #475569; background: #f8fafc; border-${start}: 3px solid #005B70; padding: 4px 10px; margin-top: 4px; }
    .cr-list, .cr-checklist { margin: 0; padding-${start}: 20px; font-size: 0.85rem; }
    .cr-checklist { list-style: none; padding: 0; }
    .cr-checkbox { display: inline-block; width: 1.2em; }
    .cr-empty { font-size: 0.85rem; color: #64748b; font-style: italic; }
    .cr-footer { border-top: 1px solid #d1d5db; padding: 14px 28px 0; font-size: 0.7rem; color: #6b7280; }
    .cr-footer-bar { display: flex; justify-content: space-between; margin-top: 6px; }
    .cr-footer .cr-page-num::after { content: counter(page); }
    table { break-inside: avoid; }
    @media print {
      @page { size: A4; margin: 1.5cm 1.5cm 2.5cm 1.5cm; }
      body { color: #000000 !important; background: #ffffff !important; }
      .cr-footer { position: fixed; bottom: 0; left: 0; right: 0; }
    }
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a complete, print-ready A4 HTML document (RTL for Arabic) for a
 * conversation's compliance report: cover/header with platform identity,
 * the building profile table, numbered findings (question -> answer digest
 * -> citations with verification-status badges), assumptions/limits, an
 * open-items checklist, and a footer disclaiming that the report supports
 * but does not replace the authority's review.
 */
export function buildComplianceReportHtml(input: ComplianceReportInput): string {
  const { profile, items, assumptions, openItems, meta } = input;
  const isAr = meta.language !== "en";
  const dir = isAr ? "rtl" : "ltr";
  const lang = isAr ? "ar" : "en";
  const title = isAr
    ? `تقرير امتثال — ${meta.projectName && meta.projectName.trim() ? meta.projectName : "بدون اسم"}`
    : `Compliance Report — ${meta.projectName && meta.projectName.trim() ? meta.projectName : "Untitled"}`;

  const assumptionsEmpty = isAr ? "لا توجد افتراضات مسجَّلة." : "No assumptions were recorded.";
  const openItemsEmpty = isAr ? "لا توجد بنود مفتوحة." : "No open items.";

  return [
    "<!DOCTYPE html>",
    `<html dir="${dir}" lang="${lang}">`,
    "<head>",
    '<meta charset="UTF-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">',
    `<style>${buildStyle(isAr)}</style>`,
    "</head>",
    "<body>",
    buildHeaderHtml(meta, isAr),
    '<div class="cr-content">',
    buildProfileSectionHtml(profile, isAr),
    buildFindingsSectionHtml(items ?? [], isAr),
    buildListSectionHtml(isAr ? "الافتراضات والحدود" : "Assumptions & Limits", assumptions ?? [], assumptionsEmpty, false),
    buildListSectionHtml(isAr ? "بنود مفتوحة" : "Open Items", openItems ?? [], openItemsEmpty, true),
    "</div>",
    buildFooterHtml(isAr),
    "</body>",
    "</html>",
  ].join("\n");
}

/** Filesystem-safe filename for the report (unicode-preserving, .html extension). */
export function buildComplianceReportFilename(meta: ComplianceReportMeta): string {
  const isAr = meta.language !== "en";
  const fallback = isAr ? "تقرير-الامتثال" : "compliance-report";
  const base = meta.projectName && meta.projectName.trim() ? meta.projectName : fallback;
  const safeBase =
    base
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || fallback;

  const d = new Date(meta.generatedAt);
  const datePart = Number.isNaN(d.getTime())
    ? String(meta.generatedAt ?? "").slice(0, 10)
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  return `${safeBase}-${datePart}.html`;
}
