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
- synthetic-probe: root cause of the silent write failures = signing the smoke user in on the SERVICE client (supabase-js adopted the session → RLS as `authenticated`). Fixed with a throwaway publishable client; rows now persist (3/run) and probe_state works. Cron ARMED hourly (`synthetic-probe`, 0 * * * *) + keep-warm ping every 5 min (`keep-warm-fire-safety-chat`) — both scheduled via the Management API. Smoke account set to enterprise so probes never hit daily mode limits. Grants on last_cron_status()/retrieval_cache_gc() tightened (default anon/authenticated EXECUTE revoked by name).
- gemini-diag cachetest (2026-09-03): cachedContents create 200 (1,536 tokens), stream with cachedContent alone 200, cachedContent + systemInstruction → 400 "move those values to CachedContent" — the geminiContextCache.ts layout is confirmed; D2 wiring launched (wave 3).
- Flags ON in production: CITATION_VERIFIER_ENABLED, PROVIDER_BREAKER_ENABLED, RETRIEVAL_CACHE_ENABLED (measured with the probe). ADVISORY_HYBRID_RETRIEVAL_ENABLED stays OFF until the 36-q gate + bench subset run (pause the hourly probe during a bench: both rotate the smoke password).
- PROBE_TASK_TOKEN stored in function secrets + vault (probe_task_token); ALERT_EMAIL=waseem@consultx.app.
- Wave-2 integrator (opus) running: hybrid + cache wiring in index.ts behind flags, plus a gemini-diag function to verify the context-cache API shape live.

