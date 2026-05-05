# SBC Extraction Coverage — After R7

Date: 2026-05-05 (R8, read-only)
Companions:
- [docs/brain/SBC_SOURCE_AND_LEDGER_INVENTORY_AFTER_R7.md](docs/brain/SBC_SOURCE_AND_LEDGER_INVENTORY_AFTER_R7.md)
- CSV at [generated/consultx_brain_full/reports/SBC201_801_EXPECTED_VS_ACTUAL_COVERAGE.csv](generated/consultx_brain_full/reports/SBC201_801_EXPECTED_VS_ACTUAL_COVERAGE.csv)

---

## 1. Headline coverage

| Metric | SBC-201 | SBC-801 | Combined |
|--------|--------:|--------:|---------:|
| Ledger expected | 159 | 391 | **550** |
| Strict canonical (EXISTS_CANONICAL) | **95 (59.7%)** | **138 (35.3%)** | **233 (42.4%)** |
| Practically usable (canonical or v1-extracted) | 95 | 139 | **234 (42.5%)** |
| Has any text content (markdown exists, even stub) | 153¹ | 370¹ | 523 (95.1%) of 550 |
| `requires_review:true` content sneaking into primary | 0 | 0 | 0 ✅ |

¹ Counted from D:/sbc_consultx/ master extraction (148 SBC-201 sections + 5 tables + 370 SBC-801 sections).

The "practically usable" figure is essentially identical to strict canonical — the v1 sidecar refresh in R5 added only 1 new section (`sbc-801-section-114-1-1`) that the manifest tracks as `EXTRACTED_IN_V1_NOT_PROMOTED`. **The R5 refresh did not move the section-coverage needle in any meaningful sense from the ledger's point of view**, even though the v1 sidecar grew from 232 chunks to 358.

This is consistent with R7's finding that primary covers more chunks than v1, AND with R7's finding that v1 has ~142 unique-by-section-set entries vs primary. Most of the "v1-only" entries are tables (not section entries — invisible to the section ledger) or partial round-1/round-2 extractions that the ledger still classifies as `STUB` because the source body was frontmatter-only at the time the manifest was generated.

---

## 2. Categorized inventory

The 550 expected entries break down as:

### SBC-201 (159 total)

| Category | Count | What it means |
|----------|------:|---------------|
| CANONICAL_IN_V1_AND_PRIMARY | 90 | Section has substantive verbatim content; appears in both v1 sidecar and (assumed) primary corpus |
| CANONICAL_PRIMARY_ONLY | 5 | Has substantive content but does not appear in v1 sidecar — these are the 5 tables (1004.5, 1006.3.3, 504.3, 504.4, 506.2) tracked as sections-only in the manifest, but their actual records are tables, not sections. |
| FRONTMATTER_ONLY_OR_STUB | **58** | `.md` exists at D:/sbc_consultx but body is frontmatter-only |
| QUARANTINED_NEEDS_REVIEW | **6** | source verification failed; need SME review |
| MISSING_TEXT | 0 | every SBC-201 ledger entry has some `.md` |

### SBC-801 (391 total)

| Category | Count | What it means |
|----------|------:|---------------|
| CANONICAL_IN_V1_AND_PRIMARY | 138 | Section has substantive verbatim content; in both lanes |
| EXTRACTED_IN_V1_NOT_PROMOTED | 1 | Round-2 safe section (`sbc-801-section-114-1-1`) |
| FRONTMATTER_ONLY_OR_STUB | **195** | `.md` exists but body is stub-quality. Largest gap. |
| QUARANTINED_NEEDS_REVIEW | **57** | needs SME review |
| MISSING_TEXT | 0 | every SBC-801 ledger entry has some `.md` (even if stub) |

The single biggest content gap is **SBC-801 stub bodies (195 sections)** — these have `.md` files at D:/sbc_consultx with frontmatter only, no body text. They are the best candidates for an extraction rerun (re-process the source PDFs and pull verbatim body text).

