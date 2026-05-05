# ConsultX — Final Platform Closeout Status (R3)

Date: 2026-05-05 (R3)
Branch: `claude/affectionate-solomon-f5e304`
Predecessors: [R2](docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05-R2.md), [R1](docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05.md)

Session commit added in this round:
- `686d4e8` chore(brain): enforce safe round-2 corpus promotion policy

Companion documents (this round):
- [generated/consultx_brain_full/reports/ROUND2_SAFE_PROMOTION_RESULT.md](generated/consultx_brain_full/reports/ROUND2_SAFE_PROMOTION_RESULT.md)
- [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_RESULT.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_RESULT.md)

---

## 1. Live smoke

**Status: PARTIAL_EXECUTION.** Only the test paths that are anonymous-safe and require no user JWT were exercised. A web-browser admin session was not available in this environment.

### Pass / fail per area

| Area | Sub-tests run | Result |
|------|---------------|--------|
| **A. Public Tracking** | A.5a, A.5b, A.5c (malformed POST bodies); A.5d (CORS preflight); A.5e, A.5f (frontend SPA round-trip) | **6/6 PASS**. Every failure mode returns HTTP 404 `{"error":"Not found"}` (21 bytes). CORS preflight returns 200 with correct headers. Frontend renders byte-identical SPA shell for any bad token; differentiation is client-side. Privacy regression: zero internal-field leaks (`case_id`, `user_id`, `email`, `case_notes`, `decision_notes` — all 0 matches). Latency 400–500 ms uniformly. |
| **A.1–A.4 Public Tracking happy path** | — | **BLOCKED_NO_USER_JWT** — needs Enterprise UI session to enable / fetch a token. |
| **B. Enterprise Assignment** | — | **BLOCKED_NO_USER_JWT** for all 5 sub-tests. |
| **C. Documents** | — | **BLOCKED_NO_USER_JWT** for all 6 sub-tests. |
| **D. Reviews / Approvals** | D.5 (`accepted_with_notes` not supported) — DOCUMENTED only | D.1–D.4 BLOCKED_NO_USER_JWT. D.5 confirms prior Phase-3 finding: not a bug, conditioned on "إن مدعوم". |
| **E. Subscription / access** | E.1.0 (no auth header), E.1.1 (anon JWT only) | **2/2 PASS**. Both return HTTP 401 `{"error":"Unauthorized"}` (24 bytes). Confirms `check-subscription` correctly distinguishes anon JWTs from real user JWTs. Override paths (E.1.2–6, E.2, E.3) BLOCKED_NO_ADMIN_JWT. |

### Bugs found

**Zero.** Every executable path returned the expected response.

### Items truly tested live

- Production frontend `https://www.consultx.app/track/...` (2 bad-token paths, status 200, SPA shell)
- Production edge function `https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/get-public-case-tracking` (3 POST failure modes + 1 OPTIONS CORS preflight)
- Production edge function `https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/check-subscription` (2 unauthorized paths)

No DB write, no test data created, no Moyasar / Tap interaction, no payment endpoint touched.

---

## 2. Brain — chunks-file completion before / after R3

The R3 build introduced a `requires_review:true` policy gate inside `buildChunks()`. The gate skips any `.md` under `extracted_gaps/*` whose sibling `.meta.json` has `requires_review === true`.

### Counts

| Source | BEFORE R3 (committed) | AFTER R3 (this commit) |
|--------|----------------------:|------------------------:|
| SBC-201 chunks | 148 | **136** |
| SBC-801 chunks | 221 | **222** |
| **Combined** | **369** | **358** |

### Percentages

| View | BEFORE R3 | AFTER R3 |
|------|----------:|---------:|
| Chunks-file view (numerator = chunks served) | 369/550 = **67.0%** | 358/550 = **65.1%** |
| Ledger strict view (numerator = `ledger_status = EXISTS_CANONICAL`) | 233/550 = **42.4%** | 233/550 = **42.4%** (unchanged) |

The chunks-file view DECREASED. This is the correct direction — the May-1 build had silently included 12 SBC-201 round-2 chunks (sections 102, 104, 109, 110, 111, 112, 113, 114, 115, 116, 202, 309) that violated the user-stated "no `requires_review:true` promotions" policy. The gate now removes them.

### Promoted-safe round-2 count

**1** chunk: `sbc-801-section-114-1-1` (round-2 SBC-801, `requires_review: false`, confidence=0.85). Newly admitted by the gate.

### Skipped requires_review count

**37** total — 14 SBC-201 round-2 + 23 SBC-801 round-2. All `requires_review: true`, all confidence=medium (0.65 in the SBC-801 batch). Held back pending human review.

### Remaining gaps

| Category | Count |
|----------|------:|
| Round-1 extracts already promoted | 125 (unchanged) |
| Round-2 extracts held back by policy gate (requires_review:true) | 37 |
| Sections never extracted (no `.md` file at all) | ~91 (mostly SBC-801 specialty chapters Ch 12–63) |
| Quarantined (source exists but verification failed) | 63 (6 SBC-201 + 57 SBC-801) |

