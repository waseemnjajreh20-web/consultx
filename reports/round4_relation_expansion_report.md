# Round 4 Relation Expansion Report (Sub-Agent A3)

- generated_at: 2026-05-01T18:38:52.651223+00:00
- agent: Sub-Agent A3 (round 4)
- new_edge_count_post_dedup: 80
- cap: 80
- files_processed: 405
- fallback_source: round4_md_files
- dedup_keys_at_start: 842
- dedup_keys_at_end: 922

## Round-4 source-dir status
- sbc801_round4_core: populated
- sbc801_round4_hazmat: populated
- sbc201_round4_core: missing
- sbc801_round3_hazmat: empty
- sbc801_round3_priority: empty

## by_type
- analytical_check_depends_on: 15
- code_to_code: 55
- parent_child: 10

## by_origin
- analytical_synthetic: 15
- cross_ref_in_text: 53
- frontmatter_dependencies: 12

## SHA-256
- round4_gap_relations.json: e12820406cb04944c93cd742e6bb90026f472946855cd02f93ecf0f7b87c2837

## Symbol check
- Section symbol in outputs: 0 (post-write verification)
- Section symbol in source MDs (informational): 0

## Notes
- Additive: existing relations files (relations_full.json, gap_completion_relations.json,
  round2_gap_relations.json) are untouched.
- All new edges are PROVEN with non-empty source_basis and reason.
- Dedup applied vs base + round1 + round2 (from_ref, to_ref, relation_type) tuple.
- Cap: 80 new edges per round-4 spec.
- Mining order: frontmatter_dependencies, parent_child, analytical_synthetic, cross_ref_in_text.
- Section symbol banned: outputs verified to contain zero occurrences.