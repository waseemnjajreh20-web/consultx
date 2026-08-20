/**
 * Parser: AI analytical response markdown ΓåÆ ParsedAnalyticalSections.
 *
 * The analytical prompt (see supabase/functions/fire-safety-chat/index.ts
 * `getAnalysisPrompt`) instructs the model to emit Sections IΓÇôX with
 * stable bilingual headers. This parser detects those headers and slices
 * the content. Anything that doesn't match a known section is kept in
 * `unstructuredNotes` so no content is lost.
 *
 * Safe-by-construction: never throws on bad input; returns whatever it
 * can extract. Falls back to placing everything under `unstructuredNotes`
 * for arbitrary inputs.
 */

import type {
  ComplianceRow,
  ParsedAnalyticalSections,
} from "./reportArtifactTypes";

type SectionKey = keyof ParsedAnalyticalSections;

/**
 * Section header detectors. Each pattern recognizes any of:
 *   - a markdown heading (#, ##, ###)
 *   - an optional Roman numeral prefix (I., II., III., ... X.)
 *   - the bilingual Arabic + English label, either alone or separated by /
 *   - optional bold-wrap (**...**)
 *
 * Patterns are case-insensitive and multiline.
 */
const SECTION_PATTERNS: Array<{
  key: Exclude<SectionKey, "intro" | "unstructuredNotes">;
  re: RegExp;
}> = [
  {
    key: "classification",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:I\.?\s*)?[ΓÇö\-:\s]*(?:╪¬╪╡┘å┘è┘ü ╪º┘ä┘à╪┤╪▒┘ê╪╣|Project Classification)/im,
  },
  {
    key: "inputsReviewed",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:II\.?\s*)?[ΓÇö\-:\s]*(?:╪º┘ä┘à╪»╪«┘ä╪º╪¬ ╪º┘ä┘à╪│╪¬╪╣╪▒╪╢╪⌐|Inputs Reviewed)/im,
  },
  {
    key: "codePathGoverning",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:III\.?\s*)?[ΓÇö\-:\s]*(?:┘à╪│╪º╪▒ ╪º┘ä┘â┘ê╪» ╪º┘ä╪¡╪º┘â┘à|Governing Code Path)/im,
  },
  {
    key: "keyRequirements",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:IV\.?\s*)?[ΓÇö\-:\s]*(?:╪º┘ä╪º╪┤╪¬╪▒╪º╪╖╪º╪¬ ╪º┘ä╪▒╪ª┘è╪│┘è╪⌐ ╪º┘ä┘à┘å╪╖╪¿┘é╪⌐|Key Requirements)/im,
  },
  {
    key: "engineeringAnalysis",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:V\.?\s*)?[ΓÇö\-:\s]*(?:╪º┘ä╪¬╪¡┘ä┘è┘ä ╪º┘ä┘ç┘å╪»╪│┘è|Engineering Analysis)/im,
  },
  {
    key: "conflictsRisk",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:VI\.?\s*)?[ΓÇö\-:\s]*(?:┘à┘å╪º╪╖┘é ╪º┘ä╪«╪╖╪▒ ┘ê╪º┘ä╪¬╪╣╪º╪▒╪╢|Conflicts? (?:and|&) Risk Areas?)/im,
  },
  {
    key: "missingInfo",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:VII\.?\s*)?[ΓÇö\-:\s]*(?:╪º┘ä┘à╪╣┘ä┘ê┘à╪º╪¬ ╪º┘ä╪¡╪▒╪¼╪⌐ ╪º┘ä┘å╪º┘é╪╡╪⌐|Missing Critical Information)/im,
  },
  {
    key: "reviewPosition",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:VIII\.?\s*)?[ΓÇö\-:\s]*(?:╪º┘ä┘à┘ê┘é┘ü ╪º┘ä╪ú┘ê┘ä┘è ┘ä┘ä┘à╪▒╪º╪¼╪╣╪⌐|Preliminary Review Position)/im,
  },
  {
    key: "complianceVerdict",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:IX\.?\s*)?[ΓÇö\-:\s]*(?:╪¡┘â┘à ╪º┘ä╪º┘à╪¬╪½╪º┘ä|Compliance Verdict)/im,
  },
  {
    key: "nextActions",
    re: /^\s*(?:#{1,4}\s*)?(?:\*\*\s*)?(?:X\.?\s*)?[ΓÇö\-:\s]*(?:╪º┘ä╪Ñ╪¼╪▒╪º╪í╪º╪¬ ┘ê╪º┘ä╪¬┘ê╪╢┘è╪¡╪º╪¬ ╪º┘ä┘à╪╖┘ä┘ê╪¿╪⌐|Required Clarifications (?:and|&) Next Actions)/im,
  },
];

interface HeaderHit {
  key: Exclude<SectionKey, "intro" | "unstructuredNotes">;
  index: number;
  matchedLineLength: number;
}

/**
 * Locate every section header in the text. Returns hits sorted by
 * character offset. Each key appears at most once (first match wins).
 */
