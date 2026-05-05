# ConsultX — Final Platform Closeout Status (R4)

Date: 2026-05-05 (R4)
Branch: `claude/affectionate-solomon-f5e304`
Predecessors: [R3](docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05-R3.md), [R2](docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05-R2.md), [R1](docs/FINAL_PLATFORM_CLOSEOUT_STATUS_2026-05-05.md)

Session commits added in this round:
- `a0d47af` chore(security): remove hardcoded service role secret

Companion documents (this round):
- [docs/security/SECRET_EXPOSURE_AUDIT_2026-05-05.md](docs/security/SECRET_EXPOSURE_AUDIT_2026-05-05.md)
- [docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md](docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md)
- [docs/security/ENV_REQUIRED_KEYS.md](docs/security/ENV_REQUIRED_KEYS.md)
- [docs/brain/BUCKET_REFRESH_PLAN_2026-05-05.md](docs/brain/BUCKET_REFRESH_PLAN_2026-05-05.md)
- [docs/brain/BUCKET_REFRESH_RESULT_2026-05-05.md](docs/brain/BUCKET_REFRESH_RESULT_2026-05-05.md)
- [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_RESULT.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_RESULT.md) (R4 section appended)

---

## 1. Security

| Question | Answer |
|----------|--------|
| Hardcoded service_role removed from code? | **YES** — commit `a0d47af` migrates `scripts/setup-admins.cjs` to `process.env.SUPABASE_SERVICE_ROLE_KEY` with fail-fast. |
| Manual key rotation still required? | **YES — REQUIRED**. The leaked value remains in git history and any prior clone of the repo. Removal from HEAD does not invalidate the value. The Supabase service_role key MUST be rotated manually from the Supabase Dashboard. The Gemini API key MUST be rotated from Google Cloud Console. |
| Other secrets found and removed? | **YES** — 3 hardcoded Gemini API key occurrences in `scripts/{list-models,test-gemini,test-embeddings}.{mjs,mjs,mjs}` were also migrated to `process.env.GEMINI_API_KEY`. |
| Secrets remaining in repo (still leaked, not removed)? | **YES, separately flagged**: `scripts/setup-admins.cjs` ADMINS array contains plaintext admin user passwords (lines 19-20). Per the brief's "minimal change" rule, this is a separate task. The two admin passwords also need rotation via the Supabase dashboard. |
| Public-by-design keys flagged? | **YES** — `.claude/settings.local.json`, `orchestrator.cjs` retain anon JWTs, which are publicly safe by Supabase convention. Documented in [docs/security/ENV_REQUIRED_KEYS.md](docs/security/ENV_REQUIRED_KEYS.md). |

Verification (zero values printed in this report):
- Re-scan for service-role-shaped JWTs: only `role=anon` matches remain.
- Re-scan for `AIza...` Gemini key shape: zero matches in any source file.
- All 4 edited scripts pass `node --check` syntax validation.
- Each fails fast with a no-value-printed error when its env var is absent.

---

## 2. Bucket refresh

| Question | Answer |
|----------|--------|
| Executed? | **NO. Status: BLOCKED.** |
| Hashes matched? | n/a — no upload performed |
| Backup exists? | **YES** at `.tmp_bucket_backup/brain_full_v1_20260505_141306/` (2 files, total ~10.7 MB, sha256 recorded) |
| Production now serves the gated corpus? | **NO** — production unchanged; still serves the original Phase 1 V1 corpus (95 + 137 = 232 chunks) |

### Why blocked

Two reasons surfaced during the pre-flight check (both documented in [BUCKET_REFRESH_PLAN_2026-05-05.md](docs/brain/BUCKET_REFRESH_PLAN_2026-05-05.md) Section 8):

1. **Larger delta than the brief expected.** The R4 brief described an upload that would "remove 12 violating chunks + add 1 safe chunk = −11 net". The actual production state was discovered to be **far older** — only 232 chunks (the original Phase 1 V1 sources, not even the May-1 build with round-1 promotions). The local R3-gated corpus has 358 chunks. Uploading would land **net +126 chunks** in production, primarily round-1 extracts that have never been bucketed. This is a substantively different change than the brief described.

