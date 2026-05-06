# Advisory Brain B2 — Package Upload Pre-Check

**Date:** 2026-05-06  
**Task:** TASK 1 — Pre-Upload Check  
**Status:** PASS — all counts verified, hashes computed

---

## Package Location

```
generated/consultx_brain_full/v4/advisory_brain/runtime_package/
```

---

## Manifest Counts (advisory_brain_manifest.json)

| Field | Expected | Actual | Status |
|-------|----------|--------|--------|
| nodes total | 440 | 440 | ✅ |
| nodes sections | 184 | 184 | ✅ |
| nodes tables | 145 | 145 | ✅ |
| nodes orphans | 11 | 11 | ✅ |
| nodes thresholds | 100 | 100 | ✅ |
| edges in-graph | 278 | 278 | ✅ |
| edges external_xrefs | 405 | 405 | ✅ |
| workflows | 8 | 8 | ✅ |
| validation_cases | 10 | 10 | ✅ |
| brain_version | B1 | B1 | ✅ |
| schema_version | 1.0 | 1.0 | ✅ |
| validation_result | PASS | PASS | ✅ |

---

## Invariants (from manifest)

| Invariant | Value | Status |
|-----------|-------|--------|
| no_orphan_promoted | true | ✅ |
| no_unadopted_promoted | true | ✅ |
| banned_char_u00a7 | 0 | ✅ |
| no_secrets | true | ✅ |
| no_dangling_edges | true | ✅ |
| no_duplicate_node_ids | true | ✅ |

---

## File Inventory + SHA256

| File | Size (bytes) | SHA256 |
|------|-------------|--------|
| advisory_brain_manifest.json | 1,913 | `a1876378a25e691c3581f901eb2792560c993224fd51ccbaf830e5f35a891598` |
| nodes_compact.json | 164,171 | `1e21bfd9d97b366e2649a4a218f84ef1bbd6a1b47ef69ba4b37e23f1741ded68` |
| orphans_compact.json | 4,781 | `357b96c48c2e2de9c2fa944644d3b58a4c82ccbce81b6434438953e273e650b7` |
| thresholds_compact.json | 36,214 | `da0a136fd6220871afc26f927328e4d38c3e5899ecb83d4dbb445e267207aee0` |
| edges_compact.json | 223,192 | `8dac88d5ea7446b91ff895d405dc0bf493a42d1e3c8000ea3d5a5a8eec493d7b` |
| workflows_compact.json | 36,155 | `3c5a03c20cd3c5851bfe6e4fec9a1a999585b7b3acd292b1e2ad1f6fccfe89d3` |
| validation_cases_compact.json | 8,690 | `c9f166ba69fe73f2cdc07c3c797b344007e4f3c3cc6a9d9265db5d7573a3e2b0` |

**Total:** 7 files, 475,116 bytes

---

## Target Bucket Path (Flat — Loader-Compatible)

```
bucket:  ssss
prefix:  brain_full_v1/   (flat — NO subdirectory)
```

The loader (`brain_b1_loader.ts`) uses `PREFIX = "brain_full_v1"` and calls
`storage.download("brain_full_v1/{key}")`. Upload keys must be flat, not in a subdirectory.

### Local → Bucket Key Mapping

| Local file | Bucket key |
|-----------|------------|
| `advisory_brain_manifest.json` | `brain_full_v1/advisory_brain_manifest.json` |
| `nodes_compact.json` | `brain_full_v1/advisory_nodes_compact.json` |
| `orphans_compact.json` | `brain_full_v1/advisory_orphans_compact.json` |
| `thresholds_compact.json` | `brain_full_v1/advisory_thresholds_compact.json` |
| `edges_compact.json` | `brain_full_v1/advisory_edges_compact.json` |
| `workflows_compact.json` | `brain_full_v1/advisory_workflows_compact.json` |
| `validation_cases_compact.json` | `brain_full_v1/advisory_validation_cases_compact.json` |

> The loader fetches: advisory_nodes_compact.json, advisory_orphans_compact.json,
> advisory_thresholds_compact.json, advisory_edges_compact.json, advisory_workflows_compact.json,
> advisory_brain_manifest.json. The validation_cases file is uploaded for completeness but
> is not loaded at runtime.

---

## Verdict: PASS — Package ready for upload. Awaiting service role key to proceed.
