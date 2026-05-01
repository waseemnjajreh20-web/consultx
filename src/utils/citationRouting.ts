/**
 * Pure helpers for citation → source family routing (Step 3.2 hard-stop).
 *
 * Rule: an inline citation token's explicit document code (SBC-201 or SBC-801)
 * is authoritative. The click handler MUST NEVER open a PDF from a different
 * code family — even when DB lookups or chunk metadata point at one.
 */

import type { SourceMeta } from "./sourceMetadata";

export type CitationSrcKey =
  | "sbc201"
  | "sbc801"
  | "synthesis"
  | "ambiguous"
  | string
  | undefined;

/** Map a token's `data-src` key to the canonical SourceMeta documentCode. */
export function expectedDocCode(srcKey: CitationSrcKey): "SBC-201" | "SBC-801" | null {
  if (srcKey === "sbc201") return "SBC-201";
  if (srcKey === "sbc801") return "SBC-801";
  return null;
}

/** True iff `meta` belongs to the family the token requested. */
export function isFamilyMatch(meta: SourceMeta | null | undefined, srcKey: CitationSrcKey): boolean {
  const expected = expectedDocCode(srcKey);
  if (!expected || !meta) return false;
  return meta.documentCode === expected;
}

/** First resolved source whose family matches the token (or null). */
export function findSameFamilySource(
  resolved: ReadonlyArray<SourceMeta>,
  srcKey: CitationSrcKey,
): SourceMeta | null {
  const expected = expectedDocCode(srcKey);
  if (!expected) return null;
  return resolved.find((m) => m.documentCode === expected) ?? null;
}

/** Set of `documentCode` values present in the resolved sources (excluding UNKNOWN). */
export function availableFamilies(resolved: ReadonlyArray<SourceMeta>): Set<"SBC-201" | "SBC-801"> {
  const out = new Set<"SBC-201" | "SBC-801">();
  for (const m of resolved) {
    if (m.documentCode === "SBC-201" || m.documentCode === "SBC-801") out.add(m.documentCode);
  }
  return out;
}
