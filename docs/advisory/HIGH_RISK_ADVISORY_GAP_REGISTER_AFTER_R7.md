# High-Risk Advisory Gap Register — After R7

Date: 2026-05-05 (R8, read-only)
Companion: [docs/brain/SBC_EXTRACTION_COVERAGE_AFTER_R7.md](docs/brain/SBC_EXTRACTION_COVERAGE_AFTER_R7.md)

---

## 1. High-risk gaps (Advisory blockers — most-cited content)

These are the gaps that materially hurt Advisory's ability to answer common consultant questions correctly. Each entry below is a real coverage hole confirmed against the source manifests.

### 1.1 SBC-801 Chapter 9 — Fire Suppression Systems (sprinkler + alarm)

**Coverage**: 17 of 33 sections canonical (52%). 16 sections **quarantined** (verification failed).

**Quarantined sections (high-cited subset)**:

| Section | Topic | Why it matters |
|---------|-------|---------------|
| 903.2 | Where sprinklers required | One of THE most-cited sections in Advisory |
| 903.3.1.1 | NFPA 13 sprinkler systems | Sprinkler design type |
| 903.3.1.3 | NFPA 13D residential sprinklers | Residential / multi-family |
| 901.2 | General fire-protection scope | Foundational |
| 901.6, 901.7.1 | Fire system component approval | Cited often for compliance |
| 904.7, 904.10, 904.13 | Special suppression systems | Less common but high-value when asked |
| 907.2.11 | Fire alarm — single + multiple stations | Residential alarm requirements |
| 907.3 | Manual fire alarm boxes | High-school / institutional |
| 907.5.2.1.1, 907.5.2.2 | Notification appliances + thresholds | Common alarm-design question |
| 914.8.3 | Smoke control activation | Smoke-control queries |
| 915.5.1 | Carbon monoxide detection | Newer code requirement, often asked |

**Risk**: an Advisory query asking about sprinkler thresholds (Group M, Group R, etc.) lands on the 17 canonical Ch9 sections, but if the user drills into specific sub-clauses (903.2, 907.2.11, 915.5.1), the citation cannot resolve. Citation Verifier may downgrade to `unsupported` or the model fabricates if it doesn't see Evidence Ledger backing.

**Bucket-side mitigation**: `SBC801_Ch9_v1_chunks.json` (20 chunks, 20 distinct sections) at the bucket root partially fills this. But its schema is different and it has no `page_start/page_end`, so source-meta panel is degraded.

---

### 1.2 SBC-201 Chapter 3 — Use & Occupancy Classification

**Coverage**: 0 of 12 sections canonical (**0%**). All 12 are STUB / frontmatter-only.

**All 12 stub sections**: 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312

**Why critical**: These sections define Saudi-Building-Code occupancy classifications:
- 303 — Assembly Group A
- 304 — Business Group B
- 305 — Educational Group E
- 306 — Factory Group F
- 307 — High-hazard Group H
- 308 — Institutional Group I
- 309 — Mercantile Group M
- 310 — Residential Group R
- 311 — Storage Group S
- 312 — Utility Group U

**Risk**: occupancy classification is the FIRST step in answering almost any Advisory question. Without this content canonical, the runtime falls back to keyword retrieval against page-range files (which DO have this content via Section 303-312 mentions inside the SBC-201 1-250 page-range chunks). The result is partial coverage with degraded citation precision — Advisory may correctly identify Mercantile / Residential / Business but cannot cite the specific section as authoritative.

**Mitigation**: The PRIMARY corpus has these sections via the `SBC 201 ...-1-250_extracted_chunks.json` file (which contains pp 1-250, where Chapter 3 lives). Section content IS retrievable, just not as a discrete `EXISTS_CANONICAL` ledger entry.

---

### 1.3 SBC-801 Chapter 4 — General Requirements

**Coverage**: 7 of 52 canonical (**13%**). The worst single chapter.

| Status | Count |
|--------|------:|
| EXISTS_CANONICAL | 7 |
| PRESENT_BUT_NOT_CANONICAL (stub) | 24 |
| QUARANTINED_UNVERIFIABLE (stub) | 10 |
| QUARANTINED_UNVERIFIABLE (missing) | **11** |

**Quarantined sections include 408-422** (15 consecutive sections covering everything from 408 (special hazards) through 421 (special equipment)). 11 sections in this chapter have NO `.md` source at all — this is the largest concentration of "missing source" content.

**Why critical**: Chapter 4 contains general requirements often referenced by other chapters. Cross-references from sprinkler/alarm/egress chapters into Chapter 4 leave dangling references when Chapter 4 sections aren't canonical.

---

### 1.4 The 5 critical SBC-201 tables — present in v1 sidecar, NOT in primary section index

**Coverage**: All 5 tables exist as discrete `.md` records at `D:/sbc_consultx/sbc-201-table-*.md`. They are extracted as chunks in v1 sidecar. They are **NOT** in the section-level manifest (which only tracks sections, not tables).

