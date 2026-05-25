# Round 4 Facts Expansion Report

- generated_at: `2026-05-01T18:48:44Z`
- agent: `sub-agent-a4-round4-facts`
- cap: `80`
- fact_count (new, post-dedup): **60**
- skipped_duplicates: `1`
- skipped_missing_source_refs_or_quote: `0`

## Histograms

### by_type
- `exception`: 2
- `requirement`: 28
- `threshold`: 30

### by_chapter
- chapter `2808`: 1
- chapter `503`: 2
- chapter `506`: 1
- chapter `507`: 4
- chapter `508`: 1
- chapter `510`: 19
- chapter `707`: 1
- chapter `803`: 10
- chapter `904`: 1
- chapter `905`: 4
- chapter `906`: 6
- chapter `907`: 2
- chapter `909`: 2
- chapter `912`: 2
- chapter `913`: 4

### by_source_code
- `SBC-201`: 1
- `SBC-801`: 59

## Top 5 New Thresholds

- 503.1.1: `45 m` — SBC-801 Section 503.1.1 — fire apparatus access road maximum reach
- 507.3: `138 kPa` — SBC-801 Appendix B105.1 — fire flow residual pressure basis
- 507.5.1: `120 m` — SBC-801 Section 507.5.1 — on-site hydrant trigger distance
- 507.5.1: `180 m` — SBC-801 Section 507.5.1 Exception 1 — R-3/U hydrant distance
- 507.5.1: `180 m` — SBC-801 Section 507.5.1 Exception 2 — sprinklered hydrant distance

## Hard Rule Compliance

- Section glyph (banned) count in `round4_gap_facts.json`: `0`
- Section glyph (banned) count in `round4_facts_expansion_report.json`: `0`
- All facts carry non-empty `source_refs` and `source_quote`: yes
- All facts have `not_citable_without_source_refs: true`: yes
- Dedup applied vs facts_full.json, gap_completion_facts.json, round2_gap_facts.json: yes
- LOCAL ONLY, ADDITIVE — no source files modified: yes

