# Live PDF Lookup — Text Artifact Upload Result

Date: 2026-05-05 (R11, Phase 1B Task 3)

---

## 1. Status

**Uploaded**: 18 of 18 artifacts + 1 manifest. All hash-verified.

| Metric | Value |
|--------|------:|
| Artifacts uploaded | 18 / 18 ✅ |
| Manifest uploaded | 1 ✅ |
| Hash matches | 19 / 19 |
| Failed | 0 |
| Total bytes uploaded | 15,713,161 (~14.99 MB) |
| Bucket | `sbc_pdfs_private` (public=false from R10) |
| Path prefix | `sbc_pdfs_private/text_pages/` |

Per-file flow: PUT → re-GET → SHA256 compare → record. Identical pattern to R10 PDF uploads. **Zero hash mismatches** — no rollback triggered.

---

## 2. Per-artifact results

All 18 artifacts under `sbc_pdfs_private/text_pages/SBC{201,801}/pp_NNNN-NNNN.json`, plus the manifest at `sbc_pdfs_private/text_pages/text_pages_manifest.json`:

| Path | Bytes | Hash match |
|------|------:|:----------:|
| `text_pages/SBC201/pp_0001-0250.json` | 1,003,627 (1003.6 KB) | ✅ |
| `text_pages/SBC201/pp_0251-0500.json` | 1,059,531 (1034.7 KB) | ✅ |
| `text_pages/SBC201/pp_0501-1000.json` | 1,827,377 (1784.5 KB) | ✅ |
| `text_pages/SBC201/pp_1001-1250.json` | 967,374 (944.7 KB) | ✅ |
| `text_pages/SBC201/pp_1251-1500.json` | 665,580 (650.0 KB) | ✅ |
| `text_pages/SBC201/pp_1501-1750.json` | 879,031 (858.4 KB) | ✅ |
| `text_pages/SBC201/pp_1751-2000.json` | 893,447 (872.7 KB) | ✅ |
| `text_pages/SBC201/pp_2001-2200.json` | 539,213 (526.7 KB) | ✅ |
| `text_pages/SBC801/pp_0001-0200.json` | 945,488 (923.3 KB) | ✅ |
| `text_pages/SBC801/pp_0201-0400.json` | 753,565 (735.9 KB) | ✅ |
| `text_pages/SBC801/pp_0401-0600.json` | 887,180 (866.3 KB) | ✅ |
| `text_pages/SBC801/pp_0601-0800.json` | 855,373 (835.3 KB) | ✅ |
| `text_pages/SBC801/pp_0801-1000.json` | 447,720 (437.2 KB) | ✅ |
| `text_pages/SBC801/pp_1001-1200.json` | 796,468 (777.8 KB) | ✅ |
| `text_pages/SBC801/pp_1201-1400.json` | 688,597 (672.5 KB) | ✅ |
| `text_pages/SBC801/pp_1401-1600.json` | 758,962 (741.2 KB) | ✅ |
| `text_pages/SBC801/pp_1601-1800.json` | 852,853 (832.8 KB) | ✅ |
| `text_pages/SBC801/pp_1801-2061.json` | 867,775 (847.4 KB) | ✅ |
| `text_pages/text_pages_manifest.json` | ~5,500 | ✅ |

---

## 3. Privacy

The `sbc_pdfs_private` bucket remains `public=false` (verified in R10 Task 5). The artifacts inherit the bucket's RLS — anonymous reads are denied. Only service-role can read.

The Phase 1B runtime helper (Task 4) reads via service-role only. Frontend never touches these artifacts directly.

---

## 4. Total storage in private bucket after Phase 1B Task 3

| Section | Bytes |
|---------|------:|
| 18 PDFs at `SBC{201,801}/pp_*.pdf` | 240,265,268 (~229 MB) — from R10 |
| 18 text-page artifacts + manifest at `text_pages/` | ~15,720,000 (~15 MB) — from this task |
| Lookup index at `index/pdf_source_lookup_index.json` | 183,197 (~179 KB) — from R10 |
| **Total** | **~244 MB** |

Well within Supabase's 1 GB free-tier storage cap.

---

## 5. Rollback / delete commands

If a future operation needs to roll back Phase 1B Task 3:

```bash
# Operator runs with SUPABASE_SERVICE_ROLE_KEY in env
SUPABASE_URL="https://hrnltxmwoaphgejckutk.supabase.co"
PATHS=(
  text_pages/SBC201/pp_0001-0250.json text_pages/SBC201/pp_0251-0500.json
  text_pages/SBC201/pp_0501-1000.json text_pages/SBC201/pp_1001-1250.json
  text_pages/SBC201/pp_1251-1500.json text_pages/SBC201/pp_1501-1750.json
  text_pages/SBC201/pp_1751-2000.json text_pages/SBC201/pp_2001-2200.json
  text_pages/SBC801/pp_0001-0200.json text_pages/SBC801/pp_0201-0400.json
  text_pages/SBC801/pp_0401-0600.json text_pages/SBC801/pp_0601-0800.json
  text_pages/SBC801/pp_0801-1000.json text_pages/SBC801/pp_1001-1200.json
  text_pages/SBC801/pp_1201-1400.json text_pages/SBC801/pp_1401-1600.json
  text_pages/SBC801/pp_1601-1800.json text_pages/SBC801/pp_1801-2061.json
  text_pages/text_pages_manifest.json
)

for p in "${PATHS[@]}"; do
  curl -X DELETE \
    "$SUPABASE_URL/storage/v1/object/sbc_pdfs_private/$p" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
done
```

The local artifacts at `generated/consultx_brain_full/pdf_lookup/text_pages/` remain. Re-uploading is straightforward.

---

## 6. What this step did NOT do

- ❌ No code change.
- ❌ No deploy.
- ❌ No DB write (only storage metadata for new objects).
- ❌ No public URL created.
- ❌ No signed URL issued.
- ❌ No frontend impact.
- ❌ No change to `source-pdfs`, `ssss`, or any existing buckets.
- ❌ No PDF re-extraction (artifacts read from existing `D:/sbc_consultx/` PDFs locally; uploaded JSONs only).

---

## 7. Next step

Proceed to Task 4 — implement `lookupPdfSourceTextV1` inline in `supabase/functions/fire-safety-chat/index.ts`. Helper reads:
- `sbc_pdfs_private/index/pdf_source_lookup_index.json` (R10) → `(family, ref) → (pdf_part, page)` resolution.
- `sbc_pdfs_private/text_pages/<family>/<basename>.json` (this task) → page-level verbatim text.

Helper is gated on `ADVISORY_PDF_LOOKUP_ENABLED === "1"` env flag. Phase 1B initial deploy will leave it OFF.
