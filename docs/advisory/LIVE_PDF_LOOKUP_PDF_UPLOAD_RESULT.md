# Live PDF Lookup — PDF Upload Result

Date: 2026-05-05 (R10, Phase 1A Task 3)

---

## 1. Status

**Uploaded**: 18 of 18 PDFs. **Hash-verified**: 18 of 18.

| Metric | Value |
|--------|------:|
| Files attempted | 18 |
| Successful upload + hash match | **18** ✅ |
| Failed | 0 |
| Total bytes uploaded | 240,265,268 (229.1 MB) |
| Bucket | `sbc_pdfs_private` (public=false) |
| Per-file flow | PUT → re-GET → SHA256 compare → record |

Every PDF was:
1. Uploaded via PUT with `x-upsert: true` and `Content-Type: application/pdf`.
2. Re-downloaded via GET (with cache-bypass query param + `Cache-Control: no-cache`).
3. SHA256 computed on the downloaded buffer.
4. Compared against the local SHA256 from precheck.
5. Result: **all 18 hashes match exactly**.

---

## 2. Per-file results

All 18 uploads landed under `sbc_pdfs_private/<family>/pp_NNNN-NNNN.pdf`:

| Target path | Local size | Remote size | Local SHA256 | Remote SHA256 | Hash match |
|-------------|----------:|------------:|--------------|---------------|:----------:|
| SBC201/pp_0001-0250.pdf | 33,108,986 | 33,108,986 | 8c7e9737… | 8c7e9737… | ✅ |
| SBC201/pp_0251-0500.pdf | 8,916,109 | 8,916,109 | b39677bd… | b39677bd… | ✅ |
| SBC201/pp_0501-1000.pdf | 21,802,545 | 21,802,545 | 0b1aab3a… | 0b1aab3a… | ✅ |
| SBC201/pp_1001-1250.pdf | 14,952,279 | 14,952,279 | 9d7a8890… | 9d7a8890… | ✅ |
| SBC201/pp_1251-1500.pdf | 34,162,751 | 34,162,751 | a5e571f1… | a5e571f1… | ✅ |
| SBC201/pp_1501-1750.pdf | 7,330,744 | 7,330,744 | 8c38c417… | 8c38c417… | ✅ |
| SBC201/pp_1751-2000.pdf | 15,053,132 | 15,053,132 | 5b5e9227… | 5b5e9227… | ✅ |
| SBC201/pp_2001-2200.pdf | 11,138,585 | 11,138,585 | 642e5663… | 642e5663… | ✅ |
| SBC801/pp_0001-0200.pdf | 28,020,428 | 28,020,428 | 75bd5c55… | 75bd5c55… | ✅ |
| SBC801/pp_0201-0400.pdf | 6,842,247 | 6,842,247 | 637212f7… | 637212f7… | ✅ |
| SBC801/pp_0401-0600.pdf | 4,032,860 | 4,032,860 | 6332e245… | 6332e245… | ✅ |
| SBC801/pp_0601-0800.pdf | 4,963,339 | 4,963,339 | 75703068… | 75703068… | ✅ |
| SBC801/pp_0801-1000.pdf | 31,503,285 | 31,503,285 | 0480a515… | 0480a515… | ✅ |
| SBC801/pp_1001-1200.pdf | 3,494,435 | 3,494,435 | ef17f645… | ef17f645… | ✅ |
| SBC801/pp_1201-1400.pdf | 4,775,762 | 4,775,762 | fc4f7e45… | fc4f7e45… | ✅ |
| SBC801/pp_1401-1600.pdf | 3,466,739 | 3,466,739 | abb3d9fe… | abb3d9fe… | ✅ |
| SBC801/pp_1601-1800.pdf | 2,859,849 | 2,859,849 | 0a495b3e… | 0a495b3e… | ✅ |
| SBC801/pp_1801-2061.pdf | 3,841,193 | 3,841,193 | 61e1f46a… | 61e1f46a… | ✅ |

