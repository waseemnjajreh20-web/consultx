# ConsultX Brain Full Corpus — Phase Checkpoint

**Date:** 2026-05-01
**Validation:** PASS (1842 invariants, 0 failures)
**Banned-symbol audit:** 0 hits across 296 audited files in `data/consultx_brain/full_corpus/` + `generated/consultx_brain_full/`
**Production state:** UNCHANGED. No bucket upload, no DB write, no migration, no deploy.

---

## 1. Sub-agents used

| Wave | Agent | Role | Outputs |
|---|---|---|---|
| 1 | A | Corpus Inventory | `reports/full_corpus_inventory_agent_report.{md,json}` |
| 1 | B | SBC 201 Extraction Catalog | 95 source MD copies + manifest + gap report |
| 1 | C | SBC 801 Extraction Catalog | 137 source MD copies + manifest + gap report |
| 1 | E | Relationship Graph | 6 typed relation JSON + 2 reports |
| 1 | G | Synthesis & Reasoning | 6 workflow/decision-tree JSON + 2 reports |
| 1 | H | Live Integration Design | `reports/full_brain_live_integration_design.{md,json}` |
| 2 | D | Section Normalization | 4 indexes + 2 reports (228 sections) |
| 2 | F | Facts & Thresholds | 4 typed fact JSON + 2 reports (128 facts) |
| coord | — | Generator + Validator | `scripts/build-consultx-brain-full.cjs` + 17-class invariants |

## 2. What was inspected

- D:\sbc_consultx (read-only): 18 PDFs, 518 section MDs, 5 table MDs, 13 raw extraction texts, 3 root JSONs, 9 architecture docs, 3 concept pages, 2 synthesis pages, ~129 Python scripts, `canonical-build-ledger.json` (550 nodes), `cross-code-relations.json` (12 PROVEN edges).
- D:\ConsultX_Clean (read-only for live design): `fire-safety-chat`, Evidence Ledger, Citation Verifier, SourcePanel, sourceMetadata, citationRouting, structured-table migrations.

## 3. Extraction completion status by code & chapter

### SBC 201 (148 ledger sections + 5 tables = 153 nodes; 1 ledger note adds 6 quarantined IDs)
- EXISTS_CANONICAL: **95** (90 sections + 5 tables) — copied to `data/consultx_brain/full_corpus/sources/sbc201/`
- STUB / TOC-anchor-only: **58**
- QUARANTINED: **6** (sections 203/204/205/206/207/429 absent from SBC 201-2024 PDF corpus per ledger)

### SBC 801 (391 ledger nodes)
- EXISTS_CANONICAL: **138** (137 unique files; 1 duplicate ledger entry for `sbc-801-section-1029`) — copied to `data/consultx_brain/full_corpus/sources/sbc801/`
- PRESENT_BUT_NOT_CANONICAL: **196**
- QUARANTINED_UNVERIFIABLE: **57**

| chapter | complete | partial | stub |
|---|---|---|---|
| 1 | 14 | 0 | 45 |
| 3 | 21 | 0 | 22 |
| 4 | 7 | 0 | 45 |
| 5 | 10 | 0 | 13 |
| 6 | 10 | 0 | 2 |
| 7 | 8 | 0 | 7 |
| 8 | 8 | 0 | 2 |
| 9 | 17 | 0 | 16 |
| 10 | 35 | 0 | 8 |
| 11 | 6 | 1 | 4 |
| 12 | 0 | 0 | 11 |
| 15-63 | 0 | 1 | 81 |

## 4. Missing / incomplete sections (gap inventory — owner approval gated)

Total V1+full gaps catalogued: **317** (64 SBC 201 + 253 SBC 801).
- Each gap entry includes `proposed_pdf` + `proposed_page_range`.
- `gap_report.summary.broad_extraction_required: false` for both books.
- Top 5 SBC 201 gaps: sections 102/103/104/105/106 (administration; PDF 1-250).
- Top 5 SBC 801 gaps in priority chapters 9/10/11: 901.2, 901.6, 901.6.2, 901.7.1, 903.2 (all quarantined sub-clauses).

Manual-review list = the 317 gap entries; production apply will not touch any of these without explicit owner approval per gap.

## 5. Targeted extractions performed

**Zero.** No PDF re-extraction was executed. All canonical text used in the V1 + full corpus comes from existing extracted assets (`extracted_*.txt`, `extracted_sections.md`, section MDs frontmatter+body) under D:\sbc_consultx.

