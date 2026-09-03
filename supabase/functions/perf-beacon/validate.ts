/**
 * perf-beacon/validate.ts — pure helpers for the perf-beacon edge function.
 * No Deno APIs beyond the Web Crypto API (a genuine global in both Deno and
 * Node 20+/vitest — the exact pattern already proven by retrievalCache.ts's
 * cacheKey(), see that file's header), no other I/O, no external deps — so
 * this file is imported directly by src/__tests__/perfBeacon.test.ts under
 * vitest AND by index.ts under Deno, the same cross-runtime pure-module
 * pattern synthetic-probe/logic.ts uses (see that file's header).
 *
 * Covers three independent concerns:
 *   1. Payload validation/shaping — turns an arbitrary parsed JSON body into
 *      a safe perf_events row shape, or null if it isn't salvageable at all
 *      (bad/missing mode). Every individual field is clamped/dropped rather
 *      than causing a whole-request rejection — a client sending a garbage
 *      `engine` string must not lose an otherwise-valid timing report.
 *   2. hashUserId — sha256(user id), truncated to 12 hex chars. Used so
 *      perf_events (which the SQL header notes deliberately has NO foreign
 *      key back to auth.users) never stores a reversible identifier while
 *      still letting an admin distinguish "one user retrying" from "many
 *      different users".
 *   3. uaFamily — coarse User-Agent -> browser-family classifier, so
 *      perf_events.extra never stores the raw (long, fingerprint-y)
 *      User-Agent string.
 *   4. checkRateLimit — pure decision function for the in-memory per-user
 *      rate limit; index.ts owns the actual Map (I/O-adjacent state), this
 *      module only decides "given this stored state and now, is this call
 *      allowed, and what's the next state". Same shape as
 *      send-contact-message/index.ts's per-IP limiter, keyed by user id.
 */

// ============================================================
// 1. Payload validation / shaping
// ============================================================

export const VALID_MODES = ["primary", "standard", "analysis", "page"] as const;
export type BeaconMode = (typeof VALID_MODES)[number];

export const MAX_STRING_LEN = 64;
export const MAX_EXTRA_BYTES = 2048;
// Anything longer than this is treated as garbage (a clock skew / stuck tab
// artifact), not a genuinely slow real answer — same ceiling reasoning as
// REQUEST_TIMEOUT_MS in synthetic-probe/index.ts, just applied client-side.
export const MAX_TIMING_MS = 10 * 60 * 1000;

/** Untyped on purpose — this is the parse boundary for whatever arrived off the wire. */
export type RawBeaconPayload = Record<string, unknown>;

export interface ValidatedBeaconPayload {
  mode: BeaconMode;
  headers_ms: number | null;
  first_status_ms: number | null;
  first_text_ms: number | null;
  done_ms: number | null;
  chars: number | null;
  sources_count: number | null;
  engine: string | null;
  fallback_reason: string | null;
  error_code: string | null;
  ok: boolean;
  /** Client-supplied extra, capped at MAX_EXTRA_BYTES. index.ts adds uid/ua AFTER this — see that file's comment on why the merge order matters. */
  extra: Record<string, unknown>;
}

function isFiniteNonNegNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function clampMs(v: unknown): number | null {
  if (!isFiniteNonNegNumber(v) || v > MAX_TIMING_MS) return null;
  return Math.round(v);
}

function clampCount(v: unknown): number | null {
  if (!isFiniteNonNegNumber(v)) return null;
  return Math.round(v);
}

function clampString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_STRING_LEN ? trimmed.slice(0, MAX_STRING_LEN) : trimmed;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Caps `extra` at MAX_EXTRA_BYTES of serialized JSON. An oversized (or
 * unserializable, e.g. containing a BigInt) object is dropped to {} wholesale
 * rather than partially truncated — slicing a JSON string can produce
 * invalid JSON, and a half-object is worse than none.
 */
