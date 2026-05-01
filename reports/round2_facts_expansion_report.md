# Round 2 Facts Expansion Report (Sub-agent B4)

- audited_at: 2026-05-01T12:17:02.747180+00:00
- agent: sub-agent-b4-round2
- new_facts: 77
- by_type: {'threshold': 71, 'exception': 6}
- by_source_code: {'SBC-201': 73, 'SBC-801': 4}
- by_chapter: {'SBC-201 ch.7': 12, 'SBC-201 ch.10': 61, 'SBC-801 ch.4': 4}
- additive_to: facts_full.json + gap_completion_facts.json
- cap: 80

## Validation
- all_have_source_refs: True
- all_have_source_quote: True
- no_banned_symbol: True
- banned_symbol_count: 0

## Top 5 new thresholds
- SBC-201 Section 1006.2.1: value=10 occupants (id fact-r2-1006-2-1-d5bfb1ae)
- SBC-201 Section 1006.2.1: value=20 occupants (id fact-r2-1006-2-1-6db6ca1d)
- SBC-201 Section 1006.2.1: value=3 persons (id fact-r2-1006-2-1-4c7e5e8d)
- SBC-201 Section 1006.2.1: value=29 occupants (id fact-r2-1006-2-1-f97661fa)
- SBC-201 Section 1006.2.1.1: value=501 occupants (id fact-r2-1006-2-1-1-3437e818)

## SHA-256
- round2_gap_facts.json: 321b38e936ee07d36625a6db213f24fc34237c070f243e68159647f8b9f60fff
