# Live PDF Lookup — Storage Plan

Date: 2026-05-05 (R9, Phase 0 design — no execution)
Companion: [docs/advisory/LIVE_PDF_LOOKUP_PDF_HOSTING_READINESS.md](docs/advisory/LIVE_PDF_LOOKUP_PDF_HOSTING_READINESS.md)

This document specifies where the 18 source PDFs will live in production and how the Advisory edge function will reach them. **No upload, no bucket policy change, no commit-side write happens in this round.** Phase 0 produces a plan; Phase 1 executes it after owner approval.

---

## 1. Bucket choice

### Option A — Reuse the existing `ssss` bucket with a private prefix

The current `ssss` bucket is configured as **publicly readable** (verified during R5 — anonymous downloads of `brain_full_v1/SBC*_canonical_chunks.json` returned HTTP 200 without auth). Anything placed under `ssss/...` is reachable by any client that knows the path.

If we use `ssss/private_pdfs/`:
- The data inherits the bucket-level public-read policy.
- A path-based RLS rule on `storage.objects` would be needed to deny anon reads under `private_pdfs/`. Such a rule is technically possible but is not currently in the project, and adding it counts as a DB schema change (RLS policy modification).
- **Verdict: not recommended**. Mixing public and private content in one bucket creates a subtle, hard-to-audit RLS surface.

### Option B — Create a NEW private bucket

A new bucket explicitly created with `public: false` is the standard Supabase pattern for private content. Clients can read only via service-role JWT or via signed URLs that the edge function generates.

**Recommended bucket name**: `sbc_pdfs_private`

Why this name:
- Mirrors the `ssss` short alias for the existing public bucket — easy to grep across the codebase.
- The `_private` suffix is self-documenting; any reviewer who sees the name immediately knows the bucket is access-controlled.
- Matches Supabase's documented naming conventions (lowercase + underscores, no spaces).

**Verdict: chosen approach**.

### Option C — Use Supabase Edge Function memory (don't host externally)

Bundle each PDF into the edge function's deployment artifact. **Rejected**: 229 MB of PDFs + the existing function's 5,800-line bundle far exceeds Supabase Edge Function's deployment size limit (which is in the low single-digit MB range). This is structurally infeasible.

---

## 2. Bucket configuration (proposed for Phase 1)

| Setting | Value | Rationale |
|---------|-------|-----------|
| Bucket name | `sbc_pdfs_private` | See above |
| Public | `false` | Default-deny; only service-role and signed URLs can read |
| File size limit | 50 MB | Largest source PDF (34 MB SBC-201 pp 1251-1500) plus headroom |
| Allowed MIME types | `application/pdf` | Bucket rejects non-PDF uploads |
| File-name pattern | `SBC{201,801}/...pdf` | Two top-level folders, one per code family |

The bucket-creation JSON (Supabase API):
```json
{
  "name": "sbc_pdfs_private",
  "public": false,
  "file_size_limit": 52428800,
  "allowed_mime_types": ["application/pdf"]
}
```

---

## 3. File naming convention

All 18 PDFs follow a single naming pattern:

```
sbc_pdfs_private/
├── SBC201/
│   ├── pp_0001-0250.pdf      ← was "SBC 201 - The Saudi General Building Code-1-250.pdf"
│   ├── pp_0251-0500.pdf
│   ├── pp_0501-1000.pdf
│   ├── pp_1001-1250.pdf
│   ├── pp_1251-1500.pdf      ← weak text-layer; flagged in hosting readiness doc
│   ├── pp_1501-1750.pdf
│   ├── pp_1751-2000.pdf
│   └── pp_2001-2200.pdf
└── SBC801/
    ├── pp_0001-0200.pdf
    ├── pp_0201-0400.pdf
    ├── pp_0401-0600.pdf
    ├── pp_0601-0800.pdf
    ├── pp_0801-1000.pdf      ← 31 MB; text layer works (per readiness doc)
    ├── pp_1001-1200.pdf
    ├── pp_1201-1400.pdf
    ├── pp_1401-1600.pdf
    ├── pp_1601-1800.pdf
    └── pp_1801-2061.pdf
```

Why 4-digit zero-padding: `pp_0501-1000.pdf` sorts correctly in any directory listing alongside `pp_0251-0500.pdf` (without padding, `pp_501-1000` would sort after `pp_2001-2200`).

The `(3)` suffix in the original SBC-801 filenames is dropped — it appears to be the Saudi Building Code 2024 edition number, not part of the path semantics. The edition is recorded in the manifest, not the filename.

---

## 4. Access model

