# Primary Corpus vs V1 Sidecar — Diff

Date: 2026-05-05 (R7, read-only)
Companion: [docs/advisory/PRIMARY_RETRIEVAL_ROOT_INVENTORY.md](docs/advisory/PRIMARY_RETRIEVAL_ROOT_INVENTORY.md)

This document compares the actual section coverage of the **primary retrieval corpus** (21 files at `ssss/` root) against the **V1 sidecar reasoning-aid corpus** (5 files at `ssss/brain_full_v1/`, refreshed in R5).

---

## 1. Headline numbers

| Metric | Primary (root) | V1 sidecar | Delta |
|--------|---------------:|-----------:|------:|
| SBC-201 chunks | 2,776 | 136 | primary > v1 by 20× |
| SBC-201 distinct sections (parsed) | **331** | **136** | primary covers more |
| SBC-801 chunks | 1,320 | 222 | primary > v1 by 6× |
| SBC-801 distinct sections (parsed) | **262** | **222** | primary covers more |
| Combined chunk count | 4,096 | 358 | primary > v1 by 11× |
| Combined distinct sections | 593 (with overlap) | 358 (no overlap) | — |

**Key inversion of the prior framing**: primary is *richer* than the v1 sidecar in both raw chunk count and distinct section coverage. Earlier closeouts ("local R3-gated 358 chunks vs production 232") were comparing the v1 sidecar count against the v1-only sidecar count, NOT against the primary corpus. The full primary corpus has always been ~4,000+ chunks across ~590+ sections.

The primary's "section count" is computed by extracting `chunk.section_number || chunk.section_id || chunk.section || chunk.section_ref` from each parsed chunk. Some primary chunks are administrative (chapter title pages, TOC pages) and would not produce useful citations, but they still contribute to the count.

---

## 2. Set operations

### SBC-201

| Set | Count |
|-----|------:|
| Sections in BOTH primary and v1 | **119** |
| Only-primary (not in v1) | **212** |
| Only-v1 (not in primary) | **17** |

### SBC-801

| Set | Count |
|-----|------:|
| Sections in BOTH primary and v1 | **97** |
| Only-primary (not in v1) | **165** |
| Only-v1 (not in primary) | **125** |

The asymmetry is sharper for SBC-801: the v1 sidecar contains 125 sections that the primary corpus does not have — a real gap, not just metadata noise.

---

## 3. What's actually only in v1 (the high-value gap)

### SBC-201 (17 only-v1)

By chapter:

| Group | Sections | Notes |
|-------|---------:|-------|
| **Tables** | **5** | `sbc-201-table-1004-5`, `sbc-201-table-1006-3-3`, `sbc-201-table-504-3`, `sbc-201-table-504-4`, `sbc-201-table-506-2`. These are explicit table records — exactly the high-value egress + occupancy tables that R1's audit identified as critical for Advisory citations. |
| Ch 4xx | 4 | 409, 418, 423, 426 |
| Ch 7xx | 2 | 702, 719 |
| Ch 6xx | 1 | 601 |
| Ch 8xx | 1 | 802 |
| Ch 9xx | 1 | 913 |
| Ch 1xx | 1 | 107 |
| Ch 10 | 2 | 1003, 1029 |

**Operational meaning**: the 5 explicit table records are the most valuable — they are exactly what gets returned to the model when the user asks "what is the occupant load per Table 1004.5?". The primary corpus has Chapter 10 free-text content but does not surface tables as discrete citable records.

### SBC-801 (125 only-v1)

| Group | Sections (count) | High-value? |
|-------|-----------------:|-------------|
| Ch 3xx (occupancy classification) | 15 (301, 303-307, 309, 311, 313, 315, …) | **YES** — occupancy class is the primary determinant for fire-protection requirements |
| Ch 4xx (general requirements) | 12 (401, 404-413, 416, 418) | **YES** — including occupancy load in 401 |
| Ch 10 (egress) | 13 (1013.5, 1021-1029, 1030-1032, …) | **YES** — egress chain |
| Ch 6xx (building services) | 7 (601, 604-610) | medium |
| Ch 5xx (fire service features) | 6 (501, 504-510) | **YES** — fire department access |
| Ch 11 (cryogenic / hazardous materials) | 1 (1108) | low |
| Ch 23, 31, 33, 56 (specialty hazmat) | 4 (2311, 3105, 3305, 5604) | low |
| Ch 1xx (admin) | 2 (104, 120) | low |
| Ch 7xx, 8xx, 9xx | 3 (703, 802, 909) | medium |
| **"other" with hyphenated IDs** (`102-7-1` etc.) | **62** | **mixed — these are the round-1 + round-2 extracted-gap sections** in the sub-sub-clause naming (e.g. `sbc-801-section-102-7-1` reads `section_ref` as `102-7-1` but represents `Section 102.7.1`) |

