# Advisory Brain — Change-Discipline Runbook

**Date:** 2026-08-25 · **Scope:** flag rollout order and bench gates for the
Advisory (`standard`) retrieval/citation stack. This document does not
execute anything — it is the contract that governs every future flag flip
on this stack, and the checklist an operator (or an agent acting under
`.claude/skills/consultx-orchestrator/SKILL.md`) runs before touching any
`ADVISORY_*` environment variable.

Companion documents (binding, not restated in full here):
- `docs/advisory-acceptance.md` — citation-token grammar (Section 2),
  refusal contract (Section 3), benchmark gate definitions (Section 5.3).
- `evals/results/README.md` — how to run the bench harness, pass thresholds,
  canonical refusal sentences.
- `docs/audits/graphrag-design-20260823.md` — graph-expansion design,
  phased rollout (G0–G3), bench metric definitions (Section 4.2, 4.4).
- `docs/audits/advisory-vector-bench-20260823.md` — vector-retrieval
  measurement, similarity-floor derivation, current OFF recommendation
  (Section 10).
- `supabase/functions/fire-safety-chat/retrievalPolicy.ts` — the only file
  that implements a flag from the order below today.
- `evals/advisory_benchmark.jsonl` — the bench question set, including the
  `safety_critical` field this P1 pass added (`ADV-021`..`ADV-043`).

---

## 1. The contract (non-negotiable)

1. **No flag flip without a live bench run.** "Live" means
   `CONSULTX_EVAL_LIVE=1` against the deployed `fire-safety-chat` function
   per `evals/results/README.md` — not the dry-run placeholder scorer, and
   not a manual spot-check of a handful of chat turns. A dry-run only proves
   the harness parses; it never scores real model output.
2. **Any regression on a `safety_critical: true` question is a stop, not a
   trade-off.** One regressed safety-critical question fails the gate
   regardless of what every other metric does. This mirrors the standing
   rule in `docs/audits/graphrag-design-20260823.md` Section (د) 4.4, item 4
   ("أي تراجع على سؤال مصنّف حرج للسلامة → توقّف فوري. لا يُوازَن بأي ربح"),
   and applies to every flag below, not only graph expansion.
   - "Stop and report" means: leave the flag at its last-known-good value
     (default OFF unless already ON in production), write the failing
     question id(s), the metric that regressed, and the before/after
     numbers into a dated file under `docs/audits/`, and hand the decision
     to وسيم — do not retry with a different seed or a relaxed threshold.
3. **Flags stay OFF by default and are flipped ON only by explicit env var,
   never by code default.** This is the existing house pattern
   (`retrievalPolicy.ts` lines 26–35) and it is not renegotiated per flag.
4. **Each flag is measured alone before any flag downstream of it in the
   order is touched.** The order in Section 2 is a dependency chain, not a
   checklist to batch. Turning on two flags in the same bench run makes it
   impossible to attribute a regression to either one.
5. **A negative result is a valid result.** If a flag's own gate fails,
   the flag stays OFF, the failure is documented, and the design is not
   re-tuned in the same sitting to force a pass — restated from
   `graphrag-design-20260823.md` Section (د) 4.4: "النتيجة السلبية نتيجة
   صالحة."

---

## 2. Flag order

```
ADVISORY_VECTOR_RETRIEVAL_ENABLED
  -> ADVISORY_VECTOR_ANALYSIS_ENABLED
  -> ADVISORY_CITATION_TOKENS_ENABLED
  -> ADVISORY_GRAPH_EXPANSION_ENABLED
  -> ADVISORY_QUERY_ANALYSIS_ENABLED
  -> sub-flags
```

Status of each name against the current repository (re-checked 2026-08-25
against the WORKING TREE, which at that moment carried uncommitted work from
several concurrent lanes — re-verify before relying on this table, it will go
stale as phases ship and it does not describe `HEAD`):

