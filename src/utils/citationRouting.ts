/**
 * Pure helpers for citation → source family routing (Step 3.2 hard-stop).
 *
 * Rule: an inline citation token's explicit document code (SBC-201 or SBC-801)
 * is authoritative. The click handler MUST NEVER open a PDF from a different
 * code family — even when DB lookups or chunk metadata point at one.
 *
 * P5-R6 note: every function below routes strictly off the already-parsed
 * `srcKey` (the token's explicit SBC-201/SBC-801 code, from
 * `parseCitationToken` in ./inlineCitation.ts) — none of them ever re-derive
 * a family from a section number. The section-number "leading digit"
 * heuristic (900-999 -> sbc801) lives only in
 * `src/components/ChatMarkdownRenderer.tsx`'s `getSrc()`, and only applies to
 * bare, unstructured references (no explicit SBC code in the text) — it is
 * never consulted here and never overrides an explicit token code.
 */

import type { SourceMeta } from "./sourceMetadata";

export type CitationSrcKey =
  | "sbc201"
  | "sbc801"
  | "sbc501"
  | "sbc401"
  | "synthesis"
  | "ambiguous"
  | string
  | undefined;

/** Canonical SBC document-code families the citation/preview flow can route. */
export type SbcFamily = "SBC-201" | "SBC-801" | "SBC-501" | "SBC-401";

/** Map a token's `data-src` key to the canonical SourceMeta documentCode. */
export function expectedDocCode(srcKey: CitationSrcKey): SbcFamily | null {
  if (srcKey === "sbc201") return "SBC-201";
  if (srcKey === "sbc801") return "SBC-801";
  if (srcKey === "sbc501") return "SBC-501";
  if (srcKey === "sbc401") return "SBC-401";
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
export function availableFamilies(resolved: ReadonlyArray<SourceMeta>): Set<SbcFamily> {
  const out = new Set<SbcFamily>();
  const known: ReadonlySet<string> = new Set(["SBC-201", "SBC-801", "SBC-501", "SBC-401"]);
  for (const m of resolved) {
    if (known.has(m.documentCode)) out.add(m.documentCode as SbcFamily);
  }
  return out;
}
