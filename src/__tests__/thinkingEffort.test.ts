/**
 * D2 session 6 (2026-09-03) — per-mode thinking levels.
 *
 * The wave plan's remaining P2 item: primary has run at "minimal" since the
 * speed wave (12.2s -> 2.2s to first byte), while standard and analysis have
 * never run at anything but the model's uncapped default. This pins the
 * ladder's contract so a level can be measured by flipping an env var, and
 * pins the property that makes that safe: an unset or mistyped variable
 * changes nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveThinkingEffort } from "../../supabase/functions/fire-safety-chat/geminiResilience.ts";

const envOf = (map: Record<string, string>) => (k: string) => map[k];
const INDEX_SRC = readFileSync(
  path.resolve(__dirname, "../../supabase/functions/fire-safety-chat/index.ts"),
  "utf8",
);
const RESILIENCE_SRC = readFileSync(
  path.resolve(__dirname, "../../supabase/functions/fire-safety-chat/geminiResilience.ts"),
  "utf8",
);

describe("resolveThinkingEffort", () => {
  it("accepts every level on the ladder, case-insensitively and space-tolerantly", () => {
    for (const level of ["minimal", "low", "medium", "high", "default"]) {
      expect(resolveThinkingEffort(envOf({ K: level }), "K", "default")).toBe(level);
      expect(resolveThinkingEffort(envOf({ K: ` ${level.toUpperCase()} ` }), "K", "default")).toBe(level);
    }
  });

  it("falls back rather than guessing — unset, empty, or unrecognised", () => {
    expect(resolveThinkingEffort(envOf({}), "K", "minimal")).toBe("minimal");
    expect(resolveThinkingEffort(envOf({ K: "" }), "K", "default")).toBe("default");
    expect(resolveThinkingEffort(envOf({ K: "lowest" }), "K", "default")).toBe("default");
    expect(resolveThinkingEffort(envOf({ K: "0" }), "K", "minimal")).toBe("minimal");
    expect(resolveThinkingEffort(envOf({ K: "none" }), "K", "high")).toBe("high");
  });
});

describe("the ladder's shapes", () => {
  it("offers both API generations' field shapes for every non-default level", () => {
    // 3.x takes a thinkingLevel enum, 2.5 takes an integer thinkingBudget;
    // whichever the model accepts first is remembered.
    for (const level of ["minimal", "low", "medium", "high"]) {
      expect(RESILIENCE_SRC).toContain(`${level}: [{ thinkingLevel: "${level}" }, { thinkingBudget:`);
    }
  });

  it("remembers the accepted shape per MODEL AND LEVEL, not per model alone", () => {
    // A model accepting thinkingLevel:"minimal" says nothing about "medium".
    expect(RESILIENCE_SRC).toContain('const shapeKey = (model: string, effort: ThinkingEffort) => `${model}::${effort}`;');
    expect(RESILIENCE_SRC).toContain("acceptedThinkingShape.get(shapeKey(model, thinkingEffort))");
    expect(RESILIENCE_SRC).toContain("acceptedThinkingShape.set(shapeKey(model, thinkingEffort), thinkingConfig)");
  });

  it("runs shape discovery for every level, not only for minimal", () => {
    expect(RESILIENCE_SRC).not.toContain('thinkingEffort === "minimal" && storedShape === undefined');
    expect(RESILIENCE_SRC).toContain('thinkingEffort !== "default" && storedShape === undefined');
  });

  it('"default" still means no thinkingConfig at all — a byte-identical request', () => {
    expect(RESILIENCE_SRC).toContain('thinkingEffort === "default"');
    expect(RESILIENCE_SRC).toContain("return thinkingConfig ? { temperature: 0.7, thinkingConfig } : { temperature: 0.7 };");
  });
});

describe("index.ts wiring", () => {
  it("reads one env var per mode, with today's behaviour as the fallback", () => {
    expect(INDEX_SRC).toContain('"THINKING_EFFORT_PRIMARY"');
    expect(INDEX_SRC).toContain('"THINKING_EFFORT_ANALYSIS"');
    expect(INDEX_SRC).toContain('"THINKING_EFFORT_STANDARD"');
    expect(INDEX_SRC).toContain('mode === "primary" ? "minimal" : "default",');
    // Read ONCE per request into thinkingEffortForMode, which both the
    // primary chain and the backup-key retry use — so the two can never ask
    // the same question at two different thinking levels. The non-streaming
    // helper (fetchGeminiNonStreamingWithRetry, the vision pipeline) is
    // deliberately untouched, so its request shape is unaffected by any level.
    expect(INDEX_SRC.split("resolveThinkingEffort(").length - 1).toBe(1);
    expect(INDEX_SRC).toContain("const thinkingEffortForMode = resolveThinkingEffort(");
    expect(INDEX_SRC.split("thinkingEffortForMode").length - 1).toBeGreaterThanOrEqual(3);
  });
});
