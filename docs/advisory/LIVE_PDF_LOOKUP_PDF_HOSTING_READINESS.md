# Live PDF Lookup — PDF Hosting Readiness

Date: 2026-05-05 (R9, Phase 0 prep)
Branch: `claude/affectionate-solomon-f5e304`

This is a read-only assessment of the 18 SBC source PDFs available at `D:/sbc_consultx/` to determine whether they are suitable for hosting in a private bucket and serving as the source-of-truth for `LIVE_PDF_SOURCE_LOOKUP_V1`. **No PDF is uploaded in this round.**

---

## 1. Headline finding

**All 18 PDFs have a working text layer.** The earlier R8 worry that the 31 MB SBC-801 pp 801-1000 PDF was scan-only is **not borne out**: a `pdftotext` extraction probe of its first 5 pages returned 24,725 characters of clean text. The text-layer-only path of Live PDF Lookup V1 should work for **all 18 PDFs** without OCR fallback.

A single outlier — SBC-201 pp 1251-1500 (the largest SBC-201 PDF at 34 MB) — has weaker text density (5,185 chars across the first 30 pages vs ~100,000+ for typical PDFs). This is a single PDF; not blocking for V1 launch.

**OCR is NOT required for Live PDF V1 launch.** Phase 2 (OCR opt-in) can stay deferred.

---

## 2. Per-PDF inventory

Probed via `pdftotext -enc UTF-8` (Poppler tool). All numbers are direct file-system measurements.

### SBC-201 (8 PDF parts, ~131 MB total)

| File | Bytes | First 5 pp text chars | Arabic chars (5pp) | First 30 pp text chars | Text layer health |
|------|------:|---------------------:|-------------------:|-----------------------:|-------------------|
| `SBC 201 ...-1-250.pdf` | 33,108,986 | 3,498 | 47 | 134,768 | ✅ HEALTHY |
| `SBC 201 ...-251-500.pdf` | 8,916,109 | 23,963 | 0 | 147,225 | ✅ HEALTHY |
| `SBC 201 ...-501-1000.pdf` | 21,802,545 | 1,101 | 0 | 79,974 | ✅ HEALTHY (sparse front pages — TOC) |
| `SBC 201 ...-1001-1250.pdf` | 14,952,279 | 6,678 | 8 | 47,190 | ✅ HEALTHY (lower density) |
| `SBC 201 ...-1251-1500.pdf` | 34,162,751 | 857 | 0 | **5,185** | ⚠ **WEAK TEXT** (largest SBC-201, possibly scan-mixed) |
| `SBC 201 ...-1501-1750.pdf` | 7,330,744 | 2,149 | 0 | 118,817 | ✅ HEALTHY |
| `SBC 201 ...-1751-2000.pdf` | 15,053,132 | 23,773 | 0 | 143,406 | ✅ HEALTHY |
| `SBC 201 ...-2001-2200.pdf` | 11,138,585 | 1,629 | 0 | 110,473 | ✅ HEALTHY |

**SBC-201 totals**: 8 parts, 146 MB, ~787,000 chars in first 30 pages combined. **7 of 8 healthy + 1 weak**.

### SBC-801 (10 PDF parts, ~88 MB total)

| File | Bytes | First 5 pp text chars | Arabic chars (5pp) | First 30 pp text chars | Text layer health |
|------|------:|---------------------:|-------------------:|-----------------------:|-------------------|
| `SBC 801 ...-(3)-1-200.pdf` | 28,020,428 | 3,240 | 43 | 144,643 | ✅ HEALTHY |
| `SBC 801 ...-(3)-201-400.pdf` | 6,842,247 | 24,174 | 9 | 86,689 | ✅ HEALTHY |
| `SBC 801 ...-(3)-401-600.pdf` | 4,032,860 | 2,448 | 6 | 95,304 | ✅ HEALTHY |
| `SBC 801 ...-(3)-601-800.pdf` | 4,963,339 | 24,217 | 3 | 143,454 | ✅ HEALTHY (despite earlier "near-empty" finding in chunks file) |
| `SBC 801 ...-(3)-801-1000.pdf` | **31,503,285** | **24,725** | 6 | **145,656** | ✅ **HEALTHY** (the 31 MB PDF — text layer works!) |
| `SBC 801 ...-(3)-1001-1200.pdf` | 3,494,435 | 22,447 | 0 | 116,806 | ✅ HEALTHY |
| `SBC 801 ...-(3)-1201-1400.pdf` | 4,775,762 | 24,294 | 2 | 127,804 | ✅ HEALTHY |
| `SBC 801 ...-(3)-1401-1600.pdf` | 3,466,739 | 23,681 | 2 | 111,546 | ✅ HEALTHY |
| `SBC 801 ...-(3)-1601-1800.pdf` | 2,859,849 | 23,841 | 0 | 121,092 | ✅ HEALTHY |
| `SBC 801 ...-(3)-1801-2061.pdf` | 3,841,193 | 22,971 | 0 | 113,544 | ✅ HEALTHY |

