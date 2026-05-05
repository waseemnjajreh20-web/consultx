# Live PDF Lookup — Index Design

Date: 2026-05-05 (R9, Phase 0 design — no execution)
Companion: [docs/advisory/LIVE_PDF_LOOKUP_PDF_HOSTING_READINESS.md](docs/advisory/LIVE_PDF_LOOKUP_PDF_HOSTING_READINESS.md)

When a user asks about `Section 903.2.7 of SBC-801`, the runtime needs to resolve that reference to a specific PDF file and a specific page number within it — without scanning all 18 PDFs. This document specifies the **index** that does that resolution. **No index file is created in this round.**

---

## 1. Why an index is required

The naive alternative — open every PDF and search for "Section 903.2.7" — would:
- Download up to 230 MB per query.
- Take 30+ seconds.
- Hit Supabase storage egress quota repeatedly.

An index that maps `(family, ref_id) → (pdf_part, page_start, page_end)` reduces this to a single ~1 MB file lookup + a single targeted page extraction. Latency goes from 30 s to ~500 ms. Egress goes from 230 MB to ~5 MB per query.

---

## 2. What's already there

The repo already has 4 generated index files at `generated/consultx_brain_full/indexes/`:

| File | Contents | Use for Live PDF Lookup |
|------|----------|-------------------------|
| `section_index.json` | 357 sections (canonical-tracked only) with `id`, `source_code`, `chapter`, `section_ref` | Partial — covers only the 357 canonical-tracked sections. Misses gap sections that Live PDF Lookup is specifically designed to handle. |
| `section_aliases.json` | Synonym map (e.g. `1004.5` ↔ `Table 1004.5`) | Useful for normalizing user input |
| `page_map.json` | `(section_id) → page_range` for canonical sections | Partial — only canonical sections |
| `pdf_map.json` | `(page_range) → pdf_filename` | Useful but bound to current bucket-root naming convention |

**Gap**: none of the existing index files cover the 317 non-canonical ledger entries (the gap sections that Live PDF Lookup is designed to serve). Plus they don't cover SBC-201 tables or SBC-801 tables explicitly.

---

## 3. The new lookup index

### Name

`pdf_source_lookup_index.json` — single JSON document.

