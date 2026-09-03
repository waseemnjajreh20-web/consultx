/**
 * Client-side Real User Monitoring (RUM) beacon. Reports two kinds of
 * events to supabase/functions/perf-beacon, which writes them into
 * perf_events with source='rum' (see docs/db/20260903_perf_events.sql):
 *
 *   reportChatTiming(...)  — one report per completed/failed chat answer.
 *   reportPageVitals()     — one report per page load (TTFB/DCL/LCP).
 *
 * Both are fire-and-forget: neither ever throws, neither returns anything
 * useful to await for correctness (a caller may await reportChatTiming()
 * only to know the network attempt was *dispatched*, never to learn whether
 * it succeeded — same contract as sendBeacon itself). This mirrors
 * synthetic-probe's server-side "a monitoring signal must never break the
 * thing it's monitoring" principle, applied to the client.
 *
 * `buildBeaconPayload` and `clampTimings` are pure (no DOM/network) and
 * exported for unit testing — see src/__tests__/perfBeacon.test.ts, which
 * also tests supabase/functions/perf-beacon/validate.ts's server-side
 * counterpart from the same file, the same cross-directory pattern
 * src/__tests__/syntheticProbe.test.ts already uses. That test file imports
 * this module too, which is why the `supabase` singleton below is loaded
 * LAZILY (dynamic import inside reportBeacon, not a static top-level
 * import): src/integrations/supabase/client.ts's `createClient(...)` reads
 * the bare `localStorage` global at module-evaluation time, which doesn't
 * exist under vitest's Node test environment — a static import would crash
 * the whole test file on load, even though the tests only ever exercise the
 * pure functions below. In the real browser app this changes nothing:
 * dynamic import() of an already-bundled module resolves on the same tick
 * for all practical purposes.
 *
 * NOT wired into src/components/ChatInterface.tsx yet — that file is out of
 * scope for this change. See docs/launch/rum-notes.md for the exact 3-line
 * call site a follow-up change would add.
 */
import { FN_REGION_HEADER } from "@/lib/functionRegion";

