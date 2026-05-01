/**
 * Pure parser for inline Advisory citation tokens.
 *
 * Tokens are emitted by the Step-1 ADVISORY_EVIDENCE_CONFIDENCE_CAP rule, e.g.:
 *   [SBC-201 Section 903.2.7 | conf:high]
 *   [SBC 201 | Chapter 3 | Section 309.1 | conf:high]
 *   [SBC-801 chunk pp.411-435 | conf:medium | section_label:ambiguous]
 *   [community_summary | LLM_SYNTHESIS | conf:low]
 *
 * Goal: route by the EXPLICIT document code in the token, never by section
 * number heuristic. This prevents wrong-family routing where bare "Section
 * 309.1" near SBC-801-only sources opened the wrong PDF.
 */

export type CitationSource = "sbc201" | "sbc801" | "synthesis" | "ambiguous";
export type CitationConfidence = "high" | "medium" | "low" | "ambiguous" | null;

export interface ParsedCitation {
  /** Authoritative source family from the token (never inferred from digits). */
  src: CitationSource;
  /** Section number if a `Section X.Y.Z` pattern was inside the token. */
  sectionRef: string | null;
  /** Table number if a `Table X.Y.Z` pattern was inside the token. */
  tableRef: string | null;
  /** Confidence label parsed from `conf:...`. */
  confidence: CitationConfidence;
  /** True when the token signals labeling ambiguity — UI should not deep-link. */
  isAmbiguous: boolean;
  /** Page range if `pp.NNN-NNN` was in the token. */
  pageStart: number | null;
  pageEnd: number | null;
}

const SBC_CODE_RX = /SBC[\s ‑\-]*(201|801)/i;
const SECTION_RX = /Section\s+(\d{3,4}(?:\.\d{1,3}){0,3})/i;
const TABLE_RX = /Table\s+(\d{3,4}(?:\.\d{1,3}){0,3})/i;
const CONF_RX = /conf\s*:\s*(high|medium|low|ambiguous)/i;
const SECTION_LABEL_RX = /section_label\s*:\s*(\w+)/i;
const PP_RX = /pp\.?\s*(\d+)[-–](\d+)/i;
const SYNTHESIS_RX = /community_summary|LLM_SYNTHESIS/i;

/**
 * Parse a bracketed citation token. The input MUST include the surrounding
 * brackets (matching the live model output format).
 *
 * Returns null if the input is not a recognized citation token.
 */
export function parseCitationToken(raw: string): ParsedCitation | null {
  if (!raw || raw.length < 3) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1);

  const isSynthesis = SYNTHESIS_RX.test(inner);
  const docMatch = inner.match(SBC_CODE_RX);

  // Token must reference an SBC code or be a synthesis chip; otherwise it's
  // not one of ours.
  if (!docMatch && !isSynthesis) return null;

  let src: CitationSource;
  if (isSynthesis && !docMatch) {
    src = "synthesis";
  } else if (docMatch?.[1] === "201") {
    src = "sbc201";
  } else if (docMatch?.[1] === "801") {
    src = "sbc801";
  } else {
    src = "ambiguous";
  }

  const secMatch = inner.match(SECTION_RX);
  const tableMatch = inner.match(TABLE_RX);
  const confMatch = inner.match(CONF_RX);
  const sectionLabel = inner.match(SECTION_LABEL_RX);
  const pp = inner.match(PP_RX);

  const confidence: CitationConfidence = confMatch
    ? (confMatch[1].toLowerCase() as CitationConfidence)
    : null;
  const isAmbiguous =
    src === "synthesis" ||
    src === "ambiguous" ||
    confidence === "ambiguous" ||
    confidence === "low" ||
    (sectionLabel?.[1]?.toLowerCase() === "ambiguous");

  return {
    src,
    sectionRef: secMatch?.[1] ?? null,
    tableRef: tableMatch?.[1] ?? null,
    confidence,
    isAmbiguous,
    pageStart: pp ? parseInt(pp[1], 10) : null,
    pageEnd: pp ? parseInt(pp[2], 10) : null,
  };
}
