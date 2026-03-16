import { useMemo, useState } from "react";
import { ChevronDown, FileText, BookOpen, Calculator, Lightbulb, ClipboardList, Shield, GitCompareArrows, Scale, ListChecks, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMarkdownRendererProps {
  content: string;
}

interface ParsedSection {
  type: "text" | "heading" | "accordion" | "table";
  content: string;
  title?: string;
  level?: number;
  sectionKey?: string;
  tableData?: { headers: string[]; rows: string[][] };
}

// Map section titles to icons
function getSectionIcon(title: string) {
  if (title.includes("البيانات المستخرجة") || title.includes("Extracted Data")) return <Table2 className="w-4 h-4" />;
  if (title.includes("ملخص الفروقات") || title.includes("Differences Summary")) return <GitCompareArrows className="w-4 h-4" />;
  if (title.includes("السند القانوني") || title.includes("Legal Basis")) return <Scale className="w-4 h-4" />;
  if (title.includes("الإجراءات المطلوبة") || title.includes("Required Actions")) return <ListChecks className="w-4 h-4" />;
  if (title.includes("النص المرجعي") || title.includes("English")) return <FileText className="w-4 h-4" />;
  if (title.includes("الترجمة")) return <BookOpen className="w-4 h-4" />;
  if (title.includes("التحليل")) return <Calculator className="w-4 h-4" />;
  if (title.includes("الاشتقاق")) return <Lightbulb className="w-4 h-4" />;
  if (title.includes("توصيات")) return <ClipboardList className="w-4 h-4" />;
  if (title.includes("ملاحظات") || title.includes("AHJ")) return <Shield className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

// Get section color based on type
function getSectionColor(title: string): string {
  if (title.includes("البيانات المستخرجة") || title.includes("Extracted Data")) return "border-l-teal-500";
  if (title.includes("ملخص الفروقات") || title.includes("Differences Summary")) return "border-l-violet-500";
  if (title.includes("السند القانوني") || title.includes("Legal Basis")) return "border-l-blue-700";
  if (title.includes("الإجراءات المطلوبة") || title.includes("Required Actions")) return "border-l-cyan-500";
  if (title.includes("النص المرجعي") || title.includes("English")) return "border-l-blue-500";
  if (title.includes("الترجمة")) return "border-l-green-500";
  if (title.includes("التحليل")) return "border-l-amber-500";
  if (title.includes("الاشتقاق")) return "border-l-purple-500";
  if (title.includes("توصيات")) return "border-l-cyan-500";
  if (title.includes("ملاحظات") || title.includes("AHJ")) return "border-l-rose-500";
  return "border-l-primary";
}

// Parse markdown table
function parseMarkdownTable(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;

  // Check if first line looks like a table header
  const headerLine = lines[0];
  if (!headerLine.includes("|")) return null;

  // Check for separator line
  const separatorLine = lines[1];
  if (!separatorLine.match(/^\|?[\s-:|]+\|?$/)) return null;

  const parseRow = (line: string): string[] => {
    return line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell !== "");
  };

  const headers = parseRow(headerLine);
  const rows: string[][] = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && line.includes("|")) {
      rows.push(parseRow(line));
    }
  }

  if (headers.length === 0) return null;

  return { headers, rows };
}

