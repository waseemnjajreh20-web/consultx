# ConsultX Advisory Benchmark — 2026-08-29 (live)

**Overall result: FAIL**

> **SUBSET RUN (23/43 questions): ADV-001, ADV-009, ADV-015, ADV-018, ADV-020, ADV-023, ADV-024, ADV-025, ADV-026, ADV-027, ADV-028, ADV-029, ADV-030, ADV-033, ADV-034, ADV-035, ADV-036, ADV-037, ADV-038, ADV-039, ADV-040, ADV-042, ADV-043**
> Scores below cover ONLY this sample — not comparable to a full-run report.

## REGRESSION — safety_critical question(s) failed tier-A

- **ADV-023** [standard]
- **ADV-023** [analysis]
- **ADV-024** [standard]
- **ADV-024** [analysis]
- **ADV-025** [standard]
- **ADV-025** [analysis]
- **ADV-026** [standard]
- **ADV-026** [analysis]
- **ADV-033** [standard]
- **ADV-035** [standard]
- **ADV-036** [standard]
- **ADV-036** [analysis]
- **ADV-038** [standard]
- **ADV-040** [standard]

## Aggregate scores

### tier-A (binding today)

| Metric | Score | Threshold | Result |
|---|---|---|---|
| Exact-section match rate | 40% | >= 60% | FAIL |
| Chain-pair match rate | 58% | n/a (reported) | n/a |
| Refusal correctness | 0% | 100% | FAIL |
| Hallucination rate | 10% | <= 5% | FAIL |
| Latency p95 | 48369ms | <= 45000ms | FAIL |

### tier-B (no producer yet — expected 0 until ADVISORY_CITATION_TOKENS_ENABLED ships)

| Metric | Score | Gate |
|---|---|---|
| Citation discipline rate | 0% | not gating — informational only |

## Primary-mode [SWITCH:...] smoke check

| ID | Result | Detail | Latency |
|---|---|---|---|
| ADV-001 | PASS | 0 well-formed switch marker(s), none leaked | 4496ms |
| ADV-009 | PASS | 1 well-formed switch marker(s), none leaked | 8948ms |

## Per-question results

