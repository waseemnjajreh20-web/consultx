/**
 * Tests for the fire-safety-chat retrieval policy (B4).
 *
 * Subject: risks R1 and R6 in docs/audits/advisory-retrieval-truth-20260823.md,
 * and the reversible ADVISORY_VECTOR_RETRIEVAL_ENABLED flag that commit 587fd5b
 * deleted. Measurement and derivation:
 * docs/audits/advisory-vector-bench-20260823.md.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE CAN AND CANNOT PROVE
 * ---------------------------------------------------------------------------
 * supabase/functions/fire-safety-chat/retrievalPolicy.ts is pure (no Deno APIs,
 * no I/O) and is imported and executed directly — the same pattern
 * geminiResilience.test.ts and chapterVolumeMap.test.ts use. Everything in the
 * "policy" describes below is real execution of production code.
 *
 * index.ts itself CANNOT be imported here: it calls serve() at module top level
 * and imports from https://deno.land/std. So the wiring between the policy
 * module and index.ts is asserted structurally — the test reads index.ts off
 * disk and asserts the contract holds in the source. That catches a regression
 * (someone deleting the flag again, or re-adding the false "not provisioned"
 * comment) but it does NOT execute the Edge Function.
 *
 * NOT PROVED HERE, and not provable in vitest: a live three-mode, image-attached
 * request against the deployed function. That needs a real user JWT, which is
 * the same blocker recorded in docs/audits/advisory-vector-benchmark-20260501.md
 * section 1. It belongs in the post-deploy smoke, and the X-Retrieval-Engine
 * header asserted below is what makes it checkable from the outside.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADVISORY_VECTOR_ANALYSIS_FLAG_ENV,
  ADVISORY_VECTOR_FLAG_ENV,
  applySimilarityFloor,
  isAdvisoryVectorEnabled,
  RETRIEVAL_ENGINE_HEADER,
  resolveFloor,
  shouldUseVectorForAdvisory,
  VECTOR_MIN_SIMILARITY_ABS,
  VECTOR_MIN_SIMILARITY_ABS_ENV,
  VECTOR_MIN_SIMILARITY_REL,
  VECTOR_MIN_SIMILARITY_REL_ENV,
} from "../../supabase/functions/fire-safety-chat/retrievalPolicy.ts";
import {
  SBC201_INDEX,
  SBC801_INDEX,
  selectTargetPageRanges,
} from "../../supabase/functions/fire-safety-chat/chapterIndex.ts";
import type { FilePageRange } from "../../supabase/functions/fire-safety-chat/chapterIndex.ts";

const INDEX_PATH = path.resolve(
  __dirname,
  "../../supabase/functions/fire-safety-chat/index.ts",
);
const INDEX_SRC = readFileSync(INDEX_PATH, "utf8");

/** Env reader stub: exactly the shape of Deno.env.get. */
const envOf = (map: Record<string, string>) => (k: string) => map[k];

