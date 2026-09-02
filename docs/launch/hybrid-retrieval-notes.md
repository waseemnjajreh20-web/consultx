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
