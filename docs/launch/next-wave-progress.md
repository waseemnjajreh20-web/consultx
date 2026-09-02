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

## Owner actions queue
- Apply SQL files in docs/db/ dated 20260903 (order above) — or confirm the orchestrator may apply DDL via the Management API.
- Provide ALERT_EMAIL for SLO alerts; confirm PROBE_TASK_TOKEN creation (orchestrator generates, never printed).
- Keep-warm cron (pending from the previous session).
