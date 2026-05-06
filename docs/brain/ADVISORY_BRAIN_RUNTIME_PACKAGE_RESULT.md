# Advisory Brain — Runtime Package Build Result

**Date:** 2026-05-06  
**Phase:** B2 Phase 1 — Runtime Package  
**Script:** `scripts/build_advisory_brain_b2_runtime_package.cjs`  
**Output:** `generated/consultx_brain_full/v4/advisory_brain/runtime_package/`

---

## Build Summary

| Metric | Value |
|--------|------:|
| Nodes total | 440 |
| — Sections + subsections | 184 |
| — Tables | 145 |
| — Orphans | 11 |
| — Thresholds | 100 |
| In-graph edges | 278 |
| External xrefs | 405 |
| Workflows | 8 |
| Validation cases | 10 |
| Output files | 6 |

---

## Output Files

| File | Bytes | SHA-256 (truncated) |
|------|------:|---------------------|
| advisory_brain_manifest.json | — | (root index) |
| nodes_compact.json | 164,171 | `1e21bfd9d97b366e…` |
| orphans_compact.json | 4,781 | `357b96c48c2e2de9…` |
| thresholds_compact.json | 36,214 | `da0a136fd6220871…` |
| edges_compact.json | 223,192 | `8dac88d5ea7446b9…` |
| workflows_compact.json | 36,155 | `3c5a03c20cd3c585…` |
| validation_cases_compact.json | 8,690 | `c9f166ba69fe73f2…` |

Total payload: ~473 KB (before gzip). Estimated gzipped: ~95 KB.

---

## Invariants Verified

| Check | Result |
|-------|--------|
| No orphan promoted | PASS |
| No unadopted promoted | PASS |
| Banned U+00A7 absent | PASS (count=0) |
| No secret patterns | PASS |
| No dangling edges | PASS |
| No duplicate node IDs | PASS |
| All 8 workflows present | PASS |

---

## Workflow IDs in Package

1. `wf_occupancy_classification`
2. `wf_occupant_load`
3. `wf_egress`
4. `wf_sprinkler`
5. `wf_fire_alarm`
6. `wf_fire_pump`
7. `wf_standpipe`
8. `wf_smoke_control`

---

## Compact Schema (node stripping)

Removed from nodes to reduce size: `content_excerpt`, `body_chars`, `code_text_count`,
`commentary_count`, `exception_count`, `extraction_method`, `source_chunk_id`, `source_hash`.

Kept for runtime use: `node_id`, `code`, `ref`, `node_type`, `title`, `page_start`,
`page_end`, `source_pdf`, `confidence`, `tags`, `canonical_status`.

Orphan nodes: added explicit `do_not_promote: true` flag.

---

## Verdict

**BUILD PASS — 0 errors, 0 warnings**
