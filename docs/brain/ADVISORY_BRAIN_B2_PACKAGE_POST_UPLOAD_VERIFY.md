# Advisory Brain B2 — Post-Upload Verification

**Date:** 2026-05-06
**Timestamp:** 2026-05-06T04:50:36.245Z
**Task:** TASK 4 — Post-Upload Verify

## Bucket State After Upload

| Check | Result |
|-------|--------|
| advisory_* files in bucket | 7 / 7 expected |
| manifest validation_result | PASS ✅ |
| no_orphan_promoted | true ✅ |
| no_secrets | true ✅ |
| all hashes match local | PASS ✅ |

## Node Counts (from bucket manifest)

| Type | Count |
|------|-------|
| sections | 184 |
| tables | 145 |
| orphans | 11 |
| thresholds | 100 |
| **total** | **440** |

## Hash Verification

| Bucket Key | Local Hash (prefix) | Bucket Hash (prefix) | Match |
|-----------|---------------------|---------------------|-------|
| advisory_brain_manifest.json | `a1876378a25e691c...` | `a1876378a25e691c...` | ✅ |
| advisory_nodes_compact.json | `1e21bfd9d97b366e...` | `1e21bfd9d97b366e...` | ✅ |
| advisory_orphans_compact.json | `357b96c48c2e2de9...` | `357b96c48c2e2de9...` | ✅ |
| advisory_thresholds_compact.json | `da0a136fd6220871...` | `da0a136fd6220871...` | ✅ |
| advisory_edges_compact.json | `8dac88d5ea7446b9...` | `8dac88d5ea7446b9...` | ✅ |
| advisory_workflows_compact.json | `3c5a03c20cd3c585...` | `3c5a03c20cd3c585...` | ✅ |
| advisory_validation_cases_compact.json | `c9f166ba69fe73f2...` | `c9f166ba69fe73f2...` | ✅ |

## Files in Bucket (advisory_*)

- `brain_full_v1/advisory_brain_manifest.json`
- `brain_full_v1/advisory_edges_compact.json`
- `brain_full_v1/advisory_nodes_compact.json`
- `brain_full_v1/advisory_orphans_compact.json`
- `brain_full_v1/advisory_thresholds_compact.json`
- `brain_full_v1/advisory_validation_cases_compact.json`
- `brain_full_v1/advisory_workflows_compact.json`

## Verdict: PASS — Bucket matches local package exactly.
