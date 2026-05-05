# SBC Extraction and Primary Readiness — Final After R7

Date: 2026-05-05 (R8)
This is the consolidated final answer for the R8 round.

Companion documents (committed alongside this in R8):
- [docs/brain/SBC_SOURCE_AND_LEDGER_INVENTORY_AFTER_R7.md](docs/brain/SBC_SOURCE_AND_LEDGER_INVENTORY_AFTER_R7.md)
- [docs/brain/SBC_EXTRACTION_COVERAGE_AFTER_R7.md](docs/brain/SBC_EXTRACTION_COVERAGE_AFTER_R7.md)
- [docs/advisory/HIGH_RISK_ADVISORY_GAP_REGISTER_AFTER_R7.md](docs/advisory/HIGH_RISK_ADVISORY_GAP_REGISTER_AFTER_R7.md)
- [docs/advisory/LIVE_PDF_SOURCE_LOOKUP_V1_DESIGN_AFTER_R7.md](docs/advisory/LIVE_PDF_SOURCE_LOOKUP_V1_DESIGN_AFTER_R7.md)
- [docs/advisory/PRIMARY_IMPROVEMENT_DECISION_AFTER_R7.md](docs/advisory/PRIMARY_IMPROVEMENT_DECISION_AFTER_R7.md)
- [generated/consultx_brain_full/reports/SBC201_801_EXPECTED_VS_ACTUAL_COVERAGE.csv](generated/consultx_brain_full/reports/SBC201_801_EXPECTED_VS_ACTUAL_COVERAGE.csv)

---

## 1. How much of SBC-201 is not yet extracted?

| Bucket | Count | % of 159 |
|--------|------:|---------:|
| Sections with substantive verbatim body (EXISTS_CANONICAL with `verbatim_present`) | 95 | 59.7% |
| Sections with frontmatter-only `.md` (STUB body) | 58 | 36.5% |
| Sections quarantined (`.md` exists, verification failed) | 6 | 3.8% |
| Sections with no `.md` source at all | **0** | **0%** |
| **Truly unextracted from PDF** | **0** | **0%** |

**Answer**: nothing is "completely unextracted" for SBC-201. The 64 stub + quarantined sections have `.md` files — they need re-extraction with body text or human review, but they are not "missing source".

Plus 5 SBC-201 tables are extracted as discrete records. 0 figures.

---

## 2. How much of SBC-801 is not yet extracted?