const PERF_BEACON_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/perf-beacon`;

let supabaseClientPromise: Promise<typeof import("@/integrations/supabase/client").supabase> | null = null;

/** Lazily imports the app's Supabase singleton — see the file header for why this must not be a static top-level import. */
function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("@/integrations/supabase/client").then((m) => m.supabase);
  }
  return supabaseClientPromise;
}

export type BeaconMode = "primary" | "standard" | "analysis" | "page";
export type ChatBeaconMode = "primary" | "standard" | "analysis";

const VALID_MODES: readonly BeaconMode[] = ["primary", "standard", "analysis", "page"];
const MAX_STRING_LEN = 64;
// Anything longer than this is treated as garbage (a stuck tab / clock skew
// artifact), not a genuinely slow real answer. Mirrors the server's own
// ceiling in perf-beacon/validate.ts — both sides clamp independently.
const MAX_TIMING_MS = 10 * 60 * 1000;

// ============================================================
// Pure helpers — no DOM, no network, unit tested directly.
// ============================================================

export interface RawTimings {
  headersMs?: number | null;
  firstStatusMs?: number | null;
  firstTextMs?: number | null;
  doneMs?: number | null;
}

export interface ClampedTimings {
  headersMs: number | null;
  firstStatusMs: number | null;
  firstTextMs: number | null;
  doneMs: number | null;
}

function clampOneMs(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0 || v > MAX_TIMING_MS) return null;
  return Math.round(v);
}

/** Clamps the four timing marks to non-negative, finite, bounded integers (or null when missing/garbage). Pure. */
export function clampTimings(raw: RawTimings): ClampedTimings {
  return {
    headersMs: clampOneMs(raw.headersMs),
    firstStatusMs: clampOneMs(raw.firstStatusMs),
    firstTextMs: clampOneMs(raw.firstTextMs),
    doneMs: clampOneMs(raw.doneMs),
  };
}

function clampCount(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

function clampLabel(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_STRING_LEN ? trimmed.slice(0, MAX_STRING_LEN) : trimmed;
}

export interface BeaconInput extends RawTimings {
  mode: BeaconMode;
  chars?: number | null;
  sourcesCount?: number | null;
  engine?: string | null;
  fallbackReason?: string | null;
  errorCode?: string | null;
  ok: boolean;
}

/** The chat-only entry point restricts `mode` to a real chat mode — "page" is reportPageVitals()'s own concern. */
export interface ChatTimingInput extends Omit<BeaconInput, "mode"> {
  mode: ChatBeaconMode;
}

export interface BeaconWirePayload {
  mode: string;
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
}

/**
 * Builds the exact JSON body perf-beacon expects from a BeaconInput —
 * clamping/truncating every field the same way the server independently
 * does (defense in depth: a client bug must not corrupt the RUM stats
 * admins read, even before the network round trip). Pure.
 */
export function buildBeaconPayload(input: BeaconInput): BeaconWirePayload {
  const mode = VALID_MODES.includes(input.mode) ? input.mode : "primary";
  const t = clampTimings(input);
  return {
    mode,
    headers_ms: t.headersMs,
    first_status_ms: t.firstStatusMs,
    first_text_ms: t.firstTextMs,
    done_ms: t.doneMs,
    chars: clampCount(input.chars),
    sources_count: clampCount(input.sourcesCount),
    engine: clampLabel(input.engine),
    fallback_reason: clampLabel(input.fallbackReason),
    error_code: clampLabel(input.errorCode),
    ok: input.ok === true,
  };
}

// ============================================================
// Transport — sendBeacon primary, fetch keepalive fallback.
// ============================================================

async function transmit(payload: BeaconWirePayload, token: string): Promise<void> {
  const bodyStr = JSON.stringify({ ...payload, access_token: token });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // "text/plain" (NOT "application/json") keeps this a CORS-"simple"
      // request, so the browser never needs a preflight OPTIONS round trip
      // before it — important because this transport is used from
      // pagehide/visibilitychange (see reportPageVitals below), where a
      // preflight could be cut off mid-flight by the unload itself.
      // perf-beacon/index.ts's req.json() parses the body by its actual
      // content regardless of the declared Content-Type, so this costs
      // nothing on the receiving end.
      const blob = new Blob([bodyStr], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon(PERF_BEACON_URL, blob)) return;
      // sendBeacon returned false (queue full/oversized) — fall through to fetch.
    }
  } catch {
    // fall through to fetch
  }

  try {
    await fetch(PERF_BEACON_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...FN_REGION_HEADER,
      },
      body: bodyStr,
      keepalive: true,
    });
  } catch {
    // fire-and-forget — never throws
  }
}

/** Shared "get session, build payload, transmit" path for both public entry points below. Never throws. */
async function reportBeacon(input: BeaconInput): Promise<void> {
  try {
    const supabase = await getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return; // skip when no session — nothing to authenticate the beacon with
    await transmit(buildBeaconPayload(input), token);
  } catch {
    // never throws — a monitoring signal must never surface as a user-facing error
  }
}

// ============================================================
// Public entry points
// ============================================================

/**
 * Reports one completed or failed chat answer's timing marks. Call this
 * exactly ONCE per answer, from ChatInterface's onDone AND onError
 * callbacks (mutually exclusive per streamChat's own contract — see
 * docs/launch/rum-notes.md for the exact call site). Skips silently when
 * there is no active session; never throws.
 */
export async function reportChatTiming(input: ChatTimingInput): Promise<void> {
  await reportBeacon(input);
}

// ============================================================
// reportPageVitals — one report per page load (TTFB / DCL / LCP)
// ============================================================

let pageVitalsArmed = false;

/**
 * Arms listeners that report Time-To-First-Byte, DOMContentLoaded and
 * Largest Contentful Paint for the CURRENT page load as one mode="page"
 * perf_events row, sent once when the page is hidden/unloaded (or after a
 * 15s fallback timeout for a tab that's never hidden). Safe to call more
 * than once — only the first call arms anything.
 *
 * Column mapping (documented here AND in docs/launch/rum-notes.md, so a
 * reader of raw perf_events rows isn't puzzled by a mode="page" row using
 * "chat" column names):
 *   headers_ms    = TTFB   (navigation entry responseStart)
 *   first_text_ms = DOMContentLoaded (domContentLoadedEventEnd)
 *   done_ms       = LCP    (largest-contentful-paint entry startTime, when
 *                           the browser supports that PerformanceObserver
 *                           entry type — null otherwise, never fabricated)
 *   first_status_ms is always null for mode="page" — chat's "thinking
 *   started" mark has no page-load analog.
 * This mapping is deliberate: it lets AdminHealth's RUM table reuse the
 * exact same p50/p95 aggregation (aggregateStats in
 * supabase/functions/synthetic-probe/logic.ts) chat rows already use, with
 * no page-specific branch.
 */
export function reportPageVitals(): void {
  if (pageVitalsArmed) return;
  if (typeof window === "undefined" || typeof document === "undefined" || typeof performance === "undefined") return;
  pageVitalsArmed = true;

  let lcpMs: number | null = null;
  let observer: { disconnect: () => void } | null = null;

  try {
    const PO = (window as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
    const supported = PO?.supportedEntryTypes?.includes("largest-contentful-paint");
    if (PO && supported) {
      const po = new PO((list) => {
        const entries = list.getEntries() as unknown as Array<{ startTime: number }>;
        const last = entries[entries.length - 1];
        if (last) lcpMs = last.startTime;
      });
      po.observe({ type: "largest-contentful-paint", buffered: true } as PerformanceObserverInit);
      observer = po;
    }
  } catch {
    observer = null; // LCP simply stays null — "when available" per this function's own contract
  }

  let sent = false;
  const send = () => {
    if (sent) return;
    sent = true;
    try {
      observer?.disconnect();
    } catch {
      // ignore
    }

    let ttfbMs: number | null = null;
    let dclMs: number | null = null;
    try {
      const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      if (nav) {
        ttfbMs = nav.responseStart;
        dclMs = nav.domContentLoadedEventEnd;
      }
    } catch {
      // ignore — vitals stay null
    }

    void reportBeacon({
      mode: "page",
      headersMs: ttfbMs,
      firstStatusMs: null,
      firstTextMs: dclMs,
      doneMs: lcpMs,
      chars: null,
      sourcesCount: null,
      engine: null,
      fallbackReason: null,
      errorCode: null,
      ok: true,
    });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") send();
  });
  window.addEventListener("pagehide", send, { once: true });
  // Fallback so a tab that's never hidden/closed during this session (e.g. a
  // long-lived dashboard tab) still reports once, rather than never.
  window.setTimeout(send, 15000);
}
