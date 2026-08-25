/**
 * Tests for supabase/functions/fire-safety-chat/contextBudget.ts (P2).
 *
 * Subject: the combined-budget clamp that caps
 * tableBlock + sbcContext + docBlocks at TOTAL_CONTEXT_CAP characters before
 * the standard/advisory text branch concatenates them into the final system
 * prompt. Pure module (no Deno APIs, no I/O) — same pattern as
 * retrievalPolicy.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clampAssembledContext,
  TOTAL_CONTEXT_CAP,
  TRUNCATION_MARKER,
  type AssembledContextParts,
} from "../../supabase/functions/fire-safety-chat/contextBudget.ts";

const INDEX_PATH = path.resolve(
  __dirname,
  "../../supabase/functions/fire-safety-chat/index.ts",
);
const INDEX_SRC = readFileSync(INDEX_PATH, "utf8");

/** Build a string of exactly `n` characters, made of a repeating marker so
 *  mismatches are easy to spot in a failure diff. */
const chars = (n: number, fill = "x") => fill.repeat(n);

describe("TOTAL_CONTEXT_CAP", () => {
  it("is 120000", () => {
    expect(TOTAL_CONTEXT_CAP).toBe(120000);
  });

  it("matches MAX_TOTAL_CONTEXT in index.ts — the two must never drift apart", () => {
    // index.ts cannot import this module's constant (it is a separate Deno
    // Edge Function entry point that cannot be imported into vitest), so the
    // two constants are declared independently and reconciled here: if
    // someone changes MAX_TOTAL_CONTEXT in index.ts without updating
    // TOTAL_CONTEXT_CAP (or vice versa), this test catches it.
    const m = INDEX_SRC.match(/const MAX_TOTAL_CONTEXT = (\d+);/);
    expect(m, "MAX_TOTAL_CONTEXT not found in index.ts (guards the parser itself)").not.toBeNull();
    const maxTotalContext = Number(m![1]);
    expect(TOTAL_CONTEXT_CAP).toBe(maxTotalContext);
  });

  it("is the default cap when none is passed", () => {
    const parts: AssembledContextParts = { tableBlock: "t", sbcContext: "s", docBlocks: [] };
    const withDefault = clampAssembledContext(parts);
    const withExplicit = clampAssembledContext(parts, TOTAL_CONTEXT_CAP);
    expect(withDefault).toEqual(withExplicit);
  });
});

describe("clampAssembledContext — under cap (the common case)", () => {
  it("returns every field byte-identical (deep equality) when the total is under the cap", () => {
    const parts: AssembledContextParts = {
      tableBlock: "=== TABLE ===\nrow 1\n",
      sbcContext: "=== SBC CONTEXT ===\nsome retrieved text\n",
      docBlocks: ["--- File: a.csv ---\ndata a\n", "--- File: b.csv ---\ndata b\n"],
    };
    const result = clampAssembledContext(parts, 1000);
    expect(result.tableBlock).toEqual(parts.tableBlock);
    expect(result.sbcContext).toEqual(parts.sbcContext);
    expect(result.docBlocks).toEqual(parts.docBlocks);
    expect(result.truncated).toBe(false);
    expect(result.droppedDocBlocks).toBe(0);
  });

  it("returns the SAME docBlocks array reference, not a copy, when under cap", () => {
    const parts: AssembledContextParts = { tableBlock: "t", sbcContext: "s", docBlocks: ["a", "b", "c"] };
    const result = clampAssembledContext(parts, 1000);
    expect(result.docBlocks).toBe(parts.docBlocks);
    expect(result.tableBlock).toBe(parts.tableBlock);
    expect(result.sbcContext).toBe(parts.sbcContext);
  });

  it("totalChars is the exact sum of the three inputs", () => {
    const parts: AssembledContextParts = {
      tableBlock: chars(10),
      sbcContext: chars(20),
      docBlocks: [chars(5), chars(7)],
    };
    const result = clampAssembledContext(parts, 1000);
    expect(result.totalChars).toBe(10 + 20 + 5 + 7);
  });

  it("empty inputs are under cap and stay empty", () => {
    const parts: AssembledContextParts = { tableBlock: "", sbcContext: "", docBlocks: [] };
    const result = clampAssembledContext(parts, TOTAL_CONTEXT_CAP);
    expect(result).toEqual({
      tableBlock: "",
      sbcContext: "",
      docBlocks: [],
      totalChars: 0,
      truncated: false,
      droppedDocBlocks: 0,
    });
  });

  it("a total exactly equal to the cap is NOT truncated (the cap is inclusive)", () => {
    const parts: AssembledContextParts = { tableBlock: chars(10), sbcContext: chars(10), docBlocks: [chars(10)] };
    const result = clampAssembledContext(parts, 30);
    expect(result.truncated).toBe(false);
    expect(result.docBlocks).toEqual(parts.docBlocks);
  });
});

