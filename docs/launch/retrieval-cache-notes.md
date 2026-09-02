# Embedding + retrieval-result cache (D1) — notes

Module: `supabase/functions/fire-safety-chat/retrievalCache.ts` (new, unwired).
SQL: `docs/db/20260903_retrieval_cache.sql` (new, not applied to production by this task).
Tests: `src/__tests__/retrievalCache.test.ts`.
Flag: `RETRIEVAL_CACHE_ENABLED` (exact string `"1"`, default OFF — tracked in
`docs/launch/next-wave-progress.md`'s flag list).
Plan reference: `docs/launch/next-wave-plan-20260903.html`, item D1, wave 1.
Sibling item in the same wave: D2a (`docs/launch/context-cache-notes.md`)
caches the STATIC prompt contract via Gemini's own context-cache API — a
different layer of the same request, independently enable-able. D1 caches
the RETRIEVAL side (embeddings + match results); D2a caches the PROMPT side.
They do not overlap and are safe to enable independently or together.

Built by a builder sub-agent with no live Supabase/production DB access
(repo rule for this wave — see CLAUDE.md: "NEVER `supabase db push`",
production changes go through inspect → delta → idempotent migration →
owner-applied). The module is pure logic + a structural DB-client contract,
unit-tested against an in-memory fake client, and has never run against the
real `retrieval_cache`/`runtime_settings` tables or a real Supabase Pooler
connection. Every latency number below is a HYPOTHESIS derived from the
mechanism, not a measurement — read the labels before repeating one to
وسيم.

## What it caches, and what it does not

Two independent two-layer caches (in-memory LRU+TTL first, Postgres second):

1. **Query embeddings** — key = sha256(normalized text + embedding model
   id). Value = the raw float array. Avoids a Gemini `embedContent` call for
   a repeated/near-repeated question.
2. **Retrieval results** — key = sha256(embedding-key + sorted SBC codes +
   mode + flags-version + corpus_version). Value = the same object
   `fetchSBCContextVector` already returns (`context`, `files`, `sourceMeta`,
   `docIds`, `engine`, `graphExpansionCount`, `fallbackReason`), as JSON.
   Avoids the embedding call AND the `match_sbc_documents` RPC(s) AND graph
   expansion for a repeated query under the same corpus/flags state.

**Explicitly out of scope: the model's final answer.** An answer can carry
per-user context the retrieval layer never sees (`user_memory`, conversation
history, attached images), so caching an answer across users/conversations
would leak or misattribute that context. Nothing in this module stores or
returns an answer. See `retrievalCache.ts`'s "PRIVACY ARGUMENT" doc comment
for the full statement, and do not extend this module to answer-caching
without re-deriving that argument from first principles.

## Apply order

Per `docs/launch/next-wave-progress.md`'s SQL apply order: **perf_events →
hybrid FTS → retrieval_cache → building_profiles**. Concretely for this
file: apply `docs/db/20260903_retrieval_cache.sql` via the Management API
(never `supabase db push` — known migration drift, see CLAUDE.md) after
`docs/db/20260903_perf_events.sql` (A1) and `docs/db/20260903_hybrid_retrieval.sql`
(B1b) if both are being applied in the same session; it has no foreign-key or
other dependency on either, so on its own it may also be applied
independently at any time — the ordering above is the WAVE's convention, not
a requirement this file's SQL imposes.

The file is idempotent (`create table if not exists`, `insert ... on
conflict do nothing`) — safe to re-run, and re-running it will NEVER reset a
`corpus_version` / `retrieval_flags_version` value the owner has already
bumped past `'1'`.

## How to bump corpus_version after any ingest (single UPDATE)

```sql
update public.runtime_settings
set value = (value::int + 1)::text, updated_at = now()
where key = 'corpus_version';
```

Run this once, after any SBC ingest/re-ingest finishes (new code onboarded,
existing code re-chunked/re-embedded, `sbc_documents` rows changed under an
existing code). Effect: every existing `retrieval_cache` row — embedding
rows included, see `retrievalCache.ts`'s "corpus_version IS A GLOBAL CACHE
EPOCH" doc comment for why embeddings are covered too — stops being trusted
on its very next read. `getCorpusVersion`'s in-process memo is capped at 5
minutes (`CORPUS_VERSION_CACHE_TTL_MS`), so the change reaches every warm
isolate within that window without a deploy. The same one-line UPDATE against
`retrieval_flags_version` instead is the lever for "I changed the retrieval
PIPELINE's code (a regex fix, a context-format change, ...) in a way that
should invalidate cached results even though no env flag value changed" —
see the SQL file's own "HOW TO INVALIDATE" section for both statements
side by side.

Old rows are not deleted by either UPDATE — they simply stop matching and
age out via `expires_at` / `retrieval_cache_gc()`. That is intentional:
keeping them costs nothing (a mismatched `corpus_version` means they are
never served again) and eager deletion is `retrieval_cache_gc()`'s job, not
the invalidation statement's.

## Expected effect — HYPOTHESIS, not measured

**Target: retrieval ≤ 300ms on a cache hit**, derived from the mechanism,
not from a live run:

- A **memory hit** is a `Map` lookup in the same isolate — sub-millisecond,
  no network involved at all.
- A **DB hit** is a single point read on `retrieval_cache` by its primary
  key (`key text primary key`, no scan) — one indexed round trip, replacing
  what flag-ON retrieval otherwise pays for: one `embedContent` call to
  Gemini, one-or-more `match_sbc_documents` RPCs (plus, when
  `ADVISORY_MULTI_QUERY_RETRIEVAL_ENABLED` is on, per-sub-query embeddings
  and RPCs), and optionally a graph-expansion round trip
  (`sbc_xref_edges`/`sbc_xref_indegree`/`sbc_documents`). Even a slow single
  point read is very likely still faster than that whole chain.

**The 300ms target assumes the request is already region-pinned** — this
repo's own prior measurement (`project_performance_wave.md`,
2026-09 speed wave) found cross-region execution added roughly 10 seconds to
this exact function (12.2s -> 2.2s after `x-region` pinning), i.e. network
RTT to the database/runtime dominates far more than any single query's own
cost. A cache hit computed from an UNPINNED isolate could still be slow in
absolute terms — not because the cache is doing extra work, but because
everything this function does (cached or not) inherits whatever the
region-pinning state already costs. This module does not change that; it
only removes retrieval-specific work that used to run IN ADDITION to it.