2. **Key rotation pending.** The same session declared the leaked service_role key compromised. Performing a bucket write with that compromised key after the declaration creates an attribution mess in audit logs. Clean sequence: rotate first, then upload.

### What is verified-ready

The bucket refresh is **technically ready to execute** the moment an operator opts in:
- Local files: SHA256 recorded, gating verified (0 `requires_review:true` chunks, 0 of 12 blocked sections, 1 safe section present).
- Bucket target paths: confirmed against `supabase/functions/fire-safety-chat/index.ts:1202` (`brain_full_v1/${key}`).
- Backup of current production: secured, hashed, distinct from local files (proves backup is real).
- Rollback plan: re-upload backup files to same paths with the (rotated) service_role key.

---

## 3. Smoke

| Area | Status |
|------|--------|
| A. Public Tracking — failure modes (A.5*) | ✅ PASS (R3) |
| A. Public Tracking — happy path (A.1–A.4) | ❌ BLOCKED_NO_USER_JWT |
| B. Enterprise Assignment | ❌ BLOCKED_NO_USER_JWT |
| C. Documents | ❌ BLOCKED_NO_USER_JWT |
| D. Reviews / Approvals | ❌ BLOCKED_NO_USER_JWT (D.5 documented as not-supported) |
| E. check-subscription unauthenticated (E.1.0/1.1) | ✅ PASS (R3) |
| E. check-subscription overrides (E.1.2–E.3) | ❌ BLOCKED_NO_ADMIN_JWT |

**R4 status: PARTIAL_EXECUTION (unchanged from R3).** No new tests run in R4. No new bugs found. The runbook at [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md) remains the authoritative reference for an operator with the missing credentials.

---

## 4. Brain

| View | Locally committed | Production bucket | Δ if uploaded |
|------|-------------------:|-------------------:|--------------:|
| Chunks-file count | 358 (136 SBC-201 + 222 SBC-801) | **232** (95 + 137) | **+126** |
| Chunks-file view % (of 550 ledger sections) | 65.1% | **42.2%** | +22.9 pp |
| Ledger strict view % (`ledger_status = EXISTS_CANONICAL`) | 42.4% | 42.4% | unchanged (ledger never uploaded) |

### `requires_review` chunks in production

**REMOVED (verified by audit of the downloaded backup): 0 of the 12 blocked SBC-201 round-2 sections are present in production.** Production never had them. The R3 policy gate's "removal" was protective — it kept those chunks out of the LOCAL build that would later be uploaded — but production was already free of them by virtue of being older than the May-1 build that had introduced them.

### Remaining round-2 sections held by policy

| Source | Count | Note |
|--------|------:|------|
| SBC-201 round-2 (`requires_review:true`) | 14 | Need SME review |
| SBC-801 round-2 (`requires_review:true`) | 23 | Need SME review |
| **Total held back** | **37** | Same as R3 |

The 1 SBC-801 round-2 section that is `requires_review:false` (`sbc-801-section-114-1-1`, confidence=0.85) is in the local R3-gated corpus and would be promoted to production on the next bucket refresh.

---

## 5. Production safety

This R4 round:

| Check | Answer |
|-------|:------:|
| Vercel frontend deploy | **No** |
| Supabase edge function deploy | **No** |
| Supabase migration applied | **No** |
| Supabase bucket write (`ssss/`) | **No** |
| Supabase DB write | **No** |
| Moyasar / Tap / billing call | **No** |
| Edge function source changed | **No** |
| Frontend source changed | **No** |

The only file system writes in this round were:
- `scripts/setup-admins.cjs` (security remediation, env-var migration)
- `scripts/list-models.mjs`, `scripts/test-gemini.mjs`, `scripts/test-embeddings.mjs` (same)
- New documentation under `docs/security/` and `docs/brain/`
- The R4 closeout (this file)

No corpus output was rebuilt in R4 — the R3-gated chunks files committed in `686d4e8` are already on disk and used as-is.

