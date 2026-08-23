/**
 * Unit tests for the SBC chapter/volume index
 * (supabase/functions/fire-safety-chat/chapterIndex.ts).
 *
 * Subject: risk R1 in docs/audits/advisory-retrieval-truth-20260823.md — the
 * chapter/volume index used to send queries to the wrong storage volume
 * because it was transcribed from a printed table of contents instead of
 * measured from the actual PDF file splits. chapterIndex.ts (2026-08-23)
 * replaced the old index with one measured from the running headers of all
 * 3,861 pages of the 18 split PDFs. See
 * docs/audits/chapter-volume-map-20260823.md for the full evidence table and
 * the item-3 storage re-upload finding.
 *
 * Scope of what this file can prove, and why:
 * - chapterIndex.ts exports SBC201_INDEX, SBC801_INDEX and
 *   selectTargetPageRanges — pure data/logic, no Deno APIs — and those are
 *   imported and exercised directly here, the same pattern
 *   src/__tests__/geminiResilience.test.ts uses for
 *   supabase/functions/fire-safety-chat/geminiResilience.ts.
 * - getTargetChapters(), CHAPTER_KEYWORDS and AR_EN_GLOSSARY are NOT
 *   exported and still live inside supabase/functions/fire-safety-chat/index.ts,
 *   a file this task is explicitly forbidden from editing or importing from
 *   (three other agents are concurrently editing it). They cannot be
 *   imported here.
 * - Instead, the exact CHAPTER_KEYWORDS output for "sprinkler" / "رشاش" /
 *   "رشاشات" and the chapter cross-reference rule were read directly out of
 *   index.ts (confirmed byte-identical at HEAD and in the current working
 *   tree — see the audit doc, section 1) and are reproduced below as
 *   literal, source-cited fixtures with exact line-number citations. This
 *   proves "given what the keyword map measurably yields for a sprinkler
 *   query, selectTargetPageRanges sends it to the volume that really
 *   contains chapter 9" — it does not re-implement or re-verify
 *   getTargetChapters()'s full regex/glossary machinery, which is out of
 *   this file's exclusive scope.
 */
import { describe, it, expect } from "vitest";
import {
  SBC201_INDEX,
  SBC801_INDEX,
  selectTargetPageRanges,
} from "../../supabase/functions/fire-safety-chat/chapterIndex.ts";
import type { FilePageRange } from "../../supabase/functions/fire-safety-chat/chapterIndex.ts";

// ---------------------------------------------------------------------------
// Fixture 1: CHAPTER_KEYWORDS output for sprinkler terms.
//
// UPDATED 2026-08-23 (B4) — the mapping was REPAIRED, so this fixture and the
// expectation below moved with it. This is a deliberate flip, not a retune to
// make a red test green.
//
// What it was (index.ts at HEAD, the state B2 pinned on purpose):
//   "sprinkler": { sbc201: [9], sbc801: [6, 7] },
//   "رشاش":      { sbc201: [9], sbc801: [6, 7] },
//   "رشاشات":    { sbc201: [9], sbc801: [6, 7] },
//
// What it is now:
//   "sprinkler": { sbc201: [9], sbc801: [7, 9] },
//   "رشاش":      { sbc201: [9], sbc801: [7, 9] },
//   "رشاشات":    { sbc201: [9], sbc801: [7, 9] },
//
// Why: SBC 801 chapter 9 is the sprinkler chapter (Section 903 automatic
// sprinkler systems). Measured, it spans volume "401-600" pp.62-200 and volume
// "601-800" pp.1-68. The old [6, 7] never named chapter 9 at all; it reached
// "401-600" only by the accident that chapters 6 and 7 co-locate there with 9,
// and it never reached "601-800". Chapter 6 is "Building Services and Systems",
// which is not sprinklers, so it was dropped. The measured before/after
// reachability table for both codes is in
// docs/audits/advisory-vector-bench-20260823.md.
// ---------------------------------------------------------------------------
const SPRINKLER_KEYWORD_CHAPTERS = { sbc201: [9], sbc801: [7, 9] } as const;

