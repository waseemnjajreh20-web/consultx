# Next wave — build progress (living document)

Plan: docs/launch/next-wave-plan-20260903.html · Proposals: docs/launch/next-wave-proposals-20260903.html
Orchestration model: parallel builder sub-agents with disjoint file ownership; the orchestrator alone
integrates, runs the verification gate, deploys, measures with the production probe, commits and pushes.
No agent deploys, writes to production, or runs git write commands.

## Wave 1 — launched 2026-09-03 (9 parallel builders)

| Item | Scope | Owns | Model | Status |
|---|---|---|---|---|
| A1 | synthetic-probe function, perf_events/slo_targets SQL, alerting, /admin/health | supabase/functions/synthetic-probe/**, docs/db/20260903_perf_events.sql, src/pages/AdminHealth.tsx, App.tsx (route only) | sonnet | built (73 tests) — integration pending: SQL apply, deploy, cron |
| B1a | runtime citation verifier (server event + client badges) | fire-safety-chat/citationVerifier.ts, index.ts (surgical), ChatInterface.tsx, ChatMarkdownRenderer.tsx | opus | building |
| B1b | hybrid FTS + vector RRF (SQL + Deno module, unwired) | docs/db/20260903_hybrid_retrieval.sql, fire-safety-chat/hybridRetrieval.ts | sonnet | built (64 tests) — commit after tsc gate; wiring in integration wave |
| D1 | embedding + retrieval caches (module + SQL, unwired) | fire-safety-chat/retrievalCache.ts, docs/db/20260903_retrieval_cache.sql | sonnet | merged b177bbb (29 tests; wiring in integration wave) |
| A2 | per-model circuit breaker | fire-safety-chat/geminiResilience.ts (+ tests) | sonnet | merged 2995625 (flag OFF) |
| P0 | pre-commit PII/secret guard | .githooks/**, tests, docs | sonnet | merged 3f88363, hook installed; allow-file marker added after it blocked its own fixtures |
| D2a | Gemini context-cache module (unwired) | fire-safety-chat/geminiContextCache.ts | sonnet | merged 12e6c17 (API shape = HYPOTHESIS, live check before wiring) |
| C1a | building profile SQL + report generator (unwired) | docs/db/20260903_building_profiles.sql, src/lib/buildingProfile.ts, src/lib/complianceReport.ts | sonnet | building |
| A3-CI | GitHub Actions verification gate | .github/workflows/ci.yml | sonnet | merged 36e8f35 (+ guard --check-diff-base, range scan clean) |

## Integration log (2026-09-03)
- All 9 wave-1 items merged in focused commits (2995625 … da443f1) and pushed; frontend, fire-safety-chat and synthetic-probe deployed.
- SQL applied in production via the Management API: perf_events/slo_targets/probe_state (+ last_cron_status), retrieval_cache/runtime_settings, hybrid retrieval (tsv backfilled 5553/5553, match_sbc_hybrid, embeddings confirmed vector(768)), building_profiles. `notify pgrst, 'reload schema'` was required afterwards.
- CITATION_VERIFIER_ENABLED=1 is LIVE: first run exposed a calibration defect (chunks carry their PARENT section, so verbatim quotes were demoted) — fixed in da443f1 (ancestor / printed-number anchoring; verbatim quotes stay verified). Post-fix live run: standard verified=1 paraphrased=2 unverified=0; analysis verified=2 paraphrased=2 unverified=1 (a page-only token).
- synthetic-probe: runs end-to-end (200, all three modes ok, cron_status 200) but its perf_events/probe_state writes did not persist on the first two runs; instrumented to return write_errors in the response — diagnosis in progress. Cron NOT armed until writes are proven.
- PROBE_TASK_TOKEN stored in function secrets + vault (probe_task_token); ALERT_EMAIL=waseem@consultx.app.
- Wave-2 integrator (opus) running: hybrid + cache wiring in index.ts behind flags, plus a gemini-diag function to verify the context-cache API shape live.

## Integration order (orchestrator)
1. Collect reports → review diffs per item (code-review pass on the hot-file edits from B1a and A2).
2. Gate: tsc 0 · vitest all green · deno check (fire-safety-chat, synthetic-probe) · build.
3. Wire in wave 2 (single integrator on index.ts): B1b hybrid behind ADVISORY_HYBRID_RETRIEVAL_ENABLED, D1 caches behind RETRIEVAL_CACHE_ENABLED, D2a behind GEMINI_CONTEXT_CACHE_ENABLED.
4. SQL apply (owner or Management API): perf_events → hybrid FTS → retrieval_cache → building_profiles.
5. Deploy order: frontend first (client understands new events) → fire-safety-chat → synthetic-probe. Set PROBE_TASK_TOKEN + vault probe_task_token; schedule cron.
6. Measure: production probe ×3 modes; enable flags one at a time, each with a before/after measurement; citation-verifier rate logged.
7. Commit per item (focused), push.

## Flags introduced (all default OFF)
CITATION_VERIFIER_ENABLED · ADVISORY_HYBRID_RETRIEVAL_ENABLED · RETRIEVAL_CACHE_ENABLED · GEMINI_CONTEXT_CACHE_ENABLED · PROVIDER_BREAKER_ENABLED · BUILDING_PROFILE_ENABLED · COMPLIANCE_REPORT_ENABLED

## Known blocker outside the code
GitHub Actions: every run on this repo ends in `startup_failure` (0s) — including runs of the
pre-existing workflow before this wave, so the cause predates it. The workflow file has no BOM
and parses as YAML; repository Actions permissions are enabled/all. The startup message is only
visible on the run page (https://github.com/waseemnjajreh20-web/consultx/actions) — the owner
must read it: "Invalid workflow file" → orchestrator fixes; billing/spending-limit → owner fixes.

## Wave 2 wiring — integrator pass on `fire-safety-chat/index.ts` (2026-09-03)

Single integrator, one hot file. Nothing deployed, no SQL applied, no git write. All three flags
stay default OFF, so this pass changes nothing observable until وسيم sets one on the function.

| Wired | Flag (exact `"1"`) | Where |
|---|---|---|
| B1b hybrid retrieval | `ADVISORY_HYBRID_RETRIEVAL_ENABLED` | inside `fetchSBCContextVector`, after the query embedding, before the `match_sbc_documents` RPC |
| D1 embedding cache | `RETRIEVAL_CACHE_ENABLED` | `fetchSBCContextVector` — primary query embedding and each multi-topic sub-query embedding |
| D1 retrieval-result cache | `RETRIEVAL_CACHE_ENABLED` | the ADVISORY TEXT `if (useVector)` call site only |
| D2a context cache | `GEMINI_CONTEXT_CACHE_ENABLED` | **still unwired** — its API shape is a HYPOTHESIS; confirm with `gemini-diag` first |

- `RetrievalEngine` (`retrievalPolicy.ts`) widened to `"vector" | "keyword" | "hybrid"`. The
  frontend does not branch on this field, so the new value is client-safe; the bench and the probe
  read it from the `{type:"sources"}` event as before.
- A hybrid result returns `graphExpansionCount: null` and `fallbackReason: null`. Graph expansion is
  not composed on the hybrid path, and the similarity floor is skipped with the plain vector RPC —
  both are deliberate and are what `hybrid-retrieval-notes.md` Section 4's live gate must judge.
- The multi-topic (`decomposeQuery`) sub-queries stay on `match_sbc_documents`. Hybrid applies to
  the primary retrieval call only in this wave.
- Retrieval cache key = `[embedding key, sorted codes, mode, flags version, corpus_version]`, where
  *flags version* is `runtime_settings.retrieval_flags_version` **plus** a fingerprint of the live
  retrieval env flags — so flipping a flag on the function cannot serve rows computed under the old
  flag state even if the row was never bumped. Nothing user-scoped is in the key.
- Neither cache ever stores a failure: an embedding failure and a keyword fallback both leave their
  `compute()` closure by throwing, so a transient 429 cannot pin a query to the keyword path for the
  cache TTL.
- Vision path is **not** cached (it calls `fetchSBCContextVector` directly from `runVisionPipeline`).

New: `supabase/functions/gemini-diag` (+ `[functions.gemini-diag] verify_jwt = false`) — token-gated
(`x-probe-token` = `PROBE_TASK_TOKEN`, constant-time) diagnostics. `{"action":"models"}` lists what
the key sees; `{"action":"cachetest"}` creates a `cachedContents` object, calls
`streamGenerateContent` with `cachedContent` alone and then with `cachedContent` +
`systemInstruction`, deletes the object, and reports statuses and shapes with every string truncated
to 300 chars and the API key never emitted. Run it before wiring D2a.

Guards: `src/__tests__/wave2Wiring.test.ts` (27 source-contract tests). Verification this pass:
`deno check` (fire-safety-chat, gemini-diag) clean · `tsc --noEmit -p tsconfig.app.json` clean ·
1680/1680 vitest green, no existing test edited.

## Owner actions queue
- Apply SQL files in docs/db/ dated 20260903 (order above) — or confirm the orchestrator may apply DDL via the Management API.
- Provide ALERT_EMAIL for SLO alerts; confirm PROBE_TASK_TOKEN creation (orchestrator generates, never printed).
- Keep-warm cron (pending from the previous session).
