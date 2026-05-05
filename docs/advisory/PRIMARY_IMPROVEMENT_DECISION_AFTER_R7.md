# Primary Improvement Decision — After R7

Date: 2026-05-05 (R8, decision document — no execution)

The R7 round listed three fix options for primary retrieval. The R8 audits added new evidence about extraction state and high-risk gaps. This document picks **one** path per the brief.

---

## 1. The five options

Per the brief:

- **A**. Do not change primary yet; complete extraction first.
- **B**. Patch only near-empty SBC-801 root files.
- **C**. Add Advisory-only supplement from v1 for only-v1 critical sections.
- **D**. Hybrid: patch SBC-801 root + Advisory-only v1 supplement.
- **E**. Live PDF Lookup first before any primary change.

---

## 2. Recommendation

**Option E — Live PDF Lookup first.**

Specifically: design Phase 0 + Phase 1 of `LIVE_PDF_SOURCE_LOOKUP_V1` as scoped in [docs/advisory/LIVE_PDF_SOURCE_LOOKUP_V1_DESIGN_AFTER_R7.md](docs/advisory/LIVE_PDF_SOURCE_LOOKUP_V1_DESIGN_AFTER_R7.md). Defer corpus rewrites until Live PDF is operational and its 30-day telemetry tells us which sections are actually being queried into the gap.

---

## 3. Why this and not the others

### Why not A (complete extraction first)
- Re-extracting 253 stub-bodied sections + 63 quarantined sections + 17–27 missing-source sections is a multi-week orchestrator session.
- The extraction tooling that produced the current stubs failed to extract the body text. Re-running the same tooling produces the same stubs. Real progress requires either a better extractor (OCR / vision-LLM) or per-section human review — both outside the brief's scope.
- During the wait, every Advisory query that hits a gap returns either misleading partial text or a "not indexed" message. **The user-experience cost compounds daily.**
- A live-PDF stop-gap closes the user-experience hole within a single operator session.

### Why not B (patch only SBC-801 pp 601-1000)
- The 31 MB pp 801-1000 PDF is figure-heavy / scan-only. Any text extraction we run on it today produces the same near-empty result that's already in the bucket.
- Re-extracting pp 601-800 would help, but only fills 200 of the ~1400 SBC-801 page range. The pattern of "extraction tooling fails on figure-heavy or table-heavy PDFs" likely applies elsewhere.
- This is a **point fix**. It doesn't address the SBC-201 stub bodies (Chapter 3 occupancy entirely stub), the quarantined Chapter 9 sections (16 sprinkler/alarm sub-clauses), or the missing tables.

### Why not C (Advisory-only v1 supplement)
- R7 said the v1 sidecar has 142 unique-by-section-set entries that primary lacks. R8 audits show that the manifest classifies most of those (especially for SBC-801) as `STUB` or `PRESENT_BUT_NOT_CANONICAL` — meaning the body content is the SAME stub frontmatter that primary's page-range files have access to indirectly.
- The genuinely high-value v1-only entries are:
  - 5 SBC-201 tables (already verified they exist as discrete records). Already in the v1 sidecar bucket file. The supplement would expose them to the Citation Verifier — true benefit.
  - ~30 SBC-801 sections in the egress / occupancy / fire-service chapters that are extracted-but-not-promoted.
- For the 5 tables: a smaller fix is to seed them into the structured-table DB instead. That avoids the supplement code change.
- For the ~30 SBC-801 sections: most are stub-quality bodies. Supplementing primary with them adds noise without much new content.
- Net: the supplement's actual user-visible benefit is smaller than R7 estimated. **The 30-day telemetry from a live-PDF helper would tell us exactly which sections users are asking about**, and we can supplement targeted entries based on actual demand rather than R7's heuristic guess.

### Why not D (hybrid B + C)
- D is the most expensive option (bucket write + code change + smoke + deploy + bucket cleanup + extraction prep).
- B and C together would consume 2-3 operator sessions.
- The brief says "لا bucket write في أول مرحلتين" — bucket writes were forbidden in the first two stages. R5 already used the one allowed bucket write. D requires another, which puts us in tension with the standing constraint.

