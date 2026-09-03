# Hybrid Retrieval (B1b) — Apply, Wire, Gate

**Date:** 2026-09-03 · **Scope:** Postgres full-text search (tsvector/GIN, Arabic-normalized)
fused with the existing pgvector similarity search via Reciprocal Rank Fusion (RRF), for the
advisory (`standard`/`analysis`) retrieval path.

**Status: UNWIRED.** Everything this document describes is provisioned, not live. Applying the
SQL makes a new RPC *callable*; it changes nothing a user can observe. Nothing observable changes
until a separate wiring change calls `fetchSBCContextHybrid` from inside `index.ts` AND the owner
sets `ADVISORY_HYBRID_RETRIEVAL_ENABLED=1` on the deployed function. Both are still pending as of
this document (see `docs/launch/next-wave-progress.md`, item B1b: "hybrid FTS + vector RRF (SQL +
Deno module, unwired)").

Files this covers:
- `docs/db/20260903_hybrid_retrieval.sql` — the SQL the owner applies by hand (never
  `supabase db push` — CLAUDE.md hard rule; this repo has known migration drift).
- `supabase/functions/fire-safety-chat/hybridRetrieval.ts` — `fetchSBCContextHybrid` and its pure
  helpers (`sbcNormalizeAr`, `reciprocalRankFusion`, `buildHybridContext`,
  `isHybridRetrievalEnabled`). Zero callers today.
- `src/__tests__/hybridRetrieval.test.ts` — 64 tests covering normalization, RRF ordering/tie-break,
  row-to-context mapping, and the fail-open contract, all against pure logic or a fake Supabase
  client — none of this exercises a live database. `npx vitest run` and `npx deno check` are both
  green as of this document; neither proves the live SQL applies cleanly or that
  `public.match_sbc_hybrid` behaves as designed against production data — that is exactly what
  Section 3's gate is for.

---

## 1. What وسيم runs (SQL)

In the Supabase SQL Editor, paste and run `docs/db/20260903_hybrid_retrieval.sql` in full (it is
one file, idempotent, safe to re-run). It creates, in order:

1. `pg_trgm` extension (provisioned for a possible future fuzzy-match feature; not used by
   anything in this file — see the SQL file's own header for why no trigram index is built).
2. `public.sbc_normalize_ar(text)` — Arabic-aware normalization (diacritics, tatweel, letter-variant
   folding, punctuation, whitespace). IMMUTABLE.
3. `public.sbc_to_tsvector_simple(text)` — IMMUTABLE wrapper needed because `to_tsvector(regconfig,
   text)` is STABLE in Postgres and a generated column requires an IMMUTABLE expression.
4. `public.sbc_documents.tsv` — a new **generated, stored** `tsvector` column (guarded by a DO block
   that checks `information_schema.columns` first, so a re-run is a no-op).
5. `idx_sbc_documents_tsv` — GIN index on `tsv`.
6. `public.match_sbc_hybrid(...)` — the fused RPC. `SECURITY INVOKER`, `service_role`-only
   (REVOKE from `PUBLIC`/`anon`/`authenticated`, GRANT to `service_role`, mirroring
   `match_sbc_documents_v2`'s hardened posture, not the older unrestricted v1).
7. Grants (Section 7 of the SQL file).
8. `NOTIFY pgrst, 'reload schema'` — without this the RPC is invisible to supabase-js as `PGRST202`
   until PostgREST's schema cache next refreshes on its own.

**Sequencing with the rest of this wave** (`docs/launch/next-wave-progress.md`): apply after
`20260903_perf_events.sql`, before `20260903_retrieval_cache.sql`. Nothing in this file depends on
either — that is the orchestrator's rollout order, not a hard dependency.

**Post-apply sanity checks** (run manually in the SQL Editor, both are in the SQL file's own header
too):

```sql
select public.sbc_normalize_ar('الأَمان في نظام السَّلامة  من  الحريق (903.2.11.3)');
-- expect: 'الامان في نظام السلامه من الحريق 903.2.11.3'

select count(*), count(tsv) from public.sbc_documents;
-- expect both counts equal
```

If the normalized string does not match, or the two counts differ, **stop** — do not proceed to
wiring or gating. Something about the live corpus (an unexpected null `content`, a locale
difference in `[:alnum:]` classification, etc.) needs to be understood first.

## 2. Expected backfill time (Section 4 — the generated column)

Adding a `STORED` generated column to an existing table is a full-table rewrite under an
`ACCESS EXCLUSIVE` lock — every row is read, `sbc_to_tsvector_simple(content)` is computed, and the
whole row (including the existing 768-dim `embedding` vector, not just the new column) is rewritten.

**Estimate (HYPOTHESIS — not measured against production; no live DB access from this build
session):** at ~5,600 rows, average row size on the order of a few KB (content text + a ~3KB
768-dim vector + metadata), total table size is in the tens of megabytes. Table rewrites at that
size are normally single-digit-to-low-tens-of-seconds on any Supabase compute tier, not minutes.

Do not take this as a guarantee. Concretely:
- Run it in a low-traffic window anyway — the lock is brief either way, but this is a zero-cost
  precaution, not a hard requirement at this estimated duration.
- The SQL Editor shows the actual statement duration when SECTION 4 runs — record it. If it runs
  materially longer than expected (minutes, not seconds), stop and investigate before continuing
  (a longer-than-expected rewrite is itself a signal something about the live table differs from
  what this estimate assumed — e.g. a much larger corpus than ~5,600 rows, or contention from a
  concurrent write).
- **Operational gotcha, worth knowing before it surprises anyone later:** if `sbc_normalize_ar`'s
  logic is ever edited after this ships, already-stored `tsv` values do **not** recompute
  automatically (`STORED` generated columns compute at INSERT/UPDATE time only). A future logic
  change needs a forced rewrite (e.g. `UPDATE public.sbc_documents SET content = content;`) to reach
  existing rows.

## 3. Wiring (owned by the wave-2 integrator, not this file — described so it is unambiguous)

`fetchSBCContextHybrid(query, embedding, codes, matchCount, client)` in
`hybridRetrieval.ts` returns `Promise<HybridRetrievalResult | null>`. `null` means exactly "hybrid
could not help this request for any reason — keep the current path" (RPC not applied yet, any other
RPC error, or zero rows). It is designed as an ADD-ON check inside `fetchSBCContextVector`
(`index.ts`), after query embedding succeeds and before/instead of the plain `match_sbc_documents`
call, e.g.:

```
if isHybridRetrievalEnabled(Deno.env.get):
    hybrid = await fetchSBCContextHybrid(query, queryEmbedding, filterCode ? [filterCode] : null, matchCount, supabaseAdmin)
    if hybrid is not null:
        engine = "hybrid"; use hybrid.{context, files, sourceMeta, docIds}
        # skip the existing match_sbc_documents call entirely — hybrid already includes vector signal
    else:
        # fall through to today's unchanged vector/keyword path — no behaviour change
```

Notes for whoever wires this in:
- `codes` is plural (`string[] | null`) — today's single `filterCode: string | null` needs wrapping
  as `filterCode ? [filterCode] : null` for behavioural parity; passing multiple codes (e.g. from
  `detectFilterCodesFor`) is a real, available enhancement, not required for parity.
- `HYBRID_RETRIEVAL_FLAG_ENV` / `isHybridRetrievalEnabled` are already exported from
  `hybridRetrieval.ts` — import them rather than re-deriving the exact-`"1"` check.
- `VectorRetrievalResult.engine` (`index.ts`) is currently typed `"vector" | "keyword"`
  (`RetrievalEngine` in `retrievalPolicy.ts`) and will need widening to include `"hybrid"` wherever
  it is declared/consumed (response header/event, any bench-report column that reads it).
- Consider adding a row for `ADVISORY_HYBRID_RETRIEVAL_ENABLED` to
  `docs/advisory-brain-runbook.md`'s flag-order table once wired — that document is this
  codebase's single source of truth for flag rollout order and is not edited by this change (out of
  this task's file ownership).

## 4. How to gate — before enabling `ADVISORY_HYBRID_RETRIEVAL_ENABLED` anywhere real

Per `docs/advisory-brain-runbook.md` Section 1 (binding for every `ADVISORY_*` flag in this stack):
no flag flip without a live bench run, flags stay OFF by default, any regression on a
`safety_critical: true` question is a stop not a trade-off, and a negative result is a valid result.

**Run both before wiring (baseline) and again after wiring + flag ON (comparison):**

1. **The 43-question advisory bench** (`evals/advisory_benchmark.jsonl` via
   `evals/run_advisory_benchmark.ts`) — live run per `docs/advisory-brain-runbook.md` Section 4:
   ```
   CONSULTX_EVAL_LIVE=1 CONSULTX_EDGE_URL=... CONSULTX_SERVICE_KEY=... SMOKE_USER_ID=... \
   npx deno run --allow-read --allow-write --allow-env --allow-net \
     evals/run_advisory_benchmark.ts
   ```
   Output lands in `evals/results/{YYYY-MM-DD}/`. Keep both the baseline (flag OFF, or pre-wiring)
   and comparison (flag ON) directories — do not overwrite.

2. **The 36-question new-source-codes gate** (`docs/launch/new-source-codes-gate-20260831.md` —
   18 SBC401 + 18 SBC501 questions, each with a documented ground-truth section/content and source
   page, plus 2 negative-control questions per code that must produce an explicit refusal). That
   file is the question source only; running it live is the evals/scripts lane's responsibility per
   its own protocol note — coordinate rather than re-deriving a runner here.

**Success criteria for this specific change** (below/above **baseline**, not absolute thresholds,
except where the gate document already states one):

| Metric | Source | Bar |
|---|---|---|
| Exact-section match rate ("Sections found" column) | 43-question bench `report.md`, tier-A aggregate | **>= baseline** (hybrid must not regress section recall — it may help, must not hurt) |
| `below_floor` fallback rate | 43-question bench per-row `X-Retrieval-Fallback` / `headers.fallback_reason` breakdown | **halves** vs. baseline — the whole thesis of adding an FTS channel is that a chunk which ranks below the vector similarity floor can still surface via lexical match, so fewer requests should fall all the way back to keyword |
| SBC401 (and SBC501) gate | `docs/launch/new-source-codes-gate-20260831.md` | **>= 90%** correct-section citations per code, **zero** fabricated citations, **zero** false NFPA/SFPE/IBC/IFC availability claims on the negative-control rows — the gate document's own stated pass bar, unchanged by this feature |
| Any `safety_critical: true` question | 43-question bench | **zero regressions** — one regressed safety-critical row fails the whole gate regardless of every other number (binding rule, Section 1 above) |
| Latency p95 | 43-question bench | Recorded, not gating by itself — an extra RPC round trip vs. today's single `match_sbc_documents` call is expected; note it, do not silently absorb a large regression |

If any bar is missed: leave `ADVISORY_HYBRID_RETRIEVAL_ENABLED` unset (OFF), write the failing
metric and before/after numbers into a dated file under `docs/audits/`, and hand the decision to
وسيم — per the runbook's "stop and report" rule, do not retune the RRF constants or the floor in the
same sitting to force a pass.

## 5. Flag

```
ADVISORY_HYBRID_RETRIEVAL_ENABLED
```

Exact string `"1"` to enable — anything else (unset, `"0"`, `"true"`, a stray space) is OFF, same
house rule as every other `ADVISORY_*` flag (`isHybridRetrievalEnabled` in `hybridRetrieval.ts`
implements and tests this). Default OFF. Set as a Supabase Edge Function environment variable on
`fire-safety-chat` (not in the harness/shell that runs the bench — the bench calls the deployed
function over HTTP, so the flag has to be live on the function to be measured at all, same note as
`docs/advisory-brain-runbook.md` Section 4).

**Rollback:** unset the env var (no deploy, no code change — the wiring's flag-OFF branch is the
unchanged existing path). To remove the SQL objects entirely, the rollback block is at the bottom of
`docs/db/20260903_hybrid_retrieval.sql` (drop function / drop index / drop column, in that order).

---

## 2026-09-03 (b) — the first gate measured nothing: match_sbc_hybrid never returned a row

**CONFIRMED, three defects, in the order they bite.**

1. **The RPC raised `42804` on every single call.** `match_sbc_hybrid` declared
   `vector_rank int` / `fts_rank int` / `rrf_score float` / `fts_score float`,
   but `row_number()` returns **bigint**, `1.0 / (rrf_k + rank)` is **numeric**
   (the literal `1.0` is numeric, not float8) and `ts_rank_cd` returns **real**.
   Postgres rejects the result set with "structure of query does not match
   function result type ... Returned type bigint does not match expected type
   integer in column 12". `fetchSBCContextHybrid` swallows RPC errors **by
   design** (fail-open: return null, caller keeps its path), so the failure was
   invisible: the flag read as ON, `engine` came back `vector`, and the answer
   was correct. **The 2026-09-03 gate therefore compared the vector path with
   itself** — its 52%→41% / 75%→50% deltas are provider and run-to-run noise,
   not evidence about hybrid retrieval. That entry in
   `next-wave-progress.md` is superseded by this one.
   Proof: calling the function directly in SQL reproduced the error; after the
   casts it returns rows, and a live probe reports `engine=hybrid`.

2. **The lexical leg was fed Arabic against an English corpus.** Measured on
   the production corpus (5,553 rows, all with a backfilled `tsv`):

   | query through `tsv @@ websearch_to_tsquery('simple', sbc_normalize_ar(...))` | rows |
   |---|---|
   | `travel distance` | 290 |
   | `1017.2` | 41 |
   | `مرشات` | **0** |
   | `السلامة` | **0** |

   The call site passed the raw user query, which is Arabic for essentially
   every real request — so the FTS leg contributed nothing and the "fusion"
   was pure vector wearing a different engine label. It now receives
   `embeddingSourceText` (the same text that gets embedded: the question plus
   the English search terms from query analysis plus any derived section
   numbers), which is the only form of the question this corpus can match
   lexically. Section numbers are the strongest lexical signal available and
   they survive `sbc_normalize_ar` intact by design.

3. **Equal-weight RRF let the lexical list take half the context.** With
   `rrf_k = 60` and equal weights, an FTS rank-1 row scores `1/61 = 0.016393`
   and beats the vector rank-2 row's `1/62 = 0.016129`, so the two lists
   interleave 1:1 and a 25-row context is ~12 vector + ~13 lexical. Fixed with
   two knobs in `docs/db/20260903b_hybrid_retrieval_tuning.sql`, each
   defaulting to the old behaviour so the SQL alone changes nothing:
   `fts_weight` (the caller passes **0.5**) and `vector_quota` (**60% of
   match_count**, guaranteed and ordered first). The `retrievalPolicy.ts`
   similarity floor is now also applied SQL-side to the **vector leg only** —
   an FTS-only hit is judged by its lexical evidence, never by a similarity it
   was not ranked by — and if the floor empties the vector leg entirely,
   `fetchSBCContextHybrid` declines so the vector path's own `below_floor`
   fallback makes the call.

**Operational note that cost a gate run:** `ttfb_probe.mjs` / `profile_probe.mjs`
**rotate the smoke account's password**, which invalidates the session token a
running benchmark holds. A probe fired during the first re-gate produced
exact-section 11%, refusal 0%, p95 79.6s — an artefact, not a measurement. Never
run a probe while a bench is in flight; that run was discarded.

**Cache interaction:** `ADVISORY_HYBRID_RETRIEVAL_ENABLED`, `SBC_HYBRID_FTS_WEIGHT`
and `SBC_HYBRID_VECTOR_QUOTA_RATIO` are all part of the retrieval-cache flag
fingerprint, so rows fused under one setting can never be served to a request
running under another.

## The decisive answer: a model-free retrieval gate (2026-09-03 (c))

The model-in-the-loop benchmark cannot settle a retrieval question. Its
section-recall numbers moved by more than the effect they were meant to detect
(same day, same 13 questions: 52% / 41% / 48% across runs, with two rows hitting
the 120s upstream watchdog). So the measurement moved off the model entirely.

**`evals/retrieval/retrieval-gate.mjs`** embeds each benchmark question ONCE
(through `gemini-diag {action:"embed"}` — the Gemini key lives only as a
function secret) and hands that single vector to every retrieval arm, then asks
one deterministic question per expected section: *did any returned chunk carry
it* (as `section_number`, or quoted as a standalone number in `content`)? No
model, no latency, no answer variance. Full run: 40 questions, 87 expected
sections, about a minute.

| arm | recall | all sections found | avg rows | FTS-supported rows |
|---|---|---|---|---|
| vector RPC, unfiltered | **64/87 (73.6%)** | 24/40 | 25.0 | 0 |
| vector + production similarity floor | 62/87 (71.3%) | 22/40 | 19.9 | 0 |
| hybrid, fts 0.5 / quota 15 / floor | 62/87 (71.3%) | 22/40 | 20.2 | 17 |
| hybrid, fts 0.5 / quota 15 / no floor | 64/87 (73.6%) | 24/40 | 25.0 | 7 |
| hybrid, fts 1.0 / quota 0 / no floor (as first shipped) | 64/87 (73.6%) | 24/40 | 25.0 | 18 |

**Verdict on hybrid retrieval: no measurable benefit — the flag stays `0`.**
Not "worse": once the floor is out of the comparison every hybrid arm returns
*exactly* the vector baseline's recall. The reason is visible in the last
column — across 40 questions the lexical leg contributes 7-18 supported rows in
total (well under one per question). Even with the corpus-language fix, an SBC
question's discriminating content is conceptual, and the section numbers that
would match lexically are usually what the question is ASKING FOR rather than
what it states. The tuning did its job (the untuned arm no longer dominates the
result set) — there is simply nothing here for fusion to add. The code, the SQL
and the tuning stay in place, behind the flag, because the next corpus (SBC 401
/ 501, or an Arabic-language corpus) may change that answer; this harness is how
to re-ask the question in a minute rather than a noisy afternoon.

**Unexpected second finding — the similarity floor costs recall.** The floor
production applies today (`retrievalPolicy.ts`, cut = max(0.70, 0.85 x top))
drops about 5 of every 25 rows and, with them, **2 expected sections and 2
questions' complete section sets** (73.6% -> 71.3%). That floor was calibrated
in 2026-08 against the unrelated-pair similarity distribution — a sound
derivation of what noise looks like — but its RECALL COST was never measured
until now. This is NOT a licence to remove it: it also decides the
`below_floor` keyword fallback, which is what stops an answer being built out
of noise when a query genuinely has no good match. The candidate worth testing
next is narrower: keep the floor as the FALLBACK decision (all rows below cut
-> keyword) but stop dropping individual rows when the top match is strong.
That change would need this harness AND an answer-quality run, in that order.