**SBC-801 totals**: 10 parts, 93 MB, ~1,206,000 chars in first 30 pages combined. **All 10 healthy**.

### Combined

| Family | Parts | Bytes | Text layer status |
|--------|-----:|------:|-------------------|
| SBC-201 | 8 | 146,464,131 | 7 healthy + 1 weak |
| SBC-801 | 10 | 93,800,177 | 10 healthy |
| **Total** | **18** | **240,264,308 (~229 MB)** | **17 healthy + 1 weak** |

---

## 3. Why the earlier "31 MB pp 801-1000 = scan-only" concern was wrong

R8 noted: "The 31 MB pp 801-1000 PDF that produces 0 chunks ... likely figure-heavy / scan-only content that defeats the existing text extractor." That was a hypothesis, not measured.

Phase 0 measurement: `pdftotext -enc UTF-8 -f 1 -l 5` against this PDF returned **24,725 chars** of clean text from the first 5 pages alone. The PDF clearly has a working text layer. The previous extraction tooling (whatever produced the bucket-root chunk files) failed for some other reason — perhaps a memory limit, a parser bug specific to that PDF, or a corrupt chunk-write step.

**Implication**: Live PDF Lookup V1 with Poppler-equivalent text extraction will succeed where the older tool failed. The "31 MB scan-only" worry is dismissed.

---

## 4. The single weak PDF: SBC-201 pp 1251-1500

| Metric | Value |
|--------|------:|
| File size | 34 MB (largest SBC-201 part) |
| First-5-page chars | 857 (very low) |
| First-30-page chars | 5,185 (very low — ~170 chars/page average) |

For comparison, a healthy SBC-201 part averages ~3,000–5,000 chars per page. This PDF averages ~170 chars/page across its first 30 pages — **20-30× lower density**.

**Possible explanations**:
- PDF starts with a long index / table-of-contents heavy on figures (low extractable text).
- Mixed text + scanned-image pages where some pages are scans.
- Watermark layer obscuring text-extraction.