### Why E (Live PDF Lookup first)
- **It addresses the actual user pain point**: a query asking about a section that isn't indexed today gets "not indexed". With Live PDF, that same query returns the verbatim section text from the source PDF — the highest-quality possible response.
- **It is bucket-write minimal**: only the one-time upload of 18 PDFs to a private prefix. No corpus chunk rewrites.
- **It exposes the 30-day demand signal**: telemetry on which sections are most queried into the gap. That signal then tells us whether to invest in re-extraction (Option A), point-fixes (Option B), or supplements (Option C). **Today we have no demand signal — every fix is a guess.**
- **It is safely revertable**: an env-var kill switch disables the helper entirely. The helper is additive — it can never remove a citation that primary already provided.
- **It is Advisory-only**: explicitly does not touch Main, Analytical, or any other mode.
- **It pairs cleanly with the existing diagnostic protocol**: when the helper returns `not_in_corpus`, the existing RETRIEVAL NOTE branch handles it. Same fallback already in place.

---

## 4. Exact blockers

These must be resolved before Option E proceeds:

| Blocker | Status |
|---------|--------|
| SBC license / redistribution rights for storing PDFs in private bucket | **Unknown** — owner-side decision. The PDFs sit at `D:/sbc_consultx/` locally; uploading them to even a private bucket counts as redistribution. |
| Owner approval for a 230 MB upload to private bucket | **Pending** |
| Service-role credential for the upload | **Available** (deferred-rotation key from R5) |
| Edge function code changes (Phase 1 ~150 lines) | **Pending implementation** — not in scope for R8 |
| Live smoke against a user JWT | **BLOCKED_NO_USER_SESSION** today; must come back when JWT available |
| Phase 0 bucket prep | **Not yet attempted** |

The legal/license blocker (first row) is the only true blocker outside our control. If the project doesn't have a license to host the PDFs in a private cloud bucket, Option E cannot proceed and we fall back to D or B.

---

## 5. Minimum safe next action

The minimum safe next action — fully respecting the brief's "no code, no bucket write, no deploy" rule — is to **commit this decision document** and surface the license/upload question to the owner. Specifically:

1. Commit R8 documents (this round).
2. Owner reviews:
   - The license / redistribution question (Section 4 row 1).
   - The Phase 0 / Phase 1 plan in the design doc.
   - The 30-day telemetry-driven follow-up sequence.
3. If owner approves, schedule a **Phase 0 only** session (PDF upload, bucket policy, no code) as the next R8.5 round.
4. Phase 1 (code + smoke + deploy) requires a separate session with user JWT available.

The minimum next *technical* action is **zero** — no file is added, no upload happens, no code lands. The next thing is an owner conversation, not a runtime change.

---

## 6. Rollback requirement

If/when Option E is implemented:

- **Phase 0 rollback**: delete the uploaded PDFs from `ssss_private_pdfs/`. Backup retained on operator's local D:/ drive (already there).
- **Phase 1 rollback**: env-var `ADVISORY_PDF_LOOKUP_DISABLED=1`. Function-internal kill-switch. No redeploy needed.
- **Phase 1 hard rollback**: git revert + redeploy. Standard.

Both rollbacks restore the runtime to its current R5-bucket-refreshed-but-no-PDF-helper state. No corpus changes needed.

---

## 7. Smoke + deploy + DB requirements

| Stage | Bucket write | Code deploy | DB write | User smoke required |
|-------|:-----------:|:-----------:|:--------:|:-------------------:|
| Phase 0 (bucket prep) | YES (one-time PDF upload) | No | No | No (anonymous read test sufficient) |
| Phase 1 (helper + Advisory wiring) | No | YES | No | YES (must hit the trigger conditions live) |
| Phase 2 (OCR fallback) | No | YES | No | YES |
| Phase 3 (cache) | No | YES | No | Optional |
| Phase 4 (telemetry) | No | No | No (only logs) | No |

**Phase 1 requires user JWT for smoke**. The helper only fires when the trigger conditions are met. Verifying that requires the runtime to actually receive an authenticated Advisory query asking about a gap section.

---

## 8. Decision summary

> **Option E. Implement Live PDF Source Lookup as the next surgical action on Advisory's primary path. Defer Options A, B, C, D until 30 days of Live PDF telemetry tells us exactly where the user demand for the gap content is concentrated.**

Effort: 1 owner-decision conversation + 1 Phase 0 session + 1 Phase 1 session + 30 days waiting + 1 evaluation session.

Risk: Low. Additive. Env-killable. Advisory-only.

User-visible benefit: closes the "section not indexed" gap on every query that has a discrete section ref but the section is in a gap category.

Long-term replacement: canonical re-extraction of stubs and quarantined sections, informed by Live PDF telemetry. That work is queued behind Option E.