function clampExtra(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  try {
    const json = JSON.stringify(v);
    if (byteLength(json) > MAX_EXTRA_BYTES) return {};
    return v as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isValidMode(v: unknown): v is BeaconMode {
  return typeof v === "string" && (VALID_MODES as readonly string[]).includes(v);
}

/**
 * Validates+shapes one incoming beacon payload. Returns null only when the
 * payload isn't salvageable at all (not an object, or an unrecognised/missing
 * `mode` — mode is the one field with no sane default, since a wrong guess
 * would silently mislabel a row). Every other field is independently
 * clamped/dropped to null rather than rejecting the whole request. Unknown
 * top-level keys (e.g. `access_token` — see index.ts) are silently ignored:
 * only the fields read below are ever used.
 */
export function validateBeaconPayload(raw: unknown): ValidatedBeaconPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as RawBeaconPayload;
  if (!isValidMode(r.mode)) return null;

  return {
    mode: r.mode,
    headers_ms: clampMs(r.headers_ms),
    first_status_ms: clampMs(r.first_status_ms),
    first_text_ms: clampMs(r.first_text_ms),
    done_ms: clampMs(r.done_ms),
    chars: clampCount(r.chars),
    sources_count: clampCount(r.sources_count),
    engine: clampString(r.engine),
    fallback_reason: clampString(r.fallback_reason),
    error_code: clampString(r.error_code),
    ok: r.ok === true,
    extra: clampExtra(r.extra),
  };
}

// ============================================================
// 2. hashUserId — sha256(user id), first 12 hex chars
// ============================================================

/**
 * First 12 hex chars of sha256(userId) — 48 bits, deliberately short so it
 * reads as "a grouping bucket", not an id. Never the raw id: perf_events has
 * no foreign key to auth.users and is kept far longer than a session, so a
 * reversible identifier has no business living in it (see docs/db/
 * 20260903_perf_events.sql and this function's own header). Deterministic
 * per user id (same input -> same hash every call) so an admin can still
 * tell "one user retrying" apart from "many different users" in the RUM
 * table without ever seeing who that user is.
 */
export async function hashUserId(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(userId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}

// ============================================================
// 3. uaFamily — coarse User-Agent -> browser-family classifier
// ============================================================

// Order matters: Edge/Opera/Chrome-on-iOS UAs all also contain "Chrome/" or
// "Safari/" substrings (compatibility tokens), so the more specific browsers
// must be checked before the generic ones they'd otherwise be misclassified
// as. Real Safari has neither "Chrome/", "CriOS/", "Edg/" nor "OPR/" in its
// UA, so it safely falls through to the last two patterns.
const UA_FAMILIES: ReadonlyArray<{ pattern: RegExp; name: string }> = [
  { pattern: /Edg\//, name: "Edge" },
  { pattern: /OPR\//, name: "Opera" },
  { pattern: /CriOS\//, name: "Chrome" },
  { pattern: /Chrome\//, name: "Chrome" },
  { pattern: /FxiOS\//, name: "Firefox" },
  { pattern: /Firefox\//, name: "Firefox" },
  { pattern: /Version\/.*Safari\//, name: "Safari" },
  { pattern: /Safari\//, name: "Safari" },
];

/**
 * Coarse User-Agent -> browser-family label ("Chrome", "Safari", "Firefox",
 * "Edge", "Opera", "Other" for an unrecognised-but-present UA, "unknown" for
 * a missing/empty one). Never returns the raw UA string, which is unbounded
 * length and can be fingerprint-y.
 */
export function uaFamily(userAgent: string | null | undefined): string {
  if (!userAgent || typeof userAgent !== "string") return "unknown";
  for (const { pattern, name } of UA_FAMILIES) {
    if (pattern.test(userAgent)) return name;
  }
  return "Other";
}

// ============================================================
// 4. checkRateLimit — pure decision function, 30/min default
// ============================================================

export interface RateLimitState {
  count: number;
  windowStart: number;
}

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 30;

/**
 * Given the previously-stored state for one key (undefined if never seen, or
 * expired by the caller) and the current time, decides whether this call is
 * allowed and what state to store next. A new/expired window always allows
 * (count resets to 1); within a live window, allowed while count stays
 * <= RATE_LIMIT_MAX. Pure — index.ts owns the Map and the "is the window
 * still live" expiry check that feeds `prev` in.
 */
export function checkRateLimit(
  prev: RateLimitState | undefined,
  now: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
  max: number = RATE_LIMIT_MAX,
): { allowed: boolean; next: RateLimitState } {
  if (!prev || now - prev.windowStart > windowMs) {
    return { allowed: true, next: { count: 1, windowStart: now } };
  }
  const count = prev.count + 1;
  return { allowed: count <= max, next: { count, windowStart: prev.windowStart } };
}