| Table | Topic | Why critical |
|-------|-------|--------------|
| Table 1004.5 | Maximum floor area allowances per occupant (occupant-load factors) | Most-cited table in Advisory by far. Used in every occupancy-load calculation. |
| Table 1006.3.3 | Minimum number of exits or access to exits per story | Egress-design fundamental |
| Table 504.3 | Allowable building height | Building-height calculations |
| Table 504.4 | Allowable number of stories | Same |
| Table 506.2 | Allowable area limits | Building-area calculations |

**Risk**: Advisory queries asking "what is the occupant load per Table 1004.5?" hit the structured-table DB-first path ([supabase/functions/fire-safety-chat/index.ts:5395](supabase/functions/fire-safety-chat/index.ts:5395)). Whether `1004.5` is seeded into `sbc_code_tables` is unverified by this round (DB read forbidden); if seeded, the path works. If not seeded, the fallback is keyword retrieval against page-range chunks, which may surface Section 1004.5 text but not the table cells discretely.

**Primary corpus does NOT carry these as discrete table records** — the page-range chunks may include the table content embedded in section text, but they're not citable as `Table 1004.5` discrete records.

---

### 1.5 SBC-801 tables — completely absent

**Coverage**: 0 SBC-801 tables extracted as discrete records.

The `D:/sbc_consultx/` master extraction has zero `sbc-801-table-*.md` files. SBC-801 has many published tables (egress travel-distance tables, suppression-system thresholds, fire-resistance tables, etc.). None are accessible to retrieval as discrete records.

**Risk**: any SBC-801 table query (e.g. "Table 1004.5 from SBC-801"; "Table 906.3 (portable extinguisher hazard classifications)") cannot land on a discrete record. Either the keyword retrieval surfaces the table inside section text, or the model has nothing to cite. Citation Verifier will downgrade SBC-801 table citations.

---

### 1.6 Empty SBC-801 page-range files in primary

**Coverage**: pp 601-1000 in the bucket root is essentially empty (3 chunks at pp 601-800 + 0 chunks at pp 801-1000).

**Why critical**: this page range covers SBC-801 Chapters 7-9 (fire & smoke protection features, interior finishes, **fire suppression**). Chapter 9 specifically — the most-cited Advisory chapter — lives in this range.

**Mitigation already in bucket**: `SBC801_Ch9_v1_chunks.json` (20 chunks), `SBC801_Ch10_v2_chunks.json` (30 chunks), `SBC801_Ch11_v2_chunks.json` (8 chunks). These provide redundant coverage of Chapters 9-11. But:
- `Ch9_v1` schema has no `page_start/page_end` — source-meta degraded.
- `Ch10_v2` schema falls through the parser to JSON.stringify — retrieval treats 30 chunks as one mega-chunk (R7 finding).

**Source PDFs exist** — `(3)-601-800.pdf` is 5 MB (normal), `(3)-801-1000.pdf` is **31 MB** (largest SBC-801 PDF — probably figure-heavy or scan-only).

---

## 2. Medium-risk gaps

These are real coverage holes but for content that is asked-about less often than Section 1 items.

### 2.1 SBC-801 Chapter 10 stub sections (egress sub-clauses)

8 sections in Chapter 10 are stub: 1006.2.2.1, 1007.1.1, 1010.2.9, 1017.3.1, 1027.6, 1029.1.1, 1030.1.1, 1031.3.3. Most are sub-sub-clauses; the chapter is 81% canonical overall, so the average egress query lands on a canonical section. But specific sub-clause queries miss.

### 2.2 SBC-201 Chapter 4 (Special Detailed Requirements) stubs

26 of 28 sections stub. Includes things like atriums (404), drive-through canopies (405), hazardous materials (415), motor-fuel-dispensing (406-408). Less-frequent Advisory queries.

### 2.3 SBC-801 Quarantined Chapter 7 (Fire & Smoke)

7 sections quarantined out of 15. Mid-importance.

### 2.4 SBC-801 Chapter 5 (Fire Service Features)

10 of 23 canonical (43%). 13 PBNC-stub. Includes fire-department access (501), water supply for fire-protection (505-510). Important for high-rise queries; lower-priority for typical mercantile / residential.

### 2.5 SBC-801 Chapter 11 (Hazardous Materials general)

6 of 11 canonical. Hazmat queries are less frequent.

---

## 3. Low-risk gaps

These don't materially hurt typical Advisory queries.

### 3.1 SBC-201 Chapter 1-2 (Scope, Definitions)

22 stub sections. Chapter 1 is "what code applies", Chapter 2 is "what does X mean". Asked rarely; the model can answer most code-applicability questions from general SBC knowledge.

### 3.2 SBC-801 specialty Chapters 12+ (cryogenic, hazmat, aviation)

92 sections at 0% canonical across Chapters 12, 15, 16, 20, 23, 24, 25, 28, 29, 31, 32, 33, 35, 37, 50, 51, 53, 56, 57, 58, 59, 60, 63. Highly specialized — outside typical building-design Advisory scope.

### 3.3 SBC-201 Chapter 11+ (interior environment, accessibility, etc.)

Various stubs. Less-commonly asked.

