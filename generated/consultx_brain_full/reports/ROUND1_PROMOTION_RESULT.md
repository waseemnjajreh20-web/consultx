# Round-1 Promotion — Result Report

Date: 2026-05-05
Branch: `claude/affectionate-solomon-f5e304`
Build script run: `node scripts/build-consultx-brain-full.cjs`

---

## 1. Headline result

**Net new sections promoted to canonical chunks file: 0.**

Round-1 was **already fully promoted** in a prior build (commit `26479a1` Phase 2). The build script's input set already includes all round-1 `.md` files, so a fresh build cannot promote them again.

The build script was run once for verification. It produced a **superset** of the committed chunks, adding 25 round-2 sections that were on disk but not yet in the chunks file. Of those 25, **24 violate the user's "no `requires_review:true` promotions" policy**, so the chunk-file changes were reverted and not committed.

---

## 2. Detailed counts

### Before re-run (committed state, May-1 build)

| Source | Chunks | VERIFIED_CORE | PARTIAL_STRUCTURED | EXISTS_CANONICAL |
|--------|-------:|--------------:|-------------------:|-----------------:|
| SBC-201 | 148 | 95 | 53 | 0 |
| SBC-801 | 221 | 117 | 20 | 84 |
| **Total** | **369** | **212** | **73** | **84** |

### After re-run (build script output, before revert)

| Source | Chunks | VERIFIED_CORE | PARTIAL_STRUCTURED | EXISTS_CANONICAL |
|--------|-------:|--------------:|-------------------:|-----------------:|
| SBC-201 | 150 (+2) | 95 | 55 (+2) | 0 |
| SBC-801 | 244 (+23) | 117 | 20 | 107 (+23) |
| **Total** | **394 (+25)** | **212** | **75** | **107** |

### Newly-included sections (would have been promoted)

| ID | Source dir | requires_review | confidence | Verdict |
|----|-----------|:---------------:|:----------:|---------|
| sbc-201-section-401 | sbc201_round2 | **true** | medium | REJECT (policy) |
| sbc-201-section-402 | sbc201_round2 | **true** | medium | REJECT (policy) |
| sbc-801-section-104-6 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-112-4 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-114-1 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| **sbc-801-section-114-1-1** | **sbc801_round2** | **false** | **0.85** | **SAFE** (1 of 25) |
| sbc-801-section-114-3 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-114-4 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-302-1 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-303-1 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-303-4 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-304-1 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-307-1 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-307-1-1 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-307-4 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-308-1-6-3 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-308-2 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-309-1 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-310-4 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-310-5 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-311-1-1 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-314-4 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-404-2-3 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-406-3 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |
| sbc-801-section-506-1 | sbc801_round2 | **true** | 0.65 | REJECT (policy) |

24 violate the user's explicit instruction "لا ترفع sections تحتاج manual review". Only `sbc-801-section-114-1-1` (Ch 11) is safe per policy, but landing one isolated section is not worth the build noise; defer to the next promotion round.

---

## 3. Validation

The build (before revert) passed all invariants:

- 3,650 invariants run (was 3,498 in the previous build — 152 new chunk-shape invariants for the 25 added chunks)
- 0 failures
- 0 banned-symbol hits in chunk content
- 0 duplicate chunk ids
- 0 chunks with empty `section_ref`
- 0/305 facts without `source_refs`
- 0/842 relations without `source_basis`
- 0/32 decision-tree steps without refs

**The build is sound.** The reason for not committing is **policy**, not validation failure.

---

## 4. Action taken

1. Build script run: `node scripts/build-consultx-brain-full.cjs` → exit 0, `validation_report.overall = PASS`.
2. Diff inspected against committed `brain_manifest_full.json` (May 1 sha hashes).
3. 25 newly-included sections traced to their `.meta.json` files — all from round-2 directories.
4. Per-file `requires_review` audit:
   - 24/25 had `requires_review: true` → violate user policy.
   - 1/25 had `requires_review: false`.
