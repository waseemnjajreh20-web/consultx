/**
 * 2024 source-intake layer (SBC 401 electrical / SBC 501 mechanical).
 *
 * What is protected here and why:
 *  1. NEW_CODE_CHAPTER_KEYWORDS may only reference chapters that exist in the
 *     measured SBC401_INDEX / SBC501_INDEX — a wrong chapter number EXCLUDES
 *     the right volume rather than down-ranking it (the exact failure B4
 *     repaired in the 201/801 map: 7 phantom chapters, 17 dead entries).
 *  2. The indexes themselves must be internally coherent (parseable ranges,
 *     no duplicate pageRange keys, non-empty chapter lists).
 *  3. The prompt contract's flag-off output stays BYTE-IDENTICAL to the
 *     no-options call, and the flag-on output actually names the new codes —
 *     including the CORE_RULES .replace(), which would strand silently if
 *     rule 1's wording ever drifts.
 */
import { describe, expect, it } from "vitest";
import {
  getNewCodeChapters,
  NEW_CODE_CHAPTER_KEYWORDS,
  SBC401_INDEX,
  SBC501_INDEX,
  selectTargetPageRanges,
} from "../../supabase/functions/fire-safety-chat/chapterIndex";
import {
  CORE_RULES,
  CORE_RULES_AUTHORIZED_LINE,
  getAnalysisPrompt,
  getCoreRules,
  getPrimaryPrompt,
  getSourceScope,
  getSourceScopeBrief,
  getStandardPrompt,
  normalizeNewCodes,
  SOURCE_SCOPE,
  SOURCE_SCOPE_BRIEF,
} from "../../supabase/functions/fire-safety-chat/promptContract";

const chaptersOf = (index: { chapters: number[] }[]) =>
  new Set(index.flatMap((e) => e.chapters));

describe("SBC401/SBC501 measured indexes", () => {
  it.each([
    ["SBC401_INDEX", SBC401_INDEX],
    ["SBC501_INDEX", SBC501_INDEX],
  ])("%s has parseable, unique, non-empty volumes", (_name, index) => {
    const seen = new Set<string>();
    for (const entry of index) {
      expect(entry.pageRange).toMatch(/^\d+-\d+$/);
      const [start, end] = entry.pageRange.split("-").map(Number);
      expect(start).toBeLessThan(end);
      expect(seen.has(entry.pageRange)).toBe(false);
      seen.add(entry.pageRange);
      expect(entry.chapters.length).toBeGreaterThan(0);
    }
  });

  it("volumes are contiguous (no page gaps or overlaps between neighbours)", () => {
    for (const index of [SBC401_INDEX, SBC501_INDEX]) {
      for (let i = 1; i < index.length; i++) {
        const prevEnd = Number(index[i - 1].pageRange.split("-")[1]);
        const nextStart = Number(index[i].pageRange.split("-")[0]);
        expect(nextStart).toBe(prevEnd + 1);
      }
    }
  });

  it("every keyword-map chapter exists in its code's index (no phantom chapters)", () => {
    const known401 = chaptersOf(SBC401_INDEX);
    const known501 = chaptersOf(SBC501_INDEX);
    const phantoms: string[] = [];
    for (const [kw, entry] of Object.entries(NEW_CODE_CHAPTER_KEYWORDS)) {
      for (const ch of entry.sbc401) {
        if (!known401.has(ch)) phantoms.push(`sbc401 "${kw}" -> ${ch}`);
      }
      for (const ch of entry.sbc501) {
        if (!known501.has(ch)) phantoms.push(`sbc501 "${kw}" -> ${ch}`);
      }
    }
    expect(phantoms).toEqual([]);
  });

  it("every index volume is reachable through at least one keyword", () => {
    const reachable401 = new Set<string>();
    const reachable501 = new Set<string>();
    for (const entry of Object.values(NEW_CODE_CHAPTER_KEYWORDS)) {
      selectTargetPageRanges(entry.sbc401, SBC401_INDEX).forEach((r) => {
        if (entry.sbc401.length > 0) reachable401.add(r);
      });
      selectTargetPageRanges(entry.sbc501, SBC501_INDEX).forEach((r) => {
        if (entry.sbc501.length > 0) reachable501.add(r);
      });
    }
    expect(reachable401).toEqual(new Set(SBC401_INDEX.map((e) => e.pageRange)));
    expect(reachable501).toEqual(new Set(SBC501_INDEX.map((e) => e.pageRange)));
  });
});

