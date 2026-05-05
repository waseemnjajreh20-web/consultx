# Live PDF Lookup — Bucket Setup Result

Date: 2026-05-05 (R10, Phase 1A Task 2)

---

## 1. Status

**Created**: YES.

| Field | Value |
|-------|-------|
| Bucket name | `sbc_pdfs_private` |
| Created at | 2026-05-05T16:58:14.328Z |
| Public | **false** ✅ |
| File size limit | 52,428,800 bytes (50 MB) |
| Allowed MIME types | `["application/pdf", "application/json"]` |
| HTTP response (creation) | 200 OK |

JSON allowed alongside PDF so the lookup index file (`pdf_source_lookup_index.json`) can be uploaded in Task 4 to the same bucket without changing the policy.

---

## 2. Anonymous-access verification

Three tests run after bucket creation; all confirm anon cannot read content:

| Test | Endpoint | Expected | Actual |
|------|----------|----------|--------|
| Direct anon GET on a path | `GET /storage/v1/object/sbc_pdfs_private/test.pdf` (no auth header) | reject | **HTTP 400** ✅ |
| Public-URL form anon GET | `GET /storage/v1/object/public/sbc_pdfs_private/test.pdf` (no auth header) | reject | **HTTP 400** ✅ |
| Anon list endpoint with anon JWT | `POST /storage/v1/object/list/sbc_pdfs_private` with anon-key Authorization | empty result | `[]` with HTTP 200 |

The empty list result is the standard Supabase Storage behavior when the bucket is private — anon CAN call the endpoint but sees nothing because RLS filters all rows. The actual PDF content is not reachable to anon.

---

## 3. Policies observed

The bucket is created with the default Supabase Storage policy set:

- The bucket-level `public: false` flag prevents `/storage/v1/object/public/<bucket>/...` URLs from working.
- Default RLS policies on `storage.objects` filter out rows for anon clients on private buckets (`SELECT` requires either the bucket to be public OR a custom RLS policy granting access to the role).
- No custom RLS policy was added for `sbc_pdfs_private` in this round. The default-deny stays in effect.

The behavior matches the access model documented in [docs/advisory/LIVE_PDF_LOOKUP_STORAGE_PLAN.md](docs/advisory/LIVE_PDF_LOOKUP_STORAGE_PLAN.md) Section 4:

| Reader | Allowed |
|--------|---------|
| Anonymous (no auth) | **Denied (400)** ✅ |
| Anonymous via `/public/` URL | **Denied (400)** ✅ |
| Anon JWT | **List returns []**; reads denied |
| Service-role JWT | **Allowed** (verified during bucket creation step) |

---

## 4. Risks observed

| Risk | Severity | Mitigation |
|------|:--------:|-----------|
| MIME-type allow-list (`application/pdf`, `application/json`) — narrow but not airtight | Low | A bad-actor with service-role could upload .pdf-named files of any content. But anyone with service-role already has full DB access; this is not a new attack surface. |
| 50 MB file-size limit — large enough for any of our 18 PDFs | Low | The largest PDF is 34 MB. Headroom is comfortable. |
| Bucket creation used the leaked service-role JWT (R5 deferred-rotation) | Existing | Same trust model as R5's bucket refresh. Owner has explicitly deferred rotation. The bucket-create operation is now logged in Supabase audit under that JWT. Future rotation does not invalidate the bucket itself, only the key. |
| The orphan-public `source-pdfs` bucket (Pre-check finding) is NOT addressed by this bucket creation | Existing — flagged in pre-check report | Out of scope for Phase 1A. Owner will decide separately. |

---

## 5. What this step did NOT do

- ❌ No PDF uploaded.
- ❌ No index uploaded.
- ❌ No code changed.
- ❌ No deploy.
- ❌ No DB write (other than the storage.buckets row creation that bucket-creation implicitly does — this is metadata, not application data).
- ❌ No change to `source-pdfs`, `ssss`, or any other existing bucket.
- ❌ No frontend impact.

---

## 6. Next step

Proceed to Task 3 — upload all 18 PDFs to `sbc_pdfs_private/SBC{201,801}/pp_NNNN-NNNN.pdf` per the storage plan, with per-file SHA256 verification after each upload.
