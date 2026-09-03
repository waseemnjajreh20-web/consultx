/**
 * Wave-2 integration guards: the wiring of B1b (hybrid retrieval) and D1
 * (embedding + retrieval-result caches) into
 * supabase/functions/fire-safety-chat/index.ts.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE CAN PROVE, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------------
 * hybridRetrieval.ts, retrievalCache.ts and retrievalPolicy.ts are pure (no
 * Deno APIs at import time) and are imported and EXECUTED here — the flag
 * assertions and the RetrievalEngine widening below are real behaviour, and
 * the type-level assignment in Section 1 is checked by `tsc -p
 * tsconfig.app.json`, not by a string match.
 *
 * index.ts itself cannot be imported: it calls serve() at module scope and
 * imports from https://deno.land/std. So the WIRING is asserted structurally —
 * the test reads index.ts off disk and pins the properties that make the
 * flag-off path unchanged. That is a real regression guard (deleting a flag
 * gate, adding a second ungated call site, or wrapping the vision path all
 * fail here) but it is NOT execution. Concretely, these assertions CANNOT
 * prove:
 *   - that a flag-ON request actually returns hybrid rows (needs match_sbc_hybrid
 *     and a live corpus — docs/launch/hybrid-retrieval-notes.md Section 4's gate);
 *   - that a cache hit is byte-identical to a miss (needs a live
 *     retrieval_cache table and two real requests — retrieval-cache-notes.md's
 *     "cached == uncached" invariant, step 4 of its gating plan);
 *   - that flag-OFF is byte-identical at RUNTIME. What is provable from text
 *     is that every await on a cache/hybrid helper sits on the true side of a
 *     flag guard and that the pre-existing expression survives verbatim as the
 *     else-branch; the runtime claim rests on that plus the flag readers'
 *     exact-"1" behaviour, which IS executed below.
 * The live gate is the orchestrator's, not this file's.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  HYBRID_RETRIEVAL_FLAG_ENV,
  isHybridRetrievalEnabled,
} from "../../supabase/functions/fire-safety-chat/hybridRetrieval.ts";
import {
  RETRIEVAL_CACHE_FLAG_ENV,
  retrievalCacheEnabled,
} from "../../supabase/functions/fire-safety-chat/retrievalCache.ts";
import type { RetrievalEngine } from "../../supabase/functions/fire-safety-chat/retrievalPolicy.ts";

const FN_DIR = path.resolve(__dirname, "../../supabase/functions");
const INDEX_SRC = readFileSync(path.join(FN_DIR, "fire-safety-chat/index.ts"), "utf8");
const POLICY_SRC = readFileSync(path.join(FN_DIR, "fire-safety-chat/retrievalPolicy.ts"), "utf8");
const DIAG_SRC = readFileSync(path.join(FN_DIR, "gemini-diag/index.ts"), "utf8");
const CONFIG_TOML = readFileSync(path.resolve(__dirname, "../../supabase/config.toml"), "utf8");

const envOf = (map: Record<string, string>) => (k: string) => map[k];

const countOf = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

/**
 * The source text of fetchSBCContextVector, from its declaration to the
 * comment banner that starts the module-level D1 helpers below it. Used to
 * assert that a call site is INSIDE that function rather than merely present
 * somewhere in a 5,000-line file.
 */
const VECTOR_FN_SRC = (() => {
  const start = INDEX_SRC.indexOf("async function fetchSBCContextVector(");
  const end = INDEX_SRC.indexOf("// D1 RETRIEVAL-RESULT CACHE");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return INDEX_SRC.slice(start, end);
})();

