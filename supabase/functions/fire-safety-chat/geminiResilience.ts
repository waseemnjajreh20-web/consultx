/**
 * Gemini resilience helpers for fire-safety-chat.
 *
 * Pure logic (Deno.env is read defensively behind `typeof Deno !==
 * "undefined"`, never required at import time) so it can be unit-tested and
 * imported safely by the Edge Function.
 */
import {
  buildRequestWithCache,
  forgetContextCache,
  recordContextCacheFallback,
  shouldRetryWithoutCache,
  type ContextCacheRef,
} from "./geminiContextCache.ts";

export type AIErrorClass =
  | "CONSULTX_DAILY_LIMIT"
  | "GEMINI_PROJECT_BLOCKED"
  | "GEMINI_RATE_LIMIT"
  | "GEMINI_AUTH_ERROR"
  | "GEMINI_REQUEST_ERROR"
  | "GEMINI_PROVIDER_ERROR"
  | "UNKNOWN_AI_ERROR";

export interface ClassifiedAIError {
  classification: AIErrorClass;
  status: number;
  userMessage: string;
  userMessageAr: string;
  logSafe: string;
}

export interface GeminiAttemptResult {
  response: Response;
  errorText: string;
}

export interface QuotaIncrement {
  kind: "mode" | "daily";
  userId: string;
  mode?: string;
}

