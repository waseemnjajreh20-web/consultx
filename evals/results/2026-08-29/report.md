# ConsultX Advisory Benchmark — 2026-08-29 (live)

**Overall result: FAIL**

## REGRESSION — safety_critical question(s) failed tier-A

- **ADV-021** [standard]
- **ADV-021** [analysis]
- **ADV-022** [standard]
- **ADV-022** [analysis]
- **ADV-023** [standard]
- **ADV-023** [analysis]
- **ADV-024** [standard]
- **ADV-024** [analysis]
- **ADV-025** [standard]
- **ADV-025** [analysis]
- **ADV-026** [standard]
- **ADV-026** [analysis]
- **ADV-031** [standard]
- **ADV-031** [analysis]
- **ADV-032** [standard]
- **ADV-032** [analysis]
- **ADV-033** [standard]
- **ADV-033** [analysis]
- **ADV-035** [standard]
- **ADV-035** [analysis]
- **ADV-036** [standard]
- **ADV-038** [standard]

## Aggregate scores

### tier-A (binding today)

| Metric | Score | Threshold | Result |
|---|---|---|---|
| Exact-section match rate | 36% | >= 60% | FAIL |
| Chain-pair match rate | 50% | n/a (reported) | n/a |
| Refusal correctness | 17% | 100% | FAIL |
| Hallucination rate | 11% | <= 5% | FAIL |
| Latency p95 | 51385ms | <= 45000ms | FAIL |

### tier-B (no producer yet — expected 0 until ADVISORY_CITATION_TOKENS_ENABLED ships)

| Metric | Score | Gate |
|---|---|---|
| Citation discipline rate | 0% | not gating — informational only |

## Primary-mode [SWITCH:...] smoke check

| ID | Result | Detail | Latency |
|---|---|---|---|
| ADV-001 | PASS | 0 well-formed switch marker(s), none leaked | 4054ms |
| ADV-002 | PASS | 1 well-formed switch marker(s), none leaked | 8370ms |

## Per-question results

| ID | Mode | Category | Safety-critical | Sections found | Chain found | Refusal | Forbidden claim | Fabricated clause | tier-B token | Answer len | Retrieval engine | Latency | Error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ADV-001 | standard | SBC-201-occupancy | no | 2/4 | n/a | no | no | no | no | 5410 | vector | 33521ms |  |
| ADV-001 | analysis | SBC-201-occupancy | no | 2/4 | n/a | no | no | no | no | 6238 | keyword | 40255ms |  |
| ADV-002 | standard | SBC-201-occupancy | no | 1/2 | n/a | no | no | no | no | 4778 | vector | 31948ms |  |
| ADV-002 | analysis | SBC-201-occupancy | no | 0/2 | n/a | no | no | no | no | 5091 | keyword | 37163ms |  |
| ADV-003 | standard | SBC-201-occupancy | no | 0/3 | n/a | no | no | no | no | 5289 | vector | 30910ms |  |
| ADV-003 | analysis | SBC-201-occupancy | no | 0/3 | n/a | no | no | no | no | 5918 | keyword | 42017ms |  |
| ADV-004 | standard | SBC-201-egress | no | 1/3 | n/a | no | no | no | no | 6275 | vector | 38492ms |  |
| ADV-004 | analysis | SBC-201-egress | no | 0/3 | n/a | no | no | no | no | 3943 | keyword | 48361ms |  |
| ADV-005 | standard | SBC-201-egress | no | 1/1 | n/a | no | no | no | no | 3747 | vector | 26947ms |  |
| ADV-005 | analysis | SBC-201-egress | no | 1/1 | n/a | no | no | no | no | 3627 | keyword | 29577ms |  |
| ADV-006 | standard | SBC-201-egress | no | 0/3 | n/a | no | no | no | no | 0 | n/a | 290ms | HTTP 502: <html>
<head><title>502 Bad Gateway</title></head>
<body>
<center><h1>502 Bad Gateway</h1></center>
</body>
</html>
 |
