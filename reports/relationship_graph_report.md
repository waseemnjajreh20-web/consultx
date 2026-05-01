# Relationship Graph Report

Audited at: 2026-05-01T09:38:52.110Z

## Totals

- Total edges: 238
- Cross-code edges: 13
- Section files parsed: 518 (failed: 0)

## By relation type

- analytical_check_depends_on: 135
- definition_supports_requirement: 41
- concept_explains_section: 22
- condition_triggers_requirement: 18
- code_to_code: 15
- parent_child: 3
- classification_triggers_system: 2
- exception_of: 2

## By confidence

- PROVEN: 27
- INFERRED: 189
- SYNTHESIS: 22

## By origin

- cross_code_relations_json: 14
- step_4_2_seed: 13
- section_frontmatter_dependencies: 54
- section_frontmatter_related_sections: 135
- synthesis_page: 10
- concept_page: 12

## Applicable modes distribution

- main: 27
- advisory: 238
- analytical: 216

## Top 3 PROVEN cross-code edges

1. sbc-801-section-1020 -> sbc-201-section-708
   - Reason: SBC 801 mandates fire-rated corridors complying with SBC 201 708
2. sbc-801-section-1011 -> sbc-201-section-405
   - Reason: Accessible stairway design governed by SBC 201 405
3. sbc-801-section-913 -> sbc-201-section-913
   - Reason: Pump room separation dictated by SBC 201

## Validation

- all_have_source_basis: true
- all_have_reason: true
- all_not_citable: true

## Checksums (sha256)

- relations_full.json: 83bb3b456cf799d2b3d7d2342c27dcff6aa7a63156a390e85f34b3170b5cddae
- cross_code_relations_full.json: aadd48896876a8434324543f70542568eeeb16a3c408644aad33ac677c2f2f17
- parent_child_relations_full.json: 77730cd3cf080ba38905587d49933b216835aab05e1a3f4df20506e97305d71d
- exception_relations_full.json: 59d1a3127416e3a54654f22a6fd75830ef2eeb816a49d23cb547f5c72ff3e09d
- trigger_relations_full.json: 57f5ee594a5ca36690d0626d49700be154bb8b9e1d03829e61b21b72c047b1b9
- analytical_dependency_relations_full.json: 888a65631682d5588aab3a998316d0d9e56e9346a5428966020c189450fd366e