// ===========================================================================
// 1. THE FLAG — default OFF, and OFF means the advisory path is unchanged
// ===========================================================================
describe("ADVISORY_VECTOR_RETRIEVAL_ENABLED (restored; deleted by 587fd5b)", () => {
  it("is OFF when the variable is unset", () => {
    expect(isAdvisoryVectorEnabled(envOf({}))).toBe(false);
  });

  it.each(["", "0", "2", "true", "TRUE", "True", "yes", "on", "enabled", " 1", "1 ", "01"])(
    'is OFF for the value %j — only the exact string "1" enables it',
    (value) => {
      expect(isAdvisoryVectorEnabled(envOf({ [ADVISORY_VECTOR_FLAG_ENV]: value }))).toBe(false);
    },
  );

  it('is ON only for the exact string "1"', () => {
    expect(isAdvisoryVectorEnabled(envOf({ [ADVISORY_VECTOR_FLAG_ENV]: "1" }))).toBe(true);
  });

  // This is the "OFF is byte-identical" proof at the decision level: with the
  // flag off, NO mode routes to the vector engine, so the advisory branch makes
  // the same single fetchSBCContext(userQuery) call it made before the flag
  // existed. The source-level half of the proof is in section 4 below.
  it.each(["standard", "analysis", "primary", "", "STANDARD", "advisory"])(
    "with the flag OFF, mode %j never routes to the vector engine",
    (mode) => {
      expect(shouldUseVectorForAdvisory(mode, envOf({}))).toBe(false);
      expect(shouldUseVectorForAdvisory(mode, envOf({ [ADVISORY_VECTOR_FLAG_ENV]: "0" }))).toBe(false);
    },
  );

  it("with the master flag ON alone (analysis sub-flag unset), only mode 'standard' routes to the vector engine", () => {
    const on = envOf({ [ADVISORY_VECTOR_FLAG_ENV]: "1" });
    expect(shouldUseVectorForAdvisory("standard", on)).toBe(true);
    // Analysis needs its own sub-flag too (P2 two-key design) — the master
    // flag alone is not enough to move it.
    expect(shouldUseVectorForAdvisory("analysis", on)).toBe(false);
    expect(shouldUseVectorForAdvisory("primary", on)).toBe(false);
    // Case-sensitive: the mode ids are fixed lowercase strings.
    expect(shouldUseVectorForAdvisory("Standard", on)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // P2 (2026-08-25): two-key design — ADVISORY_VECTOR_ANALYSIS_ENABLED stages
  // "analysis" text retrieval behind its own sub-flag, on top of the master.
  // -------------------------------------------------------------------------
  describe("ADVISORY_VECTOR_ANALYSIS_ENABLED (P2 two-key design)", () => {
    const MODES = ["primary", "standard", "analysis", ""];
    const MASTER_VALUES: (string | undefined)[] = [undefined, "", "0", "1", "true"];
    const SUB_VALUES: (string | undefined)[] = [undefined, "1", "0"];

    /** Exact expected boolean, reproduced independently of the implementation. */
    function expected(mode: string, master: string | undefined, sub: string | undefined): boolean {
      if (master !== "1") return false;
      if (mode === "standard") return true;
      if (mode === "analysis") return sub === "1";
      return false;
    }

    const envFor = (master: string | undefined, sub: string | undefined) => (key: string) => {
      if (key === ADVISORY_VECTOR_FLAG_ENV) return master;
      if (key === ADVISORY_VECTOR_ANALYSIS_FLAG_ENV) return sub;
      return undefined;
    };

    for (const mode of MODES) {
      for (const master of MASTER_VALUES) {
        for (const sub of SUB_VALUES) {
          it(`mode=${JSON.stringify(mode)} master=${JSON.stringify(master)} sub=${JSON.stringify(sub)} -> ${expected(mode, master, sub)}`, () => {
            expect(shouldUseVectorForAdvisory(mode, envFor(master, sub))).toBe(expected(mode, master, sub));
          });
        }
      }
    }

    it("the analysis sub-flag alone (master unset) enables NOTHING — the master is a hard gate checked first", () => {
      const subOnly = envOf({ [ADVISORY_VECTOR_ANALYSIS_FLAG_ENV]: "1" });
      expect(shouldUseVectorForAdvisory("analysis", subOnly)).toBe(false);
      expect(shouldUseVectorForAdvisory("standard", subOnly)).toBe(false);
      expect(shouldUseVectorForAdvisory("primary", subOnly)).toBe(false);
      expect(shouldUseVectorForAdvisory("", subOnly)).toBe(false);
    });

    it("both flags ON: standard and analysis both route to the vector engine", () => {
      const bothOn = envOf({
        [ADVISORY_VECTOR_FLAG_ENV]: "1",
        [ADVISORY_VECTOR_ANALYSIS_FLAG_ENV]: "1",
      });
      expect(shouldUseVectorForAdvisory("standard", bothOn)).toBe(true);
      expect(shouldUseVectorForAdvisory("analysis", bothOn)).toBe(true);
      expect(shouldUseVectorForAdvisory("primary", bothOn)).toBe(false);
    });

    it("mode matching is exact and case-sensitive — 'ANALYSIS'/'Analysis'/' analysis' never route to vector", () => {
      // The mode ids are fixed lowercase strings (primary / standard /
      // analysis). A case or whitespace variant must fall through to the
      // final `return false`, not be normalised into a match — routing a
      // life-safety retrieval path on a fuzzy string compare is exactly the
      // kind of silent enablement the exact-string rule exists to prevent.
      const bothOn = envOf({
        [ADVISORY_VECTOR_FLAG_ENV]: "1",
        [ADVISORY_VECTOR_ANALYSIS_FLAG_ENV]: "1",
      });
      for (const variant of ["ANALYSIS", "Analysis", "aNaLySiS", " analysis", "analysis ", "STANDARD", "Standard"]) {
        expect(shouldUseVectorForAdvisory(variant, bothOn), `mode ${JSON.stringify(variant)}`).toBe(false);
      }
    });

    it("a missing/undefined mode is false, with both flags ON and with them OFF", () => {
      // The handler always passes a string, but shouldUseVectorForAdvisory is
      // the single decision point and must not throw or default-to-true if a
      // caller ever hands it nothing.
      const bothOn = envOf({
        [ADVISORY_VECTOR_FLAG_ENV]: "1",
        [ADVISORY_VECTOR_ANALYSIS_FLAG_ENV]: "1",
      });
      const allOff = envOf({});
      for (const missing of [undefined, null]) {
        expect(shouldUseVectorForAdvisory(missing as unknown as string, bothOn)).toBe(false);
        expect(shouldUseVectorForAdvisory(missing as unknown as string, allOff)).toBe(false);
      }
    });

    it('the sub-flag is exact-string-"1" only, same rule as the master', () => {
      const master = { [ADVISORY_VECTOR_FLAG_ENV]: "1" };
      for (const bad of ["", "0", "true", "TRUE", "yes", " 1", "1 "]) {
        expect(
          shouldUseVectorForAdvisory("analysis", envOf({ ...master, [ADVISORY_VECTOR_ANALYSIS_FLAG_ENV]: bad })),
        ).toBe(false);
      }
      expect(
        shouldUseVectorForAdvisory("analysis", envOf({ ...master, [ADVISORY_VECTOR_ANALYSIS_FLAG_ENV]: "1" })),
      ).toBe(true);
    });
  });
});

// ===========================================================================
// 2. THE SIMILARITY FLOOR (risk R6)
// ===========================================================================
describe("applySimilarityFloor (risk R6 — match_sbc_documents has no SQL threshold)", () => {
  const mk = (...sims: (number | null | undefined)[]) => sims.map((s, i) => ({ id: i, similarity: s }));

  it("keeps everything when every match is close to the top", () => {
    const r = applySimilarityFloor(mk(0.92, 0.91, 0.90, 0.89));
    expect(r.kept).toHaveLength(4);
    expect(r.droppedCount).toBe(0);
    expect(r.topSimilarity).toBeCloseTo(0.92, 10);
  });

  it("drops the tail that has fallen below the relative floor", () => {
    // Top 0.92 -> relative cut 0.85 * 0.92 = 0.782, absolute floor 0.70.
    // Effective cut = 0.782.
    const r = applySimilarityFloor(mk(0.92, 0.80, 0.781, 0.75));
    expect(r.effectiveFloor).toBeCloseTo(0.782, 10);
    expect(r.kept.map((m) => m.similarity)).toEqual([0.92, 0.80]);
    expect(r.droppedCount).toBe(2);
  });

  it("the absolute floor wins when the whole result set is weak", () => {
    // Top 0.72 -> relative cut 0.612, below the absolute floor 0.70, so 0.70 governs.
    const r = applySimilarityFloor(mk(0.72, 0.71, 0.69, 0.55));
    expect(r.effectiveFloor).toBeCloseTo(VECTOR_MIN_SIMILARITY_ABS, 10);
    expect(r.kept.map((m) => m.similarity)).toEqual([0.72, 0.71]);
  });

  it("returns an empty set when even the best match is below the absolute floor — the caller must fall back", () => {
    const r = applySimilarityFloor(mk(0.66, 0.64, 0.61));
    expect(r.kept).toHaveLength(0);
    expect(r.droppedCount).toBe(3);
    // An empty `kept` is the signal index.ts uses to call fetchSBCContext, so
    // the worst case of a mis-set floor is today's keyword path, not a thin
    // answer presented as complete. Source assertion in section 4.
  });

  it("the top match always survives the RELATIVE floor by construction", () => {
    for (const top of [0.71, 0.80, 0.9246, 0.99]) {
      const r = applySimilarityFloor(mk(top, top - 0.4));
      expect(r.kept[0]?.similarity).toBe(top);
    }
  });

  it("keeps matches whose similarity the RPC did not report, rather than discarding them", () => {
    const r = applySimilarityFloor([
      { id: 0, similarity: 0.95 },
      { id: 1, similarity: null },
      { id: 2, similarity: undefined },
      { id: 3, similarity: Number.NaN },
      { id: 4, similarity: 0.10 },
    ]);
    expect(r.kept.map((m) => m.id)).toEqual([0, 1, 2, 3, 4].filter((i) => i !== 4));
  });

  it("handles an empty input without inventing a floor", () => {
    const r = applySimilarityFloor([]);
    expect(r).toEqual({ kept: [], droppedCount: 0, effectiveFloor: null, topSimilarity: null });
  });

  it("takes the top similarity as the maximum, not as element 0, so an unordered list cannot lower the cut", () => {
    const ordered = applySimilarityFloor(mk(0.95, 0.90, 0.70));
    const shuffled = applySimilarityFloor(mk(0.70, 0.95, 0.90));
    expect(shuffled.effectiveFloor).toBeCloseTo(ordered.effectiveFloor!, 10);
    expect(shuffled.kept).toHaveLength(ordered.kept.length);
  });

  // ---- the measured numbers the constants were derived from -------------
  // Source: docs/audits/advisory-vector-bench-20260823.md, measured 2026-08-23
  // against the 4,594 stored production vectors.
  it("the constants sit where the measurement says they should", () => {
    const UNRELATED_P95 = 0.7638;   // 95th pct of 77,760 cross-code pairs
    const UNRELATED_P50 = 0.6784;   // median of the same
    const RANK1_P10 = 0.8508;       // 10th pct of rank-1 similarity, 60 probes
    const RANK10_RATIO_P10 = 0.8588;
    const RANK25_RATIO_P10 = 0.8340;

    // The relative floor sits between the measured worst-case rank-10 ratio and
    // the measured worst-case rank-25 ratio: it does not bite into the top 10,
    // and it does trim the rank-25 tail.
    expect(VECTOR_MIN_SIMILARITY_REL).toBeLessThan(RANK10_RATIO_P10);
    expect(VECTOR_MIN_SIMILARITY_REL).toBeGreaterThan(RANK25_RATIO_P10);

    // For a median neighbourhood (top = 0.9246) the relative cut lands above
    // the 95th percentile of provably unrelated content.
    expect(VECTOR_MIN_SIMILARITY_REL * 0.9246).toBeGreaterThan(UNRELATED_P95);

    // The absolute floor sits above the noise median but well below the
    // measured worst-case rank-1, so it cannot empty a healthy result set.
    expect(VECTOR_MIN_SIMILARITY_ABS).toBeGreaterThan(UNRELATED_P50);
    expect(VECTOR_MIN_SIMILARITY_ABS).toBeLessThan(RANK1_P10);
  });
});

describe("resolveFloor (env override, so the owner can retune without a deploy)", () => {
  it("falls back to the measured default when unset or blank", () => {
    expect(resolveFloor(envOf({}), VECTOR_MIN_SIMILARITY_REL_ENV, VECTOR_MIN_SIMILARITY_REL))
      .toBe(VECTOR_MIN_SIMILARITY_REL);
    expect(resolveFloor(envOf({ [VECTOR_MIN_SIMILARITY_REL_ENV]: "   " }), VECTOR_MIN_SIMILARITY_REL_ENV, VECTOR_MIN_SIMILARITY_REL))
      .toBe(VECTOR_MIN_SIMILARITY_REL);
  });

  it("accepts a valid override", () => {
    expect(resolveFloor(envOf({ [VECTOR_MIN_SIMILARITY_ABS_ENV]: "0.62" }), VECTOR_MIN_SIMILARITY_ABS_ENV, VECTOR_MIN_SIMILARITY_ABS))
      .toBeCloseTo(0.62, 10);
  });

  it.each(["abc", "-0.1", "1.5", "NaN", "Infinity"])(
    "rejects the invalid override %j and keeps the measured default, rather than silently disabling the floor",
    (bad) => {
      expect(resolveFloor(envOf({ [VECTOR_MIN_SIMILARITY_ABS_ENV]: bad }), VECTOR_MIN_SIMILARITY_ABS_ENV, VECTOR_MIN_SIMILARITY_ABS))
        .toBe(VECTOR_MIN_SIMILARITY_ABS);
    },
  );
});

// ===========================================================================
// 3. index.ts SOURCE CONTRACT
// ===========================================================================
describe("index.ts wiring (source contract — does not execute the Edge Function)", () => {
  it("the false 'match_sbc_documents is not provisioned' comment is gone", () => {
    // It was false: the RPC exists in pg_proc as
    // (query_embedding vector, match_count integer, filter_code text) and
    // 4,594 of 4,630 sbc_documents rows carry an embedding.
    //
    // The exact deleted line is asserted, not the loose phrase: the replacement
    // comment quotes the old wording verbatim so the record of what was wrong
    // survives, and a substring check would therefore match the quotation.
    const DELETED_LINE =
      "// Use keyword/storage path directly — vector RPC (match_sbc_documents) is not provisioned";
    expect(INDEX_SRC).not.toContain(DELETED_LINE);
    // ...and the replacement states the measured truth.
    expect(INDEX_SRC).toContain("match_sbc_documents EXISTS in pg_proc");
  });

  it("the advisory text branch is gated by shouldUseVectorForAdvisory, and its OFF branch is the unchanged keyword call", () => {
    expect(INDEX_SRC).toContain("const useVector = shouldUseVectorForAdvisory(mode, Deno.env.get);");
    // The OFF branch must be exactly the pre-flag call: same function, same
    // single argument. This is the source half of the byte-identical proof.
    expect(INDEX_SRC).toContain("const kw = await fetchSBCContext(userQuery);");
  });

  it("an empty post-floor result falls back to the keyword path instead of building a context from noise", () => {
    expect(INDEX_SRC).toContain("if (floored.kept.length === 0)");
    // keywordFallback carries the fallback reason since 2026-08-29 (the
    // X-Retrieval-Fallback observability header) — the contract is that the
    // below-floor branch still returns the keyword fallback, whatever label
    // it passes.
    expect(INDEX_SRC).toMatch(/floored\.kept\.length === 0\)[\s\S]{0,600}?return keywordFallback\("below_floor"\);/);
  });

  it("the context block is built from the FLOORED matches, not the raw RPC result", () => {
    expect(INDEX_SRC).toContain("for (const match of acceptedMatches) {");
    // A leftover `for (const match of matches)` in the context builder would
    // silently re-admit everything the floor just dropped.
    expect(INDEX_SRC).not.toMatch(/const vectorMetaMap[\s\S]{0,200}for \(const match of matches\)/);
  });

  it("X-Retrieval-Engine is set on the response and exposed to the browser", () => {
    expect(RETRIEVAL_ENGINE_HEADER).toBe("X-Retrieval-Engine");
    expect(INDEX_SRC).toContain("[RETRIEVAL_ENGINE_HEADER]: retrievalEngine,");
    expect(INDEX_SRC).toMatch(/Access-Control-Expose-Headers[^\n]*RETRIEVAL_ENGINE_HEADER/);
  });

  it("the engine is request-scoped, not module-scoped (one isolate serves concurrent requests)", () => {
    expect(INDEX_SRC).toMatch(/let retrievalEngine: RetrievalEngine = "keyword";/);
    // A module-level `const retrievalEngine` / top-level let would leak between
    // concurrent requests. Assert the declaration sits inside the handler by
    // checking it appears AFTER the serve( entry point.
    const serveAt = INDEX_SRC.indexOf("serve(async (req)");
    const declAt = INDEX_SRC.indexOf("let retrievalEngine: RetrievalEngine");
    expect(serveAt).toBeGreaterThan(-1);
    expect(declAt).toBeGreaterThan(serveAt);
  });

  it("the image path calls the vector engine UNCONDITIONALLY — the flag does not gate it", () => {
    // Measured call graph (2026-08-23): fetchSBCContextVector has exactly one
    // call site, inside runVisionPipeline; runVisionPipeline has exactly one
    // caller, guarded by `if (resolvedImages.length > 0)`. So the vector path
    // runs only for image-attached requests — and for image-attached requests
    // in ALL THREE modes, because the caller remaps primary to standard
    // FRAMING before calling. The literal 'analysis' at the call site is the
    // match_count selector (10 vs 25), not the user's mode.
    const callSites = INDEX_SRC.match(/fetchSBCContextVector\(/g) ?? [];
    // one declaration + two invocations (vision pipeline, advisory-when-ON)
    expect(callSites.length).toBe(3);
    expect(INDEX_SRC).toContain("await fetchSBCContextVector(enhancedQuery, 'analysis', searchKeywords)");
    expect(INDEX_SRC).toContain('const visionMode = mode === "primary" ? "standard" : mode;');
    expect(INDEX_SRC).toContain("if (resolvedImages.length > 0) {");
  });

  it("SCOPE OF THE BYTE-IDENTICAL GUARANTEE: it covers advisory TEXT retrieval only", () => {
    // Stated as an executable reminder rather than prose. With the flag OFF the
    // advisory text branch is unchanged (asserted above), but the image path
    // changes at deploy for all three modes because the similarity floor lives
    // inside fetchSBCContextVector, which the image path always uses.
    expect(shouldUseVectorForAdvisory("standard", envOf({}))).toBe(false);
    expect(INDEX_SRC).toContain("const floored = applySimilarityFloor(");
    // The floor is NOT gated by the flag — deliberately, or R6 would stay open
    // on the only path that uses the vector engine today.
    expect(INDEX_SRC).not.toMatch(/useVector[\s\S]{0,200}applySimilarityFloor/);
  });
});

// ===========================================================================
// 4. TABLE-ID CATALOGUE vs B1's REBUILD
// ===========================================================================
//
// B1 rebuilds 16 code tables (docs/audits/code-tables-rebuild-20260823.sql) and
// RENUMBERS five of them. KNOWN_TABLE_IDS, PARENT_ALIASES and SEMANTIC_ALIASES
// in index.ts were all derived from the production dump's BASE ids, so each of
// them goes stale the moment that SQL runs. These tests close the class: if the
// rebuild's target ids change again, this fails instead of a table silently
// going dark.
// ---------------------------------------------------------------------------

/** B1's 16 rebuild targets, read off code-tables-rebuild-20260823.sql. */
const REBUILD_TARGET_IDS = [
  "1004.5", "1006.2.1", "1006.3.3", "1006.3.4(1)", "1006.3.4(2)", "1017.2",
  "1020.2", "1020.2-width", "504.3", "504.4", "506.2", "508.4", "509.1",
  "601", "705.5", "705.8",
];

/**
 * The one target that must stay UNREACHABLE. B1 chose the synthetic id
 * "1020.2-width" so the corridor-width row is not injected until the owner
 * rules on renumbering it to 1020.3 — SBC 801 p.839 prints corridor width as
 * TABLE 1020.3, while SBC 201 prints two different tables both numbered 1020.2.
 * The stored row also measured 914 mm where SBC requires 1100 mm
 * (docs/audits/SAFETY-ALERT-code-tables-20260823.md), so dormant is the safe
 * state, not an oversight.
 */
const DELIBERATELY_DORMANT_ID = "1020.2-width";

/**
 * Remove `//` line comments. Deliberately NOT anchored with `$`: the repository
 * checks out with CRLF line endings, and in JavaScript `.` does not match `\r`,
 * so an anchored `/\/\/.*$/` silently matches nothing on a CRLF line — which
 * would leak ids that only appear inside comments (e.g. the "1020.2-width" that
 * the KNOWN_TABLE_IDS comment names as deliberately excluded) into the parsed
 * list and make this whole section assert the opposite of what it intends.
 */
function stripLineComments(block: string): string {
  return block.replace(/\/\/[^\n]*/g, "");
}

function extractArrayLiteral(name: string): string[] {
  const at = INDEX_SRC.indexOf(`const ${name} = [`);
  expect(at, `${name} not found in index.ts`).toBeGreaterThan(-1);
  const open = INDEX_SRC.indexOf("[", at);
  const close = INDEX_SRC.indexOf("\n  ];", open);
  expect(close, `${name} closing bracket not found`).toBeGreaterThan(open);
  const body = stripLineComments(INDEX_SRC.slice(open, close));
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function extractRecordOfArrays(name: string): Record<string, string[]> {
  const at = INDEX_SRC.indexOf(`const ${name}: Record<string, string[]> = {`);
  expect(at, `${name} not found in index.ts`).toBeGreaterThan(-1);
  const open = INDEX_SRC.indexOf("{", INDEX_SRC.indexOf("=", at));
  const close = INDEX_SRC.indexOf("\n  };", open);
  expect(close, `${name} closing brace not found`).toBeGreaterThan(open);
  const body = stripLineComments(INDEX_SRC.slice(open, close));
  const out: Record<string, string[]> = {};
  for (const m of body.matchAll(/"([^"]+)"\s*:\s*\[([^\]]*)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return out;
}

/** The id arrays that are the second element of each SEMANTIC_ALIASES entry. */
function extractSemanticAliasIds(): string[] {
  const at = INDEX_SRC.indexOf("const SEMANTIC_ALIASES: Array<[RegExp, string[]]> = [");
  expect(at, "SEMANTIC_ALIASES not found in index.ts").toBeGreaterThan(-1);
  const close = INDEX_SRC.indexOf("\n  ];", at);
  const body = INDEX_SRC.slice(at, close);
  const ids = new Set<string>();
  for (const m of body.matchAll(/\[((?:\s*"[^"]+"\s*,?)+)\]\s*\]/g)) {
    for (const s of m[1].matchAll(/"([^"]+)"/g)) ids.add(s[1]);
  }
  return [...ids];
}

/**
 * Faithful reproduction of the literal-scan stage of extractTableIds()
 * (index.ts, inside `for (const id of KNOWN_TABLE_IDS)`). Reproduced rather
 * than imported because index.ts cannot be imported here; the escaping and the
 * conditional word boundaries are copied verbatim from the source.
 */
function literalScanMatches(id: string, query: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lead = /^\w/.test(id) ? "\\b" : "";
  const tail = /\w$/.test(id) ? "\\b" : "";
  return new RegExp(`${lead}${escaped}${tail}`).test(query.toLowerCase());
}

describe("table-id catalogue vs B1's rebuild (code-tables-rebuild-20260823.sql)", () => {
  const known = extractArrayLiteral("KNOWN_TABLE_IDS");
  const knownSet = new Set(known);

  it("parses a plausible KNOWN_TABLE_IDS out of index.ts (guards the parser itself)", () => {
    expect(known.length).toBeGreaterThan(80);
    expect(knownSet.has("1004.5")).toBe(true);
    expect(knownSet.has("903.2")).toBe(true);
  });

  it.each(REBUILD_TARGET_IDS.filter((id) => id !== DELIBERATELY_DORMANT_ID))(
    "rebuilt table %s is reachable — listed in KNOWN_TABLE_IDS and matched by the literal scan",
    (id) => {
      expect(knownSet.has(id), `${id} is missing from KNOWN_TABLE_IDS and would go dark once B1's SQL is applied`).toBe(true);
      expect(literalScanMatches(id, `what does table ${id} require for this floor?`)).toBe(true);
      expect(literalScanMatches(id, `ما الذي يشترطه الجدول ${id}؟`)).toBe(true);
    },
  );

  it(`${DELIBERATELY_DORMANT_ID} stays UNMATCHABLE on purpose — pending the owner's 1020.3 renumbering decision`, () => {
    expect(knownSet.has(DELIBERATELY_DORMANT_ID)).toBe(false);
    // And the "table NNN" regex cannot produce it either: it captures 1020.2
    // and stops at the hyphen.
    const tblRegex = /(?:table|جدول)\s+(\d{3,4}(?:\.\d{1,2}){0,2})/gi;
    const captured = [...`table ${DELIBERATELY_DORMANT_ID}`.matchAll(tblRegex)].map((m) => m[1]);
    expect(captured).toEqual(["1020.2"]);
    expect(captured).not.toContain(DELIBERATELY_DORMANT_ID);
  });

  it("1006.3.4(1) is reachable despite the parenthesis the tblRegex cannot capture", () => {
    // The regex stops at "(", so the literal scan is the ONLY route to this id.
    const tblRegex = /(?:table|جدول)\s+(\d{3,4}(?:\.\d{1,2}){0,2})/gi;
    expect([...`table 1006.3.4(1)`.matchAll(tblRegex)].map((m) => m[1])).toEqual(["1006.3.4"]);
    expect(knownSet.has("1006.3.4(1)")).toBe(true);
    expect(literalScanMatches("1006.3.4(1)", "table 1006.3.4(1)")).toBe(true);
  });

  it("every id referenced by PARENT_ALIASES is in KNOWN_TABLE_IDS", () => {
    const aliases = extractRecordOfArrays("PARENT_ALIASES");
    expect(Object.keys(aliases).length).toBeGreaterThan(25);
    for (const [parent, children] of Object.entries(aliases)) {
      for (const child of children) {
        expect(knownSet.has(child), `PARENT_ALIASES["${parent}"] points at "${child}", which is not in KNOWN_TABLE_IDS`).toBe(true);
      }
    }
  });

  it('PARENT_ALIASES["1018"] is intentionally dormant and must stay empty', () => {
    const aliases = extractRecordOfArrays("PARENT_ALIASES");
    expect(aliases["1018"]).toEqual([]);
    // Guard against the "helpful fix": repointing it at the dormant id would
    // look correct and inject nothing.
    expect(aliases["1018"]).not.toContain(DELIBERATELY_DORMANT_ID);
  });

  it("PARENT_ALIASES carries B1's post-rebuild ids alongside the pre-rebuild ones", () => {
    const aliases = extractRecordOfArrays("PARENT_ALIASES");
    expect(aliases["1006"]).toContain("1006.3.4(1)");
    expect(aliases["1020"]).toContain("1020.2");
  });

  it("every id referenced by SEMANTIC_ALIASES is in KNOWN_TABLE_IDS", () => {
    // SEMANTIC_ALIASES is the third structure with hard-coded table ids and the
    // one that matters most: real users type "how wide must a corridor be", not
    // "table 1020.2". A stale id here is invisible.
    const ids = extractSemanticAliasIds();
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) {
      expect(knownSet.has(id), `SEMANTIC_ALIASES references "${id}", which is not in KNOWN_TABLE_IDS`).toBe(true);
    }
  });

  it("SEMANTIC_ALIASES carries B1's post-rebuild ids for the four live renumbers", () => {
    const ids = new Set(extractSemanticAliasIds());
    expect(ids.has("705.5")).toBe(true);      // was 602
    expect(ids.has("509.1")).toBe(true);      // was 509
    expect(ids.has("1020.2")).toBe(true);     // was 1020.1
    expect(ids.has("1006.3.4(1)")).toBe(true);// was 1006.3.4
    // The fifth renumber is the dormant one and must NOT appear.
    expect(ids.has(DELIBERATELY_DORMANT_ID)).toBe(false);
  });

  it("LEGACY_MAP is unaffected by the rebuild — its targets are all [MATCH] rows", () => {
    const legacy = extractRecordOfArrays("LEGACY_MAP");
    const targets = new Set(Object.values(legacy).flat());
    for (const t of targets) {
      expect(knownSet.has(t), `LEGACY_MAP target "${t}" is not in KNOWN_TABLE_IDS`).toBe(true);
      expect(REBUILD_TARGET_IDS.includes(t) || !["509", "602", "1006.3.4", "1018.1", "1020.1"].includes(t)).toBe(true);
    }
  });
});

// ===========================================================================
// 5. CHAPTER_KEYWORDS REACHABILITY (risk R1) — the four repair requirements
// ===========================================================================
//
// CHAPTER_KEYWORDS lives inside index.ts and is not exported, so it is parsed
// off disk here (same reason as section 4). The chapter index it is measured
// against IS imported and executed, so half of this is real production code.
//
// The defect: the sbc801 column was written against the OLD invented dense
// 1..60 chapter sequence. SBC 801 really numbers its chapters 1-12, 20-39,
// 50-67 and 80. getTargetChapters -> selectTargetPageRanges -> scoreFile gives
// 0 to any storage file whose page range does not overlap a target, so a wrong
// chapter number EXCLUDES the right volume rather than down-ranking it.
// ---------------------------------------------------------------------------

interface KeywordChapters { sbc201: number[]; sbc801: number[] }

function extractChapterKeywords(): Record<string, KeywordChapters> {
  const at = INDEX_SRC.indexOf("const CHAPTER_KEYWORDS");
  expect(at, "CHAPTER_KEYWORDS not found in index.ts").toBeGreaterThan(-1);
  const open = INDEX_SRC.indexOf("{", INDEX_SRC.indexOf("=", at));
  let depth = 0;
  let end = -1;
  for (let i = open; i < INDEX_SRC.length; i++) {
    if (INDEX_SRC[i] === "{") depth++;
    else if (INDEX_SRC[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  expect(end, "CHAPTER_KEYWORDS closing brace not found").toBeGreaterThan(open);
  const body = stripLineComments(INDEX_SRC.slice(open, end + 1));
  const out: Record<string, KeywordChapters> = {};
  const re = /"([^"]+)"\s*:\s*\{\s*sbc201\s*:\s*\[([^\]]*)\]\s*,\s*sbc801\s*:\s*\[([^\]]*)\]\s*\}/g;
  const nums = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean).map(Number);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out[m[1]] = { sbc201: nums(m[2]), sbc801: nums(m[3]) };
  return out;
}

/**
 * getTargetChapters()'s cross-reference rule, reproduced verbatim from
 * index.ts ("Cross-referencing: always include both codes for fire/egress"):
 *   if (sbc201.has(9) || sbc201.has(10)) { sbc801 += 6, 7 }
 *   if (sbc801.has(6) || sbc801.has(7)) { sbc201 += 9, 10 }
 */
function applyCrossReference(sbc201: Set<number>, sbc801: Set<number>): void {
  if (sbc201.has(9) || sbc201.has(10)) { sbc801.add(6); sbc801.add(7); }
  if (sbc801.has(6) || sbc801.has(7)) { sbc201.add(9); sbc201.add(10); }
}

function effectiveChapters(kw: KeywordChapters): { sbc201: Set<number>; sbc801: Set<number> } {
  const a = new Set(kw.sbc201);
  const b = new Set(kw.sbc801);
  applyCrossReference(a, b);
  return { sbc201: a, sbc801: b };
}

function volumesReachedBy(chapters: Set<number>, index: FilePageRange[]): Set<string> {
  const hit = new Set<string>();
  for (const c of chapters) for (const v of index) if (v.chapters.includes(c)) hit.add(v.pageRange);
  return hit;
}

describe("CHAPTER_KEYWORDS reachability against the measured chapter index (R1)", () => {
  const KW = extractChapterKeywords();
  const CH201 = new Set(SBC201_INDEX.flatMap((v) => v.chapters));
  const CH801 = new Set(SBC801_INDEX.flatMap((v) => v.chapters));

  const reach201 = new Set<string>();
  const reach801 = new Set<string>();
  for (const kw of Object.values(KW)) {
    const eff = effectiveChapters(kw);
    for (const pr of volumesReachedBy(eff.sbc201, SBC201_INDEX)) reach201.add(pr);
    for (const pr of volumesReachedBy(eff.sbc801, SBC801_INDEX)) reach801.add(pr);
  }

  it("parses a plausible CHAPTER_KEYWORDS out of index.ts (guards the parser itself)", () => {
    expect(Object.keys(KW).length).toBeGreaterThan(120);
    expect(KW["sprinkler"]).toBeDefined();
    expect(KW["رشاشات"]).toBeDefined();
  });

  // (a) every SBC 801 volume reachable. Before the repair: 7 of 10 —
  // "1-200", "1601-1800" and "1801-2061" were reachable by no keyword at all.
  it.each(SBC801_INDEX.map((v) => v.pageRange))(
    "requirement (a): SBC 801 volume %s is reachable by at least one keyword",
    (pageRange) => {
      expect(reach801.has(pageRange), `no keyword targets any chapter in SBC 801 volume ${pageRange}`).toBe(true);
    },
  );

  // (b) no keyword may reference a chapter that is absent from the corpus.
  // Before the repair, sbc801 referenced 13, 19, 40, 43, 46, 47 and 49 — none
  // of which exist in SBC 801 — and sbc201 referenced 34, which is RESERVED.
  it("requirement (b): no keyword references a chapter absent from the measured corpus", () => {
    const dead: string[] = [];
    for (const [kw, ch] of Object.entries(KW)) {
      for (const c of ch.sbc201) if (!CH201.has(c)) dead.push(`"${kw}" -> SBC201 ch ${c}`);
      for (const c of ch.sbc801) if (!CH801.has(c)) dead.push(`"${kw}" -> SBC801 ch ${c}`);
    }
    expect(dead, `dead chapter references:\n  ${dead.join("\n  ")}`).toEqual([]);
  });

  it("requirement (b), specifically: SBC 801 chapter 13 does not exist and must not be referenced", () => {
    expect(CH801.has(13)).toBe(false);
    for (const [kw, ch] of Object.entries(KW)) {
      expect(ch.sbc801, `"${kw}" still references the non-existent SBC 801 chapter 13`).not.toContain(13);
    }
  });

  // (c) SBC 201 reachability was already clean at 8 of 8 and must not regress.
  it.each(SBC201_INDEX.map((v) => v.pageRange))(
    "requirement (c): SBC 201 volume %s stays reachable (was 8 of 8 before the repair)",
    (pageRange) => {
      expect(reach201.has(pageRange), `SBC 201 volume ${pageRange} regressed to unreachable`).toBe(true);
    },
  );

  it("requirement (c): both codes are fully reachable — 8 of 8 and 10 of 10", () => {
    expect(reach201.size).toBe(SBC201_INDEX.length);
    expect(reach201.size).toBe(8);
    expect(reach801.size).toBe(SBC801_INDEX.length);
    expect(reach801.size).toBe(10);
  });

  // (d) the sprinkler mapping, called out separately because (a)-(c) can all
  // hold while this defect stays in place.
  it.each(["sprinkler", "رشاش", "رشاشات", "رش"])(
    "requirement (d): %s maps to SBC 801 chapter 9 and reaches BOTH volumes that hold it",
    (term) => {
      const kw = KW[term];
      expect(kw, `"${term}" is missing from CHAPTER_KEYWORDS`).toBeDefined();
      expect(kw.sbc801, `"${term}" must name SBC 801 chapter 9, the sprinkler chapter`).toContain(9);

      const eff = effectiveChapters(kw);
      const ranges = selectTargetPageRanges([...eff.sbc801], SBC801_INDEX);
      // "401-600" holds ch 9 pp.62-200 — the largest concentration in the corpus.
      expect(ranges).toContain("401-600");
      // "601-800" holds ch 9 pp.1-68 and was UNREACHABLE for sprinkler queries
      // before the repair. This is the assertion the old [6, 7] mapping failed.
      expect(ranges).toContain("601-800");
    },
  );

  it("requirement (d): both volumes named above really do contain measured chapter 9", () => {
    for (const pr of ["401-600", "601-800"]) {
      const vol = SBC801_INDEX.find((v) => v.pageRange === pr)!;
      expect(vol.chapters).toContain(9);
    }
  });

  it("the suppression, alarm and smoke-control families also name chapter 9", () => {
    // Section 903 sprinklers, 905 standpipes, 906 extinguishers, 907 fire alarm,
    // 909 smoke control are all inside SBC 801 chapter 9 (measured title:
    // "Fire Protection and Life Safety Systems").
    for (const term of ["suppression", "standpipe", "fire pump", "alarm", "detection", "smoke", "إطفاء", "إنذار", "دخان"]) {
      expect(KW[term], `"${term}" is missing from CHAPTER_KEYWORDS`).toBeDefined();
      expect(KW[term].sbc801, `"${term}" should name SBC 801 chapter 9`).toContain(9);
    }
  });
});