**The 62 hyphenated-ID sections are the round-1 + round-2 gap closures** that R3 policy-gated and R5 uploaded to the v1 sidecar. These IDs are the same content the primary corpus *should* have, but in a different naming convention. Some of those `102-7-1`-style IDs may match `102.7.1`-style entries in primary (if I normalize hyphen-to-dot) — the diff would shrink. A proper normalization pass would tell exactly how many are net-new vs format-different.

---

## 4. What's only in primary

### Sample of "only-primary" SBC-201 (212 total)

`101, 102, 109, 110, 1101, 1102, 1104-1112, 111, 112, 114, 115, 1201, ...`

These are mostly:
- **Chapter title and front-matter pages** (101, 102, 109, 110, 111, 112, 114, 115) — administrative, low citation value.
- **Chapter 11 sections** (1101-1112) — that's chapter 11 of SBC-201, which is interior environment. v1 sidecar's narrow trigger doesn't include this chapter's keywords, so v1 never had reason to load these.
- **Chapter 12 sections** (1201) — exit and accessibility, similar story.

So a large fraction of the 212 only-primary entries are *low-citation-value*: chapter intros, page-range files including overlap regions, etc. The genuine "primary covers, v1 doesn't" gap is smaller than 212 — perhaps 50-100 high-value sections.

### Sample of "only-primary" SBC-801

`1009.9, 1010.1.1, 1010.2.8, 1010.2.9, 1010.3.2, 1011.2, 1110.15, 1201-1207, 1511, 2001, 2005-2007, 2101, 2106, ...`

Some of these (1010.x.y, 1011.x) are sub-clauses of egress. Others (12xx, 15xx, 20xx, 21xx) are specialty chapters that v1 doesn't index because they're outside the V1 sidecar's curated domain.

---

## 5. Gaps by direction

### Primary covers but v1 doesn't (one-way primary > v1)
- **+212 SBC-201 sections** — mostly admin and Ch 11/12 (low high-value).
- **+165 SBC-801 sections** — mix of egress sub-clauses and specialty chapters.

If the runtime *removed* primary in favor of v1, it would lose this content. **OPTION B (switching primary to v1) would shrink coverage**, not expand it.

### V1 covers but primary doesn't (one-way v1 > primary)
- **+17 SBC-201 sections** — including 5 critical tables (1004.5, 1006.3.3, 504.3, 504.4, 506.2).
- **+125 SBC-801 sections** — including ~30 high-value egress / occupancy / fire-service sections + ~62 hyphenated-ID round-1/2 gap closures.

If primary were *augmented* with v1 (without removing primary), it would add this content. **OPTION C (augmenting primary with v1)** would expand coverage by ~142 sections without losing any.

---

## 6. Schema reconciliation issues

If v1 content were to feed primary's Evidence Ledger, two schema differences must be reconciled:

### 6.1 Section ID format

| Primary | v1 sidecar |
|---------|------------|
| `section_number: "903.2.7"` (dot-separated) | `section_ref: "903.2.7"` (dot-separated) — same format for most sections |
| `section_id: "..."` (UUID-like) | `id: "sbc-801-section-903-2-7"` (hyphen-separated within ID) |

Most v1 chunks use **dot-separated** `section_ref` (like `903.2.7`), so direct compare works. But about 62 SBC-801 v1 chunks use the hyphenated form in the `section_ref` field (e.g. `section_ref: "102-7-1"` instead of `"102.7.1"`). A normalization pass (replace hyphens with dots when matching) would correctly join those to primary's dot-form sections.

### 6.2 Page number presence

| Primary | v1 sidecar |
|---------|------------|
| `page_start: 412, page_end: 415` always present | `source_pages: "p. 5 (1-2 pages)"` for some chunks; `source_pages: null` for round-1 round-2 extracted-gap sections |

If v1 chunks feed the source-meta panel without page numbers, the user sees "Source: SBC-801 Section 903.2.7 (page unavailable)" instead of "pp 412-415". Acceptable degradation but observable.

### 6.3 Confidence + status fields

