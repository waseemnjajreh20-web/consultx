# Synthesis Reasoning Report — SUB-AGENT G

Generated: 2026-05-01
Agent: SUB-AGENT G — Synthesis & Consultant Reasoning builder
Scope: ConsultX Brain Full Corpus build, synthesis layer.

## Outputs

| # | Path | SHA-256 | Section-symbol count |
|---|------|---------|----------------------|
| 1 | D:/ConsultX_Clean/data/consultx_brain/full_corpus/synthesis/advisory_workflows.json | 2309ce7fa18400bd587d6182dd152eff9015ece02f9e1a8e5e6f3bf6d9a757fa | 0 |
| 2 | D:/ConsultX_Clean/data/consultx_brain/full_corpus/synthesis/analytical_workflows.json | 55e69d473fb069c7120fd9273aa6d42664085d0c759ec5ae6f53e7c66c7b26a0 | 0 |
| 3 | D:/ConsultX_Clean/data/consultx_brain/full_corpus/synthesis/main_mode_patterns.json | ed915c3b20d967894216032bf8103c279eea2fc9d1faf8969e8bae9570808456 | 0 |
| 4 | D:/ConsultX_Clean/data/consultx_brain/full_corpus/synthesis/decision_trees/sprinkler-required-decision.json | caa207f22d491ed3d73bca03b4cbb80a196cbe85d88593a4ec6cab0d94ae17a6 | 0 |
| 5 | D:/ConsultX_Clean/data/consultx_brain/full_corpus/synthesis/decision_trees/egress-design-checklist.json | fdb9829cfa7628e586ed4e63937d6efc0b60e071bb34f66421900ad1ebee330c | 0 |
| 6 | D:/ConsultX_Clean/data/consultx_brain/full_corpus/synthesis/decision_trees/group-m-fire-protection.json | 0376aee74213baa1d50ef5ad529da5e527c28a706c91687a2499445bec116a01 | 0 |

## Counts

- Advisory workflows: 8 (sprinkler-required, fire-alarm-required, occupancy-classification, mixed-occupancy, egress-design, standpipe-required, smoke-control-required, missing-input-checklist).
- Analytical workflows: 4 (plan-review-gap-matrix, required-systems-matrix, drawing-evidence-to-code-section, missing-drawing-evidence).
- Main-mode patterns: 10.
- Decision-tree step counts: sprinkler-required-decision = 12, egress-design-checklist = 10, group-m-fire-protection = 10.

## Validation

- All 7 output files written (6 JSON + this report MD; report JSON also produced).
- `grep -c` for the banned section symbol returns 0 across every JSON output.
- Every workflow has `not_legal_source: true` and an `applicable_modes` list.
- Every decision-tree step has at least one of `source_refs` or `relation_refs`.
- All JSON files parse cleanly with Python's `json` module.

## Source Provenance

- D:/sbc_consultx/wiki/synthesis/sprinkler-required-decision.md
- D:/sbc_consultx/wiki/synthesis/egress-design-checklist.md
- D:/sbc_consultx/wiki/concepts/fire-alarm-systems.md
- D:/sbc_consultx/wiki/concepts/occupancy-classification.md
- D:/sbc_consultx/wiki/concepts/interior-finish-requirements.md
- D:/ConsultX_Clean/generated/consultx_brain_v1/group_m_advisory_decision_tree_v1.json (V1 tree — pointer-converted into decision_trees/group-m-fire-protection.json)

## Notes

- D:/sbc_consultx was read-only; no modifications made there.
- No numeric thresholds were invented; all values trace back to either V1 facts or the existing synthesis pages, with the citing SBC 801 / SBC 201 section ID attached.
- Relation-ref IDs use placeholder convention; coordinator reconciles against sub-agent E's relations_full.json after that file is produced.
- All synthesis content marked `not_legal_source: true`; verdicts must be paired with verbatim SBC 801 / SBC 201 citations downstream.