/**
 * getTargetChapters()'s chapter cross-reference rule.
 * Source: index.ts working-tree lines 1232-1240 (HEAD lines 1342-1350,
 * identical):
 *   if (sbc201Chapters.has(9) || sbc201Chapters.has(10)) { sbc801 += 6, 7 }
 *   if (sbc801Chapters.has(6) || sbc801Chapters.has(7)) { sbc201 += 9, 10 }
 * Reproduced (not imported — getTargetChapters is unexported, and index.ts
 * is locked for this task) to build the same final chapter sets a real
 * "sprinkler" query produces in production.
 */
function applyCrossReference(sbc201: Set<number>, sbc801: Set<number>): void {
  if (sbc201.has(9) || sbc201.has(10)) {
    sbc801.add(6);
    sbc801.add(7);
  }
  if (sbc801.has(6) || sbc801.has(7)) {
    sbc201.add(9);
    sbc201.add(10);
  }
}

function targetChaptersForSprinklerQuery(): { sbc201: number[]; sbc801: number[] } {
  const sbc201 = new Set<number>(SPRINKLER_KEYWORD_CHAPTERS.sbc201);
  const sbc801 = new Set<number>(SPRINKLER_KEYWORD_CHAPTERS.sbc801);
  applyCrossReference(sbc201, sbc801);
  return {
    sbc201: [...sbc201].sort((a, b) => a - b),
    sbc801: [...sbc801].sort((a, b) => a - b),
  };
}

// ---------------------------------------------------------------------------
// Fixture 2: the OLD (pre-2026-08-23) SBC801_INDEX, reproduced verbatim from
// `git show HEAD:supabase/functions/fire-safety-chat/index.ts` lines
// 562-623 — the version chapterIndex.ts replaced. topics/topicsAr are
// omitted (not needed for selectTargetPageRanges, which reads only
// `chapters` and `pageRange`).
// ---------------------------------------------------------------------------
const OLD_SBC801_INDEX: FilePageRange[] = [
  { pageRange: "1-200", chapters: [1, 2, 3, 4, 5], topics: [], topicsAr: [] },
  { pageRange: "201-400", chapters: [6, 7, 8, 9], topics: [], topicsAr: [] },
  { pageRange: "401-600", chapters: [10, 11, 12, 13, 14], topics: [], topicsAr: [] },
  { pageRange: "601-800", chapters: [15, 16, 17, 18], topics: [], topicsAr: [] },
  { pageRange: "801-1000", chapters: [19, 20, 21, 22, 23, 24], topics: [], topicsAr: [] },
  { pageRange: "1001-1200", chapters: [25, 26, 27, 28, 29, 30], topics: [], topicsAr: [] },
  { pageRange: "1201-1400", chapters: [31, 32, 33, 34, 35, 36], topics: [], topicsAr: [] },
  { pageRange: "1401-1600", chapters: [37, 38, 39, 40, 41, 42], topics: [], topicsAr: [] },
  { pageRange: "1601-1800", chapters: [43, 44, 45, 46, 47, 48], topics: [], topicsAr: [] },
  {
    pageRange: "1801-2061",
    chapters: [49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60],
    topics: [],
    topicsAr: [],
  },
];

