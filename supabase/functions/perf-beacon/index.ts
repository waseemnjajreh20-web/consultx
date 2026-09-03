/**
 * perf-beacon — POST-only, JWT-authenticated ingestion endpoint for
 * client-side Real User Monitoring (RUM). Writes one perf_events row per
 * call with source='rum' (see docs/db/20260903_perf_events.sql). Twin to
 * synthetic-probe, which writes source='synthetic' rows into the same table
 * from a scheduled server-side probe instead of a real browser — this file
 * deliberately mirrors its structure (json() helper, CORS shape, service-role
 * client via _shared/supabaseKeys.ts) so the two are easy to read side by
 * side. src/lib/perfBeacon.ts is the (only intended) caller.
 *
 * ---------------------------------------------------------------------------
 * AUTH
 * ---------------------------------------------------------------------------
 * Same shape as delete-account/index.ts: verifies the CALLER'S OWN JWT via
 * auth.getUser() on a publishable-key client, using an Authorization header
 * this function builds itself — never trusting a user id from the body.
 *
 * That header's VALUE is sourced from EITHER:
 *   - the incoming `Authorization` request header (the fetch-keepalive
 *     transport path), or
 *   - an `access_token` string field in the JSON body (the
 *     navigator.sendBeacon transport path) — sendBeacon cannot set ANY
 *     custom request headers (MDN: "no headers can be set"), so a beacon
 *     fired via sendBeacon has nowhere else to carry the token.
 * Whichever source resolves first (header, then body) is verified through
 * the exact same auth.getUser() call — neither path is weaker than the
 * other; both end up authenticating a real Supabase session.
 *
 * verify_jwt = false in supabase/config.toml (this function gates itself),
 * exactly like delete-account.
 *
 * ---------------------------------------------------------------------------
 * INSERT
 * ---------------------------------------------------------------------------
 * Uses the service-role client via getSecretKey() (see _shared/
 * supabaseKeys.ts's header for why every write path in this repo must go
 * through that helper rather than a bare env read, and never sign a session
 * in on this client — see synthetic-probe/index.ts's root-cause comment for
 * what silently breaks if you do). The auth-check client above and the
 * insert client below are two entirely separate createClient() calls, same
 * as delete-account's userClient/adminClient split.
 *
 * ---------------------------------------------------------------------------
 * PRIVACY
 * ---------------------------------------------------------------------------
 * perf_events has no column linking a row back to auth.users (see the schema
 * file's comment). The only per-user signal kept is extra.uid — the first 12
 * hex chars of sha256(user.id), just enough to tell "one user refreshing
 * repeatedly" apart from "many different users" in the admin dashboard,
 * without perf_events ever holding a reversible identifier, an email, or a
 * raw UUID. extra.ua is a coarse browser-family label, never the raw
 * User-Agent string. Both are computed AFTER validating the client's own
 * `extra` object and spread in LAST, so a client can never smuggle a
 * spoofed "uid"/"ua" key into its own extra payload to override these.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey, getPublishableKey } from "../_shared/supabaseKeys.ts";
import { validateBeaconPayload, hashUserId, uaFamily, checkRateLimit, type RateLimitState } from "./validate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // x-region must be listed here or the browser's CORS preflight fails for
  // any caller sending it — see src/lib/functionRegion.ts's header.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ── In-memory per-user rate limit (30/min) ──────────────────────────────
// Same shape/limitation as send-contact-message/index.ts's per-IP limiter:
// resets on cold start, not shared across concurrent function instances —
// a best-effort speed bump against a runaway client, not a hard cap. Keyed
// by user id (not IP) since every caller here is already authenticated.
const RATE_LIMIT_MAX_TRACKED = 5000;
const rateLimitMap = new Map<string, RateLimitState>();

function isRateLimited(userId: string): boolean {
  // Defensive cleanup, same trigger/behaviour as send-contact-message's:
  // a sustained spray of distinct ids must not leak memory. Worst case this
  // briefly resets everyone's window.
  if (rateLimitMap.size > RATE_LIMIT_MAX_TRACKED) rateLimitMap.clear();
  const { allowed, next } = checkRateLimit(rateLimitMap.get(userId), Date.now());
  rateLimitMap.set(userId, next);
  return !allowed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    // ── auth: Authorization header first, body.access_token fallback ──────
    const headerAuth = req.headers.get("Authorization");
    const bodyToken = typeof body.access_token === "string" ? body.access_token : null;
    const authHeaderValue = headerAuth ?? (bodyToken ? `Bearer ${bodyToken}` : null);
    if (!authHeaderValue) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, getPublishableKey(), {
      global: { headers: { Authorization: authHeaderValue } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "unauthorized" }, 401);

    if (isRateLimited(user.id)) {
      return json({ error: "rate_limited" }, 429);
    }

    const validated = validateBeaconPayload(body);
    if (!validated) return json({ error: "invalid_payload" }, 400);

    const region = req.headers.get("x-region") ?? "unknown";
    const uid = await hashUserId(user.id);
    const ua = uaFamily(req.headers.get("user-agent"));
    // Server-computed identity fields spread LAST — see PRIVACY note above.
    const extra = { ...validated.extra, uid, ua };

    const adminClient = createClient(supabaseUrl, getSecretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: insertError } = await adminClient.from("perf_events").insert({
      source: "rum",
      mode: validated.mode,
      region,
      headers_ms: validated.headers_ms,
      first_status_ms: validated.first_status_ms,
      first_text_ms: validated.first_text_ms,
      done_ms: validated.done_ms,
      chars: validated.chars,
      sources_count: validated.sources_count,
      engine: validated.engine,
      fallback_reason: validated.fallback_reason,
      error_code: validated.error_code,
      ok: validated.ok,
      extra,
    });

    if (insertError) {
      console.error("[perf-beacon] insert failed:", insertError.message);
      return json({ error: "insert_failed" }, 500);
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (error) {
    console.error("[perf-beacon] unhandled error:", error instanceof Error ? error.message : String(error));
    return json({ error: "internal_server_error" }, 500);
  }
});
