/**
 * Step 3.2 hard-stop tests: clicking an inline citation token must NEVER open
 * a PDF from a different code family, and tokens whose family is not in the
 * message's retrieved sources must be marked unsupported (no auto-route).
 */
import { describe, it, expect } from "vitest";
import {
  expectedDocCode,
  isFamilyMatch,
  findSameFamilySource,
  availableFamilies,
} from "../utils/citationRouting";
import { resolveAllSources, resolveSourceMeta, resolveSectionOnlyMatch } from "../utils/sourceMetadata";
import { parseCitationToken } from "../utils/inlineCitation";
import { applyInlineMarkdown } from "../components/ChatMarkdownRenderer";

const SBC201_FILE = "SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json";
const SBC801_FILE = "SBC 801 Ch9 v1_chunks_extracted_chunks.json";

describe("citationRouting hard-stop helpers", () => {
  it("expectedDocCode maps srcKey to canonical documentCode", () => {
    expect(expectedDocCode("sbc201")).toBe("SBC-201");
    expect(expectedDocCode("sbc801")).toBe("SBC-801");
    expect(expectedDocCode("synthesis")).toBeNull();
    expect(expectedDocCode("ambiguous")).toBeNull();
    expect(expectedDocCode(undefined)).toBeNull();
  });

  it("isFamilyMatch rejects cross-family even when meta has a pdfUrl", () => {
    const sbc201 = resolveSourceMeta(SBC201_FILE);
    const sbc801 = resolveSourceMeta(SBC801_FILE);
    expect(isFamilyMatch(sbc201, "sbc201")).toBe(true);
    expect(isFamilyMatch(sbc801, "sbc801")).toBe(true);
    // Hard stop: SBC-201 token must never accept an SBC-801 source.
    expect(isFamilyMatch(sbc801, "sbc201")).toBe(false);
    expect(isFamilyMatch(sbc201, "sbc801")).toBe(false);
    expect(isFamilyMatch(null, "sbc201")).toBe(false);
  });

  it("findSameFamilySource returns null when only the wrong family is present", () => {
    // Live failure scenario: clicked SBC-201 token, message had only SBC-801.
    const resolved = resolveAllSources([SBC801_FILE]);
    expect(findSameFamilySource(resolved, "sbc201")).toBeNull();
    expect(findSameFamilySource(resolved, "sbc801")?.documentCode).toBe("SBC-801");
  });

  it("findSameFamilySource returns the same-family source when present", () => {
    const resolved = resolveAllSources([SBC201_FILE, SBC801_FILE]);
    expect(findSameFamilySource(resolved, "sbc201")?.documentCode).toBe("SBC-201");
    expect(findSameFamilySource(resolved, "sbc801")?.documentCode).toBe("SBC-801");
  });

  it("availableFamilies enumerates document codes present in resolved sources", () => {
    const onlySbc801 = availableFamilies(resolveAllSources([SBC801_FILE]));
    expect(onlySbc801.has("SBC-801")).toBe(true);
    expect(onlySbc801.has("SBC-201")).toBe(false);

    const both = availableFamilies(resolveAllSources([SBC201_FILE, SBC801_FILE]));
    expect(both.has("SBC-201")).toBe(true);
    expect(both.has("SBC-801")).toBe(true);
  });

  it("missing srcKey is never treated as a family match", () => {
    const sbc801 = resolveSourceMeta(SBC801_FILE);
    expect(isFamilyMatch(sbc801, undefined)).toBe(false);
    expect(findSameFamilySource(resolveAllSources([SBC801_FILE]), undefined)).toBeNull();
  });
});

/**
 * P5-R6 (near-term): a structured citation token's explicit document code must
 * ALWAYS win over the leading-digit heuristic — even when the section number
 * falls in the 900-999 band that `getSrc()` would otherwise map to sbc801.
 *
 * These tests drive the REAL pipeline (`applyInlineMarkdown`, exported from
 * ChatMarkdownRenderer.tsx for exactly this purpose) instead of a local copy of
 * the heuristic. That matters: the invariant being protected is an ORDERING one
 * — Step 0 buffers structured tokens into CXTOK sentinels BEFORE Step 1/Step 2
 * run their bare-reference regexes through `getSrc()`. A test that re-implements
 * the heuristic would keep passing if that ordering regressed (Step 0 moved
 * after Step 2, or the CXTOK sentinel changed so Step 2's bare dotted-number
 * regex matched inside a token). Asserting on the rendered HTML catches it.
 */
