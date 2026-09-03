# Gemini context caching (D2a) — notes

Module: `supabase/functions/fire-safety-chat/geminiContextCache.ts`.
Wired into: `geminiResilience.ts` (request body + fallback) and `index.ts`
(one guarded call per model in the chain) — see "Wiring" below.
Tests: `src/__tests__/geminiContextCache.test.ts` (module),
`src/__tests__/geminiResilience.test.ts` (the binding + fallback),
`src/__tests__/contextCacheWiring.test.ts` (the wiring and the flag-off
byte-identity proof).
Flag: `GEMINI_CONTEXT_CACHE_ENABLED` (exact string `"1"`, default OFF — see
`docs/launch/next-wave-progress.md`'s flag list).
Plan reference: `docs/launch/next-wave-plan-20260903.html`, phase D2, session 5.

The module was BUILT by a sub-agent with no live Gemini API key (repo rule),
so every request/response-shape claim started as HYPOTHESIS. The wire shape
has since been measured against the real endpoint from
`supabase/functions/gemini-diag` — see "Live shape check" below; what remains
unverified is now a much shorter list, and everything here stays labelled per
CLAUDE.md's CONFIRMED / LIKELY / HYPOTHESIS / UNKNOWN / NOT VERIFIED
discipline. Read those labels before trusting a number. No live measurement of
LATENCY or COST for this workload exists yet — that is the gate below.

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

Of the three assumptions this module was built on, the first two are now
CONFIRMED against the live endpoint (see "Live shape check"); only the third
is still open:

1. CONFIRMED — the `v1beta/cachedContents` create request shape
   `{model: "models/{id}", systemInstruction, ttl: "{n}s"}` and response
   `{name, model, expireTime, usageMetadata}`.
2. CONFIRMED — a `streamGenerateContent` call setting `cachedContent` cannot
   also set `systemInstruction`. This is why `buildRequestWithCache` moves the
   per-request dynamic system text (retrieved context, user-memory block,
   retry validation prompt) into a leading synthetic `contents` turn instead
   of trimming and resending it as `systemInstruction`. It remains the one
   function to change if the layout is ever revisited; every caller goes
   through it.
3. UNKNOWN — the exact wording Gemini uses to reject an under-minimum-token
   cache create (`looksLikeTooShortRejection`'s heuristic match); the probe
   never provoked it, because the ~1,536-token prefix it sent was accepted.
   Getting this wrong only costs a periodic wasted create call every 10
   minutes for a mode whose static contract turns out to be under the real
   minimum — it never breaks a chat request (see "fail-open" below).

Also still HYPOTHESIS (unprobed, and cheap either way): the synthetic
`"Understood."` model turn that `buildRequestWithCache` inserts after the
dynamic-context user turn. It exists so the request never depends on the API
tolerating two consecutive `user` turns; it costs a handful of tokens.

## Fail-open guarantee

Every exported function either cannot throw (pure, synchronous) or is
wrapped so that any failure — network, malformed JSON, an unexpected
response shape, the flag being off — returns `null`/`false`/the input
unchanged rather than propagating. A cache bug degrades this feature back to
"send the full prompt like today," never to a broken or slower-failing chat
response. This is why the flag is safe to flip on in production before every
uncertainty above is resolved: the worst case of assumption 3 being wrong is
"the cache is never actually used" (creates keep failing, `hits` stays 0), not
an outage. Assumption 2 — the field layout — is the one that could have
produced a response that streams but has silently lost the dynamic system
instructions (degraded answer quality, not a hard failure) rather than an
obviously failing request. It is now CONFIRMED correct against the live API,
which removes the mechanism but not the need to measure: the gating plan below
still scores answer quality, not just uptime, because a prefix-boundary
mistake in `index.ts` (a `staticPromptPrefix` that is no longer a leading
substring) would look exactly the same from outside. That specific mistake
also fails open — `extractDynamicSystemText` resends the whole system text —
and is pinned by `contextCacheWiring.test.ts`.

## Gating plan — do not flip the flag on without this

1. ~~**Wire it in**~~ DONE 2026-09-03 behind `GEMINI_CONTEXT_CACHE_ENABLED`,
   default OFF, so merging changes nothing by default — see "Wiring" below
   for what was wired and what guards it.
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

The order of (4) and (5) is deliberately INVERTED in the "flag-on gate"
section below, now that the wiring exists: the probe is minutes and a handful
of requests, the benchmark subset is 13 questions across two modes. Run the
cheap latency check first, because a mode where caching costs first-byte time
is disqualified before anyone spends benchmark budget scoring its answers.

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

---

## Live shape check — 2026-09-03 (CONFIRMED)

Measured by the orchestrator from `supabase/functions/gemini-diag`
(`{action: "cachetest"}`, model `gemini-3.7-flash`) against the production
key. No builder sub-agent held the key; this section records what the probe
returned, not what the docs promise.

| Call | Sent | Result |
|---|---|---|
| `POST v1beta/cachedContents` | `{model:"models/gemini-3.7-flash", systemInstruction:{parts:[{text}]}, ttl:"600s"}`, prefix approx. 1,536 tokens | **200** — `{name:"cachedContents/...", model, expireTime, usageMetadata.totalTokenCount}` |
| `POST ...:streamGenerateContent` | `cachedContent` + `contents`, **no** `systemInstruction` | **200** — streams normally |
| `POST ...:streamGenerateContent` | `cachedContent` **and** `systemInstruction` | **400 INVALID_ARGUMENT** — "CachedContent can not be used with GenerateContent request setting system_instruction, tools or tool_config. Proposed fix: move those values to CachedContent" |
| `DELETE cachedContents/<name>` | — | **200** |

What this settles:

- The create body `geminiContextCache.ts` builds is the body the API accepts,
  including the `models/` resource prefix and the protobuf Duration `ttl`
  string. The response really does carry `name` and `expireTime`, so the
  registry's "prefer the server's expiry" branch is exercised in production,
  not just in a unit test.
- `buildRequestWithCache`'s layout is CONFIRMED CORRECT, not merely plausible:
  dropping `systemInstruction` and carrying the dynamic remainder as a leading
  `contents` turn is the ONLY layout the API accepts once `cachedContent` is
  set. Had the module trimmed `systemInstruction` and sent it alongside the
  cache, every flag-on request would be a hard 400.
- A `cachedContents` object is deletable, so a future explicit-eviction path
  (not built — the module only forgets locally and lets the TTL expire the
  server-side object) is available if idle storage cost ever justifies it.

What it does NOT settle: the ~1,536-token prefix was accepted, so the
minimum-token rejection wording (point 3 above) was never provoked; and
nothing about latency or cost for THIS workload — the probe measured shape,
not speed.

## Wiring (D2, 2026-09-03)

Three files, one flag, one new await on the first-byte path.

**`index.ts` — the static/dynamic boundary.** A single `staticPromptPrefix`
variable, declared `""` next to `fullSystemPrompt`, records the leading run of
system bytes that is request-invariant for a given (mode, language,
`enabledNewSourceCodes()`):

- primary: the whole `getPrimaryPrompt()` output (nothing is appended to it);
- standard/analysis: `basePrompt` (`getStandardPrompt()` /
  `getAnalysisPrompt()`), extended by `CITATION_TOKEN_CONTRACT` **only** when
  that constant landed directly after it — when the machine-facts block
  (`queryFacts`) was inserted in between, the prefix stops at `basePrompt`;
- vision: left `""`, so vision requests are never cached (their prompt is
  assembled around the user's query and has no invariant prefix).

The invariant everything rests on: `staticPromptPrefix` is always a LEADING
SUBSTRING of the assembled `systemInstruction`, because `convertToGeminiFormat`
joins the system messages in order with a blank line and `fullSystemPrompt` is
always the first of them. `extractDynamicSystemText` slices it off the front;
if it ever stopped being a prefix, that function fails open by treating the
whole text as dynamic (the static contract is paid for twice for that one
request — never dropped). The variable is bookkeeping only: it is never
concatenated into `fullSystemPrompt`, which `contextCacheWiring.test.ts`
enumerates and pins (all four writes to it, and zero reads into the prompt).

**`index.ts` — the flag.** `const contextCacheOn = isContextCacheEnabled(Deno.env.get)`
is read once, above the model-chain loop. Inside the loop, per model:
`if (contextCacheOn) { ... await ensureContextCache(key, model, mode, staticPromptPrefix, Deno.env.get, DEFAULT_CONTEXT_CACHE_TTL_SECONDS) ... }`,
then one log line `[ContextCache] mode=<mode> hit|create|fallback model=<model> prefix=<n>ch name=<...>`
(the outcome is derived from `contextCacheStats()` before/after, not guessed)
and `markStage("context_cache")`, which surfaces the added latency in the
existing `X-Timing` header and `[Timing]` log rather than hiding it.
Resolution is inside the loop because Gemini binds a cached object to ONE
model: falling through to the next model in the chain must not reuse the
previous model's cache.

**`geminiResilience.ts` — the request and the fallback.**
`fetchGeminiStreamWithRetry` takes one new, LAST, optional parameter
(`cacheRef: GeminiCacheBinding | null = null`; the binding is the ref plus the
mode, which travels only so `forgetContextCache(model, mode)` can be called).
Each attempt builds the same `{systemInstruction, contents, generationConfig}`
literal as before and then, only if a cache is active, passes it through
`buildRequestWithCache`. When a cached attempt fails and
`shouldRetryWithoutCache(status, text)` is true (a 404, or a 400 naming the
cache), the binding is dropped, `forgetContextCache` +
`recordContextCacheFallback` run, and the SAME attempt is retried uncached: no
attempt consumed, no breaker failure recorded (the provider did not fail — our
reference did), and the branch is unreachable afterwards, so it fires at most
once per call. The thinking-shape discovery branch, the circuit breaker and
`fetchGeminiNonStreamingWithRetry` are untouched.

**Why flag-OFF is byte-identical.** With the flag off, `contextCacheOn` is
false, so the guarded block never runs and `null` is passed down; with `null`,
`fetchGeminiStreamWithRetry` serializes `baseBody` — the same object literal,
same three properties, same insertion order as before D2 — so
`JSON.stringify` produces the same characters. That is not an argument on
paper: `contextCacheWiring.test.ts` EXECUTES the helper with the argument
omitted and with an explicit `null`, and asserts both bodies equal the
hand-written pre-D2 string, then asserts a binding does change it (so the
comparison is not vacuous). The index.ts half — that no new `await` exists
outside the one flag guard — is asserted structurally, since index.ts cannot
be imported under vitest.

## Flag-on gate — the exact steps, in this order

Nothing below has been run. Each step is cheap-before-expensive, and any step
failing means unset the env var (no deploy, no code change) and record why
here.

1. **Deploy with the flag OFF** and confirm a normal request is unchanged.
   `[ContextCache]` must appear ZERO times in the function logs, and
   `X-Timing` must carry no `context_cache=` entry.
2. **Set `GEMINI_CONTEXT_CACHE_ENABLED=1`** on the `fire-safety-chat`
   function only.
3. **Probe first-byte per mode** (`synthetic-probe`, wave-1 item A1) — the
   cheap check, run FIRST. For each of `primary`, `standard`, `analysis`, run
   several requests back to back and read `X-Timing`:
   - the first request of a (mode, model) pair pays a create round-trip and
     should log `create`; subsequent ones within the hour should log `hit`;
   - compare `gemini_connect` and total first-byte against the flag-OFF run
     for the same mode. A mode whose first byte gets SLOWER is disqualified
     immediately — the likely case is `primary`, whose contract is short and
     which is already minimal-thinking optimized; it can stay uncached while
     standard/analysis keep the flag.
   - `hits / (creates + hits)` from the `[ContextCache]` lines is the isolate
     reuse rate; if it stays near zero, isolates are too short-lived for
     caching to pay for itself at ANY TTL, and the answer is to stop here.
4. **Score answer quality on the 13-question benchmark subset** — only for
   modes that survived step 3. This is the check that catches the one
   dangerous failure mode: a cached request that streams fine but silently
   lost the dynamic system text.

   ```
   CONSULTX_EVAL_SUBSET=ADV-001,ADV-009,ADV-013,ADV-014,ADV-017,ADV-018,ADV-019,ADV-020,ADV-030,ADV-031,ADV-032,ADV-041,ADV-042
   deno run -A evals/run_advisory_benchmark.ts
   ```

   Artifacts land in `evals/results/<date>-subset/`. Compare against
   `evals/results/2026-09-02-subset/` (the most recent flag-OFF subset run on
   the same 13 ids) — same ids, same modes, so the two reports are directly
   comparable. Any drop in exact-section match, any rise in hallucination
   rate, or any new `safety_critical` failure is a STOP: it is the signature
   of dynamic instructions not reaching the model.
5. **Cost.** Read the current Gemini pricing page at enable time (this file
   deliberately quotes no rate) and combine it with the measured
   `contextCacheStats()` counters: `creates` times the cached-prefix token
   count gives the storage exposure per TTL window, `hits` times the same
   count gives the discounted input volume. With a `hits`-to-`creates` ratio
   below roughly 1:1 the feature is paying storage rent for objects almost
   nobody reuses — shorten the TTL or turn it off for that mode.
6. **Full 43-question benchmark** before the flag is considered permanent for
   a mode, not before it is first enabled. The subset in step 4 is the gate;
   the full run is the record.
