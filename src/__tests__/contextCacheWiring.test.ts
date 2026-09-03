/**
 * D2 integration guards: the wiring of Gemini context caching
 * (`supabase/functions/fire-safety-chat/geminiContextCache.ts`) into
 * `geminiResilience.ts` and `index.ts`, behind
 * `GEMINI_CONTEXT_CACHE_ENABLED` (exact "1", default OFF).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE CAN PROVE, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------------
 * geminiContextCache.ts and geminiResilience.ts are pure (no Deno APIs at
 * import time) and are imported and EXECUTED here: the flag semantics, the
 * flag-OFF request-body byte-identity, and the retry-once-without-cache
 * protocol below are real behaviour, not string matching.
 *
 * index.ts cannot be imported (it calls serve() at module scope and imports
 * from https://deno.land/std), so its wiring is asserted structurally — the
 * test reads index.ts off disk and pins the properties that keep the flag-OFF
 * path unchanged. Same technique, and same limits, as wave2Wiring.test.ts.
 * Concretely, these assertions CANNOT prove:
 *   - that a flag-ON request actually gets a cache hit from the live
 *     `cachedContents` endpoint (needs a real key — the orchestrator's gate,
 *     see docs/launch/context-cache-notes.md "gating plan");
 *   - that a cached answer is as good as an uncached one (needs the
 *     13-question benchmark subset, live, flag ON);
 *   - that flag-OFF is byte-identical at RUNTIME inside the Edge Function.
 *     What IS proved here is the two halves that claim rests on: (a) in
 *     index.ts every new await sits on the true side of the single flag
 *     guard, and (b) in geminiResilience.ts, with no cache binding, the
 *     serialized request body is character-for-character the pre-D2 body —
 *     that half is executed, not matched.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GEMINI_CONTEXT_CACHE_FLAG_ENV,
  DEFAULT_CONTEXT_CACHE_TTL_SECONDS,
  contextCacheStats,
  ensureContextCache,
  isContextCacheEnabled,
  resetContextCacheState,
  type ContextCacheRef,
  type EnvReader,
} from "../../supabase/functions/fire-safety-chat/geminiContextCache.ts";
import {
  fetchGeminiStreamWithRetry,
  resetBreakers,
  type GeminiCacheBinding,
} from "../../supabase/functions/fire-safety-chat/geminiResilience.ts";

const FN_DIR = path.resolve(__dirname, "../../supabase/functions");
/** Both files are stored CRLF in this checkout; normalising means the
 * multi-line anchors below assert code shape, not a line-ending accident. */
const readSrc = (rel: string): string =>
  readFileSync(path.join(FN_DIR, rel), "utf8").replace(/\r\n/g, "\n");
const INDEX_SRC = readSrc("fire-safety-chat/index.ts");
const RESILIENCE_SRC = readSrc("fire-safety-chat/geminiResilience.ts");

const envOf = (map: Record<string, string>) => (k: string) => map[k];

const countOf = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

/** The one flag-guarded block in index.ts: from the guard to the stage mark
 * that closes it. Used to assert a statement is INSIDE the guard rather than
 * merely present somewhere in a 5,000-line file. */
const GUARDED_BLOCK = (() => {
  const start = INDEX_SRC.indexOf("if (contextCacheOn) {");
  const endAnchor = 'markStage(cacheRef ? "cache_hit" : "cache_miss");';
  const end = INDEX_SRC.indexOf(endAnchor);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return INDEX_SRC.slice(start, end + endAnchor.length);
})();

/** fetchGeminiNonStreamingWithRetry's source — the sibling helper D2 must
 * leave completely alone. */
const NONSTREAMING_FN_SRC = (() => {
  const start = RESILIENCE_SRC.indexOf("export async function fetchGeminiNonStreamingWithRetry(");
  expect(start).toBeGreaterThan(-1);
  return RESILIENCE_SRC.slice(start);
})();

