/**
 * Unit tests for Gemini resilience helpers used by fire-safety-chat.
 *
 * These tests verify retry logic, fallback chain construction, error
 * classification, and quota rollback behavior without calling the real
 * Gemini API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AIErrorClass,
  buildModelChain,
  classifyGeminiError,
  fetchAvailableGeminiModels,
  fetchGeminiNonStreamingWithRetry,
  fetchGeminiStreamWithRetry,
  GEMINI_MODEL_CANDIDATES,
  QuotaIncrement,
  recordQuotaIncrement,
  clearQuotaIncrement,
  rollbackQuotaIfNeeded,
  resetGeminiResilienceCache,
  resetBreakers,
  breakerSnapshot,
} from "../../supabase/functions/fire-safety-chat/geminiResilience.ts";

describe("buildModelChain", () => {
  it("prefers the requested model when available", () => {
    const chain = buildModelChain("gemini-2.5-pro", "gemini-2.5-flash", GEMINI_MODEL_CANDIDATES);
    expect(chain[0]).toBe("gemini-2.5-pro");
    expect(chain[1]).toBe("gemini-2.5-flash");
  });

  it("falls back through candidates when preferred is unavailable", () => {
    const available = ["gemini-2.5-flash", "gemini-2.0-flash"];
    const chain = buildModelChain("gemini-2.5-pro", "gemini-2.5-flash", available);
    expect(chain).toEqual(["gemini-2.5-flash", "gemini-2.0-flash"]);
  });

  it("deduplicates models and follows the GA-flash-first candidate order", () => {
    const chain = buildModelChain("gemini-3.7-flash", "gemini-3.7-flash", GEMINI_MODEL_CANDIDATES);
    // 2026-08-31 incident: candidates reordered so fast GA flash models lead
    // (the slow gemini-3.1-pro-preview timed advisory out with big context).
    expect(chain).toEqual([
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-flash-latest",
      "gemini-pro-latest",
      "gemini-3.1-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ]);
  });

  it("advisory default leads with a fast GA flash model, not the slow preview", () => {
    const chain = buildModelChain("gemini-3.7-flash", "gemini-3.6-flash", GEMINI_MODEL_CANDIDATES);
    expect(chain[0]).toBe("gemini-3.7-flash");
    expect(chain[1]).toBe("gemini-3.6-flash");
    // the slow preview + sunset models are only later fallbacks
    expect(chain.indexOf("gemini-3.1-pro-preview")).toBeGreaterThan(chain.indexOf("gemini-3.7-flash"));
    expect(chain.indexOf("gemini-2.5-pro")).toBeGreaterThan(chain.indexOf("gemini-3.1-pro-preview"));
  });

  it("uses newest available gemini model when no candidate is available", () => {
    const available = ["gemini-1.0-pro", "gemini-1.5-pro"];
    const chain = buildModelChain("gemini-2.5-pro", "gemini-2.5-flash", available);
    expect(chain).toEqual(["gemini-1.5-pro"]);
  });
});

describe("classifyGeminiError", () => {
  it("classifies 429 as GEMINI_RATE_LIMIT", () => {
    const err = classifyGeminiError(429, "Quota exceeded");
    expect(err.classification).toBe("GEMINI_RATE_LIMIT");
    expect(err.status).toBe(503);
    expect(err.userMessage).toContain("temporarily busy");
    expect(err.userMessageAr).toContain("الخدمة مشغولة");
  });

  it("classifies resource exhausted text as GEMINI_RATE_LIMIT", () => {
    const err = classifyGeminiError(400, "Resource has been exhausted");
    expect(err.classification).toBe("GEMINI_RATE_LIMIT");
  });

  it("classifies 401/403 as GEMINI_AUTH_ERROR", () => {
    expect(classifyGeminiError(401, "unauthorized").classification).toBe("GEMINI_AUTH_ERROR");
    expect(classifyGeminiError(403, "forbidden").classification).toBe("GEMINI_AUTH_ERROR");
  });

  it("classifies invalid API key text as GEMINI_AUTH_ERROR", () => {
    const err = classifyGeminiError(400, "API key not valid. Please pass a valid API key.");
    expect(err.classification).toBe("GEMINI_AUTH_ERROR");
  });

  it("classifies 5xx as GEMINI_PROVIDER_ERROR", () => {
    const err = classifyGeminiError(503, "Internal server error");
    expect(err.classification).toBe("GEMINI_PROVIDER_ERROR");
    expect(err.status).toBe(503);
  });

  it("classifies 400 payload errors as GEMINI_REQUEST_ERROR", () => {
    const err = classifyGeminiError(400, "Invalid request");
    expect(err.classification).toBe("GEMINI_REQUEST_ERROR");
    expect(err.status).toBe(500);
  });

  it("does not include raw provider details in user-facing messages", () => {
    const err = classifyGeminiError(429, "Quota exceeded for quota metric 'generate_requests'");
    expect(err.userMessage).not.toContain("quota metric");
    expect(err.userMessageAr).not.toContain("quota metric");
    expect(err.logSafe).toContain("Gemini rate limit");
  });
});

describe("fetchGeminiStreamWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("retries 429 up to 3 times then returns the last failed response", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    const promise = fetchGeminiStreamWithRetry("key", "gemini-2.5-pro", {}, []);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.response.status).toBe(429);
    expect(result.errorText).toBe("rate limited");
  });

  it("returns immediately on 200 without further attempts", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchGeminiStreamWithRetry("key", "gemini-2.5-pro", {}, []);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.response.status).toBe(200);
  });

  it("does not consume the response body on success", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce(new Response("stream-body", { status: 200 }));

    const result = await fetchGeminiStreamWithRetry("key", "gemini-2.5-pro", {}, []);

    expect(result.response.status).toBe(200);
    expect(result.errorText).toBe("");
    // If the helper had consumed the body, this would throw "ReadableStream is already locked".
    const text = await result.response.text();
    expect(text).toBe("stream-body");
  });

  it("does not retry 400 errors", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce(new Response("bad request", { status: 400 }));

    const result = await fetchGeminiStreamWithRetry("key", "gemini-2.5-pro", {}, []);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.response.status).toBe(400);
  });

  it("does not retry auth errors", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const result = await fetchGeminiStreamWithRetry("key", "gemini-2.5-pro", {}, []);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.response.status).toBe(401);
  });
});

describe("fetchGeminiNonStreamingWithRetry", () => {
  it("retries transient 5xx then succeeds", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock
      .mockResolvedValueOnce(new Response("server error", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 }));

    const promise = fetchGeminiNonStreamingWithRetry("key", "gemini-2.5-pro", {}, []);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.response.status).toBe(200);
  });
});

/**
 * A2 (2026-09-03) — per-model circuit breaker.
 *
 * Each test uses maxAttempts=1 so a single mocked fetch response maps to
 * exactly one recorded breaker attempt, and no internal retry/backoff sleep
 * is ever scheduled (fake timers are only needed for the cooldown jump via
 * vi.setSystemTime). Every test uses its own model name on top of the
 * resetBreakers() in beforeEach, so tests can never interfere with each
 * other's breaker state.
 */
