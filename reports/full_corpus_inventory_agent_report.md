# Full Corpus Inventory — D:/sbc_consultx

Audit timestamp: 2026-05-01
Mode: read-only inspection
Symbol policy: the section symbol is banned in this report. "Section " (EN) / "القسم " (AR) used throughout.

## 1. Inventory totals

| Asset class | Count |
|---|---:|
| Total files at root (incl. canonical MDs) | 624 |
| Raw PDFs (SBC 201 + SBC 801, page-range splits) | 18 |
| Extracted text files (.txt) | 13 |
| Root JSON working sets | 3 |
| Canonical Section MDs — SBC 201 | 148 |
| Canonical Section MDs — SBC 801 | 370 |
| Canonical Table MDs (SBC 201 only) | 5 |
| Other MDs at root (governance + Arabic notes) | 11 |
| Wiki MDs (architecture + concepts + synthesis) | 14 |
| Python scripts at repo root | 47 |
| Python scripts under scripts/ | 82 |
| Canonical ledger node count | 550 |
| Cross-code relations edge count | 12 |

## 2. Top canonical assets

- `wiki/architecture/canonical-build-ledger.json` — 550 nodes
  - by status: EXISTS_CANONICAL 291, QUARANTINED_UNVERIFIABLE 63, PRESENT_BUT_NOT_CANONICAL 196
- `wiki/architecture/cross-code-relations.json` — 12 edges, 4 edge types
- 518 verbatim Section MDs at root (`sbc-201-section-*.md`, `sbc-801-section-*.md`) — these are the source bodies the ledger indexes
- 5 SBC 201 table MDs (`sbc-201-table-504-3 / 504-4 / 506-2 / 1004-5 / 1006-3-3`)
- 18 raw PDFs covering SBC 201 (8 splits, pages 1-2200) and SBC 801 (10 splits, pages 1-2061)

## 3. Synthesis + concept pages

Synthesis (decisions / checklists):
- `wiki/synthesis/sprinkler-required-decision.md` (17.2 KB)
- `wiki/synthesis/egress-design-checklist.md` (5.9 KB)

Concept pages:
- `wiki/concepts/fire-alarm-systems.md`
- `wiki/concepts/interior-finish-requirements.md`
- `wiki/concepts/occupancy-classification.md`
- `concepts/occupancy-classification.md` (root duplicate — likely stale)

Architecture / governance MDs:
- `wiki/architecture/`: citation-rules, evaluation-system, improvement-model, intelligence-stack, mode-contracts, output-contracts, plan-analysis-pipeline, project-facts-schema, reasoning-contract
- Root: AGENT.md, CLAUDE.md, index.md, log.md, overview.md, extracted_sections.md

## 4. Cross-code edges

12 edges in `cross-code-relations.json`, by type:
- construction_or_height_area_to_fire_requirements: 6
- egress_context_to_fire_life_safety_requirements: 3
- exceptions_and_special_conditions: 2
- general_admin_or_scope_to_specific_fire_design_requirements: 1

## 5. Scripts — safe vs obsolete

Safe / reusable (one-liners):
- `gen_ledger.py` — rebuilds canonical ledger from frontmatter (record_id + status)
- `reconcile_corpus.py` — corpus-wide reconciliation across MDs and ledger
- `clean_sections.py` — produces sbc201_sections_clean.json from raw
- `filter.py` — distills extractions into final_filtered.txt
- `scripts/extract_201_sections.py` — canonical SBC 201 section extractor
- `scripts/normalize_seed.py` / `normalize_nhc_seed.py` — seed corpus normalization
- `scripts/enrich_facts_pass3.py` — final enrichment pass over project facts
- `scripts/quarantine_ghosts_ch7.py` — quarantines non-canonical ghost sections (reusable template)
- `scripts/do_extraction.py` / `do_spatial_prep.py` / `plan_pilot_extract.py` — plan-parsing pipeline
- `scripts/create_matrix.py` — build a fact matrix from facts JSON

Obsolete (iterative duplicates, superseded):
- Root: `extract_text_2..6.py`, `gen_chapter1_2_mds[_fixed][_fixed_path].py`, `gen_chapter5_mds[_fixed].py`, `gen_chapter6_mds_v2..v4.py`, `gen_egress_table_1004_5_v2..v3.py`, `gen_mds2.py`, `gen_mds3.py`, `find_table2.py`, `find_table3.py`, `find_all_sec9_2.py`, `harden_relations_v2.py`, `add_relations_v2.py`, `extract_test.py`, `extract_final.py`
- scripts/: `check_ledger_batch3_v2.py`, `inspect_batch3_full.py`, `inspect_batch3_full2.py`, `extract_sbc201_ch8.py` (superseded by `_fixed`), `extract_sbc801_ch5.py` (superseded by `_full`), `inspect_sbc801_ch14.py` (superseded by `_full`), `enrich_facts_pass2.py` (superseded by `pass3`), `update_index_batch1b..5.py`, `update_ledger_batch1b*.py`

## 6. Missing-extraction zones (ledger by_status breakdown)

The 196 PRESENT_BUT_NOT_CANONICAL + 63 QUARANTINED_UNVERIFIABLE entries cluster as follows:

- SBC 801 chapter 1 (admin/definitions): 38 not-canonical, 7 quarantined of 59 — large drafting backlog
- SBC 801 chapter 3 (use/occupancy classification): 22 not-canonical of 43 — half done
- SBC 801 chapter 4 (special detailed requirements): 24 not-canonical + 21 quarantined of 52 — biggest deficit
- SBC 801 chapter 5 (general building heights/areas): 13 not-canonical of 23
- SBC 801 chapter 7 (fire-resistance-rated construction): 7 quarantined of 15
- SBC 801 chapter 9 (fire protection systems — sprinklers / alarms / 907-909): 16 quarantined of 33; partial extractions live in `extracted_907_909_part1..6.txt`
- SBC 801 chapters 12 / 15 / 16 / 20 / 23-25 / 28 / 29 / 31-33 / 35 / 37 / 50-60 / 63: 88 entries all PRESENT_BUT_NOT_CANONICAL — verbatim bodies still need extraction from PDFs 1001-2061
- SBC 201 chapter 2 (definitions): 5 quarantined of 7
- Tables: only 5 SBC 201 tables exist as MDs; SBC 801 has zero dedicated table MDs — full table corpus is missing

## 7. Recommended canonical source-of-truth

1. `wiki/architecture/canonical-build-ledger.json` — node registry (550 entries, status-stamped)
2. `sbc-{201,801}-section-*.md` at root — verbatim source bodies (trust where status is EXISTS_CANONICAL; review where PRESENT_BUT_NOT_CANONICAL; do not cite where QUARANTINED_UNVERIFIABLE)
3. `wiki/architecture/cross-code-relations.json` — 12-edge cross-code bridge registry (only existing connection-graph asset)
4. `wiki/synthesis/*.md` — decision/checklist pages (sprinkler-required-decision, egress-design-checklist)
5. `wiki/architecture/*.md` (governance: citation-rules, output-contracts, mode-contracts, reasoning-contract, evaluation-system)
6. `sbc201_sections_clean.json` + `temp_ch10_extracts.json` — best-quality JSON working sets for SBC 201

What this corpus has: a strong SBC 201 spine (148/148 EXISTS_CANONICAL, plus 5 tables and 2 clean JSONs) and ~58 percent of SBC 801 verified canonical (291 of 550 nodes). What is missing: the bulk of SBC 801 chapter 4, all of 12 and 15-63, and essentially the entire SBC 801 table corpus; cross-code relations are seeded (12 edges) but sparse versus the 550-node space.
