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
import { resolveAllSources, resolveSourceMeta } from "../utils/sourceMetadata";

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