### Top-level shape

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-05-XXTHH:MM:SSZ",
  "sources": {
    "SBC-201": {
      "edition": "2024",
      "total_pages": 2200,
      "pdf_parts": [
        { "path": "SBC201/pp_0001-0250.pdf", "page_start": 1, "page_end": 250, "bytes": 33108986 },
        ...
      ]
    },
    "SBC-801": {
      "edition": "2024",
      "total_pages": 2061,
      "pdf_parts": [...]
    }
  },
  "entries": [
    {
      "code": "SBC-201",
      "ref_kind": "section",
      "ref_id": "1004.5",
      "title": "MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT",
      "pdf_part": "SBC201/pp_0501-1000.pdf",
      "page_start": 612,
      "page_end": 614,
      "page_in_part_start": 112,
      "page_in_part_end": 114,
      "confidence": 0.98,
      "source_method": "existing_ledger",
      "ledger_status": "EXISTS_CANONICAL",
      "extracted_at": "2026-05-XXTHH:MM:SSZ"
    },
    ...
  ]
}
```

### Per-entry fields

| Field | Type | Purpose |
|-------|------|---------|
| `code` | `"SBC-201" \| "SBC-801"` | Family identifier |
| `ref_kind` | `"section" \| "table" \| "figure"` | Discriminator. V1 launches with `section` and `table`; `figure` deferred to V2+ |
| `ref_id` | string | Canonical form: `"1004.5"`, `"903.2.7"`, `"904.13.4.1"` for sections; `"1004.5"`, `"506.2"` for tables |
| `title` | string \| null | Human-readable title from source |
| `pdf_part` | string | Bucket-relative path: `"SBC201/pp_0501-1000.pdf"` |
| `page_start` | int | 1-indexed global page in the book (e.g. SBC-201 page 612) |
| `page_end` | int | Last page of the section/table (often == start) |
| `page_in_part_start` | int | 1-indexed page within the PDF part file (e.g. PDF part covers pp 501-1000; section starts at part-page 112) |
| `page_in_part_end` | int | Last in-part page |
| `confidence` | float 0.0-1.0 | How certain the index is about this mapping (see Section 4) |
| `source_method` | enum | How this entry was generated (see Section 5) |
| `ledger_status` | string \| null | Mirrored from the source ledger when available |
| `extracted_at` | ISO datetime | Build time — for incremental refresh |

### Index size estimate

- ~550 ledger sections + ~50 SBC-201 tables + ~50 SBC-801 tables (estimate) = ~650 entries.
- Each entry is ~250 bytes JSON.
- Total: ~163 KB. Well under any reasonable size limit. Easily downloadable in a single network round-trip.

---

## 4. Confidence values

| Source method | Confidence range |
|---------------|------------------|
| TOC (table-of-contents) extraction with explicit page reference | 0.95–0.98 |
| Existing `page_map.json` from the prior canonical extraction | 0.90–0.95 |
| PDF text-search for a section/table marker (e.g. `Section 903.2.7`) with a single match | 0.85 |
| PDF text-search with multiple ambiguous matches | 0.65–0.75 |
| Manual SME entry | 0.99 |
| Inferred from chapter range only (no specific page found) | 0.50 |
| Fallback: section number + family known but no page found | 0.30 (still indexed for diagnostic) |

The runtime uses the confidence value from the index when emitting citations:
- `confidence ≥ 0.85`: cite normally with `conf:high`.
- `0.65 ≤ confidence < 0.85`: cite with `conf:medium`; ask for confirmation.
- `confidence < 0.65`: don't cite, ask clarifying question.

---

## 5. How each entry is generated (`source_method` enum)

| Method | When applied | Quality |
|--------|--------------|---------|
| `toc` | Section/table appears in the source PDF's table-of-contents page with an explicit page number reference. Most reliable; can be machine-extracted via TOC pages of the PDF. | Very high |
| `existing_ledger` | The entry is already in `generated/consultx_brain_full/indexes/page_map.json` from a prior canonical extraction. We re-use it. | High |
| `pdf_text_search` | Live PDF text-search for `Section X.Y.Z` or `Table X.Y` marker. Single-match wins. | Medium-high |
| `pdf_text_search_ambiguous` | Multi-match — keep all candidate pages, sort by frequency, pick the densest one as primary, others as `seekers`. | Medium |
| `manual_sme` | Operator entered the mapping by hand (rare). | Highest |
| `chapter_range_inferred` | Section chapter is known (e.g. `903.2.7` → Chapter 9 → SBC-801 pp 601-1000). The exact page is not known. Used only for the `Phase 1` first-day index where many entries still lack precise pages. | Low |

Phase 1 launches with a mix of `existing_ledger` (for canonical sections), `pdf_text_search` (for stub / quarantined sections), and `chapter_range_inferred` (for the 17–27 truly missing sections). Over time, manual SME work upgrades low-confidence entries.

---

## 6. Storage location

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Bucket: `sbc_pdfs_private/index/pdf_source_lookup_index.json`** | Live updates without redeploy; same bucket as the PDFs | Adds a network round-trip per cold-cache query; visible only to service-role | ✅ **Chosen** |
| Local file at `generated/.../indexes/pdf_source_lookup_index.json` | Zero network cost | Bundled into edge function deployment? Edge functions don't have a file system at runtime; would need to be `import`-ed as a TS data module. Larger deployment artifact. Updating index requires redeploy. | Rejected — coupling index updates to redeploys is too rigid |
| Public `ssss/` bucket | Faster CDN cache | Index reveals SBC structure to anonymous clients; slight info-leak | Rejected on principle (the index isn't secret, but defaulting to private aligns with the PDF-bucket choice) |
| Edge runtime KV / pgvector / sqlite | Persistent in-memory or DB-backed | New infrastructure surface; overkill for a 163 KB JSON | Rejected for V1 |

The chosen approach: **single `pdf_source_lookup_index.json` in `sbc_pdfs_private/index/` bucket prefix**. The runtime downloads it once per cold-cache event, parses, and uses the in-memory map for the lifetime of the instance. The 163 KB cost is paid once per Supabase Edge Function instance startup.

---

## 7. Updating the index

The index is regenerated by a Phase 1+ operator-side build script (does not exist yet — would be `scripts/build-pdf-source-lookup-index.cjs`).

Inputs:
- All 18 PDFs (read from local `D:/sbc_consultx/` or downloaded from `sbc_pdfs_private/SBC{201,801}/...`).
- Existing `generated/.../indexes/page_map.json` (re-used as starting point).
- Existing `data/.../manifests/sbc{201,801}_source_manifest.json` (for ledger_status mirror).
- Optional: SME manual overrides at `data/consultx_brain/full_corpus/manual_sme_overrides.json` (file does not exist yet; introduced when an SME first writes one).

Outputs:
- `generated/consultx_brain_full/indexes/pdf_source_lookup_index.json` (committed to git for transparency / diff review).
- Same file uploaded to `sbc_pdfs_private/index/pdf_source_lookup_index.json` (production read path).

The build script:
1. Loads the existing `page_map.json` as the seed.
2. For each ledger entry not in the seed, runs a `pdf_text_search` against the appropriate PDF part (already-known via the page-range mapping in `pdf_map.json`).
3. For each table the manifest tracks (5 SBC-201 tables + 0 SBC-801 tables today), creates a `table` entry.
4. For ledger entries where text search fails, creates `chapter_range_inferred` entries with `confidence: 0.5` so the runtime can still attempt a fuzzy match.
5. Validates: every entry has a non-empty `pdf_part` reference matching one of the 18 known parts.
6. Emits the JSON with stable key ordering (deterministic output for diffability).

Run cadence:
- Manual rebuild whenever the canonical extraction set changes (rare).
- Manual rebuild whenever an SME enters new manual overrides.
- Auto-rebuild on a Supabase scheduled task — NOT in V1; deferred to V2.

---

## 8. Lookup algorithm (runtime side)

Given input: `code, ref_kind, ref_id`:

1. **Cache check**: if instance has the index in memory and the in-memory map's `(code, ref_kind, ref_id)` key resolves, return the entry.
2. **Index download**: if not in cache, download `sbc_pdfs_private/index/pdf_source_lookup_index.json` via service-role storage client. Parse, build the in-memory map. Total cost: 163 KB transfer + ~5 ms JSON parse. Done once per instance start.
3. **Map lookup**: compute the key `${code}:${ref_kind}:${ref_id}`. If found, return the entry.
4. **Alias check**: if not found, normalize `ref_id` by trying common variants (`1004.5` ↔ `1004-5`; `903.2.7` ↔ `903-2-7`). If a variant matches, return that entry with a `aliased: true` flag.
5. **Chapter fallback**: if still not found, parse the section ref to extract the chapter (`903.2.7` → chapter `9`). Return a `chapter_range_inferred` placeholder with `confidence: 0.3` and a list of candidate `pdf_part`s the chapter could live in.
6. **Final**: if none of the above match, return `not_in_index`. The caller decides what to do — typically, append a RETRIEVAL NOTE and let the diagnostic protocol take over.

---

## 9. Index integrity invariants

The build script enforces:

| Invariant | Check |
|-----------|-------|
| `pdf_part` references match an existing bucket file | Every entry's `pdf_part` is in the `sources.{code}.pdf_parts[].path` list |
| `page_start <= page_end` | Numerical |
| `page_in_part_start <= page_in_part_end` | Numerical |
| `1 <= page_in_part_start ≤ pdf_part.page_count` | Bounded by part page count |
| `0.0 <= confidence <= 1.0` | Bounded |
| `ref_id` matches a known regex per `ref_kind` | `/^\d{3,4}(\.\d{1,3}){0,3}$/` for sections; same for tables |
| `code` is one of `SBC-201` / `SBC-801` | Enum |
| No duplicate `(code, ref_kind, ref_id)` keys | Set |

Failures abort the build script with `process.exit(2)` — same fail-closed pattern as the existing `build-consultx-brain-full.cjs`.

---

## 10. What the index does NOT contain

To keep the index small and the design narrow:

- ❌ Verbatim section text. The index points to where text lives; extraction happens at runtime.
- ❌ Table cell data. Tables are referenced by `(pdf_part, page)` only; cell-level structuring is V2+.
- ❌ Figure data or thumbnails. Figures are out-of-scope for V1.
- ❌ Cross-references between sections (e.g. "903.2 references 903.3"). The relations file at `relations_full.json` covers this; the index does not duplicate it.
- ❌ Confidence justification text. Just a number; the build script's logs explain how the number was reached.
- ❌ Multi-language alternates (Arabic title vs English title). The runtime extracts text in whatever language appears on the page.

---

## 11. Phase 1 first-cut index size and quality

Estimating from current data:

| Source method | Entries (estimate) | Confidence range |
|---------------|------------------:|------------------|
| `existing_ledger` (357 canonical-tracked sections) | 357 | 0.90 |
| `pdf_text_search` (~150 stub + quarantined sections) | 150 | 0.65–0.85 |
| `chapter_range_inferred` (~30 truly-missing sections) | 30 | 0.30–0.50 |
| Tables (5 SBC-201) | 5 | 0.90 |
| Tables (estimated 50 SBC-801 to be added later) | 0 (deferred to a manifest update) | n/a |
| **Total V1 entries** | **~542** | mixed |

The first-cut index probably won't have entries for the 50 SBC-801 tables (none exist as discrete records yet). Adding those is a separate work-stream parallel to V1 launch.

---

## 12. Decision summary

| Question | Answer |
|----------|--------|
| Index file name? | `pdf_source_lookup_index.json` |
| Index format? | Single JSON document, top-level array of entries plus a `sources` map |
| Index storage? | `sbc_pdfs_private/index/pdf_source_lookup_index.json` (private bucket, service-role read) |
| Per-entry size? | ~250 bytes |
| Total index size? | ~163 KB |
| Lookup latency? | One 163 KB download per cold cache, then in-memory map; ~5 ms warm |
| Build script? | New `scripts/build-pdf-source-lookup-index.cjs` (does not exist; Phase 1) |
| Update cadence? | Manual rebuild + commit + bucket re-upload when the source content changes |

**Phase 0 deliverable**: this design document. No index file is generated. No bucket write. No code change.

The build script (`scripts/build-pdf-source-lookup-index.cjs`) is part of Phase 1 — alongside the runtime helper and the integration wiring.
