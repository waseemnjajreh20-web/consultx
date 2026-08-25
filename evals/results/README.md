# Advisory Benchmark Results

Time-stamped output from `evals/run_advisory_benchmark.ts`. Each run creates
a `{YYYY-MM-DD}/` folder with `results.json` (per-question, per-mode scores)
and `report.md` (human-readable table). **Authority:**
`docs/advisory-brain-runbook.md` governs flag rollout order and bench gates
and wins where this README differs — it only covers invoking the harness and
reading output.

## Running it

**Dry-run** (no API calls, no secrets, never a release gate): `npm run
bench:dry` = `npx deno run --allow-read --allow-write --allow-env
evals/run_advisory_benchmark.ts`. Scores synthetic placeholder answers,
proving only that the JSONL parses and the report renders.

**Live** (the only run that can justify a flag flip — runbook Section 1):

```
CONSULTX_EVAL_LIVE=1 CONSULTX_EDGE_URL=https://<ref>.supabase.co/functions/v1/fire-safety-chat \
CONSULTX_SERVICE_KEY=<service-role-jwt> SMOKE_USER_ID=<smoke-user-uuid> \
npx deno run --allow-read --allow-write --allow-env --allow-net evals/run_advisory_benchmark.ts
```

Never commit secrets. `CONSULTX_SERVICE_KEY` = Supabase Project Settings ->
API -> service_role; `SMOKE_USER_ID` = `SELECT id FROM auth.users WHERE
email = 'smoke_retrieval_test_042026@mailnull.com'`. Live mode reads the
response as SSE (falls back to JSON/raw-text) and records
`X-Retrieval-Engine` / `X-SBC-Sources` / `X-SBC-Source-Meta` per row, so a
run proves which engine actually served each question.

**Coverage:** every question runs in **both** `standard` and `analysis` mode
(two rows each), plus a fixed two-question `primary`-mode smoke check (first
two JSONL rows) asserting no malformed/bare `[SWITCH:...]` token leaks — a
well-formed `[SWITCH:استشاري]`/`[SWITCH:تحليلي]` is fine, stripping it is the
frontend's job. A `safety_critical: true` row that fails tier-A **fails the
whole run** regardless of aggregates — collected into
`safety_critical_regressions`, a `*** REGRESSION ***` banner names the
`{id, mode}` pairs, `report.md` leads with them, exit is non-zero. One
regressed safety-critical question is a stop, never a trade-off (runbook
Section 1, item 2).

## Two scoring tiers

Predicates: `evals/lib/scoring.ts`; combined per-row in `computeMetrics()`.

- **tier-A (binding, gates pass/fail):** expected sections found; both
  members of each `chain_pairs` entry found; no `forbidden_claims`
  mentioned; no fabricated NFPA/SFPE/IBC/IFC clause; `must_refuse` rows need
  one literal canonical/boundary refusal sentence (acceptance doc Section 3)
  via exact-phrase match, not a semantic "did it decline" judgment.
- **tier-B (reported only):** checks for the structured `[SBC-{201|801}
  Section {ref} | conf:{high|medium|low}]` token. No producer emits it yet —
  ~0% expected until `ADVISORY_CITATION_TOKENS_ENABLED` ships, which is also
  what should re-gate this metric (runbook Section 3).

| Metric | Tier | Threshold | Gates? |
|---|---|---|---|
| Exact-section match | A | >= 60% | yes |
| Chain-pair match | A | reported | no |
| Refusal correctness | A | 100% | yes |
| Hallucination rate | A | <= 5% | yes |
| Latency p95 (live only) | — | <= 45 000ms | yes |
| Citation discipline | B | informational | no |
| Any `safety_critical` regression | A | zero | overrides all above |

Derivations: `docs/advisory-acceptance.md` Section 5.3/5.4. Per-flag gate
mapping: `docs/advisory-brain-runbook.md` Section 3.

## Question set — 43 rows

- `ADV-001`..`ADV-020` — frozen original set (SBC 201/801 occupancy, egress,
  height/area, sprinkler, standpipe, fire-pump, cross-document, NFPA-bait,
  Civil-Defense-bait).
- `ADV-021`..`ADV-043` — 23 rows added 2026-08-25: Arabic questions outside
  the existing glossary/sampler taxonomy, citation-chain questions (via
  `chain_pairs`), table-value questions (`expected_table_ids`). Added the
  `safety_critical`, `chain_pairs`, `language` fields.

Schema: acceptance doc Section 5.2. `language` (`ar`/`en`) selects
`question_ar`/`question_en`. New rows: next `ADV-NNN` id; run `npm run
bench:dry` to validate parsing before committing.

## Known limits

- `expected_table_ids` is **collected but not yet scored** (12 rows carry
  it; no predicate reads it today), and **live mode requires a deployed
  `fire-safety-chat` function** — there is no offline live-mode path.
- **Refusal correctness is partly a prompt-contract gap, not a harness
  bug.** The prompt guarantees only one of the five accepted sentences;
  Civil-Defense-bait rows have no instructed refusal phrasing at all. A
  first live-run failure here likely reflects that gap, not a retrieval
  regression — see runbook Section 5 before loosening the scorer.

## Verification before any commit touching this stack

```
npx tsc --noEmit -p tsconfig.app.json
npm test
npm run build
npx deno check <changed functions>
```

A green `npm run bench:dry` is a harness smoke-check, not a release gate.
