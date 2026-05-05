# Bucket Backup Before Refresh — 2026-05-05 (R5)

Branch: `claude/affectionate-solomon-f5e304`
Timestamp (UTC): `20260505_151759`

---

## 1. Backup location

```
.tmp_bucket_backup/brain_full_v1_R5_20260505_151759/
  ├─ SBC201_canonical_chunks.json   (2,805,184 bytes)
  ├─ SBC801_canonical_chunks.json   (7,932,092 bytes)
  └─ _metadata.txt                  (timestamp + dir info)
```

The backup directory is outside the working tree's tracked content and is excluded from any future commit (the leading `.tmp_` prefix is gitignored by convention).

## 2. Current production hashes (the bytes I just downloaded)

| File | Bytes | SHA256 | Chunks |
|------|------:|--------|------:|
| `ssss/brain_full_v1/SBC201_canonical_chunks.json` | 2,805,184 | `0ab7d3195d9140e0d91f9908660fb62695d6f853825c539f16809378d511f917` | 95 |
| `ssss/brain_full_v1/SBC801_canonical_chunks.json` | 7,932,092 | `1982dc4932df7a1289607f886e5feadd80c26d6a7dc50b9545584c8f37567988` | 137 |

**Total production chunks: 232/550 = 42.2%** — matches the R4 baseline exactly.

## 3. Rollback command / steps

If the upload in Task 3 fails or produces corrupt content, restore the production state by re-uploading these backup files to the same paths.

Pseudocode (operator runs from a shell with `SUPABASE_SERVICE_ROLE_KEY` set in env):

```bash
BACKUP=".tmp_bucket_backup/brain_full_v1_R5_20260505_151759"
for FILE in SBC201_canonical_chunks.json SBC801_canonical_chunks.json; do
  curl -X PUT \
    "https://hrnltxmwoaphgejckutk.supabase.co/storage/v1/object/ssss/brain_full_v1/$FILE" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "x-upsert: true" \
    --data-binary "@$BACKUP/$FILE"
done
```

After the rollback runs, re-fetch the bucket files via the public-read endpoint and verify SHA256 matches Section 2 above. If the CDN cache (`Cache-Control: public, max-age=3600`) has not yet expired, the rolled-back content may take up to 1 hour to be visible publicly.

## 4. Backup validity

| Check | Result |
|-------|--------|
| Both files downloaded (HTTP 200) | ✅ |
| Bytes match prior R4 record (2,805,184 / 7,932,092) | ✅ |
| SHA256 matches prior R4 record | ✅ |
| chunk_count parses cleanly as JSON | ✅ |
| Total chunks (232) matches R4 baseline | ✅ |
| Backup is distinct from local R3-gated corpus | ✅ (different sha256, different chunk_count) |

**Backup is valid.** Proceed with Task 3 (upload) only after this point.

## 5. Notes

- An older R4 backup directory exists at `.tmp_bucket_backup/brain_full_v1_20260505_141306/` from R4. It contains the same bytes (production state has not changed between R4 and R5). This R5 backup is a fresh copy with a new timestamp; either backup is operationally valid for rollback.
- The retention policy for backups is operator-controlled. Recommended: keep until the post-upload state has been live for at least 24 hours and verified stable.
