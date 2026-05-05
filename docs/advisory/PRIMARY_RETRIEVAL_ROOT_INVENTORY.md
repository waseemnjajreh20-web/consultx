# Primary Retrieval Root — Inventory

Date: 2026-05-05 (R7, read-only)
Branch: `claude/affectionate-solomon-f5e304`

The "primary retrieval path" is the corpus that `fetchSBCContext` ([supabase/functions/fire-safety-chat/index.ts:1997-2300](supabase/functions/fire-safety-chat/index.ts:1997)) lists, downloads, scores, and selects. It feeds the Evidence Ledger and is what the Citation Verifier ultimately enforces. Whatever sits in `ssss/brain_full_v1/` is reasoning aid only; the user-visible citations come from this root corpus.

---

## 1. Headline numbers

| Metric | Value |
|--------|------:|
| Files at bucket root matching `chunk` filter | **21** |
| Total bytes | 18,382,411 (~17.6 MB) |
| Total chunks across all 21 files | **4,096** |
| Files that pass parser as healthy | 18 |
| Files near-empty (1–4 chunks) | 1 |
| Files empty placeholder | 1 |
| Files using "primary" schema | 18 |
| Files using `ch9_v1` schema (text/section/source/...) | 2 |
| Files using `ch10_v2` schema (chunk_id/text/has_table/...) | 1 |
| Files containing `requires_review:true` | **0** |

**Important schema note**: 4,096 is the count of *chunk objects in these files*, not "distinct sections". Each section produces multiple chunks (typically 5–10 paragraph-sized chunks per section). The user-visible "section coverage" is much lower than 4,096 — see Section 4 below.

---

## 2. Per-file inventory

| # | Filename (deduplicated) | Family | Page range | Schema | Chunks | Distinct sections | Health |
|--:|-------------------------|--------|------------|--------|------:|------------------:|--------|
| 1 | `SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json` | SBC-201 | pp 1-250 | primary | 287 | 69 | HEALTHY |
| 2 | `SBC 201 - The Saudi General Building Code-251-500_extracted_chunks.json` | SBC-201 | pp 251-500 | primary | 312 | 56 | HEALTHY |
| 3 | `SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json` | SBC-201 | pp 501-1000 | primary | 536 | 58 | HEALTHY |
| 4 | `SBC 201 - The Saudi General Building Code-1001-1250_extracted_chunks.json` | SBC-201 | pp 1001-1250 | primary | 282 | 45 | HEALTHY |
| 5 | `SBC 201 - The Saudi General Building Code-1251-1500_extracted_chunks.json` | SBC-201 | pp 1251-1500 | primary | 196 | 36 | HEALTHY |
| 6 | `SBC 201 - The Saudi General Building Code-1501-1750_extracted_chunks.json` | SBC-201 | pp 1501-1750 | primary | 270 | 58 | HEALTHY |
| 7 | `SBC 201 - The Saudi General Building Code-1751-2000_extracted_chunks.json` | SBC-201 | pp 1751-2000 | primary | 282 | 59 | HEALTHY |
| 8 | `SBC 201 - The Saudi General Building Code-2001-2200_extracted_chunks.json` | SBC-201 | pp 2001-2200 | primary | 190 | 35 | HEALTHY |
| 9 | `SBC 801 - The Saudi Fire Protection Code (3)-1-200_extracted_chunks.json` | SBC-801 | pp 1-200 | primary | 242 | 49 | HEALTHY |
| 10 | `SBC 801 - The Saudi Fire Protection Code (3)-201-400_extracted_chunks.json` | SBC-801 | pp 201-400 | primary | 211 | 48 | HEALTHY |
| 11 | `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` | SBC-801 | pp 401-600 | primary | 60 | 15 | HEALTHY |
| 12 | `SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json` | SBC-801 | **pp 601-800** | primary | **3** | 1 | **NEAR_EMPTY** |
| 13 | `SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted_chunks.json` | SBC-801 | **pp 801-1000** | unknown (no chunks) | **0** | 0 | **EMPTY_PLACEHOLDER** |
| 14 | `SBC 801 - The Saudi Fire Protection Code (3)-1001-1200_extracted_chunks.json` | SBC-801 | pp 1001-1200 | primary | 199 | 42 | HEALTHY |
| 15 | `SBC 801 - The Saudi Fire Protection Code (3)-1201-1400_extracted_chunks.json` | SBC-801 | pp 1201-1400 | primary | 210 | 61 | HEALTHY |
| 16 | `SBC 801 - The Saudi Fire Protection Code (3)-1401-1600_extracted_chunks.json` | SBC-801 | pp 1401-1600 | primary | 231 | 67 | HEALTHY |
| 17 | `SBC 801 - The Saudi Fire Protection Code (3)-1601-1800_extracted_chunks.json` | SBC-801 | pp 1601-1800 | primary | 247 | 35 | HEALTHY |
| 18 | `SBC 801 - The Saudi Fire Protection Code (3)-1801-2061_extracted_chunks.json` | SBC-801 | pp 1801-2061 | primary | 280 | 55 | HEALTHY |
| 19 | `SBC801_Ch9_v1_chunks.json` | SBC-801 | Chapter 9 (sprinkler) | ch9_v1 | 20 | 20 | HEALTHY (special) |
| 20 | `SBC801_Ch10_v2_chunks.json` | SBC-801 | Chapter 10 (egress) | ch10_v2 | 30 | 0¹ | HEALTHY (special) |
| 21 | `SBC801_Ch11_v2_chunks.json` | SBC-801 | Chapter 11 (hazmat) | ch9_v1 | 8 | 6 | HEALTHY (special) |

