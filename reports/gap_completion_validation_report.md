# Gap Completion Validation Report (Sub-Agent B6)

- audited_at: 2026-05-01T10:41:41+00:00
- overall: **FAIL**
- files_validated: 1667
- B5 report present: True

## Rule results

| Rule | checked | failed |
|------|---------|--------|
| no_banned_symbol | 516 | 0 |
| extracted_gaps_have_meta_sidecars | 125 | 84 |
| canonical_chunks_no_synthesis | 125 | 0 |
| no_llm_synthesis_in_source_evidence | 232 | 23 |
| facts_have_source_refs | 100 | 0 |
| relations_have_source_basis_reason | 254 | 0 |
| extracted_have_extraction_status | 125 | 0 |
| manual_review_items_listed | 189 | 0 |
| no_destructive_edits_to_sbc_consultx | 1 | 0 |

- manual_review_count_b1: 23
- manual_review_count_b2: 166

## Top failures (first 5 per failing rule)

### extracted_gaps_have_meta_sidecars
_Note_: All sidecar-schema gaps are in B2 (sbc801) outputs: B2's meta.json schema lacks 'extraction_confidence' and 'requires_review' keys (uses 'extraction_method' + body_chars/garble_ratio instead). B1 (sbc201) sidecars are fully compliant.

_Per-agent_: {"B1 (sbc201)": 0, "B2 (sbc801)": 84}

- {"md": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\extracted_gaps\\sbc801\\sbc-801-section-1006-2-2-1.md", "reason": "missing fields: extraction_confidence|confidence,requires_review", "agent": "B2 (sbc801)"}
- {"md": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\extracted_gaps\\sbc801\\sbc-801-section-1007-1-1.md", "reason": "missing fields: extraction_confidence|confidence,requires_review", "agent": "B2 (sbc801)"}
- {"md": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\extracted_gaps\\sbc801\\sbc-801-section-101-2.md", "reason": "missing fields: extraction_confidence|confidence,requires_review", "agent": "B2 (sbc801)"}
- {"md": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\extracted_gaps\\sbc801\\sbc-801-section-101-4-7.md", "reason": "missing fields: extraction_confidence|confidence,requires_review", "agent": "B2 (sbc801)"}
- {"md": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\extracted_gaps\\sbc801\\sbc-801-section-1010-2-9.md", "reason": "missing fields: extraction_confidence|confidence,requires_review", "agent": "B2 (sbc801)"}

### no_llm_synthesis_in_source_evidence
_Note_: All synthesis-marker hits are in pre-existing source MDs (mtime before B-team work window). B1-B5 did not modify these files.

_Provenance_: pre-existing source files (B-team did NOT modify): 23; introduced during B-team window: 0

- {"file": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\sources\\sbc201\\sbc-201-table-1004-5.md", "marker": "[STRUCTURED_FACT — Source: Table 1004.5, SBC 201-CC-2024]", "mtime": "2026-05-01T09:38:55.557944+00:00"}
- {"file": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\sources\\sbc201\\sbc-201-table-1006-3-3.md", "marker": "[STRUCTURED_FACT — Source: Table 1006.3.3, SBC 201-CC-2024]", "mtime": "2026-05-01T09:38:55.562947+00:00"}
- {"file": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\sources\\sbc201\\sbc-201-table-504-3.md", "marker": "[STRUCTURED_FACT — Source: Table 504.3, SBC 201-CC-2024]", "mtime": "2026-05-01T09:38:55.677943+00:00"}
- {"file": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\sources\\sbc201\\sbc-201-table-504-4.md", "marker": "[STRUCTURED_FACT — Source: Table 504.4, SBC 201-CC-2024]", "mtime": "2026-05-01T09:38:55.682997+00:00"}
- {"file": "D:\\ConsultX_Clean\\data\\consultx_brain\\full_corpus\\sources\\sbc201\\sbc-201-table-506-2.md", "marker": "[STRUCTURED_FACT — Source: Table 506.2, SBC 201-CC-2024]", "mtime": "2026-05-01T09:38:55.687023+00:00"}

## Summary

```
Overall: FAIL
  no_banned_symbol: checked=516 failed=0
  extracted_gaps_have_meta_sidecars: checked=125 failed=84
  canonical_chunks_no_synthesis: checked=125 failed=0
  no_llm_synthesis_in_source_evidence: checked=232 failed=23
  facts_have_source_refs: checked=100 failed=0
  relations_have_source_basis_reason: checked=254 failed=0
  extracted_have_extraction_status: checked=125 failed=0
  manual_review_items_listed: checked=189 failed=0
  no_destructive_edits_to_sbc_consultx: checked=1 failed=0
  manual_review_count_b1=23 manual_review_count_b2=166
```
