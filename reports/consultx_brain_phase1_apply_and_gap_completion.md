# ConsultX Brain — Phase 1 Bucket Apply + Parallel Gap Extraction

**Date:** 2026-05-01
**Validation:** PASS (2987 invariants, 0 failures, after coordinator re-run with gap merge)
**Banned-symbol audit:** 0 hits across 531 files in `data/consultx_brain/full_corpus/` + `generated/consultx_brain_full/`
**Symbol-hygiene memory updated:** `feedback_symbol_hygiene.md` carries the 2026-05-01 reaffirmation.

---

# TRACK A — Bucket-only production apply

## A1. Scanner compatibility (read-only inspection of fire-safety-chat)
- `fetchSBCContext` calls `supabaseAdmin.storage.from("ssss").list("", { limit: 100 })` — lists **root only**, NOT recursive into subfolders.
- Filename filter requires `f.name.endsWith(".json") && f.name.toLowerCase().includes("chunk")`.
- Subsequent family filter: `name.includes("201")|"building"` for SBC 201, `name.includes("801")|"fire"` for SBC 801.
- Page-range scoring: filename pattern `(\d+)\s*-\s*(\d+)`. Files without that pattern get default score 1 (last priority).

**Conclusion:** uploading to a nested path like `brain_full_v1/` is fully PASSIVE. The scanner won't see contents of nested folders. Live retrieval behavior is **unchanged**.

