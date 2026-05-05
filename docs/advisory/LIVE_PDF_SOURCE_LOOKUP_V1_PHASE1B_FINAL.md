# Live PDF Source Lookup V1 — Phase 1B Final

Date: 2026-05-05 (R11)
Branch: `claude/affectionate-solomon-f5e304`

This is the consolidated Phase 1B deliverable. The owner approved Phase 1B under strict conditions ("server-side text artifacts, helper Advisory-only, deploy flag OFF, no runtime activation"). Phase 1C (flag flip ON + live smoke) is **not started** — owner approval required.

Companion documents (committed in R11):
- [docs/advisory/LIVE_PDF_LOOKUP_PHASE1B_FEASIBILITY.md](docs/advisory/LIVE_PDF_LOOKUP_PHASE1B_FEASIBILITY.md) — Task 1
- [docs/advisory/LIVE_PDF_LOOKUP_TEXT_ARTIFACT_BUILD_RESULT.md](docs/advisory/LIVE_PDF_LOOKUP_TEXT_ARTIFACT_BUILD_RESULT.md) — Task 2
- [docs/advisory/LIVE_PDF_LOOKUP_TEXT_ARTIFACT_UPLOAD_RESULT.md](docs/advisory/LIVE_PDF_LOOKUP_TEXT_ARTIFACT_UPLOAD_RESULT.md) — Task 3
- [docs/advisory/LIVE_PDF_LOOKUP_HELPER_IMPLEMENTATION_NOTES.md](docs/advisory/LIVE_PDF_LOOKUP_HELPER_IMPLEMENTATION_NOTES.md) — Task 4
- [docs/advisory/LIVE_PDF_LOOKUP_INTEGRATION_RESULT.md](docs/advisory/LIVE_PDF_LOOKUP_INTEGRATION_RESULT.md) — Task 5
- [docs/advisory/LIVE_PDF_LOOKUP_FIXTURE_RESULTS.md](docs/advisory/LIVE_PDF_LOOKUP_FIXTURE_RESULTS.md) — Task 6
- [docs/advisory/LIVE_PDF_LOOKUP_DEPLOY_FLAG_OFF_RESULT.md](docs/advisory/LIVE_PDF_LOOKUP_DEPLOY_FLAG_OFF_RESULT.md) — Task 7

---

## 1. Text artifacts built and uploaded

**YES — both.**

| Step | Result |
|------|--------|
| Build (Task 2) | 18 artifacts via `pdftotext` (Poppler binary). 4,261 pages extracted, 15.0 MB total artifacts. 0 OCR. 0 model. |
| Upload (Task 3) | 18 artifacts + 1 manifest uploaded to `sbc_pdfs_private/text_pages/`. All 19 hash-matched after re-download. |
| Schema | `{ code, pdf_file, source_pdf_sha256, page_count, total_text_chars, generator, generated_at, pages: [{ page, char_count, text }] }` |
| Privacy | bucket remains `public=false`; all anon access denied. Same access tests as R10 still pass. |

---

## 2. Helper implemented

**YES — `lookupPdfSourceTextV1` added INLINE in `supabase/functions/fire-safety-chat/index.ts`.**

