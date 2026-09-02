/**
 * Gemini context caching for fire-safety-chat's static per-mode system
 * contract (D2a, 2026-09-03).
 *
 * Pure logic (fetch/crypto/console only — no Deno-specific APIs) so it can be
 * unit-tested from vitest and imported safely by the Edge Function. Same
 * pattern as ./geminiResilience.ts, ./retrievalPolicy.ts and
 * ./promptContract.ts.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CACHES
 * ---------------------------------------------------------------------------
 * Every request's system prompt is assembled from THREE layers (see
 * index.ts, `fullSystemPrompt` / `systemMessages`):
 *   1. a large STATIC per-mode contract — getPrimaryPrompt() /
 *      getStandardPrompt() / getAnalysisPrompt() in ./promptContract.ts.
 *      Deterministic for a given (mode, language, enabledNewSourceCodes()):
 *      identical bytes on every request until the owner ships a prompt edit
 *      or flips a source-code flag.
 *   2. DYNAMIC per-request additions appended after it — retrieved SBC
 *      context, structured tables, machine-extracted query facts, the
 *      external-refs block, the audience layer, doc-upload text, etc.
 *   3. a separate DYNAMIC system message for user-memory personalisation,
 *      and (on retry) the validation prompt.
 *
 * Only layer 1 is safe to cache: it is the only layer that does not vary per
 * request. This module caches exactly that layer via the Gemini v1beta
 * `cachedContents` REST resource and exposes helpers to reshape a request
 * body to reference the cache instead of resending the static text.
 *
 * ---------------------------------------------------------------------------
 * FAIL-OPEN, EVERYWHERE
 * ---------------------------------------------------------------------------
 * A context-cache problem must never fail a chat request. Every function
 * here either returns a typed "no cache" value (null / false / the input
 * unchanged) or is pure and cannot throw. `ensureContextCache` wraps its
 * entire body in try/catch for exactly this reason: a network blip, a
 * malformed response, or a hashing failure degrades to "send the full prompt
 * like today", never to a failed request.
 *
 * ---------------------------------------------------------------------------
 * API-SHAPE CERTAINTY (CLAUDE.md labelling discipline)
 * ---------------------------------------------------------------------------
 * No live Gemini API key was available while building this module (repo
 * rule: never call the Gemini API with a real key from a builder sub-agent).
 * Every claim about the exact `cachedContents` request/response shape below
 * is labelled inline. Nothing here has been exercised against the live API —
 * see docs/launch/context-cache-notes.md for the gating plan that verifies
 * these HYPOTHESIS items with the production probe before the flag ships on.
 *
 * ---------------------------------------------------------------------------
 * UNWIRED
 * ---------------------------------------------------------------------------
 * This module is not imported by index.ts or geminiResilience.ts yet — see
 * this task's report for the exact wiring a follow-up change should make.
 */

// ===========================================================================
// 1. FLAG
// ===========================================================================

export type EnvReader = (key: string) => string | undefined;

export const GEMINI_CONTEXT_CACHE_FLAG_ENV = "GEMINI_CONTEXT_CACHE_ENABLED";

/** True only for the exact string "1". Everything else — unset, "0", "true",
 * a typo — is OFF, matching every other flag in this function (see
 * retrievalPolicy.ts, visionManifest.ts). */
export function isContextCacheEnabled(env: EnvReader): boolean {
  return env(GEMINI_CONTEXT_CACHE_FLAG_ENV) === "1";
}

// ===========================================================================
// 2. TYPES
// ===========================================================================

/**
 * What `ensureContextCache` hands back on success. Carries `staticPrefixText`
 * alongside the wire-level `cachedContent` name (NOT sent to Gemini itself —
 * see buildRequestWithCache) so the caller does not have to thread the exact
 * static prompt string through a second time to know what to strip back out
 * of its own systemInstruction.
 */
export interface ContextCacheRef {
  /** e.g. "cachedContents/abcd1234" — the resource name Gemini returned. */
  cachedContent: string;
  /** The exact static prefix text this cache entry was built from. */
  staticPrefixText: string;
}

export interface ContextCacheStats {
  /** New cachedContents objects created via the Gemini API. */
  creates: number;
  /** Existing, unexpired cache entries reused without a create call. */
  hits: number;
  /** Times a caller retried a request without the cache after a cache-shaped failure — see recordContextCacheFallback. */
  fallbacks: number;
}

export interface GeminiSystemInstruction {
  parts: Array<{ text: string }>;
}

/** The request body shape fetchGeminiStreamWithRetry builds today (see
 * geminiResilience.ts) — systemInstruction carries ALL system text (static +
 * dynamic, joined). This is the "before" shape buildRequestWithCache takes. */
