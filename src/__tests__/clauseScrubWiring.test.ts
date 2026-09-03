/**
 * Source-contract tests for the external-clause scrubber wiring in
 * fire-safety-chat/index.ts. index.ts is read as text (it calls serve() at
 * module level). The invariants that matter: the scrubber exists only behind
 * EXTERNAL_CLAUSE_SCRUB_ENABLED, every content delta goes through push() when
 * it exists, and the held tail is released before BOTH [DONE] emission sites.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(
  path.resolve(__dirname, "../../supabase/functions/fire-safety-chat/index.ts"),
  "utf8",
);

describe("external-clause scrubber wiring", () => {
  it("is created only behind the flag helper", () => {
    expect(SRC).toContain('return (Deno.env.get("EXTERNAL_CLAUSE_SCRUB_ENABLED") ?? "").trim() === "1";');
    expect(SRC).toContain("const clauseScrubber = externalClauseScrubEnabled() ? createStreamScrubber() : null;");
  });

  it("routes every content delta through push() when the scrubber exists", () => {
    const sites = SRC.split("clauseScrubber ? clauseScrubber.push(content) : content").length - 1;
    expect(sites).toBe(2); // transform + flush
  });

  it("releases the held tail before both [DONE] emission sites", () => {
    const stopBranch = SRC.indexOf('if (finishReason === "STOP" && !citationVerifierOn) {');
    expect(stopBranch).toBeGreaterThan(-1);
    const afterStop = SRC.slice(stopBranch, stopBranch + 300);
    expect(afterStop.indexOf("releaseScrubberTail(controller)")).toBeLessThan(afterStop.indexOf('data: [DONE]'));

    const flushDone = SRC.indexOf("// The stream is over: whatever the scrubber still holds is final.");
    expect(flushDone).toBeGreaterThan(-1);
    const afterFlush = SRC.slice(flushDone, flushDone + 300);
    expect(afterFlush.indexOf("releaseScrubberTail(controller)")).toBeLessThan(afterFlush.indexOf('data: [DONE]'));
  });

  it("feeds the verifier the SCRUBBED text (single emit path)", () => {
    expect(SRC).toContain("if (citationVerifierOn) answerTextForVerifier += text;");
    expect(SRC.split("answerTextForVerifier += content").length - 1).toBe(0);
  });
});