// ===========================================================================
// 1. B1b — hybrid retrieval is wired, once, behind an exact-"1" flag
// ===========================================================================
describe("hybrid retrieval wiring (ADVISORY_HYBRID_RETRIEVAL_ENABLED)", () => {
  it("the flag reader is the one exported by hybridRetrieval.ts, and it is exact-\"1\"", () => {
    expect(HYBRID_RETRIEVAL_FLAG_ENV).toBe("ADVISORY_HYBRID_RETRIEVAL_ENABLED");
    expect(isHybridRetrievalEnabled(envOf({}))).toBe(false);
    expect(isHybridRetrievalEnabled(envOf({ [HYBRID_RETRIEVAL_FLAG_ENV]: "1" }))).toBe(true);
    for (const off of ["", "0", "true", "TRUE", "yes", " 1", "1 ", "01"]) {
      expect(isHybridRetrievalEnabled(envOf({ [HYBRID_RETRIEVAL_FLAG_ENV]: off }))).toBe(false);
    }
    // index.ts imports it rather than re-deriving the check inline — a second,
    // hand-rolled `=== "1"` could drift from the module the tests cover.
    expect(INDEX_SRC).toMatch(/isHybridRetrievalEnabled,?\n?[\s\S]{0,80}from "\.\/hybridRetrieval\.ts";/);
  });

  it("fetchSBCContextHybrid has exactly ONE call site, and it is inside fetchSBCContextVector", () => {
    expect(countOf(INDEX_SRC, "fetchSBCContextHybrid(")).toBe(1);
    expect(countOf(VECTOR_FN_SRC, "await fetchSBCContextHybrid(")).toBe(1);
  });

  it("that call site is guarded by the flag helper, with nothing between the guard and the call", () => {
    const guard = "if (isHybridRetrievalEnabled(Deno.env.get)) {";
    expect(countOf(INDEX_SRC, guard)).toBe(1);
    const guardAt = VECTOR_FN_SRC.indexOf(guard);
    const callAt = VECTOR_FN_SRC.indexOf("await fetchSBCContextHybrid(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(guardAt);
    // Nothing between the flag test and the guarded work may await, log, or
    // touch the database. Since the 2026-09-03 tuning the gap also holds the
    // two synchronous knob reads (resolveFloor — a pure env read, no I/O),
    // so the assertion is on the SHAPE of what sits there: `const` bindings
    // only, every one of them a resolveFloor call, ending in `const hybrid =`.
    const between = VECTOR_FN_SRC.slice(guardAt + guard.length, callAt);
    expect(between).not.toMatch(/\bawait\b/);
    expect(between).not.toMatch(/console\./);
    expect(between).not.toMatch(/\.rpc\(|supabaseAdmin/);
    const statements = between.split(";").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements.slice(0, -1)) {
      expect(statement).toMatch(/^const \w+ = resolveFloor\(Deno\.env\.get, /);
    }
    expect(statements[statements.length - 1].replace(/\s/g, "")).toBe("consthybrid=");
  });

  it("the guard sits AFTER the query embedding and BEFORE the match_sbc_documents call", () => {
    // Both halves of the placement matter: the RPC needs the embedding that is
    // computed above it, and skipping the plain vector call is the whole point
    // of the hybrid RPC (it already carries the vector signal).
    const embeddingAt = VECTOR_FN_SRC.indexOf("queryEmbedding = retrievalCacheEnabled()");
    const guardAt = VECTOR_FN_SRC.indexOf("if (isHybridRetrievalEnabled(Deno.env.get)) {");
    const rpcAt = VECTOR_FN_SRC.indexOf("await supabaseAdmin.rpc('match_sbc_documents'");
    expect(embeddingAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(embeddingAt);
    expect(rpcAt).toBeGreaterThan(guardAt);
  });

  it("it is handed the EMBEDDED text, the same embedding, code filter and matchCount the vector path uses", () => {
    const callAt = VECTOR_FN_SRC.indexOf("await fetchSBCContextHybrid(");
    const args = VECTOR_FN_SRC.slice(callAt, VECTOR_FN_SRC.indexOf(");", callAt));
    // embeddingSourceText, not `query`: the corpus is English, so the lexical
    // leg can only match the English/section-number form of the question
    // (measured 2026-09-03 — see the comment at the call site).
    expect(args).toContain("embeddingSourceText,");
    expect(args).not.toMatch(/^\s*query,\s*$/m);
    expect(args).toContain("queryEmbedding,");
    // codes is plural in hybridRetrieval.ts; today's single filterCode is
    // wrapped for parity, and null (not []) means "no filter".
    expect(args).toContain("filterCode ? [filterCode] : null,");
    expect(args).toContain("matchCount,");
    expect(args).toContain("supabaseAdmin,");
  });

  it('a hybrid result reports engine "hybrid", no graph expansion and no fallback', () => {
    expect(countOf(INDEX_SRC, 'engine: "hybrid"')).toBe(1);
    const at = INDEX_SRC.indexOf('engine: "hybrid"');
    const block = INDEX_SRC.slice(at, at + 200);
    expect(block).toContain("graphExpansionCount: null,");
    expect(block).toContain("fallbackReason: null,");
    // The pre-existing vector return is untouched — graphExpansion.test.ts
    // anchors on this exact string.
    expect(INDEX_SRC).toContain('return { context, files: usedFiles, sourceMeta, engine: "vector"');
  });

  it('RetrievalEngine includes "hybrid"', () => {
    // Type-level: this assignment is checked by tsc, so the union really does
    // admit the literal — a string match alone could pass on a stale comment.
    const engine: RetrievalEngine = "hybrid";
    expect(engine).toBe("hybrid");
    expect(POLICY_SRC).toContain('export type RetrievalEngine = "vector" | "keyword" | "hybrid";');
    // ...and the widened value reaches the client through the same one field
    // the other two engines already travel on.
    const evAt = INDEX_SRC.indexOf('type: "sources"');
    expect(INDEX_SRC.slice(evAt, evAt + 500)).toContain("engine: retrievalEngine,");
  });

  it("the multi-topic path is deliberately NOT hybrid (recorded, not enforced elsewhere)", () => {
    // decomposeQuery's sub-queries still go through match_sbc_documents. The
    // hybrid RPC applies to the primary retrieval call only in this wave; this
    // assertion exists so a later change to that is a deliberate edit here.
    const multiAt = VECTOR_FN_SRC.indexOf("const subQueries = decomposeQuery(query);");
    expect(multiAt).toBeGreaterThan(-1);
    expect(VECTOR_FN_SRC.slice(multiAt)).not.toContain("fetchSBCContextHybrid");
  });
});

// ===========================================================================
// 2. D1 — both caches are wired behind retrievalCacheEnabled()
// ===========================================================================
describe("retrieval + embedding cache wiring (RETRIEVAL_CACHE_ENABLED)", () => {
  it("the flag reader is retrievalCache.ts's own, and reads OFF wherever Deno is absent", () => {
    expect(RETRIEVAL_CACHE_FLAG_ENV).toBe("RETRIEVAL_CACHE_ENABLED");
    // globalThis.Deno does not exist under vitest, so this is the module's
    // documented "always OFF outside the Edge Function" behaviour — not a
    // statement about production, where the env var decides.
    expect(retrievalCacheEnabled()).toBe(false);
    expect(INDEX_SRC).toMatch(/retrievalCacheEnabled,?\n?[\s\S]{0,120}from "\.\/retrievalCache\.ts";/);
  });

  it("every getEmbeddingCached call is on the true side of a retrievalCacheEnabled() ternary", () => {
    // Two: the primary query embedding and the multi-topic sub-query embedding.
    expect(countOf(INDEX_SRC, "getEmbeddingCached(")).toBe(2);
    const guarded = INDEX_SRC.match(/retrievalCacheEnabled\(\)\s*\n?\s*\?\s*await getEmbeddingCached\(/g) ?? [];
    expect(guarded.length).toBe(2);
    // Both live inside fetchSBCContextVector, nowhere else.
    expect(countOf(VECTOR_FN_SRC, "getEmbeddingCached(")).toBe(2);
  });

  it("both embedding call sites keep the pre-wiring expression as the else-branch", () => {
    // Flag OFF must run exactly what ran before: the inline embedContent
    // closure for the primary query, embedQueryText for a sub-query.
    expect(VECTOR_FN_SRC).toContain(": await computeQueryEmbedding();");
    expect(VECTOR_FN_SRC).toContain(": await embedQueryText(subText, GEMINI_API_KEY);");
  });

  it("the two fallback reasons the embedding path reports are unchanged", () => {
    // These strings are the X-Retrieval-Fallback taxonomy; wrapping the call
    // must not rename them. They now leave through EmbeddingFailure, which is
    // also what keeps a failure out of both cache layers.
    expect(VECTOR_FN_SRC).toContain("throw new EmbeddingFailure(`embedding_http_${embResponse.status}`);");
    expect(VECTOR_FN_SRC).toContain('throw new EmbeddingFailure("embedding_empty");');
    expect(VECTOR_FN_SRC).toContain("if (embErr instanceof EmbeddingFailure) return keywordFallback(embErr.reason);");
  });

  it("getRetrievalCached has exactly ONE call site, inside `if (retrievalCacheEnabled())`", () => {
    expect(countOf(INDEX_SRC, "getRetrievalCached(")).toBe(1);
    const guardAt = INDEX_SRC.indexOf("if (retrievalCacheEnabled()) {");
    const callAt = INDEX_SRC.indexOf("await getRetrievalCached(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(guardAt);
    expect(callAt - guardAt).toBeLessThan(600);
    // ...and the else-branch is the plain, pre-wiring call.
    expect(INDEX_SRC).toContain("vec = await runVectorRetrieval();");
  });

  it("the retrieval cache wraps the ADVISORY TEXT call only — never the vision path", () => {
    // fetchSBCContextVector still has exactly three occurrences (declaration +
    // vision call + advisory call): retrievalPolicy.test.ts pins that count,
    // and the wrapper reuses the advisory one through a closure rather than
    // adding a fourth.
    expect(countOf(INDEX_SRC, "fetchSBCContextVector(")).toBe(3);
    const visionAt = INDEX_SRC.indexOf("await fetchSBCContextVector(enhancedQuery, 'analysis', searchKeywords)");
    const cacheAt = INDEX_SRC.indexOf("await getRetrievalCached(");
    expect(visionAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeGreaterThan(visionAt); // the only wrap is further down
    // Nothing cache-shaped anywhere near the vision call site.
    const visionWindow = INDEX_SRC.slice(Math.max(0, visionAt - 1500), visionAt + 1500);
    expect(visionWindow).not.toContain("getRetrievalCached");
    // The wrap is inside the useVector branch of the advisory text pipeline.
    const useVectorAt = INDEX_SRC.indexOf("const useVector = shouldUseVectorForAdvisory(mode, Deno.env.get);");
    expect(useVectorAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeGreaterThan(useVectorAt);
  });

  it("a keyword fallback is never written to the cache", () => {
    // getRetrievalCached stores whatever compute() RESOLVES with, so the only
    // way to keep a transient fallback out of a 24h entry is to reject.
    expect(INDEX_SRC).toContain('if (fresh.engine === "keyword") throw new UncachedRetrievalFallback(fresh);');
    expect(INDEX_SRC).toContain("if (cacheErr instanceof UncachedRetrievalFallback) vec = cacheErr.result;");
    // ...and an unrelated error still propagates rather than being swallowed.
    expect(INDEX_SRC).toMatch(/UncachedRetrievalFallback\) vec = cacheErr\.result;\s*\n\s*else throw cacheErr;/);
  });

  it("the cache key is built from corpus/query state only — nothing user-scoped", () => {
    const at = INDEX_SRC.indexOf("async function buildRetrievalCacheKeyParts(");
    expect(at).toBeGreaterThan(-1);
    const fn = INDEX_SRC.slice(at, INDEX_SRC.indexOf("\n}", at));
    // The five parts, in the order retrieval-cache-notes.md fixes.
    expect(fn).toContain('cacheKey(["embedding", QUERY_EMBEDDING_MODEL_ID, normalizeForKey(embeddingText)])');
    expect(fn).toContain("[...codes].sort().join(\",\")");
    expect(fn).toContain("mode,");
    expect(fn).toContain("`${flagsVersion}|${retrievalFlagFingerprint()}`");
    expect(fn).toContain("String(corpusVersion)");
    // No user/session/conversation identifier may reach the key.
    expect(fn).not.toMatch(/userId|user_id|conversationId|sessionId|userEmail|userMemory/);
  });

  it("the flags component covers the live env flags, not just the owner-bumped row", () => {
    // A flag flip on the deployed function must not serve rows computed under
    // the previous flag state, even if retrieval_flags_version was not bumped.
    const at = INDEX_SRC.indexOf("function retrievalFlagFingerprint(): string {");
    expect(at).toBeGreaterThan(-1);
    const fn = INDEX_SRC.slice(at, INDEX_SRC.indexOf("\n}", at));
    expect(fn).toContain("HYBRID_RETRIEVAL_FLAG_ENV");
    expect(fn).toContain("ADVISORY_GRAPH_FLAG_ENV");
    expect(fn).toContain("ADVISORY_MULTI_QUERY_RETRIEVAL_ENABLED");
    expect(fn).toContain("ADVISORY_BILINGUAL_EMBEDDING_ENABLED");
    expect(fn).toContain("VECTOR_MIN_SIMILARITY_REL_ENV");
    expect(fn).toContain("VECTOR_MIN_SIMILARITY_ABS_ENV");
  });
});

// ===========================================================================
// 3. FLAG-OFF: no new await on a hybrid or cache helper
// ===========================================================================
describe("flag-OFF path: every new await is behind a flag guard", () => {
  const HELPERS = ["getEmbeddingCached", "getRetrievalCached", "fetchSBCContextHybrid"];

  it.each(HELPERS)("every `await %s(` has its flag test as the last gate before it", (helper) => {
    const needle = `await ${helper}(`;
    const GUARD = /retrievalCacheEnabled\(\)|isHybridRetrievalEnabled\(Deno\.env\.get\)/g;
    let from = 0;
    let seen = 0;
    for (;;) {
      const at = INDEX_SRC.indexOf(needle, from);
      if (at === -1) break;
      seen++;
      // Look back a bounded window and find the LAST flag test before the
      // call, then assert nothing awaited happens between the two. That is the
      // property that matters: with the flag off, control never reaches the
      // call, and no work has been started on its behalf either.
      const window = INDEX_SRC.slice(Math.max(0, at - 900), at);
      GUARD.lastIndex = 0;
      let guardEnd = -1;
      for (let m = GUARD.exec(window); m !== null; m = GUARD.exec(window)) {
        guardEnd = m.index + m[0].length;
      }
      expect(guardEnd).toBeGreaterThan(-1);
      expect(window.slice(guardEnd)).not.toMatch(/\bawait\b/);
      from = at + needle.length;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("the flag readers themselves are synchronous — a flag test costs no round trip", () => {
    // Both are plain env reads (proved by executing them above), so the
    // flag-off path adds one property lookup and nothing else. This is the
    // whole basis of the byte-identical claim; it is asserted, not assumed.
    expect(isHybridRetrievalEnabled(envOf({}))).toBe(false);
    expect(retrievalCacheEnabled()).toBe(false);
    expect(INDEX_SRC).not.toMatch(/await\s+(isHybridRetrievalEnabled|retrievalCacheEnabled)\(/);
  });

  it("no cache/hybrid logging happens on the off path", () => {
    // The two new log lines both sit inside a flag-guarded block.
    const hybridLogAt = INDEX_SRC.indexOf("[Hybrid RAG]");
    const guardAt = INDEX_SRC.indexOf("if (isHybridRetrievalEnabled(Deno.env.get)) {");
    expect(hybridLogAt).toBeGreaterThan(guardAt);
    // Inside the guarded block: after the guard, and before the block's own
    // closing brace (a character budget would only track how long the call's
    // argument list happens to be — since the 2026-09-03 tuning it carries
    // four options).
    // (CRLF-tolerant: this repo checks out with CRLF on Windows.)
    const closingBrace = /\r?\n {4}\}\r?\n/.exec(INDEX_SRC.slice(guardAt));
    expect(closingBrace).not.toBeNull();
    const guardBlockEnd = guardAt + closingBrace!.index;
    expect(hybridLogAt).toBeLessThan(guardBlockEnd);
    // Nothing else new logs at all.
    expect(countOf(INDEX_SRC, "[Hybrid RAG]")).toBe(1);
    expect(INDEX_SRC).not.toContain("[Retrieval Cache]");
  });
});

// ===========================================================================
// 4. gemini-diag — token-gated, no secret ever leaves the function
// ===========================================================================
describe("gemini-diag diagnostics function", () => {
  it("is gated on a constant-time x-probe-token compare and fails closed", () => {
    expect(DIAG_SRC).toContain('const got = req.headers.get("x-probe-token") ?? "";');
    // Two secrets open this function since 2026-09-03 — the shared probe token
    // and gemini-diag's own, so the diagnostics are drivable from a shell
    // without rotating the token embedded in the synthetic-probe cron.
    expect(DIAG_SRC).toContain('const accepted = ["PROBE_TASK_TOKEN", "GEMINI_DIAG_TOKEN"]');
    // Fails closed when NEITHER secret is set, and only an actual match passes.
    expect(DIAG_SRC).toContain("if (accepted.length === 0 || !authorized) {");
    expect(DIAG_SRC).toContain('return json({ error: "forbidden" }, 401);');
    // Every candidate is compared — `timingSafeEqual(...) || ok` inside a
    // reduce, never `.some()`, which would stop at the first match and let
    // response time say WHICH secret matched.
    expect(DIAG_SRC).toContain("(ok, expected) => timingSafeEqual(got, expected) || ok");
    expect(DIAG_SRC).not.toMatch(/accepted\.some\(/);
    // Constant-time: length check first, then a full XOR sweep with no early exit.
    const cmpAt = DIAG_SRC.indexOf("function timingSafeEqual(");
    const cmp = DIAG_SRC.slice(cmpAt, DIAG_SRC.indexOf("\n}", cmpAt));
    expect(cmp).toContain("diff |= ab[i] ^ bb[i];");
    expect(cmp).not.toMatch(/if \(ab\[i\] !== bb\[i\]\) return/);
  });

  it("never returns or logs the API key, and truncates every string it emits", () => {
    // The key appears only as a URL query parameter on outbound requests.
    // The only way a secret escapes a function is by being put into a string.
    // Assert every interpolation of the key is the URL query parameter — the
    // one legitimate use — so a stray `${apiKey}` in a log or a response body
    // fails here.
    const interpolations = DIAG_SRC.match(/\$\{apiKey\}/g) ?? [];
    const urlUses = DIAG_SRC.match(/key=\$\{apiKey\}/g) ?? [];
    expect(urlUses.length).toBeGreaterThan(0);
    expect(interpolations.length).toBe(urlUses.length);
    expect(DIAG_SRC).not.toMatch(/console\.[a-z]+\([^)]*apiKey/);
    expect(DIAG_SRC).toContain("const MAX_STRING = 300;");
    expect(DIAG_SRC).toContain("t.length > MAX_STRING ?");
  });

  it("probes exactly the geminiContextCache.ts hypotheses, then deletes the cache object", () => {
    expect(DIAG_SRC).toContain("v1beta/cachedContents?key=");
    expect(DIAG_SRC).toContain('ttl: CACHE_TTL,');
    expect(DIAG_SRC).toContain('const CACHE_TTL = "600s";');
    expect(DIAG_SRC).toContain("out.stream_with_cache_only");
    expect(DIAG_SRC).toContain("out.stream_with_cache_and_system");
    // The cache-only variant must send NO systemInstruction — that is the
    // shape buildRequestWithCache produces.
    const onlyAt = DIAG_SRC.indexOf("out.stream_with_cache_only");
    const onlyBlock = DIAG_SRC.slice(onlyAt, DIAG_SRC.indexOf("});", onlyAt));
    expect(onlyBlock).not.toContain("systemInstruction");
    expect(DIAG_SRC).toContain('{ method: "DELETE" }');
  });

  it("uses the shared model-list helper rather than a second copy of the ListModels call", () => {
    expect(DIAG_SRC).toContain(
      'import { fetchAvailableGeminiModels } from "../fire-safety-chat/geminiResilience.ts";',
    );
  });

  it("has a verify_jwt = false entry in config.toml, like synthetic-probe", () => {
    expect(CONFIG_TOML).toMatch(/\[functions\.gemini-diag\]\r?\nverify_jwt = false/);
  });
});
