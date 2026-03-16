import { useState } from "react";
import { ChevronDown, GitCompareArrows, Scale, ListChecks, CheckCircle2, XCircle, AlertTriangle, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface AnalysisResultCardProps {
  content: string;
}

type ComplianceStatus = "compliant" | "non-compliant" | "conditional";

interface ParsedItem {
  text: string;
  status?: ComplianceStatus;
}

function detectStatus(line: string): ComplianceStatus | undefined {
  if (/✅|مطابق|Compliant(?!.*Non)/i.test(line) && !/غير|Non/i.test(line)) return "compliant";
  if (/❌|غير مطابق|Non-?Compliant/i.test(line)) return "non-compliant";
  if (/⚠️|مشروط|Conditional/i.test(line)) return "conditional";
  return undefined;
}

function getStatusBadge(status: ComplianceStatus) {
  const config = {
    "compliant": { icon: CheckCircle2, label: "مطابق", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    "non-compliant": { icon: XCircle, label: "غير مطابق", className: "bg-red-500/15 text-red-600 border-red-500/30" },
    "conditional": { icon: AlertTriangle, label: "مشروط", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  };
  const c = config[status];
  return (
    <Badge className={cn("gap-1 text-xs font-medium border", c.className)}>
      <c.icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );
}

function parseItems(text: string): ParsedItem[] {
  return text.split("\n").filter(l => l.trim()).map(line => ({
    text: line.replace(/^[-•*]\s*/, "").replace(/✅|❌|⚠️/g, "").trim(),
    status: detectStatus(line),
  }));
}

// Parse markdown table into structured data
function parseMarkdownTable(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const headerLine = lines[0];
  if (!headerLine.includes("|")) return null;
  const separatorLine = lines[1];
  if (!separatorLine.match(/^\|?[\s-:|]+\|?$/)) return null;
  const parseRow = (line: string): string[] =>
    line.split("|").map(cell => cell.trim()).filter(cell => cell !== "");
  const headers = parseRow(headerLine);
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && line.includes("|")) rows.push(parseRow(line));
  }
  if (headers.length === 0) return null;
  return { headers, rows };
}

// Render a markdown table as styled HTML table
function MiniTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/40">
      <table className="w-full border-collapse bg-card/30 text-sm">
        <thead>
          <tr className="bg-primary/10 border-b border-border/40">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-right font-semibold text-foreground/90 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-transparent" : "bg-muted/10"}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-foreground/80 border-t border-border/20" dangerouslySetInnerHTML={{
                  __html: cell.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Extracted Data section — renders sub-sections with tables
function ExtractedDataSection({ title, content, defaultOpen = true }: { title: string; content: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  // Split content by ### sub-headers
  const subSections: { title: string; content: string }[] = [];
  const lines = content.split("\n");
  let current = { title: "", content: "" };

  for (const line of lines) {
    const subMatch = line.match(/^###\s+(.+)/);
    if (subMatch) {
      if (current.content.trim() || current.title) subSections.push({ ...current });
      current = { title: subMatch[1].trim(), content: "" };
    } else {
      current.content += line + "\n";
    }
  }
  if (current.content.trim() || current.title) subSections.push({ ...current });

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden bg-card/40 border-l-4 border-l-teal-500">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors",
          open && "bg-muted/30 border-b border-border/40"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-teal-400"><ClipboardList className="w-4 h-4" /></span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <div className={cn("w-7 h-7 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center transition-transform duration-300", open && "rotate-180")}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </button>
      <div className={cn("overflow-hidden transition-all duration-300", open ? "max-h-[4000px] opacity-100" : "max-h-0 opacity-0")}>
        <div className="px-5 py-4 space-y-4">
          {subSections.map((sub, i) => {
            // Try parsing as table
            const tableData = parseMarkdownTable(sub.content);
            return (
              <div key={i} className="space-y-2">
                {sub.title && (
                  <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400/80">{sub.title}</h4>
                )}
                {tableData ? (
                  <MiniTable headers={tableData.headers} rows={tableData.rows} />
                ) : (
                  <div className="text-sm text-foreground/80 space-y-1">
                    {sub.content.split("\n").filter(l => l.trim()).map((l, j) => (
                      <p key={j} dangerouslySetInnerHTML={{
                        __html: l.replace(/^[-•*]\s*/, "").replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                      }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  colorClass: string;
  content: string;
  defaultOpen?: boolean;
}

function Section({ title, icon, colorClass, content, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const items = parseItems(content);

  return (
    <div className={cn("rounded-lg border border-border/60 overflow-hidden bg-card/40 border-l-4", colorClass)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors",
          open && "bg-muted/30 border-b border-border/40"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-primary/80">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <div className={cn("w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center transition-transform duration-300", open && "rotate-180")}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </button>
      <div className={cn("overflow-hidden transition-all duration-300", open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0")}>
        <div className="px-5 py-4 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              {item.status && getStatusBadge(item.status)}
              <span className="text-sm text-foreground" dangerouslySetInnerHTML={{
                __html: item.text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function isVisionAnalysisResponse(content: string): boolean {
  return (
    (content.includes("ملخص الفروقات") || content.includes("Differences Summary")) &&
    (content.includes("السند القانوني") || content.includes("Legal Basis"))
  );
}

export default function AnalysisResultCard({ content }: AnalysisResultCardProps) {
  // Extract sections by headers
  const sections: { type: string; title: string; content: string }[] = [];
  const lines = content.split("\n");
  let currentSection = { type: "intro", title: "", content: "" };

  for (const line of lines) {
    const isExtractedDataHeader = /^#{1,3}\s*.*(البيانات المستخرجة|Extracted Data)/i.test(line);
    const isDiffHeader = /^#{1,3}\s*.*(ملخص الفروقات|Differences Summary)/i.test(line);
    const isLegalHeader = /^#{1,3}\s*.*(السند القانوني|Legal Basis)/i.test(line);
    const isActionsHeader = /^#{1,3}\s*.*(الإجراءات المطلوبة|Required Actions)/i.test(line);

    if (isExtractedDataHeader || isDiffHeader || isLegalHeader || isActionsHeader) {
      if (currentSection.content.trim()) sections.push({ ...currentSection });
      currentSection = {
        type: isExtractedDataHeader ? "extracted" : isDiffHeader ? "diff" : isLegalHeader ? "legal" : "actions",
        title: line.replace(/^#{1,3}\s*/, "").trim(),
        content: "",
      };
    } else {
      currentSection.content += line + "\n";
    }
  }
  if (currentSection.content.trim()) sections.push({ ...currentSection });

  return (
    <div className="space-y-3">
      {sections.map((s, i) => {
        if (s.type === "intro") {
          return (
            <div key={i} className="text-sm text-foreground space-y-1">
              {s.content.split("\n").filter(l => l.trim()).map((l, j) => (
                <p key={j} dangerouslySetInnerHTML={{ __html: l.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
              ))}
            </div>
          );
        }

        // Extracted Data section uses special renderer with tables
        if (s.type === "extracted") {
          return (
            <ExtractedDataSection
              key={i}
              title={s.title}
              content={s.content}
              defaultOpen={true}
            />
          );
        }

        const config = {
          diff: { icon: <GitCompareArrows className="w-4 h-4" />, color: "border-l-violet-500" },
          legal: { icon: <Scale className="w-4 h-4" />, color: "border-l-blue-700" },
          actions: { icon: <ListChecks className="w-4 h-4" />, color: "border-l-cyan-500" },
        }[s.type] || { icon: null, color: "border-l-primary" };

        return (
          <Section
            key={i}
            title={s.title}
            icon={config.icon}
            colorClass={config.color}
            content={s.content}
            defaultOpen={s.type === "diff"}
          />
        );
      })}
    </div>
  );
}
