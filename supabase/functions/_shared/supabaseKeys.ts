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
// Resolution order for the secret key (the publishable key is symmetrical,
// reading SUPABASE_PUBLISHABLE_KEYS / SUPABASE_ANON_KEY instead):
//   1. SUPABASE_SECRET_KEYS, if present and non-empty, is JSON.parse'd. The
//      "default" property is used if present; else, if the object has
//      EXACTLY ONE property, that one is used; else this throws, naming the
//      available key names so the operator can see what to configure.
//   2. Otherwise the legacy plain SUPABASE_SERVICE_ROLE_KEY is used.
//   3. If neither yields a non-empty string: getSecretKey() throws,
//      getSecretKeyOrNull() returns null.
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
function resolveSecretKey(): string | null {
  const keyed = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keyed !== undefined && keyed !== "") {
    return selectFromKeyedJson(keyed, "SUPABASE_SECRET_KEYS");
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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
