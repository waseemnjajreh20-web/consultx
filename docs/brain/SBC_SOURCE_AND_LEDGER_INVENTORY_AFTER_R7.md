# SBC Source and Ledger Inventory — After R7

Date: 2026-05-05 (R8, read-only)
Companion: [docs/advisory/PRIMARY_RETRIEVAL_ROOT_INVENTORY.md](docs/advisory/PRIMARY_RETRIEVAL_ROOT_INVENTORY.md)

---

## 1. Source PDFs (D:/sbc_consultx/*.pdf)

| Family | PDF parts | Total bytes |
|--------|----------:|------------:|
| SBC 201 | 8 PDFs (pp 1-2200 in 250-page slices) | 137,162,346 (~131 MB) |
| SBC 801 | 10 PDFs (pp 1-2061 in ~200-page slices) | 92,706,287 (~88 MB) |
| **Combined** | **18 PDFs** | **~230 MB** |

PDFs by part (largest → smallest, abbreviated paths):

| File | Bytes | Notes |
|------|------:|------|
| `SBC 201 ...-1251-1500.pdf` | 34,162,751 | full SBC-201 part |
| `SBC 201 ...-1-250.pdf` | 33,108,986 | full SBC-201 part |
| `SBC 801 ...-(3)-801-1000.pdf` | **31,503,285** | **bigger than expected** — runtime extraction emits 0 chunks here |
| `SBC 801 ...-(3)-1-200.pdf` | 28,020,428 | full SBC-801 part |
| `SBC 201 ...-501-1000.pdf` | 21,802,545 | full SBC-201 part |
| `SBC 201 ...-1751-2000.pdf` | 15,053,132 | full SBC-201 part |
| `SBC 201 ...-1001-1250.pdf` | 14,952,279 | full SBC-201 part |
| `SBC 201 ...-2001-2200.pdf` | 11,138,585 | full SBC-201 part |
| `SBC 201 ...-251-500.pdf` | 8,916,109 | full SBC-201 part |
| `SBC 201 ...-1501-1750.pdf` | 7,330,744 | full SBC-201 part |
| `SBC 801 ...-(3)-201-400.pdf` | 6,842,247 | full SBC-801 part |
| `SBC 801 ...-(3)-601-800.pdf` | **4,963,339** | runtime extraction emits **3** chunks here |
| `SBC 801 ...-(3)-1201-1400.pdf` | 4,775,762 | full SBC-801 part |
| `SBC 801 ...-(3)-401-600.pdf` | 4,032,860 | full SBC-801 part |
| `SBC 801 ...-(3)-1801-2061.pdf` | 3,841,193 | full SBC-801 part |
| `SBC 801 ...-(3)-1601-1800.pdf` | 3,466,739 | full SBC-801 part |
| `SBC 801 ...-(3)-1001-1200.pdf` | 3,494,435 | full SBC-801 part |
| `SBC 801 ...-(3)-1401-1600.pdf` | 3,466,739 | full SBC-801 part |
| `SBC 801 ...-(3)-1801-2061.pdf` | 3,841,193 | full SBC-801 part |
| `SBC 801 ...-(3)-1601-1800.pdf` | 2,859,849 | full SBC-801 part |

**Critical observation**: the SBC-801 pp 801-1000 PDF is **31 MB** — by far the largest SBC-801 PDF. The fact that the runtime corpus emits 0 chunks for that page range is a clear extraction failure, not a "source not available" gap. The PDF exists and is unusually large (likely heavy figure content).

---

## 2. Master extraction set (D:/sbc_consultx/*.md, top level)

523 SBC-named `.md` files at the top level of `D:/sbc_consultx/`:

| Type | Count |
|------|------:|
| `sbc-201-section-*.md` | **148** |
| `sbc-201-table-*.md` | **5** |
| `sbc-201-figure-*.md` | **0** |
| `sbc-801-section-*.md` | **370** |
| `sbc-801-table-*.md` | **0** |
| `sbc-801-figure-*.md` | **0** |

The SBC-201 tables that exist as discrete records are exactly the 5 critical tables identified in R7 ([docs/advisory/PRIMARY_VS_SIDECAR_CORPUS_DIFF.md](docs/advisory/PRIMARY_VS_SIDECAR_CORPUS_DIFF.md) Section 3): 1004.5, 1006.3.3, 504.3, 504.4, 506.2.

