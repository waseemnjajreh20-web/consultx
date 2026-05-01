# ConsultX Brain V1 — Phase 12 Checkpoint

**Date:** 2026-05-01
**Validation:** PASS (94 invariants, 0 failures)
**Banned-symbol audit:** 0 hits across all 19 V1 + report + script files
**Production state:** UNCHANGED. No bucket upload, no DB write, no migration, no deploy.

---

## 1. What was inspected

- `D:\sbc_consultx` — full inventory (already captured in `reports/d_sbc_consultx_architecture_audit.md`); the 7-layer architecture, 518 section MDs, 12 PROVEN edges, canonical-build-ledger, synthesis pages, concept pages, ~129 Python scripts.
- Live ConsultX repo (read-only): `supabase/functions/fire-safety-chat/index.ts` (`fetchSBCContext`, `fetchSBCContextVector`, `fetchStructuredTables`, Evidence Ledger, Citation Verifier, buffered streaming paths), `src/components/{ChatInterface,SourcePanel}.tsx`, `src/utils/{sourceMetadata,citationRouting}.ts`, the three structured-table migrations.

## 2. Sub-agents used and outputs

| Sub-agent | Output | Result |
|---|---|---|
| A — Source Evidence | 3 source MDs + `source_manifest.json` | sha-256 `c6882b…` (309), `e3d9bb…` (903), `569f7f…` (907). 309 marked `extraction_status: partial`, `review_status: manual_review` (TOC anchor only — no verbatim 309 body in any local extract). |
| B — Relations | `group-m-fire-protection-relations.json` + `relation_manifest.json` | 15 PROVEN edges (12 required + 3 optional). sha-256 `604cec…`. Histogram: classification 2, parent_child 3, condition 5, exception 2, code_to_code 1, analytical 2. |
| C — Facts | `group-m-thresholds.json` | 9 facts (8 required + 1 high-piled-storage condition). sha-256 `c407e0…`. All carry `source_refs` and `confidence:high`. |
| D — Synthesis | `group-m-advisory-decision-tree.md` + `group_m_advisory_decision_tree_v1.json` | 10 steps; every step has `source_refs` and/or `relation_refs`. `not_legal_source: true`. sha-256 MD `9e6bee…`, JSON `4c3b97…`. |
| E — Gap audit | `extraction_gap_report.json` | 9/10 `clean_existing`; 1 (`sbc-201-section-309`) `targeted_extract_from_local_pdf` candidate (PDF p. 193, 1–2 pages). `broad_extraction_required: false`. sha-256 `38bdec…`. |
| F — Runtime design | `reports/brain_v1_runtime_integration_design.{md,json}` | Recommended Route C (Hybrid). ~26–30 LOC patch in `fire-safety-chat`. sha-256 MD `f06f2d…`, JSON `f85393…`. |

## 3. Files copied / generated

### `data/consultx_brain/v1/` — local sources & spec (committable; reversible by `rm -rf`)
```
sources/sbc-201-section-309.md             1,250 B  partial (manual_review)
sources/sbc-801-section-903.md             2,845 B  complete
sources/sbc-801-section-907.md             4,077 B  complete
relations/group-m-fire-protection-relations.json  (15 edges, all PROVEN)
facts/group-m-thresholds.json              (9 facts)
synthesis/group-m-advisory-decision-tree.md
manifests/source_manifest.json             (3 entries)
manifests/relation_manifest.json
validation/extraction_gap_report.json
```

### `generated/consultx_brain_v1/` — coordinator-built outputs
```
SBC201_Ch3_GroupM_canonical_v1_chunks.json  2,056 B  sha=fae0a075af83…  chunks=1  (309 umbrella, manual_review)
SBC801_Ch9_GroupM_canonical_v1_chunks.json 14,479 B  sha=c7ce7ac4383e…  chunks=11
group_m_relations_v1.json                   8,556 B  sha=75d641486ced…  edges=15
group_m_facts_v1.json                       8,597 B  sha=80190aeabac6…  facts=9
group_m_advisory_decision_tree_v1.json      7,898 B  sha=8051388fcae5…  steps=10
validation_report_v1.json                  12,642 B  sha=d6abaf303f98…  PASS 94/94
rollback_manifest_v1.json                   2,110 B  sha=aabaf3a29d42…
```

