/**
 * SBC_VECTOR_FLOOR_MODE (2026-09-03) — the similarity floor's two jobs,
 * separated.
 *
 * The floor decides (a) whether a result set is noise, and (b) which rows to
 * discard. Job (a) bounds the blast radius of a bad query and is not in
 * question. Job (b) was never measured until the model-free retrieval gate
 * existed, and it costs 2 of 87 expected sections across 40 benchmark
 * questions. "gate" mode keeps (a) and drops (b); "drop" (default) keeps both.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applySimilarityFloor,
  resolveFloorMode,
  VECTOR_FLOOR_MODE_ENV,
} from "../../supabase/functions/fire-safety-chat/retrievalPolicy.ts";

const envOf = (map: Record<string, string>) => (k: string) => map[k];
const rows = (...sims: Array<number | null>) => sims.map((similarity, i) => ({ id: i, similarity }));

describe("resolveFloorMode", () => {
  it('defaults to "drop" and accepts only the two known modes', () => {
    expect(resolveFloorMode(envOf({}))).toBe("drop");
    expect(resolveFloorMode(envOf({ [VECTOR_FLOOR_MODE_ENV]: "gate" }))).toBe("gate");
    expect(resolveFloorMode(envOf({ [VECTOR_FLOOR_MODE_ENV]: " GATE " }))).toBe("gate");
    expect(resolveFloorMode(envOf({ [VECTOR_FLOOR_MODE_ENV]: "drop" }))).toBe("drop");
    for (const bad of ["", "off", "none", "1", "keep"]) {
      expect(resolveFloorMode(envOf({ [VECTOR_FLOOR_MODE_ENV]: bad }))).toBe("drop");
    }
  });
});

describe('applySimilarityFloor — "drop" (default) is unchanged', () => {
  it("removes rows below the cut and reports what it removed", () => {
    // top 0.90 -> cut = max(0.70, 0.85*0.90) = 0.765
    const out = applySimilarityFloor(rows(0.9, 0.8, 0.76, 0.5));
    expect(out.kept.map((r) => r.similarity)).toEqual([0.9, 0.8]);
    expect(out.droppedCount).toBe(2);
    expect(out.effectiveFloor).toBeCloseTo(0.765, 5);
    expect(out.topSimilarity).toBe(0.9);
  });

  it("keeps a row whose similarity the RPC did not report", () => {
    const out = applySimilarityFloor(rows(0.9, null, 0.4));
    expect(out.kept.map((r) => r.similarity)).toEqual([0.9, null]);
  });
});

describe('applySimilarityFloor — "gate"', () => {
  it("passes the WHOLE set through as long as one row clears the cut", () => {
    const out = applySimilarityFloor(rows(0.9, 0.8, 0.76, 0.5), undefined, undefined, "gate");
    expect(out.kept.map((r) => r.similarity)).toEqual([0.9, 0.8, 0.76, 0.5]);
    // Still reports what "drop" would have removed — the caller's log stays honest.
    expect(out.droppedCount).toBe(2);
    expect(out.effectiveFloor).toBeCloseTo(0.765, 5);
  });

  it("still empties the set when EVERY row is below the cut — the fallback decision is untouched", () => {
    // Every row under the absolute floor: cut = max(0.70, 0.85*0.65) = 0.70.
    const dropped = applySimilarityFloor(rows(0.65, 0.6, 0.5), undefined, undefined, "drop");
    const gated = applySimilarityFloor(rows(0.65, 0.6, 0.5), undefined, undefined, "gate");
    expect(dropped.kept).toHaveLength(0);
    expect(gated.kept).toHaveLength(0);
  });

  it("is identical to drop when nothing was below the cut", () => {
    const input = rows(0.95, 0.92, 0.9);
    expect(applySimilarityFloor(input, undefined, undefined, "gate").kept)
      .toEqual(applySimilarityFloor(input, undefined, undefined, "drop").kept);
  });

  it("handles the empty and all-null cases the same way in both modes", () => {
    for (const mode of ["drop", "gate"] as const) {
      expect(applySimilarityFloor([], undefined, undefined, mode).kept).toHaveLength(0);
      expect(applySimilarityFloor(rows(null, null), undefined, undefined, mode).kept).toHaveLength(2);
    }
  });
});

describe("index.ts wiring", () => {
  const INDEX_SRC = readFileSync(
    path.resolve(__dirname, "../../supabase/functions/fire-safety-chat/index.ts"),
    "utf8",
  );
  it("reads the mode once and passes it to the one floor call", () => {
    expect(INDEX_SRC.split("resolveFloorMode(").length - 1).toBe(1);
    expect(INDEX_SRC).toContain("applySimilarityFloor(matches as { similarity?: number | null }[], relFloor, absFloor, floorMode)");
    // The below_floor fallback still keys off an empty kept set, in both modes.
    expect(INDEX_SRC).toContain("if (floored.kept.length === 0) {");
    expect(INDEX_SRC).toContain('return keywordFallback("below_floor");');
  });
});