---

## 4. v1-only sections high-risk subset

From R7 diff Section 3 — 142 sections only in v1 sidecar, not in primary. The high-risk subset:

| Family | Section | Topic | Risk |
|--------|---------|-------|------|
| SBC-201 (table) | 1004.5 | Occupant-load factors | **HIGH** — most-cited table |
| SBC-201 (table) | 1006.3.3 | Min exits per story | **HIGH** — egress |
| SBC-201 (table) | 504.3, 504.4 | Building height + stories | **HIGH** — design |
| SBC-201 (table) | 506.2 | Allowable area | **HIGH** — design |
| SBC-801 | 1013.5 | Exit signs | Medium |
| SBC-801 | 1021-1029, 1030-1032 | Egress sub-clauses | Medium |
| SBC-801 | 301-315 (Ch 3 occupancy) | Occupancy classification | **HIGH** — but mostly cross-cited from SBC-201 |
| SBC-801 | 401, 404-413, 416-418 | General requirements | **HIGH** — Ch 4 backbone |
| SBC-801 | 501, 504-510 | Fire service | Medium |

**5 SBC-201 tables + ~30 high-value SBC-801 sections = 35 high-risk only-v1 entries** that an Advisory user benefits from but primary corpus does not have as discrete records.

---

## 5. Gaps caused specifically by near-empty SBC-801 root files

The pp 601-1000 page-range files cover SBC-801 Chapters 7-11. Cross-referencing the empty files against the source manifest:

| Chapter (SBC-801) | Sections in page range | Status in source manifest |
|-------------------|-----------------------|---------------------------|
| 7 — Fire & Smoke Protection | 15 sections | 8 canonical, 7 quarantined |
| 8 — Interior Finishes | 10 sections | 8 canonical, 2 quarantined |
| **9 — Fire Suppression** | **33 sections** | **17 canonical, 16 quarantined** |
| 10 — Egress (partial) | 43 sections | 35 canonical, 6 PBNC, 2 quarantined |

So the empty page-range files would contain content for **101 SBC-801 sections**. Of those, 68 are canonical-tracked (already covered by `Ch9_v1_chunks.json` etc.), 25 are quarantined or stub (where the empty page-range files would have helped if extraction succeeded). The damage is bounded by the fact that the special Ch9/Ch10/Ch11 files exist.

---

## 6. Gaps that block primary confidence

The single most-impactful blocker for Advisory citation precision after R5 is:

> **The 5 critical SBC-201 tables (1004.5, 1006.3.3, 504.3, 504.4, 506.2) are not citable as discrete records from the primary corpus.**

These tables are present in v1 sidecar (R5 refresh confirmed). They are also (probably) seeded in `sbc_code_tables` DB. But the bucket-root primary path does NOT have them as discrete records. So citation traceability for table queries depends on either the DB-first path or the v1 sidecar — both bypassing the primary keyword retrieval that the Citation Verifier ultimately enforces.

---

## 7. Gaps that can be covered by fallback

These are gaps where **a fallback already exists** in the runtime:

| Gap | Fallback | Effectiveness |
|-----|----------|---------------|
| SBC-801 Ch9 (sprinkler/alarm) page-range gap | `SBC801_Ch9_v1_chunks.json` redundant file | Effective for retrieval; degraded source-meta |
| SBC-801 Ch10 (egress) page-range gap | `SBC801_Ch10_v2_chunks.json` redundant file | Parser falls through, retrieval treats it as one mega-chunk; semi-effective |
| SBC-801 Ch11 (hazmat) page-range gap | `SBC801_Ch11_v2_chunks.json` redundant file | Effective (only 8 chunks anyway) |
| Empty-retrieval on Chapters 12+ specialty | RETRIEVAL NOTE + diagnostic protocol | Effective in preventing hallucination, but doesn't *answer* the question |
| Quarantined sections | V1 sidecar may have round-1 attempt | Partial — only useful if user JWT triggers V1 sidecar |

---

## 8. Top high-risk things to fix

In priority order:

1. **Re-extract SBC-801 pp 601-1000** from source PDFs (Chapter 7-9 coverage in primary). The 31 MB pp 801-1000 PDF specifically needs OCR / vision-aware extraction.

2. **Seed the 5 critical SBC-201 tables into the primary corpus** as discrete records OR confirm they're already in `sbc_code_tables` DB and tighten the structured-table-detection regex to catch them reliably.

3. **Manual SME review of the 16 quarantined SBC-801 Chapter 9 sections** (sprinkler / alarm sub-clauses). These have content but verification failed. Human review can salvage most.

4. **Re-extract the 195 SBC-801 stub-bodied sections** with body text (currently frontmatter-only). This is large-scale extraction work; needs an orchestrator session.

5. **Manual SME review of the 21 quarantined SBC-801 Chapter 4 sections** (sections 408-422 + 11 missing-md).

6. **Extract SBC-801 tables and figures** as discrete records. None exist today. New extraction work stream.

Items 1-3 are tractable in an operator-controlled session. Items 4-6 are multi-session SME work.