describe("sprinkler query routing (R1)", () => {
  it("CHAPTER_KEYWORDS + cross-reference yields the measured chapters for a sprinkler query (item 1.a)", () => {
    const { sbc201, sbc801 } = targetChaptersForSprinklerQuery();
    // sbc201: [9] direct from CHAPTER_KEYWORDS, +10 via cross-reference.
    expect(sbc201).toEqual([9, 10]);
    // sbc801 CHANGED 2026-08-23 (B4): was [6, 7], now [6, 7, 9].
    //
    // B2 pinned [6, 7] deliberately, to record the defect its comment
    // described: CHAPTER_KEYWORDS never named chapter 9 for a plain "sprinkler"
    // query, so the volume holding the sprinkler chapter was reached only by
    // the accident that SBC801_INDEX co-locates chapters 6, 7, 8 and 9 in
    // "401-600" — and volume "601-800", which holds chapter 9 pp.1-68, was
    // never reached at all.
    //
    // The map has now been repaired: "sprinkler" maps to sbc801 [7, 9]. The 6
    // in the expectation below is no longer a direct keyword value — it is
    // added by getTargetChapters()'s cross-reference rule, which injects 6 and
    // 7 whenever sbc201 contains 9 or 10 (index.ts, "Cross-referencing: always
    // include both codes for fire/egress"). That rule is out of scope here and
    // was not touched.
    //
    // This expectation was flipped BECAUSE the map was fixed. It must never be
    // satisfied the other way round — reverting CHAPTER_KEYWORDS to [6, 7] to
    // make a red test green would re-open the defect. Evidence and the
    // before/after reachability table for both codes:
    // docs/audits/advisory-vector-bench-20260823.md.
    expect(sbc801).toEqual([6, 7, 9]);
  });

  it("the corrected SBC801_INDEX sends the sprinkler query to the volume that really holds chapter 9 (item 1.b)", () => {
    const { sbc801 } = targetChaptersForSprinklerQuery();
    const ranges = selectTargetPageRanges(sbc801, SBC801_INDEX);
    expect(ranges).toContain("401-600");

    // Confirm *why* 401-600 is reachable: its measured chapters include 9
    // (Fire Protection and Life Safety Systems — automatic sprinklers,
    // Section 903), the single largest concentration of chapter 9 in the
    // corpus per the chapterIndex.ts header (139 measured pages).
    const vol = SBC801_INDEX.find((v) => v.pageRange === "401-600")!;
    expect(vol.chapters).toContain(9);
  });

  it("the OLD index would have excluded 401-600 for the same query — the R1 defect, demonstrated (item 1.b)", () => {
    const { sbc801 } = targetChaptersForSprinklerQuery();
    const oldRanges = selectTargetPageRanges(sbc801, OLD_SBC801_INDEX);

    expect(oldRanges).not.toContain("401-600");
    expect(oldRanges).toEqual(["201-400"]);

    // The old index claimed 201-400 held chapters 6-9 and 401-600 held
    // chapters 10-14, so a sprinkler query (chapters 6, 7) matched only
    // 201-400. The measured truth shows 201-400's real chapters are
    // [2, 3, 4, 5, 6] — chapter 9 never appears there; it starts at 401-600.
    // scoreFile() in index.ts gives 0 to any file whose page range does not
    // overlap a selected target range, so under the old index the volume
    // holding the real sprinkler content (401-600) was never even a
    // candidate — silently excluded, not merely down-ranked.
    const oldClaim201to400 = OLD_SBC801_INDEX.find((v) => v.pageRange === "201-400")!;
    expect(oldClaim201to400.chapters).toEqual([6, 7, 8, 9]); // old claim

    const measured201to400 = SBC801_INDEX.find((v) => v.pageRange === "201-400")!;
    expect(measured201to400.chapters).not.toContain(9); // measured truth
    expect(measured201to400.chapters).toEqual([2, 3, 4, 5, 6]);
  });
});

// ---------------------------------------------------------------------------
// Self-validation (item 1.c): every volume's last measured chapter equals
// the next volume's first measured chapter, no gaps, no overlaps.
// ---------------------------------------------------------------------------
interface BoundaryResult {
  from: string;
  to: string;
  lastOfPrev: number;
  firstOfNext: number;
  matches: boolean;
}

function boundaryChecks(index: FilePageRange[]): BoundaryResult[] {
  const results: BoundaryResult[] = [];
  for (let i = 0; i < index.length - 1; i++) {
    const prev = index[i];
    const next = index[i + 1];
    const lastOfPrev = Math.max(...prev.chapters);
    const firstOfNext = Math.min(...next.chapters);
    results.push({
      from: prev.pageRange,
      to: next.pageRange,
      lastOfPrev,
      firstOfNext,
      matches: lastOfPrev === firstOfNext,
    });
  }
  return results;
}

function range(a: number, b: number): number[] {
  const r: number[] = [];
  for (let n = a; n <= b; n++) r.push(n);
  return r;
}