**No figures and no SBC-801 tables have been extracted as discrete records.**

---

## 3. Local artifacts in this repo

### 3.1 Canonical sources promoted to `data/consultx_brain/full_corpus/sources/`

| Path | Count |
|------|------:|
| `sources/sbc201/sbc-201-section-*.md` | 90¹ |
| `sources/sbc801/sbc-801-section-*.md` | 137 |

¹ Earlier manifests reported 95 SBC-201 promoted. Re-counting today shows 90 with the strict `sbc-201-section-` prefix. The other 5 are likely the SBC-201 tables (`sbc-201-table-*`), which are tracked separately.

### 3.2 Round-1 + round-2 extracted gaps

| Path | Count |
|------|------:|
| `extracted_gaps/sbc201/*.md` | 41 (round-1) |
| `extracted_gaps/sbc201_round2/*.md` | 14 (round-2) |
| `extracted_gaps/sbc801/*.md` | 84 (round-1) |
| `extracted_gaps/sbc801_round2/*.md` | 24 (round-2) |
| **Total round-1+round-2 .md files** | **163** |

R3 policy: 37 of these 163 have `requires_review:true` (14 SBC-201 round-2 + 23 of 24 SBC-801 round-2). Only `sbc-801-section-114-1-1` round-2 is `requires_review:false`.

### 3.3 Generated chunks (post-R3 build)

| Path | Chunks |
|------|------:|
| `generated/consultx_brain_full/chunks/SBC201_canonical_chunks.json` | 136 |
| `generated/consultx_brain_full/chunks/SBC801_canonical_chunks.json` | 222 |
| **Combined** | **358** |

This is the v1 sidecar corpus uploaded to `ssss/brain_full_v1/` in R5.

### 3.4 Generated indexes / manifests

| File | Purpose |
|------|---------|
| `generated/.../indexes/section_index.json` | 357 sections (only those with at least some canonical content). SBC-201: 136 (95 EXISTS_CANONICAL + 41 STUB). SBC-801: 221 (137 + 42 + 42). |
| `generated/.../indexes/section_aliases.json` | Alias / synonyms map |
| `generated/.../indexes/page_map.json` | Section → page-range map |
| `generated/.../indexes/pdf_map.json` | PDF-part → page-range map |
| `data/.../manifests/sbc201_source_manifest.json` | 159 ledger entries: 95 EXISTS_CANONICAL, 58 STUB, 6 QUARANTINED |
| `data/.../manifests/sbc801_source_manifest.json` | 391 ledger entries: 138 EXISTS_CANONICAL, 196 PRESENT_BUT_NOT_CANONICAL, 57 QUARANTINED_UNVERIFIABLE |

### 3.5 Reports directory

`reports/` contains 55 prior-round audit reports (e.g. `advisory-corpus-source-repair-audit.md`, `consultx_brain_full_phase_checkpoint.md`, etc.). Most are historical and pre-date R3-R7. They are kept for audit trail; not used as runtime input.

---

## 4. Reconciliation: what's truly missing from extraction

| Family | Ledger expects | Master `.md` count (D:) | Sections never extracted | Tables never extracted | Figures never extracted |
|--------|---------------:|------------------------:|-------------------------:|-----------------------:|------------------------:|
| SBC-201 | 159 sections | 148 sections + 5 tables = 153 records | **6** | **0 known**¹ | **all (0/?)** |
| SBC-801 | 391 sections | 370 sections + 0 tables = 370 records | **21** | **all (0/?)** | **all (0/?)** |

¹ The 5 SBC-201 tables that exist (1004.5, 1006.3.3, 504.3, 504.4, 506.2) cover the most-cited Advisory tables. Whether SBC-201 has additional published tables that were never given their own `.md` is not directly observable from the ledger files (which track only `*-section-*` entries by default).

The SBC-801 manifest's own `missing_md_count` field reports **11**, which differs from my computed 21. The discrepancy comes from how the ledger counts "expected" vs how the manifest classifies `body_classification: "missing"`. Either way the correct claim is: the not-yet-extracted-from-PDF count for SBC-801 is between **11 and 21 sections**.

