/**
 * Regression tests for inline citation token parsing — Step 3.1.
 *
 * Specifically guards against the wrong-family routing bug where clicking
 * `[SBC 201 | Chapter 3 | Section 309.1 | conf:high]` opened SBC 801
 * Section 309 (Powered Industrial Trucks) because the renderer's heuristic
 * picked the family by leading digits and the click handler silently fell
 * back to the only available source family in the message.
 */
import { describe, it, expect } from "vitest";
import { parseCitationToken } from "../utils/inlineCitation";

describe("parseCitationToken", () => {
  it("[SBC 201 | Chapter 3 | Section 309.1 | conf:high] → sbc201 explicitly", () => {
    const r = parseCitationToken("[SBC 201 | Chapter 3 | Section 309.1 | conf:high]");
    expect(r).not.toBeNull();
    expect(r!.src).toBe("sbc201");
    expect(r!.sectionRef).toBe("309.1");
    expect(r!.confidence).toBe("high");
    expect(r!.isAmbiguous).toBe(false);
  });

  it("[SBC 801 | Chapter 3 | Section 309.1 | conf:high] → sbc801 explicitly", () => {
    const r = parseCitationToken("[SBC 801 | Chapter 3 | Section 309.1 | conf:high]");
    expect(r).not.toBeNull();
    expect(r!.src).toBe("sbc801");
    expect(r!.sectionRef).toBe("309.1");
    expect(r!.confidence).toBe("high");
  });

  it("[SBC-801 Section 903.2.7 | conf:medium] → sbc801, medium", () => {
    const r = parseCitationToken("[SBC-801 Section 903.2.7 | conf:medium]");
    expect(r).not.toBeNull();
    expect(r!.src).toBe("sbc801");
    expect(r!.sectionRef).toBe("903.2.7");
    expect(r!.confidence).toBe("medium");
    expect(r!.isAmbiguous).toBe(false);
  });

  it("[SBC-801 chunk pp.411-435 | conf:medium | section_label:ambiguous] → ambiguous", () => {
    const r = parseCitationToken(
      "[SBC-801 chunk pp.411-435 | conf:medium | section_label:ambiguous]",
    );
    expect(r).not.toBeNull();
    expect(r!.src).toBe("sbc801");
    expect(r!.pageStart).toBe(411);
    expect(r!.pageEnd).toBe(435);
    expect(r!.confidence).toBe("medium");
    // section_label:ambiguous flips the flag even when conf is medium
    expect(r!.isAmbiguous).toBe(true);
  });

  it("[community_summary | LLM_SYNTHESIS | conf:low] → synthesis, never deep-links", () => {
    const r = parseCitationToken("[community_summary | LLM_SYNTHESIS | conf:low]");
    expect(r).not.toBeNull();
    expect(r!.src).toBe("synthesis");
    expect(r!.confidence).toBe("low");
    expect(r!.isAmbiguous).toBe(true);
  });

  it("Section number alone (no SBC code) → not a citation token", () => {
    expect(parseCitationToken("[Section 309.1]")).toBeNull();
    expect(parseCitationToken("[just some text]")).toBeNull();
  });

  it("Empty / malformed input → null", () => {
    expect(parseCitationToken("")).toBeNull();
    expect(parseCitationToken("SBC 201 Section 309.1")).toBeNull();
    expect(parseCitationToken("[SBC 201")).toBeNull();
    expect(parseCitationToken("SBC 201]")).toBeNull();
  });

  it("Cross-family attack: [SBC 201 + Section 903.2.7] still routes to sbc201", () => {
    // Even though section 903.x heuristically belongs to SBC 801, an explicit
    // SBC 201 token must route to SBC 201. (This particular pairing is unusual
    // in real prompts but tests the no-heuristic invariant.)
    const r = parseCitationToken("[SBC 201 | Section 903.2.7 | conf:medium]");
    expect(r).not.toBeNull();
    expect(r!.src).toBe("sbc201");
    expect(r!.sectionRef).toBe("903.2.7");
  });

  it("Inverse: [SBC 801 + Section 309.1] still routes to sbc801", () => {
    // The original bug. With explicit SBC 801, it must NEVER fall to sbc201.
    const r = parseCitationToken("[SBC 801 | Section 309.1 | conf:high]");
    expect(r).not.toBeNull();
    expect(r!.src).toBe("sbc801");
    expect(r!.sectionRef).toBe("309.1");
  });

  it("Table token: [SBC 201 | Table 1004.5 | conf:high]", () => {
    const r = parseCitationToken("[SBC 201 | Table 1004.5 | conf:high]");
    expect(r).not.toBeNull();
    expect(r!.src).toBe("sbc201");
    expect(r!.tableRef).toBe("1004.5");
    expect(r!.sectionRef).toBeNull();
  });
});