describe("P5-R6 — explicit token code beats the digit heuristic", () => {
  /** All data-src values in render order. */
  function srcAttrs(html: string): string[] {
    return [...html.matchAll(/data-src="([^"]+)"/g)].map(m => m[1]);
  }

  it("control: a BARE 'Section 903.2.7' really is routed to sbc801 by the heuristic", () => {
    // Establishes that the two paths genuinely disagree on this input — without
    // this, the counter-case below would prove nothing.
    // NOTE on span count: a bare "Section N" is wrapped by Step 1 and then its
    // inner text node is wrapped again by Step 2's bare dotted-number regex, so
    // this renders NESTED spans. That is pre-existing renderer behavior (both
    // spans carry the same data-src, so the click routes identically either
    // way); asserted here as-is rather than idealized, since changing it would
    // be a message-rendering change outside this lane.
    const html = applyInlineMarkdown("See Section 903.2.7 for sprinklers.");
    const srcs = srcAttrs(html);
    expect(srcs.length).toBeGreaterThan(0);
    expect(new Set(srcs)).toEqual(new Set(["sbc801"]));
    expect(html).toContain('data-section="903.2.7"');
  });

  it("counter-case: [SBC-201 Section 903.2.7 | conf:high] renders sbc201, never sbc801", () => {
    // Explicit SBC-201 token carrying a 9xx section — the exact case where the
    // heuristic and the token code point at different PDFs.
    const html = applyInlineMarkdown("[SBC-201 Section 903.2.7 | conf:high]");
    expect(srcAttrs(html)).toEqual(["sbc201"]);
    expect(html).not.toContain('data-src="sbc801"');
    expect(html).toContain('data-section="903.2.7"');
    // Exactly one span: Step 2's bare dotted-number regex must not also wrap
    // the "903.2.7" inside the token (that second span would carry sbc801).
    expect(srcAttrs(html)).toHaveLength(1);
  });

  it("counter-case survives surrounding prose containing a bare 9xx reference", () => {
    // Both forms in one line: the token keeps its explicit code, the bare
    // reference still gets the heuristic. Proves Step 0 protection is scoped to
    // the token and does not suppress normal bare-reference routing.
    const html = applyInlineMarkdown(
      "Per [SBC-201 Section 903.2.7 | conf:high] and also Section 903.4 elsewhere.",
    );
    const srcs = srcAttrs(html);
    // Exactly one sbc201 — the token, and only the token.
    expect(srcs.filter(s => s === "sbc201")).toEqual(["sbc201"]);
    // The bare reference still routes by heuristic (nested spans, see above).
    expect(srcs.filter(s => s === "sbc801").length).toBeGreaterThan(0);
    expect(new Set(srcs)).toEqual(new Set(["sbc201", "sbc801"]));
  });

  it("the parsed token src is what the routing helpers key off", () => {
    const parsed = parseCitationToken("[SBC-201 Section 903.2.7 | conf:high]");
    expect(parsed).not.toBeNull();
    expect(parsed!.src).toBe("sbc201");
    expect(parsed!.sectionRef).toBe("903.2.7");
    expect(expectedDocCode(parsed!.src)).toBe("SBC-201");
  });

  it("bare reference with no SBC code is not a citation token, so the heuristic is the only path left", () => {
    // No explicit code in the text -> parseCitationToken returns null ->
    // Step 0 token-protection never fires -> Step 1/Step 2's getSrc() heuristic
    // is the only thing that can route it.
    expect(parseCitationToken("[Section 903.2.7]")).toBeNull();
    const srcs = srcAttrs(applyInlineMarkdown("Section 903.2.7"));
    expect(srcs.length).toBeGreaterThan(0);
    expect(new Set(srcs)).toEqual(new Set(["sbc801"]));
  });
});

/**
 * P5-R6 (near-term): resolveSectionOnlyMatch — a deep-link resolved ONLY by
 * matching sbc_documents.section_number (exact or parent-prefix sibling)
 * must degrade to page-range presentation, never assert an exact section
 * match. See resolveSectionOnlyMatch's doc comment in sourceMetadata.ts for
 * the full rationale (57.6%-73.1% section_number drift).
 */
describe("P5-R6 — resolveSectionOnlyMatch (section-only DB match honesty)", () => {
  const SBC201_FILE = "SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json";

  it("exact section_number match degrades to chunk_range_only precision + medium confidence", () => {
    const base = resolveSourceMeta(SBC201_FILE);
    // The old (pre-R6) behavior asserted precision: 'page_range' — the
    // "exact" tier. This must never do that.
    const result = resolveSectionOnlyMatch(base, "903.2.7", 120, 122, "exact_number");
    expect(result.precision).toBe("chunk_range_only");
    expect(result.precision).not.toBe("page_range");
    expect(result.sectionRef).toBe("903.2.7");
    expect(result.sectionConfidence).toBe("medium");
    expect(result.pageStart).toBe(120);
    expect(result.pageEnd).toBe(122);
  });

  it("sibling-anchor match degrades to ambiguous confidence (not even the requested section)", () => {
    const base = resolveSourceMeta(SBC201_FILE);
    const result = resolveSectionOnlyMatch(base, "1014.6", 300, 304, "sibling_anchor");
    expect(result.precision).toBe("chunk_range_only");
    expect(result.sectionConfidence).toBe("ambiguous");
    expect(result.sectionRef).toBe("1014.6");
  });

  it("preserves every other field from the base SourceMeta unchanged", () => {
    const base = resolveSourceMeta(SBC201_FILE);
    const result = resolveSectionOnlyMatch(base, "903.2.7", 120, 122, "exact_number");
    expect(result.documentCode).toBe(base.documentCode);
    expect(result.pdfPath).toBe(base.pdfPath);
    expect(result.pdfUrl).toBe(base.pdfUrl);
    expect(result.title).toBe(base.title);
  });
});
