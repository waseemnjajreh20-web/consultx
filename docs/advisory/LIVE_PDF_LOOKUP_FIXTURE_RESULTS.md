# Live PDF Lookup — Fixture Results

Date: 2026-05-05 (R11, Phase 1B Task 6)

---

## 1. Status

**All 21 fixtures pass.**

| Suite | File | Pass / Total |
|-------|------|:---:|
| Intent Gate (R1, regression) | `evals/advisory/intent_gate_fixtures.test.ts` | **11/11** ✅ |
| PDF Lookup (this round) | `evals/advisory/pdf_lookup_fixtures.test.ts` | **10/10** ✅ |
| **Total** | | **21/21** |

Both suites run via `npx tsx <path>` with no Supabase storage calls — fully offline, deterministic.

---

## 2. PDF Lookup fixture detail

| # | Scenario | Expected | Actual | Pass |
|---|----------|----------|--------|:----:|
| 1 | Flag OFF returns `disabled_by_flag` | not_found, diagnostic includes `disabled_by_flag` | matched | ✅ |
| 2a | Wrong mode (`main`) returns `wrong_mode_main` | not_found, diagnostic includes `wrong_mode_main` | matched | ✅ |
| 2b | Wrong mode (`analysis`) returns `wrong_mode_analysis` | not_found, diagnostic includes `wrong_mode_analysis` | matched | ✅ |
| 3 | Figure ref returns `figure_not_supported_v1` | not_found, diagnostic includes `figure_not_supported_v1` | matched | ✅ |
| 4 | Index miss for unknown ref `9999.9` | not_found, diagnostic includes `index_miss` | matched | ✅ |
| 5 | Hyphenated `102-7-1` normalizes to dot form | found, exact, page_start=50, excerpt includes `102.7.1` | matched | ✅ |
| 6 | Excerpt truncation at `max_excerpt_chars=80` | excerpt length ≤ 130 chars (80 + buffer for truncation suffix) | matched | ✅ |
| 7 | Exact section match `903.2.7` | found, exact, page_start=712, excerpt includes `903.2.7`, should_answer_compliance=true | matched | ✅ |
| 8 | Page-only fallback for `915.5.1` (marker absent on page 1042) | found, likely, page_start=1042, should_answer_compliance=false | matched | ✅ |
| 9 | Table ref `Table 1004.5` exact match | found, exact, page_start=612, excerpt includes `1004.5`, should_answer_compliance=true | matched | ✅ |

---

## 3. Coverage by contract requirement

The R11 brief listed these contract requirements; here's where each is locked:

| Brief requirement | Locked in fixture |
|-------------------|-------------------|
| Helper works only in Advisory mode | #2a, #2b |
| Helper short-circuits when flag OFF | #1 |
| Figure refs not supported in V1 | #3 |
| Returns `not_found` instead of throwing on miss | #4 |
| Hyphenated IDs normalize to dot form | #5 |
| Excerpt is bounded by `max_excerpt_chars` | #6 |
| Exact match → confidence=`exact` + compliance=true | #7, #9 |
| Page-only fallback → confidence=`likely` + compliance=false | #8 |

The integration-level wiring (Task 5 — trigger gating, family inference, ledger supplement) is not directly fixture-tested in this round because it requires mocking the Advisory branch's surrounding state (`advisoryLedger`, `usedFiles`, `usedSourceMeta`, `fullSystemPrompt`). That coverage is intentionally deferred to live smoke (Phase 1C) where a real Advisory turn exercises the full path end-to-end.

---

## 4. Regression check on existing fixtures

The intent_gate_fixtures.test.ts suite (11 scenarios from R1, plus extended cases) was re-run after the Phase 1B helper + integration block was added. **All 11 still pass** — no regression. The deterministic gates (intent classifier, V1 sidecar trigger regex) are unchanged.

---

## 5. What this task did NOT do

- ❌ No live Supabase storage calls — all tests use synthetic injected payloads.
- ❌ No code change to the production helper or wiring.
- ❌ No deploy.
- ❌ No flag flip.
- ❌ No DB write.

---

## 6. Issues / known gaps

- The fixture file mirrors the helper's deterministic surface (regex, normalization, extraction). Any future change to the helper requires updating the fixture mirror in lockstep — the fixture is a contract, not an exact import. This is the same convention the project uses for `intent_gate_fixtures.test.ts`.
- The integration-level trigger gating (Task 5) is not directly tested at this layer. The mock helper shows it would behave correctly, but the integration block's specific code (queryMeta extraction, ledger coverage check, family inference, sentinel filename construction, ledger supplementation) is only exercised by live smoke. This is a known gap; Phase 1C live smoke will be the first end-to-end verification.

---

## 7. Next step

Proceed to Task 7 — TypeScript / Deno check + deploy `fire-safety-chat` with `ADVISORY_PDF_LOOKUP_ENABLED=0`.
