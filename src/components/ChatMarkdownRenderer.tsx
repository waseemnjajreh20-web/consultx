import { useMemo, useState } from "react";
import {
  ChevronDown, FileText, BookOpen, Calculator, Lightbulb,
  ClipboardList, Shield, GitCompareArrows, Scale, ListChecks, Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import WidgetRenderer, { WidgetLoading } from "@/components/widgets/WidgetRenderer";
import { parseCitationToken } from "@/utils/inlineCitation";
import type { SbcFamily } from "@/utils/citationRouting";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ChatMode = "primary" | "standard" | "analysis";

// ── Runtime citation verification (B1a) ──────────────────────────────────────
// The edge function checks every citation token against the evidence it
// actually retrieved and streams the verdicts as a {type:"citations"} event.
// The shape below mirrors CitationVerdict in
// supabase/functions/fire-safety-chat/citationVerifier.ts; it is declared here
// rather than imported because the Vite tree does not compile the Deno tree.
// Messages that carry no verdicts (all history, and every answer produced with
// CITATION_VERIFIER_ENABLED off) render exactly as they did before.
export type CitationVerificationStatus = "verified" | "paraphrased" | "unverified";

export interface CitationStatusItem {
  token: string;
  code: string;
  section: string | null;
  page?: number | null;
  status: CitationVerificationStatus;
  score?: number;
  reasons?: string[];
}

/** Verdicts keyed by both the raw token text and a code+section fallback key. */
export type CitationStatusIndex = ReadonlyMap<string, CitationStatusItem>;

function citationTokenKey(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Fallback key so a verdict still finds its chip when the rendered token text
 * differs from the streamed one by spacing or dash style.
 */
function citationStructuralKey(code: string, section: string | null, page?: number | null): string | null {
  const c = String(code ?? "").toUpperCase().replace(/\s|_/g, "-");
  if (!c) return null;
  if (section) return `${c}::${section.trim()}`.toLowerCase();
  if (page != null) return `${c}::pp.${page}`.toLowerCase();
  return null;
}

/** Build the lookup a message's chips are badged from. Undefined when empty. */
export function buildCitationStatusIndex(
  items?: readonly CitationStatusItem[] | null,
): CitationStatusIndex | undefined {
  if (!items || items.length === 0) return undefined;
  const map = new Map<string, CitationStatusItem>();
  for (const it of items) {
    if (!it || typeof it.token !== "string" || !it.status) continue;
    map.set(citationTokenKey(it.token), it);
    const structural = citationStructuralKey(it.code, it.section ?? null, it.page);
    if (structural && !map.has(structural)) map.set(structural, it);
  }
  return map.size > 0 ? map : undefined;
}

interface ChatMarkdownRendererProps {
  content: string;
  mode?: ChatMode;
  /**
   * Document codes (e.g. "SBC-201", "SBC-801") whose sources are present in the
   * current message's resolved source metadata. Inline citation tokens whose
   * family is NOT in this set are rendered as unsupported (warning style,
   * `data-unsupported="1"`) so the click handler can apply the Step-3.2
   * hard-stop and never open a wrong-family PDF.
   */
  availableFamilies?: ReadonlySet<SbcFamily>;
  /** Verification verdicts for this message's citation tokens, if any. */
  citationStatuses?: readonly CitationStatusItem[];
}

interface ParsedSection {
  type: "text" | "heading" | "accordion" | "table" | "widget" | "widget-loading" | "divider";
  content: string;
  title?: string;
  level?: number;
  sectionKey?: string;
  tableData?: { headers: string[]; rows: string[][] };
  widgetData?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Icons & Colors
// ─────────────────────────────────────────────────────────────────────────────
function getSectionIcon(title: string) {
  if (title.includes("البيانات المستخرجة") || title.includes("Extracted Data"))    return <Table2 className="w-4 h-4" />;
  if (title.includes("ملخص الفروقات")      || title.includes("Differences"))       return <GitCompareArrows className="w-4 h-4" />;
  if (title.includes("السند القانوني")     || title.includes("Legal Basis"))       return <Scale className="w-4 h-4" />;
  if (title.includes("الإجراءات المطلوبة") || title.includes("Required Actions"))  return <ListChecks className="w-4 h-4" />;
  if (title.includes("النص المرجعي")       || title.includes("English"))           return <FileText className="w-4 h-4" />;
  if (title.includes("الترجمة"))                                                   return <BookOpen className="w-4 h-4" />;
  if (title.includes("التحليل"))                                                   return <Calculator className="w-4 h-4" />;
  if (title.includes("الاشتقاق"))                                                  return <Lightbulb className="w-4 h-4" />;
  if (title.includes("توصيات"))                                                    return <ClipboardList className="w-4 h-4" />;
  if (title.includes("ملاحظات") || title.includes("AHJ"))                         return <Shield className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function getSectionColor(title: string): string {
  if (title.includes("البيانات المستخرجة") || title.includes("Extracted Data"))    return "border-l-teal-500";
  if (title.includes("ملخص الفروقات")      || title.includes("Differences"))       return "border-l-violet-500";
  if (title.includes("السند القانوني")     || title.includes("Legal Basis"))       return "border-l-blue-700";
  if (title.includes("الإجراءات المطلوبة") || title.includes("Required Actions"))  return "border-l-cyan-500";
  if (title.includes("النص المرجعي")       || title.includes("English"))           return "border-l-blue-500";
  if (title.includes("الترجمة"))                                                   return "border-l-green-500";
  if (title.includes("التحليل"))                                                   return "border-l-amber-500";
  if (title.includes("الاشتقاق"))                                                  return "border-l-purple-500";
  if (title.includes("توصيات"))                                                    return "border-l-cyan-500";
  if (title.includes("ملاحظات") || title.includes("AHJ"))                         return "border-l-rose-500";
  return "border-l-primary";
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement 2 — Geometric SVG Bullet Icons (mode-specific shapes)
// ─────────────────────────────────────────────────────────────────────────────
function BulletIcon({ mode }: { mode?: ChatMode }) {
  // Analysis → crimson diamond
  if (mode === "analysis") {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden
        style={{ marginTop: "9px", flexShrink: 0 }}>
        <path d="M4 0L8 4L4 8L0 4Z" fill="rgba(220,38,38,0.80)" />
      </svg>
    );
  }
  // Standard/Consultant → amber rounded square
  if (mode === "standard") {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden
        style={{ marginTop: "9px", flexShrink: 0 }}>
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="rgba(245,158,11,0.80)" />
      </svg>
    );
  }
  // Primary / default → cyan right-pointing arrow
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden
      style={{ marginTop: "9px", flexShrink: 0 }}>
      <path d="M0 0L8 4L0 8Z" fill="rgba(0,212,255,0.85)" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode-aware accent helpers
// ─────────────────────────────────────────────────────────────────────────────
function getNumberColor(mode?: ChatMode): string {
  if (mode === "analysis") return "#DC143C";
  if (mode === "standard") return "#FF8C00";
  return "#00D4FF";
}

// Requirement 3 — Primary: bold text pops with cyan highlight
function getBoldHtml(text: string, mode?: ChatMode): string {
  if (mode === "primary")  return `<strong class="consultx-bold-primary">${text}</strong>`;
  if (mode === "standard") return `<strong class="consultx-bold-standard">${text}</strong>`;
  if (mode === "analysis") return `<strong class="consultx-bold-analysis">${text}</strong>`;
  return `<strong class="font-semibold text-foreground">${text}</strong>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────────────────────────────────────
// ── Citation-token pipe safety ───────────────────────────────────────────────
// Inline citation tokens carry a literal "|" ("[SBC-501 Section 506.3.11 |
// conf:high]"). Straight `split("|")` therefore SHATTERS any table cell that
// contains a token (measured on the owner's analysis answers: cells ended mid-
// token at "conf:high]"), and a prose line holding TWO tokens has 2+ pipes so
// the table-row heuristic eats it as a table row. Mask pipes inside [...]
// before any pipe logic runs, unmask when the text is finally rendered/stored.
// U+E000 is a private-use char that never occurs in real content (the intake
// pipeline strips PDF PUA glyphs).
const TOKEN_PIPE = "";
function maskTokenPipes(s: string): string {
  return s.replace(/\[[^\[\]\n]{0,300}\]/g, (m) => m.replace(/\|/g, TOKEN_PIPE));
}
function unmaskTokenPipes(s: string): string {
  return s.split(TOKEN_PIPE).join("|");
}

function parseMarkdownTable(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const headerLine = maskTokenPipes(lines[0]);
  if (!headerLine.includes("|")) return null;
  const separatorLine = lines[1];
  if (!separatorLine.match(/^\|?[\s-:|]+\|?$/)) return null;

  const parseRow = (line: string): string[] =>
    maskTokenPipes(line).split("|").map(c => unmaskTokenPipes(c.trim())).filter(c => c !== "");

  const headers = parseRow(lines[0]);
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && maskTokenPipes(line).includes("|")) rows.push(parseRow(line));
  }
  return headers.length === 0 ? null : { headers, rows };
}

function parseDetailsBlocks(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const pattern = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let lastIndex = 0;
  let match;
  let counter = 0;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index).trim();
      if (before) sections.push(...parseTextContent(before));
    }
    sections.push({
      type: "accordion",
      title: match[1].replace(/<[^>]*>/g, "").trim(),
      content: match[2].trim(),
      sectionKey: `sec-${counter++}`,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) sections.push(...parseTextContent(remaining));
  }
  return sections;
}

function parseTextContent(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = text.split("\n");
  let currentText: string[] = [];
  let tableLines: string[] = [];
  let inTable = false;

  const flushText = () => {
    if (currentText.length > 0) {
      const joined = currentText.join("\n").trim();
      if (joined) sections.push({ type: "text", content: joined });
      currentText = [];
    }
  };
  const flushTable = () => {
    if (tableLines.length > 0) {
      const tableText = tableLines.join("\n");
      const tableData = parseMarkdownTable(tableText);
      if (tableData) sections.push({ type: "table", content: tableText, tableData });
      else currentText.push(...tableLines);
      tableLines = [];
      inTable = false;
    }
  };

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);
    const h4Match = line.match(/^####\s+(.+)$/);
    // "---" section separators come BEFORE the table heuristics: the
    // table-separator regex matches a bare dash line, which used to drag every
    // "---" into a doomed table parse and re-emit it as a LITERAL text
    // paragraph (the dash clutter all over production answers).
    const isDivider = /^\s*(-{3,}|[─═_]{3,})\s*$/.test(line);
    // Pipe heuristics run on the MASKED line so a sentence containing two
    // citation tokens (= two pipes) is no longer mistaken for a table row.
    const masked = maskTokenPipes(line);
    const isTableRow = masked.trim().startsWith("|") ||
      (masked.includes("|") && masked.match(/^\|?[\s\S]+\|[\s\S]+\|?$/));
    const isTableSep = !isDivider && masked.match(/^\|?[\s-:|]+\|?$/) && masked.includes("-");

    // Headings are rendered as styled titles — literal markdown bold/colons
    // inside them ("### **(2) العنوان:**") showed raw asterisks in the UI.
    const cleanHeading = (s: string) => s.replace(/\*\*/g, "").replace(/[:：]\s*$/, "").trim();

    if (isDivider) {
      flushTable(); flushText();
      sections.push({ type: "divider", content: "" });
    } else if (h4Match) {
      flushTable(); flushText();
      sections.push({ type: "heading", content: cleanHeading(h4Match[1]), level: 4 });
    } else if (h3Match) {
      flushTable(); flushText();
      sections.push({ type: "heading", content: cleanHeading(h3Match[1]), level: 3 });
    } else if (h2Match) {
      flushTable(); flushText();
      sections.push({ type: "heading", content: cleanHeading(h2Match[1]), level: 2 });
    } else if (h1Match) {
      flushTable(); flushText();
      sections.push({ type: "heading", content: cleanHeading(h1Match[1]), level: 1 });
    } else if (isTableRow || isTableSep) {
      flushText();
      inTable = true;
      tableLines.push(line);
    } else if (inTable && line.trim() === "") {
      flushTable();
    } else {
      if (inTable) flushTable();
      currentText.push(line);
    }
  }
  flushTable();
  flushText();
  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// XSS-safe HTML escaping
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline reference deep-linking helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infer source document from leading section digits — HEURISTIC ONLY.
 *
 * P5-R6 (near-term): sbc_documents.section_number drifts from the true
 * first in-text heading in 57.6%-73.1% of rows (see
 * reports/advisory-section-drift-summary.md), so this leading-digit
 * guess is not reliable evidence of which code a section actually belongs
 * to. It is called ONLY for bare, unstructured references below (a lone
 * "Section 903.2.7" or "903.2.7" with no SBC code attached) — never for
 * structured citation tokens like "[SBC-201 Section 903.2.7 | conf:high]",
 * where the token's explicit document code always wins (see Step 0 in
 * applyInlineMarkdown, which protects those tokens from this heuristic via
 * CXTOK placeholders before Step 1/Step 2 run). The real fix — a section ->
 * document lookup backed by sbc_section_defs — lands post-G0; until then
 * this stays a heuristic and callers must not treat its output as exact.
 */
function getSrc(sec: string): "sbc201" | "sbc801" {
  const n = parseInt(sec, 10);
  return (n >= 900 && n < 1000) ? "sbc801" : "sbc201";
}

// ── Citation verification badge (B1a) ────────────────────────────────────────
// Subtle, sits inside the chip so it travels with it, and uses logical
// (margin-inline-start) spacing so it lands on the correct side in RTL.
const CITATION_BADGE_META: Record<
  CitationVerificationStatus,
  { glyph: string; label: string; color: string; bg: string; border: string }
> = {
  verified:    { glyph: "✓", label: "مُتحقق",      color: "#10B981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.30)" },
  paraphrased: { glyph: "≈", label: "معاد صياغته", color: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.30)" },
  unverified:  { glyph: "!", label: "غير مُتحقق",  color: "#EF4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.30)" },
};

const CITATION_REASON_AR: Record<string, string> = {
  quote_verbatim: "الاقتباس مطابق للنص المسترجع",
  quote_paraphrased: "الاقتباس قريب من النص المسترجع وليس مطابقاً له",
  quote_not_in_evidence: "الاقتباس غير موجود في النص المسترجع",
  quote_too_short: "الاقتباس أقصر من أن يُقارن",
  no_quote_found: "لا يوجد اقتباس حرفي مرفق بهذا الاستشهاد",
  no_evidence_for_code: "لم يُسترجع أي مقطع من هذا الكود",
  section_missing_from_evidence: "رقم القسم غير موجود في المصادر المسترجعة",
  section_from_known_index: "رقم القسم مؤكد من فهرس أقسام الكود",
  page_only_token: "استشهاد بنطاق صفحات بلا رقم قسم",
};

function citationReasonAr(reason: string): string {
  const known = CITATION_REASON_AR[reason];
  if (known) return known;
  if (reason.startsWith("code_family_mismatch:")) {
    return `النص المقتبس يعود إلى ${reason.slice("code_family_mismatch:".length)} لا إلى الكود المذكور`;
  }
  return reason;
}

function citationBadgeHtml(item: CitationStatusItem): string {
  const meta = CITATION_BADGE_META[item.status];
  if (!meta) return "";
  const reasons = (item.reasons ?? []).map(citationReasonAr).filter(Boolean);
  const title = escapeHtml([meta.label, ...reasons].join(" — "));
  return (
    `<span class="cx-cite-badge" data-cite-status="${item.status}"` +
    ` aria-label="${escapeHtml(meta.label)}" title="${title}"` +
    ` style="display:inline-block;margin-inline-start:4px;padding:0 4px;border-radius:3px;` +
    `font-size:0.85em;font-weight:700;line-height:1.4;color:${meta.color};` +
    `background:${meta.bg};border:1px solid ${meta.border}">${meta.glyph}</span>`
  );
}

/** Verdict for a token, matched by raw text first and code+section second. */
function lookupCitationStatus(
  raw: string,
  parsed: ReturnType<typeof parseCitationToken>,
  statuses?: CitationStatusIndex,
): CitationStatusItem | undefined {
  if (!statuses || !parsed) return undefined;
  const direct = statuses.get(citationTokenKey(raw));
  if (direct) return direct;
  const family =
    parsed.src === "sbc201" ? "SBC-201" :
    parsed.src === "sbc801" ? "SBC-801" :
    parsed.src === "sbc501" ? "SBC-501" :
    parsed.src === "sbc401" ? "SBC-401" : null;
  if (!family) return undefined;
  const key = citationStructuralKey(family, parsed.sectionRef ?? parsed.tableRef, parsed.pageStart);
  return key ? statuses.get(key) : undefined;
}

/**
 * Render a structured Advisory citation token like:
 *   [SBC 201 | Chapter 3 | Section 309.1 | conf:high]
 *   [SBC-801 chunk pp.411-435 | conf:medium | section_label:ambiguous]
 *   [community_summary | LLM_SYNTHESIS | conf:low]
 *
 * Produces a SINGLE span carrying authoritative data-src derived from the
 * token itself (never from the leading-digit heuristic). data-ambiguous=1
 * tells the click handler to open SourcePanel without auto-routing to a PDF.
 */
function renderCitationToken(
  match: string,
  availableFamilies?: ReadonlySet<SbcFamily>,
  citationStatuses?: CitationStatusIndex,
): string {
  const parsed = parseCitationToken(match);
  if (!parsed) return match;

  if (parsed.src === "synthesis") {
    return (
      `<span class="cx-src cx-src-synthesis"` +
      ` data-src="synthesis"` +
      ` style="color:#FFC107;background:rgba(255,193,7,0.10);` +
      `border:1px solid rgba(255,193,7,0.25);padding:1px 6px;border-radius:4px;` +
      `font-size:0.85em;font-weight:500;cursor:help"` +
      ` title="ملخص معرفي مساعد — يحتاج تحقق من المصدر الكودي">` +
      `${match}</span>`
    );
  }

  // ── Step 3.2: detect tokens whose family is not represented in this answer's
  //   retrieved sources. These tokens must NOT deep-link to a PDF — they are
  //   rendered as warning-styled badges, and the click handler applies a hard
  //   stop on `data-unsupported="1"`.
  const family: SbcFamily | null =
    parsed.src === "sbc201" ? "SBC-201" :
    parsed.src === "sbc801" ? "SBC-801" :
    parsed.src === "sbc501" ? "SBC-501" :
    parsed.src === "sbc401" ? "SBC-401" : null;
  const isUnsupported = !!(family && availableFamilies && !availableFamilies.has(family));

  // B1a: the runtime verdict for this exact token, when the answer carried one.
  const verdict = lookupCitationStatus(match, parsed, citationStatuses);
  const badge = verdict ? citationBadgeHtml(verdict) : "";

  const sec = parsed.sectionRef ?? parsed.tableRef ?? "";
  const reftype = parsed.tableRef ? "table" : "section";
  const warn = parsed.isAmbiguous || isUnsupported;
  const color = warn ? "#FFC107" : "#0094B3";
  const bg = warn ? "rgba(255,193,7,0.10)" : "rgba(0,148,179,0.08)";
  const border = warn ? "rgba(255,193,7,0.25)" : "rgba(0,148,179,0.20)";
  const baseTitleAr = isUnsupported
    ? "المرجع مذكور في الإجابة لكنه غير موجود ضمن المصادر المسترجعة — Citation mentioned in answer but not present in retrieved sources"
    : (parsed.isAmbiguous
        ? "يحتاج تحقق من المصدر — انقر لفتح لوحة المصادر"
        : (sec ? `انقر لفتح ${reftype === "table" ? "الجدول" : "القسم"} ${sec}` : "انقر لفتح المصدر"));
  const titleAr = verdict
    ? `${escapeHtml(CITATION_BADGE_META[verdict.status]?.label ?? "")} — ${baseTitleAr}`
    : baseTitleAr;

  return (
    `<span class="cx-src cx-src-token${isUnsupported ? " cx-src-unsupported" : ""}"` +
    ` data-src="${parsed.src}"` +
    (sec ? ` data-section="${sec}"` : "") +
    ` data-reftype="${reftype}"` +
    (parsed.isAmbiguous ? ` data-ambiguous="1"` : "") +
    (isUnsupported ? ` data-unsupported="1"` : "") +
    (verdict ? ` data-cite-status="${verdict.status}"` : "") +
    ` style="color:${color};background:${bg};border:1px solid ${border};` +
    `padding:1px 6px;border-radius:4px;font-size:0.92em;font-weight:500;cursor:pointer;` +
    `text-decoration:none"` +
    ` title="${titleAr}">${match}${badge}</span>`
  );
}

/** Build a clickable cx-src span with full reference metadata. */
function refSpan(
  src: string,
  sec: string,
  reftype: "section" | "clause" | "table" | "figure",
  match: string,
  titleAr: string,
): string {
  return (
    `<span class="cx-src"` +
    ` data-src="${src}"` +
    ` data-section="${sec}"` +
    ` data-reftype="${reftype}"` +
    ` style="color:#0094B3;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;font-weight:600"` +
    ` title="${titleAr}${sec}">${match}</span>`
  );
}

/**
 * Apply a regex replacement ONLY to text nodes in an HTML string —
 * i.e. skip content inside angle-bracket tags and HTML attribute values.
 * This prevents double-wrapping of already-linked spans.
 */
function replaceInTextNodes(
  html: string,
  pattern: RegExp,
  replacer: (match: string, ...groups: string[]) => string,
): string {
  // Split on HTML tags: odd chunks are tags, even chunks are raw text.
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_full, tag: string, text: string) => {
    if (tag) return tag;
    if (text) return text.replace(pattern, replacer);
    return _full;
  });
}

// ── LaTeX-lite ───────────────────────────────────────────────────────────────
// The model emits inline TeX ("$I_{\Delta n} \le 30\text{ mA}$") which used to
// reach the user RAW — dollar signs, backslashes and all (measured across the
// owner's three production answers). Full KaTeX is a dependency we don't need:
// the actually-observed vocabulary is subscripts, a handful of operators and
// \text{}. Convert just that, wrap LTR so the formula doesn't get bidi-mangled
// inside Arabic prose, and strip any leftover TeX commands instead of showing
// them. Runs on ESCAPED text, and the injected <sub>/<sup> are our own HTML.
function latexSegment(seg: string): string {
  let s = seg;
  s = s.replace(/\\text\s*\{([^{}]*)\}/g, "$1");
  s = s
    .replace(/\\times\b/g, "×").replace(/\\cdot\b/g, "·")
    .replace(/\\leq?\b/g, "≤").replace(/\\geq?\b/g, "≥")
    .replace(/\\neq?\b/g, "≠").replace(/\\pm\b/g, "±")
    .replace(/\\approx\b/g, "≈").replace(/\\infty\b/g, "∞")
    .replace(/\\Delta\b/g, "Δ").replace(/\\Omega\b/g, "Ω")
    .replace(/\\mu\b/g, "μ").replace(/\\rho\b/g, "ρ")
    .replace(/\\theta\b/g, "θ").replace(/\\phi\b/g, "φ")
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)")
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  s = s.replace(/_\{([^{}]*)\}/g, "<sub>$1</sub>").replace(/\^\{([^{}]*)\}/g, "<sup>$1</sup>");
  s = s.replace(/_([A-Za-z0-9Δ]{1,6})/g, "<sub>$1</sub>").replace(/\^([A-Za-z0-9]{1,4})/g, "<sup>$1</sup>");
  s = s.replace(/[{}]/g, "").replace(/\\[a-zA-Z]+/g, "").replace(/\\/g, "");
  return `<span dir="ltr" style="unicode-bidi:embed;font-family:inherit">${s.trim()}</span>`;
}
function latexLite(text: string): string {
  // $$...$$ then $...$ — single line only, bounded, so a stray dollar sign in
  // prose can't swallow half the paragraph.
  return text
    .replace(/\$\$([^$\n]{1,240})\$\$/g, (_m, inner) => latexSegment(inner))
    .replace(/\$([^$\n]{1,240})\$/g, (_m, inner) => latexSegment(inner));
}