describe("provider circuit breaker (PROVIDER_BREAKER_ENABLED)", () => {
  beforeEach(() => {
    resetBreakers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PROVIDER_BREAKER_ENABLED;
  });

  it("flag off: fetch is called on every attempt and no breaker state is ever written", async () => {
    delete process.env.PROVIDER_BREAKER_ENABLED;
    const model = "gemini-breaker-flag-off";
    // mockImplementation (not mockResolvedValue) so every call gets a FRESH
    // Response instance — each attempt reads .text() on it, and a Response
    // body can only be read once.
    const fetchMock = vi.fn().mockImplementation(() => new Response("server error", { status: 503 }));
    global.fetch = fetchMock;

    for (let i = 0; i < 4; i++) {
      const result = await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);
      expect(result.response.status).toBe(503);
    }

    // 4 real failures would trip a 3-failure breaker if it were enabled —
    // with the flag off every one of them still had to reach fetch.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(breakerSnapshot()).toEqual({});
  });

  it("opens after 3 retryable failures within the 60s window", async () => {
    process.env.PROVIDER_BREAKER_ENABLED = "1";
    const model = "gemini-breaker-opens";
    // mockImplementation (not mockResolvedValue) so every call gets a FRESH
    // Response instance — each attempt reads .text() on it, and a Response
    // body can only be read once.
    const fetchMock = vi.fn().mockImplementation(() => new Response("server error", { status: 503 }));
    global.fetch = fetchMock;

    for (let i = 0; i < 3; i++) {
      await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);
    }

    expect(fetchMock).toHaveBeenCalledTimes(3); // all 3 real failures hit the network
    expect(breakerSnapshot()[model]).toBe("open");
  });

  it("while open, returns a synthetic 503 immediately without calling fetch", async () => {
    process.env.PROVIDER_BREAKER_ENABLED = "1";
    const model = "gemini-breaker-short-circuit";
    // mockImplementation (not mockResolvedValue) so every call gets a FRESH
    // Response instance — each attempt reads .text() on it, and a Response
    // body can only be read once.
    const fetchMock = vi.fn().mockImplementation(() => new Response("server error", { status: 503 }));
    global.fetch = fetchMock;

    for (let i = 0; i < 3; i++) {
      await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);
    }
    expect(breakerSnapshot()[model]).toBe("open");

    fetchMock.mockClear();
    const result = await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.response.status).toBe(503);
    expect(result.errorText).toBe(`breaker_open:${model}`);
  });

  it("is shared per model across the streaming and non-streaming paths", async () => {
    process.env.PROVIDER_BREAKER_ENABLED = "1";
    const model = "gemini-breaker-shared";
    // mockImplementation (not mockResolvedValue) so every call gets a FRESH
    // Response instance — each attempt reads .text() on it, and a Response
    // body can only be read once.
    const fetchMock = vi.fn().mockImplementation(() => new Response("server error", { status: 503 }));
    global.fetch = fetchMock;

    for (let i = 0; i < 3; i++) {
      await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);
    }
    fetchMock.mockClear();

    const result = await fetchGeminiStreamWithRetry("key", model, {}, [], 1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.response.status).toBe(503);
    expect(result.errorText).toBe(`breaker_open:${model}`);
  });

  it("after the cooldown, lets exactly one half-open probe through and closes on success", async () => {
    process.env.PROVIDER_BREAKER_ENABLED = "1";
    const model = "gemini-breaker-half-open-success";
    // mockImplementation (not mockResolvedValue) so every call gets a FRESH
    // Response instance — each attempt reads .text() on it, and a Response
    // body can only be read once.
    const fetchMock = vi.fn().mockImplementation(() => new Response("server error", { status: 503 }));
    global.fetch = fetchMock;

    for (let i = 0; i < 3; i++) {
      await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);
    }
    expect(breakerSnapshot()[model]).toBe("open");

    vi.setSystemTime(Date.now() + 60_000); // cooldown elapsed

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 })
    );

    const probe = await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);

    expect(fetchMock).toHaveBeenCalledTimes(1); // the probe reached the network
    expect(probe.response.status).toBe(200);
    expect(breakerSnapshot()[model]).toBe("closed");
  });

  it("a failed half-open probe re-opens the breaker for a fresh cooldown", async () => {
    process.env.PROVIDER_BREAKER_ENABLED = "1";
    const model = "gemini-breaker-half-open-failure";
    // mockImplementation (not mockResolvedValue) so every call gets a FRESH
    // Response instance — each attempt reads .text() on it, and a Response
    // body can only be read once.
    const fetchMock = vi.fn().mockImplementation(() => new Response("server error", { status: 503 }));
    global.fetch = fetchMock;

    for (let i = 0; i < 3; i++) {
      await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);
    }
    vi.setSystemTime(Date.now() + 60_000); // cooldown elapsed

    fetchMock.mockClear();
    const probe = await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);

    expect(fetchMock).toHaveBeenCalledTimes(1); // the probe reached the network and failed
    expect(probe.response.status).toBe(503);
    expect(breakerSnapshot()[model]).toBe("open");

    // The re-open starts a fresh cooldown — the very next call is blocked again.
    fetchMock.mockClear();
    const blocked = await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(blocked.errorText).toBe(`breaker_open:${model}`);
  });

  it("does not count non-retryable failures (e.g. 400) toward the threshold", async () => {
    process.env.PROVIDER_BREAKER_ENABLED = "1";
    const model = "gemini-breaker-non-retryable";
    const fetchMock = vi.fn().mockImplementation(() => new Response("bad request", { status: 400 }));
    global.fetch = fetchMock;

    for (let i = 0; i < 5; i++) {
      const result = await fetchGeminiNonStreamingWithRetry("key", model, {}, [], 1);
      expect(result.response.status).toBe(400);
    }

    expect(fetchMock).toHaveBeenCalledTimes(5); // never short-circuited
    expect(breakerSnapshot()[model]).toBeUndefined(); // never recorded as a failure
  });
});