describe("clampAssembledContext — infinite cap is an exact identity pass-through", () => {
  // This is the mechanism that makes flag-OFF behaviour byte-identical to
  // HEAD at ANY size, not merely when the total happens to fit: index.ts
  // passes Number.POSITIVE_INFINITY as the cap on the non-vector (keyword)
  // path, so nothing this module does can truncate content the pre-P2 code
  // would have sent. If that guarantee ever weakens, these fail.
  const overCapParts = (): AssembledContextParts => ({
    tableBlock: chars(TOTAL_CONTEXT_CAP, "t"),
    sbcContext: chars(TOTAL_CONTEXT_CAP, "s"),
    docBlocks: [chars(50_000, "a"), chars(50_000, "b")],
  });

  it("returns inputs unchanged even when the total is far above TOTAL_CONTEXT_CAP", () => {
    const parts = overCapParts();
    const result = clampAssembledContext(parts, Number.POSITIVE_INFINITY);
    expect(result.tableBlock).toBe(parts.tableBlock);
    expect(result.sbcContext).toBe(parts.sbcContext);
    expect(result.docBlocks).toBe(parts.docBlocks); // same array reference
    expect(result.truncated).toBe(false);
    expect(result.droppedDocBlocks).toBe(0);
    expect(result.totalChars).toBe(TOTAL_CONTEXT_CAP * 2 + 100_000);
  });

  it("the same input WOULD be truncated at the finite default cap — proving the pass-through is doing the work", () => {
    const parts = overCapParts();
    expect(clampAssembledContext(parts, TOTAL_CONTEXT_CAP).truncated).toBe(true);
    expect(clampAssembledContext(parts, Number.POSITIVE_INFINITY).truncated).toBe(false);
  });

  it("the assembled prompt string is character-identical to an unclamped concatenation", () => {
    // Reproduces index.ts's concatenation order (tableBlock, then sbcContext,
    // then the joined doc blocks) and asserts the clamped assembly equals the
    // raw one exactly — the byte-identity claim, checked on strings rather
    // than on field-by-field equality.
    const parts = overCapParts();
    const raw = parts.tableBlock + parts.sbcContext + parts.docBlocks.join("");
    const c = clampAssembledContext(parts, Number.POSITIVE_INFINITY);
    const assembled = c.tableBlock + c.sbcContext + c.docBlocks.join("");
    expect(assembled).toBe(raw);
    expect(assembled.length).toBe(raw.length);
  });

  it("index.ts passes an infinite cap on the non-vector path — the flag-OFF guarantee is actually wired up", () => {
    // Source-level guard, same technique as the MAX_TOTAL_CONTEXT drift test
    // above: index.ts is a Deno Edge Function entry point that cannot be
    // imported into vitest, so the wiring is asserted against its text. If
    // someone makes the clamp unconditional again, flag-OFF requests could be
    // truncated where HEAD sent them whole, and this catches it.
    expect(
      /useVector \? TOTAL_CONTEXT_CAP : Number\.POSITIVE_INFINITY/.test(INDEX_SRC),
      "index.ts no longer gates the context-budget cap on useVector",
    ).toBe(true);
  });
});