export interface GeminiRequestBody {
  systemInstruction?: GeminiSystemInstruction;
  contents: any[];
  generationConfig?: Record<string, unknown>;
}

/** The "after" shape: cachedContent replaces systemInstruction. See
 * buildRequestWithCache's header comment for why systemInstruction cannot
 * simply be trimmed and sent alongside cachedContent. */
export interface GeminiCachedRequestBody {
  cachedContent: string;
  contents: any[];
  generationConfig?: Record<string, unknown>;
}

// ===========================================================================
// 3. MODULE STATE
// ===========================================================================
// Registry keyed by "{model}::{mode}::{sha256(staticPrefixText)}" so a prefix
// edit (a prompt change, or enabledNewSourceCodes() flipping) is automatically
// a different key rather than something this module has to detect and
// invalidate by hand. currentKeyForTarget tracks the latest full key seen for
// a given "{model}::{mode}" so a superseded entry (expired, or replaced by a
// new prefix hash) can be evicted instead of accumulating forever in a
// long-lived isolate.

interface CacheEntry {
  cacheName: string;
  expiresAt: number; // epoch ms
}

const cacheRegistry = new Map<string, CacheEntry>();
const currentKeyForTarget = new Map<string, string>();
const skipUntil = new Map<string, number>(); // full key -> epoch ms

const SKIP_TOO_SHORT_MS = 10 * 60 * 1000; // 10 minutes, per task spec

/** 1 hour. The launch plan (docs/launch/next-wave-plan-20260903.html, D2
 * session 5) sizes the TTL in hours, weighed against storage cost — see
 * docs/launch/context-cache-notes.md. */
export const DEFAULT_CONTEXT_CACHE_TTL_SECONDS = 3600;

let stats: ContextCacheStats = { creates: 0, hits: 0, fallbacks: 0 };

/** Test-only reset (mirrors resetGeminiResilienceCache in
 * geminiResilience.ts) — clears the registry, skip memory and stats so tests
 * do not leak state into each other. Also safe to call in production code if
 * an isolate ever needs to force a clean slate; nothing here depends on it
 * being called. */
export function resetContextCacheState(): void {
  cacheRegistry.clear();
  currentKeyForTarget.clear();
  skipUntil.clear();
  stats = { creates: 0, hits: 0, fallbacks: 0 };
}

export function contextCacheStats(): ContextCacheStats {
  return { ...stats };
}

/** The wiring (geminiResilience.ts / index.ts, not this module) owns the
 * decision to actually retry without cache — this module only offers the
 * classifier (shouldRetryWithoutCache) it should decide with. Call this once
 * the wiring has made that retry, so contextCacheStats().fallbacks is a real
 * count rather than something the caller has to track separately. */
export function recordContextCacheFallback(): void {
  stats.fallbacks++;
}

// ===========================================================================
// 4. HASHING
// ===========================================================================

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ===========================================================================
// 5. CREATE / REUSE
// ===========================================================================

/**
 * Whether a failed cachedContents.create response looks like the documented
 * "prefix too short to cache" rejection rather than some other failure
 * (auth, malformed request, transient 5xx).
 *
 * HYPOTHESIS: the exact wording of Gemini's too-short error was not
 * confirmed against a live key. This match is intentionally broad
 * (any 400 mentioning both "token" and a minimum/size word) because getting
 * it wrong is low-stakes either way — see the call site below. It only
 * gates the 10-minute skip memory, never whether ensureContextCache fails
 * open: a create failure returns null regardless of which branch matches.
 */
function looksLikeTooShortRejection(status: number, errorText: string): boolean {
  if (status !== 400) return false;
  const t = errorText.toLowerCase();
  if (!t.includes("token")) return false;
  return (
    t.includes("minimum") ||
    t.includes("at least") ||
    t.includes("too small") ||
    t.includes("too short") ||
    t.includes("below the min")
  );
}

/**
 * Ensures a Gemini `cachedContents` object exists for (model, mode,
 * staticPrefixText) and returns a reference to it, or null if caching is
 * off, not yet warranted, or failed for any reason (fail-open — see the file
 * header). Never throws.
 *
 * Call shape intentionally mirrors fetchGeminiStreamWithRetry's positional
 * style (apiKey, model, ...) with `env` and `ttlSeconds` appended: `env` is
 * required (it is the flag gate — see "flag off" below) and `ttlSeconds` is
 * the one tunable most callers will leave at its default.
 */