¹ Ch10_v2 chunks store the section in the `text` content (e.g. `# Section 1004 — Occupant Load`) rather than in a structured field, so the section-counting heuristic returns 0 for distinct-sections. The chunks are not actually empty.

---

## 3. Three distinct schemas in primary corpus

The bucket root mixes three different chunk shapes. The runtime parser at [supabase/functions/fire-safety-chat/index.ts:1853-1898](supabase/functions/fire-safety-chat/index.ts:1853) is **schema-tolerant** — it accepts any of these shapes and falls back to JSON.stringify if needed. So the heterogeneity is not blocking, but it does affect citation precision.

### 3.1 `primary` schema (18 files, 4,038 chunks)

```json
{
  "code_id": "SBC-201", "title": "...", "version": "...",
  "total_chunks": 287,
  "chunks": [{
    "chunk_id": "...",
    "code_id": "SBC-201",
    "content": "...",
    "content_type": "...",
    "chapter_id": "...", "chapter_number": "...", "chapter_title": "...",
    "section_id": "...", "section_number": "...", "section_title": "...",
    "subsection_id": "...", "subsection_number": "...", "subsection_title": "...",
    "page_start": 1, "page_end": 5,
    "token_count": 412,
    "has_table": false, "has_commentary": true,
    "references": [...]
  }, ...]
}
```

This is the dominant shape. Both `chunk_id` and `section_id` are present. Pages are explicit. The parser uses `chunk.content` for scoring and pulls `chunk.page_start` / `chunk.page_end` for the source meta panel.

### 3.2 `ch9_v1` schema (2 files: SBC801_Ch9_v1_chunks.json + SBC801_Ch11_v2_chunks.json — 28 chunks total)

```json
[{
  "text": "# Section 902\n\n## 📋 نص الكود الحرفي / Canonical Code Text\n...",
  "section": "902",
  "source": "...",
  "chapter": 9,
  "partial": false,
  "confidence": "high"
}, ...]
```

Note that despite the name `Ch11_v2`, file 21 also uses this `ch9_v1` shape — the version suffix in the filename is misleading.

### 3.3 `ch10_v2` schema (1 file: SBC801_Ch10_v2_chunks.json — 30 chunks)

```json
{
  "version": "v2", "code": "SBC-801", "chapter": 10,
  "edition": "...", "generated_at": "...", "chunk_count": 30,
  "v1_chunks": [...], "new_chunks": [...]
}
```

Top-level has `v1_chunks` and `new_chunks` arrays (not the standard `chunks`). The parser's first-check `parsed.chunks` will fail; the second check `parsed.sections` will also fail; the parser falls through to the `else` branch which serializes the entire JSON to a single chunk for scoring. This is **a likely retrieval defect** — Ch10 (egress) content is being scored as a single 600KB blob rather than 30 individual section-aligned chunks, which will affect the relevance ranking against egress queries.