function locateHeaders(text: string): HeaderHit[] {
  const hits: HeaderHit[] = [];
  for (const { key, re } of SECTION_PATTERNS) {
    const m = re.exec(text);
    if (m && m.index !== undefined) {
      const line = m[0];
      hits.push({ key, index: m.index, matchedLineLength: line.length });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

/**
 * Detect canonical closing disclaimer line(s) from the analytical prompt.
 * Captured verbatim if found; otherwise the generator supplies a default.
 */
const DISCLAIMER_PATTERNS: RegExp[] = [
  /┘ç╪░╪º ╪º┘ä╪¬╪¡┘ä┘è┘ä ┘è┘à╪½┘ä ╪º┘ä╪¡╪» ╪º┘ä╪ú╪»┘å┘ë ╪º┘ä┘ü┘å┘è[^\n]*/m,
  /This analysis represents the technical minimum[^\n]*/im,
];

export function extractDisclaimer(text: string): string | null {
  for (const re of DISCLAIMER_PATTERNS) {
    const m = re.exec(text);
    if (m && m[0]) return m[0].trim();
  }
  return null;
}

/**
 * Parse a full analytical assistant response into structured sections.
 * Robust against partial/malformed output ΓÇö any content that does not
 * match a known section is preserved under `unstructuredNotes`.
 */
export function parseAnalyticalMessage(content: string): ParsedAnalyticalSections {
  const result: ParsedAnalyticalSections = {};

  if (!content || !content.trim()) return result;

  const headers = locateHeaders(content);

  if (headers.length === 0) {
    // Nothing recognized ΓÇö preserve content for the report.
    result.unstructuredNotes = content.trim();
    return result;
  }

  // Intro = anything before the first known header
  const introRaw = content.slice(0, headers[0].index).trim();
  if (introRaw) result.intro = stripLeadingHeader(introRaw);

  for (let i = 0; i < headers.length; i++) {
    const cur = headers[i];
    const next = headers[i + 1];
    const sliceEnd = next ? next.index : content.length;
    const block = content.slice(cur.index, sliceEnd);

    // Strip the heading line from the start of the block.
    const trimmed = stripFirstLine(block).trim();
    if (trimmed) {
      result[cur.key] = trimmed;
    }
  }

  return result;
}

function stripFirstLine(block: string): string {
  const idx = block.indexOf("\n");
  if (idx < 0) return "";
  return block.slice(idx + 1);
}

function stripLeadingHeader(text: string): string {
  // If the intro accidentally starts with a generic markdown heading,
  // keep it ΓÇö it may be a useful project title.
  return text.trim();
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Compliance Matrix extraction (Section V markdown table)
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

/**
 * Extract a compliance matrix from a markdown table inside the engineering
 * analysis section. The analytical prompt mandates this table with
 * columns: ╪º┘ä╪╣┘å╪╡╪▒ | ╪º┘ä┘à╪¬╪╖┘ä╪¿ | ╪º┘ä┘à╪▒╪¼╪╣ | ╪º┘ä╪¡╪º┘ä╪⌐ | ┘à┘ä╪º╪¡╪╕╪º╪¬
 * (item | requirement | reference | status | notes).
 *
 * Returns an empty array if no table is found or if the table shape is
 * unexpected ΓÇö never throws.
 */
export function extractComplianceMatrix(
  engineeringAnalysis: string | undefined,
): ComplianceRow[] {
  if (!engineeringAnalysis) return [];

  const lines = engineeringAnalysis.split(/\r?\n/);
  const rows: ComplianceRow[] = [];

  // Find a markdown table ΓÇö first row with pipes followed by a separator
  // line of dashes/pipes.
  let tableStart = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes("|") && /^[\s|:\-]+$/.test(lines[i + 1].trim())) {
      tableStart = i;
      break;
    }
  }
  if (tableStart < 0) return [];

  // Iterate body rows starting after the separator line.
  for (let i = tableStart + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.includes("|")) break;
    const cells = parseTableCells(line);
    if (cells.length < 2) continue;

    // Map to ComplianceRow with safe defaults for short rows.
    const [item, requirement, reference, statusLabel, notes] = [
      cells[0] || "",
      cells[1] || "",
      cells[2] || "",
      cells[3] || "",
      cells[4] || "",
    ];

    rows.push({
      item,
      requirement,
      reference,
      status: detectStatus(statusLabel),
      statusLabel,
      notes,
    });
  }

  return rows;
}

function parseTableCells(line: string): string[] {
  // Drop the optional leading/trailing pipes, then split.
  const inner = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  return inner.split("|").map((c) => c.trim());
}

function detectStatus(label: string): ComplianceRow["status"] {
  if (!label) return "unknown";
  const lower = label.toLowerCase();
  if (label.includes("Γ£à") || /┘à╪¬┘ê╪º┘ü┘é(?!.*╪║┘è╪▒)/.test(label) || /\bcompliant\b/i.test(lower)) {
    if (/╪║┘è╪▒/.test(label) || /\bnon[\s-]?compliant\b/i.test(lower)) return "non_compliant";
    return "compliant";
  }
  if (label.includes("Γ¥î") || /╪║┘è╪▒ ┘à╪¬┘ê╪º┘ü┘é/.test(label) || /\bnon[\s-]?compliant\b/i.test(lower)) {
    return "non_compliant";
  }
  if (label.includes("ΓÜá") || /┘è╪¡╪¬╪º╪¼ ╪¬╪¡┘é┘é|┘à╪┤╪▒┘ê╪╖/.test(label) || /\b(?:conditional|needs verification)\b/i.test(lower)) {
    return "conditional";
  }
  return "unknown";
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Recommendation extraction (Section X)
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

/**
 * Extract a flat list of recommendation/next-action items from Section X.
 * Looks for markdown list items (- or *) and checklist boxes ([ ]/[x]).
 * Falls back to splitting by newlines for unstructured content.
 */
export function extractRecommendations(
  nextActions: string | undefined,
): string[] {
  if (!nextActions) return [];

  const lines = nextActions.split(/\r?\n/);
  const items: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip section headers if they leaked through
    if (/^#{1,4}\s/.test(line)) continue;
    // Match list / checklist items
    const m =
      line.match(/^[-*ΓÇó]\s*(?:\[\s*[xX ]?\s*\]\s*)?(.+)$/) ||
      line.match(/^\d+[.)]\s+(.+)$/);
    if (m) {
      const text = m[1].trim();
      if (text) items.push(text);
    }
  }

  return items;
}
