# Live PDF Source Lookup V1 — Phase 0 Final

Date: 2026-05-05 (R9)
Branch: `claude/affectionate-solomon-f5e304`

This is the consolidated Phase 0 deliverable for `LIVE_PDF_SOURCE_LOOKUP_V1`. Five design documents are committed alongside this final. The intent: leave Phase 0 with a complete, owner-reviewable design — no production state changed, no PDF uploaded, no code wired.

Companion documents (committed in R9):
- [docs/advisory/LIVE_PDF_LOOKUP_PDF_HOSTING_READINESS.md](docs/advisory/LIVE_PDF_LOOKUP_PDF_HOSTING_READINESS.md) — Task 1
- [docs/advisory/LIVE_PDF_LOOKUP_STORAGE_PLAN.md](docs/advisory/LIVE_PDF_LOOKUP_STORAGE_PLAN.md) — Task 2
- [docs/advisory/LIVE_PDF_LOOKUP_INDEX_DESIGN.md](docs/advisory/LIVE_PDF_LOOKUP_INDEX_DESIGN.md) — Task 3
- [docs/advisory/LIVE_PDF_LOOKUP_RUNTIME_CONTRACT.md](docs/advisory/LIVE_PDF_LOOKUP_RUNTIME_CONTRACT.md) — Task 4
- [docs/advisory/LIVE_PDF_LOOKUP_INTEGRATION_PLAN.md](docs/advisory/LIVE_PDF_LOOKUP_INTEGRATION_PLAN.md) — Task 5

---

## 1. Are the PDFs ready to host?

**YES — technically. Pending owner license approval.**

- All 18 SBC PDFs (~229 MB total) are at `D:/sbc_consultx/`. Files exist, are well-formed, and are ready for upload.
- Each PDF was probed with `pdftotext` (Poppler local binary). Result: **17 of 18 have a strong text layer** (>50 KB extracted in first 30 pages).
- One outlier: `SBC 201 ...-1251-1500.pdf` (34 MB, the largest SBC-201 part) has only 5,185 chars extracted in first 30 pages — weak text density on early pages. Not a launch blocker; deeper-page probing in Phase 1 will tell whether OCR is needed for individual pages of this file.

License blocker: hosting 230 MB of Saudi Building Code PDFs in a private cloud bucket may require explicit redistribution rights. **Owner must confirm before any upload happens.** Phase 0 surfaces this question; it is not resolved here.

---

## 2. Is text-layer extraction sufficient?

**YES — for V1.** OCR is NOT needed.

Evidence:
- 17 of 18 PDFs return clean text via standard `pdftotext` extraction.
- The previously-feared 31 MB `SBC-801 (3)-801-1000.pdf` (R8 worried it was scan-only) **does have a working text layer**: 24,725 chars in first 5 pages, 145,656 chars in first 30 pages. Phase 0 measurement directly contradicts the R8 hypothesis.
- The bucket-root SBC-801 pp 801-1000 chunk file being empty at runtime is **not** because the PDF is unreadable. It's because the older extraction tool (whatever it was) failed on this specific file. A fresh `pdftotext`-based path will succeed.

Phase 1's runtime helper uses Deno-native PDF text extraction (probably via `pdfjs-dist` from npm, since pdf-parse had import issues during the Phase 0 probe). Either library handles the text layer. OCR fallback (Phase 2) is **opt-in only**, behind `ADVISORY_PDF_LOOKUP_OCR_ENABLED=1` env flag.

---

## 3. Which files need OCR later?

For V1 launch: **none, in their entirety**. OCR is not required to launch.

Files that may need PER-PAGE OCR fallback in Phase 2:
- `SBC 201 ...-1251-1500.pdf` — weak text density on early pages. Specific pages within it may be scans. Without per-page probing it's not certain. Deferred to Phase 2.

For all other 17 PDFs: text layer works. No OCR planned.

---

## 4. Does the owner need to approve before upload?

**YES — explicitly.** Two reasons:

1. **License / redistribution rights**. The Saudi Building Code is published under specific terms. Hosting 230 MB of PDFs in a Supabase-hosted private bucket counts as redistribution from the operator's local machine. The owner must confirm this is within license terms before any upload happens. Phase 0 raises this as the primary blocker.

2. **Cost/storage check**. 229 MB on Supabase storage is small (~23% of the 1 GB free tier). Not a budget concern, but the owner should be aware of the line item before Phase 1 launches.

