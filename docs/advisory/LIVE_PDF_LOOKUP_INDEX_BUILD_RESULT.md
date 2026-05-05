# Live PDF Lookup — Index Build Result

Date: 2026-05-05 (R10, Phase 1A Task 4)

---

## 1. Status

**Built and uploaded**: YES. Hash verified.

| Metric | Value |
|--------|------:|
| Local file | `generated/consultx_brain_full/pdf_lookup/pdf_source_lookup_index.json` |
| Local size | 183,197 bytes (~179 KB) |
| Local SHA256 | `c4cf0d7104e97519b65c2dcea14d159785ad56eeffa945e4822ba0c0a4eb6017` |
| Bucket target | `sbc_pdfs_private/index/pdf_source_lookup_index.json` |
| Upload HTTP | 200 OK |
| Re-download SHA256 | `c4cf0d7104e97519b65c2dcea14d159785ad56eeffa945e4822ba0c0a4eb6017` |
| Hash match | **YES ✅** |

---

## 2. Index entry counts

| Category | Count |
|----------|------:|
| Total entries | **555** |
| SBC-201 sections | 159 (full ledger coverage) |
| SBC-801 sections | 391 (full ledger coverage) |
| SBC-201 tables | 5 (the critical egress + occupancy tables) |
| SBC-801 tables | **0** (none exist as discrete records yet) |
| Confidence: exact | 1 (only one entry had explicit page in manifest) |
| Confidence: likely | 554 |
| Entries with `pdf_path: null` | 103 (mostly SBC-201 admin sections without chapter heuristic match) |

---

## 3. Why so few "exact" confidence entries

The source manifests (`sbc{201,801}_source_manifest.json`) **do not carry per-section page numbers** for the canonical entries themselves. Only one SBC-201 entry (Section 405 → "p. 252") has an explicit page reference. All other entries get `confidence: "likely"` and rely on:

- For SBC-201: `source_pages` field from the STUB manifest entries (when present).
- For SBC-801: chapter-number heuristic mapping to the most-likely PDF part (Chapter 1-5 → `pp_0001-0200`; Chapter 6-9 → `pp_0601-0800`; etc.).

This is a **deliberate V1 trade-off**. The runtime helper (Phase 1B) will:
1. Read the index entry, get the inferred PDF part.
2. Open that PDF, run text-search for the section marker.
3. If marker found → upgrade confidence to "exact" at runtime.
4. If not found → return "likely" and let the model caveat.

Phase 1B's text-search step is what converts most of these `likely` entries into `exact` answers per query.

---

## 4. Per-source breakdown

### SBC-201 (164 entries: 159 sections + 5 tables)

| Subset | Count |
|--------|------:|
| EXISTS_CANONICAL with body | 95 (assigned to PDF parts via chapter-heuristic; confidence "likely" pending runtime text-search) |
| STUB | 58 (have `source_pages` from STUB extraction → assigned to PDF parts) |
| QUARANTINED | 6 (frontmatter-only; PDF part inferred from chapter) |
| Tables (504.3, 504.4, 506.2, 1004.5, 1006.3.3) | 5 |

### SBC-801 (391 entries: 391 sections + 0 tables)

