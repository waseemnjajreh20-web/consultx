# ConsultX Engineering Knowledge Brain V1 — Plan

**Status:** PLAN ONLY. No execution beyond reading and writing this document.
**Date:** 2026-05-01
**Scope:** Group M Mercantile fire-protection domain, end to end, as the proving slice.
**Companion:** `reports/d_sbc_consultx_architecture_audit.{md,json}` and `reports/d_sbc_consultx_integration_plan.md` already cover Phases 1–2 inventory and the live retrieval map. This plan does not duplicate them.

---

## Phases 1 + 2 — already covered

The prior audit established:
- 597 files at root in `D:\sbc_consultx`, 518 section MDs, 47+82 Python scripts, 18 raw PDFs, 13 raw extraction texts, 3 root JSONs, the `wiki/architecture/` governance set, `wiki/synthesis/`, `wiki/concepts/`.
- 7-layer architecture (PDFs → raw OCR → section MDs → canonical-build-ledger → cross-code edges → synthesis → concepts).
- 12 PROVEN cross-code edges (4 types: `construction_or_height_area_…`, `egress_context_to_fire_life_safety_…`, `exceptions_and_special_conditions`, `general_admin_or_scope_…`).
- 550-node ledger split 291 EXISTS_CANONICAL / 196 PRESENT_BUT_NOT_CANONICAL / 63 QUARANTINED.
- Live retrieval uses keyword-only path (`fetchSBCContext`) over bucket page-range chunks plus `fetchStructuredTables` (93 rows post-Step-4.2). Vector RPC bypassed in Advisory.

Treat that audit as the input to Phase 3.

## Phase 3 — Brain V1 data contract (the spec, not the implementation)

The Brain V1 package defines five strict layers.

### A. Source Evidence (canonical_verbatim only)
```
SourceEvidence {
  id                     // e.g. "sbc-801-section-903.2.7"
  source_code            // "SBC-201" | "SBC-801"
  edition                // "2024"
  chapter                // 9
  section_ref            // "903.2.7"
  paragraph_ref          // null | "907.2.7.1" | "Exception 2"
  title                  // "Group M Automatic Sprinkler System"
  source_pages           // "pp. 443–471"
  source_pdf_key         // "SBC 801 - The Saudi Fire Protection Code (3)-401-600.pdf"
  pdf_extract_anchor     // "extracted_sections.md:869-897"
  content_kind           // "canonical_verbatim"
  content                // verbatim source text only — no commentary
  canonical_status       // "EXISTS_CANONICAL" | "PARTIAL_STRUCTURED" | "STUB"
  extraction_status      // "complete" | "partial" | "needs_review"
  confidence             // "high" | "medium" — never "low" for source evidence
  checksum               // sha-256 of content
}
```
Hard rule: any block tagged with `LLM_SYNTHESIS` or unattributed engineering commentary in the source MD is **excluded** from this layer.

### B. Structured Facts (derived statements with source refs)
```
Fact {
  id                     // e.g. "fact-group-m-sprinkler-1115"
  fact_type              // "threshold" | "condition" | "exception" | "definition"
  statement              // human-readable
  value                  // 1115
  unit                   // "m²"
  scope                  // "Group M, single fire area"
  conditions             // [{type:"comparison", op:">", value:1115, unit:"m²"}]
  exceptions             // ["covered/open mall — 907.2.7 Exception 1"]
  source_refs            // ["sbc-801-section-903.2.7"]  (NON-EMPTY)
  applicable_modes       // ["main","advisory","analytical"]
  not_citable_without_source_refs: true
  confidence             // "high"
}
```
Hard rule: a Fact with empty `source_refs` is invalid and dropped at validation.

### C. Knowledge Relations (graph edges)
```
Relation {
  id
  from_ref               // SourceEvidence.id or Concept.id
  to_ref                 // SourceEvidence.id or Concept.id
  relation_type
  // V1 enum: parent_child, exception_of, condition_triggers_requirement,
  //          classification_triggers_system, table_supports_section,
  //          concept_explains_section, code_to_code, analytical_check_depends_on
  direction              // "from→to" | "bidirectional"
  reason                 // short engineering rationale (≤200 chars)
  source_basis           // section/paragraph that proves the link
  confidence             // "PROVEN" | "INFERRED" | "SYNTHESIS"
  applicable_modes       // ["advisory"] by default; "analytical" when relevant
  not_citable_as_source  // true — relations support reasoning, never replace verbatim
}
```
Hard rule: only `confidence:PROVEN` relations are loaded into Advisory's reasoning context; `INFERRED` and `SYNTHESIS` are kept in the manifest but flagged.

