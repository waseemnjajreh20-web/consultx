# Live PDF Lookup — Privacy Verification

Date: 2026-05-05 (R10, Phase 1A Task 5)

---

## 1. Test matrix

8 access tests run against the post-upload `sbc_pdfs_private` bucket:

| # | Test | Endpoint / Auth | Expected | Actual | Pass |
|---|------|-----------------|----------|--------|:----:|
| A | Anon PDF read, no auth header at all | `GET /storage/v1/object/sbc_pdfs_private/SBC201/pp_0001-0250.pdf` | 4xx, content denied | **HTTP 400, 76 bytes (error JSON)** | ✅ |
| B | Anon PDF read, anon-JWT Authorization | Same URL with `Authorization: Bearer <anon>` and `apikey: <anon>` | 4xx, content denied | **HTTP 400, 69 bytes** | ✅ |
| C | Public URL form, no auth | `GET /storage/v1/object/public/sbc_pdfs_private/SBC201/pp_0001-0250.pdf` | 4xx (public form rejected because bucket isn't public) | **HTTP 400, 76 bytes** | ✅ |
| D | Anon read of index file | `GET /storage/v1/object/sbc_pdfs_private/index/pdf_source_lookup_index.json` | 4xx | **HTTP 400, 76 bytes** | ✅ |
| E | Service-role read of PDF (positive) | Same URL with service-role JWT | 200 + ~33 MB | **HTTP 200, 33,108,986 bytes** | ✅ |
| F | Service-role read of index (positive) | Same URL for index with service-role JWT | 200 + 183 KB | **HTTP 200, 183,197 bytes** | ✅ |
| G | Bucket info | `GET /storage/v1/bucket/sbc_pdfs_private` with service-role | `public: false` | **`public: false` ✅** | ✅ |
| H | Anon list of bucket | `POST /storage/v1/object/list/sbc_pdfs_private` with anon JWT | empty result | **`[]` HTTP 200** | ✅ |

**All 8 tests pass.** The bucket is correctly private; service-role can read; anonymous clients cannot.

---

## 2. What anon CAN see

Test H confirms anon clients can call the LIST endpoint on the private bucket — but the response is an empty array. The bucket NAME exists (it would be in any global bucket-listing endpoint anon could reach, but the project doesn't expose one), and the LIST endpoint is reachable, but the contents are filtered out by the default Supabase Storage RLS policy on private buckets.

**Anon cannot enumerate filenames** within `sbc_pdfs_private`. **Anon cannot download any PDF content.** **Anon cannot download the index file.**

This is the expected behavior for `public: false` Supabase Storage. Same model as `enterprise-case-documents` and `ConsultX _file`.

---

## 3. Public access status

| Vector | Status |
|--------|:------:|
| Direct anonymous GET on a PDF | **Denied (HTTP 400)** ✅ |
| `/public/` URL form on PDF | **Denied (HTTP 400)** ✅ |
| Anonymous LIST | Returns empty `[]` (filtered by RLS) ✅ |
| Anonymous discovery via the global bucket list | Not exposed by Supabase by default; project hasn't added a custom endpoint |
| Signed URLs minted for users | **NONE created in Phase 1A** ✅ |
| Public URLs constructed in code | **NONE — no code change in Phase 1A** ✅ |
| Bucket flag `public` | `false` ✅ |
| Service-role reads | Allowed (verified positive) ✅ |

---

## 4. Risk findings

| # | Risk | Status |
|---|------|--------|
| 1 | The new `sbc_pdfs_private` bucket exposes PDFs anonymously | **NOT a risk** — verified denied via 4 tests |
| 2 | The new bucket exposes the index anonymously | **NOT a risk** — verified denied |
| 3 | Service-role read works correctly | **CONFIRMED** — Phase 1B helper will be able to read |
| 4 | The pre-existing `source-pdfs` bucket is publicly readable and contains the SAME 18 PDFs | **YES — flagged in Pre-check report** |
| 5 | Phase 1A introduced any new exposure | **NO** — Phase 1A did not modify `source-pdfs` |
| 6 | Service-role JWT used for upload was the leaked key from R5 | Existing — owner has explicitly deferred rotation per R5 closeout |
| 7 | Anon LIST endpoint on private bucket is callable | Standard Supabase behavior; result is empty due to RLS — not a leak |

The single material privacy issue across the full project storage is **risk #4** — the pre-existing `source-pdfs` public bucket contains all 18 SBC PDFs and is anonymously downloadable today. **This issue exists separate from Phase 1A** and was discovered during the pre-check, not caused by this round.

---

## 5. The pre-existing `source-pdfs` exposure carries forward

For the final report's record:

- **Bucket**: `source-pdfs`
- **Public**: `true` (existing)
- **Contents**: 18 SBC PDFs at `sbc/sbc-201/...` and `sbc/sbc-801/...` (same content as our new private bucket)
- **Frontend dependency**: `src/utils/sourceMetadata.ts` constructs URLs of the form `https://.../storage/v1/object/public/source-pdfs/sbc/...` for the Source Panel feature
- **Anon download confirmed**: HTTP 200 on `https://.../object/public/source-pdfs/sbc/sbc-201/SBC%20201%20-%20...-1-250.pdf` (33 MB streamed without auth)
- **Phase 1A action**: NONE. We did not modify `source-pdfs`. We did not generate new public URLs. We did not change `src/utils/sourceMetadata.ts`. The exposure was there before R10 and is there now.

The owner needs to decide independently whether the existing `source-pdfs` exposure is acceptable (it serves the Source Panel UX) or whether to remediate (which would require frontend changes outside R10's scope). That decision is **deferred** to a separate session.

---

## 6. Privacy verification summary

| Claim | Verified? |
|-------|:---------:|
| New bucket is private | ✅ |
| Anon cannot read PDFs from new bucket | ✅ (tests A, B, C) |
| Anon cannot read index from new bucket | ✅ (test D) |
| Service-role can read PDFs | ✅ (test E) |
| Service-role can read index | ✅ (test F) |
| Bucket `public: false` | ✅ (test G) |
| No public URLs generated for new content | ✅ (no code change made) |
| No signed URLs handed to users | ✅ (no signed URL helper invoked) |
| Existing `source-pdfs` exposure not made worse | ✅ (untouched) |

**Conclusion**: the new `sbc_pdfs_private` bucket complies with all R10 privacy directives. Phase 1A introduced no new public exposure. The pre-existing `source-pdfs` public exposure is a separate, owner-side decision documented in this and prior reports.

---

## 7. What this step did NOT do

- ❌ No code change.
- ❌ No deploy.
- ❌ No DB write.
- ❌ No modification to existing public buckets (including the orphan `source-pdfs`).
- ❌ No public URLs generated.
- ❌ No signed URLs minted.
- ❌ No frontend change.

---

## 8. Next step

Proceed to Task 6 — Phase 1A final report. The final report consolidates Tasks 1-5, declares Phase 1A complete, and explicitly states "PHASE 1B RUNTIME WIRING NOT STARTED — OWNER APPROVAL REQUIRED" as the closing line.