describe("clampAssembledContext — over cap: tableBlock is never touched", () => {
  it("tableBlock survives unchanged even when the other two are dropped/truncated entirely", () => {
    const parts: AssembledContextParts = {
      tableBlock: "SAFETY-CRITICAL TABLE ROW",
      sbcContext: chars(500),
      docBlocks: [chars(200), chars(200)],
    };
    const result = clampAssembledContext(parts, parts.tableBlock.length); // cap == tableBlock alone
    expect(result.tableBlock).toBe(parts.tableBlock);
    expect(result.truncated).toBe(true);
  });

  it("tableBlock is returned even when it alone exceeds the cap (never truncated, ever)", () => {
    const parts: AssembledContextParts = { tableBlock: chars(200), sbcContext: "", docBlocks: [] };
    const result = clampAssembledContext(parts, 50);
    expect(result.tableBlock).toBe(parts.tableBlock);
    expect(result.tableBlock.length).toBe(200);
  });

  it("when tableBlock alone is over cap, sbcContext collapses to the marker and totalChars exceeds the cap — deliberately", () => {
    // tableBlock's immunity outranks the cap: there is no room left for
    // anything else, so a non-empty sbcContext is reduced to the marker alone
    // (an honest "something was cut here" rather than a silent disappearance)
    // and the reported total is larger than the cap. Documented in the
    // module's contract; asserted here so it cannot change unnoticed.
    const parts: AssembledContextParts = {
      tableBlock: chars(200, "t"),
      sbcContext: chars(100, "s"),
      docBlocks: [chars(10, "a")],
    };
    const result = clampAssembledContext(parts, 50);
    expect(result.tableBlock).toBe(parts.tableBlock);
    expect(result.sbcContext).toBe(TRUNCATION_MARKER);
    expect(result.docBlocks).toEqual([]);
    expect(result.droppedDocBlocks).toBe(1);
    expect(result.totalChars).toBeGreaterThan(50);
  });

  it("an EMPTY sbcContext stays empty (no stray marker) when tableBlock alone is over cap", () => {
    const parts: AssembledContextParts = { tableBlock: chars(200, "t"), sbcContext: "", docBlocks: [chars(10, "a")] };
    const result = clampAssembledContext(parts, 50);
    expect(result.sbcContext).toBe("");
    expect(result.docBlocks).toEqual([]);
  });
});

