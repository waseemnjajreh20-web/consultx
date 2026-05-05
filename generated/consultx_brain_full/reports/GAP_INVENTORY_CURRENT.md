# SBC Brain — Gap Inventory (current state)

Generated: 2026-05-05
Source of truth: `data/consultx_brain/full_corpus/manifests/sbc{201,801}_source_manifest.json`
Section index: `generated/consultx_brain_full/indexes/section_index.json`

---

## 1. Real completion percentage (from ledger)

These numbers are computed directly from the per-source manifests, not from a self-report or generated summary. They override any prior "93% complete" claim.

| Code | Sections in ledger | EXISTS_CANONICAL | STUB / PBNC | QUARANTINED | % canonical |
|------|--------------------|------------------|-------------|-------------|-------------|
| SBC-201 | 159 | 95 | 58 (STUB) | 6 | **60%** |
| SBC-801 | 391 | 138 | 196 (PBNC) | 57 | **35%** |
| **Combined** | **550** | **233** | **254** | **63** | **42%** |

Definitions:
- **EXISTS_CANONICAL** — verbatim source content was extracted, verified, and promoted to the canonical chunks. Safe to cite from.
- **STUB** (SBC-201) — section exists in the ledger with frontmatter only; body content has not been extracted or has been extracted but not yet promoted.
- **PRESENT_BUT_NOT_CANONICAL** (SBC-801) — equivalent to STUB; raw markdown exists locally but hasn't been promoted to canonical.
- **QUARANTINED** / **QUARANTINED_UNVERIFIABLE** — content was located in the source PDF but the extraction failed verification (e.g. ambiguous section boundary, OCR noise, duplicate section number across editions). Manual review required before promotion.

A row counted as "canonical" means it appears in `generated/consultx_brain_full/chunks/SBC{201,801}_canonical_chunks.json` with `canonical_status: "EXISTS_CANONICAL"` and `confidence: high`.

---

## 2. Round-1 + Round-2 extraction work (already on disk, not yet promoted)

| Location | File count | Confidence | requires_review | Promotion status |
|----------|------------|------------|-----------------|-----------------|
| `data/consultx_brain/full_corpus/extracted_gaps/sbc201/` | 41 | high | false | Not promoted to canonical |
| `data/consultx_brain/full_corpus/extracted_gaps/sbc201_round2/` | 14 | medium | true | Not promoted; needs manual review |
| `data/consultx_brain/full_corpus/extracted_gaps/sbc801/` | 84 | high | false | Not promoted to canonical |
| `data/consultx_brain/full_corpus/extracted_gaps/sbc801_round2/` | 24 | medium | true | Not promoted; needs manual review |
| **Total .md extracts already produced** | **163** | mixed | mixed | All pending promotion |

These 163 markdown files represent **prior gap-closure work** that exists on disk but has NOT been promoted to `EXISTS_CANONICAL` in the ledger. Promotion requires running the orchestrator's QA + invariant validation pipeline. Until that happens, the runtime treats them as STUB/PBNC.

---

## 3. SBC-201 chapter breakdown

| Chapter | Title (approximate) | Total | Canonical | STUB | Quarantined | % canonical | Priority |
|---------|---------------------|------:|----------:|-----:|------------:|------------:|----------|
| 1 | Scope and Applicability | 15 | 0 | 15 | 0 | 0% | Low (admin) |
| 2 | Definitions | 7 | 0 | 2 | 5 | 0% | Medium (5 quarantined) |
| 3 | Use & Occupancy Classification | 12 | 0 | 12 | 0 | 0% | High (occupancy is core) |
| 4 | Special Detailed Requirements | 28 | 1 | 26 | 1 | 4% | Medium (specialized) |
| 5 | General Building Heights/Areas | 13 | 13 | 0 | 0 | **100%** | ✅ Done |
| 6 | Types of Construction | 3 | 3 | 0 | 0 | **100%** | ✅ Done |
| 7 | Fire & Smoke Protection Features | 22 | 22 | 0 | 0 | **100%** | ✅ Done |
| 8 | Interior Finishes | 8 | 6 | 2 | 0 | 75% | Low (2 stubs) |
| 9 | Fire Protection Systems | 18 | 17 | 1 | 0 | 94% | Low (1 stub left) |
| 10 | Means of Egress | 33 | 33 | 0 | 0 | **100%** | ✅ Done |

