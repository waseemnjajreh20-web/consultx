# Round 3 Facts and Relations Expansion Report

Generated: 2026-05-01T12:57:25.715338+00:00

Agent: Sub-Agent B3 (round 3)

## Round 3 source directory status

- sbc801_round3_priority: empty/missing
- sbc801_round3_hazmat: empty/missing
- sbc201_round2: populated
- sbc801_round2: populated

Round 3 priority/hazmat dirs were empty or missing at run-time. B3 applied the documented fallback: re-mine round-1/round-2 SBC-201 and SBC-801 sections that prior rounds capped or did not yet cover.

## Outputs

| File | Size (bytes) | SHA-256 | Section symbol count |
| --- | --- | --- | --- |
| `D:/ConsultX_Clean/data/consultx_brain/full_corpus/facts/round3_gap_facts.json` | 57059 | `87b5509f5261f8b1d462c45c13d457ac2d8fc360890ff90fecf49dd0051d23ba` | 0 |
| `D:/ConsultX_Clean/data/consultx_brain/full_corpus/relations/round3_gap_relations.json` | 78099 | `7874dd31d9595924b71d655a56e3c53875cb9c8f5d49d4aae7110c7141e9280f` | 0 |
| `D:/ConsultX_Clean/reports/round3_facts_relations_expansion_report.md` | 2711 | `ccab6db688f117b705a236bfc2320de6d505a5a897e2a6699d67027f7ec2d013` | 0 |
| `D:/ConsultX_Clean/reports/round3_facts_relations_expansion_report.json` | 2702 | `04a265ecb8f9cd4b3625e186449d8dd41f77d3368ea11d21c3ac20d11bfcde49` | 0 |

## Facts (new): 60 / cap 60

### By fact_type histogram

- procedural: 32
- threshold: 28

### Top sections by new fact count

- 402: 7
- 106: 7
- 104: 3
- 111: 3
- 202: 3
- 307.4: 3
- 108: 3
- 408: 3
- 110: 2
- 303.1: 2
- 307.1.1: 2
- 314.4: 2
- 310: 2
- 409: 2
- 102: 1

## Relations (new): 100 / cap 100

### By relation_type histogram

- code_to_code: 82
- code_to_standard: 17
- exception_to_main_rule: 1

### Top from_ref by new relation count

- sbc-201-section-115: 18
- sbc-201-section-202: 17
- sbc-201-section-116: 16
- sbc-201-section-102: 10
- sbc-201-section-103: 7
- sbc-201-section-105: 7
- sbc-201-section-402: 5
- sbc-201-section-104: 4
- sbc-201-section-309: 4
- sbc-201-section-110: 2
- sbc-201-section-111: 2
- sbc-201-section-108: 2
- sbc-201-section-109: 1
- sbc-201-section-112: 1
- sbc-801-section-302: 1

## Hard-rule checks

- section_symbol_banned_check: PASS
- additive_only: True
- all_facts_have_source_refs_and_quote: True
- all_rels_have_source_basis_and_reason: True
- all_rels_proven: True
- all_rels_not_citable: True
- facts_id_prefix_check: True
- rels_id_prefix_check: True

## Dedup base

- Existing facts (base + r1 + r2): 305
- Existing relations (base + r1 + r2): 842

All round-3 facts and relations were screened for duplicates against the dedup base. Facts dedup keys span both source_quote and statement fingerprints; relations dedup keys span (from_ref, to_ref, relation_type).