Verify for real once wired and flagged on: log a per-call timing (own
`X-Timing`-style stage, mirroring D2a's `contextCacheStats()` precedent) that
separates "cache lookup" from "compute (embedding + RPCs)" so a hit-rate and
a real p50/p95 hit latency are both visible from production traffic, not
assumed from this note.

## Invariant: cached == uncached, for the same corpus_version

**Cached retrieval results must be byte-identical to what `compute()` would
have returned uncached, for the same corpus_version.** This holds by
construction, not by re-verification at read time:

- `getRetrievalCached`/`getEmbeddingCached` never transform `compute()`'s
  return value before storing or after loading it — the exact object/array
  that would have been returned on a miss is what a hit returns.
- A hit is only ever served when `expires_at` is in the future AND the
  row's `corpus_version` equals the CURRENT `runtime_settings.corpus_version`
  (re-checked on every DB hit, not just trusted from the key — see
  `retrievalCache.ts` for why the check is independent of the key hash).
  Any mismatch is treated as a miss and recomputed.
- All DB failures fail OPEN to `compute()` (never fail closed to a stale or
  synthesized value) — see the module's own "All DB failures are fail-open"
  contract, unit-tested in `src/__tests__/retrievalCache.test.ts`.

What this invariant does NOT cover: two different `compute()` closures
passed under the SAME key (a caller bug — e.g. building the same keyParts
for two semantically different retrievals) will collide and one will shadow
the other. This is why the module doc comment is explicit about the exact
key recipe the caller must follow, and it is the integrator's responsibility
at wiring time, not something this module can detect from the inside.

## Fail-open guarantee

Every DB read is wrapped in try/catch and falls through to `compute()` on
any error (missing table before this SQL is applied, network failure,
malformed row). Every DB write is fire-and-forget (`void (async () => {
try {...} catch {} })()`) — a write failure is swallowed and never surfaces
to the caller, who already has its value from `compute()`. `getCorpusVersion`
itself fails open to `1` on any error. The worst case of every failure mode
here is "behaves exactly like the flag was off" (recompute every time,
possibly logging errors) — never a wrong, stale, or missing retrieval
result. This is the same fail-open discipline `retrievalPolicy.ts`'s
similarity floor and `graphExpansion.ts`'s expansion attempt already use in
this file's neighborhood.

## Gating plan — do not flip the flag on without this

1. **Apply the SQL** (see "Apply order" above) — before this, the flag must
   stay OFF; every DB call in this module would hit "relation does not
   exist" and fail open to always-recompute, which is safe but pointless.
2. **Wire it in** (wave 2 integration per `next-wave-progress.md`, not this
   task — see this task's report for the exact pseudo-diff) behind
   `RETRIEVAL_CACHE_ENABLED`, default OFF, so merging this module changes
   nothing by default.
3. **Deploy with the flag OFF.** Confirm `npx deno check`, the full
   `src/__tests__` suite, and `npm run build` all still pass, and that a
   normal request is byte-identical to before (no `getEmbeddingCached` /
   `getRetrievalCached` call should even be reachable while the flag reads
   off).
4. **Flip the flag on for a small slice first** (owner-only smoke, or a
   staging project if one exists) and confirm the 43-question advisory
   benchmark (`evals/run_advisory_benchmark.ts`) run flag-ON matches the most
   recent flag-OFF baseline on tier-A metrics (exact-section match, hallucination
   rate, zero `safety_critical` regressions) — this is the direct test of
   the "cached == uncached" invariant above against real questions, not just
   the unit tests' synthetic fixtures.
5. **Run the production probe** (`synthetic-probe`, item A1 in this same
   wave) before/after across all three modes, and log the cache lookup vs.
   compute timing split described in "Expected effect" above so the hit
   rate and the real latency delta are both visible from production, not
   assumed from this note.
6. **Bump `corpus_version`** as part of the standard SBC-ingest runbook from
   this point forward (add the one-line UPDATE above to whatever ingest
   script/checklist currently exists) — forgetting this step is the one way
   this cache could serve genuinely stale content, and it degrades silently
   (wrong-but-plausible answers, not an error) rather than loudly.

## Owner-facing risk statement

- **Blast radius if wrong:** bounded by design — fail-open everywhere (see
  above). The realistic failure mode is not an outage; it is either (a) the
  cache quietly never hits (caught by a hit-rate metric staying at 0, same
  observability posture D2a's `contextCacheStats()` already established for
  its own cache) or (b) a hit rate that looks healthy but is serving
  content from a corpus_version the owner forgot to bump after an ingest —
  which step 6 above turns into a checklist item rather than a silent trap.
- **No production database change from this task.** `docs/db/20260903_retrieval_cache.sql`
  exists but is NOT applied by this task — applying it is an owner/orchestrator
  action per CLAUDE.md's schema-change contract.
- **No secret handling change.** Uses the same service-role admin client
  index.ts already constructs; no new credential, no new scope.
- **RLS:** `retrieval_cache` and `runtime_settings` are both RLS-enabled with
  zero policies (service-role only) — no anon/authenticated path can read or
  write either table. See the SQL file's own comments for the explicit
  `REVOKE` defense-in-depth.
- **Reversible with zero deploys:** unset `RETRIEVAL_CACHE_ENABLED`. Rows
  already in `retrieval_cache` are inert once nothing reads them and expire
  on their own `expires_at` / via `retrieval_cache_gc()`.
- **Recommendation:** do not enable in production before step 4 (the
  43-question benchmark, flag-ON) has run at least once and shown no tier-A
  regression, and before `corpus_version` bumping is actually added to the
  ingest runbook (step 6) — the cache is only as safe as that habit.
