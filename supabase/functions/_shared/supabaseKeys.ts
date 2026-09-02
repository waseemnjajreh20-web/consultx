// ============================================================
// _shared/supabaseKeys.ts
//
// Dual-mode resolution of the Supabase service-role and anon/publishable
// keys, so that every edge function keeps working BOTH BEFORE and AFTER the
// owner disables Supabase's legacy JWT-format API keys.
//
// Why this exists: this repo's legacy keys leaked while the repository was
// briefly public, so the owner must disable legacy keys in the Supabase
// dashboard. The platform-injected SUPABASE_SERVICE_ROLE_KEY /
// SUPABASE_ANON_KEY env vars hold LEGACY-format keys and stop resolving to a
// working key the instant that switch is flipped.
//
// Per Supabase's migration guide
// (supabase.com/docs/guides/getting-started/migrating-to-new-api-keys):
//   "Supabase adds two new ones to your functions' environment,
//   `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS`."
//   "The legacy variables held a plain string. The new ones hold a JSON
//   object keyed by name, so you parse them and read the key by name."
// Their example: JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']
//
// So this is not a one-line rename — every read changes shape. Every call
// site in supabase/functions/** must go through the four functions below
// instead of calling Deno.env.get("SUPABASE_SERVICE_ROLE_KEY" |
// "SUPABASE_ANON_KEY") directly, so that:
//   - TODAY (legacy keys still enabled): SUPABASE_SECRET_KEYS /
//     SUPABASE_PUBLISHABLE_KEYS may not even be set; resolution falls back to
//     the legacy plain-string vars, unchanged behaviour.
//   - AFTER the owner disables legacy keys: the new JSON vars resolve
//     instead, with zero code changes and no synchronized cutover required.
// The owner's flip of the dashboard switch becomes a non-event rather than a
// deploy that must land in lockstep with it.
//
// Resolution order for the SECRET key (changed 2026-09-03 — see the measured
// RLS finding inside resolveSecretKey):
//   1. The legacy plain SUPABASE_SERVICE_ROLE_KEY, while it is present — it is
//      the key proven to carry service-role privileges (RLS bypass) today.
//   2. Otherwise SUPABASE_SECRET_KEYS is JSON.parse'd. The "default" property
//      is used if present; else, if the object has EXACTLY ONE property, that
//      one is used; else this throws, naming the available key names.
//   3. If neither yields a non-empty string: getSecretKey() throws,
//      getSecretKeyOrNull() returns null.
// The PUBLISHABLE key keeps the original order (SUPABASE_PUBLISHABLE_KEYS
// first, then SUPABASE_ANON_KEY): both resolve to the anon role, so the RLS
// finding does not apply to it.
//
// MALFORMED JSON in SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS (or a
// selected value that is not a non-empty string) ALWAYS THROWS — including
// from the *OrNull variants. A malformed env var is a configuration error,
// not an absence; silently falling back to the legacy key would mask exactly
// the misconfiguration this migration exists to surface. The thrown message
// names the failing variable and the reason, and never echoes any part of
// its value.
//
// Deliberately NOT memoized: Deno.env.get is a cheap in-process lookup (no
// I/O), and caching would let a stale value survive a key rotation or
// complicate testing for no real benefit.
// ============================================================

/**
 * Parse `raw` (the contents of a `SUPABASE_SECRET_KEYS` /
 * `SUPABASE_PUBLISHABLE_KEYS`-shaped env var) and select the one key to use.
 *
 * Throws — never returns a fallback value — for every shape of malformed
 * input: invalid JSON, a non-object, an object with neither a "default"
 * property nor exactly one property, or a selected value that is not a
 * non-empty string. The error message names `varName` and the available key
 * names where relevant, but never echoes any key value.
 */
function selectFromKeyedJson(raw: string, varName: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `${varName} is set but is not valid JSON. Expected a JSON object keyed by ` +
        `key name (e.g. {"default": "..."}), per the Supabase new-API-keys migration.`,
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `${varName} is set but did not parse to a JSON object keyed by key name.`,
    );
  }

  const obj = parsed as Record<string, unknown>;
  const names = Object.keys(obj);

  let selectedName: string;
  if (Object.prototype.hasOwnProperty.call(obj, "default")) {
    selectedName = "default";
  } else if (names.length === 1) {
    selectedName = names[0];
  } else {
    throw new Error(
      `${varName} has no "default" entry and does not have exactly one key, so ` +
        `which key to use is ambiguous. Available key names: ` +
        `${names.length > 0 ? names.join(", ") : "(none)"}. Add a "default" entry, ` +
        `or set the legacy fallback env var instead.`,
    );
  }

  const value = obj[selectedName];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `${varName}["${selectedName}"] did not resolve to a non-empty string.`,
    );
  }
  return value;
}