// ===========================================================================
// 1. The flag: one owner, exact "1", default OFF
// ===========================================================================
describe("GEMINI_CONTEXT_CACHE_ENABLED", () => {
  it('is exact-"1" and named by geminiContextCache.ts, not re-derived inline', () => {
    expect(GEMINI_CONTEXT_CACHE_FLAG_ENV).toBe("GEMINI_CONTEXT_CACHE_ENABLED");
    expect(isContextCacheEnabled(envOf({}))).toBe(false);
    expect(isContextCacheEnabled(envOf({ [GEMINI_CONTEXT_CACHE_FLAG_ENV]: "1" }))).toBe(true);
    for (const off of ["", "0", "true", "TRUE", "yes", " 1", "1 ", "01"]) {
      expect(isContextCacheEnabled(envOf({ [GEMINI_CONTEXT_CACHE_FLAG_ENV]: off }))).toBe(false);
    }
    // index.ts imports the reader instead of hand-rolling a second `=== "1"`
    // that could drift from the module these tests cover.
    expect(INDEX_SRC).toMatch(/isContextCacheEnabled,?\n?[\s\S]{0,160}from "\.\/geminiContextCache\.ts";/);
    expect(countOf(INDEX_SRC, 'Deno.env.get("GEMINI_CONTEXT_CACHE_ENABLED")')).toBe(0);
  });

  it("is read exactly ONCE in index.ts, into a single boolean", () => {
    expect(countOf(INDEX_SRC, "isContextCacheEnabled(")).toBe(1);
    expect(countOf(INDEX_SRC, "const contextCacheOn = isContextCacheEnabled(Deno.env.get);")).toBe(1);
    expect(countOf(INDEX_SRC, "if (contextCacheOn) {")).toBe(1);
  });
});