describe("chapter/volume boundary self-validation (item 1.c)", () => {
  it("SBC801: every one of the 9 volume boundaries has last(prev) === first(next)", () => {
    const results = boundaryChecks(SBC801_INDEX);
    expect(results).toHaveLength(9);
    for (const r of results) {
      expect(
        r.matches,
        `SBC801 ${r.from} -> ${r.to}: last=${r.lastOfPrev} first=${r.firstOfNext}`,
      ).toBe(true);
    }
  });

  it("SBC201: the boundary property holds for 6 of the 7 volume transitions — the one exception is a documented finding, not papered over", () => {
    const results = boundaryChecks(SBC201_INDEX);
    expect(results).toHaveLength(7);

    const mismatches = results.filter((r) => !r.matches);
    // FINDING: the chapterIndex.ts header comment states the property
    // "holds for all 8 SBC 201 volumes". Measured directly against the
    // `chapters` arrays, it holds for 6 of the 7 boundaries. The sole
    // exception is volume "1-250" -> "251-500": chapter 3 ends exactly at
    // 1-250's last measured page (250) and chapter 4 begins fresh at
    // 251-500's first measured page (1) — a clean chapter break, not a
    // split chapter, so last(3) != first(4). This is NOT a gap (chapter 4
    // immediately follows chapter 3 — no chapter number is skipped) and NOT
    // an overlap (chapter 3 is not duplicated into volume 2); it is simply a
    // transition the "equals" framing does not describe. See
    // docs/audits/chapter-volume-map-20260823.md for the full boundary
    // table and the header-comment correction this finding produced.
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      from: "1-250",
      to: "251-500",
      lastOfPrev: 3,
      firstOfNext: 4,
    });
  });

  it("SBC201: full coverage of chapters 1-33 and 35 with no gaps (34 RESERVED correctly excluded)", () => {
    const all = new Set<number>();
    for (const vol of SBC201_INDEX) for (const c of vol.chapters) all.add(c);
    const sorted = [...all].sort((a, b) => a - b);
    const expected = [...range(1, 33), 35];
    expect(sorted).toEqual(expected);
    expect(all.has(34)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Real chapter numbering respected — no invented chapters (item 1.d).
// SBC 801 runs chapters 1-12, 20-39, 50-67 and 80 (52 RESERVED). Chapters
// 13-19, 40-49 and 68-79 do not exist.
// ---------------------------------------------------------------------------
describe("SBC 801 real chapter numbering (item 1.d)", () => {
  it("no chapter from the non-existent ranges 13-19, 40-49, 68-79 appears anywhere in SBC801_INDEX", () => {
    const all = new Set<number>();
    for (const vol of SBC801_INDEX) for (const c of vol.chapters) all.add(c);

    const nonExistent = [...range(13, 19), ...range(40, 49), ...range(68, 79)];
    for (const n of nonExistent) {
      expect(all.has(n), `chapter ${n} does not exist in SBC 801 but appears in SBC801_INDEX`).toBe(
        false,
      );
    }
  });

  it("SBC801_INDEX's chapter coverage is exactly the real numbering scheme (1-12, 20-39, 50-51 & 53-67, 80)", () => {
    const all = new Set<number>();
    for (const vol of SBC801_INDEX) for (const c of vol.chapters) all.add(c);
    const sorted = [...all].sort((a, b) => a - b);

    // 52 is RESERVED per the chapterIndex.ts header and is correctly
    // excluded, same treatment as SBC201's reserved chapter 34.
    const expected = [...range(1, 12), ...range(20, 39), ...range(50, 67), 80].filter(
      (n) => n !== 52,
    );
    expect(sorted).toEqual(expected);
    expect(all.has(52)).toBe(false);
  });

  it("the OLD SBC801_INDEX, by contrast, invented a dense 1..60 sequence that does not exist in the real code", () => {
    const oldAll = new Set<number>();
    for (const vol of OLD_SBC801_INDEX) for (const c of vol.chapters) oldAll.add(c);
    // The old index placed chapters as high as 60 in a dense run, including
    // numbers (13-19, 40-49) that SBC 801 does not have at all.
    expect(oldAll.has(15)).toBe(true); // invented — does not exist
    expect(oldAll.has(45)).toBe(true); // invented — does not exist
  });
});