export async function ensureContextCache(
  apiKey: string,
  model: string,
  mode: string,
  staticPrefixText: string,
  env: EnvReader,
  ttlSeconds: number = DEFAULT_CONTEXT_CACHE_TTL_SECONDS,
): Promise<ContextCacheRef | null> {
  if (!isContextCacheEnabled(env)) return null;
  if (!apiKey || !model || !mode || !staticPrefixText) return null;

  try {
    const hash = await sha256Hex(staticPrefixText);
    const targetKey = `${model}::${mode}`;
    const fullKey = `${targetKey}::${hash}`;

    const skipAt = skipUntil.get(fullKey);
    if (skipAt !== undefined) {
      if (Date.now() < skipAt) return null;
      skipUntil.delete(fullKey); // skip window elapsed, allow a retry below
    }

    const existing = cacheRegistry.get(fullKey);
    if (existing && Date.now() < existing.expiresAt) {
      stats.hits++;
      return { cachedContent: existing.cacheName, staticPrefixText };
    }

    // Nothing reusable for this exact (model, mode, prefix hash) — either it
    // is genuinely new, the previous entry expired, or the prefix text
    // changed since the last request for this (model, mode). Evict whatever
    // is currently registered for the target so a long-lived isolate does
    // not accumulate one stale entry per prompt edit.
    const staleKey = currentKeyForTarget.get(targetKey);
    if (staleKey && staleKey !== fullKey) {
      cacheRegistry.delete(staleKey);
      skipUntil.delete(staleKey);
    }

    // HYPOTHESIS (unverified live): POST v1beta/cachedContents accepts
    // {model: "models/{id}", systemInstruction, ttl: "{n}s"} and returns
    // {name: "cachedContents/...", expireTime?: RFC3339 string, ...}. `model`
    // uses the same "models/" resource prefix fetchAvailableGeminiModels
    // strips off when parsing ListModels — LIKELY correct by symmetry with
    // that endpoint, not independently confirmed for cachedContents. `ttl`
    // as a protobuf Duration string ("3600s") follows the same convention
    // Google APIs use elsewhere for Duration fields — also unconfirmed here.
    // systemInstruction (not `contents`) is used because the static contract
    // IS a system instruction today (see convertToGeminiFormat in index.ts);
    // this keeps the cached object's own semantics identical to how that
    // text is used uncached.
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${model}`,
          systemInstruction: { parts: [{ text: staticPrefixText }] },
          ttl: `${Math.max(60, Math.floor(ttlSeconds))}s`,
        }),
      },
    );

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      if (looksLikeTooShortRejection(resp.status, errorText)) {
        skipUntil.set(fullKey, Date.now() + SKIP_TOO_SHORT_MS);
      }
      console.log(
        `[GeminiContextCache] create failed for ${model}/${mode}: HTTP ${resp.status} ${errorText.slice(0, 200)}`,
      );
      return null;
    }

    const data = (await resp.json().catch(() => null)) as { name?: string; expireTime?: string } | null;
    const cacheName = data?.name;
    if (!cacheName) {
      console.log(`[GeminiContextCache] create OK but response carried no name for ${model}/${mode}`);
      return null;
    }

    // Best-effort: prefer the server's own expiry if it parses, since it is
    // authoritative; fall back to our local ttlSeconds math otherwise. Either
    // way a wrong local guess is harmless — it only causes an early refresh
    // (wasted create call) or a stale reference (caught by the 404 path in
    // shouldRetryWithoutCache), never a broken request.
    const parsedExpiry = typeof data?.expireTime === "string" ? Date.parse(data.expireTime) : NaN;
    const expiresAt = Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + ttlSeconds * 1000;

    cacheRegistry.set(fullKey, { cacheName, expiresAt });
    currentKeyForTarget.set(targetKey, fullKey);
    stats.creates++;
    console.log(`[GeminiContextCache] created ${cacheName} for ${model}/${mode} (ttl=${ttlSeconds}s)`);
    return { cachedContent: cacheName, staticPrefixText };
  } catch (e) {
    console.log(
      `[GeminiContextCache] ensureContextCache error (fail-open, returning null): ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/**
 * Drops whatever is currently registered for (model, mode) — call after
 * shouldRetryWithoutCache returns true so the NEXT request does not hand out
 * the same broken reference again. Takes (model, mode) rather than the full
 * hash-bearing registry key because that is what a call site has on hand
 * without recomputing sha256Hex(staticPrefixText) a second time.
 */
export function forgetContextCache(model: string, mode: string): void {
  const targetKey = `${model}::${mode}`;
  const fullKey = currentKeyForTarget.get(targetKey);
  if (!fullKey) return;
  cacheRegistry.delete(fullKey);
  skipUntil.delete(fullKey);
  currentKeyForTarget.delete(targetKey);
}

// ===========================================================================
// 6. FALLBACK CLASSIFICATION
// ===========================================================================

/**
 * Whether a non-2xx response to a request that USED cachedContent looks
 * cache-shaped (the reference is stale/unknown/unsupported) rather than a
 * generic failure (rate limit, auth, 5xx, a bad prompt) that would fail the
 * exact same way with or without the cache. Only the former is worth a
 * same-attempt retry without cache; the latter is already
 * fetchGeminiStreamWithRetry's job (status/backoff retries in
 * geminiResilience.ts) and retrying it a second time here would just delay
 * the user for no benefit.
 */
export function shouldRetryWithoutCache(status: number, errorText: string): boolean {
  if (status >= 200 && status < 300) return false;
  const t = (errorText || "").toLowerCase();
  const mentionsCache =
    t.includes("cachedcontent") || t.includes("cached content") || t.includes("cachecontents");

  // The referenced cache resource does not exist server-side (expired before
  // our local expiresAt said so, deleted, or never existed) — a 404 on a
  // cachedContent-bearing call cannot mean anything else.
  if (status === 404) return true;

  // A 400 that names the cache explicitly: unsupported reference, or a
  // model/cache mismatch.
  if (status === 400 && mentionsCache) return true;

  return false;
}

// ===========================================================================
// 7. REQUEST BODY RESHAPING
// ===========================================================================
//
// FIELD LAYOUT DECISION (HYPOTHESIS, unverified live — see file header):
// Gemini's documented context-caching contract freezes systemInstruction
// (along with contents/tools, if any) INTO the cachedContent object at
// create time; a generateContent/streamGenerateContent call that also sets
// cachedContent is assumed NOT to accept a second, separate
// systemInstruction on top of it (this mirrors how every Gemini caching
// example structures the follow-up call: cachedContent + contents only).
// Since layer 2/3 (retrieved context, user memory, the retry validation
// prompt — see file header) still need to reach the model on every request,
// and `contents` only accepts "user"/"model" roles (system-level text has no
// role of its own outside systemInstruction), the dynamic remainder is
// prepended to `contents` as a leading synthetic user turn, immediately
// acknowledged by a synthetic model turn. That acknowledgement turn is
// deliberately cheap defensive plumbing: it costs a handful of tokens but
// removes any dependency on whether the live API tolerates two consecutive
// "user" turns before the real conversation, which was not verified either.
// This preserves today's instruction semantics as closely as the assumed
// constraint allows: the model still sees the dynamic instructions BEFORE
// the user's real message, just carried on a different field.
//
// If live testing (see docs/launch/context-cache-notes.md's gating plan)
// finds systemInstruction IS accepted alongside cachedContent, this is the
// one function to change — every caller already goes through it.

const DYNAMIC_CONTEXT_PREAMBLE =
  "[SYSTEM CONTEXT — apply the following silently; it is not a message from the user, and this turn should not be replied to directly]\n\n";
const DYNAMIC_CONTEXT_ACK = "Understood.";

function extractDynamicSystemText(
  systemInstruction: GeminiSystemInstruction | undefined,
  staticPrefixText: string,
): string {
  const combined = systemInstruction?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!combined || combined === staticPrefixText) return "";
  if (combined.startsWith(staticPrefixText)) {
    const rest = combined.slice(staticPrefixText.length);
    return rest.startsWith("\n\n") ? rest.slice(2) : rest;
  }
  // Defensive fallback: the static prefix is not a leading substring of the
  // combined systemInstruction (e.g. wiring drift upstream reordered system
  // messages). Fail open by treating the WHOLE combined text as dynamic and
  // sending it via the leading turn — the static contract is paid for twice
  // this one request (same cost as caching never having run) rather than
  // silently dropped.
  return combined;
}

/**
 * Reshapes a request body that was built the "uncached" way (systemInstruction
 * carrying the full static+dynamic text, exactly what convertToGeminiFormat
 * in index.ts produces today) into the cached-content variant: cachedContent
 * replaces systemInstruction, and whatever in systemInstruction was NOT the
 * cached static prefix travels as a leading contents turn instead (see the
 * field-layout decision above). Pure and synchronous — no I/O.
 */
export function buildRequestWithCache(
  baseBody: GeminiRequestBody,
  cacheRef: ContextCacheRef,
): GeminiCachedRequestBody {
  const dynamicText = extractDynamicSystemText(baseBody.systemInstruction, cacheRef.staticPrefixText);

  const contents = dynamicText
    ? [
        { role: "user", parts: [{ text: DYNAMIC_CONTEXT_PREAMBLE + dynamicText }] },
        { role: "model", parts: [{ text: DYNAMIC_CONTEXT_ACK }] },
        ...baseBody.contents,
      ]
    : baseBody.contents;

  return {
    cachedContent: cacheRef.cachedContent,
    contents,
    generationConfig: baseBody.generationConfig,
  };
}