| Flag | Status | Where |
|---|---|---|
| `ADVISORY_VECTOR_RETRIEVAL_ENABLED` | **CONFIRMED implemented.** Default OFF, `mode==="standard"` only. | `supabase/functions/fire-safety-chat/retrievalPolicy.ts` (`isAdvisoryVectorEnabled`, `shouldUseVectorForAdvisory`) |
| `ADVISORY_VECTOR_ANALYSIS_ENABLED` | **CONFIRMED implemented, UNCOMMITTED.** Exists in the working tree only, from the concurrent P2 lane — not in `HEAD` as of 2026-08-25. Sub-flag of the master above under a two-key design: meaningless unless the master is also `1`, and it has a live reader (`index.ts` line ~2905 calls `shouldUseVectorForAdvisory`). Default OFF. | `supabase/functions/fire-safety-chat/retrievalPolicy.ts` (`ADVISORY_VECTOR_ANALYSIS_FLAG_ENV`, `shouldUseVectorForAdvisory`) |
| `ADVISORY_CITATION_TOKENS_ENABLED` | **NOT VERIFIED.** No matching name found in code — the only occurrences in the repository are this runbook and the tier-B note the bench harness prints. The behavior it would gate (the `[SBC-{201\|801} Section … \| conf:…]` token grammar) is specified but not yet flagged — see `docs/advisory-acceptance.md` Section 2. | — |
| `ADVISORY_GRAPH_EXPANSION_ENABLED` | **CONFIRMED implemented, UNCOMMITTED — but stage G0: ZERO READERS.** The flag and its gate function exist in the working tree from a concurrent lane; `index.ts` does not import the module, so setting the env var changes nothing today. Do not read "the name now exists in code" as "the flag does something." Default OFF. | `supabase/functions/fire-safety-chat/graphExpansion.ts` (`ADVISORY_GRAPH_FLAG_ENV`, `isGraphExpansionEnabled`); design in `docs/audits/graphrag-design-20260823.md` Section (ج) |
| `ADVISORY_QUERY_ANALYSIS_ENABLED` | **CONFIRMED implemented, UNCOMMITTED — ZERO READERS,** same as the row above: present in the working tree, not imported by `index.ts`. Corresponds to making the Mandatory Diagnostic Protocol (`promptContract.ts` prompt text) deterministic instead of prompt-only — see `graphrag-design-20260823.md` Section (هـ) 5.8, which states plainly the protocol today has "لا كود يحلّل التصنيف/الارتفاع/المساحة، ولا آلة حالة." Default OFF. | `supabase/functions/fire-safety-chat/queryAnalysis.ts` (`ADVISORY_QUERY_ANALYSIS_FLAG_ENV`, `isQueryAnalysisEnabled`) |
| sub-flags (`…_CROSSCODE`, `…_TABLES`, `…_HOP2`, `…_LISTS`, `…_NEIGHBOR`, `…_NORMATIVE`) | **Proposed, G2 stage only** — each ships and is measured independently, never batched. | `graphrag-design-20260823.md` Section (ج), "G2 — توسيع محكوم" table |
| `ADVISORY_QUERY_DERIVATION_ENABLED` | **CONFIRMED implemented, UNCOMMITTED — ZERO READERS.** Sub-flag of the reasoning layer: gates `deriveTargetSections` retrieval-targeting hints. The curated `DERIVATION_MAP` awaits a licensed fire-protection engineer's review (9 entries are labelled extrapolations in their own `why` text) before this flag is set anywhere a real user can reach. Default OFF. | `supabase/functions/fire-safety-chat/derivationMap.ts` (`DERIVATION_FLAG_ENV`, `isDerivationEnabled`) |
| `ADVISORY_AUDIENCE_LAYER_ENABLED` | **CONFIRMED implemented (wiring wave W4/W7).** Gates the audience presentation layer (engineer / decision_maker / project_owner / technician). OFF (default) = the request-body `audience` field and any `audience_hint` are IGNORED server-side — resolvedAudience is hard-forced to "engineer" and prompts stay byte-identical no matter what the client sends (the W7 supervisor added this gate after catching the layer shipping unconditionally). Gate before ON: live bench confirming every audience variant keeps citations + the evidence-language cap, zero safety-critical regression. Product note: the frontend selector is visible and persists locally even while this is OFF — flip in the same window as the frontend deploy, or hide the selector behind a `VITE_ADVISORY_AUDIENCE_LAYER_ENABLED` build flag. | `supabase/functions/fire-safety-chat/index.ts` (flag read), `queryAnalysis.ts` (`resolveAudience`), `promptContract.ts` (`getAudienceBlock`) |
| `VISION_PAGE_MANIFEST_ENABLED` | **CONFIRMED implemented (wiring wave W5).** Gates the PAGE RENDER MANIFEST block (client pageManifests validated/sanitized server-side) + the legend-aware Stage-1 planning JSON extension + legend->searchKeywords merge. OFF = vision prompts byte-identical to HEAD. Image-attached requests in ALL THREE modes flow through this — validate all three before ON. Gate: `evals/vision` before/after comparison shows extraction improvement with zero three-mode image-smoke regressions. | `supabase/functions/fire-safety-chat/index.ts`, `visionManifest.ts` |
| `VITE_ADVISORY_CITATION_DRIFT_HONESTY_ENABLED` | **CONFIRMED implemented, UNCOMMITTED — FRONTEND flag** (Vite build-time env, so flipping it requires a frontend rebuild/redeploy, not an edge-function secret). Exact-string `"1"`; default OFF is byte-identical to HEAD. Gates the R6 near-term citation-display honesty: an explicit `[SBC-…]` token's source family always beats the 900–999 digit heuristic, and deep-links resolved ONLY via the drifting `section_number` column degrade to page-range labels with medium/ambiguous confidence styling instead of asserting an exact section match. Open owner decision before enabling: with the flag ON, the exact-number path shows a cyan section badge where HEAD showed none — see the R6 lane report. Not yet listed in `.env.example` (that file is hook-protected; add the entry when the owner next edits it). | `src/components/ChatInterface.tsx`, `src/utils/sourceMetadata.ts` (`resolveSectionOnlyMatch`), `src/components/ChatMarkdownRenderer.tsx` |