Without owner approval on item 1, **Phase 1 must not start**. The technical design is ready; the legal-side gate is what's missing.

---

## 5. What is the minimum safe Phase 1 execution?

The minimum-risk Phase 1 sequence (assumes owner approval has been received):

### Step 1 — Bucket setup (operator-side, ~10 minutes)

- Create `sbc_pdfs_private` bucket via Supabase Dashboard. Set `public: false`, `file_size_limit: 50 MB`, `allowed_mime_types: ["application/pdf"]`.
- Verify with one anonymous-deny test: an unauthenticated GET on a non-existent path returns 403 (or appropriate denial). No PDFs uploaded yet.

### Step 2 — Generate the lookup index (operator-side or autonomous, ~30 min)

- Implement `scripts/build-pdf-source-lookup-index.cjs` per the index design.
- Run it locally against existing manifests + page maps + 18 PDFs.
- Inspect the output: should be ~163 KB JSON with ~542 entries.
- Commit the index to `generated/consultx_brain_full/indexes/pdf_source_lookup_index.json`.

### Step 3 — PDF upload (operator-side, ~5 minutes)

- Run the upload command from [LIVE_PDF_LOOKUP_STORAGE_PLAN.md](docs/advisory/LIVE_PDF_LOOKUP_STORAGE_PLAN.md) Section 9.
- Verify all 18 PDFs are listed in the bucket.
- Upload the index file to `sbc_pdfs_private/index/pdf_source_lookup_index.json`.

### Step 4 — Runtime helper implementation (autonomous code work, ~4 hours)

- Implement `supabase/functions/fire-safety-chat/_pdf_lookup.ts` per the runtime contract.
- Add fixtures per Runtime Contract Section 11.
- Run TS check + all fixtures (existing + new). Must pass.

### Step 5 — Integration wiring (autonomous, ~30 min)

- Modify `supabase/functions/fire-safety-chat/index.ts` per the integration plan.
- Add ~30 lines of trigger-gate code at line ~5476.
- Update the Citation Verifier with the `live_lookup` tag.
- Run TS check + fixtures.

### Step 6 — Deploy with flag OFF (operator-side, ~5 min)

- Deploy the edge function with `ADVISORY_PDF_LOOKUP_ENABLED=0`.
- Verify a sample Advisory query still works (existing behavior).

### Step 7 — Live smoke (operator + autonomous, ~30 min)