| Bucket | Count | % of 391 |
|--------|------:|---------:|
| Sections with substantive verbatim body (EXISTS_CANONICAL) | 138 | 35.3% |
| Sections with stub body (PRESENT_BUT_NOT_CANONICAL) | 196 | 50.1% |
| Sections quarantined | 57 | 14.6% |
| Sections with no `.md` source at all (manifest's `missing_md_count`) | 11 | 2.8% |
| **Truly unextracted from PDF** | **11–21** | **3-5%** |

Plus 0 SBC-801 tables and 0 figures extracted as discrete records.

The 31 MB pp 801-1000 PDF emits 0 chunks in the runtime corpus despite being the largest SBC-801 PDF — likely figure-heavy / scan-only content that defeats the existing text extractor. The redundant special files (`SBC801_Ch9_v1_chunks.json` etc.) cover Chapters 9-11 but at lower retrieval precision.

---

## 3. How much is in v1 only and not in primary?

From R7's diff:

| Family | Only-v1 sections | Notes |
|--------|----------------:|------|
| SBC-201 | 17 | Includes 5 critical tables (Table 1004.5, 1006.3.3, 504.3, 504.4, 506.2). Other 12 are scattered admin / mid-chapter sections. |
| SBC-801 | 125 | ~30 high-value (egress sub-clauses, occupancy 301-315, fire-service 501-510). Remaining 95 are mostly stub-quality round-1/round-2 extractions or hyphenated-ID artifacts (`102-7-1` vs `102.7.1`). |
| **Combined** | **142** | |

But the R8 manifest classification reveals only **1 SBC-801 section** is truly "extracted in v1, not promoted to canonical, with substantive body" — `sbc-801-section-114-1-1`. The other ~140 only-v1 entries are mostly stub bodies that v1 has indexed but the manifest hasn't promoted.

**Honest interpretation**: v1 sidecar has the 5 critical tables and ~140 sections with thin bodies. Primary's only meaningful gap relative to v1 is the 5 tables.

---

## 4. How many sections need review?

**63 quarantined sections total**: 6 SBC-201 + 57 SBC-801. Each has an `.md` file; verification (likely PDF page-marker matching) failed during extraction. Human review can salvage most.

The 16 SBC-801 Chapter 9 quarantined sections are the highest-priority for review (they're the most-cited sprinkler/alarm sub-clauses):
```
901.2, 901.6, 901.6.2, 901.7.1, 903.2, 903.3.1.1, 903.3.1.3, 904.7, 904.10, 904.13, 907.2.11, 907.3, 907.5.2.1.1, 907.5.2.2, 914.8.3, 915.5.1
```

The 21 SBC-801 Chapter 4 quarantined sections (408-422 + 11 missing-md) are the next priority concentration.

Plus 37 round-2 sections (14 SBC-201 + 23 SBC-801) that are **`requires_review:true`** in the round-2 metadata. These are not in the 63 above; they are the round-2 extractions held back by the R3 policy gate. Human review can approve their promotion.

**Total review queue**: 63 + 37 = **100 sections requiring human review**.

---

## 5. How many tables and figures are missing?

### Tables

| Source | Discrete table records extracted |
|--------|----------------------------------:|
| SBC-201 | **5** of unknown total (Table 1004.5, 1006.3.3, 504.3, 504.4, 506.2 — exactly the highest-value tables) |
| SBC-801 | **0** of unknown total |

The actual published-table count for both books is not directly knowable from the ledger files. Estimating from common SBC structure: each book likely has 50-100 published tables. So roughly:
- SBC-201: ~50-95 tables NOT yet extracted as discrete records.
- SBC-801: ~50-100 tables NOT yet extracted.

### Figures

**0 figures extracted as discrete records** for either book. SBC-201 alone likely has 200+ figures (architectural diagrams, occupancy load examples, egress diagrams). SBC-801 has more. None are accessible to retrieval today.

This is the biggest invisible gap in the corpus: figure content is entirely outside the pipeline.

---

## 6. Can v1 be wired into primary now?

**No** — three reasons:

1. **R7 already showed primary is the bigger corpus** (4,096 chunks vs 358). Replacing primary with v1 (Option B) would lose 377 sections.

2. **R8 manifest analysis confirms** v1's net-new content beyond primary is mostly the 5 SBC-201 tables + ~30 SBC-801 sections with mixed body quality. Adding these to primary as a supplement (Option C) is technically feasible but requires a code change to `fetchSBCContext` and a deploy.

3. **The biggest user-visible gap** isn't in v1 either — it's the stub-bodied sections (253 total) and the entirely-missing tables/figures, which v1 doesn't fix because v1 is built from the same stub `.md` files.

Wiring v1 into primary is **not the highest-leverage move**. The R8 audits revise R7's recommendation accordingly.

---

## 7. Should we fix bucket root SBC-801 first?

**Not as a standalone action**. Re-extracting pp 601-800 and pp 801-1000 with the existing tooling produces the same near-empty result that's already there (likely figure-heavy / scan-only content). The pp 801-1000 PDF is 31 MB — the existing text extractor can't process it.

If we WERE to fix the bucket root, the requirements would be:
1. OCR-capable extraction (Vision-LLM or commercial OCR API).
2. Re-run the build script with the new extractor.
3. Upload new chunk files to bucket root.

This is a multi-session orchestrator task. Not the next move.

---

## 8. Is Live PDF Lookup a good temporary solution?

**Yes** — it is the recommended next move. See [docs/advisory/PRIMARY_IMPROVEMENT_DECISION_AFTER_R7.md](docs/advisory/PRIMARY_IMPROVEMENT_DECISION_AFTER_R7.md) Section 3.

Why:
- Closes the user-visible "section not indexed" gap immediately.
- Doesn't require fixing the underlying extraction (which would take weeks).
- Provides 30-day telemetry on which sections users are actually asking about — converting a guessing exercise into evidence.
- Is additive, env-killable, Advisory-only.
- Pairs with the existing diagnostic protocol on `not_in_corpus` returns.

Limitations (V1 only):
- Latency tail-risk on OCR fallback (5–15 s on figure-heavy pages). Mitigated by env flag.
- License question (storing 230 MB PDFs in even a private bucket needs owner sign-off).
- No persistent cache in V1.
- No table-cell parsing — table queries get raw page text, not structured cells.
- No multi-page section spans — first-page-only.

These limitations are acceptable for V1. They are tightened in V2+.

---

## 9. First 3 executable orders only

These are the next 3 *executable* operator actions. They are sequenced; each unblocks the next.

### Order 1 — Owner decision on Live PDF license + Phase 0

The owner needs to confirm:
- Is hosting 230 MB of SBC PDFs in a private Supabase bucket within the project's license terms?
- Is the Phase 0 + Phase 1 + Phase 2 plan acceptable as the next implementation track?

Until this is answered, no implementation can begin. This is a single conversation, not a code change.

### Order 2 — Phase 0 bucket preparation (operator-side, conditional on Order 1)

If the owner approves:
- Upload 18 SBC source PDFs to `ssss_private_pdfs/SBC{201,801}/...` with service-role.
- Configure RLS so only service-role can read the new prefix.
- Verify the existing public-read on `ssss/` does not extend to the new private prefix.
- Document upload SHA256s + rollback plan (delete uploaded files + re-upload from D:/sbc_consultx).

This is bucket-only work. No code change. ~30 minutes.

### Order 3 — Phase 1 helper implementation (code, requires user JWT smoke)

After Phase 0:
- Implement `loadLivePdfSection` (~150 lines).
- Wire trigger conditions in the Advisory empty-retrieval branch.
- Add fixtures locking the trigger logic.
- Run TS check + offline fixtures + live smoke against a user JWT.
- Deploy with `ADVISORY_PDF_LOOKUP_DISABLED=0` (i.e. enabled).
- Monitor 24 hours of production logs for `[PdfLookup] ...` lines.

This requires user-JWT live smoke (still BLOCKED today). Cannot be done in an autonomous round.

---

## 10. What is forbidden going forward

Per all standing constraints, these remain off-limits:

- ❌ Phase 3B v2-first sidecar.
- ❌ scoreChunk emission gate.
- ❌ 503-on-empty-retrieval.
- ❌ `brain_full_v3/` orphan as a runtime data source. (Disposition: still recommend delete-after-backup; not in this round.)
- ❌ `fire-safety-chat-v2` activation.
- ❌ Touching Main mode, Analytical mode, Enterprise UI, billing, Moyasar / Tap / webhook flows.
- ❌ Migrations, `supabase db push`, DB writes outside the single-purpose Live PDF telemetry counters (and even those defer to a later phase).
- ❌ Deploys without user-JWT smoke.

---

## 11. The honest claim ceiling today

Without speculating beyond what's measured:

- "**42% of SBC ledger sections** have substantive canonical body content (233 / 550)."
- "**95% of SBC ledger sections** have some form of `.md` source on disk (523 / 550), but more than half are stub-quality."
- "**0 SBC-801 tables and 0 figures** are extracted as discrete records."
- "**100 sections need human review** (63 quarantined + 37 round-2 requires_review)."
- "**5 critical SBC-201 tables** (1004.5, 1006.3.3, 504.3, 504.4, 506.2) ARE extracted and present in the v1 sidecar; their citation traceability via the primary path is uncertain pending live smoke."
- "**Live smoke of Advisory** remains BLOCKED_NO_USER_SESSION; everything above is from static evidence."
- "**No deploy, no DB write, no bucket write, no migration, no code change** in R8."

Forbidden claim ceiling:
- ❌ "production complete" — live smoke still pending.
- ❌ "Brain complete" — 100 sections need review + tables/figures gap + stub bodies.
- ❌ "93% of SBC indexed" — never been true; closest measure is 95% have ANY .md file but only 42% have substantive body.
- ❌ "primary is in good shape" — the SBC-801 pp 601-1000 gap and the 0 SBC-801 tables / figures are real.

---

## 12. R8 deliverable summary

This round produced 6 documents (5 in `docs/`, 1 CSV in `generated/`). Zero code changes. Zero bucket writes. Zero deploys. Zero DB writes. Zero migrations. The next step is an owner conversation about the Live PDF Lookup license question; everything else flows from that decision.