5. **`git checkout -- generated/consultx_brain_full/chunks/ generated/consultx_brain_full/brain_manifest_full.json generated/consultx_brain_full/rollback_manifest_full.json generated/consultx_brain_full/validation_report_full.json`** to revert build artifacts.
6. The build outputs that were purely line-ending changes (relations/, facts/, synthesis/, indexes/) had already been reverted earlier with `git checkout`.
7. Working tree state after revert: only the readiness report and this report remain to be committed.

---

## 5. Updated canonical-completion picture

The committed chunks file is unchanged. From the **chunks** view (what the runtime serves when bucket is updated):

| Source | Chunks | / total ledger | % |
|--------|-------:|---------------:|---:|
| SBC-201 | 148 | 159 | **93%** of ledger represented in chunks file (by chunk count) |
| SBC-801 | 221 | 391 | **57%** |
| Combined | **369** | **550** | **67%** |

These percentages count "any chunk present in the chunks file regardless of canonical_status label". The earlier 42% figure (from the LEDGER `ledger_status` field) is a stricter measurement and is unchanged. Both are valid; they answer different questions:

- **42% (ledger view)** — sections explicitly tagged `EXISTS_CANONICAL` in `data/consultx_brain/full_corpus/manifests/sbc{201,801}_source_manifest.json`.
- **67% (chunks view)** — sections with content present in `generated/consultx_brain_full/chunks/SBC{201,801}_canonical_chunks.json` and served by the runtime.

The runtime does not filter on `canonical_status`, so the 67% chunks view is what the user actually experiences.

---

## 6. Failed invariants

None. `validation_report_full.json` overall = PASS, 3,650 invariants passed, 0 failed.

---

## 7. List of promoted section ids in this run

Empty. Nothing was committed.

---

## 8. List of blocked section ids with reason

24 round-2 sections blocked by **user-stated policy** (`requires_review: true` files must not be promoted in this round):

```
sbc-201-section-401, sbc-201-section-402,
sbc-801-section-104-6, sbc-801-section-112-4,
sbc-801-section-114-1, sbc-801-section-114-3, sbc-801-section-114-4,
sbc-801-section-302-1, sbc-801-section-303-1, sbc-801-section-303-4,
sbc-801-section-304-1,
sbc-801-section-307-1, sbc-801-section-307-1-1, sbc-801-section-307-4,
sbc-801-section-308-1-6-3, sbc-801-section-308-2,
sbc-801-section-309-1,
sbc-801-section-310-4, sbc-801-section-310-5,
sbc-801-section-311-1-1,
sbc-801-section-314-4,
sbc-801-section-404-2-3, sbc-801-section-406-3,
sbc-801-section-506-1
```

1 round-2 section is NOT blocked by policy but was held back to keep this run clean:

```
sbc-801-section-114-1-1   (requires_review=false, confidence=0.85)
```

---

## 9. Recommendation for the next promotion round

The build script `scripts/build-consultx-brain-full.cjs` does **not** filter by `requires_review`. To do a policy-correct promotion of round-2 in a future session:

**Option A — script change**: Add a `requires_review:true` skip in the `buildChunks()` helper at [scripts/build-consultx-brain-full.cjs:244](scripts/build-consultx-brain-full.cjs:244). Single-line addition that reads the sibling `.meta.json` and skips if `requires_review === true`. Zero runtime impact.

**Option B — manifest change**: Update each `requires_review:true` `.meta.json` to `requires_review: false` after a human reviews the section content against the source PDF. SME work; out of scope for an autonomous session.

**Option C — selective inclusion**: Hand-pick sections from the round-2 `requires_review:true` set after manual review and explicitly mark them safe. Most laborious but most accurate.

The minimum-risk path is Option A combined with a separate, deliberate Option B/C task per priority chapter.
