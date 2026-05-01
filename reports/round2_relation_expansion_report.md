# Round 2 Relation Expansion Report (Sub-Agent B3)

- generated_at: 2026-05-01T12:11:10.151893+00:00
- agent: Sub-Agent B3 (round 2)
- new_edge_count_post_dedup: 350
- files_processed: 128
- fallback_source: round2_md_files

## Round 2 source-dir status
- sbc201_round2: populated
- sbc801_round2: empty

## by_type
- analytical_check_depends_on: 24
- code_to_code: 268
- exception_to_main_rule: 18
- parent_child: 40

## by_origin
- analytical_synthetic: 24
- cross_ref_in_text: 286
- frontmatter_dependencies: 40

## SHA-256
- round2_gap_relations.json: 40ff2e0d07dd6120f1577eb26728d09a04bcf30523c66f12fe9ddb95a5dba250

## Symbol check
- Section symbol in outputs: 0 (post-write verification)
- Section symbol in source MDs (informational): 0

## Notes
- Additive: existing relations_full.json and gap_completion_relations.json are untouched.
- All new edges are PROVEN with non-empty source_basis and reason.
- Dedup applied against base + round1 (from_ref, to_ref, relation_type) tuple.
- Section symbol banned: outputs verified to contain zero occurrences.