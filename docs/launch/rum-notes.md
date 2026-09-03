# ConsultX — Real User Monitoring (RUM) Notes

**Date:** 2026-09-03 · **Branch:** recovery/stabilization-2026-08-23

What this ships: `supabase/functions/perf-beacon` (a JWT-authenticated
ingestion endpoint), `src/lib/perfBeacon.ts` (the client library that would
call it), and a "المستخدمون الحقيقيون" (Real Users) section on
`/admin/health` that reads what it writes. All three write/read
`perf_events` with `source='rum'` — the sibling feed to `synthetic-probe`'s
`source='synthetic'` rows (see `docs/launch/synthetic-probe-runbook.md`).

**Not wired into the app yet.** `src/lib/perfBeacon.ts` is a complete,
tested, standalone module, but nothing calls it — `src/components/ChatInterface.tsx`
and `src/App.tsx` were out of scope for this change (a different agent owns
them this wave). The exact call site a follow-up change would add is below.

---

## 1. Deploy

```powershell
npx supabase functions deploy perf-beacon --project-ref hrnltxmwoaphgejckutk
```

No new secrets. `perf-beacon` reuses `SUPABASE_URL` and the same key
resolution every other function already gets via `_shared/supabaseKeys.ts`
(`getPublishableKey()` for the auth check, `getSecretKey()` for the insert —
see that file's header for why every write path goes through it instead of
reading `SUPABASE_SERVICE_ROLE_KEY` directly, and `project_supabase_keys_rls.md`
in memory for why that matters right now).

`verify_jwt = false` is already set in `supabase/config.toml` — the function
gates itself (`auth.getUser`), exactly like `delete-account`. See the
**Auth** section below for why this function *specifically* cannot rely on
the platform's header-only JWT gate the way `delete-account` does.

`perf_events` (the table `perf-beacon` writes to) already exists in
production — it was created for `synthetic-probe` by
`docs/db/20260903_perf_events.sql`. Nothing new to apply.

## 2. Auth: why the JWT can arrive in the body, not just the header

`navigator.sendBeacon()` — the primary transport `src/lib/perfBeacon.ts`
uses — **cannot set any custom request headers** (no `Authorization`, no
`x-region`; this is a hard platform limitation, not a bug). Since
`perf-beacon` requires a real JWT on every call, `index.ts` accepts the
token from either source:

1. The `Authorization` request header (used by the `fetch(..., {keepalive:
   true})` fallback path), or
2. An `access_token` string field in the JSON body (used by the
   `sendBeacon` path).

Whichever is present, the function builds one `Authorization: Bearer <token>`
header itself and verifies it via `auth.getUser()` on a publishable-key
client — identically to `delete-account/index.ts`. Neither path is weaker:
both end up authenticating a real Supabase session before anything is
written. `region` has no such fallback (sendBeacon truly cannot carry it) —
a beacon sent via `sendBeacon` lands with `region="unknown"`, which is the
accepted, documented degradation, not a bug to chase.

The `sendBeacon` transport also deliberately uses a `text/plain` Blob type
(not `application/json`) so the request stays CORS-"simple" and never needs
a preflight `OPTIONS` round trip — this matters because `sendBeacon` fires
from `pagehide`/`visibilitychange`, where a pending preflight could be cut
off by the unload itself. The function's `req.json()` parses the body by
its actual content regardless of the declared `Content-Type`, so this costs
nothing server-side.

## 3. Privacy

`perf_events` has **no column linking a row back to `auth.users`** — no
`user_id` foreign key, nothing reversible. The only per-user signal kept is
`extra.uid`: the first 12 hex characters of `sha256(user.id)`, computed
server-side in `perf-beacon/index.ts` from the verified JWT's user id —
**never the raw id, never an email**. It exists only so an admin reading the
RUM table can tell "one user retrying the same question five times" apart
from "five different users", without the table ever holding anything that
points back to a person. `extra.ua` is a coarse browser-family label
(`"Chrome"`, `"Safari"`, `"Firefox"`, `"Edge"`, `"Opera"`, `"Other"`,
`"unknown"`) — never the raw `User-Agent` string, which is long and can be
fingerprint-y on its own.

Both fields are computed **after** validating whatever `extra` object the
client sent, and merged in **last**, so a client can never smuggle a spoofed
`uid`/`ua` key into its own payload to override the server-computed ones
(`supabase/functions/perf-beacon/index.ts`, the `extra = { ...validated.extra,
uid, ua }` line).

`reportChatTiming`/`reportPageVitals` in `src/lib/perfBeacon.ts` both skip
silently (no network call at all) when there is no active session — an
anonymous visitor on a public page never generates a RUM row.

## 4. The ChatInterface call site (not yet wired)

`src/components/ChatInterface.tsx`'s `handleSendWithRetry` already calls
`streamChat({...})` with `onFirstChunk`, `onThinkingStatus`, `onDone` and
`onError` callbacks (around line 1296). A minimal wiring is **three lines**:

```ts
// 1) Before `await streamChat({` (~line 1295) — start the clock:
const t0 = Date.now();

// 2) Inside onDone, after `stopLoading()` succeeds (~line 1332-1337):
void reportChatTiming({ mode: currentMode, doneMs: Date.now() - t0, chars: fullContent.length, ok: validation.valid });

// 3) Inside onError's GENERIC branch only — after the mode_locked /
//    trial_card_required / trial_expired / aborted early-returns
//    (~line 1392-1394), never inside them:
void reportChatTiming({ mode: currentMode, doneMs: Date.now() - t0, ok: false, errorCode: error });
```

Placement matters for #3: `onError`'s early-return branches for
`mode_locked`, `trial_card_required`, `trial_expired` and an aborted
controller (mode switch / navigation, not a real failure) are business-logic
gates and user-initiated cancels, not chat/backend performance failures —
reporting those as RUM would pollute the latency stats with non-performance
noise. Only the final generic branch (an actual backend/network error)
belongs in RUM.

**What this minimal wiring cannot capture yet**, and why:

- **`first_status_ms` / `first_text_ms`** — `onThinkingStatus` and
  `onFirstChunk` already fire at exactly the right moments, but capturing
  "only the first call" needs a small ref (e.g.
  `const marksRef = useRef({ firstStatusMs: null, firstTextMs: null })`,
  stamped once inside each callback and read back in step 2/3 above) rather
  than a bare local variable, since these are closures reused across
  retries. Left out of the 3-line minimal version on purpose — a natural
  v1.1, not a blocker to shipping `doneMs`/`ok` first.
- **`engine` / `fallback_reason`** — NOT a client-lib gap: `streamChat`'s
  `onSources` callback signature (`ChatInterface.tsx` line ~682,
  `onSources?: (sources: string[]) => void`) only ever forwards the `files`
  array. The SSE `sources` event itself carries `engine`/`retrievalFallback`
  (confirmed in `streamChat`'s own parsing, ~line 774), but `streamChat`
  drops them on the floor before they ever reach the caller. Reporting
  `engine`/`fallback_reason` in RUM needs `onSources`'s callback type
  extended first — out of scope here since it means editing
  `ChatInterface.tsx`/`streamChat` itself.
- **`headers_ms`** — `streamChat` never surfaces a "response headers
  received" timestamp to its caller at all today; same category of gap as
  the above two.

`reportChatTiming`'s input type (`ChatTimingInput` in `src/lib/perfBeacon.ts`)
already accepts all of these fields as optional — nothing about the library
blocks filling them in later; only `ChatInterface.tsx` itself needs the
extra plumbing, in a follow-up that is free to touch that file.

## 5. Page vitals — already self-contained

Unlike chat timing, `reportPageVitals()` needs **no** app wiring beyond
calling it once (e.g. from `src/App.tsx`'s top-level mount — also out of
scope this wave). It arms its own listeners (`PerformanceObserver` for LCP
when the browser supports that entry type, `visibilitychange`/`pagehide` to
send, a 15s fallback timer for a tab that's never hidden) and reads
TTFB/DOMContentLoaded/LCP straight from the Navigation Timing / Performance
Observer APIs — no marks need to be threaded through component state.

Column mapping for `mode='page'` rows (same columns as chat, different
meaning — documented here and in `perfBeacon.ts`'s own header so a raw
`perf_events` row doesn't look mislabeled):

| Column | Chat rows mean... | `mode='page'` rows mean... |
|---|---|---|
| `headers_ms` | time to response headers | TTFB (`navigation.responseStart`) |
| `first_status_ms` | first "thinking" event | always `null` — no page-load analog |
| `first_text_ms` | first content delta | DOMContentLoaded (`domContentLoadedEventEnd`) |
| `done_ms` | stream `[DONE]` | Largest Contentful Paint `startTime` (`null` if unsupported) |

This mapping is deliberate, not a hack: it lets `AdminHealth`'s RUM table
reuse the exact same `aggregateStats()` p50/p95 aggregation chat rows use,
with `mode='page'` just being one more row in the same loop — no
page-specific branch in the dashboard.

## 6. Reading RUM next to synthetic numbers

`/admin/health` now has two independent sections reading the same table:

- **"الأداء حسب الوضع" / "آخر 20 عملية فحص"** — `source='synthetic'`.
  Controlled, scheduled, one fixed rotating question per mode, every 15
  minutes, from one region-pinned probe. This is your **floor** — what the
  backend does under no contention, no client-side network variance, no
  cold starts on the user's device.
- **"المستخدمون الحقيقيون"** (new) — `source='rum'`. Uncontrolled, real
  traffic, real questions, real devices/networks/browsers, real geography.
  This is what **users actually experience** — always the same or worse
  than the synthetic floor, never better on average (real requests carry
  real network variance the pinned probe doesn't see).

A useful read: if synthetic `p95` is flat but RUM `p95` climbs, the backend
itself is healthy and the regression is client-side or edge/CDN/regional
(worth cross-checking RUM's `region`/`المتصفح` (UA family) columns for a
pattern) rather than something `synthetic-probe`'s alerting would ever catch
— they watch different failure classes by design, and neither replaces the
other. Conversely, if BOTH move together, the backend itself regressed and
`synthetic-probe`'s own SLO alerts (`docs/launch/synthetic-probe-runbook.md`)
should already be firing.

Until `ChatInterface.tsx` is wired (Section 4), the RUM section will show
"لا توجد بيانات مستخدمين حقيقيين بعد" (no data yet) — this is expected, not
a bug in `perf-beacon` or the dashboard query.

## 7. Verification run this wave

```powershell
npx deno check supabase/functions/perf-beacon/index.ts
npx vitest run src/__tests__/perfBeacon.test.ts --pool=threads
npx tsc --noEmit -p tsconfig.app.json
```

`npm run build` was deliberately not run (out of scope for this change per
the build instructions — another agent may be mid-edit elsewhere in the
tree).