// Parse <details><summary>...</summary>...</details> blocks and convert to accordion
function parseDetailsBlocks(content: string): ParsedSection[] {
  const sections: ParsedSection[] = [];

  // More robust pattern for details blocks
  const detailsPattern = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;

  let lastIndex = 0;
  let match;
  let sectionCounter = 0;

  while ((match = detailsPattern.exec(content)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) {
        sections.push(...parseTextContent(textBefore));
      }
    }

    // Extract title (strip HTML tags for clean display)
    const rawTitle = match[1];
    const cleanTitle = rawTitle.replace(/<[^>]*>/g, "").trim();
    const accordionContent = match[2].trim();

    sections.push({
      type: "accordion",
      title: cleanTitle,
      content: accordionContent,
      sectionKey: `section-${sectionCounter++}`,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
      sections.push(...parseTextContent(remaining));
    }
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
      if (joined) {
        sections.push({ type: "text", content: joined });
      }
      currentText = [];
    }
  };

  const flushTable = () => {
    if (tableLines.length > 0) {
      const tableText = tableLines.join("\n");
      const tableData = parseMarkdownTable(tableText);
      if (tableData) {
        sections.push({ type: "table", content: tableText, tableData });
      } else {
        // Not a valid table, treat as text
        currentText.push(...tableLines);
      }
      tableLines = [];
      inTable = false;
    }
  };

  for (const line of lines) {
    // Check for headings
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);

    // Check if this line could be a table row
    const isTableRow = line.trim().startsWith("|") || (line.includes("|") && line.match(/^\|?[\s\S]+\|[\s\S]+\|?$/));
    const isTableSeparator = line.match(/^\|?[\s-:|]+\|?$/) && line.includes("-");

    if (h2Match) {
      flushTable();
      flushText();
      sections.push({ type: "heading", content: h2Match[1], level: 2 });
    } else if (h3Match) {
      flushTable();
      flushText();
      sections.push({ type: "heading", content: h3Match[1], level: 3 });
    } else if (isTableRow || isTableSeparator) {
      flushText();
      inTable = true;
      tableLines.push(line);
    } else if (inTable && line.trim() === "") {
      // End of table
      flushTable();
    } else {
      if (inTable) {
        flushTable();
      }
      currentText.push(line);
    }
  }

  flushTable();
  flushText();

  return sections;
}

function renderTextLine(line: string, index: number) {
  // Compliance status badges inline
  let processed = line
    .replace(/✅\s*(مطابق|Compliant)/gi, '<span class="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 rounded-full px-2 py-0.5 text-xs font-medium">✅ $1</span>')
    .replace(/❌\s*(غير مطابق|Non-?Compliant)/gi, '<span class="inline-flex items-center gap-1 bg-red-500/15 text-red-600 border border-red-500/30 rounded-full px-2 py-0.5 text-xs font-medium">❌ $1</span>')
    .replace(/⚠️\s*(مشروط|Conditional)/gi, '<span class="inline-flex items-center gap-1 bg-amber-500/15 text-amber-600 border border-amber-500/30 rounded-full px-2 py-0.5 text-xs font-medium">⚠️ $1</span>');

  // Bold text
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
  
  // Inline code
  processed = processed.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm font-mono">$1</code>');

  // Blockquote
  if (line.startsWith("> ")) {
    return (
      <blockquote
        key={index}
        className="border-r-2 border-primary pr-4 my-2 text-muted-foreground italic"
        dangerouslySetInnerHTML={{ __html: processed.replace(/^>\s*/, "") }}
      />
    );
  }

  // Bullet list
  if (line.match(/^[-•]\s/) || line.match(/^-\s*\[.\]\s/)) {
    const isChecklist = line.match(/^-\s*\[(.)]\s/);
    const checked = isChecklist?.[1] === "x" || isChecklist?.[1] === "X";
    const content = line.replace(/^[-•]\s*(\[.\]\s)?/, "");
    
    return (
      <li key={index} className="flex items-start gap-2 text-foreground mr-4 my-1">
        {isChecklist && (
          <span className={`mt-0.5 ${checked ? "text-green-500" : "text-muted-foreground"}`}>
            {checked ? "✓" : "○"}
          </span>
        )}
        <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
      </li>
    );
  }

  // Numbered list
  if (line.match(/^\d+\.\s/)) {
    return (
      <li
        key={index}
        className="text-foreground mr-4 list-decimal my-1"
        dangerouslySetInnerHTML={{ __html: processed.replace(/^\d+\.\s/, "") }}
      />
    );
  }

  // Empty line
  if (!line.trim()) {
    return <br key={index} />;
  }

  // Regular paragraph
  return (
    <p
      key={index}
      className="text-foreground my-1"
      dangerouslySetInnerHTML={{ __html: processed }}
    />
  );
}

function TextRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  return <>{lines.map((line, i) => renderTextLine(line, i))}</>;
}

// Table Component
function TableRenderer({ tableData }: { tableData: { headers: string[]; rows: string[][] } }) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse bg-card/50 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-primary/10 border-b border-border">
            {tableData.headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-right text-sm font-semibold text-foreground border-l border-border first:border-l-0"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                "border-b border-border/50 last:border-b-0",
                rowIndex % 2 === 0 ? "bg-transparent" : "bg-muted/20"
              )}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-4 py-2 text-sm text-foreground border-l border-border/50 first:border-l-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Collapsible Section Component
function CollapsibleSection({ 
  title, 
  content, 
  sectionKey 
}: { 
  title: string; 
  content: string; 
  sectionKey: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const icon = getSectionIcon(title);
  const colorClass = getSectionColor(title);

  // Parse content for tables
  const parsedContent = useMemo(() => parseTextContent(content), [content]);

  return (
    <div className={cn(
      "my-3 rounded-lg border border-border/60 overflow-hidden bg-card/40 backdrop-blur-sm",
      "border-l-4",
      colorClass
    )}>
      {/* Header / Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3",
          "hover:bg-muted/40 transition-colors duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          isOpen && "bg-muted/30 border-b border-border/40"
        )}
        aria-expanded={isOpen}
        aria-controls={sectionKey}
      >
        <div className="flex items-center gap-3 text-right">
          <span className="text-primary/80">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <div className={cn(
          "flex items-center justify-center w-7 h-7 rounded-full",
          "bg-primary/10 text-primary transition-transform duration-300",
          isOpen && "rotate-180"
        )}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </button>

      {/* Content */}
      <div
        id={sectionKey}
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-5 py-4 bg-muted/10">
          {parsedContent.map((section, index) => {
            if (section.type === "table" && section.tableData) {
              return <TableRenderer key={index} tableData={section.tableData} />;
            }
            return <TextRenderer key={index} content={section.content} />;
          })}
        </div>
      </div>
    </div>
  );
}

const ChatMarkdownRenderer = ({ content }: ChatMarkdownRendererProps) => {
  const sections = useMemo(() => parseDetailsBlocks(content), [content]);
  
  return (
    <div className="prose prose-invert prose-sm max-w-none space-y-2">
      {sections.map((section, index) => {
        if (section.type === "heading") {
          const HeadingTag = section.level === 2 ? "h2" : "h3";
          const isExecutiveSummary = section.content.includes("الخلاصة التنفيذية") || section.content.includes("✅");
          
          return (
            <HeadingTag
              key={index}
              className={cn(
                "font-bold mt-4 mb-3 first:mt-0",
                section.level === 2 
                  ? "text-lg border-b border-primary/30 pb-2" 
                  : "text-base",
                isExecutiveSummary 
                  ? "text-primary bg-primary/5 px-3 py-2 rounded-lg border border-primary/20" 
                  : "text-foreground"
              )}
            >
              {section.content}
            </HeadingTag>
          );
        }

        if (section.type === "accordion" && section.sectionKey) {
          return (
            <CollapsibleSection
              key={index}
              title={section.title || "تفاصيل"}
              content={section.content || ""}
              sectionKey={section.sectionKey}
            />
          );
        }

        if (section.type === "table" && section.tableData) {
          return <TableRenderer key={index} tableData={section.tableData} />;
        }

        // Regular text
        return (
          <div key={index} className="my-2">
            <TextRenderer content={section.content} />
          </div>
        );
      })}
    </div>
  );
};

export default ChatMarkdownRenderer;