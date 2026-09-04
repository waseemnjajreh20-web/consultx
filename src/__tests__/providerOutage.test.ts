/**
 * A2 — honest failure classification, written during the 2026-09-03 provider
 * outage (Gemini answered 403 PERMISSION_DENIED "Your project has been denied
 * access" on every model AND on embeddings, while ListModels kept working).
 *
 * Two defects that outage exposed, both fixed here:
 *   1. an account-level block was reported to the user as a generic "service
 *      error", which reads as "your question failed" and tells the on-call
 *      reader nothing;
 *   2. the class was computed from the LAST model in the chain. The chain ends
 *      on the oldest fallbacks, which answer 404 "no longer available to new
 *      users" — so a block that hit every model was reported as
 *      GEMINI_REQUEST_ERROR.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  classifyGeminiChainFailure,
  classifyGeminiError,
} from "../../supabase/functions/fire-safety-chat/geminiResilience.ts";

const DENIED = JSON.stringify({
  error: { code: 403, message: "Your project has been denied access. Please contact support.", status: "PERMISSION_DENIED" },
});
const MODEL_GONE = JSON.stringify({
  error: { code: 404, message: "This model models/gemini-2.5-flash is no longer available to new users.", status: "NOT_FOUND" },
});
const RATE = JSON.stringify({ error: { code: 429, message: "Resource has been exhausted" } });

describe("classifyGeminiError — project-level denial", () => {
  it("separates an account block from a bad key, and says so to the user", () => {
    const c = classifyGeminiError(403, DENIED);
    expect(c.classification).toBe("GEMINI_PROJECT_BLOCKED");
    expect(c.status).toBe(503);
    // The user is told it is not their question, without a misleading
    // "try again in a minute" — a retry cannot fix an account block.
    expect(c.userMessageAr).toContain("ليست في سؤالك");
    expect(c.userMessageAr).not.toContain("دقيقة");
    expect(c.userMessage).toContain("not a problem with your question");
    // The log line names the owner action, since nothing in the code can fix it.
    expect(c.logSafe).toContain("owner action");
  });

  it("still classifies an invalid key as an auth error", () => {
    expect(classifyGeminiError(401, "API key not valid").classification).toBe("GEMINI_AUTH_ERROR");
    expect(classifyGeminiError(403, "forbidden for this caller").classification).toBe("GEMINI_AUTH_ERROR");
  });

  it("keeps rate limiting ahead of everything, however it is worded", () => {
    expect(classifyGeminiError(429, RATE).classification).toBe("GEMINI_RATE_LIMIT");
    expect(classifyGeminiError(403, "quota exceeded").classification).toBe("GEMINI_RATE_LIMIT");
  });
});

describe("classifyGeminiChainFailure — the whole chain, not its last attempt", () => {
  it("reports the account block even when the chain ENDS on dead-model 404s", () => {
    // The exact 2026-09-03 shape: 3.x models blocked, then old models 404.
    const c = classifyGeminiChainFailure([
      { status: 403, errorText: DENIED },
      { status: 403, errorText: DENIED },
      { status: 404, errorText: MODEL_GONE },
      { status: 404, errorText: MODEL_GONE },
    ]);
    expect(c.classification).toBe("GEMINI_PROJECT_BLOCKED");
  });

  it("prefers the most explanatory cause: block > rate limit > auth > provider 5xx > the rest", () => {
    expect(classifyGeminiChainFailure([
      { status: 500, errorText: "upstream" },
      { status: 429, errorText: RATE },
    ]).classification).toBe("GEMINI_RATE_LIMIT");

    expect(classifyGeminiChainFailure([
      { status: 429, errorText: RATE },
      { status: 403, errorText: DENIED },
    ]).classification).toBe("GEMINI_PROJECT_BLOCKED");

    expect(classifyGeminiChainFailure([
      { status: 404, errorText: MODEL_GONE },
      { status: 503, errorText: "unavailable" },
    ]).classification).toBe("GEMINI_PROVIDER_ERROR");
  });

  it("keeps the earliest attempt on a tie — the model the request actually wanted", () => {
    const c = classifyGeminiChainFailure([
      { status: 500, errorText: "first upstream failure" },
      { status: 502, errorText: "second upstream failure" },
    ]);
    expect(c.classification).toBe("GEMINI_PROVIDER_ERROR");
    expect(c.logSafe).toContain("500");
  });

  it("degrades sanely with no attempts at all", () => {
    expect(classifyGeminiChainFailure([]).classification).toBeTruthy();
  });

  it("matches single-attempt classifyGeminiError for a one-model chain", () => {
    for (const [status, body] of [[403, DENIED], [429, RATE], [404, MODEL_GONE]] as const) {
      expect(classifyGeminiChainFailure([{ status, errorText: body }]).classification)
        .toBe(classifyGeminiError(status, body).classification);
    }
  });
});

describe("index.ts wiring", () => {
  const INDEX_SRC = readFileSync(
    path.resolve(__dirname, "../../supabase/functions/fire-safety-chat/index.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("collects every chain failure and classifies from the collection", () => {
    expect(INDEX_SRC).toContain("const chainFailures: Array<{ status: number; errorText: string }> = [];");
    expect(INDEX_SRC).toContain("chainFailures.push({ status: result.response.status, errorText: result.errorText });");
    expect(INDEX_SRC).toContain("const classified = classifyGeminiChainFailure(chainFailures);");
    // The log line now carries every status, so the cause is readable without
    // re-reading the provider's own logs.
    expect(INDEX_SRC).toContain("chainFailures.map((f) => f.status).join(\", \")");
  });

  it("still rolls the quota back before reporting the failure", () => {
    const rollbackAt = INDEX_SRC.indexOf("await rollbackQuotaIfNeeded(adminClient);\n      const classified = classifyGeminiChainFailure");
    expect(rollbackAt).toBeGreaterThan(-1);
  });
});