---

## 3. Sections, tables, figures — discrete record types

### SBC-201

| Type | Discrete records found | Status |
|------|----------------------:|--------|
| Sections | 148 of 159 expected (D:/sbc_consultx) | 11 sections never extracted |
| Tables | **5** discrete records | only the 5 critical egress + occupancy tables |
| Figures | **0** discrete records | none extracted as standalone records |

### SBC-801

| Type | Discrete records found | Status |
|------|----------------------:|--------|
| Sections | 370 of 391 expected (D:/sbc_consultx); manifest's own missing_md_count = 11 | 11–21 sections never extracted |
| Tables | **0** discrete records | no SBC-801 tables extracted as standalone records |
| Figures | **0** discrete records | none extracted |

This means table-id queries for SBC-801 (e.g. "what does Table 1004.x say?") have **no discrete record to land on**. The only path is keyword retrieval against section text that may incidentally mention the table — much weaker than the SBC-201 path which has 5 discrete table records.

---

## 4. Coverage by chapter

The CSV at `generated/consultx_brain_full/reports/SBC201_801_EXPECTED_VS_ACTUAL_COVERAGE.csv` has per-section detail for all 550 entries. Per the manifest:

### SBC-201 by chapter

| Chapter | Total | Canonical | Stub | Quarantined | % canonical |
|---------|------:|----------:|-----:|------------:|------------:|
| 1 (Scope) | 15 | 0 | 15 | 0 | 0% |
| 2 (Definitions) | 7 | 0 | 2 | 5 | 0% |
| 3 (Use & Occupancy) | 12 | 0 | 12 | 0 | 0% |
| 4 (Special Detailed Reqs) | 28 | 1 | 26 | 1 | 4% |
| 5 (Heights/Areas) | 13 | 13 | 0 | 0 | **100%** |
| 6 (Construction Types) | 3 | 3 | 0 | 0 | **100%** |
| 7 (Fire & Smoke) | 22 | 22 | 0 | 0 | **100%** |
| 8 (Interior Finishes) | 8 | 6 | 2 | 0 | 75% |
| 9 (Fire Protection Systems) | 18 | 17 | 1 | 0 | **94%** |
| 10 (Means of Egress) | 33 | 33 | 0 | 0 | **100%** |

The actual gap in SBC-201 is **Chapters 1-4 administrative + occupancy + special detailed**. The high-Advisory-priority chapters (5-10, including egress) are well covered.

### SBC-801 by chapter (key ones)

| Chapter | Total | Canonical | PBNC | Quarantined | % canonical |
|---------|------:|----------:|-----:|------------:|------------:|
| 1 (Administration) | 59 | 14 | 38 | 7 | 24% |
| 2 (Definitions) | 2 | 2 | 0 | 0 | 100% |
| 3 (Construction & Occupancy) | 43 | 21 | 22 | 0 | 49% |
| 4 (General Requirements) | 52 | 7 | 24 | **21** | **13%** |
| 5 (Fire Service Features) | 23 | 10 | 13 | 0 | 43% |
| 6 (Building Services) | 12 | 10 | 2 | 0 | 83% |
| 7 (Fire & Smoke) | 15 | 8 | 0 | 7 | 53% |
| 8 (Interior Finishes) | 10 | 8 | 0 | 2 | 80% |
| **9 (Fire Suppression)** | **33** | **17** | 0 | **16** | **52%** |
| 10 (Means of Egress) | 43 | 35 | 6 | 2 | **81%** |
| 11 (Hazardous Materials general) | 11 | 6 | 3 | 2 | 55% |
| 12-onwards (specialty hazmat) | ~92 | 0 | 92 | 0 | **0%** |