## A2. Upload path chosen
**Nested passive path** (per owner's preferred safe option):
- `ssss/brain_full_v1/SBC201_canonical_chunks.json`
- `ssss/brain_full_v1/SBC801_canonical_chunks.json`

## A3. Artifact validation (pre-upload)
| File | Bytes | Chunks | JSON | Section  count | sha-256 |
|---|---|---|---|---|---|
| `SBC201_canonical_chunks.json` | 2,805,184 | 95 (initial) | valid | 0 | `0ab7d3195d9140e0…` |
| `SBC801_canonical_chunks.json` | 7,932,092 | 137 (initial) | valid | 0 | `1982dc4932df7a12…` |

Note: Pre-upload counts (95/137) reflect the corpus state at the time of upload. After the gap-merge coordinator re-run later, the local generated chunks expanded to 136 / 221 (see Track B summary). The uploaded copies are the pre-merge versions; a re-upload of the post-merge versions can be staged to `ssss/brain_full_v2/` later.

## A4. Bucket snapshot before upload
- 39 root objects (16 SBC 201 page-range chunks + extracted JSON, 20 SBC 801 page-range, plus `SBC801_Ch9_v1_chunks.json`, `SBC801_Ch10_v2_chunks.json`, `SBC801_Ch11_v2_chunks.json`).
- No `brain_full_v1/` prefix existed before this apply.
- No file named `SBC{201,801}_canonical_chunks.json` at root.

## A5. Upload (only the two canonical chunk JSONs)
Executed via `npx supabase storage cp generated/.../<file>.json ss:///ssss/brain_full_v1/<file>.json --linked --experimental` for each of the two files. Two writes total, no other files. No DB writes, no migrations, no edge deploys, no Vercel deploys.

## A6. Post-upload verification
- Public-URL HEAD returned `HTTP/1.1 200 OK` for both objects.
- Public-URL GET round-trip:
  - `SBC201_canonical_chunks.json` → bytes=2,805,184 sha=`0ab7d3195d9140e0…` (matches local)
  - `SBC801_canonical_chunks.json` → bytes=7,932,092 sha=`1982dc4932df7a12…` (matches local)
- Root listing now shows 39 prior objects + 1 new directory marker `brain_full_v1/`. Existing 39 root files are intact.
- `fetchSBCContext`'s `list("", { limit: 100 })` does NOT descend into `brain_full_v1/`, so the new objects are passive in retrieval.

## A7. Live behavior
**Unchanged.** Uploaded files are stored in a nested path that the scanner does not list. The owner's Group M / 1,200 m² question therefore behaves identically to before this Phase-1 apply (same answer, same source panel chips).

## A8. Rollback commands (manual, NOT auto-applied)
```
npx supabase storage rm ss:///ssss/brain_full_v1/SBC201_canonical_chunks.json --linked --experimental
npx supabase storage rm ss:///ssss/brain_full_v1/SBC801_canonical_chunks.json --linked --experimental
```

## A9. Confirmations
- No DB writes.
- No migrations.
- No edge function deploy.
- No Vercel deploy.
- No payment / Moyasar changes.
- No Enterprise changes.
- No GraphRAG activation.
- No sidecar loader.
- No Analytical hook.
- No deletion or overwrite of any existing root file.

---

# TRACK B — Parallel local gap extraction & relation/fact build

## B1. SBC 201 gap completion (Sub-Agent B1)
- Gaps in queue: **64**
- Completed: **41** (all newly_extracted via pymupdf, with section-marker-verified extraction and ±40-page sweep for offset correction)
- Manual_review: **23** (11 quality_fail, 3 marker_not_found_after_sweep, 9 no_pdf_or_unknown_range — sections 203/204/205/206/207/429/918/801/807)
- Reused_existing: 0 (no overlap with available extracts)
- Output: 41 .md + 41 .meta.json under `data/consultx_brain/full_corpus/extracted_gaps/sbc201/`
- Reports: `reports/sbc201_gap_completion_agent_report.{md,json}`
- `summary.broad_extraction_required: false`. Symbol-grep: 0 across all outputs.

## B2. SBC 801 gap completion (Sub-Agent B2)
- Gaps in queue: **253** (3 duplicate ledger-entries collapsed to 84 unique completions)
- Completed: **87** (47 reuse_existing + 40 newly_extracted at the cap)
- Manual_review: **166** (queued for follow-up batch)
- Output: 84 .md + 84 .meta.json under `data/consultx_brain/full_corpus/extracted_gaps/sbc801/`
- Priority chapters fully covered: Ch 9 (16/16 completed), Ch 10 (8/8), Ch 11 (4/4 in scope; 1 deferred to manual_review).
- Reports: `reports/sbc801_gap_completion_agent_report.{md,json}`
- `summary.broad_extraction_required: false`. Symbol-grep: 0.

## B3. Relationship completion (Sub-Agent B3)
- New PROVEN edges added: **254** (additive — separate `gap_completion_relations.json`).
- By type: code_to_code 221, exception_to_main_rule 28, analytical_check_depends_on 4, parent_child 1.
- By origin: cross_ref_in_text 200, frontmatter_dependencies 50, analytical_synthetic 4, gap_extraction 0.
- Coordinator dedup vs base 238 edges → 254 new accepted, 0 duplicates.
- Output: `data/consultx_brain/full_corpus/relations/gap_completion_relations.json`. Symbol-grep: 0.

## B4. Facts & thresholds completion (Sub-Agent B4)
- New facts added: **100** (additive — separate `gap_completion_facts.json`).
- By type: threshold 70, exception 30.
- By source_code: SBC-801 50, SBC-201 50.
- All have non-empty `source_refs` + `source_quote`.
- Coordinator dedup vs base 128 facts → 100 new accepted.
- Output: `data/consultx_brain/full_corpus/facts/gap_completion_facts.json`. Symbol-grep: 0.

## B5. Normalization & dedup (Sub-Agent B5)
- Section count: 228 → **357** (+129).
- Drift findings: title_drift 95, body_does_not_mention_ref 0, orphan_parent 27, duplicate_section_ref 1, missing_source_pages 5.
- Updated indexes: `section_index.json`, `section_aliases.json`, `page_map.json`, `pdf_map.json`.
- Reports: `reports/gap_normalization_completion_report.{md,json}`. Symbol-grep: 0.

## B6. QA & validation (Sub-Agent B6)
- Overall: B6 returned FAIL on two governance categories:
  - **B2 sidecar schema gap** (84 sidecars missing optional `extraction_confidence` + `requires_review` fields). Provenance still captured via `extraction_method` + per-file content. Non-blocking; documented for B2 schema follow-up.
  - **23 LLM_SYNTHESIS markers in pre-existing source MDs** under `sources/sbc801/` (sub-agent C copied them whole because body was substantive). The coordinator's `stripSynthesisMarkers + redactBareTags` pass strips these from generated chunks, so the COMPILED outputs (the artifacts that ship to runtime) pass cleanly.
- Symbol-grep: 0 across 516 files audited.
- Manual_review counts: B1=23, B2=166.
- Report: `reports/gap_completion_validation_report.{md,json}`.

## Coordinator merge (post-B5/B6)
The coordinator was extended to:
1. Walk both `sources/{sbc201,sbc801}/` AND `extracted_gaps/{sbc201,sbc801}/` (sources/ wins on dedup-by-id).
2. Merge `gap_completion_relations.json` into `relations_full` (dedup by `(from_ref, to_ref, relation_type)`).
3. Merge `gap_completion_facts.json` into `facts_full` (dedup by `(section_ref, value, statement-prefix)`).

Re-run output:
| Layer | Pre-merge | Post-merge | Delta |
|---|---|---|---|
| SBC 201 chunks | 95 | **136** | +41 |
| SBC 801 chunks | 137 | **221** | +84 |
| Relations | 238 | **492** | +254 |
| Facts | 128 | **228** | +100 |
| Decision trees | 3 | 3 | — |

**Coordinator validation: PASS — 2987 invariants, 0 failures.**

## Banned-symbol final audit
**0 hits across 531 files** in `data/consultx_brain/full_corpus/` + `generated/consultx_brain_full/`.

## Manual-review queue remaining
- SBC 201: **23 sections** (mostly admin chapters 1xx + a few absent-from-2024-PDF entries).
- SBC 801: **166 sections** (mostly Ch 1, Ch 4 special detailed requirements, and Ch 15-63 referenced standards).
- All catalogued in B1/B2 reports with `proposed_pdf` + `proposed_page_range`.

## Validation pass status
**PASS — 2987 / 2987 invariants.**

---

# Combined production state and next phase

## Production today
| Surface | State |
|---|---|
| Bucket `ssss/` root | unchanged (39 prior files intact) |
| Bucket `ssss/brain_full_v1/` | 2 new objects (passive — not in scanner scope) |
| `sbc_documents`, `sbc_code_tables`, `graph_*` | unchanged |
| `fire-safety-chat` edge function | unchanged |
| Vercel deployment | unchanged |
| Live answer for Group M / 1,200 m² question | unchanged |

## Next recommended production phase (Phase 2 — owner-gated)
Add the `loadBrainFullSidecars` helper (~28 LOC) to `fire-safety-chat` and upload the relations/facts/decision-tree sidecars to `ssss/brain_full_v1/`. Also re-stage the post-merge canonical chunks to `ssss/brain_full_v2/` (or rotate `brain_full_v1/`). This activates the corpus for live Advisory retrieval. Per `reports/full_brain_live_integration_design.md`, this is Phase 2 with 28 LOC and MEDIUM risk; rollback = revert the patch + delete bucket files.

---

STOP — Phase 1 bucket apply and parallel local gap extraction complete. Approval required before DB write, edge deploy, GraphRAG activation, sidecar loader, or Analytical hook.
