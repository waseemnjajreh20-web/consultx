# ConsultX Advisory Benchmark — 2026-08-25 (dry-run)

**Overall result: PASS**

## Aggregate scores

### tier-A (binding today)

| Metric | Score | Threshold | Result |
|---|---|---|---|
| Exact-section match rate | 100% | >= 60% | PASS |
| Chain-pair match rate | 100% | n/a (reported) | n/a |
| Refusal correctness | 100% | 100% | PASS |
| Hallucination rate | 0% | <= 5% | PASS |
| Latency p95 | 0ms | <= 45000ms | n/a (dry-run) |

### tier-B (no producer yet — expected 0 until ADVISORY_CITATION_TOKENS_ENABLED ships)

| Metric | Score | Gate |
|---|---|---|
| Citation discipline rate | 100% | not gating — informational only |

## Primary-mode [SWITCH:...] smoke check

| ID | Result | Detail | Latency |
|---|---|---|---|
| ADV-001 | PASS | 0 well-formed switch marker(s), none leaked | 0ms |
| ADV-002 | PASS | 0 well-formed switch marker(s), none leaked | 0ms |

## Per-question results

| ID | Mode | Category | Safety-critical | Sections found | Chain found | Refusal | Forbidden claim | Fabricated clause | tier-B token | Answer len | Retrieval engine | Latency | Error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ADV-001 | standard | SBC-201-occupancy | no | 4/4 | n/a | no | no | no | yes | 128 | n/a | 0ms |  |
| ADV-001 | analysis | SBC-201-occupancy | no | 4/4 | n/a | no | no | no | yes | 128 | n/a | 0ms |  |
| ADV-002 | standard | SBC-201-occupancy | no | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-002 | analysis | SBC-201-occupancy | no | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-003 | standard | SBC-201-occupancy | no | 3/3 | n/a | no | no | no | yes | 115 | n/a | 0ms |  |
| ADV-003 | analysis | SBC-201-occupancy | no | 3/3 | n/a | no | no | no | yes | 115 | n/a | 0ms |  |
| ADV-004 | standard | SBC-201-egress | no | 3/3 | n/a | no | no | no | yes | 127 | n/a | 0ms |  |
| ADV-004 | analysis | SBC-201-egress | no | 3/3 | n/a | no | no | no | yes | 127 | n/a | 0ms |  |
| ADV-005 | standard | SBC-201-egress | no | 1/1 | n/a | no | no | no | yes | 93 | n/a | 0ms |  |
| ADV-005 | analysis | SBC-201-egress | no | 1/1 | n/a | no | no | no | yes | 93 | n/a | 0ms |  |
| ADV-006 | standard | SBC-201-egress | no | 3/3 | n/a | no | no | no | yes | 125 | n/a | 0ms |  |
| ADV-006 | analysis | SBC-201-egress | no | 3/3 | n/a | no | no | no | yes | 125 | n/a | 0ms |  |
| ADV-007 | standard | SBC-201-height-area | no | 3/3 | n/a | no | no | no | yes | 119 | n/a | 0ms |  |
| ADV-007 | analysis | SBC-201-height-area | no | 3/3 | n/a | no | no | no | yes | 119 | n/a | 0ms |  |
| ADV-008 | standard | SBC-201-height-area | no | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-008 | analysis | SBC-201-height-area | no | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-009 | standard | SBC-801-sprinkler | no | 2/2 | n/a | no | no | no | yes | 112 | n/a | 0ms |  |
| ADV-009 | analysis | SBC-801-sprinkler | no | 2/2 | n/a | no | no | no | yes | 112 | n/a | 0ms |  |
| ADV-010 | standard | SBC-801-sprinkler | no | 2/2 | n/a | no | no | no | yes | 114 | n/a | 0ms |  |
| ADV-010 | analysis | SBC-801-sprinkler | no | 2/2 | n/a | no | no | no | yes | 114 | n/a | 0ms |  |
| ADV-011 | standard | SBC-801-standpipe | no | 2/2 | n/a | no | no | no | yes | 110 | n/a | 0ms |  |
| ADV-011 | analysis | SBC-801-standpipe | no | 2/2 | n/a | no | no | no | yes | 110 | n/a | 0ms |  |
| ADV-012 | standard | SBC-801-standpipe | no | 3/3 | n/a | no | no | no | yes | 125 | n/a | 0ms |  |
| ADV-012 | analysis | SBC-801-standpipe | no | 3/3 | n/a | no | no | no | yes | 125 | n/a | 0ms |  |
| ADV-013 | standard | SBC-801-fire-pump | no | 3/3 | n/a | no | no | no | yes | 121 | n/a | 0ms |  |
| ADV-013 | analysis | SBC-801-fire-pump | no | 3/3 | n/a | no | no | no | yes | 121 | n/a | 0ms |  |
| ADV-014 | standard | SBC-801-fire-pump | no | 2/2 | n/a | no | no | no | yes | 110 | n/a | 0ms |  |
| ADV-014 | analysis | SBC-801-fire-pump | no | 2/2 | n/a | no | no | no | yes | 110 | n/a | 0ms |  |
| ADV-015 | standard | cross-document | no | 3/3 | n/a | no | no | no | yes | 126 | n/a | 0ms |  |
| ADV-015 | analysis | cross-document | no | 3/3 | n/a | no | no | no | yes | 126 | n/a | 0ms |  |
| ADV-016 | standard | cross-document | no | 3/3 | n/a | no | no | no | yes | 123 | n/a | 0ms |  |
| ADV-016 | analysis | cross-document | no | 3/3 | n/a | no | no | no | yes | 123 | n/a | 0ms |  |
| ADV-017 | standard | cross-document | no | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-017 | analysis | cross-document | no | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-018 | standard | NFPA-bait | no | n/a | n/a | yes | no | no | no | 215 | n/a | 0ms |  |
| ADV-018 | analysis | NFPA-bait | no | n/a | n/a | yes | no | no | no | 215 | n/a | 0ms |  |
| ADV-019 | standard | NFPA-bait | no | n/a | n/a | yes | no | no | no | 215 | n/a | 0ms |  |
| ADV-019 | analysis | NFPA-bait | no | n/a | n/a | yes | no | no | no | 215 | n/a | 0ms |  |
| ADV-020 | standard | civil-defense-bait | no | n/a | n/a | yes | no | no | no | 215 | n/a | 0ms |  |
| ADV-020 | analysis | civil-defense-bait | no | n/a | n/a | yes | no | no | no | 215 | n/a | 0ms |  |
| ADV-021 | standard | SBC-801-fire-pump | yes | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-021 | analysis | SBC-801-fire-pump | yes | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-022 | standard | SBC-801-foam-suppression | yes | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-022 | analysis | SBC-801-foam-suppression | yes | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-023 | standard | SBC-801-clean-agent-suppression | yes | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-023 | analysis | SBC-801-clean-agent-suppression | yes | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-024 | standard | SBC-801-smoke-dampers | yes | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-024 | analysis | SBC-801-smoke-dampers | yes | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-025 | standard | SBC-201-accessible-egress | yes | 2/2 | n/a | no | no | no | yes | 109 | n/a | 0ms |  |
| ADV-025 | analysis | SBC-201-accessible-egress | yes | 2/2 | n/a | no | no | no | yes | 109 | n/a | 0ms |  |
| ADV-026 | standard | SBC-201-fire-doors | yes | 2/2 | n/a | no | no | no | yes | 113 | n/a | 0ms |  |
| ADV-026 | analysis | SBC-201-fire-doors | yes | 2/2 | n/a | no | no | no | yes | 113 | n/a | 0ms |  |
| ADV-027 | standard | SBC-801-high-piled-storage | no | 2/2 | n/a | no | no | no | yes | 109 | n/a | 0ms |  |
| ADV-027 | analysis | SBC-801-high-piled-storage | no | 2/2 | n/a | no | no | no | yes | 109 | n/a | 0ms |  |
| ADV-028 | standard | SBC-801-fire-alarm-control | no | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-028 | analysis | SBC-801-fire-alarm-control | no | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-029 | standard | SBC-801-fire-hydrant | no | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-029 | analysis | SBC-801-fire-hydrant | no | 2/2 | n/a | no | no | no | yes | 108 | n/a | 0ms |  |
| ADV-030 | standard | SBC-801-hazard-classification | no | 2/2 | n/a | no | no | no | yes | 114 | n/a | 0ms |  |
| ADV-030 | analysis | SBC-801-hazard-classification | no | 2/2 | n/a | no | no | no | yes | 114 | n/a | 0ms |  |
| ADV-031 | standard | SBC-801-sprinkler | yes | 2/2 | 1/1 | no | no | no | yes | 161 | n/a | 0ms |  |
| ADV-031 | analysis | SBC-801-sprinkler | yes | 2/2 | 1/1 | no | no | no | yes | 161 | n/a | 0ms |  |
| ADV-032 | standard | SBC-801-sprinkler | yes | 2/2 | 1/1 | no | no | no | yes | 161 | n/a | 0ms |  |
| ADV-032 | analysis | SBC-801-sprinkler | yes | 2/2 | 1/1 | no | no | no | yes | 161 | n/a | 0ms |  |
| ADV-033 | standard | cross-document | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-033 | analysis | cross-document | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-034 | standard | cross-document | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-034 | analysis | cross-document | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-035 | standard | SBC-201-egress | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-035 | analysis | SBC-201-egress | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-036 | standard | SBC-201-egress | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-036 | analysis | SBC-201-egress | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-037 | standard | SBC-801-fire-alarm-control | no | 2/2 | 1/1 | no | no | no | yes | 157 | n/a | 0ms |  |
| ADV-037 | analysis | SBC-801-fire-alarm-control | no | 2/2 | 1/1 | no | no | no | yes | 157 | n/a | 0ms |  |
| ADV-038 | standard | cross-document | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-038 | analysis | cross-document | yes | 2/2 | 1/1 | no | no | no | yes | 162 | n/a | 0ms |  |
| ADV-039 | standard | SBC-201-egress | yes | 1/1 | n/a | no | no | no | yes | 93 | n/a | 0ms |  |
| ADV-039 | analysis | SBC-201-egress | yes | 1/1 | n/a | no | no | no | yes | 93 | n/a | 0ms |  |
| ADV-040 | standard | SBC-201-egress | yes | 2/2 | n/a | no | no | no | yes | 112 | n/a | 0ms |  |
| ADV-040 | analysis | SBC-201-egress | yes | 2/2 | n/a | no | no | no | yes | 112 | n/a | 0ms |  |
| ADV-041 | standard | SBC-201-height-area | no | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-041 | analysis | SBC-201-height-area | no | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-042 | standard | SBC-201-height-area | no | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-042 | analysis | SBC-201-height-area | no | 2/2 | n/a | no | no | no | yes | 106 | n/a | 0ms |  |
| ADV-043 | standard | SBC-201-egress | no | 1/1 | n/a | no | no | no | yes | 93 | n/a | 0ms |  |
| ADV-043 | analysis | SBC-201-egress | no | 1/1 | n/a | no | no | no | yes | 93 | n/a | 0ms |  |

---

_Generated by `evals/run_advisory_benchmark.ts` — dry-run mode_
_tier-A pass thresholds defined in `docs/advisory-acceptance.md` Section 5.3_