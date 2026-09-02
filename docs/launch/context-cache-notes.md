# Gemini context caching (D2a) — notes

Module: `supabase/functions/fire-safety-chat/geminiContextCache.ts` (new, unwired).
Tests: `src/__tests__/geminiContextCache.test.ts`.
Flag: `GEMINI_CONTEXT_CACHE_ENABLED` (exact string `"1"`, default OFF — see
`docs/launch/next-wave-progress.md`'s flag list).
Plan reference: `docs/launch/next-wave-plan-20260903.html`, phase D2, session 5.

Built by a builder sub-agent with no live Gemini API key (repo rule). The
module is pure logic, unit-tested against a mocked `fetch`, and has never
been exercised against the real `cachedContents` endpoint. Everything below
about the live API's exact behaviour is labelled per CLAUDE.md's
CONFIRMED / LIKELY / HYPOTHESIS / UNKNOWN / NOT VERIFIED discipline — read
those labels before trusting a number.

## What it caches

Only the STATIC per-mode system contract — the output of `getPrimaryPrompt()`
/ `getStandardPrompt()` / `getAnalysisPrompt()` in `./promptContract.ts`.
That text is deterministic for a given (mode, language, enabled new source
codes) and identical across every request until the owner edits a prompt or
flips a source-code flag. It is also, by a wide margin, the majority of
prompt bytes on a typical advisory/analysis request — the retrieved SBC
context and the machine-extracted facts are the part that legitimately
changes every request and stays uncached.

## Expected effect — NOT VERIFIED for this workload

Google documents context caching as cutting time-to-first-token and billing
the cached portion of input tokens at a large discount relative to
uncached input tokens on a cache hit, plus a separate per-hour storage
charge for whatever is currently cached (HYPOTHESIS: the exact discount
percentage and storage rate are UNKNOWN here — this doc deliberately does
not repeat a specific number from memory; read the current Gemini API
pricing page at enable time, not this note, before making a cost claim to
the owner).

What we can say with more confidence, CONFIRMED from this repo's own
measurements (see `project_performance_wave.md` / the 2026-09-02 speed
wave commits): time-to-first-byte on this endpoint is dominated by (a) model
selection/fallback round-trips and (b) how much the model has to read before
it can start generating. A cache hit does not change (a) at all — it is
orthogonal to `buildModelChain` / `fetchAvailableGeminiModels`. It plausibly
helps (b) for standard/analysis mode, where the static contract is tens of
thousands of characters read on every request today. Primary mode's prompt
(`getPrimaryPrompt()`) is much shorter, already latency-optimized via
minimal-thinking (see `geminiResilience.ts`'s thinking-effort control), and
is the mode where a fixed per-request cache-lookup round-trip is most likely
to be a net loss rather than a win — this needs to be measured, not assumed,
per mode.

## Storage cost vs. traffic — the actual trade-off to weigh

Context caching is not free while idle: a cached object costs money for
every hour it exists, independent of whether any request reuses it. The
TTL (`DEFAULT_CONTEXT_CACHE_TTL_SECONDS = 3600`, i.e. 1 hour, matching the
plan doc's "TTL in hours") is the knob that trades this off:

- Short TTL -> less idle storage cost, but more `creates` relative to `hits`
  (`contextCacheStats()` — log both into the X-Timing/perf event so this is
  visible per mode, not guessed at).
- Long TTL -> fewer creates, more idle storage cost during low-traffic
  windows (nights, low season).

Because the registry is per-isolate (module-level `Map`, not persisted),
a cold isolate always starts with zero cache hits regardless of TTL — how
much this matters depends on isolate reuse patterns under the actual
Supabase Edge Functions runtime, which this module cannot observe from
inside a unit test. `contextCacheStats().hits / (creates + hits)` measured
against real traffic after enabling (see gating plan) is the only reliable
way to know whether a given TTL is paying for itself.

## API-shape uncertainty (see inline code comments for detail)

Three assumptions in `geminiContextCache.ts` are unverified against a live
key and are exactly what live testing under the gating plan below must
confirm before the flag ships on for real users:

1. The `v1beta/cachedContents` create request shape:
   `{model: "models/{id}", systemInstruction, ttl: "{n}s"}` and response
   `{name, expireTime?}`.
2. That a `generateContent`/`streamGenerateContent` call setting
   `cachedContent` cannot also set `systemInstruction` — this is why
   `buildRequestWithCache` moves the per-request dynamic system text
   (retrieved context, user-memory block, retry validation prompt) into a
   leading synthetic `contents` turn instead of trimming and resending it as
   `systemInstruction`. If this assumption is wrong, `buildRequestWithCache`
   is the one function to change; every caller already goes through it.
3. The exact wording Gemini uses to reject an under-minimum-token cache
   create (`looksLikeTooShortRejection`'s heuristic match). Getting this
   wrong only costs a periodic wasted create call every 10 minutes for a
   mode whose static contract turns out to be under the real minimum — it
   never breaks a chat request (see "fail-open" below).

## Fail-open guarantee

Every exported function either cannot throw (pure, synchronous) or is
wrapped so that any failure — network, malformed JSON, an unexpected
response shape, the flag being off — returns `null`/`false`/the input
unchanged rather than propagating. A cache bug degrades this feature back to
"send the full prompt like today," never to a broken or slower-failing chat
response. This is why the flag is safe to flip on in production before every
uncertainty above is resolved: the worst case of assumption 1 or 3 being
wrong is "the cache is never actually used" (creates keep failing, `hits`
stays 0), not an outage. Assumption 2 being wrong is the one case worth
catching before wide rollout, because a wrong field layout could produce a
response that streams but has silently lost the dynamic system instructions
(degraded answer quality, not a hard failure) rather than an obviously
failing request — which is exactly why the gating plan below scores answer
quality, not just uptime.

## Gating plan — do not flip the flag on without this

1. **Wire it in** (wave-2 integration, not this task — see the task report's
   pseudo-diff) behind `GEMINI_CONTEXT_CACHE_ENABLED`, default OFF, so
   merging this module changes nothing by default.
2. **Deploy with the flag OFF.** Confirm `npx deno check` and the full
   verification gate pass, and that a normal request is byte-identical to
   before (no `ensureContextCache` call should even be reachable — see
   `isContextCacheEnabled`'s "flag off, no fetch" contract, unit-tested).
3. **Flip the flag on in a non-production project first if one exists,
   otherwise stage behind a small percentage / owner-only smoke test** —
   the create/reuse/refresh assumptions above are precisely the kind of bug
   that a single manual chat message will not catch (a manual tester will
   not notice if the dynamic system instruction silently stopped reaching
   the model on a cache hit; the answer just gets quietly worse).
4. **Run the 43-question advisory benchmark** (`evals/run_advisory_benchmark.ts`,
   see `evals/results/README.md`) in live mode against the flag-on
   deployment, standard and analysis modes (primary is a fixed 2-question
   smoke check in that same run). Compare tier-A metrics (exact-section
   match >= 60%, hallucination rate <= 5%, zero `safety_critical`
   regressions) against the most recent flag-OFF baseline in
   `evals/results/`. A regression here is the direct, measurable signal that
   assumption 2 (the field-layout guess) silently dropped the dynamic
   system instructions on a cache hit.
5. **Run the production probe** (`synthetic-probe`, wave-1 item A1) across
   all three modes before/after, comparing `X-Timing` first-byte and total
   latency, and log `contextCacheStats()` (creates/hits/fallbacks) per mode
   into `perf_events` so the hit rate and the actual TTFT delta are both
   visible, not assumed from the benchmark run alone.
6. **Only after both (4) shows no regression and (5) shows a real TTFT
   win** for a mode, keep the flag on for that mode; otherwise roll back
   (unset the env var — no code change, no deploy) and record why in this
   file.

## Owner-facing risk statement

- **Blast radius if wrong:** bounded by design (fail-open everywhere — see
  above). The realistic failure mode is not an outage; it is either (a) the
  feature quietly does nothing (cache never hits, no speed/cost benefit,
  caught by `contextCacheStats()` staying at `hits: 0`) or (b) — only if
  the field-layout guess in assumption 2 is wrong and somehow does not
  surface as an error the fallback protocol catches — an answer that is
  missing retrieved context or personalisation on some fraction of cached
  requests, which is exactly what step 4 of the gating plan is designed to
  catch before this reaches real users.
- **No production database or schema change.** This feature has no SQL, no
  migration, and stores nothing outside the running Edge Function process
  (an in-memory `Map`, cleared on every cold start).
- **No secret handling change.** Uses the existing `GEMINI_API_KEY` the
  chat endpoint already holds; no new credential.
- **Reversible with zero deploys:** unset `GEMINI_CONTEXT_CACHE_ENABLED`.
- **Recommendation:** do not enable in production before step 4 (the
  43-question benchmark, live mode) has run at least once against the
  flag-on deployment and shown no tier-A regression.
