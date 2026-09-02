/**
 * Citation verifier — section anchoring and status precedence.
 *
 * Measured live on 2026-09-03: the ingest chunker labels a chunk with its
 * PARENT section (a 903.2.11.3 paragraph sits in a chunk whose section_number
 * is 903.2.11), so the first production run of the verifier flagged verbatim
 * quotes as "unverified" purely because the exact section label was absent.
 * These tests pin the corrected contract: a verbatim same-code quote is the
 * evidence and stays verified; ancestor sections and section numbers printed
 * inside the evidence text anchor a token; the section check only decides
 * when the quote is missing or weak.
 */
import { describe, it, expect } from "vitest";
import {
  isAncestorSection,
  mentionsSection,
  verifyCitations,
  type VerifierChunk,
} from "../../supabase/functions/fire-safety-chat/citationVerifier.ts";

const SENTENCE =
  "An automatic sprinkler system shall be installed throughout buildings that have a floor level located 16.5 m or more above the lowest level of fire department vehicle access.";

function chunk(section: string | null, content = SENTENCE): VerifierChunk {
  return {
    code: "SBC-801",
    section,
    page: 412,
    content,
    fileName: "SBC 801 - Fire Code_251-500_extracted_chunks.json",
  };
}

const QUOTED = `النص: "${SENTENCE}" [SBC-801 Section 903.2.11.3 | conf:high]`;
const UNQUOTED = "يلزم نظام مرشات في هذه الحالة [SBC-801 Section 903.2.11.3 | conf:high]";

describe("isAncestorSection / mentionsSection", () => {
  it("recognises dot-boundary ancestors only", () => {
    expect(isAncestorSection("903.2.11", "903.2.11.3")).toBe(true);
    expect(isAncestorSection("903", "903.2.11.3")).toBe(true);
    expect(isAncestorSection("903.2.1", "903.2.11.3")).toBe(false);
    expect(isAncestorSection("903.2.11.3", "903.2.11.3")).toBe(false);
    expect(isAncestorSection(null, "903.2.11.3")).toBe(false);
  });

  it("finds a section number printed as a whole token in the evidence", () => {
    expect(mentionsSection("see 903.2.11.3 Buildings 16.5 m or more", "903.2.11.3")).toBe(true);
    expect(mentionsSection("see 903.2.11.30 Buildings", "903.2.11.3")).toBe(false);
    expect(mentionsSection("see 1903.2.11.3", "903.2.11.3")).toBe(false);
    expect(mentionsSection("", "903.2.11.3")).toBe(false);
  });
});

describe("status precedence", () => {
  it("verbatim quote + parent-section chunk → verified, anchored by evidence", () => {
    const r = verifyCitations(QUOTED, [chunk("903.2.11")]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].status).toBe("verified");
    expect(r.items[0].reasons).toContain("quote_verbatim");
    expect(r.items[0].reasons).not.toContain("section_unanchored");
  });

  it("verbatim quote + section printed in the text → verified, anchored by content", () => {
    // 1010.1 is not an ancestor of 903.2.11.3, so only the printed number can anchor it.
    const r = verifyCitations(QUOTED, [chunk("1010.1", `903.2.11.3 ${SENTENCE}`)]);
    expect(r.items[0].status).toBe("verified");
    expect(r.items[0].reasons).toContain("section_printed_in_evidence");
  });

  it("verbatim quote with nothing anchoring the section → still verified, reason recorded", () => {
    const r = verifyCitations(QUOTED, [chunk("1010.1")]);
    expect(r.items[0].status).toBe("verified");
    expect(r.items[0].reasons).toContain("section_unanchored");
  });

  it("no quote + ancestor anchor → paraphrased", () => {
    const r = verifyCitations(UNQUOTED, [chunk("903.2.11")]);
    expect(r.items[0].status).toBe("paraphrased");
  });

  it("no quote + nothing anchors → unverified", () => {
    const r = verifyCitations(UNQUOTED, [chunk("1010.1")]);
    expect(r.items[0].status).toBe("unverified");
    expect(r.items[0].reasons).toContain("section_unanchored");
  });

  it("known-section index anchors through an ancestor too", () => {
    const known = new Map<string, Set<string>>([["SBC-801", new Set(["903.2.11"])]]);
    const r = verifyCitations(UNQUOTED, [chunk("1010.1")], { knownSections: known });
    expect(r.items[0].status).toBe("paraphrased");
    expect(r.items[0].reasons).toContain("section_from_known_index");
  });

  it("a weak (paraphrased) quote is unverified when unanchored and paraphrased when anchored", () => {
    const loose = `النص: "sprinkler system installed throughout buildings with a floor level 16.5 m above access" [SBC-801 Section 903.2.11.3 | conf:high]`;
    const unanchored = verifyCitations(loose, [chunk("1010.1")]);
    const anchored = verifyCitations(loose, [chunk("903.2.11")]);
    expect(["unverified", "paraphrased"]).toContain(unanchored.items[0].status);
    if (unanchored.items[0].reasons.includes("quote_paraphrased")) {
      expect(unanchored.items[0].status).toBe("unverified");
      expect(anchored.items[0].status).toBe("paraphrased");
    }
  });
});