describe("clampAssembledContext — over cap: docBlocks dropped from the end first", () => {
  it("drops whole trailing docBlocks before touching sbcContext", () => {
    const parts: AssembledContextParts = {
      tableBlock: "",
      sbcContext: chars(50, "s"),
      docBlocks: [chars(20, "a"), chars(20, "b"), chars(20, "c")],
    };
    // Room for sbcContext (50) + exactly the first two doc blocks (40) = 90.
    const result = clampAssembledContext(parts, 90);
    expect(result.sbcContext).toBe(parts.sbcContext); // untouched — it fit whole
    expect(result.docBlocks).toEqual([chars(20, "a"), chars(20, "b")]);
    expect(result.droppedDocBlocks).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it("drops from the END of the array specifically, not from the front or middle", () => {
    const parts: AssembledContextParts = {
      tableBlock: "",
      sbcContext: "",
      docBlocks: ["first", "second", "third", "fourth"],
    };
    // Room for exactly "first" + "second" (11 chars) and nothing else.
    const result = clampAssembledContext(parts, 11);
    expect(result.docBlocks).toEqual(["first", "second"]);
    expect(result.droppedDocBlocks).toBe(2);
  });

  // Budget for the boundary block, chosen relative to TRUNCATION_MARKER's own
  // length (rather than a hand-picked constant) so the "partial truncation"
  // case is exercised regardless of the marker text's exact length: after
  // block 0 (10 chars, kept whole) there is exactly markerLen + 10 chars left
  // — enough for the marker plus 10 real characters of block 1, but not all
  // 50 of it.
  const BOUNDARY_KEEP_LEN = 10;
  const boundaryCap = 10 /* block 0 */ + TRUNCATION_MARKER.length + BOUNDARY_KEEP_LEN;

  it("the boundary block is partial-truncated with the trailing marker instead of being dropped, when room remains", () => {
    const parts: AssembledContextParts = {
      tableBlock: "",
      sbcContext: "",
      docBlocks: [chars(10, "a"), chars(50, "b")],
    };
    const result = clampAssembledContext(parts, boundaryCap);
    expect(result.docBlocks).toHaveLength(2);
    expect(result.docBlocks[0]).toBe(chars(10, "a"));
    expect(result.docBlocks[1]).toBe(chars(BOUNDARY_KEEP_LEN, "b") + TRUNCATION_MARKER);
    expect(result.docBlocks[1].length).toBeLessThan(parts.docBlocks[1].length);
    // The truncated block is present (not dropped), so it does not count
    // toward droppedDocBlocks.
    expect(result.droppedDocBlocks).toBe(0);
    expect(result.totalChars).toBe(boundaryCap);
  });

  it("every block after the truncated boundary block is dropped too — a single contiguous tail cut", () => {
    const parts: AssembledContextParts = {
      tableBlock: "",
      sbcContext: "",
      docBlocks: [chars(10, "a"), chars(50, "b"), chars(10, "c"), chars(10, "d")],
    };
    const result = clampAssembledContext(parts, boundaryCap);
    // Same budget as above: block 0 kept whole, block 1 truncated at the
    // boundary, blocks 2 and 3 dropped even though they might have fit on
    // their own — the cut is deterministic and tail-only.
    expect(result.docBlocks).toHaveLength(2);
    expect(result.docBlocks[1]).toBe(chars(BOUNDARY_KEEP_LEN, "b") + TRUNCATION_MARKER);
    expect(result.droppedDocBlocks).toBe(2);
  });

  it("a SINGLE doc block larger than the whole remaining budget is partial-truncated, not silently dropped", () => {
    // The degenerate one-block case: nothing was kept before it, so the
    // boundary block is also the first block. It must still come back
    // truncated-with-marker rather than as an empty array, otherwise a user
    // who uploaded one big schedule file would see their document vanish
    // with no signal at all.
    const keepLen = 12;
    const cap = TRUNCATION_MARKER.length + keepLen;
    const parts: AssembledContextParts = { tableBlock: "", sbcContext: "", docBlocks: [chars(10_000, "z")] };
    const result = clampAssembledContext(parts, cap);
    expect(result.docBlocks).toHaveLength(1);
    expect(result.docBlocks[0]).toBe(chars(keepLen, "z") + TRUNCATION_MARKER);
    expect(result.droppedDocBlocks).toBe(0);
    expect(result.totalChars).toBe(cap);
  });

  it("a single doc block is dropped outright when there is not even room for the marker", () => {
    const parts: AssembledContextParts = { tableBlock: "", sbcContext: "", docBlocks: [chars(10_000, "z")] };
    const result = clampAssembledContext(parts, TRUNCATION_MARKER.length - 1);
    expect(result.docBlocks).toEqual([]);
    expect(result.droppedDocBlocks).toBe(1);
    expect(result.totalChars).toBe(0);
  });

  it("drops every docBlock when there is no room for any of them at all", () => {
    const parts: AssembledContextParts = {
      tableBlock: chars(10),
      sbcContext: chars(10),
      docBlocks: [chars(5), chars(5)],
    };
    const result = clampAssembledContext(parts, 20); // exactly table + sbc, nothing left
    expect(result.docBlocks).toEqual([]);
    expect(result.droppedDocBlocks).toBe(2);
    expect(result.sbcContext).toBe(parts.sbcContext); // sbc still fit whole
    expect(result.tableBlock).toBe(parts.tableBlock);
  });
});

describe("clampAssembledContext — over cap: sbcContext truncated only after every docBlock is gone", () => {
  it("truncates sbcContext from its end, with the marker, once docBlocks cannot make room", () => {
    const sbcKeepLen = 9;
    const tableLen = 5;
    // After tableBlock (5), leave exactly markerLen + 9 chars of budget for
    // sbcContext — enough for the marker plus 9 real characters, not the
    // full 100. Computed relative to TRUNCATION_MARKER.length rather than a
    // hand-picked constant so this does not depend on the marker's exact text.
    const cap = tableLen + TRUNCATION_MARKER.length + sbcKeepLen;
    const parts: AssembledContextParts = {
      tableBlock: chars(tableLen),
      sbcContext: chars(100, "s"),
      docBlocks: [chars(30, "a")],
    };
    const result = clampAssembledContext(parts, cap);
    expect(result.docBlocks).toEqual([]); // no room for any doc block
    expect(result.droppedDocBlocks).toBe(1);
    expect(result.sbcContext).toBe(chars(sbcKeepLen, "s") + TRUNCATION_MARKER);
    expect(result.tableBlock).toBe(parts.tableBlock); // still untouched
    expect(result.totalChars).toBe(cap);
  });

  it("sbcContext stays whole when it fits even though docBlocks had to be cut", () => {
    const parts: AssembledContextParts = {
      tableBlock: "",
      sbcContext: chars(30, "s"),
      docBlocks: [chars(30, "a"), chars(30, "b")],
    };
    // Budget: all of sbcContext (30) plus only 5 more chars — nowhere near
    // enough for a 30-char docBlock, and (deliberately, to keep this test
    // independent of the marker's exact length) not enough for the marker
    // either, so the first docBlock is dropped outright rather than
    // partial-truncated.
    const result = clampAssembledContext(parts, 30 + Math.min(5, TRUNCATION_MARKER.length - 1));
    expect(result.sbcContext).toBe(parts.sbcContext);
    expect(result.docBlocks).toEqual([]);
    expect(result.droppedDocBlocks).toBe(2);
  });
});

describe("clampAssembledContext — determinism and totalChars accounting", () => {
  it("the same input produces the exact same output on repeated calls", () => {
    const parts: AssembledContextParts = {
      tableBlock: chars(5),
      sbcContext: chars(200, "s"),
      docBlocks: [chars(50, "a"), chars(50, "b"), chars(50, "c")],
    };
    const r1 = clampAssembledContext(parts, 120);
    const r2 = clampAssembledContext(parts, 120);
    expect(r1).toEqual(r2);
  });

  it("does not mutate the input parts object or its docBlocks array", () => {
    const docBlocks = [chars(50, "a"), chars(50, "b"), chars(50, "c")];
    const parts: AssembledContextParts = { tableBlock: chars(5), sbcContext: chars(200, "s"), docBlocks };
    const snapshotDocBlocks = [...docBlocks];
    clampAssembledContext(parts, 120);
    expect(docBlocks).toEqual(snapshotDocBlocks);
    expect(parts.tableBlock).toBe(chars(5));
    expect(parts.sbcContext).toBe(chars(200, "s"));
  });

  it("totalChars exactly equals the summed length of the returned (post-clamp) pieces", () => {
    const parts: AssembledContextParts = {
      tableBlock: chars(10),
      sbcContext: chars(200, "s"),
      docBlocks: [chars(50, "a"), chars(50, "b"), chars(50, "c")],
    };
    const result = clampAssembledContext(parts, 150);
    const recomputed =
      result.tableBlock.length + result.sbcContext.length + result.docBlocks.reduce((s, b) => s + b.length, 0);
    expect(result.totalChars).toBe(recomputed);
    expect(result.totalChars).toBeLessThanOrEqual(150);
  });
});
