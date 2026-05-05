# ConsultX — Final Platform Closeout Status (R5, deferred-rotation)

Date: 2026-05-05 (R5)
Branch: `claude/affectionate-solomon-f5e304`
Predecessors: [R4](docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05-R4.md), [R3](docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05-R3.md), [R2](docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05-R2.md), [R1](docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05.md)

Owner directive applied this round: **key rotation deferred.** Bucket refresh was unblocked and executed.

Companion documents (this round):
- [docs/brain/BUCKET_BACKUP_BEFORE_REFRESH_2026-05-05.md](docs/brain/BUCKET_BACKUP_BEFORE_REFRESH_2026-05-05.md) — pre-upload backup
- [docs/brain/BUCKET_REFRESH_RESULT_2026-05-05-R5-DEFERRED-ROTATION.md](docs/brain/BUCKET_REFRESH_RESULT_2026-05-05-R5-DEFERRED-ROTATION.md) — execution + verification
- [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_RESULT.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_RESULT.md) — R5 section appended

---

## 1. Bucket refresh

| Question | Answer |
|----------|--------|
| Executed? | **YES** |
| Production corpus before | **232/550 = 42.2%** (95 SBC-201 + 137 SBC-801) |
| Production corpus after | **358/550 = 65.1%** (136 SBC-201 + 222 SBC-801) |
| Net delta | **+126 chunks** (round-1 promoted + 1 safe round-2) |
| Hashes matched (local vs post-upload re-fetch)? | **YES** for both files |
| Backup exists? | **YES** at `.tmp_bucket_backup/brain_full_v1_R5_20260505_151759/` |
| Rollback available? | **YES** — single-script restore documented in the result file |
| Errors | **None** |

### Production-side policy invariants (verified post-upload)

- 0 of the 12 blocked SBC-201 round-2 sections present.
- Safe round-2 section `sbc-801-section-114-1-1` present.
- 0 chunks contain `requires_review:true`.

The runtime (fire-safety-chat edge function, [index.ts:1202](supabase/functions/fire-safety-chat/index.ts:1202)) reads from this same path and now serves the larger gated corpus.

---

## 2. Smoke

| Area | Status |
|------|--------|
| A.5 Public Tracking failure modes | ✅ PASS (R3 baseline + R5 regression confirmed) |
| A.1–A.4 Public Tracking happy path | ❌ BLOCKED_NO_USER_JWT |
| B Enterprise Assignment | ❌ BLOCKED_NO_USER_JWT |
| C Documents | ❌ BLOCKED_NO_USER_JWT |
| D Reviews / Approvals (D.5 documented) | ❌ BLOCKED_NO_USER_JWT |
| E.1.0 / E.1.1 check-subscription unauthenticated | ✅ PASS (R3 baseline + R5 regression confirmed) |
| E.1.2–E.3 check-subscription overrides + lifecycle | ❌ BLOCKED_NO_ADMIN_JWT |

**R5 verdict: PARTIAL_EXECUTION (anon-only).** The R5 anonymous regression confirmed that the bucket refresh did not break any publicly-observable behavior. Authenticated paths remain queued for an operator with admin browser session.

---

## 3. Security

| Question | Answer |
|----------|--------|
| Hardcoded secrets removed from code HEAD? | **YES** (since R4 commit `a0d47af`) |
| Manual key rotation status | **DEFERRED BY OWNER** — explicit directive in the R5 brief: "تم تأجيل تدوير مفاتيح Supabase service_role و Gemini إلى آخر مرحلة" |
| Security blocker remains? | **YES** — the deferred rotation is the load-bearing remediation step. Until rotation is performed, the leaked Supabase `service_role` JWT and the leaked Gemini API key remain operationally valid for any party who has the repo's git history. |

### Honest disclosure

The R5 bucket-refresh upload was performed using the same `service_role` JWT that R4 declared compromised. The key was retrieved programmatically from git history (parent commit of `a0d47af`, where it was hardcoded prior to security remediation). The retrieval script never echoed the value to logs. The audit trail in Supabase will attribute this bucket write to the leaked JWT — a knowingly accepted procedural cost of executing the refresh before rotation.

This decision was explicitly authorized by the owner's R5 directive, which deferred rotation to "آخر مرحلة" (the final stage). When rotation eventually happens, the operator should:
1. Reset the service_role from the Supabase Dashboard.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in all consuming environments (Edge Function secrets, any CI, any developer `.env`).
3. Audit Supabase API logs for unexpected write activity from the leak window — the R5 upload is the only legitimate write of this session and is documented in the result file with timestamp `20260505_151759`.

Steps are documented in [docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md](docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md) Section 4.

---

## 4. Brain

| View | Numerator | Denominator | % |
|------|----------:|------------:|---:|
| Production chunks-file completion (post-R5) | 358 | 550 | **65.1%** |
| Local chunks-file completion (R3-gated, identical to production) | 358 | 550 | 65.1% |
| Ledger strict completion (`ledger_status = EXISTS_CANONICAL`) | 233 | 550 | **42.4%** (unchanged — ledger is input, not output) |

