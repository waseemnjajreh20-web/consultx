# Round 4 Validation Report (Sub-Agent A6)

- agent: Sub-Agent A6 (round 4)
- generated_at: 2026-05-01T19:18:52.381570+00:00
- overall: **PASS**
- rules passed: 10 / 10
- rules failed: 0

## Per-rule results

### rule1_no_section_symbol: PASS
- count_in_full_corpus: 0
- count_in_round4_reports: 0
- total: 0

### rule2_meta_complete: PASS
- total_mds: 39
- passed_count: 39
- failures: []

### rule3_canonical_verbatim_clean: PASS
- failures: []

### rule4_no_llm_synthesis_in_source_evidence: PASS
- round4_extracted_synthesis_marker_count: 0
- preexisting_sources_files_with_marker: 32
- preexisting_sources_marker_count: 93
- note: "Pre-existing markers in sources/ are PARTIAL_STRUCTURED commentary blocks demarcated as analysis (not introduced this round). Round-4 gating: round4_extracted_synthesis_marker_count must be 0."

### rule5_facts_have_sources: PASS
- status: "FILE_PRESENT"
- total_facts: 60
- failures_count: 0
- note: "round4_gap_facts.json (Sub-Agent A4) was not produced this round; rule fails. Logged as in-flight."

### rule6_relations_proven: PASS
- total_edges: 80
- failure_count: 0
- failures_sample: []

### rule7_extraction_status_present: PASS
- total_meta: 39
- failures: []

### rule8_manual_review_justified: PASS
- a1_report_path: "D:/ConsultX_Clean\\reports/sbc801_round4_core_resolution_report.json"
- a1_present: true
- a2_report_path: "D:/ConsultX_Clean\\reports/sbc801_round4_hazmat_resolution_report.json"
- a2_present: true
- a1_action_counts: {"resolved_canonical": 14, "cross_reference_only": 9, "absent_from_2024_pdf": 3}
- a2_action_counts: {"manual_review_keep": 16, "resolved_canonical": 25}
- invalid_actions: []
- enum_6: ["absent_from_2024_pdf", "cross_reference_only", "manual_review_keep", "quarantine", "resolved_canonical", "resolved_existing"]

### rule9_no_sbc_consultx_mutation: PASS
- violations_count: 0
- sample_violations: []

### rule10_final: PASS

## In-flight artifacts (not produced)

## Top 5 failures

## Symbol grep counts (must all be 0)
- full_corpus: 0
- round4 reports (4 prior md/json): 0

## SHA-256
(computed and appended after write)


## Self-hashes and self-symbol-counts
- round4_validation_report.md sha256: 0906924891aab76647d7ae72eabbe22bc72c2d0ecccd34a9691b006f9b81b0aa
- round4_validation_report.json sha256 (pre-self-embed): 3babd3948ff9608682f0a2dcc8cbc10a18c2591d00a87148a1fedcb4eb49c1bb
- self section-symbol count (md): 0
- self section-symbol count (json): 0