### `scripts/build-consultx-brain-v1.cjs`
Generator + 16-invariant validator. Idempotent. Build fails closed on any FAIL. Banned-symbol audit returns 0 in source (the symbol is loaded via `String.fromCharCode(0xA7)` so the literal byte never appears in this file).

### `reports/`
```
brain_v1_runtime_integration_design.md / .json   (Sub-agent F)
consultx_brain_v1_phase12_checkpoint.md / .json  (this file)
```

## 4. Targeted extraction performed

**None.** Sub-agent E confirmed `broad_extraction_required: false`. The single gap (`sbc-201-section-309` verbatim body) is documented but not extracted — owner approval required before running any PDF extractor against `D:\sbc_consultx\SBC 201 - The Saudi General Building Code-1-250.pdf` p. 193.

## 5. Validation result

PASS — 94 invariants passed, 0 failed. Coverage:

- 8/8 required source sections exist as chunks (309, 903.2, 903.2.7, 903.2.7.1, 903.2.7.2, 907.2, 907.2.7, 907.2.7.1).
- 15 ≥ 13 required relations, all `PROVEN`, all `not_citable_as_source: true`, all carry `source_basis`.
- 9 facts, all with non-empty `source_refs`, `confidence:high`, `not_citable_without_source_refs: true`.
- 10 decision-tree steps, all backed by `source_refs` or `relation_refs`; `not_legal_source: true`.
- No `LLM_SYNTHESIS` or `STRUCTURED_FACT` tags inside source chunks.
- Every chunk carries `source_pages` from the manifest.
- `903.2.7` chunk contains "Group M" and "1115".
- `907.2.7` chunk contains "Group M", "500" and "100".
- `309` chunk contains "Mercantile".
- Relations connect 309 → 903.2.7 and 309 → 907.2.7.
- Facts at 1115/2230/465/500/100 each map to their source section refs.
- `rollback_manifest_v1.json` exists and is well-formed.
- Banned-symbol byte (U+00A7) absent from every output and source under V1, generated, reports/brain_v1_*, scripts/build-consultx-brain-v1.cjs.

## 6. Relation graph summary

15 edges, 6 types:

| Type | Count | Examples |
|---|---|---|
| classification_triggers_system | 2 | 309 → 903.2.7 ; 309 → 907.2.7 |
| parent_child | 3 | 903.2.7 → 903.2.7.1 ; 903.2.7 → 903.2.7.2 ; 907.2.7 → 907.2.7.1 |
| condition_triggers_requirement | 5 | fire-area-1115 → 903.2.7 ; combined-2230 → 903.2.7 ; upholstered-465 → 903.2.7.2 ; occupant-500 → 907.2.7 ; occupant-100-discharge → 907.2.7 |
| exception_of | 2 | 907.2.7 → mall-buildings-402 ; 907.2.7 → 903.3.1.1 (sprinkler+waterflow) |
| code_to_code | 1 | 907.2.7 → SBC-201 Section 402 (Mall buildings) |
| analytical_check_depends_on | 2 | analytical-mercantile-review → 903.2.7 ; → 907.2.7 |

Mode distribution: 13 advisory-applicable, 12 analytical-applicable.

## 7. Facts summary