### D. Synthesis (Advisory-shaped artifacts)
```
DecisionTree {
  id
  use_case               // "group-m-fire-protection-required"
  steps[]                // ordered nodes; each step has source_refs or relation_refs
  required_inputs        // ["occupancy_classification","floor_area","stories",
                         //  "existing_sprinkler","mall_status"]
  missing_info_prompts   // Arabic + English clarifying questions per missing input
  source_refs            // every step must back to source or relation
  relation_refs
  applicable_modes       // ["advisory"] (analytical may consume as a checklist)
  not_legal_source       // true
}
```

### E. Mode Policy
- **Main:** SourceEvidence concise summary only. Relations not used. Synthesis not used. Output ≤120 chars where possible.
- **Advisory:** SourceEvidence + Relations (`PROVEN` only) + Facts + Synthesis as scaffolding. Citations come from SourceEvidence; relations and synthesis explain "why" without becoming citations.
- **Analytical:** SourceEvidence + Relations (typed `analytical_check_depends_on`) + Facts. Synthesis is read as a checklist but never quoted as legal source. The existing `validateAnalyticalReport` post-stream pass is preserved.

## Phase 4 — V1 scope (confirmed against owner brief)

Sources:
- SBC 201 Section 309 (Mercantile classification)
- SBC 801 Sections 903.2 (parent), 903.2.7, 903.2.7.1, 903.2.7.2
- SBC 801 Sections 907.2 (parent), 907.2.7, 907.2.7.1

Concepts: Mercantile occupancy, fire area, automatic sprinkler system, manual fire alarm system, occupant notification, high-piled storage, upholstered furniture/mattresses.

Relations (initial set, all PROVEN):
- 309 Group M classification → 903.2.7 sprinkler trigger (`classification_triggers_system`)
- 309 Group M classification → 907.2.7 alarm trigger (`classification_triggers_system`)
- 903.2.7 ↔ 903.2.7.1 (`parent_child`)
- 903.2.7 ↔ 903.2.7.2 (`parent_child`)
- 907.2.7 ↔ 907.2.7.1 (`parent_child`)
- 903.2.7 fire area > 1115 m² → sprinkler required (`condition_triggers_requirement`)
- 903.2.7 combined area > 2230 m² → sprinkler required (`condition_triggers_requirement`)
- 907.2.7 occupant load ≥ 500 → manual fire alarm required (`condition_triggers_requirement`)
- 907.2.7 Exception 2 (sprinkler + waterflow) → manual boxes optional (`exception_of`)
- 907.2.7 Exception 1 (covered/open mall per SBC 201 §402) → no manual fire alarm (`code_to_code`)
- Fact 1,115 m² supports 903.2.7 (`table_supports_section`)
- Fact 500/100 occupant load supports 907.2.7 (`table_supports_section`)

Out of scope for V1: 903.2.1–903.2.11 other than 7; 907.2.1–907.2.13 other than 7; egress 1011/1014/1017; occupancy 308/310/311; cross-code edges to 602/Construction-type. These are explicitly deferred to V2 batches.

## Phase 5 — Gap audit methodology (the table I will produce when executing)

For each V1 item, columns:
- `item_id`, `item_type` (source/fact/relation/synthesis), `source_code`, `section_ref`
- `local_path`, `canonical_status`, `exact_text_available`, `source_pages_available`, `pdf_available`
- `relation_available`, `extraction_complete`, `quality`
- `action` ∈ {`reuse_existing`, `clean_existing`, `targeted_extract_from_local_pdf`, `relation_manual_review`, `quarantine`}
- `reason`

Pre-known gap from the architecture audit: `sbc-801-section-907.md` lacks the verbatim 907.2.7 block (it has the §907.1–§907.2.1 block plus a commentary table). Verbatim text is present in `extracted_907_909.txt:1312-1409`. Action: `clean_existing` — synthesize a single SourceEvidence record by combining the section MD's frontmatter (page anchor `pp. 531–588`) with the verbatim block from the extracted text. No new PDF extraction needed.