## Quality gate for the hybrid flag (2026-09-03)
- Baseline (hybrid OFF, 13-question subset, commit 2bf727f): sections 52% · chain pairs 75% · citation discipline 100% · p95 27.1s · refusal 50% · hallucination 40%.
- Standing safety-critical regression ADV-031/032 (both modes): the answers append external clause numbers ("NFPA 13 … Section x") that the corpus does not hold — the tier-A fabricated-clause predicate. Two structural responses built this session: SOURCE_SCOPE rule 3 strengthened (name the external standard exactly as the SBC text does, never a clause number), and `fire-safety-chat/externalClauseScrubber.ts` — a streaming scrubber that reduces any absent-standard clause reference to the bare standard name before it reaches the client (7 tests; wiring into transformStream follows the D2 integrator's pass on index.ts).
- Hybrid-ON run (02:05 UTC, same subset, evals/results/2026-09-03-subset): sections 41% · chains 50% · citation discipline 90% · p95 60.4s · hallucination 40% → **gate FAILED**; flag set back to 0 right after the run. Hypothesis for the next iteration: the hybrid leg skips the similarity floor and fuses 40+40 candidates into 25 rows, so lexical noise displaces vector top hits; tune rrf_k / candidate_pool and keep the floor on the vector leg, then re-gate.

## Wave 3 (2026-09-03, relaunched after a usage-limit interruption)
- C3-1 done (53beaaf): 15 real DWG files, zero DXF/IFC, ODA converter absent → spike ran on a synthetic sample; verdict no-go as-is; phase 1.5 = owner-approved ODA install + 3 real drawings. Async Python worker recommended (Cloud Run Jobs / VPS).
- In flight: D2 (context-cache wiring), C1b (profile card / report / feedback UI), B3 (answer_feedback SQL + review queue + 200-candidate golden set), D3 (RUM beacon + AdminHealth RUM), B2-1 (rule schema + 30 draft rules + evaluator).
- Monitoring after bring-up cleanup: 11 perf_events rows, breach counters reset except first_text_ms_primary=3 (real: primary first text 19-25s at the 02:00 UTC window — provider-side gemini_connect 17-24s; keep-warm confirmed firing every 5 min). The owner may have received 1-2 alert emails from the bring-up period; the next hourly runs recover the counters.

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

## Session close — 2026-09-03 (orchestrator, after the usage-limit resume)

**Shipped to production this session** (all commits pushed on `recovery/stabilization-2026-08-23`):

- `fire-safety-chat`: D2 context-cache wiring (flag back to `0` after its gate, see below), the external-clause
  scrubber (`EXTERNAL_CLAUSE_SCRUB_ENABLED=1` live), and C1c server-side building-profile injection
  (`BUILDING_PROFILE_ENABLED=1` live; inert for users while `VITE_BUILDING_PROFILE_UI` is off because the client
  only then sends `conversation_id`).
- `perf-beacon` (D3 RUM) deployed; `/admin/health` real-user section; frontend deployed (aliased www.consultx.app).
- `answer_feedback` table + 4 RLS policies applied through the Management API (HTTP 201); `/admin/feedback` route;
  golden-set tooling (243 candidates, engineer review pending).
- B2-1 rule engine committed: JSON-Schema rule format, evaluator (`insufficient_data` on any missing input),
  34 rules all `status: draft`, 72 tests. Nothing leaves draft without engineer review (see the B2-1 report items:
  provenance re-check, three printed-table ambiguities, 903.2.x primary-text re-extraction, CONSTRUCTION_TYPES 9 vs 12).

**Gates and measurements**

| Gate | Result |
|---|---|
| D2 Gemini context cache | **FAIL — flag `0`.** 3 modes x 2 rounds: the `context_cache` stage costs 0.4–2.7s on every request (round 2 included) and no mode's model connect improved; primary regressed to 17.5–17.9s vs ~3s. Step 4 not run. Details + retry conditions in `context-cache-notes.md`. |
| C1c building profile (server) | **PASS on all three modes** (`profile` stage in X-Timing; answers echoed the profile facts 5/5, 4/5, 4/5 via `profile_probe.mjs`, rows created and deleted for the smoke account). Owner isolation on `building_profiles` proven in production inside an always-rolled-back transaction: A sees 1 / B sees 0 / spoofed insert rejected 42501 / cross-user update+delete 0 rows; nothing left behind. |
| Scrubber vs ADV-031/032 | The benchmark failure was a **detector false positive**, not model fabrication: SBC 801 Section 903.3.1.1 is the section that names NFPA 13, so every correct answer juxtaposes them. Proven by dumping full answers and scanning them with the real scorer. `hasFabricatedStandardClause` now has three guards (attribution connector on the reversed order; a number the answer itself attributes to SBC is never an NFPA clause; 3+-digit leading component = code-style section, IBC/IFC excluded). 66 scorer tests. Final subset run: hallucination 0% (was 100%), all four advisory rows `fabricated=no`; the one remaining tier-A miss is 1/2 expected sections on a single row (answer variance). The runner now writes `answers.jsonl` next to each report. |
| Provider latency (same day) | Noisy: primary warm first text 3.5–4.2s with 17–19s outliers; standard/analysis first text 11–22s; one analysis stream truncated at 724 chars after 50s (provider side). Monitoring cron + RUM are the instruments for this from here. |

**Production flag state:** `ADVISORY_HYBRID_RETRIEVAL_ENABLED=0` (gate failed), `GEMINI_CONTEXT_CACHE_ENABLED=0`
(gate failed), `EXTERNAL_CLAUSE_SCRUB_ENABLED=1`, `BUILDING_PROFILE_ENABLED=1`, retrieval cache / breaker /
citation verifier / user memory `1`; every `VITE_*` UI flag off.

**Remaining for the wave:** hybrid tuning (keep the similarity floor on the vector leg, rrf_k / candidate pool) before
any re-gate; context cache only after moving `ensureContextCache` off the critical path and surfacing hit/create in
X-Timing; C3 drawings stays at ADR; UI flag activation is an owner decision.

**Owner queue (updated):** GitHub Actions `startup_failure` needs the run page read by the owner; ODA converter
approval for C3 phase 1.5; engineer review of the 34 draft rules and the 243 golden candidates; ALERT_EMAIL for SLO
alerts if not yet set; campaign / duplicate-row decisions from the previous session.

## Correction — the 2026-09-03 hybrid gate measured nothing (same day, later)

The "Quality gate for the hybrid flag" and the session-close table above record
hybrid retrieval as FAILED on quality (sections 52%→41%, chains 75%→50%). That
conclusion is **withdrawn**: `match_sbc_hybrid` raised a result-type error on
every call and `fetchSBCContextHybrid` fails open by design, so both arms of
that comparison were the plain vector path and the deltas were provider noise.
Full evidence, including the corpus-language measurement that showed the
lexical leg was being fed Arabic against an English corpus, is in
`hybrid-retrieval-notes.md` ("2026-09-03 (b)"). Hybrid is now genuinely running
(`engine=hybrid` on a live probe) with weighted RRF, a guaranteed vector quota
and the similarity floor on the vector leg; the re-gate is in flight.

**Two operating rules this produced:**

1. A fail-open feature needs POSITIVE proof that it ran — a live `engine=`
   value or a direct SQL call — before any gate reading it means anything. A
   silent fallback and a working feature look identical from the outside.
2. Never run a probe while a benchmark is in flight: `ttfb_probe.mjs` and
   `profile_probe.mjs` rotate the smoke account's password and invalidate the
   session the bench is holding. One re-gate run was discarded for this
   (exact-section 11%, refusal 0%, p95 79.6s — all artefact).

Context caching (D2) also got its wiring fixed rather than its verdict kept:
the create is off the critical path and the hit/miss outcome now rides back on
`X-Timing` so the next gate can actually tell them apart. See
`context-cache-notes.md` ("v2"). Its flag stays `0` until that re-gate runs.

## Hybrid retrieval — settled (2026-09-03, model-free gate)

After fixing the three defects that made the earlier gates meaningless, the
question was re-asked with an instrument that does not involve the model:
`evals/retrieval/retrieval-gate.mjs` (40 questions, 87 expected sections, one
shared embedding per question, deterministic section-membership scoring, ~1
minute per run).

**Result: hybrid retrieval buys nothing on this corpus — `ADVISORY_HYBRID_RETRIEVAL_ENABLED`
stays `0`.** Every hybrid arm matches the vector baseline's 73.6% recall exactly
once the similarity floor is out of the comparison; the lexical leg contributes
7-18 supported rows across all 40 questions. The code and SQL stay behind the
flag — a future corpus (SBC 401/501, or Arabic-language source text) may change
the answer, and re-asking now costs one minute.

**Open finding to act on next:** the production similarity floor costs 2 of 87
expected sections and 2 of 40 complete section sets (73.6% -> 71.3%), dropping
~5 of every 25 rows. Its noise-rejection benefit is real but its recall cost was
never measured until now. Candidate change (needs the harness AND an
answer-quality run): keep the floor as the *fallback* decision, stop using it to
drop individual rows when the top match is strong. See `hybrid-retrieval-notes.md`.

**New instrument, kept:** `gemini-diag` gained a token-gated `embed` action (the
Gemini key never leaves the function; only the 768-dim vector does) so any local
harness can reproduce the runtime's exact query embedding. It accepts either
`PROBE_TASK_TOKEN` (shared with the synthetic-probe cron) or its own
`GEMINI_DIAG_TOKEN`, which is rotatable with one CLI command without touching
that cron schedule.

## D2 session 6 — per-mode thinking levels (2026-09-03)

The last open item of P2. Primary has run at `minimal` since the speed wave;
standard and analysis had never run at anything but the model's uncapped
default, because the code only had those two settings. `ThinkingEffort` is now
a ladder (`minimal | low | medium | high | default`), each level carrying both
API generations' field shapes (3.x `thinkingLevel` enum, 2.5 `thinkingBudget`
integer) with the same discovery-and-remember mechanism that shipped for
`minimal` — now keyed per model AND level, since a model accepting
`thinkingLevel:"minimal"` says nothing about `"medium"`. Selection is per mode
via `THINKING_EFFORT_PRIMARY` / `_STANDARD` / `_ANALYSIS`; an unset or
mistyped value falls back to today's behaviour, so the request stays
byte-identical unless a level is deliberately set.