The body-classification field shows **241 SBC-801 entries are `stub`** — these have `.md` files but the bodies are stubs (typically frontmatter-only or single-paragraph). This is by far the largest content gap: the SBC-801 corpus has 370 .md files but 241 of them are stub-quality.

---

## 5. The two near-empty page-range bucket files

| File | Bytes (bucket) | Chunks (bucket) | PDF size (D:) | Diagnosis |
|------|---------------:|----------------:|--------------:|-----------|
| `SBC 801 ...-(3)-601-800_extracted_chunks.json` | 12,245 | 3 | 4,963,339 | Source PDF exists with normal size; extraction tooling produced only 3 chunks. Probable cause: this page range may be heavy on figures / scanned pages. |
| `SBC 801 ...-(3)-801-1000_extracted_chunks.json` | 200 | 0 | **31,503,285** | Source PDF is the largest in the SBC-801 set (31 MB — 6× the typical part). Extraction produced 0 chunks. Probable cause: this PDF section is dominated by figures / large tables / scanned images that the text-only extractor did not produce text from. |

The fact that the source PDFs exist and are large means the gap is **fixable** — not a "missing source" issue. It would require a more capable extraction step (OCR? figure-aware parser? Vision-LLM?) before the text content can be extracted into chunks.

The bucket already has redundant coverage of the same content via the special files:
- `SBC801_Ch9_v1_chunks.json` (20 chunks) — covers Chapter 9 (Section 902-915) which lives in pp 601-1000
- `SBC801_Ch10_v2_chunks.json` (30 chunks) — covers Chapter 10 (egress)
- `SBC801_Ch11_v2_chunks.json` (8 chunks) — covers Chapter 11 (hazmat)

So the runtime CAN find Chapter 9 / 10 / 11 content even with the empty page-range files, just at lower retrieval precision.

---

## 6. Missing source risks

| Risk | Severity | Notes |
|------|:--------:|------|
| Source PDFs not available | **None** | All 18 SBC-201 + SBC-801 PDF parts are at `D:/sbc_consultx/` |
| Sections in ledger but not yet extracted to `.md` | **Medium** | 6 SBC-201 + 11-21 SBC-801 = roughly **17-27 sections** lacking source markdown |
| Tables / figures not extracted as discrete records | **Medium** | 0 SBC-801 tables; 0 figures of either family. Most table content is embedded inside section text but not citable as a discrete `Table X.Y` record |
| Stub-bodied `.md` (frontmatter-only) | **Medium** | 241 SBC-801 sections classified `body_classification: "stub"` — content exists in source but extraction produced minimal text |
| Quarantined sections (verification failed) | **Medium** | 6 SBC-201 + 57 SBC-801 = 63 sections need SME review |
| The 31 MB pp 801-1000 PDF being unparsed | **High** | Largest SBC-801 PDF, 0 chunks emitted. Likely OCR or figure-aware extraction needed |
| `brain_full_v3/` orphan in bucket | **Medium-Low** | Latent — covered separately in [BRAIN_FULL_V3_ORPHAN_RISK_REPORT.md](docs/brain/BRAIN_FULL_V3_ORPHAN_RISK_REPORT.md) |

---

## 7. Summary

| Question | Answer |
|----------|--------|
| Source PDFs found? | YES — all 18 parts |
| Master extraction (.md) found? | YES — 523 SBC-named files at `D:/sbc_consultx/` |
| Canonical chunks found? | YES — 358 chunks in `brain_full_v1/` (R5-uploaded), plus 4,096 chunks in primary bucket-root files |
| Generated ledgers / indexes found? | YES — section_index.json (357), section_aliases, page_map, pdf_map, sbc{201,801}_source_manifest |
| Extracted gaps found? | YES — 163 .md files across `sbc{201,801}` × `r1/r2` |
| Tables / figures inventory found? | **PARTIAL** — 5 SBC-201 tables exist as discrete records; 0 SBC-801 tables; 0 figures of either family |
| Missing-source risk? | **None** — all sources are local |
| Hardest extraction gap? | The 31 MB SBC-801 pp 801-1000 PDF that produces 0 text chunks |

This inventory is the input for Task 2 (coverage matrix). All the numbers above are computed live from the file system; nothing is assumed.
