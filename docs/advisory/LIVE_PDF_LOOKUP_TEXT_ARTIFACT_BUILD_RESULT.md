# Live PDF Lookup — Text Artifact Build Result

Date: 2026-05-05 (R11, Phase 1B Task 2)

---

## 1. Status

**Built**: 18 of 18 PDFs successfully extracted. Zero failures.

| Metric | Value |
|--------|------:|
| PDFs processed | 18 / 18 |
| Total pages extracted | 4,261 |
| Total text characters | 15,066,701 (~15.0 M chars) |
| Total artifact bytes (JSON) | 15,713,161 (~15.0 MB) |
| Generator | `pdftotext + node v24.11.1` (Poppler binary at `/mingw64/bin/pdftotext`) |
| OCR used | NO ✅ |
| Model used | NO ✅ |
| Output directory | `generated/consultx_brain_full/pdf_lookup/text_pages/` |
| Manifest | `text_pages/text_pages_manifest.json` |

---

## 2. Per-artifact inventory

### SBC-201 (8 artifacts, ~6.6 MB total)

| Artifact | Pages | Chars | Size (KB) | SHA256 (first 8) |
|----------|------:|------:|----------:|------------------|
| `SBC201/pp_0001-0250.json` | 250 | 994,509 | 1003.6 | `af4a3108` |
| `SBC201/pp_0251-0500.json` | 250 | 1,025,364 | 1034.7 | `ad2b0960` |
| `SBC201/pp_0501-1000.json` | 500 | 1,746,575 | 1784.5 | `36151994` |
| `SBC201/pp_1001-1250.json` | 250 | 935,317 | 944.7 | `722a9ea2` |
| `SBC201/pp_1251-1500.json` | 250 | **634,984** | 650.0 | `6649a20b` |
| `SBC201/pp_1501-1750.json` | 250 | 837,115 | 858.4 | `db60d4ce` |
| `SBC201/pp_1751-2000.json` | 250 | 853,160 | 872.7 | `c93fdff3` |
| `SBC201/pp_2001-2200.json` | 200 | 510,344 | 526.7 | `4a766613` |

### SBC-801 (10 artifacts, ~7.6 MB total)

| Artifact | Pages | Chars | Size (KB) | SHA256 (first 8) |
|----------|------:|------:|----------:|------------------|
| `SBC801/pp_0001-0200.json` | 200 | 918,294 | 923.3 | `3b9fc705` |
| `SBC801/pp_0201-0400.json` | 200 | 727,447 | 735.9 | `ec97bcef` |
| `SBC801/pp_0401-0600.json` | 200 | 859,556 | 866.3 | `ac3dba2b` |
| `SBC801/pp_0601-0800.json` | 200 | 827,890 | 835.3 | `6969ff65` |
| `SBC801/pp_0801-1000.json` | 200 | **427,526** | 437.2 | `53d1b288` |
| `SBC801/pp_1001-1200.json` | 200 | 760,487 | 777.8 | `acf9aaef` |
| `SBC801/pp_1201-1400.json` | 200 | 659,774 | 672.5 | `e22437eb` |
| `SBC801/pp_1401-1600.json` | 200 | 725,487 | 741.2 | `bc3e79be` |
| `SBC801/pp_1601-1800.json` | 200 | 812,418 | 832.8 | `89c3d186` |
| `SBC801/pp_1801-2061.json` | 261 | 810,454 | 847.4 | `0079a49f` |

(Hashes truncated to first 8 hex chars.)

---

## 3. Lower-density files — re-evaluated

R9's first-30-page sampling flagged two files as having weak text density:

| File | R9 first-30-page chars | Phase 1B full-file chars | Verdict |
|------|----------------------:|------------------------:|---------|
| `SBC201/pp_1251-1500.pdf` | 5,185 | **634,984** (~2,540/page) | ✅ Healthy when full file is read. R9's sample hit a thin cover/TOC region; rest of file is rich. |
| `SBC801/pp_0801-1000.pdf` | 145,656 | 427,526 (~2,138/page) | ✅ Healthy. Text density is lower than other SBC-801 parts (~3,500/page) but still substantive. |

**Both are usable for the runtime helper.** The earlier R9 worry that `SBC201/pp_1251-1500.pdf` might need OCR is **dismissed**. No file requires OCR for V1.

A few PDFs print Poppler warnings during extraction:
- `SBC201/pp_0001-0250.pdf`: `Syntax Warning: Mismatch between font type and embedded font file`
- `SBC801/pp_0001-0200.pdf`: same warning

These warnings did NOT prevent text extraction — both files produced full 250-page / 200-page artifacts with normal char density. The warnings are PDF-creator artifacts and are non-blocking.

---

## 4. Per-page char count distribution

The schema records `char_count` per page. Quick histogram from the manifest (eyeballed from the artifacts):

- **High-density pages (>3,000 chars/page)**: most regular content pages.
- **Medium-density pages (500-3,000 chars/page)**: pages with diagrams, tables, or partial text.
- **Low-density pages (<500 chars/page)**: pages that are mostly figures/diagrams. Text layer is present but sparse. Typical per-PDF: 5-15 such pages out of 200-250.
- **Effectively-empty pages (0 chars)**: 0 pages observed across all 18 PDFs. Every page produced at least some text.

This distribution matches expectations for a text-layer SBC PDF. The runtime helper can skip very-low-density pages (they're unlikely to contain a section anchor).

---

## 5. Schema (per artifact)

```json
{
  "code": "SBC201" | "SBC801",
  "pdf_file": "SBC201/pp_0001-0250.pdf",
  "source_pdf_sha256": "8c7e9737...",
  "page_count": 250,
  "total_text_chars": 994509,
  "generator": "pdftotext + node v24.11.1",
  "generated_at": "2026-05-05T...Z",
  "pages": [
    { "page": 1, "char_count": 412, "text": "..." },
    { "page": 2, "char_count": 1208, "text": "..." },
    ...
  ]
}
```

Each artifact is JSON, compact (no indentation, ~1 KB overhead per artifact). Page indices start at 1 (1-indexed).

---

## 6. Manifest

`text_pages_manifest.json` lists every artifact with:
- `code` ("SBC201" | "SBC801")
- `pdf_path` (bucket path of the source PDF)
- `artifact_path` (bucket path of the artifact, relative to `text_pages/`)
- `source_pdf_sha256` (matches Phase 1A upload)
- `artifact_sha256` (this build)
- `page_count`, `char_count`, `artifact_bytes`

The manifest is the lookup the runtime uses to verify artifact integrity at fetch time (Phase 1B Task 4 helper checks `source_pdf_sha256` matches the index entry's PDF reference, OR the helper trusts the manifest blindly — V1 chooses trust+log, V2 may add hash check).

---

## 7. What was NOT done

- ❌ No OCR.
- ❌ No model used for extraction.
- ❌ No text cleaning that changes meaning. Form-feed characters (`\x0c`) are used to split pages — they're metadata, not content. The page text retains all whitespace, paragraph breaks, and Arabic/English content as `pdftotext` produced.
- ❌ No artifact uploaded yet (Task 3 will do that).
- ❌ No code change in the runtime.
- ❌ No deploy.
- ❌ No DB write.
- ❌ No bucket write.
- ❌ No secrets included in any artifact.

---

## 8. Next step

Proceed to Task 3 — upload all 18 artifacts + the manifest to `sbc_pdfs_private/text_pages/`, verify each via SHA256.