// ===========================================================================
// 2. index.ts — every new await is on the true side of that one guard
// ===========================================================================
describe("index.ts context-cache wiring", () => {
  it("the cache LOOKUP is the only await on the request path; the create is fired, never awaited", () => {
    // v2 (2026-09-03): awaiting the create was what failed the first gate —
    // 0.4-2.7s of cachedContents POST on every miss, paid by a request that
    // then went out uncached anyway. The lookup is registry-only (no network);
    // the create runs in the background for the NEXT request.
    expect(countOf(INDEX_SRC, "await lookupContextCache(")).toBe(1);
    expect(countOf(GUARDED_BLOCK, "await lookupContextCache(")).toBe(1);
    expect(countOf(INDEX_SRC, "await ensureContextCache(")).toBe(0);
    expect(countOf(GUARDED_BLOCK, "scheduleBackground(")).toBe(1);
    expect(countOf(GUARDED_BLOCK, "ensureContextCache(")).toBe(1);
    // Not a bare floating promise: the runtime tears pending work down when
    // the response ends, which is why two probe rounds seconds apart both
    // reported cache_miss before this changed (measured 2026-09-03).
    expect(GUARDED_BLOCK).not.toContain("void ensureContextCache(");
    // Exactly one await inside the guard, and it is the lookup.
    expect(countOf(GUARDED_BLOCK, "await ")).toBe(1);
    const guardHead = "if (contextCacheOn) {";
    const between = GUARDED_BLOCK.slice(
      guardHead.length,
      GUARDED_BLOCK.indexOf("cacheRef = await lookupContextCache("),
    );
    expect(between).not.toMatch(/\bawait\b/);
    expect(between.replace(/^\s*\/\/.*$/gm, "").replace(/\s/g, "")).toBe("");
  });

  it("the background create is guarded by the miss AND cannot reject unhandled", () => {
    const missAt = GUARDED_BLOCK.indexOf("if (!cacheRef) {");
    const createAt = GUARDED_BLOCK.indexOf("scheduleBackground(");
    expect(missAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(missAt);
    // An unhandled rejection in a fire-and-forget promise can take down the
    // isolate; the create is fail-open by contract but the catch is belt.
    expect(GUARDED_BLOCK).toContain(").catch(() => {})");
  });

  it("no context-cache helper is reachable outside the guard", () => {
    expect(countOf(INDEX_SRC, "contextCacheStats()")).toBe(1);
    expect(countOf(GUARDED_BLOCK, "contextCacheStats()")).toBe(1);
    expect(countOf(INDEX_SRC, "[ContextCache]")).toBe(1);
    expect(countOf(GUARDED_BLOCK, "[ContextCache]")).toBe(1);
    expect(countOf(INDEX_SRC, "markStage(cacheRef ?")).toBe(1);
    expect(countOf(GUARDED_BLOCK, "markStage(cacheRef ?")).toBe(1);
  });

  it("reports the outcome as a TIMED STAGE, so a probe can read it off X-Timing", () => {
    // The first gate could not tell a hit from a create: function_logs lag by
    // more than the measurement window. cache_hit / cache_miss ride back on
    // the response header itself.
    expect(GUARDED_BLOCK).toContain('markStage(cacheRef ? "cache_hit" : "cache_miss");');
    expect(GUARDED_BLOCK).toContain('${cacheRef ? "hit" : "miss->background create"}');
  });
  it("resolves the cache per model INSIDE the chain loop, with the shared TTL constant", () => {
    // A cachedContents object is bound to one model, so a fallback to the next
    // model in buildModelChain must not inherit the previous model's cache.
    const loopAt = INDEX_SRC.indexOf("for (const model of modelChain) {");
    const declAt = INDEX_SRC.indexOf("let cacheRef: ContextCacheRef | null = null;");
    const callAt = INDEX_SRC.indexOf("scheduleBackground(", declAt);
    const chainEndAt = INDEX_SRC.indexOf("if (!response || !response.ok) {");
    expect(loopAt).toBeGreaterThan(-1);
    expect(declAt).toBeGreaterThan(loopAt);
    expect(callAt).toBeGreaterThan(declAt);
    expect(chainEndAt).toBeGreaterThan(callAt);
    // Arguments: the per-request model AND mode, the static prefix, the env
    // reader (the module's own second flag gate) and the shared TTL.
    const args = INDEX_SRC.slice(callAt, INDEX_SRC.indexOf(");", callAt));
    expect(args).toContain("GEMINI_API_KEY,");
    expect(args).toContain("model,");
    expect(args).toContain("mode,");
    expect(args).toContain("staticPromptPrefix,");
    expect(args).toContain("Deno.env.get,");
    expect(args).toContain("DEFAULT_CONTEXT_CACHE_TTL_SECONDS,");
  });

  it("passes the binding to fetchGeminiStreamWithRetry only when a ref exists", () => {
    expect(countOf(INDEX_SRC, "cacheRef ? { ref: cacheRef, mode } : null,")).toBe(1);
    // The pre-D2 argument list survives verbatim ahead of it — same key, model,
    // systemInstruction, contents, maxAttempts and thinking effort.
    expect(INDEX_SRC).toContain("GEMINI_API_KEY, model, systemInstruction, contents, 3,");
    expect(INDEX_SRC).toContain('mode === "primary" ? "minimal" : "default",');
  });
});

// ===========================================================================
// 3. index.ts — the static/dynamic prompt boundary
// ===========================================================================
describe("staticPromptPrefix (the cacheable leading substring)", () => {
  it("is declared empty and is never appended to what the model receives", () => {
    expect(countOf(INDEX_SRC, 'let staticPromptPrefix = "";')).toBe(1);
    // Bookkeeping only: it must never flow INTO fullSystemPrompt, or the
    // flag-off prompt would change.
    expect(INDEX_SRC).not.toContain("fullSystemPrompt += staticPromptPrefix");
    expect(INDEX_SRC).not.toContain("fullSystemPrompt = staticPromptPrefix");
    expect(INDEX_SRC).not.toContain("+ staticPromptPrefix");
  });

  it("primary caches its whole contract; standard/analysis cache the base prompt", () => {
    // Primary: the assignment sits directly after the getPrimaryPrompt() call,
    // before anything is appended.
    const primaryAt = INDEX_SRC.indexOf("fullSystemPrompt = getPrimaryPrompt({");
    const primaryPrefixAt = INDEX_SRC.indexOf("staticPromptPrefix = fullSystemPrompt;");
    expect(primaryAt).toBeGreaterThan(-1);
    expect(primaryPrefixAt).toBeGreaterThan(primaryAt);
    expect(primaryPrefixAt - primaryAt).toBeLessThan(400);

    // Standard/analysis: the per-mode contract from promptContract.ts.
    const baseAt = INDEX_SRC.indexOf("fullSystemPrompt = basePrompt;");
    const basePrefixAt = INDEX_SRC.indexOf("staticPromptPrefix = basePrompt;");
    expect(baseAt).toBeGreaterThan(-1);
    expect(basePrefixAt).toBeGreaterThan(baseAt);
    expect(basePrefixAt - baseAt).toBeLessThan(300);
  });

  it("extends the prefix with CITATION_TOKEN_CONTRACT only when it landed directly after basePrompt", () => {
    // When queryFacts parsed, the machine-facts block is appended BETWEEN
    // basePrompt and the citation contract — so the contract is no longer part
    // of a leading run and the prefix has to stop at basePrompt.
    expect(countOf(INDEX_SRC, "staticPromptPrefix += CITATION_TOKEN_CONTRACT;")).toBe(1);
    expect(INDEX_SRC).toContain("if (citationTokensEnabled && !queryFacts) {\n        staticPromptPrefix += CITATION_TOKEN_CONTRACT;");
    // ...and the real append is still the unconditional-on-flag one.
    expect(INDEX_SRC).toContain("if (citationTokensEnabled) {\n        fullSystemPrompt += CITATION_TOKEN_CONTRACT;");
  });

  it("the vision pipeline is never cached (prefix stays empty there)", () => {
    // runVisionPipeline builds its prompt around the user's query, so there is
    // no request-invariant leading run to cache. Leaving the prefix "" makes
    // ensureContextCache return null for vision requests.
    const visionAt = INDEX_SRC.indexOf("fullSystemPrompt = systemPrompt + extraContext;");
    expect(visionAt).toBeGreaterThan(-1);
    const visionWindow = INDEX_SRC.slice(visionAt, visionAt + 1200);
    expect(visionWindow).not.toContain("staticPromptPrefix");
  });

  it("every assignment keeps the prefix a LEADING substring of fullSystemPrompt", () => {
    // The invariant buildRequestWithCache's slice() depends on. Enumerated
    // rather than inferred: a fifth write appearing anywhere in the file fails
    // here, because a write this test has not reasoned about could break it.
    const writes = INDEX_SRC.match(/staticPromptPrefix\s*\+?=[^;]*;/g) ?? [];
    expect(writes.slice().sort()).toEqual([
      'staticPromptPrefix = "";',
      "staticPromptPrefix += CITATION_TOKEN_CONTRACT;",
      "staticPromptPrefix = basePrompt;",
      "staticPromptPrefix = fullSystemPrompt;",
    ].sort());
  });
});

// ===========================================================================
// 4. geminiResilience.ts — the cache branches, and what they leave alone
// ===========================================================================
describe("geminiResilience.ts context-cache branches", () => {
  it("imports the four helpers it needs from geminiContextCache.ts", () => {
    expect(RESILIENCE_SRC).toMatch(
      /import \{[\s\S]{0,320}from "\.\/geminiContextCache\.ts";/,
    );
    for (const name of [
      "buildRequestWithCache",
      "forgetContextCache",
      "recordContextCacheFallback",
      "shouldRetryWithoutCache",
    ]) {
      expect(RESILIENCE_SRC).toContain(`  ${name},\n`);
    }
  });

  it("the cache binding is the LAST parameter and defaults to null", () => {
    expect(RESILIENCE_SRC).toContain("cacheRef: GeminiCacheBinding | null = null\n)");
    expect(RESILIENCE_SRC).toContain("let activeCache: GeminiCacheBinding | null = cacheRef;");
  });

  it("the pre-D2 body literal survives verbatim as the uncached branch", () => {
    expect(RESILIENCE_SRC).toContain(
      "const baseBody = {\n      systemInstruction,\n      contents,\n      generationConfig: buildGenerationConfig(thinkingConfig),\n    };",
    );
    expect(RESILIENCE_SRC).toContain(
      "const requestBody = activeCache\n      ? buildRequestWithCache(baseBody, activeCache.ref)\n      : baseBody;",
    );
    expect(countOf(RESILIENCE_SRC, "buildRequestWithCache(")).toBe(1); // exactly one call site
  });

  it("the fallback fires at most once, consumes no attempt and records no breaker failure", () => {
    const guard = "if (activeCache && shouldRetryWithoutCache(resp.status, errorText)) {";
    expect(countOf(RESILIENCE_SRC, guard)).toBe(1);
    const at = RESILIENCE_SRC.indexOf(guard);
    const block = RESILIENCE_SRC.slice(at, RESILIENCE_SRC.indexOf("lastErrorText = errorText;", at));
    // Dropped BEFORE anything else, so a second cache-shaped failure cannot
    // re-enter this branch.
    expect(block.indexOf("activeCache = null;")).toBeLessThan(block.indexOf("forgetContextCache("));
    expect(block).toContain("forgetContextCache(model, failedMode);");
    expect(block).toContain("recordContextCacheFallback();");
    expect(block).toContain("attempt--;");
    expect(block).not.toContain("recordBreakerFailure");
  });

  it("sits AFTER the thinking-shape discovery branch, which is untouched", () => {
    // The discovery branch's own condition widened from minimal-only to
    // every non-default level when the thinking ladder landed (2026-09-03);
    // its POSITION relative to the cache branch is what this test is about.
    const thinkingAt = RESILIENCE_SRC.indexOf("thinkingEffort !== \"default\" &&");
    const cacheAt = RESILIENCE_SRC.indexOf("if (activeCache && shouldRetryWithoutCache(");
    const genericAt = RESILIENCE_SRC.indexOf("const retryable = isRetryableStatus(resp.status);");
    expect(thinkingAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeGreaterThan(thinkingAt);
    expect(genericAt).toBeGreaterThan(cacheAt);
    // The breaker gate still runs first, before any cache work.
    expect(RESILIENCE_SRC.indexOf("if (isProviderBreakerEnabled()) {")).toBeLessThan(cacheAt);
  });

  it("the non-streaming helper is left completely alone", () => {
    for (const marker of ["activeCache", "cachedContent", "buildRequestWithCache", "GeminiCacheBinding"]) {
      expect(NONSTREAMING_FN_SRC).not.toContain(marker);
    }
  });
});

// ===========================================================================
// 5. EXECUTED: flag OFF ⇒ the request body is byte-identical to pre-D2
// ===========================================================================
describe("flag OFF request body is byte-identical", () => {
  const SYSTEM_INSTRUCTION = { parts: [{ text: "STATIC CONTRACT\n\nDYNAMIC RETRIEVED CONTEXT" }] };
  const CONTENTS = [{ role: "user", parts: [{ text: "ما هو عرض المخرج المطلوب؟" }] }];
  /** Exactly what fetchGeminiStreamWithRetry serialized before D2 existed:
   * three properties, this order, temperature-only generationConfig. */
  const PRE_D2_BODY = JSON.stringify({
    systemInstruction: SYSTEM_INSTRUCTION,
    contents: CONTENTS,
    generationConfig: { temperature: 0.7 },
  });

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetBreakers();
    resetContextCacheState();
    fetchMock = vi.fn().mockImplementation(async () => new Response("ok", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const bodyOfCall = (i: number): string => String((fetchMock.mock.calls[i][1] as RequestInit).body);

  it("omitting the cache argument entirely reproduces the pre-D2 bytes", async () => {
    const result = await fetchGeminiStreamWithRetry("key", "gemini-3.6-flash", SYSTEM_INSTRUCTION, CONTENTS, 1);
    expect(result.response.status).toBe(200);
    expect(bodyOfCall(0)).toBe(PRE_D2_BODY);
  });

  it("passing null (what index.ts passes with the flag off) is the same string", async () => {
    await fetchGeminiStreamWithRetry("key", "gemini-3.6-flash", SYSTEM_INSTRUCTION, CONTENTS, 1, "default", null);
    const withNull = bodyOfCall(0);

    await fetchGeminiStreamWithRetry("key", "gemini-3.6-flash", SYSTEM_INSTRUCTION, CONTENTS, 1);
    const omitted = bodyOfCall(1);

    expect(withNull).toBe(omitted);
    expect(withNull).toBe(PRE_D2_BODY);
    // Nothing cache-shaped leaks into an uncached request.
    expect(withNull).not.toContain("cachedContent");
  });

  it("a binding DOES change the body — so the comparison above is meaningful", async () => {
    const binding: GeminiCacheBinding = {
      ref: { cachedContent: "cachedContents/abc", staticPrefixText: "STATIC CONTRACT" },
      mode: "standard",
    };
    await fetchGeminiStreamWithRetry("key", "gemini-3.6-flash", SYSTEM_INSTRUCTION, CONTENTS, 1, "default", binding);

    const sent = JSON.parse(bodyOfCall(0));
    expect(sent.cachedContent).toBe("cachedContents/abc");
    // CONFIRMED live 2026-09-03: cachedContent + systemInstruction is a 400.
    expect(sent.systemInstruction).toBeUndefined();
    // The dynamic remainder still reaches the model, ahead of the real turn.
    expect(sent.contents[0].parts[0].text).toContain("DYNAMIC RETRIEVED CONTEXT");
    expect(sent.contents[0].parts[0].text).not.toContain("STATIC CONTRACT");
    expect(sent.contents[sent.contents.length - 1]).toEqual(CONTENTS[0]);
    expect(bodyOfCall(0)).not.toBe(PRE_D2_BODY);
  });
});

// ===========================================================================
// 6. EXECUTED: the retry-once-without-cache protocol, end to end
// ===========================================================================
describe("cache fallback protocol (mocked fetch)", () => {
  const SYSTEM_INSTRUCTION = { parts: [{ text: "STATIC\n\nDYNAMIC" }] };
  const CONTENTS = [{ role: "user", parts: [{ text: "q" }] }];
  const REF: ContextCacheRef = { cachedContent: "cachedContents/stale", staticPrefixText: "STATIC" };
  const BINDING: GeminiCacheBinding = { ref: REF, mode: "standard" };

  beforeEach(() => {
    resetBreakers();
    resetContextCacheState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a 400 naming cachedContent retries the SAME attempt uncached and succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          "CachedContent can not be used with GenerateContent request setting system_instruction",
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    global.fetch = fetchMock;

    // maxAttempts = 1: if the fallback consumed an attempt there would be no
    // second call at all, and the helper would return the 400.
    const result = await fetchGeminiStreamWithRetry(
      "key", "gemini-3.7-flash", SYSTEM_INSTRUCTION, CONTENTS, 1, "default", BINDING,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.response.status).toBe(200);

    const first = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(first.cachedContent).toBe("cachedContents/stale");
    expect(second.cachedContent).toBeUndefined();
    expect(second.systemInstruction).toEqual(SYSTEM_INSTRUCTION);
    expect(second.contents).toEqual(CONTENTS);
  });

  it("a 404 on the cache resource does the same", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    global.fetch = fetchMock;

    const result = await fetchGeminiStreamWithRetry(
      "key", "gemini-3.7-flash", SYSTEM_INSTRUCTION, CONTENTS, 1, "default", BINDING,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.response.status).toBe(200);
  });

  it("fires at most once: a second cache-shaped failure is returned, not retried", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("cachedContent expired", { status: 400 }))
      .mockResolvedValueOnce(new Response("cachedContent expired", { status: 400 }));
    global.fetch = fetchMock;

    const result = await fetchGeminiStreamWithRetry(
      "key", "gemini-3.7-flash", SYSTEM_INSTRUCTION, CONTENTS, 1, "default", BINDING,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.response.status).toBe(400);
  });

  it("a generic 400 is NOT treated as cache-shaped (no extra call)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("Invalid value at 'contents[0].parts[0]'", { status: 400 }));
    global.fetch = fetchMock;

    const result = await fetchGeminiStreamWithRetry(
      "key", "gemini-3.7-flash", SYSTEM_INSTRUCTION, CONTENTS, 1, "default", BINDING,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.response.status).toBe(400);
  });

  it("counts the fallback and FORGETS the ref, so the next request re-creates one", async () => {
    // Executed end-to-end across both modules: create a cache, break it the
    // way the live API breaks a stale one, then show the registry no longer
    // hands the same broken name back.
    const envOn: EnvReader = (k) => (k === GEMINI_CONTEXT_CACHE_FLAG_ENV ? "1" : undefined);
    const STATIC = "STATIC MODE CONTRACT. ".repeat(400);
    let createCount = 0;
    let streamCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      if (String(url).includes("/cachedContents")) {
        createCount++;
        return new Response(JSON.stringify({ name: `cachedContents/gen${createCount}` }), { status: 200 });
      }
      streamCount++;
      // Only the FIRST stream call (the one carrying gen1) fails cache-shaped.
      return streamCount === 1
        ? new Response("CachedContent not found: cachedContents/gen1", { status: 400 })
        : new Response("ok", { status: 200 });
    });

    const first = await ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn);
    expect(first?.cachedContent).toBe("cachedContents/gen1");
    expect(contextCacheStats().creates).toBe(1);

    const result = await fetchGeminiStreamWithRetry(
      "key", "gemini-3.7-flash", SYSTEM_INSTRUCTION, CONTENTS, 1, "default",
      { ref: first as ContextCacheRef, mode: "standard" },
    );
    expect(result.response.status).toBe(200);
    expect(streamCount).toBe(2); // the cached attempt, then the uncached retry
    expect(contextCacheStats().fallbacks).toBe(1);

    // forgetContextCache dropped the registry entry: a hit here would mean the
    // next request kept referencing a cache the API already rejected.
    const second = await ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn);
    expect(second?.cachedContent).toBe("cachedContents/gen2");
    expect(contextCacheStats()).toEqual({ creates: 2, hits: 0, fallbacks: 1 });
  });

  it("a 429 stays geminiResilience's own retry, uncached-fallback never fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    global.fetch = fetchMock;

    const promise = fetchGeminiStreamWithRetry(
      "key", "gemini-3.7-flash", SYSTEM_INSTRUCTION, CONTENTS, 3, "default", BINDING,
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.response.status).toBe(200);
    // Both attempts kept the cache: a rate limit is not the cache's fault.
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(String((call[1] as RequestInit).body)).cachedContent).toBe("cachedContents/stale");
    }
  });
});

// ===========================================================================
// 7. Shared constants stay single-sourced
// ===========================================================================
describe("shared constants", () => {
  it("the TTL index.ts passes is the module's exported default (1 hour)", () => {
    expect(DEFAULT_CONTEXT_CACHE_TTL_SECONDS).toBe(3600);
    expect(INDEX_SRC).toContain("DEFAULT_CONTEXT_CACHE_TTL_SECONDS,");
    expect(countOf(INDEX_SRC, "3600")).toBe(0);
  });
});