Do not skip a step because a downstream flag "sounds independent." The
order encodes a real dependency: citation tokens assume vector retrieval is
already trustworthy (a token pointing at a chunk the retrieval path never
surfaces is worse than no token), and graph expansion assumes a stable seed
set to expand from — see `graphrag-design-20260823.md` Section (ب)/(ج) for
why G0/G1 gate on the *keyword and vector* seed set being unchanged before
any graph edge is added.

---

## 3. Bench gate per flag

Each gate is a single measured pass/fail line. Full metric definitions and
thresholds live in the companion documents cited per row — this table does
not restate their derivations.

| Flag | Gate | Source of the numbers |
|---|---|---|
| `ADVISORY_VECTOR_RETRIEVAL_ENABLED` | **Calibrated floor** (`VECTOR_MIN_SIMILARITY_REL=0.85`, `VECTOR_MIN_SIMILARITY_ABS=0.70`, env-overridable via `SBC_VECTOR_MIN_SIMILARITY_REL` / `SBC_VECTOR_MIN_SIMILARITY_ABS`) **+ zero regression on any `safety_critical: true` bench question.** | `retrievalPolicy.ts` (`resolveFloor`, `VECTOR_MIN_SIMILARITY_REL`, `VECTOR_MIN_SIMILARITY_ABS`); derivation and current OFF recommendation in `docs/audits/advisory-vector-bench-20260823.md` Section 4.3 and Section 10 |
| `ADVISORY_CITATION_TOKENS_ENABLED` | **Citation discipline >= 80% + refusal correctness 100% + hallucination rate <= 5%.** Note what the harness does and does not enforce: `computeMetrics()` gates on refusal correctness (100%) and hallucination rate (<= 5%) today, but reports citation discipline as **tier-B, not gating** — no producer emits the `[SBC-… \| conf:…]` token yet, so gating on it would fail every run by construction. Flipping this flag is the change that makes the tier-B number meaningful; **re-gate it in `computeMetrics()` as part of that same change**, and treat the >= 80% line as a manual read of the tier-B column until then. | `docs/advisory-acceptance.md` Section 5.3 (metric table) and 5.4 (Phase B exit); tier split implemented in `evals/lib/scoring.ts` + `computeMetrics()` in `evals/run_advisory_benchmark.ts` |
| `ADVISORY_GRAPH_EXPANSION_ENABLED` | **Citation-chain retrieval must move between OFF and ON (both linked sections appear, not just one) + expansion precision >= 60% + seed displacement = 0 + hub-pull (spurious pull toward a hub section such as 903.3.1.1) <= 5% + latency delta p95 <= +150ms.** Any one of these failing kills the flag for that measurement; a graph that "wins on average" while a safety-critical question regresses is a failing run per Section 1, item 2 above. | `docs/audits/graphrag-design-20260823.md` Section (د) 4.2 ("استرجاع سلسلة الاستشهاد", "دقّة التوسعة", "الإزاحة", "دلتا الكمون", "جاذبية المراكز") and 4.4 (refutation criteria) |
| sub-flags under `ADVISORY_GRAPH_EXPANSION_ENABLED` | Each has its own independent gate, not a shared one — see the G2 table for the specific comparison each sub-flag must win (cross-code questions only, table-labelled sections only, etc.). | `graphrag-design-20260823.md` Section (ج), "G2 — توسيع محكوم" |
| `ADVISORY_VECTOR_ANALYSIS_ENABLED`, `ADVISORY_QUERY_ANALYSIS_ENABLED` | **No gate defined yet — not shipped.** Do not flip either flag against an invented threshold; write the gate as its own dated design note (following the pattern of `advisory-vector-bench-20260823.md` or `graphrag-design-20260823.md`) before it is anything but a name in this order. | — |