describe("fetchAvailableGeminiModels", () => {
  it("returns default candidates when list endpoint fails", async () => {
    resetGeminiResilienceCache();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    global.fetch = fetchMock;

    const models = await fetchAvailableGeminiModels("bad-key");
    expect(models).toEqual(GEMINI_MODEL_CANDIDATES);
  });

  it("parses available models from the API response", async () => {
    resetGeminiResilienceCache();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            { name: "models/gemini-2.5-pro" },
            { name: "models/gemini-2.5-flash" },
          ],
        }),
        { status: 200 }
      )
    );
    global.fetch = fetchMock;

    const models = await fetchAvailableGeminiModels("key");
    expect(models).toContain("gemini-2.5-pro");
    expect(models).toContain("gemini-2.5-flash");
  });
});

describe("quota rollback", () => {
  it("records a mode increment and rolls it back on provider failure", async () => {
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const adminClient = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: null, error: null };
      },
    };

    recordQuotaIncrement("mode", "user-1", "standard");
    await rollbackQuotaIfNeeded(adminClient);

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("decrement_mode_daily_count");
    expect(rpcCalls[0].args).toEqual({ p_user_id: "user-1", p_mode: "standard" });
  });

  it("records a daily increment and rolls it back on provider failure", async () => {
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const adminClient = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: null, error: null };
      },
    };

    recordQuotaIncrement("daily", "user-2");
    await rollbackQuotaIfNeeded(adminClient);

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("decrement_daily_usage");
    expect(rpcCalls[0].args).toEqual({ p_user_id: "user-2" });
  });

  it("does nothing when no increment was recorded", async () => {
    clearQuotaIncrement();
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const adminClient = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: null, error: null };
      },
    };

    await rollbackQuotaIfNeeded(adminClient);
    expect(rpcCalls).toHaveLength(0);
  });

  it("clears pending increment after success path", () => {
    recordQuotaIncrement("daily", "user-3");
    clearQuotaIncrement();

    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const adminClient = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: null, error: null };
      },
    };

    rollbackQuotaIfNeeded(adminClient);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("error classification integration", () => {
  it("produces the correct frontend-facing payload for a Gemini 429", () => {
    const classified = classifyGeminiError(429, "");
    expect(classified.status).toBe(503);
    expect(classified.classification).toBe("GEMINI_RATE_LIMIT");
    expect(classified.userMessage).toBe(
      "AI provider is temporarily busy. Please try again in a minute."
    );
    expect(classified.userMessageAr).toBe(
      "الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة."
    );
  });
});