---

## 6. Final readiness

### Ready for public operation?
**Conditional yes for what's verified live; no for what isn't.**

- ✅ Public tracking failure modes verified live.
- ✅ check-subscription auth gate verified live for the unauthenticated case.
- ✅ Advisory Brain Phase 3A baseline + diagnostic logs + offline contract fixtures (R1 commit).
- ✅ Hardcoded secrets removed from HEAD (R4 commit), but **operator-side rotation is the load-bearing step** and is still pending.
- ❌ Public tracking happy path — not verified live.
- ❌ Enterprise assignment / documents / reviews — not verified live.
- ❌ Admin override of check-subscription — not verified live.
- ❌ Bucket — still serves the older Phase 1 V1 corpus (232 sections), not the R3-gated 358.

### Ready for enterprise customer onboarding?
**No.** Enterprise onboarding requires the live B/C/D smoke to actually pass. Code audit says it should; live confirmation is still missing.

### Ready for broad SBC accuracy claims?
**No.**
- Production canonical: **42.2%** (232 / 550).
- Locally available canonical (R3-gated): 65.1% (358 / 550).
- 91 sections never extracted. 37 round-2 sections held by policy. 63 quarantined.

The honest claim ceiling for what users currently see: "Saudi Building Code 201 + 801 with **42% of ledger sections** indexed." After a future bucket refresh: **65% of ledger sections** indexed.

### What claims are forbidden right now

- ❌ "Production complete" — live smoke partial; security rotation pending.
- ❌ "Brain complete" — production at 42.2%; 191 gaps remain.
- ❌ "93% canonical" — never supported.
- ❌ "100% SBC coverage" — false.
- ❌ "All secrets secured" — secrets removed from HEAD but **must be rotated** to be truly secured. Rotation hasn't happened.
- ❌ "Round-2 reviewed" — 37 round-2 sections still need human review.
- ❌ "All routes tested" — B/C/D and admin-override smoke remain BLOCKED.

### Allowed claims

- ✅ "Hardcoded service_role and Gemini secrets have been removed from the repo HEAD; manual rotation by the operator is the next required step before they are truly invalidated."
- ✅ "Public tracking endpoint enforces strict allow-list and 404-on-everything-bad — verified live for failure modes."
- ✅ "Advisory Brain runs on a stabilized Phase 3A baseline with offline contract tests."
- ✅ "Round-2 promotion is policy-gated; 37 sections held back pending human review."
- ✅ "Production currently serves 42% of SBC ledger sections; the local R3-gated corpus is at 65% and is ready to upload pending operator opt-in."

---

## 7. Next 3 tasks (only)

1. **Operator rotates the leaked Supabase service_role key and the leaked Gemini API key** from their respective dashboards, then updates the new values in their local `.env`, in any CI / Vercel / Supabase-Edge-Function secret stores, and audits Supabase + Google Cloud logs for the leak window. This is the single most urgent outstanding action; until it is done, the leaked keys remain valid for any party who saw the repo. See [docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md](docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md) Section 4 for exact steps.

2. **Operator decides on the bucket refresh scope and executes it with the rotated key.** The local R3-gated corpus (358 chunks) is ready. The actual production effect of an upload is **+126 chunks**, not the −11 originally described. The operator should opt in to the full +126 promotion or specify a smaller scope; either path is straightforward once decided. See [docs/brain/BUCKET_REFRESH_PLAN_2026-05-05.md](docs/brain/BUCKET_REFRESH_PLAN_2026-05-05.md) Section 8 for the criteria.

3. **Operator runs the live smoke plan B/C/D/E.1.2-3 sections** with admin browser session and test-org credentials. This is the only path to convert the Phase 3 evidence gap into actual evidence. See [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md) for the runbook.

These three are the only items outstanding that meaningfully advance closeout. Everything else (admin password rotation, `fire-safety-chat-v2` deletion decision, Phase 3B v2 corpus cleanup, ~91 never-extracted SBC-801 specialty chapters, `accepted_with_notes` feature) sits below this priority threshold.