(Hashes truncated. Full results recorded at `.tmp_phase1a/upload_results.json`.)

---

## 3. Failure handling

The upload script was designed to abort on the first hash mismatch and delete the offending file. **Zero mismatches occurred**, so no rollback was triggered.

If a future re-run encounters a mismatch:
1. The script logs `HASH MISMATCH local=<8> remote=<8>` and continues to the next file.
2. The `--exit 2` at the end ensures non-zero exit if any file failed.
3. Operator can re-run the upload script with the same filenames; PUT with `x-upsert: true` is idempotent.

---

## 4. Rollback / delete commands

If at any point the upload needs to be undone (per Phase 1A Task 3 requirement):

```bash
# Operator runs with SUPABASE_SERVICE_ROLE_KEY in env
SUPABASE_URL="https://hrnltxmwoaphgejckutk.supabase.co"
PATHS=(
  SBC201/pp_0001-0250.pdf SBC201/pp_0251-0500.pdf SBC201/pp_0501-1000.pdf
  SBC201/pp_1001-1250.pdf SBC201/pp_1251-1500.pdf SBC201/pp_1501-1750.pdf
  SBC201/pp_1751-2000.pdf SBC201/pp_2001-2200.pdf
  SBC801/pp_0001-0200.pdf SBC801/pp_0201-0400.pdf SBC801/pp_0401-0600.pdf
  SBC801/pp_0601-0800.pdf SBC801/pp_0801-1000.pdf SBC801/pp_1001-1200.pdf
  SBC801/pp_1201-1400.pdf SBC801/pp_1401-1600.pdf SBC801/pp_1601-1800.pdf
  SBC801/pp_1801-2061.pdf
)

for p in "${PATHS[@]}"; do
  curl -X DELETE \
    "$SUPABASE_URL/storage/v1/object/sbc_pdfs_private/$p" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
done

# Optionally also delete the empty bucket
# curl -X DELETE "$SUPABASE_URL/storage/v1/bucket/sbc_pdfs_private" \
#   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
#   -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

The local PDFs at `D:/sbc_consultx/` remain untouched. Re-uploading from local is straightforward.

---

## 5. Production effect

| Aspect | Before R10 Task 3 | After R10 Task 3 |
|--------|-------------------|-------------------|
| `sbc_pdfs_private/SBC201/pp_*.pdf` | (did not exist) | 8 PDFs, ~140 MB |
| `sbc_pdfs_private/SBC801/pp_*.pdf` | (did not exist) | 10 PDFs, ~89 MB |
| Public access | n/a | denied (verified Task 2) |
| Runtime consumer | none | none — Phase 1B will wire helper |
| `source-pdfs` bucket (existing public) | unchanged | **unchanged** |
| `ssss` bucket (runtime corpus) | unchanged | **unchanged** |
| Edge functions | unchanged | **unchanged** |
| Frontend | unchanged | **unchanged** |
| DB schema | unchanged | **unchanged** |

The bucket now contains the source-of-truth PDFs that the Phase 1B runtime helper will read. **No runtime feature is yet using them.**

---

## 6. Cost note

229 MB of additional storage on the project's Supabase storage. Usage stays under the free-tier 1 GB cap. Egress will be charged per Phase 1B helper call later, but those calls will be narrow (only on gap queries) and bounded.

---

## 7. What this step did NOT do

- ❌ No code change.
- ❌ No deploy.
- ❌ No DB write (other than the `storage.objects` rows the upload implicitly creates).
- ❌ No change to `source-pdfs`, `ssss`, or any other bucket.
- ❌ No change to the lookup index (Task 4 below).
- ❌ No public URL generated.
- ❌ No signed URL generated for any user.
- ❌ No frontend impact.

---

## 8. Next step

Proceed to Task 4 — build `pdf_source_lookup_index.json` from existing ledgers + PDF text-search, and upload it to `sbc_pdfs_private/index/`.
