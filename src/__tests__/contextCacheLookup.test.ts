/**
 * D2 v2 (2026-09-03) — the lookup/create split that the first live gate
 * forced. Behaviour under test, in the module (src/__tests__/
 * contextCacheWiring.test.ts pins the index.ts call shape):
 *
 *   - lookupContextCache NEVER touches the network. It answers from this
 *     isolate's registry, which is why it is safe on the first-byte path.
 *   - a miss returns null WITHOUT creating anything — the caller fires the
 *     create in the background instead.
 *   - concurrent ensureContextCache calls for the same key create ONE
 *     cachedContents object, not N (the fire-and-forget caller can now have
 *     several in flight on one isolate).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  contextCacheStats,
  ensureContextCache,
  GEMINI_CONTEXT_CACHE_FLAG_ENV,
  lookupContextCache,
  resetContextCacheState,
  type EnvReader,
} from "../../supabase/functions/fire-safety-chat/geminiContextCache.ts";

const STATIC = "STATIC PROMPT PREFIX ".repeat(200);
const envOn: EnvReader = (k) => (k === GEMINI_CONTEXT_CACHE_FLAG_ENV ? "1" : undefined);
const envOff: EnvReader = () => undefined;

const realFetch = global.fetch;
beforeEach(() => {
  resetContextCacheState();
});
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("lookupContextCache — registry only, never the network", () => {
  it("returns null on an empty registry and issues NO fetch", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(lookupContextCache("gemini-3.7-flash", "standard", STATIC, envOn)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(contextCacheStats()).toEqual({ creates: 0, hits: 0, fallbacks: 0 });
  });

  it("returns the reference a previous create registered, and counts it as a hit", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ name: "cachedContents/abc" }), { status: 200 })
    ) as unknown as typeof fetch;
    const created = await ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn);
    expect(created?.cachedContent).toBe("cachedContents/abc");

    const noNetwork = vi.fn();
    global.fetch = noNetwork as unknown as typeof fetch;
    const hit = await lookupContextCache("gemini-3.7-flash", "standard", STATIC, envOn);
    expect(hit?.cachedContent).toBe("cachedContents/abc");
    expect(hit?.staticPrefixText).toBe(STATIC);
    expect(noNetwork).not.toHaveBeenCalled();
    expect(contextCacheStats().hits).toBe(1);
  });

  it("misses when the model, the mode, or the prefix text differs", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ name: "cachedContents/abc" }), { status: 200 })
    ) as unknown as typeof fetch;
    await ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn);

    await expect(lookupContextCache("gemini-3.6-flash", "standard", STATIC, envOn)).resolves.toBeNull();
    await expect(lookupContextCache("gemini-3.7-flash", "analysis", STATIC, envOn)).resolves.toBeNull();
    await expect(lookupContextCache("gemini-3.7-flash", "standard", STATIC + "x", envOn)).resolves.toBeNull();
  });

  it("is null with the flag off, and for an empty prefix (the vision path)", async () => {
    await expect(lookupContextCache("gemini-3.7-flash", "standard", STATIC, envOff)).resolves.toBeNull();
    await expect(lookupContextCache("gemini-3.7-flash", "standard", "", envOn)).resolves.toBeNull();
  });
});

describe("ensureContextCache — concurrent creates are deduped per isolate", () => {
  it("three simultaneous callers produce ONE cachedContents object", async () => {
    let creates = 0;
    global.fetch = vi.fn(async () => {
      creates++;
      // Yield once so all three callers are genuinely in flight together.
      await new Promise((r) => setTimeout(r, 0));
      return new Response(JSON.stringify({ name: `cachedContents/gen${creates}` }), { status: 200 });
    }) as unknown as typeof fetch;

    const results = await Promise.all([
      ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn),
      ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn),
      ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn),
    ]);

    expect(creates).toBe(1);
    expect(results.map((r) => r?.cachedContent)).toEqual([
      "cachedContents/gen1",
      "cachedContents/gen1",
      "cachedContents/gen1",
    ]);
    expect(contextCacheStats().creates).toBe(1);
  });

  it("a later create still runs once the first has settled (the map does not leak)", async () => {
    let creates = 0;
    global.fetch = vi.fn(async () => {
      creates++;
      return new Response(JSON.stringify({ name: `cachedContents/gen${creates}` }), { status: 200 });
    }) as unknown as typeof fetch;

    await ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn);
    // A different prefix is a different key, so it must create again rather
    // than joining a stale in-flight entry.
    const other = await ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC + "!", envOn);
    expect(other?.cachedContent).toBe("cachedContents/gen2");
    expect(creates).toBe(2);
  });

  it("a failed create is not cached as a success and does not wedge the key", async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      return calls === 1
        ? new Response("upstream exploded", { status: 500 })
        : new Response(JSON.stringify({ name: "cachedContents/ok" }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn)).resolves.toBeNull();
    await expect(lookupContextCache("gemini-3.7-flash", "standard", STATIC, envOn)).resolves.toBeNull();
    const retried = await ensureContextCache("key", "gemini-3.7-flash", "standard", STATIC, envOn);
    expect(retried?.cachedContent).toBe("cachedContents/ok");
  });
});
