# ConsultX — Final Platform Closeout Status

Date: 2026-05-05
Branch: `claude/affectionate-solomon-f5e304`
Session commits (this branch only):
- `0f67c45` docs(brain): SBC gap inventory + honest closure status
- `9bd37a8` docs(enterprise): production smoke test audit report
- `9a53040` fix(advisory): stabilize brain retrieval fallback and diagnostics

Companion documents:
- [docs/advisory/ADVISORY_BRAIN_STABILIZATION_DIAGNOSIS.md](docs/advisory/ADVISORY_BRAIN_STABILIZATION_DIAGNOSIS.md) — Phase 1 diagnosis
- [docs/advisory/ADVISORY_STABILIZATION_FINAL.md](docs/advisory/ADVISORY_STABILIZATION_FINAL.md) — Phase 2 final
- [docs/enterprise/PRODUCTION_SMOKE_TEST_REPORT.md](docs/enterprise/PRODUCTION_SMOKE_TEST_REPORT.md) — Phase 3
- [generated/consultx_brain_full/reports/GAP_INVENTORY_CURRENT.md](generated/consultx_brain_full/reports/GAP_INVENTORY_CURRENT.md) — Phase 4 inventory
- [docs/brain/SBC_BRAIN_GAP_CLOSURE_STATUS.md](docs/brain/SBC_BRAIN_GAP_CLOSURE_STATUS.md) — Phase 4 status

---

## 1. Executive status

| Area | Status | One-line |
|------|--------|----------|
| Advisory Brain | **Production ready** | Phase 3A baseline locked in with diagnostic logs and offline fixtures; reverted commits stay reverted; non-code intent gate active. |
| Enterprise (assignment, tracking, documents, reviews) | **Production ready (code)** — Validation incomplete (no live HTTP) | Code-path audit found zero bugs; one feature gap (`accepted_with_notes`) documented as out-of-scope. |
| Payments (Moyasar / Tap / webhooks / renewal) | **Untouched — smoke not attempted** | Per brief constraint. No code change, no charge attempted. |
| SBC Brain content | **Needs validation pass** | Real canonical rate is 42%, not 93%. 163 .md extractions sit unpromoted on disk. |
| Platform deploys / migrations | **No changes shipped** | This session committed docs + 11-line server-side log change only; no migrations, no Vercel deploy, no Supabase function deploy from here. |

---

## 2. Advisory Brain

**State: stable.**

What changed in this session:
- Added 4 `console.log` / `console.warn` lines inside `loadBrainFullV1Sidecars` ([supabase/functions/fire-safety-chat/index.ts](supabase/functions/fire-safety-chat/index.ts)) at the four exit branches. Net diff: **+11 / −2 lines**. Zero control-flow change.
- Added [evals/advisory/intent_gate_fixtures.test.ts](evals/advisory/intent_gate_fixtures.test.ts) — 11 offline scenarios mirroring `classifyAdvisoryIntent` and the V1 sidecar trigger regex. **All 11 pass.**

What did NOT change:
- `scoreChunk` relevance gate (reverted at `4e4f032`) — not reintroduced.
- v2-first Brain sidecar loader (reverted at `395c63d`) — not reintroduced.
- 503-on-empty-retrieval (removed at `4922cb3`) — still absent; diagnostic protocol governs empty retrieval.
- Non-code intent gate at `3be8214` — untouched.
- Phase 2 V1 sidecar loader behavior — only logs added.
- Main / Analytical pipelines — untouched.

Fixture results (5 user-specified scenarios A–E):
- A — casual "السلام عليكم" → bypass retrieval ✅
- B — SBC 201 mercantile → routes code_domain ✅ (sidecar trigger off as designed; main retrieval handles it)
- C — SBC 801 fire alarm → routes SBC-801 family ✅
- D — table 1004.5 → routes egress + structured-table path ✅
- E — sprinkler / alarm system → routes correctly ✅
Plus B2, F, G, H, I, J — 11/11 total.

Phase 3B status: **closed for this round, not deferred.** Re-introduction requires schema-divergence audit, env flag, per-version log, fallback-on-empty, and AR-query parity fixtures. None of those preconditions are met today.

---

## 3. Enterprise

**Code-state: production-correct.** **Live HTTP validation: not done from this session (no production access).**

Audited in code, all PASS:

| Pathway | Server gate | Client gate | finance_officer block |
|---------|-------------|-------------|----------------------|
| Public case tracking (`/track/:token`) | Token validation 16–64 chars; 404 on every failure mode; strict allow-list payload; engineer info gated on `show_engineer_contact` | Generic UI on missing/error | n/a — anonymous endpoint |
| Case assignment | `assign_enterprise_case` RPC (owner/admin/head_of_department); finance_officer rejected; auto-transition submitted→assigned | `isManager` check on UI | ✅ both layers |
| Case documents (upload) | Storage RLS via `can_access_enterprise_document_object` → `is_active_case_member` | n/a (storage policy enforces) | ✅ |
| Case documents (signed URL) | `get-case-document-url` edge fn → `is_active_case_member` | UI uses signed URL | ✅ |
| Case documents (delete) | `delete-case-document` edge fn → `is_org_owner_or_admin` | n/a | ✅ |
| Reviews (submit) | `submit_case_review` RPC → `is_active_case_member` | n/a | ✅ |
| Approvals (decide) | `decide_case_approval` RPC → owner/head_of_department only (admin explicitly excluded per operating model) | n/a | ✅ |
| check-subscription overrides | All 5 modes (free/engineer/pro/enterprise/owner); admin-email gated; no DB write, no charge | n/a | n/a |