The user-mentioned priority "**SBC201 egress/occupancy tables**" maps to:
- **Chapter 10 (Means of Egress)** — already 100% canonical, including tables 1004.5 and 1006.3.3.
- **Chapter 3 (Use & Occupancy)** — 0/12 canonical, this is where occupancy classification gap actually is.

So the stated egress priority is already satisfied; the occupancy half is genuinely open.

---

## 4. SBC-801 chapter breakdown

| Chapter | Total | Canonical | PBNC | Quarantined | % canonical | Priority |
|---------|------:|----------:|-----:|------------:|------------:|----------|
| 1 — Administration | 59 | 14 | 38 | 7 | 24% | Low (admin) |
| 2 — Definitions | 2 | 2 | 0 | 0 | 100% | ✅ |
| 3 — Construction & Occupancy Classification | 43 | 21 | 22 | 0 | 49% | Medium |
| 4 — General Requirements | 52 | 7 | 24 | 21 | 13% | High (largest gap) |
| 5 — Fire Service Features | 23 | 10 | 13 | 0 | 43% | Medium |
| 6 — Building Services & Systems | 12 | 10 | 2 | 0 | 83% | Low (close to done) |
| 7 — Fire & Smoke Protection Features | 15 | 8 | 0 | 7 | 53% | Medium (7 quarantined) |
| 8 — Interior Finishes/Furnishings | 10 | 8 | 0 | 2 | 80% | Low (close to done) |
| **9 — Fire Suppression Systems** | **33** | **17** | **0** | **16** | **52%** | **High (user-flagged)** |
| 10 — Means of Egress | 43 | 35 | 6 | 2 | 81% | Low (close to done) |
| 11 — Hazardous Materials (general) | 11 | 6 | 3 | 2 | 55% | Medium |
| 12 — Cryogenic Fluids | 11 | 0 | 11 | 0 | 0% | Low (specialty) |
| 15, 16, 20, 23, 24, 25, 28, 29 | 22 | 0 | 22 | 0 | 0% | Low (specialty hazmat) |
| 31, 32, 33, 35, 37 | 15 | 0 | 15 | 0 | 0% | Low (specialty hazmat) |
| 50–60 (50, 51, 53, 56, 57, 58, 59, 60) | 38 | 0 | 38 | 0 | 0% | Low (specialty industries) |
| 63 — Aviation Facilities | 2 | 0 | 2 | 0 | 0% | Low |

The user-mentioned priority "**SBC801 Chapter 9 / Fire systems**" maps to:
- **17 sections already canonical** (52%)
- **16 sections QUARANTINED** — found in source but extraction failed verification. These need **manual review**, not new extraction.
- 0 sections PRESENT_BUT_NOT_CANONICAL — Chapter 9 has been worked through, just couldn't fully promote.

---

## 5. Categorized gap classification

Per the brief's category list, the current 313 non-canonical sections (254 STUB+PBNC + 63 quarantined — minus the 4 SBC-201 round1 STUB-but-extracted entries that double-count) break down as:

| Category | Count (approx) | Description | Source available? |
|----------|---------------:|-------------|--------------------|
| missing text | ~157 | PBNC sections in SBC-801 with no markdown copy yet (pulled from `body_classification: "stub"` in entries) | Yes — all PDFs at `D:/sbc_consultx/` |
| missing text — extracted but unpromoted (round1) | 125 | Round-1 .md files exist but ledger still says STUB/PBNC | Yes — extraction already happened |
| missing text — extracted but unpromoted (round2) | 38 | Round-2 .md files exist, requires_review=true | Yes — needs review pass |
| missing table | 0 distinct entries | No table-only entries flagged in current section_index | Tables embedded in section bodies |
| missing image / figure | 0 distinct entries | Not currently tracked separately in the ledger | Out-of-scope for canonical chunks (figures rendered from PDFs) |
| section numbering drift | Unknown | Not separately tracked. Round-1 round-2 dual-extraction implies some drift was found. | n/a — needs orchestrator audit |
| relationship / linking missing | Embedded in 842 relations | Relations file already exists; gaps would surface when a missing target section is referenced. Not separately enumerated. | n/a |
| **manual review needed** | **63** | Quarantined sections (6 SBC-201 + 57 SBC-801) | Yes, but requires expert eyes |

Numbers are approximate because the ledger conflates "no markdown" with "markdown exists but not promoted". A precise breakdown would require a join across `body_classification`, `source_md_exists`, and `ledger_status` per entry — a one-shot script, not done here.

---

## 6. Priority targets the user identified

### 6.1 SBC-201 egress / occupancy tables
- **Egress** (Chapter 10): 33/33 canonical — **already complete**. Tables 1004.5, 1006.3.3, 1014.x are all `EXISTS_CANONICAL` per `section_index.json`. No further closure work needed in this batch.
- **Occupancy classification** (Chapter 3): 0/12 canonical. This is the genuinely open half. All 12 sections have local PDFs and likely round-1 markdown extracts; promotion would require an orchestrator run.

### 6.2 SBC-801 Chapter 9 (Fire Suppression Systems)
- 17 sections canonical, 16 quarantined — total 33.
- Round-1 extraction has produced markdown for many of these (903-x, 904-x, 907-x found in `extracted_gaps/sbc801/`). The remaining quarantined 16 need **manual review** — usually because of edition drift, ambiguous section anchors, or extraction noise.

---

## 7. Source availability summary

| Source | Available locally? | Path |
|--------|--------------------|------|
| SBC 201 Saudi General Building Code (8 PDF parts, ~1.6 GB) | ✅ Yes | `D:/sbc_consultx/SBC 201 - The Saudi General Building Code-*.pdf` |
| SBC 801 Saudi Fire Protection Code (10 PDF parts, ~125 MB) | ✅ Yes | `D:/sbc_consultx/SBC 801 - The Saudi Fire Protection Code (3)-*.pdf` |
| Round-1 markdown extracts | ✅ Yes | `data/consultx_brain/full_corpus/extracted_gaps/sbc{201,801}/` |
| Round-2 markdown extracts | ✅ Yes (medium confidence) | `data/consultx_brain/full_corpus/extracted_gaps/sbc{201,801}_round2/` |
| Source-of-truth markdown copies (already promoted) | ✅ Yes | `data/consultx_brain/full_corpus/sources/sbc{201,801}/` (95 + 137 files) |

**Conclusion: there is no "blocked by missing source" gap.** Every non-canonical section has either (a) a local PDF whose page range is recorded in the ledger, (b) a round-1/round-2 markdown extract awaiting promotion, or (c) is quarantined and requires review of content that already exists locally.

---

## 8. Key observation

The 42% combined canonical rate is **the truth**, not 93%. The previous "93%" claim likely conflated **"sections that have ANY content in some artifact"** (manifests + chunks + extracted_gaps + raw markdown) with **"sections promoted to canonical, citable EXISTS_CANONICAL state"**. The retrieval pipeline only treats `EXISTS_CANONICAL` content as authoritative; everything else is reasoning aid at best.

For the Brain to feel "93% complete" to a user, those 163 round-1/round-2 .md files must be **promoted** through the orchestrator's QA + invariant pipeline, and the 63 quarantined sections must go through manual review. Neither is a five-minute job.