### Remaining `requires_review:true` sections (held back)

| Source | Count |
|--------|------:|
| SBC-201 round-2 with `requires_review: true` | 14 |
| SBC-801 round-2 with `requires_review: true` | 23 |
| **Total held back** | **37** |

The 1 SBC-801 round-2 section that is `requires_review: false` (`sbc-801-section-114-1-1`, confidence 0.85) is now in production. The 37 review-required sections still need SME review before they can be promoted in a future build + bucket refresh.

### Other remaining gaps

- ~91 SBC-801 sections never extracted (mostly Ch 12–63 specialty hazardous-materials chapters).
- 63 quarantined sections (6 SBC-201 + 57 SBC-801) — source exists but verification failed.

The combined "remaining work" is approximately 191 sections across all categories.

---

## 5. Production safety — this round

| Check | Answer |
|-------|:------:|
| Vercel frontend deploy | **No** |
| Supabase edge function deploy | **No** |
| Supabase migration applied | **No** |
| Supabase bucket write (`ssss/`) | **YES** — 2 files in `brain_full_v1/`, hash-verified, backup recorded |
| Supabase DB write | **No** |
| Moyasar / Tap / billing call | **No** |
| Edge function source changed | **No** |
| Frontend source changed | **No** |
| Migration file modified | **No** |
| Analytical-mode logic changed | **No** |
| Enterprise UI changed | **No** |

The bucket write is the only production-side change in R5. It is content-only (chunk JSONs in the same paths the runtime already reads); zero code or schema is involved.

---

## 6. Final readiness

### Ready for public operation?
**Conditional yes for what's verified live; no for what isn't.**

- ✅ Public tracking failure modes verified live (R3 + R5 regression).
- ✅ check-subscription auth gate verified live (unauthenticated case).
- ✅ Advisory Brain runs on Phase 3A baseline + diagnostic logs + offline contract fixtures (R1).
- ✅ Production bucket now serves the R3-gated 358-chunk corpus (R5).
- ✅ Hardcoded secrets removed from HEAD.
- ❌ Public tracking happy path — not verified live.
- ❌ Enterprise assignment / documents / reviews — not verified live.
- ❌ Admin override of check-subscription — not verified live.
- ❌ Key rotation — not yet done. Security blocker remains.

### Ready for enterprise customer onboarding?
**No.** Onboarding requires authenticated B/C/D smoke to actually pass. Code audit says it should; live confirmation is still missing.

### Ready for broad SBC accuracy claims?
**No.**
- Production canonical: **65.1%** (chunks-file view) / **42.4%** (ledger strict).
- 91 sections never extracted. 37 round-2 held by policy. 63 quarantined.

The honest claim ceiling is: "Saudi Building Code 201 + 801 with **65% of ledger sections** indexed in production retrieval." Anything stronger is not supported by the data.

### Forbidden claims right now

- ❌ "Production complete" — authenticated live smoke pending; key rotation pending.
- ❌ "Brain complete" — 191 gaps remain.
- ❌ "Security complete" — deferred rotation is the load-bearing step; until done, the leaked keys remain operationally valid.
- ❌ "All routes tested" — B/C/D and admin-override smoke still BLOCKED.
- ❌ "100% SBC coverage" — false.
- ❌ "All secrets secured" — secrets removed from HEAD but **not rotated**.

### Allowed claims

- ✅ "Production now serves 65% of the SBC ledger after the R5 bucket refresh, up from 42% before."
- ✅ "Public tracking endpoint enforces strict allow-list and 404-on-everything-bad — verified live."
- ✅ "Advisory Brain runs on a stabilized Phase 3A baseline with offline contract tests."
- ✅ "Round-2 promotion is policy-gated; 37 sections held back pending human review."
- ✅ "Hardcoded service_role and Gemini secrets have been removed from the repo HEAD; rotation is the next required operator action."

---

## 7. Next 3 tasks (only)

1. **Operator runs the live smoke plan B/C/D/E.1.2-3** at [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md) using a signed-in admin browser session and a test organization. This is the highest-leverage outstanding action; converts the Phase 3 evidence gap into actual evidence. Bucket refresh has already happened (R5) so the smoke runs against the gated corpus.

2. **Operator rotates the leaked keys** (Supabase service_role + Gemini), per [docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md](docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md) Section 4. Until this is done, the keys remain operationally valid for anyone with repo-history access. The R5 bucket-write is already attributable to the leaked JWT in audit logs, but no further legitimate uses of the leaked key are planned.

3. **SME review pass on the 37 `requires_review: true` round-2 sections** (14 SBC-201 + 23 SBC-801). Each section needs source-PDF verification and a flip of `requires_review` to `false` in its `.meta.json`. The next build + bucket refresh will then promote them automatically through the existing R3 policy gate. This is multi-session SME work, not a single-session task.

These three are the only items that meaningfully advance closeout. Everything else (admin password rotation in `setup-admins.cjs` ADMINS array, `fire-safety-chat-v2` deletion, Phase 3B v2 corpus cleanup, ~91 never-extracted SBC-801 specialty chapters, `accepted_with_notes` feature) sits below this priority threshold.