| Field | Value |
|-------|-------|
| Location | between V1 sidecar end (~line 1338) and Citation Verifier start (~line 1340) |
| Lines added | ~280 |
| File decision | INLINE (per Task 1 feasibility — no precedent for multi-file edge functions in this project) |
| Deps added | None — uses existing `serve`, `createClient`, `Deno.env.get` |
| Cache | In-memory: index (lifetime), text artifacts (LRU max 5) |
| Mode gate | `mode !== "standard"` → `not_found` |
| Flag gate | `Deno.env.get("ADVISORY_PDF_LOOKUP_ENABLED") !== "1"` → `not_found` |
| Figure ref | always `not_found` (V1 doesn't support figures) |
| OCR | NOT implemented in V1 (per brief) |
| Model use | NOT used (per brief) |
| Returns PDF URL | NEVER (only `citation_label` string + sentinel filename) |

---

## 3. Advisory wiring implemented

**YES — integration block added inside the `if (mode === "standard")` branch.**

| Field | Value |
|-------|-------|
| Location | After V1 sidecar load (line ~5841), before structured-table evidence surface (line ~5843) |
| Lines added | ~115 |
| Trigger gate | (a) flag === "1" AND (b) `queryMeta.sectionNumbers.length > 0 \|\| queryMeta.tableRefs.length > 0` AND (c) ref NOT already in `advisoryLedger` |
| Concurrent cap | Max 3 lookups per query |
| Total budget | 5,000 ms per Advisory turn |
| Failure handling | try/catch at the integration site; failure logged but never thrown |
| Family inference | Section number → SBC-201 (1xx-8xx, 11xx-12xx) or SBC-801 (9xx-10xx, 13xx+) |
| Ledger supplement | Adds `EvidenceLedgerEntry` with `isClickableSource: false`, `precision: 'page_range'` |
| Source meta supplement | Sentinel filename `__live_pdf__::<family>::<ref>` (mirrors existing `__sbc_table__::` sentinel) |
| Prompt supplement | Bilingual block (AR/EN) with strict instructions: cite verbatim only, no extrapolation, confidence-band-specific guidance |

---

## 4. Flag default OFF confirmed

**YES.**

| Layer | Value |
|-------|-------|
| Helper internal gate | `if (flag !== "1") return not_found;` — defaults OFF when env unset |
| Integration site gate | Same check at the call site, so the entire trigger-evaluation block is skipped when flag is unset |
| Edge Function secret | **NOT SET** in Supabase. The deploy will land with the flag absent. Treated as `"0"`. |
| Owner approval to flip ON | **NOT GIVEN** in this round. Phase 1C is gated on explicit owner approval. |

When the flag is OFF:
- Zero storage calls.
- Zero log lines from `[PdfLookup]`.
- Zero added latency.
- Zero impact on Evidence Ledger.
- Zero impact on response headers.

---

## 5. Main mode affected?

**NO.**

The integration block is inside `if (mode === "standard")` (line 5484). Main mode (`mode === "main"`) takes a different code path that does not enter this block. **Verified by code review — no other invocation of `lookupPdfSourceTextV1` exists anywhere in the file.**

---

## 6. Analytical mode affected?

**NO.**

Same as Main — `mode === "analysis"` does not enter the Advisory branch. Plus the helper itself has a defense-in-depth `mode !== "standard"` early-return (returns `wrong_mode_<mode>` diagnostic). **Verified by fixtures #2a and #2b.**

---

## 7. SourcePanel / private URL exposure?

**NO.**

| Surface | Status |
|---------|:------:|
| New public URL constructed | **NO** |
| New signed URL minted | **NO** |
| Bucket path leaked in `usedFiles` / `X-SBC-Sources` | **NO** — sentinel filename `__live_pdf__::<fam>::<ref>` used instead |
| Bucket path leaked in `usedSourceMeta` / `X-SBC-Source-Meta` | **NO** — sentinel filename used |
| Frontend can construct a PDF URL from sentinel | **NO** — sentinel doesn't match the URL-construction regex in `src/utils/sourceMetadata.ts` |
| `sbc_pdfs_private` bucket access change | **NO** — still `public=false` |
| `source-pdfs` (orphan public bucket) status | **UNCHANGED** — separate owner-side decision |

---

## 8. Fixtures pass/fail

**21/21 pass.**

| Suite | Count | Status |
|-------|------:|:------:|
| Intent Gate (R1, regression) | 11 | ✅ all pass |
| PDF Lookup (R11) | 10 | ✅ all pass |

PDF Lookup fixture coverage:
1. Flag OFF returns `disabled_by_flag` ✅
2a. Wrong mode (main) ✅
2b. Wrong mode (analysis) ✅
3. Figure ref returns `figure_not_supported_v1` ✅
4. Index miss returns `index_miss` ✅
5. Hyphenated `102-7-1` normalizes to dot form ✅
6. Excerpt truncation at `max_excerpt_chars` ✅
7. Exact section match returns `confidence: "exact"` ✅
8. Page-only fallback returns `confidence: "likely"` ✅
9. Table ref `Table 1004.5` exact match ✅

---

## 9. Deploy done?

**NO — BLOCKED_DEPLOY_UNAVAILABLE.**

The autonomous session does not have `deno` or `supabase` CLI installed. Deploy must happen from an operator's local machine where these tools are available.

What WAS verified in lieu of deploy:
- TypeScript parse: **0 diagnostics** on the 6,302-line file. Syntactic correctness confirmed.
- Ad-hoc semantic check: **0 new errors**. The single TS error reported (line 2419, missing `sourceMeta`) is **pre-existing** in `fetchSBCContext` cache fallback code; it is unrelated to Phase 1B.
- All 21 fixtures pass.
- `git diff --stat`: **+457 / -0** in `index.ts`. Purely additive.

---

## 10. Live smoke done?

**NO — BLOCKED_NO_USER_SESSION.**

Live smoke requires a user JWT (the `fire-safety-chat` endpoint correctly rejects anon-only auth with HTTP 401, verified across multiple prior rounds). Autonomous sessions do not have admin/test user credentials. Live smoke must happen in an operator-driven session.

---

## 11. Remaining blockers before Phase 1C

| # | Blocker | Status |
|---|---------|--------|
| 1 | Deploy `fire-safety-chat` from a machine with `supabase` CLI | **Operator-side** — see Task 7 deploy runbook |
| 2 | Owner approval to flip `ADVISORY_PDF_LOOKUP_ENABLED=1` | **Pending** |
| 3 | Admin user JWT for live smoke | **Pending** — operator-driven session |
| 4 | Service-role key rotation | **DEFERRED by owner directive** (R5) — not blocking |
| 5 | `source-pdfs` orphan public-bucket decision | **DEFERRED** — separate owner-side cleanup |
| 6 | Fix pre-existing TS error at line 2419 (`sourceMeta` missing in cache fallback) | Pre-existing, unrelated to Phase 1B; non-blocking but worth fixing eventually |

---

## 12. Next 3 tasks (only)

These are the next 3 *executable* operator actions. Each unblocks the next.

### Task 1 — Operator runs the deploy from a local machine

```bash
# On operator's machine with supabase CLI installed
cd <repo-or-worktree>
git pull
# Verify ADVISORY_PDF_LOOKUP_ENABLED is unset (or "0") in Edge Function secrets
# Supabase Dashboard → Project Settings → Edge Functions → Secrets
npx supabase functions deploy fire-safety-chat --project-ref hrnltxmwoaphgejckutk
```

After deploy, run one Advisory query (any user). Verify:
- Helper does NOT fire (no `[PdfLookup]` log line).
- Existing Advisory behavior is byte-identical to pre-deploy.

This is "live smoke baseline with flag OFF."

### Task 2 — Operator flips flag ON for one Advisory test

After Task 1's baseline confirms the deploy is clean:

```bash
# Supabase Dashboard → Project Settings → Edge Functions → Secrets
# Set: ADVISORY_PDF_LOOKUP_ENABLED = "1"
# (No redeploy needed — secrets are read at request time)
```

Run 3 Advisory smoke queries:
- A: known canonical section (e.g. `Section 903.2.7`) → helper should NOT fire (already in ledger).
- B: gap section (e.g. one of the 16 quarantined Ch9 sections like `Section 915.5.1`) → helper SHOULD fire and return `confidence: "exact"` or `"likely"` with verbatim excerpt.
- C: out-of-corpus section (e.g. `Section 6304.2.1.1`) → helper fires, returns `not_found`.

Capture telemetry: `[PdfLookup] code=... kind=... ref=... confidence=... latency_ms=...` in Supabase function logs.

### Task 3 — Decide on `source-pdfs` orphan public-bucket exposure

Independent decision: keep public for the existing Source Panel UX, or migrate to private + frontend-only-via-edge-function source delivery. This decision touches frontend code; out of R11's autonomous scope.

---

## 13. Production state changes in R11

| Change | Status |
|--------|--------|
| 18 text-page JSON artifacts uploaded to `sbc_pdfs_private/text_pages/` | ✅ done |
| `text_pages_manifest.json` uploaded | ✅ done |
| `supabase/functions/fire-safety-chat/index.ts` modified (+457 lines) | ✅ committed (this round) |
| `evals/advisory/pdf_lookup_fixtures.test.ts` added (10 fixtures) | ✅ committed (this round) |
| Helper deployed to production runtime | ❌ **NOT YET** — operator-side action |
| `ADVISORY_PDF_LOOKUP_ENABLED` env secret set | ❌ **NOT SET** |

---

## 14. Closing line

**PDF LOOKUP IMPLEMENTED BUT NOT ENABLED FOR USERS UNTIL OWNER APPROVES FLAG ON.**
