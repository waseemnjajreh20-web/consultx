import { useMemo, useState } from "react";
import {
  ChevronDown, FileText, BookOpen, Calculator, Lightbulb,
  ClipboardList, Shield, GitCompareArrows, Scale, ListChecks, Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import WidgetRenderer, { WidgetLoading } from "@/components/widgets/WidgetRenderer";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ChatMode = "primary" | "standard" | "analysis";

interface ChatMarkdownRendererProps {
  content: string;
  mode?: ChatMode;
}

interface ParsedSection {
  type: "text" | "heading" | "accordion" | "table" | "widget" | "widget-loading";
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
function parseMarkdownTable(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const headerLine = lines[0];
  if (!headerLine.includes("|")) return null;
  const separatorLine = lines[1];
  if (!separatorLine.match(/^\|?[\s-:|]+\|?$/)) return null;

  const parseRow = (line: string): string[] =>
    line.split("|").map(c => c.trim()).filter(c => c !== "");

  const headers = parseRow(headerLine);
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && line.includes("|")) rows.push(parseRow(line));
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
    const isTableRow = line.trim().startsWith("|") ||
      (line.includes("|") && line.match(/^\|?[\s\S]+\|[\s\S]+\|?$/));
    const isTableSep = line.match(/^\|?[\s-:|]+\|?$/) && line.includes("-");

    if (h4Match) {
      flushTable(); flushText();
      sections.push({ type: "heading", content: h4Match[1], level: 4 });
    } else if (h3Match) {
      flushTable(); flushText();
      sections.push({ type: "heading", content: h3Match[1], level: 3 });
    } else if (h2Match) {
      flushTable(); flushText();
      sections.push({ type: "heading", content: h2Match[1], level: 2 });
    } else if (h1Match) {
      flushTable(); flushText();
      sections.push({ type: "heading", content: h1Match[1], level: 1 });
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

// Apply inline markdown (bold, code, badges) to an already-escaped string
function applyInlineMarkdown(escaped: string, mode?: ChatMode): string {
  return escaped
    // SBC document inline references — rendered as clickable dotted-underline spans.
    // data-src is picked up by the click-delegation handler in ChatInterface.tsx.
    // Runs FIRST so it matches raw text before bold/badge wrapping.
    .replace(/\bSBC[\u00A0 \u2011\-]*201\b/g,
      '<span class="cx-src" data-src="sbc201" style="color:#0094B3;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;font-weight:600" title="انقر لفتح المرجع">$&</span>')
    .replace(/\bSBC[\u00A0 \u2011\-]*801\b/g,
      '<span class="cx-src" data-src="sbc801" style="color:#0094B3;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;font-weight:600" title="انقر لفتح المرجع">$&</span>')
    // Arabic section references: "القسم 1012" / "القسم 9.3.1" → clickable deep-link
    // Runs before bold so the Arabic word isn't wrapped in bold first.
    .replace(/القسم\s+(\d{3,4}(?:\.\d+)*)/g, (match, sec) => {
      const n = parseInt(sec, 10);
      const src = (n >= 900 && n < 1000) ? "sbc801" : "sbc201";
      return `<span class="cx-src" data-src="${src}" data-section="${sec}" style="color:#0094B3;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;font-weight:600" title="انقر لفتح القسم ${sec}">${match}</span>`;
    })
    // English section references: "Section 1014" / "§1014" / "§ 1014"
    .replace(/(?:Section|§)\s*(\d{3,4}(?:\.\d+)*)/g, (match, sec) => {
      const n = parseInt(sec, 10);
      const src = (n >= 900 && n < 1000) ? "sbc801" : "sbc201";
      return `<span class="cx-src" data-src="${src}" data-section="${sec}" style="color:#0094B3;cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;font-weight:600" title="Click to open Section ${sec}">${match}</span>`;
    })
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement 3 (Analysis) — SBC Legal Citation for blockquotes & code fences
// ─────────────────────────────────────────────────────────────────────────────
function renderTextLine(line: string, index: number, mode?: ChatMode) {
  // Blockquote
  if (line.startsWith("> ")) {
    const inner = applyInlineMarkdown(escapeHtml(line.replace(/^>\s*/, "")), mode);
    if (mode === "analysis") {
      return (
        <blockquote key={index} className="sbc-legal-citation leading-[1.8] my-2"
          dangerouslySetInnerHTML={{ __html: inner }} />
      );
    }
    return (
      <blockquote key={index}
        className="border-r-2 border-primary/40 pr-4 my-2 text-muted-foreground italic leading-[1.8]"
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
    const inner = applyInlineMarkdown(escapeHtml(rawContent), mode);

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
    const rest = applyInlineMarkdown(escapeHtml(numMatch?.[2] ?? ""), mode);
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

  // Empty line → breathing space (not a full <br>)
  if (!line.trim()) return <div key={index} className="h-1.5" />;

  // Regular paragraph
  const processed = applyInlineMarkdown(escapeHtml(line), mode);
  return (
    <p key={index} className="text-foreground leading-[1.8] my-1"
      dangerouslySetInnerHTML={{ __html: processed }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TextRenderer
// ─────────────────────────────────────────────────────────────────────────────
function TextRenderer({ content, mode }: { content: string; mode?: ChatMode }) {
  const lines = content.split("\n");
  return <>{lines.map((line, i) => renderTextLine(line, i, mode))}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement 2 — Table: rounded corners, zebra rows, scrollable, dark header
// ─────────────────────────────────────────────────────────────────────────────
function TableRenderer({ tableData }: { tableData: { headers: string[]; rows: string[][] } }) {
  return (
    <div
      className="my-4 rounded-lg border border-border/40 shadow-sm"
      style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
    >
      <table
        className="w-full text-sm"
        style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "480px" }}
      >
        <thead>
          <tr>
            {tableData.headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap"
                style={{
                  fontWeight: 600,
                  background: "hsl(var(--muted) / 0.7)",
                  borderBottom: "1px solid hsl(var(--border) / 0.6)",
                  borderRight: i > 0 ? "1px solid hsl(var(--border) / 0.3)" : undefined,
                  borderRadius: i === 0 ? "6px 0 0 0" : i === tableData.headers.length - 1 ? "0 6px 0 0" : undefined,
                }}
              >
                {header}
              </th>
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
                    className="px-4 py-2.5 text-foreground align-top leading-[1.8]"
                    style={{
                      borderBottom: rowIndex < tableData.rows.length - 1 ? "1px solid hsl(var(--border) / 0.25)" : undefined,
                      borderRight: cellIndex > 0 ? "1px solid hsl(var(--border) / 0.2)" : undefined,
                    }}
                  >
                    {cell}
                  </td>
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
  title, content, sectionKey, mode,
}: {
  title: string;
  content: string;
  sectionKey: string;
  mode?: ChatMode;
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
              return <TableRenderer key={i} tableData={section.tableData} />;
            return <TextRenderer key={i} content={section.content} mode={mode} />;
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
  title, level, children, mode,
}: {
  title: string; level: 3 | 4; children: ParsedSection[]; mode?: ChatMode;
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
            return <TableRenderer key={i} tableData={sec.tableData} />;
          return <TextRenderer key={i} content={sec.content} mode={mode} />;
        })}
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement 1 — Main Component: Typography, RTL, line-height 1.8
// ─────────────────────────────────────────────────────────────────────────────
const ChatMarkdownRenderer = ({ content, mode }: ChatMarkdownRendererProps) => {
  const { filteredContent, widgets } = useMemo(() => {
    let text = content;
    const extractedWidgets: ParsedSection[] = [];
    
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
  const sections = useMemo(() => [...parsedSections, ...widgets] as ParsedSection[], [parsedSections, widgets]);
  const isArabic = /[\u0600-\u06FF]/.test(content.slice(0, 300));

  return (
    <div
      className="prose prose-invert prose-sm max-w-none space-y-1"
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
                  "mt-5 mb-3 first:mt-0 leading-[1.8] pb-2",
                  "border-b-2 border-primary/40",
                  isExecutive
                    ? "text-primary bg-primary/5 px-3 py-2 rounded-lg border border-primary/20 text-lg"
                    : "text-foreground text-lg",
                )}
                style={{ fontWeight: 700 }}
              >
                {section.content}
              </h2>
            );
          }

          // H2 — Semibold 600
          return (
            <h2 key={index}
              className={cn(
                "mt-4 mb-2.5 first:mt-0 leading-[1.8] pb-1.5",
                "border-b border-primary/25 text-base",
                isExecutive
                  ? "text-primary bg-primary/5 px-3 py-2 rounded-lg border border-primary/20"
                  : "text-foreground",
              )}
              style={{ fontWeight: 600 }}
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
            />
          );
        }

        // ── Table (Req 2) ─────────────────────────────────────────────────────
        if (section.type === "table" && section.tableData) {
          return <TableRenderer key={index} tableData={section.tableData} />;
        }

        // ── Regular text ──────────────────────────────────────────────────────
        return (
          <div key={index} className="my-0.5">
            <TextRenderer content={section.content} mode={mode} />
          </div>
        );
      })}
    </div>
  );
};

export default ChatMarkdownRenderer;
