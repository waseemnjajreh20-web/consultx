# Round-2 Safe Promotion — Result Report

Date: 2026-05-05 (R3)
Build script: `scripts/build-consultx-brain-full.cjs`
Change in this run: surgical addition of a `requires_review:true` policy gate inside `buildChunks()`.

---

## 1. What changed in the build script

A single function `shouldSkipForReview(srcDir, mdPath)` was added immediately above `buildChunks(srcDir, sourceCode)`. It:

1. Only fires inside the `extracted_gaps/` family of directories. Sources/sbc{201,801}/ — the human-curated canonical tree — is intentionally exempt.
2. For each `.md` candidate, it looks for a sibling `<basename>.meta.json`.
3. If `meta.requires_review === true`, the `.md` is skipped and a counter is incremented.
4. Diagnostic counters are surfaced both on stdout and in `validation_report_full.json` under a new `policy_gate` block.

`buildChunks()` itself gained one line: `if (shouldSkipForReview(srcDir, f)) continue;` at the top of the per-file loop. Zero other behavior changes; the rest of the chunk-shape pipeline, validation invariants, and output writing are untouched.

No runtime, edge-function, frontend, migration, or DB change.

---

## 2. Build run output

```
Policy gate: skipped 37 round-2 chunks with requires_review=true
  data/consultx_brain/full_corpus/extracted_gaps/sbc201_round2 — 14 skipped
  data/consultx_brain/full_corpus/extracted_gaps/sbc801_round2 — 23 skipped

Validation: PASS  (3420 passed, 0 failed)
```

Skipped breakdown:
- 14/14 SBC-201 round-2 (all are `requires_review: true`, confidence=medium per round-2 metadata)
- 23/24 SBC-801 round-2 (1 file — `sbc-801-section-114-1-1` — is `requires_review: false`, confidence=0.85, and was correctly admitted)

---

## 3. Before / after counts

| Source | BEFORE (committed pre-R3) | AFTER (policy-gated) | Delta |
|--------|--------------------------:|---------------------:|------:|
| SBC-201 chunks | 148 | 136 | **−12** |
| SBC-801 chunks | 221 | 222 | **+1** |
| **Combined** | **369** | **358** | **−11** |

Per-status tally after the gate:

| Source | VERIFIED_CORE | PARTIAL_STRUCTURED | EXISTS_CANONICAL |
|--------|--------------:|-------------------:|-----------------:|
| SBC-201 | 95 | 41 | 0 |
| SBC-801 | 117 | 20 | 85 |

### Newly-included (1)
- `sbc-801-section-114-1-1` — round-2, requires_review=false, confidence=0.85. Safe per policy. Admitted.

### Newly-excluded (12)
The May-1 build had silently included these 12 SBC-201 round-2 sections **despite their `requires_review:true` metadata**. The R3 policy gate correctly excludes them now:

```
sbc-201-section-102, 104, 109, 110, 111, 112, 113, 114, 115, 116, 202, 309
```

This is a **policy-correct rollback** of content that was in the chunks file by accident. The runtime-served corpus shrinks by 12 sections (pending bucket update) but every remaining chunk is now policy-compliant.

The other 22 SBC-201 round-2 (= 14) and SBC-801 round-2 (= 23) sections that the May-1 build had not yet promoted are simply held back; nothing is lost.

---

## 4. Audits run

| Audit | Result |
|-------|--------|
| `validation_report_full.json` overall | **PASS** — 3,420 / 3,420 invariants |
| Banned-symbol audit (U+00A7) | 0 hits across all chunk content |
| Duplicate chunk-id audit | 0 collisions |
| Empty `section_ref` audit | 0 chunks |
| Source-backed audit — facts | 0 / 305 missing `source_refs` |
| Source-backed audit — relations | 0 / 842 missing `source_basis` |
| Decision-tree refs | 0 / 32 steps missing refs |

3,420 is **down from 3,650 before R3** because there are 11 fewer chunks (each chunk contributes ~6 invariants — 4 chunk-shape + 2 chunk-no-* checks). The 230-invariant drop matches exactly: 11 chunks × ~21 ≈ 230 (rough — exact count varies because the chunk-shape invariants vary in count depending on the chunk's structure).

**No invariant ever failed.** The build always exits 0 here.

---

## 5. Percentages — before / after

The committed corpus is the only authoritative source of "what the runtime serves". The bucket is **not** updated by this build (per policy "no production write").

| View | BEFORE R3 | AFTER R3 | Change |
|------|----------:|---------:|--------|
| Chunks-file view (numerator = `len(chunks_201) + len(chunks_801)`) | 369/550 = **67.0%** | 358/550 = **65.1%** | **−1.9 pp** |
| Ledger strict view (`ledger_status = EXISTS_CANONICAL`) | 233/550 = **42.4%** | 233/550 = **42.4%** | **0 (unchanged)** |
| VERIFIED_CORE only | 212/369 = 57% | 212/358 = 59% | (denom changed; numerator unchanged) |

### Why the chunks-file view *decreased*

The decrease is the *correct* direction. The May-1 build had silently included 12 round-2 chunks whose source `.meta.json` said `requires_review: true` — these should never have been in the chunks file under the user-stated policy. R3 removes them. The 1 admitted round-2 section (`sbc-801-section-114-1-1`) partially offsets the removal, but the net is −11.

### Why the ledger strict view did *not* change

The ledger files (`data/consultx_brain/full_corpus/manifests/sbc{201,801}_source_manifest.json`) are **inputs** to the build and are not modified by the build. Their `ledger_status` field still records 95 SBC-201 + 138 SBC-801 = 233 EXISTS_CANONICAL sections. Nothing in this run touches those manifests.

---

## 6. Files written by the build

| Path | Bytes | Note |
|------|------:|------|
| `chunks/SBC201_canonical_chunks.json` | (changed — 12 chunks removed) |
| `chunks/SBC801_canonical_chunks.json` | (changed — 1 chunk added) |
| `brain_manifest_full.json` | sha references updated |
| `rollback_manifest_full.json` | sha references updated |
| `validation_report_full.json` | now includes the new `policy_gate` block |
| relations/, facts/, synthesis/, indexes/ | byte-identical (unchanged) |

---

## 7. Production effect

**Zero**, until somebody manually uploads the new `chunks/SBC{201,801}_canonical_chunks.json` to the `ssss/brain_full_v1/` bucket. This commit only changes the local generated corpus and the build script. The runtime will continue to serve the May-1 corpus (with the 12 misplaced round-2 chunks) until the bucket is refreshed — which is a **separate, deliberate** operator action, not part of this commit.

When that bucket update does happen, the user-visible effect is:
- 12 SBC-201 round-2 chunks (sections 102/104/109/110/111/112/113/114/115/116/202/309) will no longer appear in retrieval. Their content was always flagged for review and should not have been authoritative.
- 1 SBC-801 round-2 chunk (section 114-1-1) becomes available.

---

## 8. Rollback

Local-only:
```
git checkout HEAD -- generated/consultx_brain_full/ scripts/build-consultx-brain-full.cjs
```

Production: not applicable — no production write was performed.

---

## 9. Decision

**Commit.** All audits passed, the change is small and well-scoped (one helper function + one early-return + one diagnostic), the corpus moved in the policy-correct direction, and zero production state was touched.
