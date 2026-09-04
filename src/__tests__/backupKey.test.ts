/**
 * Second capacity path (2026-09-04) — the smallest change that would have made
 * the 2026-09-03 outage survivable.
 *
 * That outage was one Google project answering 403 PERMISSION_DENIED to every
 * model AND to embeddings for fourteen hours. The model chain cannot route
 * around it: the chain varies the MODEL, the block is on the PROJECT. A key on
 * a different project can. GOOGLE_GEMINI_API_KEY_FALLBACK is not a flag —
 * absent means today's behaviour.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FALLBACK_KEY_ENV,
  isCapacityClassFailure,
  resolveFallbackKey,
} from "../../supabase/functions/fire-safety-chat/geminiResilience.ts";

const envOf = (map: Record<string, string>) => (k: string) => map[k];

describe("resolveFallbackKey", () => {
  it("returns the backup key when it is set and genuinely different", () => {
    expect(resolveFallbackKey(envOf({ [FALLBACK_KEY_ENV]: "AIza-backup" }), "AIza-primary")).toBe("AIza-backup");
    expect(resolveFallbackKey(envOf({ [FALLBACK_KEY_ENV]: "  AIza-backup  " }), "AIza-primary")).toBe("AIza-backup");
  });

  it("returns null when absent, empty, or a copy of the primary", () => {
    expect(resolveFallbackKey(envOf({}), "AIza-primary")).toBeNull();
    expect(resolveFallbackKey(envOf({ [FALLBACK_KEY_ENV]: "" }), "AIza-primary")).toBeNull();
    expect(resolveFallbackKey(envOf({ [FALLBACK_KEY_ENV]: "   " }), "AIza-primary")).toBeNull();
    // A copy would double every outage's latency while changing nothing.
    expect(resolveFallbackKey(envOf({ [FALLBACK_KEY_ENV]: "AIza-primary" }), "AIza-primary")).toBeNull();
    expect(resolveFallbackKey(envOf({ [FALLBACK_KEY_ENV]: " AIza-primary " }), "AIza-primary ")).toBeNull();
  });
});

describe("isCapacityClassFailure", () => {
  it("covers what a different project could plausibly serve", () => {
    for (const c of ["GEMINI_PROJECT_BLOCKED", "GEMINI_AUTH_ERROR", "GEMINI_RATE_LIMIT", "GEMINI_PROVIDER_ERROR"] as const) {
      expect(isCapacityClassFailure(c)).toBe(true);
    }
  });

  it("excludes request-shaped failures — the backup would fail identically", () => {
    for (const c of ["GEMINI_REQUEST_ERROR", "UNKNOWN_AI_ERROR", "CONSULTX_DAILY_LIMIT"] as const) {
      expect(isCapacityClassFailure(c)).toBe(false);
    }
  });
});

describe("index.ts wiring", () => {
  const INDEX_SRC = readFileSync(
    path.resolve(__dirname, "../../supabase/functions/fire-safety-chat/index.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("retries the chain on the backup key only after the primary chain is exhausted", () => {
    const primaryLoopAt = INDEX_SRC.indexOf("for (const model of modelChain) {");
    const backupAt = INDEX_SRC.indexOf("const backupKey = resolveFallbackKey(Deno.env.get, GEMINI_API_KEY);");
    const failAt = INDEX_SRC.indexOf("const classified = classifyGeminiChainFailure(chainFailures);");
    expect(primaryLoopAt).toBeGreaterThan(-1);
    expect(backupAt).toBeGreaterThan(primaryLoopAt);
    expect(failAt).toBeGreaterThan(backupAt);
  });

  it("is gated on BOTH a backup key and a capacity-class failure", () => {
    expect(INDEX_SRC).toContain("if (backupKey && isCapacityClassFailure(firstPass.classification)) {");
  });

  it("never hands the backup project a cached-content reference from the primary", () => {
    const backupAt = INDEX_SRC.indexOf("const backupKey = resolveFallbackKey(");
    const block = INDEX_SRC.slice(backupAt, INDEX_SRC.indexOf("if (!response || !response.ok) {", backupAt));
    expect(block).toContain("null, // never a cached-content ref");
    expect(block).not.toContain("cacheRef ? { ref: cacheRef, mode } : null");
  });

  it("records the backup's own failures so the reported class still reflects everything tried", () => {
    const backupAt = INDEX_SRC.indexOf("const backupKey = resolveFallbackKey(");
    const block = INDEX_SRC.slice(backupAt, INDEX_SRC.indexOf("if (!response || !response.ok) {", backupAt));
    expect(block).toContain("chainFailures.push({ status: result.response.status, errorText: result.errorText });");
  });
});