/**
 * A7 (2026-08-23) — code-vs-migrations RPC contract.
 *
 * `rollbackQuotaIfNeeded` shipped calling `decrement_daily_usage`, a function
 * that existed in NO migration and NOT in production. PostgREST 404'd, the
 * catch swallowed it, and the flat daily counter (Main/`primary` mode and
 * trialing users) silently never rolled back on a provider failure.
 *
 * The mock-based tests above could never catch that: they assert the RPC is
 * CALLED with the right arguments, which was always true. What was false was
 * that the function existed at the other end. This test closes that gap by
 * checking the call sites against the migrations that create them.
 */
describe("quota RPC contract - code vs migrations", () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

  it("every RPC rollbackQuotaIfNeeded calls is created by a migration", () => {
    const src = readFileSync(
      `${repoRoot}supabase/functions/fire-safety-chat/geminiResilience.ts`,
      "utf8",
    );
    const called = [...src.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);

    // Guard the guard: if the call sites are ever renamed, this test must fail
    // loudly rather than silently verifying an empty list.
    expect(called).toContain("decrement_daily_usage");
    expect(called).toContain("decrement_mode_daily_count");

    const migDir = `${repoRoot}supabase/migrations`;
    const allSql = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(`${migDir}/${f}`, "utf8"))
      .join("\n");

    for (const name of [...new Set(called)]) {
      const isCreated = new RegExp(
        String.raw`CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.${name}\s*\(`,
        "i",
      ).test(allSql);
      expect(
        isCreated,
        `RPC "${name}" is called by geminiResilience.ts but no migration under ` +
          `supabase/migrations/ creates public.${name}. At runtime PostgREST ` +
          `returns 404/PGRST202 and the catch in rollbackQuotaIfNeeded swallows ` +
          `it, so the quota unit is never returned to the user.`,
      ).toBe(true);
    }
  });
});