The same applies for 903.2.7 (the verbatim block lives in `extracted_sections.md:869-897`; the parent MD `sbc-801-section-903.md` has frontmatter but only summary body for the sub-clause).

If any V1 item is fully missing in both Layer C and Layer B, run a targeted extractor against the relevant page range of the local PDF — but this is only allowed for confirmed gaps, never for the V1 happy-path sections.

## Phase 6 — Project-owned Brain V1 source snapshot (LOCAL ONLY)

Layout:
```
data/consultx_brain/v1/
  sources/
    sbc-201-section-309.md            ← copy from D:\sbc_consultx\sbc-201-section-309.md
    sbc-801-section-903.md            ← cleaned: frontmatter from local MD + verbatim 903.2.7/.1/.2 from extracted_sections.md
    sbc-801-section-907.md            ← cleaned: frontmatter from local MD + verbatim 907.2.7/.1 from extracted_907_909.txt
  relations/
    group-m-fire-protection-relations.json
  facts/
    group-m-thresholds.json
  synthesis/
    group-m-advisory-decision-tree.md ← derived ONLY from source-backed steps
  manifests/
    source_manifest.json              ← entries with source_path, copied_at, checksum, canonical_status, extraction_status, allowed_use, intended_live_target
    relation_manifest.json
  validation/
    .gitkeep
```

Rules baked into the writer:
- `allowed_use` is one of `evidence | fact | relation | synthesis` and never set to `evidence` for any LLM_SYNTHESIS-tagged content.
- `intended_live_target` is one of `bucket_chunk | sbc_code_tables | runtime_sidecar` per item.
- Every file is sourced from `D:\sbc_consultx`; no synthesis we author here lands in `evidence`.
- We do **not** copy raw PDFs into the repo. We reference them by `source_pdf_key`.

## Phase 7 — Targeted extraction (only if Phase 5 surfaces a confirmed gap)

If the gap audit shows a missing block, write outputs under:
```
data/consultx_brain/v1/sources/extracted_gaps/
  <section>.md                ← the freshly extracted text
  <section>.meta.json         ← {source_pdf, page_range, extraction_method, confidence, requires_review}
```
For V1 the architecture audit has already shown both 903.2.7 and 907.2.7 verbatim are present in Layer B — no extraction expected.

## Phase 8 — Compiled Brain V1 outputs (LOCAL ONLY)

Generator: `scripts/build-consultx-brain-v1.cjs`
Inputs: `data/consultx_brain/v1/`
Outputs:
```
generated/consultx_brain_v1/
  SBC201_Ch3_GroupM_canonical_v1_chunks.json
  SBC801_Ch9_GroupM_canonical_v1_chunks.json
  group_m_relations_v1.json
  group_m_facts_v1.json
  group_m_advisory_decision_tree_v1.json
  validation_report_v1.json
  rollback_manifest_v1.json
```
Each chunk follows the schema in Phase 3 §A; relations and facts follow §C/§B. The `rollback_manifest_v1.json` lists every file path that would be uploaded/inserted in Phase 13, so we can mechanically un-do the production apply.

## Phase 9 — Local validation

`scripts/build-consultx-brain-v1.cjs` runs the validators inline and emits `validation_report_v1.json` with PASS/FAIL on the 16 invariants the owner enumerated. The build fails closed (non-zero exit code) on any FAIL.

## Phase 10 — Live integration route (analysis + recommendation; no production change yet)

I will inspect `fire-safety-chat`, `fetchSBCContext`, `fetchStructuredTables`, Evidence Ledger, Citation Verifier, SourcePanel, sbc_documents usage, and graph_nodes/graph_edges read-only.

Recommended Route (subject to inspection): **Route C — Hybrid**:
- Bucket: upload the canonical chunks (`SBC{201,801}_Ch{3,9}_GroupM_canonical_v1_chunks.json`) to `ssss` so existing keyword retrieval finds them. The chunk shape mirrors the existing `_extracted_chunks.json` files so no retrieval logic change is needed for SourceEvidence.
- DB: continue surgically into `sbc_code_tables` for Facts that map to existing structured-chip UI (e.g. extra rows for 903.2.7.1, 903.2.7.2, 907.2.7.1 if useful for chip-surfacing).
- Sidecar: upload `group_m_relations_v1.json` + `group_m_facts_v1.json` + `group_m_advisory_decision_tree_v1.json` to a small new path inside `ssss` (e.g. `ssss/brain_v1/`). `fire-safety-chat` reads these once per request when Advisory mode is active and the retrieved sources include any V1 section.