// 2026-08-31 key-rotation incident (root cause + web-confirmed):
// Google's ListModels CATALOG still lists gemini-2.5-*/2.0-* for a key on a
// NEW project, but generateContent/streamGenerateContent refuse them with 404
// "no longer available to new users" (2.5 sunsets fully 2026-10-16; per
// ai.google.dev/gemini-api/docs/changelog the 3.x line is GA for new
// projects). buildModelChain trusts the catalog, so it built an all-dead chain
// and every chat 500'd -> UI "Connection error".
//
// Fix: lead with the current-GA models so BOTH key types succeed on the first
// call (no wasted round-trips), old models kept as fallback for keys still
// grandfathered onto 2.5. buildModelChain only ever adds a model that the
// key's own catalog lists, so a key without 3.x access simply falls through
// to whatever it does list. All entries here were verified to stream with
// fire-safety-chat's exact request shape via ingest-sbc-2024 {action:gentest}
// on 2026-08-31 (3.6-flash, 3.1-pro-preview: OK; the *-latest aliases track
// Google's newest and self-heal across future sunsets).
// Order = fallback priority. GA flash models lead — measured live 2026-08-31
// (ingest-sbc-2024 {action:bigstream}) against advisory-sized 120k-char
// prompts: gemini-3.7-flash first byte in ~3-6s over 5/5 rapid calls;
// gemini-3.6-flash similar; gemini-3.1-pro-preview took 15-24s AND returned
// an intermittent 502 — a PREVIEW thinking model too slow/unstable for the
// advisory path's large context, which is what produced the UI "Connection
// error" in advisory mode while primary (flash) stayed fine. Preview/pro
// models are kept only as later fallbacks. `*-latest` aliases self-heal
// across future sunsets. 2.5/2.0 remain for keys grandfathered onto them.
export const GEMINI_MODEL_CANDIDATES = [
  "gemini-3.7-flash",        // GA, fastest measured — default for advisory/analytical
  "gemini-3.6-flash",        // GA, fast — default for primary
  "gemini-flash-latest",     // self-healing alias (newest flash)
  "gemini-pro-latest",       // self-healing alias (newest pro)
  "gemini-3.1-pro-preview",  // preview pro — slow, last-resort only
  "gemini-2.5-pro",          // fallback: keys grandfathered onto 2.5
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const MODELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let availableModelsCache: string[] | null = null;
let availableModelsCacheTime = 0;

export function resetGeminiResilienceCache(): void {
  availableModelsCache = null;
  availableModelsCacheTime = 0;
}

export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  if (availableModelsCache && Date.now() - availableModelsCacheTime < MODELS_CACHE_TTL_MS) {
    return availableModelsCache;
  }
  const tFetch = Date.now();
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1000`
    );
    if (!resp.ok) {
      console.log(`[Gemini] list models failed: ${resp.status}, using default candidates`);
      return GEMINI_MODEL_CANDIDATES;
    }
    const data = await resp.json();
    const names: string[] = (data.models || [])
      .map((m: any) => typeof m.name === "string" ? m.name.replace("models/", "") : "")
      .filter((n: string) => n.startsWith("gemini-"));
    availableModelsCache = names.length > 0 ? names : GEMINI_MODEL_CANDIDATES;
    availableModelsCacheTime = Date.now();
    console.log(`[Gemini] available models (cache MISS, ${Date.now() - tFetch}ms): ${availableModelsCache.join(", ")}`);
    return availableModelsCache;
  } catch (e) {
    console.log(`[Gemini] list models error: ${e instanceof Error ? e.message : String(e)}`);
    return GEMINI_MODEL_CANDIDATES;
  }
}

export function buildModelChain(
  preferred: string,
  fallback: string,
  available: string[]
): string[] {
  const chain = new Set<string>();
  if (available.includes(preferred)) chain.add(preferred);
  if (available.includes(fallback) && fallback !== preferred) chain.add(fallback);
  for (const m of GEMINI_MODEL_CANDIDATES) {
    if (available.includes(m) && !chain.has(m)) chain.add(m);
  }
  // If none of the preferred candidates are available, trust the API list and
  // append the newest gemini model that is available as a last resort.
  if (chain.size === 0) {
    const newestAvailable = available
      .filter((m) => m.startsWith("gemini-"))
      .sort()
      .pop();
    if (newestAvailable) chain.add(newestAvailable);
  }
  return Array.from(chain);
}

export function classifyGeminiError(status: number, errorBody: string): ClassifiedAIError {
  const bodyLower = errorBody.toLowerCase();
  const isRateLimit =
    status === 429 ||
    bodyLower.includes("rate limit") ||
    bodyLower.includes("quota") ||
    bodyLower.includes("resource has been exhausted") ||
    bodyLower.includes("too many requests");

  if (isRateLimit) {
    return {
      classification: "GEMINI_RATE_LIMIT",
      status: 503,
      userMessage: "AI provider is temporarily busy. Please try again in a minute.",
      userMessageAr:
        "الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.",
      logSafe: `Gemini rate limit (HTTP ${status})`,
    };
  }

  // Project-level denial, distinct from a bad key (2026-09-03 incident): the
  // key is valid and ListModels still answers, but generateContent AND
  // embedContent return 403 PERMISSION_DENIED "Your project has been denied
  // access. Please contact support." Nothing the user or a retry can fix, and
  // nothing about THEIR request is wrong — so the message says so plainly
  // instead of the generic "service error", which is what made this outage
  // look like a code defect for the first several minutes of diagnosis.
  if (
    status === 403 &&
    (bodyLower.includes("denied access") || bodyLower.includes("permission_denied"))
  ) {
    return {
      classification: "GEMINI_PROJECT_BLOCKED",
      status: 503,
      userMessage:
        "The AI provider has suspended access for this platform's account. This is not a problem with your question — the team has been alerted and is restoring service.",
      userMessageAr:
        "أوقف مزوّد الذكاء الاصطناعي الوصول لحساب المنصة مؤقتاً. المشكلة ليست في سؤالك — تم إبلاغ الفريق والعمل جارٍ على استعادة الخدمة.",
      logSafe: "Gemini project access denied (HTTP 403 PERMISSION_DENIED) — owner action: billing/policy on the API project",
    };
  }

  if (status === 401 || status === 403 || bodyLower.includes("api key not valid")) {
    return {
      classification: "GEMINI_AUTH_ERROR",
      status: 500,
      userMessage: "Service error occurred",
      userMessageAr: "حدث خطأ في الخدمة",
      logSafe: `Gemini auth error (HTTP ${status})`,
    };
  }

  if (status >= 500 || status === 408 || status === 0) {
    return {
      classification: "GEMINI_PROVIDER_ERROR",
      status: 503,
      userMessage: "AI provider is temporarily unavailable. Please try again in a moment.",
      userMessageAr:
        "مزود الذكاء الاصطناعي غير متاح مؤقتًا. يرجى المحاولة بعد قليل.",
      logSafe: `Gemini provider error (HTTP ${status})`,
    };
  }

  return {
    classification: "GEMINI_REQUEST_ERROR",
    status: 500,
    userMessage: "Service error occurred",
    userMessageAr: "حدث خطأ في الخدمة",
    logSafe: `Gemini request error (HTTP ${status})`,
  };
}

/**
 * Classify a WHOLE exhausted model chain, not just its last attempt.
 *
 * Why: buildModelChain ends on the oldest fallbacks, and those answer 404
 * "no longer available to new users" for a key on a new project. So when the
 * real cause hits every model — an account block, a rate limit — the LAST
 * error is a 404 about a model nobody cares about, and the user (and the
 * on-call reader of the logs) is told "service error". Measured during the
 * 2026-09-03 outage: every model returned 403 PERMISSION_DENIED, the reported
 * class was GEMINI_REQUEST_ERROR, and that mismatch cost real diagnosis time.
 *
 * Precedence is by how much the failure explains: an account block explains
 * everything after it; a rate limit explains a burst; a 5xx explains a bad
 * minute; a missing model explains only itself. Ties keep the earliest
 * attempt, which is the model the request actually wanted.
 */
export function classifyGeminiChainFailure(
  attempts: Array<{ status: number; errorText: string }>,
): ClassifiedAIError {
  if (attempts.length === 0) return classifyGeminiError(0, "");
  const rank = (c: AIErrorClass): number => {
    switch (c) {
      case "GEMINI_PROJECT_BLOCKED": return 5;
      case "GEMINI_RATE_LIMIT": return 4;
      case "GEMINI_AUTH_ERROR": return 3;
      case "GEMINI_PROVIDER_ERROR": return 2;
      default: return 1;
    }
  };
  let best = classifyGeminiError(attempts[0].status, attempts[0].errorText);
  for (const a of attempts.slice(1)) {
    const c = classifyGeminiError(a.status, a.errorText);
    if (rank(c.classification) > rank(best.classification)) best = c;
  }
  return best;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500 || status === 408 || status === 0;
}

// ── Thinking-effort control (2026-09-02 speed wave) ─────────────────────────
// Gemini 3.x models think by default with no cap, which delays the FIRST
// streamed byte by many seconds even for trivial prompts. Latency-sensitive
// callers (primary mode) request minimal thinking. The accepted field shape
// varies across model generations (2.5: thinkingBudget int; 3.x: thinkingLevel
// enum), so candidates are tried in order and the first shape the API accepts
// is remembered PER MODEL for the isolate's lifetime; a 400 naming the
// thinking field moves to the next candidate without consuming a retry
// attempt, and if every shape is rejected the model runs with its default
// thinking — degraded latency, never an outage.
//
// 2026-09-03: widened from minimal/default to the full ladder, so the heavy
// modes can be measured at intermediate levels instead of only "capped" vs
// "uncapped" (the D2 session-6 item of the wave plan). "default" still means
// "send no thinkingConfig at all", which keeps the request byte-identical to
// what a mode sent before any of this existed.
export type ThinkingEffort = "minimal" | "low" | "medium" | "high" | "default";

// Per level, the shapes to try in order. Two generations of the API disagree:
// 3.x takes a thinkingLevel enum, 2.5 takes an integer thinkingBudget. The
// budgets are the documented-order-of-magnitude equivalents of the enum, not
// tuned values — whichever shape the model accepts first is the one used.
const THINKING_CANDIDATES: Record<Exclude<ThinkingEffort, "default">, Array<Record<string, unknown>>> = {
  minimal: [{ thinkingLevel: "minimal" }, { thinkingBudget: 0 }],
  low: [{ thinkingLevel: "low" }, { thinkingBudget: 512 }],
  medium: [{ thinkingLevel: "medium" }, { thinkingBudget: 2048 }],
  high: [{ thinkingLevel: "high" }, { thinkingBudget: 8192 }],
};

/** Keyed by model AND effort: a model that accepts thinkingLevel:"minimal" tells us nothing about whether it accepts "medium". */
const acceptedThinkingShape = new Map<string, Record<string, unknown> | null>();
const shapeKey = (model: string, effort: ThinkingEffort) => `${model}::${effort}`;

/**
 * Reads a per-mode thinking level from the environment, e.g.
 * THINKING_EFFORT_STANDARD=low. Anything unrecognised — a typo, an empty
 * string, a level this build does not know — falls back to `fallback` rather
 * than silently selecting a different level, the same discipline every
 * ADVISORY_* flag in this codebase follows.
 */
export function resolveThinkingEffort(
  env: (key: string) => string | undefined,
  key: string,
  fallback: ThinkingEffort,
): ThinkingEffort {
  const raw = (env(key) ?? "").trim().toLowerCase();
  return raw === "minimal" || raw === "low" || raw === "medium" || raw === "high" || raw === "default"
    ? (raw as ThinkingEffort)
    : fallback;
}

function buildGenerationConfig(thinkingConfig: Record<string, unknown> | null): Record<string, unknown> {
  // With no thinking override the config stays byte-identical to the
  // pre-wave shape — standard/analysis requests are unchanged.
  return thinkingConfig ? { temperature: 0.7, thinkingConfig } : { temperature: 0.7 };
}

// ── Per-model circuit breaker (A2, 2026-09-03) ──────────────────────────────
// Protects a dead/hammered model from being retried forever across requests
// sharing this isolate: 3 retryable failures (429/5xx/408/0, or a fetch
// exception) within a rolling 60s window trip the breaker for that model.
// While open, fetchGeminiStreamWithRetry / fetchGeminiNonStreamingWithRetry
// return a synthetic 503 immediately without calling fetch, so the caller's
// buildModelChain loop advances to the next model with no network round-trip
// and no retry/backoff delay. After a 60s cooldown exactly one probe request
// is let through (half-open); it closes the breaker on success or re-opens it
// (fresh cooldown) on a retryable failure. Non-retryable failures (400
// thinking-shape discovery, 404 model missing, etc.) never count.
//
// Flag-gated by PROVIDER_BREAKER_ENABLED (exact "1"). Off (default): no
// breaker state is read or written anywhere in this file — behavior is
// byte-identical to before this change.
//
// Module-level, isolate-lifetime state — same lifetime/shape as
// acceptedThinkingShape above, no per-request state.
export type CircuitBreakerState = "closed" | "open" | "half_open";

interface ModelBreaker {
  failures: number[]; // ms timestamps of retryable failures, pruned to the window
  state: CircuitBreakerState;
  openedAt: number | null;
}

const BREAKER_FAILURE_THRESHOLD = 3;
const BREAKER_WINDOW_MS = 60_000;
const BREAKER_COOLDOWN_MS = 60_000;

const breakers = new Map<string, ModelBreaker>();

function isProviderBreakerEnabled(): boolean {
  // Reached through globalThis so the app tsconfig (which type-checks this
  // module via the vitest imports) never sees a bare `Deno` identifier.
  const deno = (globalThis as any).Deno;
  if (deno?.env?.get) {
    return deno.env.get("PROVIDER_BREAKER_ENABLED") === "1";
  }
  // Non-Deno import (vitest/Node): read via globalThis so this module stays
  // importable with no Deno global at all, per this file's header contract.
  const proc = (globalThis as any).process;
  return !!proc?.env && proc.env.PROVIDER_BREAKER_ENABLED === "1";
}

/** Test-only: clear all breaker state between tests. */
export function resetBreakers(): void {
  breakers.clear();
}

/** Current state of every model that has ever recorded activity — for logging. */
export function breakerSnapshot(): Record<string, CircuitBreakerState> {
  const snap: Record<string, CircuitBreakerState> = {};
  for (const [model, b] of breakers.entries()) snap[model] = b.state;
  return snap;
}

function getBreaker(model: string): ModelBreaker {
  let b = breakers.get(model);
  if (!b) {
    b = { failures: [], state: "closed", openedAt: null };
    breakers.set(model, b);
  }
  return b;
}

function logBreakerTransition(
  model: string,
  from: CircuitBreakerState,
  to: CircuitBreakerState,
  failureCount: number
): void {
  console.log(`[Breaker] model=${model} ${from}→${to} (${failureCount} failures/60s)`);
}

/** Null = allowed through. Non-null = short-circuit with this synthetic result. */
function breakerGate(model: string): GeminiAttemptResult | null {
  const b = breakers.get(model);
  if (!b || b.state === "closed") return null;

  if (b.state === "open") {
    if (b.openedAt !== null && Date.now() - b.openedAt >= BREAKER_COOLDOWN_MS) {
      logBreakerTransition(model, "open", "half_open", b.failures.length);
      b.state = "half_open";
      return null; // this call is the one allowed probe
    }
    return { response: new Response(null, { status: 503 }), errorText: `breaker_open:${model}` };
  }

  // half_open: a probe is already in flight — block concurrent callers so
  // only one probe reaches the provider at a time.
  return { response: new Response(null, { status: 503 }), errorText: `breaker_open:${model}` };
}

function recordBreakerFailure(model: string): void {
  const b = getBreaker(model);
  const now = Date.now();
  b.failures.push(now);
  b.failures = b.failures.filter((t) => now - t < BREAKER_WINDOW_MS);

  if (b.state === "half_open") {
    // The one allowed probe failed — re-open for another cooldown.
    logBreakerTransition(model, "half_open", "open", b.failures.length);
    b.state = "open";
    b.openedAt = now;
    return;
  }

  if (b.state === "closed" && b.failures.length >= BREAKER_FAILURE_THRESHOLD) {
    logBreakerTransition(model, "closed", "open", b.failures.length);
    b.state = "open";
    b.openedAt = now;
  }
}

function recordBreakerSuccess(model: string): void {
  const b = breakers.get(model);
  // Only a half-open probe's success closes the breaker. A closed-state
  // success intentionally leaves the sliding failure window alone — "3
  // failures within 60s" must still trip the breaker even if a success lands
  // in between failures.
  if (!b || b.state !== "half_open") return;
  logBreakerTransition(model, "half_open", "closed", b.failures.length);
  b.state = "closed";
  b.failures = [];
  b.openedAt = null;
}

// ── Context-cache binding (D2, 2026-09-03) ──────────────────────────────────
// What index.ts hands down when GEMINI_CONTEXT_CACHE_ENABLED is on AND
// ensureContextCache() actually returned a reference. `mode` travels with the
// ref only because forgetContextCache(model, mode) needs it — this module
// never reads the mode for anything else.
//
// null / omitted (the default, and ALWAYS the case with the flag off) means
// every line below that touches the cache is dead: the request body is built
// from the same object literal, in the same property order, as before this
// change, so JSON.stringify produces byte-identical bytes.
export interface GeminiCacheBinding {
  ref: ContextCacheRef;
  mode: string;
}

export async function fetchGeminiStreamWithRetry(
  apiKey: string,
  model: string,
  systemInstruction: any,
  contents: any[],
  maxAttempts = 3,
  thinkingEffort: ThinkingEffort = "default",
  cacheRef: GeminiCacheBinding | null = null
): Promise<GeminiAttemptResult> {
  if (isProviderBreakerEnabled()) {
    const blocked = breakerGate(model);
    if (blocked) return blocked;
  }

  const delays = [1000, 2000, 4000];
  let lastErrorText = "";
  let shapeIdx = 0;
  let storedShape = acceptedThinkingShape.get(shapeKey(model, thinkingEffort));
  // Dropped to null (once) the first time a cachedContent-bearing attempt
  // fails in a cache-shaped way — see the fallback branch below.
  let activeCache: GeminiCacheBinding | null = cacheRef;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const thinkingConfig: Record<string, unknown> | null =
      thinkingEffort === "default"
        ? null
        : storedShape !== undefined
          ? storedShape
          : THINKING_CANDIDATES[thinkingEffort][shapeIdx] ?? null;
    const start = Date.now();
    // Built exactly as it was before context caching existed — same three
    // properties, same insertion order — so with activeCache null the
    // JSON.stringify below is byte-for-byte what HEAD sent.
    const baseBody = {
      systemInstruction,
      contents,
      generationConfig: buildGenerationConfig(thinkingConfig),
    };
    const requestBody = activeCache
      ? buildRequestWithCache(baseBody, activeCache.ref)
      : baseBody;
    let resp: Response;
    try {
      resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );
    } catch (fetchErr) {
      if (isProviderBreakerEnabled()) recordBreakerFailure(model);
      throw fetchErr;
    }
    const latency = Date.now() - start;

    if (resp.ok) {
      if (isProviderBreakerEnabled()) recordBreakerSuccess(model);
      if (thinkingEffort !== "default" && storedShape === undefined) {
        acceptedThinkingShape.set(shapeKey(model, thinkingEffort), thinkingConfig);
        storedShape = thinkingConfig;
        console.log(`[Gemini] ${model} accepted thinking shape for ${thinkingEffort}: ${JSON.stringify(thinkingConfig)}`);
      }
      console.log(
        `[Gemini] ${model} stream OK on attempt ${attempt}/${maxAttempts} (${latency}ms)`
      );
      return { response: resp, errorText: "" };
    }

    const errorText = await resp.text();

    // Thinking-shape discovery: a 400 that names the thinking field means THIS
    // shape is unsupported, not that the request is bad — advance to the next
    // candidate (or give up on thinking control) without consuming an attempt.
    if (
      resp.status === 400 &&
      thinkingEffort !== "default" &&
      storedShape === undefined &&
      thinkingConfig !== null &&
      /thinking/i.test(errorText)
    ) {
      shapeIdx++;
      if (shapeIdx >= THINKING_CANDIDATES[thinkingEffort].length) {
        acceptedThinkingShape.set(shapeKey(model, thinkingEffort), null);
        storedShape = null;
        console.log(`[Gemini] ${model} rejected every ${thinkingEffort} thinking shape — running with model-default thinking`);
      } else {
        console.log(`[Gemini] ${model} rejected ${thinkingEffort} thinking shape ${shapeIdx}/${THINKING_CANDIDATES[thinkingEffort].length}, trying next`);
      }
      attempt--;
      continue;
    }

    // ── Context-cache fallback (D2): retry ONCE without the cache ────────────
    // Only reachable when THIS attempt actually carried a cachedContent
    // reference and the failure is cache-shaped (a 404 on the cache resource,
    // or a 400 that names it) per shouldRetryWithoutCache. Anything else —
    // 429, 401, 5xx, a plain bad-request 400 — would fail identically with or
    // without the cache and falls through to the unchanged logic below.
    //
    // Like the thinking-shape branch above, this does NOT consume an attempt
    // and records no breaker failure: the provider is not the thing that
    // failed, our stale reference is. Dropping activeCache to null makes this
    // branch unreachable for the rest of the call, so it can fire at most once.
    if (activeCache && shouldRetryWithoutCache(resp.status, errorText)) {
      const failedMode = activeCache.mode;
      activeCache = null;
      forgetContextCache(model, failedMode);
      recordContextCacheFallback();
      console.log(
        `[ContextCache] mode=${failedMode} fallback model=${model} HTTP ${resp.status} — retrying this attempt without the cache`
      );
      attempt--;
      continue;
    }

    lastErrorText = errorText;
    const retryable = isRetryableStatus(resp.status);
    console.log(
      `[Gemini] ${model} attempt ${attempt}/${maxAttempts} status=${resp.status} latency=${latency}ms retryable=${retryable}`
    );
    if (isProviderBreakerEnabled() && retryable) recordBreakerFailure(model);

    if (!retryable || attempt === maxAttempts) {
      return { response: resp, errorText };
    }

    const delay = delays[attempt - 1] ?? 4000;
    console.log(`[Gemini] ${model} retrying in ${delay}ms...`);
    await sleep(delay);
  }

  // Should never reach here, but keeps TypeScript happy.
  return {
    response: new Response(lastErrorText, { status: 500 }),
    errorText: lastErrorText,
  };
}

export async function fetchGeminiNonStreamingWithRetry(
  apiKey: string,
  model: string,
  systemInstruction: any,
  contents: any[],
  maxAttempts = 3
): Promise<GeminiAttemptResult> {
  if (isProviderBreakerEnabled()) {
    const blocked = breakerGate(model);
    if (blocked) return blocked;
  }

  const delays = [1000, 2000, 4000];
  let lastErrorText = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    let resp: Response;
    try {
      resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction,
            contents,
            generationConfig: { temperature: 0.7 },
          }),
        }
      );
    } catch (fetchErr) {
      if (isProviderBreakerEnabled()) recordBreakerFailure(model);
      throw fetchErr;
    }
    const latency = Date.now() - start;

    if (resp.ok) {
      if (isProviderBreakerEnabled()) recordBreakerSuccess(model);
      console.log(
        `[Gemini] ${model} non-stream OK on attempt ${attempt}/${maxAttempts} (${latency}ms)`
      );
      return { response: resp, errorText: "" };
    }

    const errorText = await resp.text();
    lastErrorText = errorText;
    const retryable = isRetryableStatus(resp.status);
    console.log(
      `[Gemini] ${model} non-stream attempt ${attempt}/${maxAttempts} status=${resp.status} latency=${latency}ms retryable=${retryable}`
    );
    if (isProviderBreakerEnabled() && retryable) recordBreakerFailure(model);

    if (!retryable || attempt === maxAttempts) {
      return { response: resp, errorText };
    }

    const delay = delays[attempt - 1] ?? 4000;
    console.log(`[Gemini] ${model} non-stream retrying in ${delay}ms...`);
    await sleep(delay);
  }

  return {
    response: new Response(lastErrorText, { status: 500 }),
    errorText: lastErrorText,
  };
}

/**
 * Quota rollback helpers.
 *
 * The Edge Function increments usage counters before calling the AI provider.
 * If the provider fails with a retryable/provider error, we roll the increment
 * back so the user is not charged for a message that was never answered.
 */
let pendingQuotaIncrement: QuotaIncrement | null = null;

export function recordQuotaIncrement(kind: "mode" | "daily", userId: string, mode?: string): void {
  pendingQuotaIncrement = { kind, userId, mode };
}

export function clearQuotaIncrement(): void {
  pendingQuotaIncrement = null;
}

export async function rollbackQuotaIfNeeded(adminClient: any): Promise<void> {
  if (!pendingQuotaIncrement) return;
  const { kind, userId, mode } = pendingQuotaIncrement;
  try {
    if (kind === "mode" && mode) {
      await adminClient.rpc("decrement_mode_daily_count", {
        p_user_id: userId,
        p_mode: mode,
      });
    } else {
      await adminClient.rpc("decrement_daily_usage", { p_user_id: userId });
    }
    console.log(`[Quota] Rolled back ${kind} increment for user ${userId}`);
  } catch (e) {
    console.error(
      `[Quota] Rollback failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  pendingQuotaIncrement = null;
}