---

## 4. How to run the bench

### Dry-run (harness smoke-check only — never a release gate)

```
npm run bench:dry
```

which is exactly:

```
npx deno run --allow-read --allow-write --allow-env \
  evals/run_advisory_benchmark.ts
```

`npx deno`, not bare `deno`: Deno is not installed on PATH in this
environment and is not a declared dependency in `package.json` — it resolves
through `npx` only. This matches the `npx deno check` form the verification
minimum in `.claude/skills/consultx-orchestrator/SKILL.md` already uses. A
bare `deno run` here fails with "'deno' is not recognized", and because npm
reports the script's own exit status the failure is easy to misread as a
harness problem.

No `--allow-net`: dry mode never opens a socket, and withholding the
permission is what makes that a guarantee rather than a claim.

Scores synthetic placeholder answers against `evals/advisory_benchmark.jsonl`.
Confirms the JSONL parses and the report renders. Does not call the edge
function and cannot satisfy Section 1, item 1 above.

### Live run (the only run that can justify a flag flip)

```
CONSULTX_EVAL_LIVE=1 \
CONSULTX_EDGE_URL=https://<project-ref>.supabase.co/functions/v1/fire-safety-chat \
CONSULTX_SERVICE_KEY=<supabase-service-role-jwt> \
SMOKE_USER_ID=<uuid-of-smoke-user> \
npx deno run --allow-read --allow-write --allow-env --allow-net \
  evals/run_advisory_benchmark.ts
```

- Set the target flag(s) for this run as **edge function environment
  variables in Supabase**, not in the shell that runs the harness — the
  harness calls the deployed function over HTTP, so the flag has to be live
  on the function to be measured at all.
- Never commit `CONSULTX_SERVICE_KEY` or any Gemini/Supabase key. Pass as
  shell env vars or an untracked `.env` loader, per the existing rule in
  `evals/results/README.md`.
- Output lands in `evals/results/{YYYY-MM-DD}/results.json` and
  `evals/results/{YYYY-MM-DD}/report.md` — keep both; the dated directory is
  the audit trail that Section 1, item 2 asks for when reporting a stop.
- The safety-critical check is **enforced by the harness, not manual**.
  `computeMetrics()` collects every `safety_critical: true` row that failed
  tier-A into `safety_critical_regressions`; a non-empty list forces
  `pass: false` regardless of the aggregate thresholds, prints a
  `*** REGRESSION ***` banner naming the failing `{id, mode}` pairs, renders
  them as the first section of `report.md`, and exits **non-zero**. So a
  clean exit code is a real signal here — but still read the banner, because
  a run can also exit non-zero for an ordinary threshold miss.
- Every question is run in **both** `standard` and `analysis` modes (two rows
  per question in `results.json`, distinguished by the `mode` field), plus a
  fixed two-question `primary`-mode smoke check that asserts no malformed or
  bare `[SWITCH:` token reaches displayed output. A well-formed
  `[SWITCH:استشاري]` / `[SWITCH:تحليلي]` is not a failure — stripping it is
  the frontend's job. Each row also records the `X-Retrieval-Engine`,
  `X-SBC-Sources` and `X-SBC-Source-Meta` response headers, which is how a
  run proves *which* engine actually served it rather than assuming the flag
  took effect.

### Verification before any commit that touches this stack

```
npx tsc --noEmit -p tsconfig.app.json
npm test
npm run build
npx deno check <changed functions>
```

Green build is not a release, and neither is a green dry-run — restated
from `.claude/skills/consultx-orchestrator/SKILL.md` because the failure
mode this whole document exists to prevent is exactly "the build passed and
the flag went out with no live bench run."

---

## 5. Known gaps, stated rather than papered over

- **Runner rework — CONFIRMED, reviewed, and green.** As committed at the
  start of this P1 pass (`git show HEAD`), `evals/run_advisory_benchmark.ts`
  sent `question_ar` only regardless of a row's `language`, read the response
  as JSON-or-raw-text with no SSE assembly, and had no `safety_critical`
  awareness. All three are now closed in the same uncommitted change set as
  this document: `evals/lib/sse.ts` assembles the SSE frames index.ts
  actually streams, `evals/lib/scoring.ts` holds the tier-A/tier-B
  predicates, and the runner honours `language`, `chain_pairs` and
  `safety_critical`. An earlier draft of this section recorded that work as
  "LIKELY, not CONFIRMED" concurrent activity from another lane; that was
  wrong — it is the same evals lane, and it has since been reviewed and
  pinned by `src/__tests__/evalSse.test.ts` and
  `src/__tests__/evalScoring.test.ts`. Section 4 above is written against the
  reworked runner.