The remaining gaps total approximately **191** sections across all categories. None are blocked by missing source — all PDFs are at `D:/sbc_consultx/`.

---

## 3. Production safety

| Check | Answer | Detail |
|-------|:------:|--------|
| Vercel frontend deploy | **No** | No `vercel deploy` invoked |
| Supabase edge function deploy | **No** | No `npx supabase functions deploy` invoked |
| Supabase migration applied | **No** | No `supabase db push`, no SQL files modified |
| Supabase bucket write (`ssss/`) | **No** | New chunk files exist locally only; bucket retains May-1 corpus |
| Supabase DB write | **No** | Only SELECT-style HTTP calls were made (and only to `get-public-case-tracking` which read-only-queries `case_public_tracking` for token lookup; no token matched, so no row touched) |
| Moyasar / Tap / webhook / renewal call | **No** | None of those endpoints exercised |
| Touched runtime (edge functions or frontend) | **No** | `fire-safety-chat`, `check-subscription`, all enterprise functions, all UI pages — untouched |

The only file system writes in this round were:
- `scripts/build-consultx-brain-full.cjs` (build-tooling change, +34 / −0 lines)
- `generated/consultx_brain_full/{chunks,brain_manifest_full.json,rollback_manifest_full.json,validation_report_full.json}` (build outputs)
- `generated/consultx_brain_full/reports/ROUND2_SAFE_PROMOTION_RESULT.md` (new)
- `docs/qa/LIVE_PRODUCTION_SMOKE_TEST_RESULT.md` (new)
- `docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05-R3.md` (this file — committed in next commit)

---

## 4. Final readiness

### Ready for public operation?
**Conditional yes for the audited paths; no for the unaudited.**

- ✅ Public tracking failure modes (404 + privacy + CORS) are verified live.
- ✅ `check-subscription` auth gate is verified live for the unauthenticated case.
- ✅ Advisory Brain is on stable Phase 3A baseline with diagnostic logs (committed in R1) and offline contract fixtures (committed in R1).
- ❌ Public tracking happy path has not been verified live.
- ❌ Enterprise assignment / document / review flows have not been verified live.
- ❌ Admin override of `check-subscription` has not been verified live.
- ❌ Bucket has not been refreshed with the R3 corpus (still serves the policy-incorrect 12 SBC-201 round-2 chunks).

### Ready for enterprise customer onboarding?
**Not yet.** Onboarding requires the live B/C/D smoke to actually pass. Code audit says it should; live confirmation is still missing.

### Ready for broad SBC accuracy claims?
**No.**
- Chunks-file completion: 65.1%.
- Ledger strict completion: 42.4%.
- 91 sections are entirely missing from the corpus.
- 37 round-2 sections need human review before promotion.
- 63 sections are quarantined (verification failed).

The honest claim ceiling is: "Saudi Building Code 201 + 801 with **65% of ledger sections** indexed; **42% of ledger sections at full canonical authority**; remaining sections under review."

### What claims are forbidden right now?

- ❌ "Production complete" — live smoke is partial.
- ❌ "Brain complete" — 191 gaps remain.
- ❌ "93% canonical" — never supported by the data.
- ❌ "100% SBC coverage" — false.
- ❌ "Round-2 reviewed" — round-2 was specifically held back.
- ❌ "All routes tested" — B/C/D/E.1.2-3 BLOCKED_NO_USER_JWT.

What CAN be claimed truthfully:
- ✅ "The Advisory Brain runs on a stabilized Phase 3A baseline with offline contract tests."
- ✅ "Public tracking endpoint enforces strict allow-list and 404-on-everything-bad — verified live for failure modes."
- ✅ "Authenticated edge functions reject anon-only and no-auth requests — verified live."
- ✅ "65% of SBC ledger sections are present in the served chunks file; 42% are at full canonical authority."
- ✅ "Round-2 promotion is policy-gated; 37 sections are held back pending human review."

---

## 5. Next 3 tasks (only)

1. **Operator runs the full live smoke plan** at [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md) — sections B, C, D, and E.1.2–E.3. This requires an admin browser session and at least one test org with members of each role. Highest-leverage outstanding work; no autonomous-session shortcut available.

2. **Bucket refresh: upload the R3 corpus** (`generated/consultx_brain_full/chunks/SBC{201,801}_canonical_chunks.json`) to `ssss/brain_full_v1/`. This is a manual, deliberate operator action. It is the **only** path to make the policy-correct removal of the 12 SBC-201 round-2 chunks effective in production. Until this happens, retrieval still serves the May-1 corpus.

3. **Round-2 SME review pass** — process the 37 held-back round-2 `.md` files (14 SBC-201 + 23 SBC-801). For each: read the extracted markdown against the source PDF page range, decide pass/edit/reject. Update the `.meta.json` `requires_review` field to `false` for those that pass. The next build script run will then admit them automatically. Multi-session SME work; not a single-session task.

These three are the only items left that meaningfully advance closeout. Everything else (Phase 3B v2 corpus, `fire-safety-chat-v2` deletion decision, `accepted_with_notes` feature, ~91 never-extracted SBC-801 specialty chapters) is below this threshold.