Why hybrid: keeps blast radius ≈ Step 4.x for evidence; defers a `graph_edges` table until V2; the relation/fact sidecars are JSON-typed and Step-4-verifier-safe (relations are never citable, facts always carry source_refs).

## Phase 11 — Runtime support (smallest change set)

Proposed minimal `fire-safety-chat` changes:
1. After `fetchSBCContext` runs, if `mode === "standard"` AND any retrieved file matches the new `*_GroupM_canonical_v1_chunks.json` pattern, also fetch `ssss/brain_v1/group_m_relations_v1.json` and `ssss/brain_v1/group_m_facts_v1.json` (cached). Append a compact context block:
   ```
   📋 KNOWLEDGE RELATIONS (reasoning aid; not citable):
   - <from> → <to> [<type>] — <reason>  (basis: <source_basis>)
   📋 STRUCTURED FACTS (citable only via source_refs):
   - <statement> = <value> <unit>  (source: <source_refs>)
   ```
2. Step 4 verifier extension: tokens whose only support is a relation are downgraded to `conf:low | section_label:relation_only`. Facts must cite a `source_refs` entry that exists in the ledger.
3. Main mode: never load relation/fact sidecars; canonical chunks are still findable for short answers.
4. Analytical: relations of `relation_type:analytical_check_depends_on` are loaded; the rest are filtered out.
5. No streaming change; the existing buffered Advisory path absorbs the small extra context.

UI: no changes. Chunk-level chips already surface SBC 801 / SBC 201 sources via Step 4.1 if needed; relation/fact context is internal.

## Phase 12 — Approval checkpoint (this is where execution stops)

Before Phase 13 I will return:
1. Phase 6 directory tree with file list and checksums.
2. Phase 7 extraction artifacts if any (expected: none).
3. Phase 8 generated outputs with row/edge counts.
4. Phase 9 validation report (PASS/FAIL).
5. Diff scope: only `data/consultx_brain/v1/`, `generated/consultx_brain_v1/`, `scripts/build-consultx-brain-v1.cjs`, plus a `reports/consultx_brain_v1_phase12_checkpoint.md` summarising it.
6. Concrete production apply plan: list of bucket files to upload, optional `sbc_code_tables` extra rows (probably zero — 903.2.7 / 907.2.7 already seeded in Step 4.2), and the exact `fire-safety-chat` patch.
7. Rollback plan.
8. Expected behaviour change in Main / Advisory / Analytical.

**HARD STOP at Phase 12.** No bucket upload, no DB write, no edge deploy, no Vercel deploy without explicit owner approval.

## Phase 13–15 — only after approval

13. Upload bucket chunks + sidecars; deploy `fire-safety-chat` if patch is in scope.
14. Live retest: Advisory Group M / 1,200 m² question, plus Main and Analytical sanity (each with the explicit PASS criteria the owner listed).
15. Final report (what was built / not built, validation results, live test results, rollback path, V2 batch roadmap).

## Reversibility and safety

- Every artifact lives under `data/consultx_brain/v1/` or `generated/consultx_brain_v1/`. Nothing under `src/`, `supabase/migrations/`, or `supabase/functions/` is touched in Phases 1–11.
- The sole runtime change in Phase 13 is one patch in `fire-safety-chat/index.ts` (estimated <100 LOC) plus bucket uploads — both fully reversible by `git revert` + bucket file delete.
- No payment, no Enterprise, no migrations, no `supabase db push`, no GraphRAG activation, no UI redesign, no PDF re-extraction beyond confirmed gaps (none expected for V1).

## What I am explicitly NOT doing in this task

- Not redesigning `SourcePanel`.
- Not enabling `match_sbc_documents` RPC.
- Not migrating `sbc_documents.section_number` drift (Step 2.6 work).
- Not authoring a new `graph_edges` schema.
- Not importing the full 518 section MDs.
- Not rerunning any of the 129 Python extraction scripts.

---

## Decision requested

Approve to proceed with **Phases 6–11 (local-only)** and STOP at Phase 12 for review.

If approved, expect the next message to contain:
- the new directory tree under `data/consultx_brain/v1/` with file checksums
- the validation report
- the proposed Phase 13 production apply plan
- and an explicit "**STOP — approval required for Phases 13–15**" line.
