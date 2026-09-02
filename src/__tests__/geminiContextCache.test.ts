/**
 * Unit tests for Gemini context caching (D2a) — supabase/functions/fire-safety-chat/geminiContextCache.ts.
 *
 * All Gemini calls are mocked; nothing here touches the network or a real
 * API key (repo rule: builder sub-agents never call Gemini with a real key).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GEMINI_CONTEXT_CACHE_FLAG_ENV,
  DEFAULT_CONTEXT_CACHE_TTL_SECONDS,
  isContextCacheEnabled,
  ensureContextCache,
  forgetContextCache,
  shouldRetryWithoutCache,
  buildRequestWithCache,
  contextCacheStats,
  recordContextCacheFallback,
  resetContextCacheState,
  type EnvReader,
  type GeminiRequestBody,
  type ContextCacheRef,
} from "../../supabase/functions/fire-safety-chat/geminiContextCache.ts";

const ENV_ON: EnvReader = (k) => (k === GEMINI_CONTEXT_CACHE_FLAG_ENV ? "1" : undefined);
const ENV_OFF: EnvReader = () => undefined;

// A long, deterministic string standing in for a real per-mode static
// contract (getPrimaryPrompt() etc. run tens of thousands of characters).
const STATIC_PREFIX = "STATIC MODE CONTRACT TEXT. ".repeat(500);

beforeEach(() => {
  resetContextCacheState();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isContextCacheEnabled", () => {
  it("is true only for the exact string \"1\"", () => {
    expect(isContextCacheEnabled(ENV_ON)).toBe(true);
    expect(isContextCacheEnabled(ENV_OFF)).toBe(false);
    expect(isContextCacheEnabled((k) => (k === GEMINI_CONTEXT_CACHE_FLAG_ENV ? "true" : undefined))).toBe(false);
    expect(isContextCacheEnabled((k) => (k === GEMINI_CONTEXT_CACHE_FLAG_ENV ? "0" : undefined))).toBe(false);
  });
});

describe("ensureContextCache — flag gate", () => {
  it("returns null without calling fetch when the flag is off", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const result = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_OFF);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ensureContextCache — create and reuse", () => {
  it("creates a cache on first call, reuses it within TTL, and sends the documented request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ name: "cachedContents/abc123" }), { status: 200 }),
    );
    global.fetch = fetchMock;

    const first = await ensureContextCache("my-key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);
    expect(first).toEqual({ cachedContent: "cachedContents/abc123", staticPrefixText: STATIC_PREFIX });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(contextCacheStats()).toEqual({ creates: 1, hits: 0, fallbacks: 0 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1beta/cachedContents?key=my-key");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("models/gemini-3.6-flash");
    expect(body.systemInstruction).toEqual({ parts: [{ text: STATIC_PREFIX }] });
    expect(body.ttl).toBe(`${DEFAULT_CONTEXT_CACHE_TTL_SECONDS}s`);

    const second = await ensureContextCache("my-key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);
    expect(second).toEqual({ cachedContent: "cachedContents/abc123", staticPrefixText: STATIC_PREFIX });
    expect(fetchMock).toHaveBeenCalledTimes(1); // reused — no second network call
    expect(contextCacheStats()).toEqual({ creates: 1, hits: 1, fallbacks: 0 });
  });

  it("refreshes after the cache entry's TTL expires", async () => {
    vi.setSystemTime(new Date(2026, 0, 1));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "cachedContents/first" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "cachedContents/second" }), { status: 200 }));
    global.fetch = fetchMock;

    const ttl = 60;
    const first = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON, ttl);
    expect(first?.cachedContent).toBe("cachedContents/first");

    vi.advanceTimersByTime((ttl + 5) * 1000);

    const second = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON, ttl);
    expect(second?.cachedContent).toBe("cachedContents/second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(contextCacheStats().creates).toBe(2);
  });

  it("prefers the server's expireTime over the local ttlSeconds guess when present", async () => {
    vi.setSystemTime(new Date(2026, 0, 1));
    const serverExpiry = new Date(Date.now() + 30_000).toISOString(); // expires sooner than the 3600s default
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: "cachedContents/short-lived", expireTime: serverExpiry }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "cachedContents/renewed" }), { status: 200 }));
    global.fetch = fetchMock;

    const first = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);
    expect(first?.cachedContent).toBe("cachedContents/short-lived");

    vi.advanceTimersByTime(31_000); // past the server's 30s expiry, well within the 3600s default

    const second = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);
    expect(second?.cachedContent).toBe("cachedContents/renewed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates a new cache when the prefix text changes, keyed independently of the old one", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "cachedContents/prefixA" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "cachedContents/prefixB" }), { status: 200 }));
    global.fetch = fetchMock;

    const prefixA = STATIC_PREFIX + " variant A";
    const prefixB = STATIC_PREFIX + " variant B";

    const a = await ensureContextCache("key", "gemini-3.6-flash", "primary", prefixA, ENV_ON);
    const b = await ensureContextCache("key", "gemini-3.6-flash", "primary", prefixB, ENV_ON);

    expect(a?.cachedContent).toBe("cachedContents/prefixA");
    expect(b?.cachedContent).toBe("cachedContents/prefixB");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(contextCacheStats().creates).toBe(2);
  });

  it("keeps model and mode as independent cache dimensions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "cachedContents/primary-flash" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "cachedContents/standard-flash" }), { status: 200 }));
    global.fetch = fetchMock;

    const primary = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);
    const standard = await ensureContextCache("key", "gemini-3.6-flash", "standard", STATIC_PREFIX, ENV_ON);

    expect(primary?.cachedContent).toBe("cachedContents/primary-flash");
    expect(standard?.cachedContent).toBe("cachedContents/standard-flash");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ensureContextCache — rejection handling", () => {
  it("returns null and remembers a too-short rejection for 10 minutes, then retries", async () => {
    vi.setSystemTime(new Date(2026, 0, 1));
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response("Total token count for cached content is too small; minimum is 4096 tokens.", { status: 400 }),
    );
    global.fetch = fetchMock;

    const shortPrefix = "short prompt, nowhere near the real per-mode contract length";

    const first = await ensureContextCache("key", "gemini-3.6-flash", "primary", shortPrefix, ENV_ON);
    expect(first).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still inside the 10-minute skip window: no second network call.
    vi.advanceTimersByTime(9 * 60 * 1000);
    const second = await ensureContextCache("key", "gemini-3.6-flash", "primary", shortPrefix, ENV_ON);
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Window elapsed: tries again (and is rejected again, deterministically).
    vi.advanceTimersByTime(2 * 60 * 1000);
    const third = await ensureContextCache("key", "gemini-3.6-flash", "primary", shortPrefix, ENV_ON);
    expect(third).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null without remembering a generic 4xx (retried on the very next call)", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("unauthorized", { status: 401 }));
    global.fetch = fetchMock;

    const first = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);
    expect(first).toBeNull();
    const second = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails open (returns null, never throws) when fetch itself rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(
      ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON),
    ).resolves.toBeNull();
  });

  it("fails open when the response body is not valid JSON", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(new Response("not json", { status: 200 }));

    await expect(
      ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON),
    ).resolves.toBeNull();
  });

  it("fails open when the create response has no name field", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    const result = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);
    expect(result).toBeNull();
  });
});

describe("forgetContextCache", () => {
  it("evicts the current entry so the next call creates a fresh one", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "cachedContents/first" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "cachedContents/second" }), { status: 200 }));
    global.fetch = fetchMock;

    await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);
    forgetContextCache("gemini-3.6-flash", "primary");
    const second = await ensureContextCache("key", "gemini-3.6-flash", "primary", STATIC_PREFIX, ENV_ON);

    expect(second?.cachedContent).toBe("cachedContents/second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is a no-op when nothing is registered for that (model, mode)", () => {
    expect(() => forgetContextCache("gemini-3.6-flash", "primary")).not.toThrow();
  });
});

describe("shouldRetryWithoutCache", () => {
  it("retries on 404 — the cache resource is gone", () => {
    expect(shouldRetryWithoutCache(404, "not found")).toBe(true);
  });

  it("retries on a 400 that names the cache explicitly", () => {
    expect(shouldRetryWithoutCache(400, "CachedContent not found or expired: cachedContents/xyz")).toBe(true);
    expect(shouldRetryWithoutCache(400, "invalid cached content reference for this model")).toBe(true);
  });

  it("does not retry a generic 400 unrelated to caching", () => {
    expect(shouldRetryWithoutCache(400, "Invalid value at 'contents[0].parts[0]'")).toBe(false);
  });

  it("does not retry rate limits, auth errors or 5xx — geminiResilience already owns those", () => {
    expect(shouldRetryWithoutCache(429, "quota exceeded")).toBe(false);
    expect(shouldRetryWithoutCache(401, "api key not valid")).toBe(false);
    expect(shouldRetryWithoutCache(503, "internal error")).toBe(false);
  });

  it("returns false for a 2xx", () => {
    expect(shouldRetryWithoutCache(200, "")).toBe(false);
  });
});

describe("buildRequestWithCache", () => {
  const staticPrefix = "STATIC CONTRACT TEXT";
  const cacheRef: ContextCacheRef = { cachedContent: "cachedContents/abc", staticPrefixText: staticPrefix };

  it("removes the static prefix and carries the dynamic remainder as a leading contents turn", () => {
    const dynamic = "USER MEMORY BLOCK — remembered facts about this user";
    const baseBody: GeminiRequestBody = {
      systemInstruction: { parts: [{ text: `${staticPrefix}\n\n${dynamic}` }] },
      contents: [{ role: "user", parts: [{ text: "What is the exit width rule?" }] }],
      generationConfig: { temperature: 0.7 },
    };

    const result = buildRequestWithCache(baseBody, cacheRef);

    expect(result.cachedContent).toBe("cachedContents/abc");
    expect((result as Record<string, unknown>).systemInstruction).toBeUndefined();
    expect(result.generationConfig).toEqual({ temperature: 0.7 });
    expect(result.contents).toHaveLength(3);
    expect(result.contents[0].role).toBe("user");
    expect(result.contents[0].parts[0].text).toContain(dynamic);
    expect(result.contents[0].parts[0].text).not.toContain(staticPrefix);
    expect(result.contents[1].role).toBe("model");
    expect(result.contents[2]).toEqual(baseBody.contents[0]); // original conversation untouched
  });

  it("adds no leading turn when there is no dynamic remainder", () => {
    const baseBody: GeminiRequestBody = {
      systemInstruction: { parts: [{ text: staticPrefix }] },
      contents: [{ role: "user", parts: [{ text: "hello" }] }],
    };

    const result = buildRequestWithCache(baseBody, cacheRef);

    expect(result.contents).toEqual(baseBody.contents);
    expect(result.cachedContent).toBe("cachedContents/abc");
  });

  it("fails open by keeping the full text when the static prefix is not a leading substring", () => {
    const baseBody: GeminiRequestBody = {
      systemInstruction: { parts: [{ text: "something else entirely, not the cached prefix" }] },
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
    };

    const result = buildRequestWithCache(baseBody, cacheRef);

    expect(result.contents[0].parts[0].text).toContain("something else entirely");
  });

  it("handles a request with no systemInstruction at all (nothing dynamic to carry)", () => {
    const baseBody: GeminiRequestBody = { contents: [{ role: "user", parts: [{ text: "hi" }] }] };

    const result = buildRequestWithCache(baseBody, cacheRef);

    expect(result.contents).toEqual(baseBody.contents);
  });
});

describe("contextCacheStats / recordContextCacheFallback", () => {
  it("starts at zero and increments fallbacks when the wiring records one", () => {
    expect(contextCacheStats()).toEqual({ creates: 0, hits: 0, fallbacks: 0 });

    recordContextCacheFallback();
    recordContextCacheFallback();

    expect(contextCacheStats().fallbacks).toBe(2);
  });

  it("returns a snapshot, not a live reference callers could mutate", () => {
    const snapshot = contextCacheStats();
    recordContextCacheFallback();
    expect(snapshot.fallbacks).toBe(0);
  });
});