- Need user JWT — currently BLOCKED in this session.
- Test 1: query for `Section 903.2.7` (canonical, in `existing_ledger`) — verify NO `[PdfLookup]` log line (existing retrieval covers it).
- Test 2: query for `Section 6304.2.1.1` (chapter 63, not indexed) — verify `[PdfLookup] ... confidence=not_found` log line; verify model applies diagnostic protocol.
- Test 3: query for `Section 915.5.1` (canonical-tracked but quarantined — this is in the index from `existing_ledger`) — verify `[PdfLookup]` fires and supplements the ledger; verify model cites with `live_pdf` tag.
- Verify zero impact on Test 1 (most queries shouldn't trigger lookup).

### Step 8 — Flip flag to ON (operator-side, ~1 min + 24-hour observation)

- Set `ADVISORY_PDF_LOOKUP_ENABLED=1`.
- Monitor production logs for 24 hours. Watch for:
  - `[PdfLookup]` log lines appearing on real user traffic.
  - Latency p95 staying under 18 s.
  - No new error patterns.
- If anything looks off, flip flag back to `0`. Code stays deployed.

**Total Phase 1 time: ~16 hours of work spread over 2-3 sessions, plus 24 hours of observation.**

---

## 6. Risks

### License risk
- **Severity**: High — could require removing the PDFs from production.
- **Probability**: Unknown without the owner's confirmation.
- **Mitigation**: Owner sign-off in Phase 0 close-out. If license forbids, abandon Live PDF Lookup and pursue Option A (canonical re-extraction) or Option C (v1 supplement) from R7's options.

### Stale index risk
- **Severity**: Medium — a section indexed at the wrong page silently returns wrong text.
- **Probability**: Low for `existing_ledger` entries (already validated). Medium for `pdf_text_search` and `chapter_range_inferred` entries.
- **Mitigation**: Confidence band gates compliance answer. `should_answer_compliance: false` for `likely` confidence. Fixtures lock the band logic.

### PDF format change
- **Severity**: Low — Saudi Building Code 2024 is unlikely to be re-issued mid-deploy.
- **Probability**: Very low.
- **Mitigation**: SHA256 manifest of uploaded PDFs lets us detect any drift.

### OCR latency runaway (if Phase 2 enabled)
- **Severity**: Medium — would add 5-15 seconds per OCR call.
- **Probability**: Phase 2 only. V1 doesn't have this risk.
- **Mitigation**: Phase 2 is behind a separate env flag.

### Citation Verifier confused by new `live_lookup` flag
- **Severity**: Low.
- **Probability**: Low.
- **Mitigation**: Verifier extension is small (~10 lines); fixtures cover the new tag.

### Frontend rendering breakage from new header field
- **Severity**: Low.
- **Probability**: Very low — additive field.
- **Mitigation**: Header is backwards compatible; frontend ignores unknown fields.

### Bucket private misconfiguration
- **Severity**: High — could expose PDFs publicly.
- **Probability**: Low if Phase 1 Step 1 follows the storage plan.
- **Mitigation**: Phase 1 Step 1 includes an explicit anonymous-deny verification before any PDF upload. If verification fails, abort.

### Service-role key reuse
- **Severity**: Low — same key already used by all edge functions.
- **Probability**: n/a.
- **Mitigation**: Rotation deferred per R5 owner directive; not blocking.

---

## 7. First 3 executable orders

These are the next 3 *executable* operator actions. Each unblocks the next.

### Order 1 — Owner license review

The owner reviews the question: *can ConsultX host 230 MB of Saudi Building Code 2024 PDFs in a private Supabase bucket as the source-of-truth for runtime fact lookups?* This is a single conversation. No file is touched.

- Approval → proceed to Order 2.
- Rejection → fall back to Option A or Option C from R7's fix-options. Live PDF Lookup is abandoned.
- Approval-with-conditions (e.g. "yes but only excerpts < N words") → revise the runtime contract (`max_excerpt_length` becomes the conditioned cap) and proceed to Order 2.

### Order 2 — Phase 1 Steps 1, 2, 3 (bucket prep + index + upload)

After Order 1 approval:
- Create `sbc_pdfs_private` bucket.
- Implement and run `scripts/build-pdf-source-lookup-index.cjs`. Commit the resulting index file.
- Upload all 18 PDFs.
- Upload the index.
- Verify anonymous-deny on the new bucket.

Bucket-only operation. No code change. Committed artifacts: the index JSON.

### Order 3 — Phase 1 Steps 4-7 (runtime helper + integration + smoke + flag-off deploy)

After Order 2:
- Implement `_pdf_lookup.ts` per the runtime contract.
- Wire integration in `fire-safety-chat/index.ts` per the integration plan.
- Update Citation Verifier with `live_pdf` tag.
- Add fixtures.
- Run TS check + all fixtures.
- Deploy with `ADVISORY_PDF_LOOKUP_ENABLED=0`.
- One-time live smoke with user JWT — verifies the helper works end-to-end on at least one canonical, one quarantined, one not-indexed section query.

Step 8 (flip flag to ON) is a separate operator action after Step 7's smoke passes.

---

## 8. PHASE 1 NOT STARTED — OWNER APPROVAL REQUIRED BEFORE PDF UPLOAD OR CODE WIRING.

**This is the load-bearing line of this report.**

Phase 0 produced a complete design package — 6 documents covering hosting readiness, storage plan, index design, runtime contract, integration plan, and this final summary. Every Phase 1 step has a documented procedure, a documented rollback, a documented risk profile.

**No PDF has been uploaded.**
**No bucket has been created.**
**No code has been changed.**
**No deploy has been performed.**
**No DB write has been performed.**
**No service role has been used in this round.**

Phase 1 begins ONLY after:

1. Owner confirms license/redistribution rights for hosting 230 MB of SBC PDFs in a private cloud bucket.
2. Owner approves the Phase 1 execution sequence (Steps 1-8 in Section 5).
3. A live-smoke session is scheduled where a user JWT is available for verification (currently BLOCKED in autonomous rounds).

Until those three conditions are met, Phase 0 stays as the complete deliverable. The runtime is unchanged from R8's state. The R5 corpus refresh is the most-recent production change; Phase 1 will introduce the next.