- **The refusal gate is only partly backed by the prompt contract — expect
  the FIRST live run to fail here, and read that failure correctly.**
  `refusal_correctness` is a **100% gate**: one must_refuse row scored wrong
  fails the whole run. Three rows carry `must_refuse: true` (`ADV-018`,
  `ADV-019` NFPA-bait; `ADV-020` civil-defense-bait), each scored in both
  modes, so six scored rows must all pass. What the prompt actually
  guarantees, verified against `promptContract.ts` on 2026-08-25:
  - Of the five sentences the scorer accepts, exactly **one** is instructed
    output: SOURCE_SCOPE rule 4, "قل إنه غير متوفر في مصادر النظام". The four
    "canonical" sentences in `evals/lib/scoring.ts` come from
    `docs/advisory-acceptance.md` Section 3 and appear **nowhere in any
    prompt the system sends** — a grep of the repository finds them only in
    that doc, `evals/results/README.md`, and the harness itself.
  - Rule 4 is scoped to "إذا طلب المستخدم نص NFPA أو SFPE صراحة". It does
    **not** mention Civil Defense, and `ABSENT_STANDARDS` is
    `["NFPA","SFPE","IBC","IFC"]` — also no Civil Defense. So **`ADV-020` has
    no instructed refusal phrasing at all**, and its two rows are the most
    likely single cause of a first live run failing the 100% gate.
  This is a **prompt-contract gap, not a model regression and not a harness
  bug** — do not "fix" it by loosening the scorer, and do not read a red
  `refusal_correctness` here as evidence that retrieval or a flag regressed.
  Closing it means extending SOURCE_SCOPE (and `ABSENT_STANDARDS`) to cover
  the Civil Defense corpus, or teaching the prompts the acceptance-doc
  sentences — a `promptContract.ts` change, which is outside the evals lane
  and needs its own review with all three modes re-validated.
- **The scorer's three honesty boundaries, so they are not "simplified"
  later.**
  (0) The CORE_RULES per-claim labels `[NO SOURCE]` and
  `[REQUIRES SOURCE CONFIRMATION]` do **not** count as a refusal, even though
  they are literal instructed output. They are labels written in a citation
  slot, not an answer-level decline, so an answer can carry one and still
  supply the NFPA content the bait row is testing for. This is the first
  thing a maintainer will reach for when an analysis-mode must_refuse row
  scores red; reach for the prompt gap above instead.
  (1) The SOURCE_SCOPE rule 2(b) prefix
  "معرفة هندسية عامة — لا يوجد مصدر مسترجع في النظام لهذه النقطة" does **not**
  count as a refusal: it is permission to answer from general knowledge, and
  counting it would let the NFPA-bait rows pass while the answer supplies
  NFPA content. (2) The fabricated-clause check does **not** fire when an SBC
  mention sits between the section number and the standard name, because
  SOURCE_SCOPE rule 2(a) explicitly permits retrieved SBC text to reference
  NFPA. Both boundaries are asserted in `src/__tests__/evalScoring.test.ts`;
  changing either silently changes what a green bench run means.
- `evals/results/README.md` Section "Question composition" still describes
  the original 20-row set, and its command block predates the
  `npm run bench:dry` script added to `package.json` in this pass. Update it
  in the same change that next touches the harness so the two edits are
  reviewed together.
- The SAMPLER taxonomy (`SAMPLER_OCCUPANCY_SEVERITY.json`,
  `SAMPLER_CONSTRUCTION_TYPES.json`, `SAMPLER_SPATIAL_METRICS.json`,
  `SAMPLER_PEDESTRIAN_SAFETY.json`, `SAMPLER_FIRE_DAMPERS_PENETRATIONS.json`,
  `SAMPLER_ACCESSIBILITY_EGRESS.json`, `SAMPLER_REFERENCED_STANDARDS.json`)
  has no category for fire pumps, foam/clean-agent suppression, fire-alarm
  control panels, or fire hydrants/water supply — all four appear in the new
  Arabic glossary-gap rows because the topic list requested them, but none
  maps to an existing sampler file. Recorded here so the gap is a decision
  for a future sampler, not something rediscovered from scratch.