Per-chapter SBC-801 picture:
- **Chapter 4 is the worst**: 13% canonical, 21 quarantined (the largest single concentration of needs-review content).
- **Chapter 9 (the most-cited fire-protection chapter)**: 52% canonical. 16 sections quarantined — these are the round-1 attempts that didn't pass verification.
- **Chapters 12+** (cryogenic / specialty hazmat / aviation) are 0% canonical. Not Advisory-critical for typical building-design questions but absent from the corpus entirely.

---

## 5. Strict canonical vs text-present percentages

| Metric | Combined |
|--------|---------:|
| Strict canonical (EXISTS_CANONICAL only, fully verified) | **42.4%** (233 / 550) |
| Has source-of-record `.md` (any quality) | 95.1% (523 / 550) |
| Has substantive verbatim body content | 42.4% (233 / 550) — same as strict canonical |
| Stub or frontmatter-only md | 46.0% (253 / 550) — these have a file but no usable body |
| Quarantined (review-blocked) | 11.5% (63 / 550) |
| Truly missing source `.md` | ~3-5% (17–27 sections) |

**The honest summary**: the corpus has sources of record for nearly every ledger entry, but **only 42% of those sources have substantive body content**. The other 58% are either frontmatter-only stubs (need re-extraction with body text) or quarantined (need SME review).

---

## 6. Uncertainty notes

1. **Manifest's `missing_md_count: 11` vs my computed 21 for SBC-801**. The manifest's accounting is internally consistent but uses a different definition of "missing" than my D:/sbc_consultx file count. Both are valid measures of the same underlying gap; the truth is "between 11 and 21 sections lack any source `.md`".

2. **Tables across both books**: only 5 SBC-201 tables are discrete records. SBC-801 has zero discrete tables. The actual number of *published* tables in each book is much higher (probably 50+ per book). This is a major gap not reflected in the section-level ledger.

3. **Figures across both books**: zero discrete figure records. Source PDFs likely contain hundreds of figures and diagrams (especially in the 31 MB pp 801-1000 SBC-801 PDF). None are accessible to retrieval today.

4. **`brain_full_v3` orphan content**: 1,535 chunks in the bucket but 91.5% medium-confidence and includes 10 of 12 R3-blocked sections. **Not counted in any number above.** Treated as a no-op artifact per R7 risk report.

5. **Primary's actual section count vs my numbers**: R7 inventory found primary covers 331 SBC-201 + 262 SBC-801 distinct section-IDs across its 4,096 chunks. That count includes ledger sections AND administrative entries (chapter intros etc.) that aren't ledger-tracked. The manifest's 233 strict canonical + extra primary-only content overlaps with primary's 331+262 in ways that aren't tidily separable from this CSV alone.

---

## 7. Implications for the next decision

1. **The corpus is NOT primarily blocked on missing sources** (only ~17-27 sections truly lack any extracted text, plus 0 tables for SBC-801 and 0 figures for either).

2. **The primary blocker is body quality**: 253 sections (46% of the corpus) have stub-quality `.md` files. Re-extracting these from the source PDFs is the highest-leverage way to move the strict-canonical % upward.

3. **The 5 critical SBC-201 tables (1004.5, 1006.3.3, 504.3, 504.4, 506.2) ARE extracted** as discrete records and present in v1 sidecar. They are NOT in the section-level manifest by definition (they're tables). The "lost" feeling about these tables comes from primary's table-search not finding them — that's a primary-corpus structuring issue, not an extraction issue.

4. **SBC-801 has 0 discrete tables and 0 figures**. This is a real gap. Building extractors for tables (and ideally figures) is a separate work stream.

5. **57 quarantined SBC-801 sections need SME review**. They have content but verification failed. This is human work, not extraction work.

6. **The 31 MB pp 801-1000 PDF being unparsed** is a separate, high-impact extraction problem. The PDF is unusually large and likely figure-heavy; standard text extractors give up on it. Any plan to truly close SBC-801 Chapter 7-9 coverage in primary needs to address this PDF specifically.

These five points are inputs for Tasks 3-6 of R8.