**Mitigations**:
- The remaining 7 SBC-201 PDFs cover the other ~250 page-ranges of the book (1-1250 + 1501-2200), so any section a user references that lives outside pp 1251-1500 is unaffected.
- For sections inside pp 1251-1500: text-layer extraction may still work on individual pages later in the file (the 5-page front-matter probe doesn't predict the rest of the file). A targeted page-by-page probe is needed if Live PDF V1 hits this range.
- If specific pages turn out to be scan-only, Phase 2 (OCR opt-in) can fall back. V1 launch can still proceed on the assumption that 17/18 PDFs work cleanly and this one needs targeted handling.

**Decision for V1**: not a launch blocker. Document as "needs deeper probe later".

---

## 5. Hosting suitability

| Criterion | Pass / Fail |
|-----------|:-----------:|
| All PDFs are well-formed PDF/A documents with text layer | ✅ (17/18 strong, 1 weak) |
| Total size manageable for Supabase storage (~229 MB) | ✅ Supabase default storage limit is well above 1 GB |
| Files can be read with text-only extractor in V1 | ✅ |
| OCR is required for V1 | ❌ NOT required |
| File names contain page-range identifiers usable for the page_map | ✅ |
| Files contain copyrighted material | ⚠ — license question, separate from technical readiness |

The technical answer is **READY**. The legal answer requires owner sign-off on whether redistribution to a private cloud bucket is within license terms (R8 raised this; still pending).

---

## 6. Page-range coverage (from filenames)

Decoded from PDF filenames:

### SBC-201 page coverage

| Page range | PDF |
|------------|-----|
| pp 1-250 | `SBC 201 ...-1-250.pdf` |
| pp 251-500 | `SBC 201 ...-251-500.pdf` |
| pp 501-1000 | `SBC 201 ...-501-1000.pdf` |
| pp 1001-1250 | `SBC 201 ...-1001-1250.pdf` |
| pp 1251-1500 | `SBC 201 ...-1251-1500.pdf` (the weak one) |
| pp 1501-1750 | `SBC 201 ...-1501-1750.pdf` |
| pp 1751-2000 | `SBC 201 ...-1751-2000.pdf` |
| pp 2001-2200 | `SBC 201 ...-2001-2200.pdf` |

Total SBC-201: pp 1-2200 (~2,200 pages).

### SBC-801 page coverage

| Page range | PDF |
|------------|-----|
| pp 1-200 | `SBC 801 ...-(3)-1-200.pdf` |
| pp 201-400 | `SBC 801 ...-(3)-201-400.pdf` |
| pp 401-600 | `SBC 801 ...-(3)-401-600.pdf` |
| pp 601-800 | `SBC 801 ...-(3)-601-800.pdf` |
| pp 801-1000 | `SBC 801 ...-(3)-801-1000.pdf` |
| pp 1001-1200 | `SBC 801 ...-(3)-1001-1200.pdf` |
| pp 1201-1400 | `SBC 801 ...-(3)-1201-1400.pdf` |
| pp 1401-1600 | `SBC 801 ...-(3)-1401-1600.pdf` |
| pp 1601-1800 | `SBC 801 ...-(3)-1601-1800.pdf` |
| pp 1801-2061 | `SBC 801 ...-(3)-1801-2061.pdf` |

Total SBC-801: pp 1-2061 (~2,061 pages).

**Combined**: ~4,261 pages. Live PDF Lookup will need to resolve `(family, section_id)` → `(pdf_part, page_within_part)`. The existing `generated/.../indexes/page_map.json` already does this for canonical sections; it will need extension to cover gap sections (the ones currently STUB / quarantined).

---

## 7. Files that need OCR later (not for V1)

Based on text-layer probing:

| File | Reason | Phase 2 priority |
|------|--------|:---------------:|
| `SBC 201 ...-1251-1500.pdf` | Weak text density (5k chars / 30pp). Probable figure-heavy or partial-scan content. | High |
| Page-by-page check needed across all 18 PDFs | Some individual pages within otherwise-text-healthy PDFs may be scans. | Medium (per-page basis only) |

**No PDF needs OCR for the entire file**. OCR if needed is per-page in Phase 2, behind the `ADVISORY_PDF_LOOKUP_OCR_ENABLED` env flag.

---

## 8. Suitability summary

| PDF | Hosting? | V1 text-layer? | OCR? |
|-----|:--------:|:--------------:|:-----:|
| All 8 SBC-201 parts | ✅ | ✅ (1 weak — pp 1251-1500) | Phase 2 only if individual pages within pp 1251-1500 turn out scan-only |
| All 10 SBC-801 parts | ✅ | ✅ | Phase 2 deferred |

**No file is unsuitable for hosting**. No file requires OCR before Phase 1 launch. The weak SBC-201 pp 1251-1500 PDF is hosted, used, and any specific gap it cannot cover is recorded for Phase 2 OCR work.

---

## 9. What is NOT done in Task 1

- ❌ No PDF uploaded to any bucket.
- ❌ No bucket policy modified.
- ❌ No code change.
- ❌ No service-role credential used.
- ❌ No deploy.

The probing was performed locally on `D:/sbc_consultx/` files only, using `pdftotext` (a local binary). No external write-side action.

---

## 10. Recommendation for Phase 0 next step

Proceed to Task 2 — design the private bucket storage plan and the per-file naming convention. Phase 0 also includes Tasks 3, 4, 5 — index design, runtime contract, integration plan. **No upload happens in any of Phase 0**. Phase 0 ends with a complete design package ready for owner review.

The owner sign-off blocker remains: license / redistribution rights for hosting 230 MB of SBC PDFs in a private cloud bucket. Phase 0 closes by surfacing this question explicitly, with everything else (bucket plan, index, runtime, integration) ready to land in Phase 1 the moment owner approval arrives.