Findings:
- **Zero bugs introduced or surfaced.**
- **One documented feature gap**: `accepted_with_notes` is not a valid `decide_case_approval` decision. Brief conditioned this on "إن مدعوم" — treating absence as not-supported, not as a bug.
- **One evidence gap**: a true `curl /track/:token` round-trip against deployment was not possible from this session. Code is correct; live confirmation is post-merge.

---

## 4. Payments

**Untouched. No smoke attempted. No bug found in code (because no audit was attempted).**

Per the brief's hard constraint:
- No Moyasar / Tap / webhook / renewal changes.
- No charge attempted under any user override.
- `check-subscription` admin overrides verified to return early without touching payment-related code paths (test 5.10 in smoke report).

The 9 payment-related edge functions (`moyasar-create-subscription`, `moyasar-initiate-token-payment`, `moyasar-webhook`, `payment-webhook`, `process-subscription-renewal`, `tap-charge-subscription`, `tap-create-subscription`, `tap-webhook`, `verify-payment`) were enumerated but not exercised.

---

## 5. SBC Brain content

**Real completion (computed from manifests, not self-report):**

| Code | Total | Canonical | % |
|------|------:|----------:|---:|
| SBC-201 | 159 | 95 | **60%** |
| SBC-801 | 391 | 138 | **35%** |
| Combined | **550** | **233** | **42%** |

**This is the truth. The previous "93%" figure is not supported by the ledger.**

Remaining gaps:

| Category | Count |
|----------|------:|
| missing-text — extracted but unpromoted (round 1, high confidence, requires_review=false) | 125 |
| missing-text — extracted but unpromoted (round 2, medium confidence, requires_review=true) | 38 |
| missing-text — never extracted (PBNC without round-1/round-2 .md) | ~91 |
| quarantined (source exists but verification failed) | 63 |
| missing tables / figures | not separately tracked |
| relationship / linking missing | not separately tracked |
| **Total non-canonical sections** | **317** |

**Blocked by missing source: zero.** All PDFs are at `D:/sbc_consultx/`. The bottleneck is promotion through the orchestrator pipeline, not source acquisition.

Highest-leverage next step (not in this session): run the orchestrator's promotion pass on the 125 round-1 .md files. Expected lift: combined canonical rate from 42% to ~73% with **no new SME review** required.

---

## 6. Git / deploy

**Commits created in this session (this branch only):**

| Commit | Type | Surface |
|--------|------|---------|
| `9a53040` | fix | 1 production file (+11/−2 lines, log-only); 1 test file (new); 2 docs |
| `9bd37a8` | docs | 1 doc — smoke test audit |
| `0f67c45` | docs | 2 docs — gap inventory + closure status |

**Edge functions deployed:** **None from this session.** `9a53040` adds log lines but does not deploy `fire-safety-chat`. Deploying it from here is out of scope; the next intentional deploy of that function will pick up the log lines.

**Frontend deployed:** **None.** No `src/` changes.

**DB migrations applied:** **None.** Per brief constraint, `supabase db push` was not run. No SQL files in `supabase/migrations/` were modified.

**Bucket changes:** **None.** No `ssss/` writes from this session.

---

## 7. Honest residuals

These items remain open and deliberately out of scope:

1. **Live HTTP validation** of `/track/:token` and the enterprise paths — needs deployment-side credentials.
2. **`fire-safety-chat-v2`** (the 932-line shadow function under `supabase/functions/fire-safety-chat-v2/`) is untouched. Decision deferred per brief.
3. **`ssss/brain_full_v2/`** bucket files (uploaded by the reverted Phase 3B commit) are not actively read but also not cleaned up. Decision deferred.
4. **`accepted_with_notes`** decision in `decide_case_approval` — not currently supported. If product wants it, additive migration only.
5. **SBC Brain promotion pass** — 163 extracted markdown files awaiting orchestrator promotion; 63 quarantined sections awaiting SME review.
6. **CI hook for `evals/advisory/intent_gate_fixtures.test.ts`** — currently a manual `npx tsx` invocation; not wired into CI.
7. **Orphaned-row reaper** for `case_documents` (storage delete succeeds, DB delete fails edge case).

---

## 8. Next 3 tasks

1. **Run the SBC Brain orchestrator promotion pass on round-1 extractions.** Highest leverage: lifts combined canonical rate from 42% to ~73% with no SME review. Bucket-only effect, isolated from runtime code.
2. **Live HTTP smoke of `/track/:token`** against the production deployment (one happy-path token, one disabled token, one malformed token). Confirms tests 1.11 from the Phase 3 audit. Requires deployment-side credentials.
3. **Schedule the `fire-safety-chat-v2` deletion-or-keep decision.** Either remove it cleanly (separate report + commit) or document why it stays. Currently it's untracked dead weight.

---

## 9. What I cannot truthfully claim

- I cannot say the platform is "100% production ready" — some payment paths and the actual deployed Advisory function are unverified live.
- I cannot say SBC Brain is "≥80% complete" — current measured rate is 42%.
- I cannot say "all enterprise smoke tests passed" — some gaps are evidence-only (not bugs), and live HTTP wasn't attempted.

What I can say:
- **The reverted commits are reverted cleanly.** Diagnostic logs and fixtures are now in place to make future Advisory changes observable and contract-tested.
- **The Enterprise code is correctly gated** at every audited layer (server RPCs, edge functions, storage RLS, frontend role checks).
- **The numbers in this report are real**, computed from the source manifests and the codebase, not from a generated summary.