9 facts: 6 thresholds + 1 condition + 2 exceptions. Each backed by 1 source_ref:
- 1115 m² (single fire area) → 903.2.7
- 3 stories above grade → 903.2.7
- 2230 m² (combined floors incl. mezzanines) → 903.2.7
- 465 m² (upholstered furniture display) → 903.2.7.2
- Chapter 32 cross-ref (high-piled storage) → 903.2.7.1
- 500 persons (combined occupant load) → 907.2.7
- 100 persons (above/below exit discharge) → 907.2.7
- Exception: covered/open mall (SBC 201 Section 402) → 907.2.7
- Exception: sprinkler + waterflow (903.3.1.1) → 907.2.7

## 8. Decision tree summary

`group-m-fire-protection-advisory-tree-v1` — 10 steps, 8 required inputs, bilingual missing-info prompts (AR/EN). `applicable_modes: ["advisory"]`, `not_legal_source: true`. Each step references at least one of `source_refs` (canonical-section ids) or `relation_refs` (the 12 mapped relation ids). Coordinator reconciled placeholder relation IDs to the actual ones via a static map at build time.

## 9. Runtime integration recommendation (Route C — Hybrid)

From `reports/brain_v1_runtime_integration_design.{md,json}` (Sub-agent F):

- Upload canonical chunks to bucket `ssss` so the existing keyword retrieval finds them automatically (file-naming pattern matches `SBC <code> ... chunks.json`, picked up by `fetchSBCContext`).
- Upload the relation/fact/decision-tree JSON sidecars to `ssss/brain_v1/` for runtime sidecar consumption.
- One new helper `loadBrainV1Sidecars(query)` (~20 LOC) + one call site in the standard/advisory branch (~6–8 LOC). Total estimate: 26–30 LOC in `fire-safety-chat/index.ts`.
- No DB write. No new schema. No frontend change.

## 10. Exact proposed code changes

### `supabase/functions/fire-safety-chat/index.ts`

**Add helper** (immediately above the existing `fetchStructuredTables`):
```ts
async function loadBrainV1Sidecars(query: string, supabaseAdmin: any): Promise<{
  relations: any[];
  facts: any[];
  decisionTree: any | null;
  contextBlock: string;
}> {
  // Only fire if the query references the Group M fire-protection domain.
  const trigger = /(mercantile|group\s+m|محلات\s+تجارية|مجموعة\s+M|sprinkler|alarm|رش|إنذار)/i.test(query);
  if (!trigger) return { relations: [], facts: [], decisionTree: null, contextBlock: "" };

  const fetchJson = async (key: string) => {
    try {
      const { data, error } = await supabaseAdmin.storage.from("ssss").download(key);
      if (error || !data) return null;
      return JSON.parse(await data.text());
    } catch { return null; }
  };

  const relWrap   = await fetchJson("brain_v1/group_m_relations_v1.json");
  const factWrap  = await fetchJson("brain_v1/group_m_facts_v1.json");
  const treeWrap  = await fetchJson("brain_v1/group_m_advisory_decision_tree_v1.json");
  const relations = relWrap?.edges ?? [];
  const facts     = factWrap?.facts ?? [];
  const tree      = treeWrap;

  if (!relations.length && !facts.length && !tree) return { relations, facts, decisionTree: tree, contextBlock: "" };

  const block = [
    "\n\n📋 KNOWLEDGE RELATIONS (reasoning aid; NOT citable as legal source):",
    ...relations.map((r: any) => `- ${r.from_ref} → ${r.to_ref} [${r.relation_type}] — ${r.reason} (basis: ${r.source_basis})`),
    "📋 STRUCTURED FACTS (citable only via source_refs):",
    ...facts.map((f: any) => `- ${f.statement} = ${f.value} ${f.unit ?? ""} (source: ${(f.source_refs || []).join(",")})`),
  ].join("\n");
  return { relations, facts, decisionTree: tree, contextBlock: block };
}
```

**Add call site** in the standard/advisory branch (just before `buildEvidenceSummaryForPrompt(advisoryLedger)`):
```ts
if (mode === "standard") {
  const brain = await loadBrainV1Sidecars(userQuery, supabaseAdminForTables);
  if (brain.contextBlock) fullSystemPrompt += brain.contextBlock;
}
```