describe("getNewCodeChapters", () => {
  it("detects Arabic and English electrical terms", () => {
    expect(getNewCodeChapters("متطلبات تأريض اللوحة الرئيسية", []).sbc401Chapters)
      .toContain(54);
    expect(getNewCodeChapters("fire pump power supply requirements", []).sbc401Chapters)
      .toContain(56);
  });

  it("detects mechanical terms and leaves unrelated queries empty", () => {
    expect(getNewCodeChapters("متطلبات تهوية مواقف السيارات", []).sbc501Chapters)
      .toContain(4);
    const none = getNewCodeChapters("ما ارتفاع الدرابزين المطلوب؟", []);
    expect(none.sbc401Chapters).toEqual([]);
    expect(none.sbc501Chapters).toEqual([]);
  });

  it("falls back to translated keywords only when the raw pass found nothing", () => {
    const viaFallback = getNewCodeChapters("no direct terms here", ["duct"]);
    expect(viaFallback.sbc501Chapters).toEqual(expect.arrayContaining([5, 6]));
    const noFallback = getNewCodeChapters("تأريض", ["duct"]);
    expect(noFallback.sbc501Chapters).toEqual([]);
  });
});

describe("prompt contract flag wiring (per-code granularity)", () => {
  const BOTH = ["SBC401", "SBC501"];

  it("empty/absent list is byte-identical to the historical no-options calls", () => {
    expect(getStandardPrompt("ar")).toBe(getStandardPrompt("ar", { newSourceCodes: [] }));
    expect(getAnalysisPrompt("ar")).toBe(getAnalysisPrompt("ar", { newSourceCodes: [] }));
    expect(getPrimaryPrompt()).toBe(getPrimaryPrompt({ newSourceCodes: [] }));
    expect(getSourceScope([])).toBe(SOURCE_SCOPE);
    expect(getSourceScopeBrief([])).toBe(SOURCE_SCOPE_BRIEF);
    expect(getCoreRules([])).toBe(CORE_RULES);
  });

  it("flag-off prompts never name the new codes", () => {
    for (const p of [getStandardPrompt("ar"), getAnalysisPrompt("ar"), getPrimaryPrompt()]) {
      expect(p).not.toContain("SBC 401");
      expect(p).not.toContain("SBC 501");
    }
  });

  it("normalizeNewCodes keeps only known codes in stable order", () => {
    expect(normalizeNewCodes(["SBC501", "SBC401"])).toEqual(BOTH);
    expect(normalizeNewCodes(["sbc501"])).toEqual(["SBC501"]);
    expect(normalizeNewCodes(["SBC901", "junk"])).toEqual([]);
    expect(normalizeNewCodes(undefined)).toEqual([]);
  });

  it("the CORE_RULES authorized-sources replacement actually fires per set", () => {
    expect(CORE_RULES).toContain(CORE_RULES_AUTHORIZED_LINE);
    const both = getCoreRules(BOTH);
    expect(both).toContain("SBC 201, SBC 801, SBC 401 & SBC 501");
    expect(both).not.toContain(CORE_RULES_AUTHORIZED_LINE);
    const only501 = getCoreRules(["SBC501"]);
    expect(only501).toContain("SBC 201, SBC 801 & SBC 501");
    expect(only501).not.toContain("SBC 401");
  });

  it("SOLE-CODE ENABLEMENT NEVER NAMES THE OTHER CODE (no false source claims)", () => {
    const std = getStandardPrompt("ar", { newSourceCodes: ["SBC501"] });
    const ana = getAnalysisPrompt("ar", { newSourceCodes: ["SBC501"] });
    const pri = getPrimaryPrompt({ newSourceCodes: ["SBC501"] });
    for (const p of [std, ana, pri]) {
      expect(p).toContain("SBC 501");
      expect(p).not.toContain("SBC 401");
    }
    expect(getSourceScope(["SBC501"])).not.toContain("SBC 401");
    expect(getSourceScopeBrief(["SBC501"])).not.toContain("SBC 401");
  });

  it("both-codes prompts name both in every mode; NFPA red line survives verbatim", () => {
    const std = getStandardPrompt("ar", { newSourceCodes: BOTH });
    const ana = getAnalysisPrompt("ar", { newSourceCodes: BOTH });
    const pri = getPrimaryPrompt({ newSourceCodes: BOTH });
    for (const p of [std, ana, pri]) {
      expect(p).toContain("SBC 401");
      expect(p).toContain("SBC 501");
    }
    for (const p of [std, ana]) {
      expect(p).toContain("ممنوع في كل الأحوال اختلاق رقم فقرة أو جدول أو صفحة من NFPA");
    }
  });

  it("flag-on keeps the SWITCH markers intact (load-bearing protocol)", () => {
    const pri = getPrimaryPrompt({ newSourceCodes: BOTH });
    expect(pri).toContain("[SWITCH:استشاري]");
    expect(pri).toContain("[SWITCH:تحليلي]");
  });
});