| Subset | Count |
|--------|------:|
| EXISTS_CANONICAL | 138 (chapter-heuristic to PDF part) |
| PRESENT_BUT_NOT_CANONICAL (stub) | 196 |
| QUARANTINED_UNVERIFIABLE | 57 |
| Tables | 0 (no tables in the manifest's tracked set) |

---

## 5. Source-method distribution

| Method | Count | Meaning |
|--------|------:|---------|
| `ledger` | ~95 | SBC-201 entry has page from manifest |
| `ledger_no_page` | ~64 | SBC-201 entry without page |
| `chapter_range_inferred` | ~391 | SBC-801 entry, page inferred from chapter heuristic |
| `manual_seed` | 5 | SBC-201 tables seeded from section_index |

Counts approximate — the 555 total breaks across these methods. The chapter-range-inferred is the dominant method (391 of 555 = ~70%), reflecting that SBC-801's manifest doesn't carry per-section pages.

---

## 6. PDF-part mapping table

The index document includes a top-level `pdf_parts` map for the runtime to resolve `(family, page) → bucket path`:

```json
{
  "SBC-201": [
    {"path": "SBC201/pp_0001-0250.pdf", "start": 1, "end": 250},
    {"path": "SBC201/pp_0251-0500.pdf", "start": 251, "end": 500},
    {"path": "SBC201/pp_0501-1000.pdf", "start": 501, "end": 1000},
    {"path": "SBC201/pp_1001-1250.pdf", "start": 1001, "end": 1250},
    {"path": "SBC201/pp_1251-1500.pdf", "start": 1251, "end": 1500},
    {"path": "SBC201/pp_1501-1750.pdf", "start": 1501, "end": 1750},
    {"path": "SBC201/pp_1751-2000.pdf", "start": 1751, "end": 2000},
    {"path": "SBC201/pp_2001-2200.pdf", "start": 2001, "end": 2200}
  ],
  "SBC-801": [
    {"path": "SBC801/pp_0001-0200.pdf", "start": 1, "end": 200},
    {"path": "SBC801/pp_0201-0400.pdf", "start": 201, "end": 400},
    {"path": "SBC801/pp_0401-0600.pdf", "start": 401, "end": 600},
    {"path": "SBC801/pp_0601-0800.pdf", "start": 601, "end": 800},
    {"path": "SBC801/pp_0801-1000.pdf", "start": 801, "end": 1000},
    {"path": "SBC801/pp_1001-1200.pdf", "start": 1001, "end": 1200},
    {"path": "SBC801/pp_1201-1400.pdf", "start": 1201, "end": 1400},
    {"path": "SBC801/pp_1401-1600.pdf", "start": 1401, "end": 1600},
    {"path": "SBC801/pp_1601-1800.pdf", "start": 1601, "end": 1800},
    {"path": "SBC801/pp_1801-2061.pdf", "start": 1801, "end": 2061}
  ]
}
```

---

## 7. Per-entry schema

Each of the 555 entries follows:

```json
{
  "code": "SBC201" | "SBC801",
  "ref_type": "section" | "table" | "figure",
  "ref": "<original ledger ref, e.g. '903.2.7' or '102'>",
  "normalized_ref": "<dot-form, e.g. '903.2.7'>",
  "pdf_path": "SBC801/pp_0801-1000.pdf" | null,
  "page_start": <int> | null,
  "page_end": <int> | null,
  "confidence": "exact" | "likely",
  "source_method": "ledger" | "ledger_no_page" | "chapter_range_inferred" | "manual_seed",
  "notes": "<canonical_status / body classification>"
}
```

---

## 8. Hash verification

Full upload + re-download + SHA256 compare flow:

```
local SHA256:  c4cf0d7104e97519b65c2dcea14d159785ad56eeffa945e4822ba0c0a4eb6017
remote SHA256: c4cf0d7104e97519b65c2dcea14d159785ad56eeffa945e4822ba0c0a4eb6017
match: YES ✅
size:  183197 bytes (matches local)
```

---

## 9. Known limitations (V1 index)

1. **Chapter-heuristic accuracy** — SBC-801 entries get a "best guess" PDF part based on chapter number ranges. The actual page where Section 6304.2.1.1 lives is in pp 1801-2061; the heuristic puts it at the right part. But sub-clause-level precision (which page WITHIN a 200-page part) is not in the index — the runtime text-search resolves it per query.

2. **No SBC-801 tables** — 0 entries for SBC-801 tables. None exist as discrete records anywhere. Table queries against SBC-801 will fall through to section-level retrieval at runtime.

3. **No figures** — `ref_type: "figure"` not populated for V1.

4. **Single-page assumption** — `page_start === page_end` for most entries. Multi-page section spans not tracked. Fine for V1 since the runtime extracts a single page at a time.

5. **No alias map** — typing `1004-5` (hyphen) at runtime requires the helper to normalize to `1004.5` (dot) before lookup. This is a runtime concern, not an index concern.

6. **Hyphenated round-2 IDs** — sections like `sbc-801-section-102-7-1` (round-2) appear in the v1 sidecar but are NOT in the manifest, so they're absent from this index. Phase 1B can either (a) add these by extending the build script to read round-2 metadata, or (b) accept that hyphenated round-2 IDs don't appear in the index and fall back to chapter heuristic.

7. **Generated_at timestamp** — embedded in the JSON. Re-running the build script produces a new timestamp, so file SHA256 will change even if input data hasn't. Acceptable for V1 (operator triggers rebuild manually); V2 may use deterministic output for cleaner diffs.

---

## 10. What this step did NOT do

- ❌ No code added to runtime — `_pdf_lookup.ts` is Phase 1B, not Phase 1A.
- ❌ No deploy.
- ❌ No DB write.
- ❌ No frontend change.
- ❌ No change to `source-pdfs`, `ssss`, or any other existing bucket.
- ❌ No change to existing `generated/...` files.

---

## 11. Next step

Proceed to Task 5 — privacy / access verification on the new bucket, including:
- Anonymous access denied (verified during Task 2 — re-confirm in Task 5).
- Service-role read works.
- No public URLs created.
- No signed URLs handed to users.
- The `source-pdfs` (older, public) bucket exposure flag carries forward to the final report.