| Reader | Mechanism | Allowed |
|--------|-----------|---------|
| Anonymous (browser visitor) | Direct GET to `https://<project>.supabase.co/storage/v1/object/sbc_pdfs_private/...` | **Denied (403)** |
| Anonymous via public URL | `/storage/v1/object/public/sbc_pdfs_private/...` | **Denied (404)** — bucket is `public: false`, no public URLs exist |
| Anonymous with signed URL | URL signed by service-role, valid for 60 seconds | **Allowed during the 60s window** |
| Authenticated user (any user JWT) | Direct GET | **Denied** — requires service role |
| Edge function (using service-role) | `supabase.storage.from("sbc_pdfs_private").download(...)` | **Allowed** |
| Operator with service-role JWT | Direct GET | **Allowed** |

**The Advisory edge function uses service role internally** (verified at [supabase/functions/fire-safety-chat/index.ts:2012-2020](supabase/functions/fire-safety-chat/index.ts:2012)). It will read PDFs directly via the storage client; no signed URLs needed.

The frontend / public clients NEVER access these PDFs directly. The runtime extracts text and returns excerpts as JSON; the original PDF stays server-side.

---

## 5. Service role only

`SUPABASE_SERVICE_ROLE_KEY` (the same key the function already uses for the `ssss` bucket and other admin reads) will read from `sbc_pdfs_private`. **No new secret is introduced**.

The leaked-and-deferred-rotation status of that JWT (R5 closeout) still applies. When the owner eventually rotates, the new key replaces the old one across all consumers including this new bucket. No new rotation step is added by the Live PDF Lookup work.

---

## 6. Public access — explicitly denied

To make the deny explicit:

1. The bucket is created with `public: false` (Section 2).
2. No `objects/select` RLS policy is added that would allow anon reads.
3. No signed URL helper is exposed to the frontend.
4. The runtime never returns the source PDF bytes to the user — only verbatim text excerpts as JSON.
5. A test (Phase 1) confirms an anon `GET /storage/v1/object/sbc_pdfs_private/SBC201/pp_0001-0250.pdf` returns 403.

This is the same access model as the existing `enterprise-case-documents` bucket ([supabase/migrations/20260426000008_enterprise_case_documents_storage.sql](supabase/migrations/20260426000008_enterprise_case_documents_storage.sql)) — which the project already operates correctly. The pattern is proven.

---

## 7. Backup / rollback plan

### Backup (operator-side, before any upload)

The 18 PDFs already exist on the operator's local D:/ drive at `D:/sbc_consultx/*.pdf`. That **is** the backup. No additional backup step is needed.

A SHA256 manifest of the local files should be recorded before upload:

```
node -e '
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const dir = "D:/sbc_consultx";
const lines = [];
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".pdf")) continue;
  const p = path.join(dir, f);
  const sha = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const size = fs.statSync(p).size;
  lines.push(sha + "  " + size + "  " + f);
}
fs.writeFileSync("docs/advisory/LIVE_PDF_LOOKUP_HASHES.txt", lines.join("\n") + "\n");
'
```

(Not run in this round. Recorded as a Phase 1 prerequisite step.)

### Rollback

If a Phase 1 upload causes any issue:

1. Delete every uploaded object from `sbc_pdfs_private`. Service-role-driven; can be batch-deleted via the Supabase Dashboard's storage UI or via curl + service-role.
2. (Optional) Delete the bucket itself — `DELETE /storage/v1/bucket/sbc_pdfs_private`. This requires service-role.
3. The local D:/sbc_consultx/ source remains untouched. Re-uploading from scratch is straightforward.

The runtime (Phase 1 edge function changes) is reverted via `git revert` + redeploy. The runtime change is independent of the bucket; rolling back one without the other is safe.

---

## 8. Estimated storage size

| Family | Files | Bytes | MB |
|--------|------:|------:|---:|
| SBC-201 | 8 | 146,464,131 | ~140 |
| SBC-801 | 10 | 93,800,177 | ~89 |
| **Total** | **18** | **240,264,308** | **~229 MB** |

Supabase free-tier storage limit is 1 GB. The 229 MB upload uses ~23% of that limit. Paid tiers offer much more. Headroom is comfortable.

---

## 9. Upload command — DRAFT (do not execute)

For Phase 1 reference:

```bash
# Operator runs this with SUPABASE_SERVICE_ROLE_KEY in env.
# Pre-condition: bucket sbc_pdfs_private already created via Supabase dashboard or REST POST.

set -euo pipefail
SUPABASE_URL="https://hrnltxmwoaphgejckutk.supabase.co"
LOCAL="D:/sbc_consultx"

declare -A MAP=(
  ["SBC 201 - The Saudi General Building Code-1-250.pdf"]="SBC201/pp_0001-0250.pdf"
  ["SBC 201 - The Saudi General Building Code-251-500.pdf"]="SBC201/pp_0251-0500.pdf"
  ["SBC 201 - The Saudi General Building Code-501-1000.pdf"]="SBC201/pp_0501-1000.pdf"
  ["SBC 201 - The Saudi General Building Code-1001-1250.pdf"]="SBC201/pp_1001-1250.pdf"
  ["SBC 201 - The Saudi General Building Code-1251-1500.pdf"]="SBC201/pp_1251-1500.pdf"
  ["SBC 201 - The Saudi General Building Code-1501-1750.pdf"]="SBC201/pp_1501-1750.pdf"
  ["SBC 201 - The Saudi General Building Code-1751-2000.pdf"]="SBC201/pp_1751-2000.pdf"
  ["SBC 201 - The Saudi General Building Code-2001-2200.pdf"]="SBC201/pp_2001-2200.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-1-200.pdf"]="SBC801/pp_0001-0200.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-201-400.pdf"]="SBC801/pp_0201-0400.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-401-600.pdf"]="SBC801/pp_0401-0600.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-601-800.pdf"]="SBC801/pp_0601-0800.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-801-1000.pdf"]="SBC801/pp_0801-1000.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-1001-1200.pdf"]="SBC801/pp_1001-1200.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-1201-1400.pdf"]="SBC801/pp_1201-1400.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-1401-1600.pdf"]="SBC801/pp_1401-1600.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-1601-1800.pdf"]="SBC801/pp_1601-1800.pdf"
  ["SBC 801 - The Saudi Fire Protection Code (3)-1801-2061.pdf"]="SBC801/pp_1801-2061.pdf"
)

for src in "${!MAP[@]}"; do
  dst="${MAP[$src]}"
  echo "Uploading: $src -> $dst"
  curl -X POST \
    "$SUPABASE_URL/storage/v1/object/sbc_pdfs_private/$dst" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/pdf" \
    --data-binary "@$LOCAL/$src"
done
```

(Bucket creation can also be done from the Supabase dashboard manually — possibly safer than the API for first-time setup.)

**This script is documented for reference. It is NOT executed in this round.**

---

## 10. Delete / cleanup command — DRAFT

For Phase 1 rollback:

```bash
set -euo pipefail
SUPABASE_URL="https://hrnltxmwoaphgejckutk.supabase.co"
PATHS=(
  "SBC201/pp_0001-0250.pdf" "SBC201/pp_0251-0500.pdf" "SBC201/pp_0501-1000.pdf"
  "SBC201/pp_1001-1250.pdf" "SBC201/pp_1251-1500.pdf" "SBC201/pp_1501-1750.pdf"
  "SBC201/pp_1751-2000.pdf" "SBC201/pp_2001-2200.pdf"
  "SBC801/pp_0001-0200.pdf" "SBC801/pp_0201-0400.pdf" "SBC801/pp_0401-0600.pdf"
  "SBC801/pp_0601-0800.pdf" "SBC801/pp_0801-1000.pdf" "SBC801/pp_1001-1200.pdf"
  "SBC801/pp_1201-1400.pdf" "SBC801/pp_1401-1600.pdf" "SBC801/pp_1601-1800.pdf"
  "SBC801/pp_1801-2061.pdf"
)

for p in "${PATHS[@]}"; do
  echo "Deleting: $p"
  curl -X DELETE \
    "$SUPABASE_URL/storage/v1/object/sbc_pdfs_private/$p" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
done

# Optional: delete the bucket itself
# curl -X DELETE "$SUPABASE_URL/storage/v1/bucket/sbc_pdfs_private" \
#   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
#   -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

**This script is documented for reference. It is NOT executed in this round.**

---

## 11. What is NOT done

- ❌ No bucket created.
- ❌ No PDF uploaded.
- ❌ No code change.
- ❌ No deploy.
- ❌ No service-role used.
- ❌ No commit-side write that touches storage.

This task only documents the plan. Phase 0 closes with the entire design package (this + Tasks 3, 4, 5) ready for owner review.

---

## 12. Phase 1 prerequisite checklist

For the operator to execute Phase 1:

- [ ] Owner has confirmed license / redistribution rights for hosting 230 MB of SBC PDFs in a private cloud bucket.
- [ ] Operator has shell access with `SUPABASE_SERVICE_ROLE_KEY` in env (currently the leaked-deferred-rotation key is reachable; rotation can come later).
- [ ] Bucket `sbc_pdfs_private` is created (manually via Supabase Dashboard or via the bucket-creation API).
- [ ] SHA256 manifest of the 18 local PDFs is computed and stored at `docs/advisory/LIVE_PDF_LOOKUP_HASHES.txt`.
- [ ] Anonymous-deny test prepared: a curl that should return 403 on the new bucket from any client lacking service-role.

If all five items above are checked, Phase 1 upload is safe to run. The upload itself takes ~2-5 minutes for 229 MB on a typical connection.