---

## 4. Section coverage (the user-visible metric)

Counting distinct sections via `chunk.section_number || chunk.section_id || chunk.section`:

| Family | Distinct sections in primary corpus | Notes |
|--------|------------------------------------:|-------|
| SBC-201 | ~416 (sum, with overlap across page ranges) | Page-range files overlap on chapter boundaries; deduplication needed for true count. |
| SBC-801 (primary schema, 10 files) | ~478 (sum) | Same caveat. The SBC801_Ch9_v1 + Ch10_v2 + Ch11_v2 files add another ~50 distinct sections in non-primary schemas. |
| SBC-201 → ledger (`159` total) | likely well covered | Only Chapter 9 has a known `1` STUB section per the prior gap inventory. |
| SBC-801 → ledger (`391` total) | **partially covered** | The 600-1000 page range is effectively missing (Section 4.4–5 below). |

The exact "X sections of 550 are present" number is not computable from page-range files alone without dedup logic. A precise count requires unifying every chunk's `section_number` field across all 18 primary files (then tracking presence vs the ledger's section list). That is a one-shot Node script, not done here.

---

## 5. Coverage gap — SBC-801 pages 601–1000

These two files are the **single biggest health issue** in the primary corpus:

| File | Bytes | Chunks | Distinct sections | Verdict |
|------|------:|------:|------------------:|---------|
| `SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json` | 12,245 | 3 | 1 | NEAR_EMPTY |
| `SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted_chunks.json` | 200 | 0 | 0 | EMPTY_PLACEHOLDER |

The 200-byte file is the file-size of a JSON envelope `{"code_id":"...","total_chunks":0,"chunks":[]}` — i.e. an explicit empty placeholder uploaded as a stand-in.

What pages 601–1000 actually contain in the source PDFs (`D:/sbc_consultx/SBC 801 ...-{601-800,801-1000}.pdf`): typically Chapter 7-9 of SBC-801 — fire & smoke protection features, interior finishes, and the most-cited fire-protection chapter (Chapter 9: sprinkler systems Section 903.x and fire alarm Section 907.x). Critically, Chapter 9 is **the most-frequently-cited chapter in Advisory queries** (Group M sprinkler/alarm thresholds).

**Mitigation**: the bucket also has `SBC801_Ch9_v1_chunks.json` (20 chunks, 20 distinct sections) and `SBC801_Ch10_v2_chunks.json` (30 chunks). These special files cover the gap to some degree — they likely exist *because* the page-range extraction failed on this exact range. So the system has a redundant Ch9/Ch10 chunk source. But:

- The `Ch10_v2` file is in a non-standard schema that the parser falls through on (Section 3.3), serializing the whole 600KB JSON as one mega-chunk. This degrades retrieval precision.
- The `Ch9_v1` file is in the alternate `ch9_v1` schema. It parses fine (the parser's chunk loop reads `chunk.text`), but each chunk has only `section`, no `page_start`/`page_end`. So the source-meta panel cannot show page numbers for these.

So the effective state is: **SBC-801 Chapter 9 IS reachable via the redundant special files**, but the retrieval and source-panel quality on Chapter 9 queries is lower than for chapters served by the standard page-range files.

---

## 6. Stale / superseded analysis

A file is **superseded** if a later/better source for the same content exists. From inspection:

| File | Status | Notes |
|------|--------|------|
| All 18 `primary` schema page-range files | **Healthy primary** | These are the authoritative primary corpus. Not superseded. |
| `SBC801_Ch9_v1_chunks.json` | **Redundant primary** — same content also indirectly via the (currently mostly-empty) page-range files 601-800 / 801-1000 | If those page-range files are ever filled in, this Ch9 file becomes redundant; but today it is the *only* working source for Chapter 9. |
| `SBC801_Ch10_v2_chunks.json` | **Superseded primary, falsely-parsed** | Per Section 3.3 the parser doesn't read its `v1_chunks`/`new_chunks` correctly. It IS read as a giant mega-chunk because the parser falls back to `JSON.stringify(parsed)`. Egress retrieval on this file is low-precision. |
| `SBC801_Ch11_v2_chunks.json` | **Healthy redundant primary** for Chapter 11 (hazmat). Tiny (8 chunks). | Note: filename says `_v2` but contents follow the `ch9_v1` schema. |

None of the 21 files is "duplicate" in the strict sense (same content uploaded twice). But Ch9 / Ch10 / Ch11 are *partial overlaps* with the page-range files for the same content — their relationship is "fallback / specialty" rather than "duplicate".

**`brain_full_v1/` is NOT in the same retrieval lane as these 21 files.** A separate audit ([docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md](docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md)) confirmed that `fetchSBCContext` lists the bucket root only; `loadBrainFullV1Sidecars` separately reads `brain_full_v1/`. So the v1 sidecar is reasoning aid in parallel, not a primary alternative.

---

## 7. Citation visibility check

The Citation Verifier matches against citations the model emits in the form `[SBC-201 Section X.Y.Z | conf:high]`. To pass the verifier, the model must use a section number that the Evidence Ledger contains. The ledger is built from the chunks selected by the primary path.

For section `X.Y.Z` to be supported by a citation:
1. Some chunk in the selected subset must have `section_number = "X.Y.Z"` (or `section_id`, or `section_ref`, or contain text like "Section X.Y.Z" — the verifier scans `chunk.content` text too).
2. That chunk must score > 0 for the user's keywords.
3. The chunk must fit in the 50,000-char `MAX_TOTAL_CONTEXT` budget.

Bottom-line citation visibility:

- **Chapters 1-7 of SBC-201** — well covered (8 page-range files, 18 chunks per page on average).
- **Chapters 1-6 of SBC-801** (pp 1-600) — well covered.
- **Chapters 7-9 of SBC-801** (pp 601-1000) — covered indirectly via the special Ch9_v1 file. Chapter 8-9 page numbers (`page_start` / `page_end`) **will not appear** in the source-meta panel for these citations because the schema doesn't carry them.
- **Chapter 10 of SBC-801** (egress) — degraded retrieval precision because of the parser fall-through on Ch10_v2 schema.
- **Chapters 11-onwards** — covered by the page-range files plus the small Ch11 file.

---

## 8. Health summary

| Health bucket | Files | Total chunks |
|---------------|------:|-------------:|
| HEALTHY (primary or special schema, parsed correctly, > 5 chunks) | 19 | 4,093 |
| HEALTHY but parser falls back (Ch10_v2 schema) | 1 | 30 |
| NEAR_EMPTY (3 chunks) | 1 | 3 |
| EMPTY_PLACEHOLDER (0 chunks) | 1 | 0 |
| POLICY_VIOLATION (`requires_review:true` content) | **0** | 0 |
| **Total** | **21** | **4,096** (parser sees fewer due to Ch10 mega-chunking — closer to ~4,066 effective chunks) |

---

## 9. Conclusions for the next steps

1. The primary corpus is **far larger than the v1 sidecar**: 4,096 chunks vs 358. Switching primary retrieval to read v1 would *reduce* corpus size, not expand it. So OPTION B in Task 4 needs careful sizing.

2. The two genuinely-bad files are SBC-801 pp 601-800 (3 chunks) and pp 801-1000 (0 chunks). Re-extracting these from the source PDFs is the highest-leverage fix.

3. The Ch10_v2 mega-chunk parsing fallback is a latent retrieval-quality issue. A small parser tweak in `extractAndScoreChunks` (or re-saving Ch10_v2 in the standard schema) would resolve it without code change beyond a one-line schema-aware branch.

4. **No `requires_review:true` content** is in the primary corpus today — clean. The R3 policy gate's purpose was to keep the v1 sidecar clean of those sections; the primary path was never affected by them.

5. The schema heterogeneity is workable (parser is tolerant) but means citation precision varies by file. Q-by-Q live smoke (Task 1 of the prior R6 continuation plan) is needed to confirm whether the heterogeneity actually shows up in citation quality issues for end users.

This inventory is the input for Tasks 2-4 of R7. Task 2 will compare this primary corpus against the v1 sidecar; Task 3 will assess the v3 orphan; Task 4 will compare three fix options against this baseline.