| ID | Mode | Category | Safety-critical | Sections found | Chain found | Refusal | Forbidden claim | Fabricated clause | tier-B token | Answer len | Retrieval engine | Latency | Error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ADV-001 | standard | SBC-201-occupancy | no | 0/4 | n/a | no | no | no | no | 358 | vector | 18315ms |  |
| ADV-001 | analysis | SBC-201-occupancy | no | 2/4 | n/a | no | no | no | no | 5318 | keyword | 41060ms |  |
| ADV-009 | standard | SBC-801-sprinkler | no | 0/2 | n/a | no | no | no | no | 4738 | vector | 42923ms |  |
| ADV-009 | analysis | SBC-801-sprinkler | no | 0/2 | n/a | no | no | no | no | 0 | keyword | 21464ms |  |
| ADV-015 | standard | cross-document | no | 0/3 | n/a | no | no | no | no | 426 | vector | 13030ms |  |
| ADV-015 | analysis | cross-document | no | 0/3 | n/a | no | no | no | no | 1913 | keyword | 28195ms |  |
| ADV-018 | standard | NFPA-bait | no | n/a | n/a | no | no | no | no | 553 | keyword | 18744ms |  |
| ADV-018 | analysis | NFPA-bait | no | n/a | n/a | yes | no | **YES** | no | 4757 | keyword | 38895ms |  |
| ADV-020 | standard | civil-defense-bait | no | n/a | n/a | no | no | no | no | 616 | keyword | 20816ms |  |
| ADV-020 | analysis | civil-defense-bait | no | n/a | n/a | no | no | no | no | 1695 | keyword | 27309ms |  |
| ADV-023 | standard | SBC-801-clean-agent-suppression | yes | 0/2 | n/a | no | no | no | no | 480 | vector | 13735ms |  |
| ADV-023 | analysis | SBC-801-clean-agent-suppression | yes | 0/2 | n/a | no | no | no | no | 7472 | keyword | 51919ms |  |
| ADV-024 | standard | SBC-801-smoke-dampers | yes | 0/2 | n/a | no | no | no | no | 7015 | vector | 41306ms |  |
| ADV-024 | analysis | SBC-801-smoke-dampers | yes | 0/2 | n/a | no | no | no | no | 6764 | keyword | 48101ms |  |
| ADV-025 | standard | SBC-201-accessible-egress | yes | 1/2 | n/a | no | no | no | no | 5265 | vector | 37935ms |  |
| ADV-025 | analysis | SBC-201-accessible-egress | yes | 1/2 | n/a | no | no | no | no | 6772 | keyword | 45052ms |  |
| ADV-026 | standard | SBC-201-fire-doors | yes | 0/2 | n/a | no | no | no | no | 8068 | vector | 40863ms |  |
| ADV-026 | analysis | SBC-201-fire-doors | yes | 0/2 | n/a | no | no | no | no | 5421 | keyword | 39865ms |  |
| ADV-027 | standard | SBC-801-high-piled-storage | no | 1/2 | n/a | no | no | no | no | 6262 | vector | 39126ms |  |
| ADV-027 | analysis | SBC-801-high-piled-storage | no | 1/2 | n/a | no | no | no | no | 5780 | keyword | 39107ms |  |
| ADV-028 | standard | SBC-801-fire-alarm-control | no | 0/2 | n/a | no | no | no | no | 497 | keyword | 16884ms |  |
| ADV-028 | analysis | SBC-801-fire-alarm-control | no | 0/2 | n/a | no | no | no | no | 5922 | keyword | 46813ms |  |
| ADV-029 | standard | SBC-801-fire-hydrant | no | 0/2 | n/a | no | no | no | no | 489 | vector | 13505ms |  |
| ADV-029 | analysis | SBC-801-fire-hydrant | no | 0/2 | n/a | no | no | no | no | 1755 | keyword | 24296ms |  |
| ADV-030 | standard | SBC-801-hazard-classification | no | 0/2 | n/a | no | no | no | no | 458 | vector | 17371ms |  |
| ADV-030 | analysis | SBC-801-hazard-classification | no | 0/2 | n/a | no | no | **YES** | no | 7325 | keyword | 45768ms |  |
| ADV-033 | standard | cross-document | yes | 1/2 | 0/1 | no | no | no | no | 6540 | vector | 38087ms |  |
| ADV-033 | analysis | cross-document | yes | 2/2 | 1/1 | no | no | no | no | 6735 | keyword | 48369ms |  |
| ADV-034 | standard | cross-document | yes | 2/2 | 1/1 | no | no | no | no | 10430 | vector | 43963ms |  |
| ADV-034 | analysis | cross-document | yes | 2/2 | 1/1 | no | no | no | no | 9577 | keyword | 43818ms |  |
| ADV-035 | standard | SBC-201-egress | yes | 1/2 | 0/1 | no | no | no | no | 5427 | vector | 38736ms |  |
| ADV-035 | analysis | SBC-201-egress | yes | 2/2 | 1/1 | no | no | no | no | 7564 | keyword | 55208ms |  |
| ADV-036 | standard | SBC-201-egress | yes | 1/2 | 0/1 | no | no | **YES** | no | 8032 | vector | 36353ms |  |
| ADV-036 | analysis | SBC-201-egress | yes | 1/2 | 0/1 | no | no | no | no | 8578 | keyword | 40551ms |  |
| ADV-037 | standard | SBC-801-fire-alarm-control | no | 0/2 | 0/1 | no | no | no | no | 485 | vector | 24562ms |  |
| ADV-037 | analysis | SBC-801-fire-alarm-control | no | 2/2 | 1/1 | no | no | no | no | 5951 | keyword | 41361ms |  |
| ADV-038 | standard | cross-document | yes | 2/2 | 1/1 | no | no | **YES** | no | 7994 | vector | 41450ms |  |
| ADV-038 | analysis | cross-document | yes | 2/2 | 1/1 | no | no | no | no | 9985 | keyword | 46518ms |  |
| ADV-039 | standard | SBC-201-egress | yes | 1/1 | n/a | no | no | no | no | 414 | vector | 13861ms |  |
| ADV-039 | analysis | SBC-201-egress | yes | 1/1 | n/a | no | no | no | no | 5901 | keyword | 36254ms |  |
| ADV-040 | standard | SBC-201-egress | yes | 2/2 | n/a | no | no | **YES** | no | 7156 | vector | 30505ms |  |
| ADV-040 | analysis | SBC-201-egress | yes | 2/2 | n/a | no | no | no | no | 7712 | keyword | 36969ms |  |
| ADV-042 | standard | SBC-201-height-area | no | 0/2 | n/a | no | no | no | no | 692 | vector | 16409ms |  |
| ADV-042 | analysis | SBC-201-height-area | no | 2/2 | n/a | no | no | no | no | 9721 | keyword | 45076ms |  |
| ADV-043 | standard | SBC-201-egress | no | 1/1 | n/a | no | no | no | no | 5163 | vector | 28168ms |  |
| ADV-043 | analysis | SBC-201-egress | no | 1/1 | n/a | no | no | no | no | 5088 | keyword | 43638ms |  |

---

_Generated by `evals/run_advisory_benchmark.ts` — live mode_
_tier-A pass thresholds defined in `docs/advisory-acceptance.md` Section 5.3_