**Measured on production** (`ttfb_probe.mjs`, 2 rounds per mode, region-pinned;
the figure is `gemini_connect` — time from request to the model's first byte,
which is what dominates these modes):

| level | standard | analysis |
|---|---|---|
| default (uncapped, today) | 17.6s / 9.6s | 10.1s / 10.0s |
| **low** | **5.5s / 3.6s** | **3.9s / 3.1s** |
| medium | 11.3s / 23.5s | 14.0s / 9.1s |

`low` is roughly a **3x** improvement in time-to-first-text for both heavy
modes. `medium` is indistinguishable from uncapped — the useful part of the
ladder is its bottom, which matches what `minimal` did for primary.

Quality gate before adopting: the 13-question subset at `low`, compared against
the flag-off baseline in `evals/results/2026-09-02-subset` (sections 52%,
chains 75%). Latency is not the only thing less thinking can change — one
probe answer came back at 1,464 characters against a 4,068-character baseline,
which is exactly the risk the gate is for.

**Quality gate result: `low` is REJECTED — reverted to `default` for both heavy
modes.** 13 questions x 2 modes, against the `evals/results/2026-09-02-subset`
baseline:

| metric | baseline (uncapped) | low |
|---|---|---|
| exact-section match | 52% | **30%** |
| sections found | 24/46 | **14/46** |
| chain-pair match | 75% | 50% |
| refusal correctness | 50% | 33% |
| citation discipline | ~90% | **65%** |
| latency p95 | 27s | 21.9s (median 12s) |

The speed was real — median answer 12s against 20s — and it cost nearly half
the correct section citations. One analysis answer came back at 405 characters.
That is the trade this gate exists to refuse: on a life-safety code assistant,
a faster answer that cites the wrong section is worse than a slower one that
cites the right one.

The ladder stays in the code (it is how the question was answered, and how a
future model's ladder will be re-asked in twenty minutes), with all three
variables back to their defaults — primary `minimal`, standard and analysis
model-default. Artifacts: `evals/results/2026-09-03-thinking-low-13q/`.

**What this closes:** P2 is now fully settled, all three items by measurement —
D1 caches live, D2 context caching rejected (needs a database-backed registry),
D2 thinking budgets rejected at every level that is faster than default. The
remaining latency in the heavy modes is the model's own reasoning time, and
this repo has no lever left for it that does not cost citation accuracy.