// Apply inline markdown (bold, code, badges) to an already-escaped string.
//
// Exported for tests ONLY (see src/__tests__/citationRouting.test.ts). It is a
// pure string -> string transform with no React/DOM dependency, and exporting
// it is what lets the token-code-beats-heuristic precedence be asserted against
// the REAL pipeline (Step 0 buffering tokens before Step 1/Step 2 run getSrc)
// rather than against a copy of the heuristic, which would keep passing if the
// step ordering ever regressed. Not part of the component's public API — no
// production code outside this module imports it.
// eslint-disable-next-line react-refresh/only-export-components
export function applyInlineMarkdown(
  escaped: string,
  mode?: ChatMode,
  availableFamilies?: ReadonlySet<SbcFamily>,
  citationStatuses?: CitationStatusIndex,
): string {
  // ── Step 0: Structured Advisory citation tokens (Step 3.1 fix) ───────────
  // Format: [SBC-XXX | ... | Section X.Y.Z | conf:high|medium|low|ambiguous | ...]
  // The token's leading SBC code is authoritative — never use the leading-digit
  // heuristic for these. Token HTML is buffered into placeholders so Step 1 /
  // Step 2 regexes can't double-wrap the inner "SBC 201" / "Section X.Y.Z" text.
  const tokenPlaceholders: string[] = [];
  const escapedWithTokens = escaped.replace(
    /\[(?:[^\[\]\n]{0,300})\]/g,
    (m) => {
      if (/SBC[\s ‑\-]*(201|801|501|401)|community_summary|LLM_SYNTHESIS/i.test(m)) {
        const html = renderCitationToken(m, availableFamilies, citationStatuses);
        const idx = tokenPlaceholders.length;
        tokenPlaceholders.push(html);
        // Sentinel placeholder. Step 1 / Step 2 regexes don't match it.
        return ` CXTOK${idx} `;
      }
      return m;
    },
  );

  // ── Step 0.5: LaTeX-lite — after token buffering (tokens carry no TeX) so
  // chips are untouched, before Step 1/2 so formulas render inside any line.
  const withMath = latexLite(escapedWithTokens);

  // ── Step 1: All named reference patterns (keyword + number) ──────────────
  // Bare references (outside structured tokens) still use the leading-digit
  // heuristic. The Step-0 spans are protected because their HTML is currently
  // replaced by CXTOK sentinels.
  let s = withMath
    // SBC document-level refs (no section) — clickable, open document view
    .replace(/\bSBC[\u00A0 \u2011\-]*201\b/g,
      '<span class="cx-src" data-src="sbc201" style="color:#0094B3;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;font-weight:600" title="انقر لفتح SBC 201">$&</span>')
    .replace(/\bSBC[\u00A0 \u2011\-]*801\b/g,
      '<span class="cx-src" data-src="sbc801" style="color:#0094B3;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;font-weight:600" title="انقر لفتح SBC 801">$&</span>')
    .replace(/\bSBC[\s\-]*501\b/g,
      '<span class="cx-src" data-src="sbc501" style="color:#0094B3;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;font-weight:600" title="انقر لفتح SBC 501">$&</span>')
    .replace(/\bSBC[\s\-]*401\b/g,
      '<span class="cx-src" data-src="sbc401" style="color:#0094B3;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;font-weight:600" title="انقر لفتح SBC 401">$&</span>')
    // Arabic: الفقرة (clause / paragraph)
    .replace(/الفقرة\s+(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "clause", m, "انقر لفتح الفقرة "))
    // Arabic: القسم (section)
    .replace(/القسم\s+(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "section", m, "انقر لفتح القسم "))
    // Arabic: جدول (table)
    .replace(/جدول\s+(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "table", m, "انقر لفتح الجدول "))
    // Arabic: شكل (figure)
    .replace(/شكل\s+(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "figure", m, "انقر لفتح الشكل "))
    // Arabic: البند (item / clause)
    .replace(/البند\s+(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "clause", m, "انقر لفتح البند "))
    // Arabic: المادة (article)
    .replace(/المادة\s+(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "clause", m, "انقر لفتح المادة "))
    // English: Section / §
    .replace(/(?:Section|§)\s*(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "section", m, "Click to open Section "))
    // English: Table
    .replace(/\bTable\s+(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "table", m, "Click to open Table "))
    // English: Clause / Art. / Article
    .replace(/\b(?:Clause|Art\.|Article)\s+(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "clause", m, "Click to open "))
    // English: Figure / Fig.
    .replace(/\b(?:Figure|Fig\.)\s+(\d{3,4}(?:\.\d{1,3}){0,3})/g,
      (m, sec) => refSpan(getSrc(sec), sec, "figure", m, "Click to open Figure "));

  // ── Step 2: Bare dotted section numbers (e.g. "1014.6", "1006.3.3") ──────
  // Runs ONLY on text nodes to prevent double-wrapping already-linked spans.
  // Pattern: 3-4 leading digits, dot, 1-3 sub-digits, optional further levels.
  s = replaceInTextNodes(
    s,
    /\b(\d{3,4}\.\d{1,3}(?:\.\d{1,3})*)\b/g,
    (match, sec) => refSpan(getSrc(sec), sec, "section", match, "انقر لفتح القسم "),
  );

  // ── Step 3: Badges, markers, bold, inline code ────────────────────────────
  const final = s
    // Compliance badges
    .replace(/✅\s*(مطابق|Compliant)/gi,
      '<span class="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 text-xs font-medium">✅ $1</span>')
    .replace(/❌\s*(غير مطابق|Non-?Compliant)/gi,
      '<span class="inline-flex items-center gap-1 bg-red-500/15 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 text-xs font-medium">❌ $1</span>')
    .replace(/⚠️\s*(مشروط|Conditional)/gi,
      '<span class="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5 text-xs font-medium">⚠️ $1</span>')
    // Fact vs assumption inline markers (Advisory Vision prompt — Step 3)
    .replace(/\(CONFIRMED\)/g,
      '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[0.7em] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 mx-0.5 leading-none">✓ confirmed</span>')
    .replace(/\(INFERRED\)/g,
      '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[0.7em] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/25 mx-0.5 leading-none">~ inferred</span>')
    .replace(/\(مؤكد\)/g,
      '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[0.7em] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 mx-0.5 leading-none">✓ مؤكد</span>')
    .replace(/\(مستنتج\)/g,
      '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[0.7em] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/25 mx-0.5 leading-none">~ مستنتج</span>')
    // Bold — mode-aware
    .replace(/\*\*([^*]+)\*\*/g, (_, txt) => getBoldHtml(txt, mode))
    // Inline code
    .replace(/`([^`]+)`/g,
      '<code class="bg-muted/80 px-1.5 py-0.5 rounded text-[0.82em] font-mono text-primary/90 border border-border/40">$1</code>');

  // ── Step 4: Restore Step-0 token placeholders ────────────────────────────
  return final.replace(/ CXTOK(\d+) /g, (_, n) => tokenPlaceholders[Number(n)] ?? "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement 3 (Analysis) — SBC Legal Citation for blockquotes & code fences
// ─────────────────────────────────────────────────────────────────────────────
function renderTextLine(
  line: string,
  index: number,
  mode?: ChatMode,
  availableFamilies?: ReadonlySet<SbcFamily>,
  citationStatuses?: CitationStatusIndex,
) {
  // Lone ">" (the model sometimes emits an empty quote marker between a quote
  // and its translation) — used to render as a literal stray character.
  if (line.trim() === ">") return <div key={index} className="h-2" />;

  // Box-drawing ASCII diagrams (strategy trees, floor stacks). Rendered as RTL
  // proportional <p> lines these shatter visually; force monospace + LTR +
  // no-wrap per line so columns stay aligned.
  if (/[┌┐└┘├┤┬┴┼│╔╗╚╝╠╣║]/.test(line)) {
    return (
      <div key={index} dir="ltr"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                 whiteSpace: "pre", overflowX: "auto", lineHeight: 1.4,
                 fontSize: "0.78rem", color: "hsl(var(--muted-foreground))" }}>
        {line}
      </div>
    );
  }

  // Blockquote
  if (line.startsWith("> ")) {
    const inner = applyInlineMarkdown(escapeHtml(line.replace(/^>\s*/, "")), mode, availableFamilies, citationStatuses);
    if (mode === "analysis") {
      return (
        <blockquote key={index} className="sbc-legal-citation leading-[1.8] my-2"
          dangerouslySetInnerHTML={{ __html: inner }} />
      );
    }
    return (
      <blockquote key={index}
        className="border-s-2 border-primary/40 ps-4 my-3 text-muted-foreground italic leading-[1.8]"
        dangerouslySetInnerHTML={{ __html: inner }} />
    );
  }

  // Fenced code block (triple backtick lines passed individually)
  if (line.startsWith("```")) {
    return mode === "analysis"
      ? <div key={index} className="sbc-code-fence" />
      : <hr key={index} className="border-border/20 my-1" />;
  }

  // Requirement 2 — Bullet list with geometric icon
  if (line.match(/^[-•]\s/) || line.match(/^-\s*\[.\]\s/)) {
    const isChecklist = line.match(/^-\s*\[(.)]\s/);
    const checked = isChecklist?.[1] === "x" || isChecklist?.[1] === "X";
    const rawContent = line.replace(/^[-•]\s*(\[.\]\s)?/, "");
    const inner = applyInlineMarkdown(escapeHtml(rawContent), mode, availableFamilies, citationStatuses);

    return (
      <li key={index} className="flex items-start gap-2.5 text-foreground leading-[1.8] mb-[10px] list-none">
        {isChecklist ? (
          <span className={`mt-1 flex-shrink-0 ${checked ? "text-emerald-400" : "text-muted-foreground"}`}>
            {checked ? "✓" : "○"}
          </span>
        ) : (
          <BulletIcon mode={mode} />
        )}
        <span dangerouslySetInnerHTML={{ __html: inner }} />
      </li>
    );
  }

  // Requirement 2 — Numbered list with accent-colored numbers
  if (line.match(/^\d+\.\s/)) {
    const numMatch = line.match(/^(\d+)\.\s(.*)$/);
    const num = numMatch?.[1] ?? "";
    const rest = applyInlineMarkdown(escapeHtml(numMatch?.[2] ?? ""), mode, availableFamilies, citationStatuses);
    const numColor = getNumberColor(mode);

    return (
      <li key={index} className="flex items-start gap-2.5 text-foreground leading-[1.8] mb-[10px] list-none">
        <span style={{ color: numColor, fontWeight: 700, minWidth: "1.5rem", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          {num}.
        </span>
        <span dangerouslySetInnerHTML={{ __html: rest }} />
      </li>
    );
  }

  // Empty line → real breathing space between paragraphs
  if (!line.trim()) return <div key={index} className="h-4" />;

  // Regular paragraph
  const processed = applyInlineMarkdown(escapeHtml(line), mode, availableFamilies, citationStatuses);
  return (
    <p key={index} className="text-foreground leading-[1.8] my-2"
      dangerouslySetInnerHTML={{ __html: processed }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TextRenderer
// ─────────────────────────────────────────────────────────────────────────────
function TextRenderer({
  content,
  mode,
  availableFamilies,
  citationStatuses,
}: {
  content: string;
  mode?: ChatMode;
  availableFamilies?: ReadonlySet<SbcFamily>;
  citationStatuses?: CitationStatusIndex;
}) {
  const lines = content.split("\n");
  return <>{lines.map((line, i) => renderTextLine(line, i, mode, availableFamilies, citationStatuses))}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement 2 — Table: rounded corners, zebra rows, scrollable, dark header
// R19: added scroll-shadow affordance for mobile
// ─────────────────────────────────────────────────────────────────────────────
function TableRenderer({ tableData, mode, availableFamilies, citationStatuses }: {
  tableData: { headers: string[]; rows: string[][] };
  mode?: ChatMode;
  availableFamilies?: ReadonlySet<SbcFamily>;
  citationStatuses?: CitationStatusIndex;
}) {
  // Cells used to be dropped in as PLAIN TEXT: "**مؤكد**" showed its
  // asterisks, citation tokens showed raw brackets, TeX showed dollar signs.
  // Run the same inline pipeline every paragraph gets.
  const cellHtml = (cell: string) =>
    applyInlineMarkdown(escapeHtml(cell), mode, availableFamilies, citationStatuses);
  return (
    <div
      className="my-4 rounded-lg border border-border/40 shadow-sm relative"
      style={{
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        // Subtle right-edge fade as scroll affordance on mobile
        background: "linear-gradient(to right, transparent 85%, rgba(0,212,255,0.04) 100%)",
      }}
    >
      <table
        className="w-full text-sm"
        style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "400px" }}
      >
        <thead>
          <tr>
            {tableData.headers.map((header, i) => (
              <th
                key={i}
                className="px-3 py-2 sm:px-4 sm:py-3 text-right font-semibold text-foreground whitespace-nowrap text-xs sm:text-sm"
                style={{
                  fontWeight: 600,
                  background: "hsl(var(--muted) / 0.7)",
                  borderBottom: "1px solid hsl(var(--border) / 0.6)",
                  borderRight: i > 0 ? "1px solid hsl(var(--border) / 0.3)" : undefined,
                  borderRadius: i === 0 ? "6px 0 0 0" : i === tableData.headers.length - 1 ? "0 6px 0 0" : undefined,
                }}
                dangerouslySetInnerHTML={{ __html: cellHtml(header) }}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, rowIndex) => {
            const isEven = rowIndex % 2 === 0;
            return (
              <tr
                key={rowIndex}
                style={{
                  background: isEven ? "transparent" : "hsl(var(--muted) / 0.18)",
                  transition: "background 0.15s",
                }}
                className="hover:bg-primary/5"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-3 py-2 sm:px-4 sm:py-2.5 text-foreground align-top leading-[1.7] text-xs sm:text-sm"
                    style={{
                      borderBottom: rowIndex < tableData.rows.length - 1 ? "1px solid hsl(var(--border) / 0.25)" : undefined,
                      borderRight: cellIndex > 0 ? "1px solid hsl(var(--border) / 0.2)" : undefined,
                    }}
                    dangerouslySetInnerHTML={{ __html: cellHtml(cell) }}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement 3 (Consultant) — Accordion Cards: professional deep-analysis UI
// ─────────────────────────────────────────────────────────────────────────────
function CollapsibleSection({
  title, content, sectionKey, mode, availableFamilies, citationStatuses,
}: {
  title: string;
  content: string;
  sectionKey: string;
  mode?: ChatMode;
  availableFamilies?: ReadonlySet<SbcFamily>;
  citationStatuses?: CitationStatusIndex;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const icon = getSectionIcon(title);
  const colorClass = getSectionColor(title);
  const parsedContent = useMemo(() => parseTextContent(content), [content]);
  const isConsultant = mode === "standard";

  return (
    <div className={cn(
      "my-3 rounded-xl border overflow-hidden backdrop-blur-sm border-l-4",
      colorClass,
      isConsultant
        ? "border-border/70 bg-card/65 shadow-md shadow-black/20"
        : "border-border/60 bg-card/40",
    )}>
      {/* ── Header ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between gap-3",
          isConsultant ? "px-5 py-4" : "px-4 py-3",
          "hover:bg-muted/50 transition-colors duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          isOpen && "bg-muted/35 border-b border-border/40",
        )}
        aria-expanded={isOpen}
        aria-controls={sectionKey}
      >
        <div className="flex items-center gap-3 text-right min-w-0">
          <span className="text-primary/80 flex-shrink-0">{icon}</span>
          <span className={cn("font-semibold text-foreground truncate", isConsultant ? "text-[0.88rem]" : "text-sm")}>
            {title}
          </span>
          {isConsultant && (
            <span className="hidden sm:inline text-xs text-muted-foreground/60 font-normal flex-shrink-0">
              {isOpen ? "— إخفاء التحليل" : "— عرض التحليل الكامل"}
            </span>
          )}
        </div>
        <div className={cn(
          "flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0",
          "bg-primary/10 text-primary transition-transform duration-300 ease-in-out",
          isOpen && "rotate-180",
        )}>
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </button>

      {/* ── Body ── */}
      <div
        id={sectionKey}
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className={cn("px-5 py-4", isConsultant ? "bg-muted/12" : "bg-muted/8")}>
          {parsedContent.map((section, i) => {
            if (section.type === "table" && section.tableData)
              return <TableRenderer key={i} tableData={section.tableData} mode={mode} availableFamilies={availableFamilies} citationStatuses={citationStatuses} />;
            if (section.type === "divider")
              return <hr key={i} className="my-3 border-border/30" />;
            return <TextRenderer key={i} content={section.content} mode={mode} availableFamilies={availableFamilies} citationStatuses={citationStatuses} />;
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible Headings — H3/H4 grouped with their following content
// ─────────────────────────────────────────────────────────────────────────────
type GroupedSection =
  | ParsedSection
  | { type: "collapsible-heading"; title: string; level: 3 | 4; children: ParsedSection[] };

function groupCollapsibleHeadings(sections: ParsedSection[]): GroupedSection[] {
  const result: GroupedSection[] = [];
  let i = 0;
  while (i < sections.length) {
    const s = sections[i];
    if (s.type === "heading" && (s.level === 3 || s.level === 4)) {
      const children: ParsedSection[] = [];
      i++;
      while (i < sections.length && sections[i].type !== "heading") {
        children.push(sections[i++]);
      }
      result.push({
        type: "collapsible-heading",
        title: s.content,
        level: s.level as 3 | 4,
        children,
      });
    } else {
      result.push(s);
      i++;
    }
  }
  return result;
}

function HeadingCollapsible({
  title, level, children, mode, availableFamilies, citationStatuses,
}: {
  title: string; level: 3 | 4; children: ParsedSection[]; mode?: ChatMode;
  availableFamilies?: ReadonlySet<SbcFamily>;
  citationStatuses?: CitationStatusIndex;
}) {
  const accent =
    mode === "primary"  ? "rgba(0,212,255,0.06)"  :
    mode === "standard" ? "rgba(255,140,0,0.06)"  :
    mode === "analysis" ? "rgba(220,20,60,0.06)"  : "rgba(255,255,255,0.04)";
  const borderColor =
    mode === "primary"  ? "rgba(0,212,255,0.25)"  :
    mode === "standard" ? "rgba(255,140,0,0.25)"  :
    mode === "analysis" ? "rgba(220,20,60,0.25)"  : "rgba(255,255,255,0.12)";
  const summaryColor =
    mode === "primary"  ? "#00D4FF" :
    mode === "standard" ? "#FF8C00" :
    mode === "analysis" ? "#DC143C" : "inherit";

  return (
    <details
      open
      style={{
        margin: "10px 0",
        borderRadius: "8px",
        border: `1px solid ${borderColor}`,
        background: accent,
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          padding: "9px 14px",
          cursor: "pointer",
          fontWeight: level === 3 ? 500 : 400,
          fontSize: level === 3 ? "0.875rem" : "0.82rem",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: summaryColor,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: "0.6rem", opacity: 0.55, transition: "transform 0.2s" }}>▼</span>
        {title}
      </summary>
      <div style={{ padding: "6px 14px 12px", borderTop: `1px solid ${borderColor}` }}>
        {children.map((sec, i) => {
          if (sec.type === "table" && sec.tableData)
            return <TableRenderer key={i} tableData={sec.tableData} mode={mode} availableFamilies={availableFamilies} citationStatuses={citationStatuses} />;
          if (sec.type === "divider")
            return <hr key={i} className="my-3 border-border/30" />;
          return <TextRenderer key={i} content={sec.content} mode={mode} availableFamilies={availableFamilies} citationStatuses={citationStatuses} />;
        })}
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement 1 — Main Component: Typography, RTL, line-height 1.8
// ─────────────────────────────────────────────────────────────────────────────
const ChatMarkdownRenderer = ({
  content, mode, availableFamilies, citationStatuses: citationStatusItems,
}: ChatMarkdownRendererProps) => {
  // Verdict lookup is derived once per message, not per token.
  const citationStatuses = useMemo(
    () => buildCitationStatusIndex(citationStatusItems),
    [citationStatusItems],
  );
  const { filteredContent, widgets } = useMemo(() => {
    let text = content;
    const extractedWidgets: ParsedSection[] = [];

    // 0a. U+FFFD replacement chars leak from PDF-quoted text — never show them.
    text = text.replace(/�/g, "");
    // 0a2. Gemini escapes pipes inside markdown table cells ("\\|"); the raw
    // backslash reached users and also broke citation-chip matching. A literal
    // backslash-pipe is never wanted — unescape globally.
    text = text.replace(/\\\|/g, "|");
    // 0b. Orphan list numbers: the model sometimes emits "1." on its own line
    // with the item text on the next line; join them so the numbered-list
    // renderer sees one line.
    text = text.replace(/^(\d{1,2})\.\s*\n(?=\S)/gm, "$1. ");

    // 1. Find closed widget blocks
    const closedRegex = /```json\s*consultx-widget\s+([\s\S]*?)```/gi;
    text = text.replace(closedRegex, (match, p1) => {
      try {
        const widgetData = JSON.parse(p1);
        extractedWidgets.push({ type: "widget", content: "", widgetData });
      } catch(e) {
        // Ignore parsing errors to prevent UI crashes
      }
      return "";
    });

    // 2. Find open blocks (incomplete stream)
    const openRegex = /```json\s*consultx-widget[\s\S]*$/gi;
    const hasOpenBlock = openRegex.test(text);
    if (hasOpenBlock) {
      text = text.replace(openRegex, "");
      extractedWidgets.push({ type: "widget-loading", content: "" });
    }

    return { filteredContent: text.trim(), widgets: extractedWidgets };
  }, [content]);

  const rawSections = useMemo(() => parseDetailsBlocks(filteredContent), [filteredContent]);
  const parsedSections = useMemo(() => groupCollapsibleHeadings(rawSections), [rawSections]);
  const sections = useMemo(() => [...parsedSections, ...widgets] as GroupedSection[], [parsedSections, widgets]);
  const isArabic = /[\u0600-\u06FF]/.test(content.slice(0, 300));

  // R19C: mode-adaptive heading accent colors
  const headingAccent =
    mode === "standard" ? "rgba(255,140,0,0.5)"  :   // advisory = amber
    mode === "analysis" ? "rgba(220,20,60,0.5)"  :   // analysis = crimson
    "rgba(0,212,255,0.5)";                            // primary   = cyan
  const headingAccentSoft =
    mode === "standard" ? "rgba(255,140,0,0.25)" :
    mode === "analysis" ? "rgba(220,20,60,0.25)" :
    "rgba(0,212,255,0.25)";

  return (
    <div
      className="prose prose-invert prose-sm max-w-none space-y-3"
      style={{
        lineHeight: 1.8,
        fontFamily: isArabic
          ? "'Cairo', 'Tajawal', 'IBM Plex Sans Arabic', system-ui, sans-serif"
          : "'Inter', system-ui, sans-serif",
      }}
      dir={isArabic ? "rtl" : "ltr"}
    >
      {sections.map((section, index) => {
        // ── Widget Rendering ──────────────────────────────────────────────────
        if (section.type === "widget") {
          return <WidgetRenderer key={index} widgetData={section.widgetData} />;
        }
        if (section.type === "widget-loading") {
          return <WidgetLoading key={index} />;
        }

        // ── Collapsible H3/H4 headings ────────────────────────────────────────
        if (section.type === "collapsible-heading") {
          const s = section as { type: "collapsible-heading"; title: string; level: 3 | 4; children: ParsedSection[] };
          return (
            <HeadingCollapsible
              key={index}
              title={s.title}
              level={s.level}
              children={s.children}
              mode={mode}
              availableFamilies={availableFamilies} citationStatuses={citationStatuses}
            />
          );
        }

        // ── Headings H1/H2 (Req 1: strict font-weight hierarchy) ─────────────
        if (section.type === "heading") {
          const isExecutive = section.content.includes("الخلاصة التنفيذية") || section.content.includes("✅");

          if (section.level === 1) {
            return (
              <h2 key={index}
                className={cn(
                  "mt-6 mb-3 first:mt-0 leading-[1.6] pb-2",
                  isExecutive
                    ? "px-3 py-2 rounded-lg border text-lg"
                    : "text-foreground text-lg",
                )}
                style={{
                  fontWeight: 700,
                  borderBottom: `2px solid ${headingAccent}`,
                  ...(isExecutive ? { background: `${headingAccent}10`, borderColor: headingAccentSoft } : {}),
                  ...(isExecutive ? { color: mode === "standard" ? "#FF8C00" : mode === "analysis" ? "#DC143C" : undefined } : {}),
                }}
              >
                {section.content}
              </h2>
            );
          }

          // H2 — Semibold 600
          return (
            <h2 key={index}
              className={cn(
                "mt-5 mb-3 first:mt-0 leading-[1.6] pb-1.5",
                isExecutive
                  ? "px-3 py-2 rounded-lg border text-base"
                  : "text-foreground text-base",
              )}
              style={{
                fontWeight: 600,
                borderBottom: `1px solid ${headingAccentSoft}`,
                ...(isExecutive ? { background: `${headingAccent}10`, borderColor: headingAccentSoft } : {}),
                ...(isExecutive ? { color: mode === "standard" ? "#FF8C00" : mode === "analysis" ? "#DC143C" : undefined } : {}),
              }}
            >
              {section.content}
            </h2>
          );
        }

        // ── Accordion (Req 3 — Consultant cards) ─────────────────────────────
        if (section.type === "accordion" && section.sectionKey) {
          return (
            <CollapsibleSection
              key={index}
              title={section.title || "تفاصيل"}
              content={section.content || ""}
              sectionKey={section.sectionKey}
              mode={mode}
              availableFamilies={availableFamilies} citationStatuses={citationStatuses}
            />
          );
        }

        // ── Section divider ("---") — a real, styled rule, not literal text ──
        if (section.type === "divider") {
          return (
            <div key={index} aria-hidden className="my-4 flex items-center gap-2">
              <span style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${headingAccentSoft}, transparent)` }} />
            </div>
          );
        }

        // ── Table (Req 2) ─────────────────────────────────────────────────────
        if (section.type === "table" && section.tableData) {
          return <TableRenderer key={index} tableData={section.tableData} mode={mode} availableFamilies={availableFamilies} citationStatuses={citationStatuses} />;
        }

        // ── Regular text ──────────────────────────────────────────────────────
        return (
          <div key={index} className="my-2">
            <TextRenderer content={section.content} mode={mode} availableFamilies={availableFamilies} citationStatuses={citationStatuses} />
          </div>
        );
      })}
    </div>
  );
};

export default ChatMarkdownRenderer;