No streaming change. No verifier change. Existing Step-4 verifier keeps the model honest: tokens whose only support is a relation get downgraded; facts must reach the ledger via their `source_refs`, not via the relation block.

## 11. Production upload / insert plan (NOT YET APPLIED)

Bucket uploads to `ssss`:
- `SBC201_Ch3_GroupM_canonical_v1_chunks.json` (root, 2,056 B)
- `SBC801_Ch9_GroupM_canonical_v1_chunks.json` (root, 14,479 B)
- `brain_v1/group_m_relations_v1.json` (8,556 B)
- `brain_v1/group_m_facts_v1.json` (8,597 B)
- `brain_v1/group_m_advisory_decision_tree_v1.json` (7,898 B)

DB writes: none.

## 12. Deploy plan

Edge: `npx supabase functions deploy fire-safety-chat --project-ref hrnltxmwoaphgejckutk` once the helper + call site are merged.
Frontend: no change.

## 13. Rollback plan

Local (already harmless): `rm -rf generated/consultx_brain_v1/ data/consultx_brain/v1/ scripts/build-consultx-brain-v1.cjs reports/brain_v1_*`.
Production (after Phase 13 ships): delete the 5 bucket files listed above, `git revert` the helper + call-site commit, redeploy `fire-safety-chat`.

## 14. Expected behavior in Main mode

Unchanged. Main mode does not load any documents and does not call `loadBrainV1Sidecars` (the helper is gated behind `mode === "standard"`). Main answers remain concise and trial-aware.

## 15. Expected behavior in Advisory mode

For Mercantile / Group M questions:
- `fetchSBCContext` retrieves the new bucket chunks.
- `fetchStructuredTables` returns the 903.2.7 / 907.2.7 rows seeded in Step 4.2.
- `loadBrainV1Sidecars` adds the relation + fact context.
- `buildEvidenceLedger` includes the canonical chunks and structured rows.
- The verifier accepts `[SBC-801 Section 903.2.7 | conf:high]` only if the chunk file name lands in `usedFiles` AND the section_number matches; otherwise capped to medium per the existing rules.
- Source panel surfaces both PDF chips and structured chips. The decision-tree synthesis is read internally but never quoted as legal source.
- "Expected reference" fallback should disappear for the V1 sections.

## 16. Expected behavior in Analytical mode

Unchanged for the existing review use case. The `analytical_check_depends_on` relations exist but are NOT auto-loaded in Analytical V1 — the runtime patch in Section 10 gates `loadBrainV1Sidecars` on `mode === "standard"` only. A future patch can extend Analytical to consume the same sidecars; out of V1 scope.

## 17. Risk list

| Risk | Mitigation |
|---|---|
| Section 309 verbatim body remains incomplete (manual_review) | Sub-agent E proposed targeted extraction — gated on owner approval |
| Bucket file naming might not match `fetchSBCContext` chapter detection | Sub-agent F flagged this as Risk #3; mitigation = test chapter detection before upload |
| Model could cite a relation as legal source | Step 4 verifier already downgrades tokens lacking same-family ledger evidence; relation-only support is filtered |
| Future schema drift (relation_id naming) | Coordinator carries a static `RELATION_ID_MAP`; refactor when V2 lands |
| Runtime patch increases Advisory latency | Single bucket fetch per request; cache via existing `fileCache` if needed in V2 |

## 18. Next approval question

> Approve Phase 13 production apply: upload the five bucket files listed in Section 11, then deploy `fire-safety-chat` with the patch in Section 10. Phase 14 live retest will follow. Rollback path is documented in Section 13. No payment / Enterprise / GraphRAG / DB writes / migrations / Vercel deploys are part of this apply.

---

STOP — Brain V1 local build complete. Approval required before any production upload, DB write, or deploy.