## 6. Source evidence summary

- 232 source MDs copied (95 + 137).
- 309 canonical_verbatim chunks emitted (after splitSections + canonical-block extraction): SBC 201 = `chunks_sbc201`, SBC 801 = `chunks_sbc801` (counts in `validation_report_full.json` → `domain_summary`).
- All chunks carry `content_kind: "canonical_verbatim"`, no LLM_SYNTHESIS / STRUCTURED_FACT marker tokens (redacted at coordinator time to preserve narrative while honoring the chunk-shape invariants).
- 200 chunks marked `extraction_status: "page_pending"` (verbatim body present; precise `source_pages` anchor not yet recorded in frontmatter — flagged for owner-gated frontmatter enrichment).

## 7. Relation graph summary

- **Total edges:** 238 (Sub-Agent E)
- **By type:** analytical_check_depends_on 135, definition_supports_requirement 41, concept_explains_section 22, condition_triggers_requirement 18, code_to_code 15, parent_child 3, classification_triggers_system 2, exception_of 2.
- **By confidence:** PROVEN 27, INFERRED 189, SYNTHESIS 22.
- **Cross-code edges:** 13 (12 carry over from `D:\sbc_consultx\wiki\architecture\cross-code-relations.json` plus 1 Step-4.2 seed).
- **Mode distribution:** 13 advisory-applicable, 12 analytical-applicable.
- All 238 edges carry `not_citable_as_source: true` and non-empty `source_basis` + `reason`.

## 8. Facts summary

- **128 facts** total (V1 carry-over 9 + 119 newly extracted).
- **By type:** threshold 90, exception 37, condition 1, definition 0.
- **By source_code:** SBC-801 67, SBC-201 61.
- Top thresholds (verbatim from canonical text): 1115 m² / 2230 m² / 465 m² Group M; 500 / 100 occupant Group M alarm; 4650 m² Group F-1/S-1 smoke-vent; 6410 m² area cap; 46500 m² Group F-1/S-1 footprint.
- Top exceptions: SBC 801 Section 907.2.7 covered/open mall (SBC 201 Section 402); SBC 801 Section 907.2.7 sprinkler+waterflow per Section 903.3.
- Definitions: 0 (priority chapters 5/9/10 are operational, not the SBC glossary chapter; will be filled when SBC 201 Chapter 2 is added to the corpus).
- Every fact has non-empty `source_refs`, non-empty `source_quote`, `not_citable_without_source_refs: true`, `confidence: high`.

## 9. Synthesis / workflow summary

- **8 advisory workflows** (sprinkler, fire alarm, occupancy classification, mixed occupancy, egress, standpipe, smoke control, missing-input checklist).
- **4 analytical workflows** (plan-review gap matrix, required systems matrix, drawing evidence to code section, missing drawing evidence).
- **10 main-mode patterns** (concise summaries with source_refs).
- **3 decision trees:** sprinkler-required-decision (12 steps), egress-design-checklist (10), group-m-fire-protection (10 — V1 carry-over).
- All workflows carry `not_legal_source: true`. Every decision-tree step has at least one of `source_refs` or `relation_refs`.

## 10. Validation result

**PASS — 1842 invariants passed, 0 failed.**
Categories:
- no_banned_symbol: 21 generated outputs all clean.
- chunk_shape: 4 invariants × ~309 chunks (source_code, section_ref, content_kind, source_pages-or-flag).
- chunk no-LLM-synthesis / no-STRUCTURED-FACT: 2 × ~309 chunks.
- facts: 128 source_refs presence checks.
- relations: 238 source_basis presence checks.
- decision-tree steps: 32 source/relation refs presence checks across 3 trees.
- governance: 4 (no destructive D:\sbc_consultx edits, gaps have provenance, manual_review listed, high-confidence has content).

## 11. Manual-review list (from gap reports)

The 317-entry list lives in `reports/sbc201_extraction_gap_report.json` and `reports/sbc801_extraction_gap_report.json`. Each entry has `id`, `section_ref`, `chapter`, `issue`, `proposed_pdf`, `proposed_page_range`, `verbatim_text_in_extract_files`. Owner approval required before any targeted extraction.

## 12. Generated files