| ADV-006 | analysis | SBC-201-egress | no | 0/3 | n/a | no | no | no | no | 1840 | keyword | 21795ms |  |
| ADV-007 | standard | SBC-201-height-area | no | 2/3 | n/a | no | no | no | no | 1990 | vector | 21828ms |  |
| ADV-007 | analysis | SBC-201-height-area | no | 2/3 | n/a | no | no | no | no | 6639 | keyword | 49093ms |  |
| ADV-008 | standard | SBC-201-height-area | no | 1/2 | n/a | no | no | no | no | 6129 | vector | 36286ms |  |
| ADV-008 | analysis | SBC-201-height-area | no | 1/2 | n/a | no | no | no | no | 4521 | keyword | 35271ms |  |
| ADV-009 | standard | SBC-801-sprinkler | no | 1/2 | n/a | no | no | no | no | 6917 | vector | 49023ms |  |
| ADV-009 | analysis | SBC-801-sprinkler | no | 0/2 | n/a | no | no | no | no | 2322 | keyword | 31791ms |  |
| ADV-010 | standard | SBC-801-sprinkler | no | 0/2 | n/a | no | no | no | no | 4106 | vector | 31788ms |  |
| ADV-010 | analysis | SBC-801-sprinkler | no | 1/2 | n/a | no | no | no | no | 5048 | keyword | 33240ms |  |
| ADV-011 | standard | SBC-801-standpipe | no | 0/2 | n/a | no | no | no | no | 0 | n/a | 290ms | HTTP 502: <html>
<head><title>502 Bad Gateway</title></head>
<body>
<center><h1>502 Bad Gateway</h1></center>
</body>
</html>
 |