/**
 * Shared resolution for the secret (service-role) key. Returns null only when
 * BOTH the new and legacy env vars are absent/empty — never on malformed
 * JSON, which throws unconditionally (see file header).
 */
/** Bundled-helper marker: lets a deployed function report which precedence it carries. */
export const SECRET_KEY_RESOLUTION = "explicit-jwt-first-2026-09-03";

/** A legacy service-role key is a three-part JWT; the new keys are sb_secret_ strings. */
function looksLikeLegacyJwt(value: string | undefined): boolean {
  return !!value && value.startsWith("eyJ") && value.split(".").length === 3;
}

function resolveSecretKey(): string | null {
  // MEASURED 2026-09-03 (second finding): the platform also rewrote the legacy
  // SUPABASE_SERVICE_ROLE_KEY variable to carry the new sb_secret_ value, so
  // "prefer legacy" alone changed nothing. The only key proven to bypass RLS
  // is the legacy service-role JWT itself, which the owner now provides as the
  // custom secret CONSULTX_SERVICE_ROLE_JWT (SUPABASE_-prefixed names are
  // reserved by the platform). It wins whenever it is present and JWT-shaped.
  const explicit = Deno.env.get("CONSULTX_SERVICE_ROLE_JWT");
  if (explicit && looksLikeLegacyJwt(explicit)) return explicit;
  // MEASURED 2026-09-03: the platform started injecting SUPABASE_SECRET_KEYS on
  // 2026-09-01 11:03Z, and its "default" sb_secret_ key does NOT bypass RLS —
  // every direct table write through the admin client (user_memory upserts,
  // perf_events inserts) failed with "new row violates row-level security
  // policy" from that minute on, silently, while SECURITY DEFINER RPCs kept
  // working. So while the legacy service-role JWT is still enabled it is the
  // key that actually carries service-role privileges, and it wins. The JSON
  // form is used only when the legacy variable is absent (i.e. after the owner
  // disables legacy keys) — and that cutover must first prove, with a direct
  // insert into an RLS-enabled table, that the new key bypasses RLS.
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy && looksLikeLegacyJwt(legacy)) return legacy;
  const keyed = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keyed !== undefined && keyed !== "") {
    return selectFromKeyedJson(keyed, "SUPABASE_SECRET_KEYS");
  }
  return legacy && legacy.length > 0 ? legacy : null;
}

/**
 * Shared resolution for the publishable (anon) key. Symmetrical with
 * `resolveSecretKey` — see file header for the full resolution order.
 */
function resolvePublishableKey(): string | null {
  const keyed = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keyed !== undefined && keyed !== "") {
    return selectFromKeyedJson(keyed, "SUPABASE_PUBLISHABLE_KEYS");
  }
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  return legacy && legacy.length > 0 ? legacy : null;
}

/**
 * The Supabase service-role key, however it is currently configured.
 *
 * Throws when unresolvable — use this at any call site that today does
 * `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!`, where a missing key is
 * already an unrecoverable configuration error.
 */
export function getSecretKey(): string {
  const key = resolveSecretKey();
  if (key === null) {
    throw new Error(
      "No Supabase service-role key configured. Set SUPABASE_SECRET_KEYS " +
        '(new-format, JSON, e.g. {"default": "..."}) or SUPABASE_SERVICE_ROLE_KEY ' +
        "(legacy) in this function's environment.",
    );
  }
  return key;
}

/**
 * Same resolution as `getSecretKey`, but returns null instead of throwing
 * when nothing is configured. Malformed JSON in SUPABASE_SECRET_KEYS still
 * throws — see file header. Use this only at call sites whose surrounding
 * code already handles a missing key gracefully.
 */
export function getSecretKeyOrNull(): string | null {
  return resolveSecretKey();
}

/**
 * The Supabase publishable/anon key, however it is currently configured.
 *
 * Throws when unresolvable — use this at any call site that today does
 * `Deno.env.get("SUPABASE_ANON_KEY")!`.
 */
export function getPublishableKey(): string {
  const key = resolvePublishableKey();
  if (key === null) {
    throw new Error(
      "No Supabase publishable/anon key configured. Set SUPABASE_PUBLISHABLE_KEYS " +
        '(new-format, JSON, e.g. {"default": "..."}) or SUPABASE_ANON_KEY (legacy) ' +
        "in this function's environment.",
    );
  }
  return key;
}

/**
 * Same resolution as `getPublishableKey`, but returns null instead of
 * throwing when nothing is configured. Malformed JSON in
 * SUPABASE_PUBLISHABLE_KEYS still throws — see file header.
 */
export function getPublishableKeyOrNull(): string | null {
  return resolvePublishableKey();
}