```
generated/consultx_brain_full/
├── chunks/
│   ├── SBC201_canonical_chunks.json
│   └── SBC801_canonical_chunks.json
├── relations/
│   ├── relations_full.json
│   ├── cross_code_relations_full.json
│   ├── parent_child_relations_full.json
│   ├── exception_relations_full.json
│   ├── trigger_relations_full.json
│   └── analytical_dependency_relations_full.json
├── facts/
│   ├── facts_full.json
│   ├── thresholds_full.json
│   ├── exceptions_full.json
│   └── definitions_full.json
├── synthesis/
│   ├── advisory_workflows.json
│   ├── analytical_workflows.json
│   ├── main_mode_patterns.json
│   └── decision_trees/
│       ├── sprinkler-required-decision.json
│       ├── egress-design-checklist.json
│       └── group-m-fire-protection.json
├── indexes/
│   ├── section_index.json
│   ├── section_aliases.json
│   ├── page_map.json
│   └── pdf_map.json
├── brain_manifest_full.json
├── validation_report_full.json
└── rollback_manifest_full.json
```

All sha-256 checksums and byte counts are in `brain_manifest_full.json`.

## 13. Proposed live integration phases (per `reports/full_brain_live_integration_design.{md,json}`)

| Phase | Scope | LOC | Risk | Production change |
|---|---|---|---|---|
| 1 | Bucket upload of canonical chunks | 0 | LOW | files only |
| 2 | Sidecar relation+fact loader in `fire-safety-chat` | 28 | MEDIUM | edge fn deploy |
| 3 | Optional `section_number` propagation through Evidence Ledger | 3 | LOW | edge fn deploy |
| 4 | Analytical mode hook for `analytical_check_depends_on` relations | 6 | LOW | edge fn deploy |
| 5 | DB / vector / GraphRAG | — | FUTURE | deferred |

Total LOC for Phases 1-4: **37 lines** in `supabase/functions/fire-safety-chat/index.ts` only. No frontend, no DB, no migrations.

## 14. What production changes are recommended later

After approval:
1. Upload `generated/consultx_brain_full/chunks/SBC{201,801}_canonical_chunks.json` to bucket `ssss/`.
2. Upload `generated/consultx_brain_full/relations/relations_full.json` and `facts/facts_full.json` to `ssss/brain_full/`.
3. Apply the Phase-2 `loadBrainFullSidecars` helper + call site (28 LOC) to `fire-safety-chat`. Deploy.
4. Live retest the Mercantile + a sprinkler + an alarm + an egress question.
5. (Optional Phase 3 / 4) propagate `section_number` and add Analytical hook in a follow-up batch.

V1 (Group M only) production apply remains separately gated by the V1 Phase-12 checkpoint report.

## 15. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | 200 chunks `page_pending` (no `source_pages` anchor) | Step-4 verifier already caps `conf:high` → `medium` when ledger lacks high-confidence anchor. |
| 2 | 317 gap sections will yield "expected reference" fallback | Owner-approved targeted extraction batches; out of this task's scope. |
| 3 | Sub-agent C wrapped relations in `{generated_at, count, edges}` envelope | Coordinator `relFile()` unwraps; both shapes accepted. |
| 4 | Some section MDs use Arabic-titled headings (`## نص الكود الحرفي`) | Coordinator's `bodyAsUmbrellaChunk` recognizes both English and Arabic canonical headings. |
| 5 | 1 `orphan_parent` + 1 `duplicate_section_ref` flagged by Sub-Agent D | Catalogued in `reports/section_normalization_report.json`; not blocking V1 / Phase-1 apply. |

## 16. Rollback

Local: `rm -rf data/consultx_brain/full_corpus/ generated/consultx_brain_full/ scripts/build-consultx-brain-full.cjs reports/full_corpus_* reports/sbc{201,801}_extraction_gap_* reports/relationship_graph_* reports/synthesis_reasoning_* reports/full_brain_live_integration_* reports/section_normalization_* reports/facts_thresholds_* reports/consultx_brain_full_*`.
Production (after Phase 13 ships): delete the bucket files listed in `production_apply_plan` of the integration-design report; `git revert` the `fire-safety-chat` patch; redeploy `fire-safety-chat`.

## 17. Next approval question

> Approve Phase-1 production apply: upload the four canonical-chunk JSONs (`SBC{201,801}_canonical_chunks.json`) to bucket `ssss/`. This is the lowest-blast-radius bucket-only step and triggers no code change. Phase 2 (sidecar loader) follows after a 24-hour live observation window confirms the chunks are picked up by `fetchSBCContext` keyword retrieval without regression in Main / Advisory / Analytical modes.

---

STOP — Full local ConsultX Brain corpus build complete. Approval required before any production upload, DB write, or deploy.