| ADV-011 | analysis | SBC-801-standpipe | no | 1/2 | n/a | no | no | no | no | 2430 | keyword | 23432ms |  |
| ADV-012 | standard | SBC-801-standpipe | no | 0/3 | n/a | no | no | no | no | 308 | vector | 10602ms |  |
| ADV-012 | analysis | SBC-801-standpipe | no | 0/3 | n/a | no | no | no | no | 2066 | keyword | 19706ms |  |
| ADV-013 | standard | SBC-801-fire-pump | no | 0/3 | n/a | no | no | no | no | 526 | keyword | 16085ms |  |
| ADV-013 | analysis | SBC-801-fire-pump | no | 0/3 | n/a | no | no | **YES** | no | 5317 | keyword | 44544ms |  |
| ADV-014 | standard | SBC-801-fire-pump | no | 0/2 | n/a | no | no | no | no | 503 | vector | 15144ms |  |
| ADV-014 | analysis | SBC-801-fire-pump | no | 0/2 | n/a | no | no | **YES** | no | 8144 | keyword | 49485ms |  |
| ADV-015 | standard | cross-document | no | 0/3 | n/a | no | no | no | no | 572 | vector | 12138ms |  |
| ADV-015 | analysis | cross-document | no | 1/3 | n/a | no | no | no | no | 5627 | keyword | 37721ms |  |
| ADV-016 | standard | cross-document | no | 0/3 | n/a | no | no | no | no | 430 | vector | 11676ms |  |
| ADV-016 | analysis | cross-document | no | 0/3 | n/a | no | no | no | no | 2177 | keyword | 24991ms |  |
| ADV-017 | standard | cross-document | no | 1/2 | n/a | no | no | **YES** | no | 4295 | vector | 21573ms |  |
| ADV-017 | analysis | cross-document | no | 1/2 | n/a | no | no | **YES** | no | 5785 | keyword | 39901ms |  |
| ADV-018 | standard | NFPA-bait | no | n/a | n/a | no | no | no | no | 355 | keyword | 14985ms |  |
| ADV-018 | analysis | NFPA-bait | no | n/a | n/a | yes | no | **YES** | no | 4002 | keyword | 28011ms |  |
| ADV-019 | standard | NFPA-bait | no | n/a | n/a | no | no | no | no | 612 | keyword | 20939ms |  |
| ADV-019 | analysis | NFPA-bait | no | n/a | n/a | yes | no | no | no | 2229 | keyword | 20952ms |  |
| ADV-020 | standard | civil-defense-bait | no | n/a | n/a | no | no | no | no | 720 | keyword | 19148ms |  |
| ADV-020 | analysis | civil-defense-bait | no | n/a | n/a | no | no | no | no | 4301 | keyword | 33457ms |  |
| ADV-021 | standard | SBC-801-fire-pump | yes | 0/2 | n/a | no | no | no | no | 621 | keyword | 33057ms |  |
| ADV-021 | analysis | SBC-801-fire-pump | yes | 0/2 | n/a | no | no | no | no | 6861 | keyword | 42066ms |  |
| ADV-022 | standard | SBC-801-foam-suppression | yes | 0/2 | n/a | no | no | no | no | 465 | vector | 17486ms |  |
| ADV-022 | analysis | SBC-801-foam-suppression | yes | 0/2 | n/a | no | no | no | no | 3697 | keyword | 35869ms |  |
| ADV-023 | standard | SBC-801-clean-agent-suppression | yes | 0/2 | n/a | no | no | no | no | 402 | vector | 17685ms |  |
| ADV-023 | analysis | SBC-801-clean-agent-suppression | yes | 0/2 | n/a | no | no | no | no | 7191 | keyword | 45574ms |  |
| ADV-024 | standard | SBC-801-smoke-dampers | yes | 0/2 | n/a | no | no | no | no | 5518 | vector | 38064ms |  |
| ADV-024 | analysis | SBC-801-smoke-dampers | yes | 0/2 | n/a | no | no | no | no | 7807 | keyword | 47607ms |  |
| ADV-025 | standard | SBC-201-accessible-egress | yes | 1/2 | n/a | no | no | no | no | 6562 | vector | 40383ms |  |
| ADV-025 | analysis | SBC-201-accessible-egress | yes | 1/2 | n/a | no | no | no | no | 6471 | keyword | 46472ms |  |
| ADV-026 | standard | SBC-201-fire-doors | yes | 0/2 | n/a | no | no | no | no | 403 | vector | 18285ms |  |
| ADV-026 | analysis | SBC-201-fire-doors | yes | 0/2 | n/a | no | no | no | no | 6596 | keyword | 44593ms |  |
| ADV-027 | standard | SBC-801-high-piled-storage | no | 1/2 | n/a | no | no | no | no | 7294 | vector | 28326ms |  |
| ADV-027 | analysis | SBC-801-high-piled-storage | no | 1/2 | n/a | no | no | no | no | 5803 | keyword | 46616ms |  |
| ADV-028 | standard | SBC-801-fire-alarm-control | no | 0/2 | n/a | no | no | no | no | 6200 | keyword | 51516ms |  |
| ADV-028 | analysis | SBC-801-fire-alarm-control | no | 1/2 | n/a | no | no | no | no | 7237 | keyword | 49762ms |  |
| ADV-029 | standard | SBC-801-fire-hydrant | no | 0/2 | n/a | no | no | no | no | 437 | vector | 15439ms |  |
| ADV-029 | analysis | SBC-801-fire-hydrant | no | 0/2 | n/a | no | no | no | no | 5150 | keyword | 40269ms |  |
| ADV-030 | standard | SBC-801-hazard-classification | no | 0/2 | n/a | no | no | no | no | 6129 | vector | 36178ms |  |
| ADV-030 | analysis | SBC-801-hazard-classification | no | 0/2 | n/a | no | no | **YES** | no | 7585 | keyword | 51385ms |  |
| ADV-031 | standard | SBC-801-sprinkler | yes | 0/2 | 0/1 | no | no | no | no | 332 | vector | 13078ms |  |
| ADV-031 | analysis | SBC-801-sprinkler | yes | 2/2 | 1/1 | no | no | **YES** | no | 5300 | keyword | 38501ms |  |
| ADV-032 | standard | SBC-801-sprinkler | yes | 2/2 | 1/1 | no | no | **YES** | no | 6338 | vector | 33632ms |  |
| ADV-032 | analysis | SBC-801-sprinkler | yes | 2/2 | 1/1 | no | no | **YES** | no | 28377 | keyword | 33410ms |  |
| ADV-033 | standard | cross-document | yes | 0/2 | 0/1 | no | no | no | no | 0 | n/a | 61300ms | TypeError: fetch failed |
| ADV-033 | analysis | cross-document | yes | 1/2 | 0/1 | no | no | no | no | 6434 | keyword | 61847ms |  |
| ADV-034 | standard | cross-document | yes | 2/2 | 1/1 | no | no | no | no | 10318 | vector | 43753ms |  |
| ADV-034 | analysis | cross-document | yes | 2/2 | 1/1 | no | no | no | no | 9974 | keyword | 43619ms |  |
| ADV-035 | standard | SBC-201-egress | yes | 1/2 | 0/1 | no | no | no | no | 5904 | vector | 38534ms |  |
| ADV-035 | analysis | SBC-201-egress | yes | 1/2 | 0/1 | no | no | no | no | 5941 | keyword | 45651ms |  |
| ADV-036 | standard | SBC-201-egress | yes | 1/2 | 0/1 | no | no | no | no | 7579 | vector | 35222ms |  |
| ADV-036 | analysis | SBC-201-egress | yes | 2/2 | 1/1 | no | no | no | no | 4097 | keyword | 38577ms |  |
| ADV-037 | standard | SBC-801-fire-alarm-control | no | 1/2 | 0/1 | no | no | no | no | 5745 | vector | 32987ms |  |
| ADV-037 | analysis | SBC-801-fire-alarm-control | no | 2/2 | 1/1 | no | no | no | no | 6285 | keyword | 46106ms |  |
| ADV-038 | standard | cross-document | yes | 1/2 | 0/1 | no | no | no | no | 744 | vector | 18044ms |  |
| ADV-038 | analysis | cross-document | yes | 2/2 | 1/1 | no | no | no | no | 11404 | keyword | 49081ms |  |
| ADV-039 | standard | SBC-201-egress | yes | 1/1 | n/a | no | no | no | no | 4621 | vector | 30034ms |  |
| ADV-039 | analysis | SBC-201-egress | yes | 1/1 | n/a | no | no | no | no | 4574 | keyword | 30229ms |  |
| ADV-040 | standard | SBC-201-egress | yes | 2/2 | n/a | no | no | no | no | 7035 | vector | 27029ms |  |
| ADV-040 | analysis | SBC-201-egress | yes | 2/2 | n/a | no | no | no | no | 165813 | keyword | 65695ms |  |
| ADV-041 | standard | SBC-201-height-area | no | 2/2 | n/a | no | no | no | no | 3110 | vector | 22375ms |  |
| ADV-041 | analysis | SBC-201-height-area | no | 2/2 | n/a | no | no | no | no | 4124 | keyword | 29128ms |  |
| ADV-042 | standard | SBC-201-height-area | no | 2/2 | n/a | no | no | **YES** | no | 780 | vector | 15149ms |  |
| ADV-042 | analysis | SBC-201-height-area | no | 2/2 | n/a | no | no | no | no | 10324 | keyword | 46433ms |  |
| ADV-043 | standard | SBC-201-egress | no | 1/1 | n/a | no | no | no | no | 5333 | vector | 41021ms |  |
| ADV-043 | analysis | SBC-201-egress | no | 1/1 | n/a | no | no | no | no | 6027 | keyword | 45146ms |  |

---

_Generated by `evals/run_advisory_benchmark.ts` — live mode_
_tier-A pass thresholds defined in `docs/advisory-acceptance.md` Section 5.3_