V1 has `canonical_status` (`VERIFIED_CORE` / `EXISTS_CANONICAL` / `PARTIAL_STRUCTURED`) and `confidence` (`high` / `medium`). Primary chunks don't have these. The Citation Verifier would need to ignore them or be taught to interpret them.

### 6.4 Top-level shape (parser already tolerant)

V1 file: `{"schema_version":"1.0","source_book":"SBC 201","chunk_count":136,"chunks":[...]}`

Primary file: `{"code_id":"SBC-201","title":"...","total_chunks":287,"chunks":[...]}`

Both use `parsed.chunks` — the existing parser at [supabase/functions/fire-safety-chat/index.ts:1863](supabase/functions/fire-safety-chat/index.ts:1863) handles both without code change.

---

## 7. Is v1 healthy enough to act as primary?

**No** — for two reasons:

### 7.1 V1 is missing too much primary content

Switching primary to v1 would lose 377 sections (212 SBC-201 + 165 SBC-801) the runtime currently serves. Many are admin, but a substantive subset is real coverage (egress sub-clauses, specialty chapters). This is a regression, not an upgrade.

### 7.2 V1's content type does not match primary's full-text retrieval expectation

Primary chunks are paragraph-sized full-text excerpts that the keyword scorer matches against. V1 chunks are denser per-section blocks with a `content_kind: "canonical_verbatim"` tag and tight 1,200-char cap on body. The retrieval semantics differ — v1 is closer to "one chunk per section" while primary is "many chunks per section, partitioned by paragraph". If v1 alone fed retrieval, the scorer's signal would change, the chunk-budget math would change, and Advisory queries would suddenly score v1's per-section blocks higher than primary's per-paragraph splits.

So v1 is **NOT** a drop-in replacement for primary.

---

## 8. What is the SAFE additive path?

**Augment primary with the high-value v1 entries only**, not the full v1 corpus. Specifically:

- Add the **5 critical SBC-201 tables** (`sbc-201-table-1004-5`, `1006-3-3`, `504-3`, `504-4`, `506-2`) so explicit table-id queries land on a discrete citable record. These are the highest-leverage adds because table-id queries are common in Advisory and the primary corpus does not surface tables as discrete records.

- Add **the ~30 high-value SBC-801 sections** that v1 has and primary doesn't (egress 1013.5 / 1021-1032; occupancy classification 301-315; fire-service 501-510). These would expand citable coverage in the most-asked-about chapters.

- **Skip the 62 hyphenated-ID entries** for now — they likely overlap with primary content under different IDs; an ID-normalization pass should run first.

- **Skip the 212 only-primary entries** — they stay where they are, on the primary lane.

This is OPTION C (Hybrid) from the brief: keep primary as-is, augment with high-value v1 entries only. Avoids the schema reconciliation pain and avoids the regression risk of OPTION B.

---

## 9. Risks of any direct wiring

If any future code change wires `brain_full_v1/` into `fetchSBCContext` directly:

| Risk | Likelihood | Impact |
|------|:----------:|--------|
| Coverage regression (377 sections lost) | High if naive replacement | Major — affects Main, Advisory, Analytical |
| Schema mismatch on per-chunk fields | Medium (parser is tolerant but page meta will go missing) | Minor |
| ID format collision (hyphenated vs dotted) | Low (normalization is straightforward) | Minor |
| Citation Verifier confused by v1's `canonical_status` field | Low | Minor (verifier ignores unknown fields) |
| Bucket cache TTL serves stale (1 hr `Cache-Control: public, max-age=3600`) | Already handled (server-side download bypasses CDN) | None |

---

## 10. Conclusion

**Primary is the bigger, broader corpus.** V1 is the curated reasoning aid with high-value tables and ~142 sections that primary lacks, especially in SBC-801 occupancy / egress / fire-service chapters.

**The right operation is augmentation, not replacement.** Either:

- Re-extract the 5 critical SBC-201 tables and the ~30 high-value SBC-801 sections directly into primary-schema files and upload to the bucket root (bucket-only, no code change).
- Or add a small Advisory-only adapter that reads v1 in addition to primary and feeds both into the Evidence Ledger (small code change, more flexible).

Both options are detailed in [docs/advisory/PRIMARY_RETRIEVAL_FIX_OPTIONS.md](docs/advisory/PRIMARY_RETRIEVAL_FIX_OPTIONS.md) (Task 4).

The primary path's biggest active issue is **not** that it lacks v1's content — it's that the SBC-801 page-range files for 601-1000 are nearly empty (Section 5 of the inventory). That gap is independent of v1 and is the highest-leverage primary fix.
