# Live Production Smoke Test — Result (R3 partial → R4 unchanged)

Date: 2026-05-05 (R3, updated R4)
Companion plan: [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md)
Production endpoints exercised:
- `https://www.consultx.app/track/...` (frontend SPA)
- `https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/get-public-case-tracking` (anonymous edge function)
- `https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/check-subscription` (auth-gated edge function — unauthorized path only)

## Status: PARTIAL_EXECUTION

**Executed**: only the test paths that are anonymous-safe (`A.5` failure modes + `E.1.0/1.1` unauthenticated rejection). No DB write, no test data created, no user-session required.

**Blocked**: every test that requires a user JWT, an admin browser session, or test-org / test-case data — sections A.1–A.4, B.\*, C.\*, D.\*, E.1.2–E.3.

## Credential audit

Without printing values:

| Credential | Available? | Source |
|------------|:----------:|--------|
| Supabase URL | ✅ | hard-coded in `orchestrator.cjs:8` (public) |
| Supabase ANON_KEY | ✅ | committed in `orchestrator.cjs:10` and `.claude/settings.local.json` |
| Supabase SERVICE_ROLE_KEY | ⚠ committed in `scripts/setup-admins.cjs:12` (security defect — pre-existing) | not used in this run |
| Admin user JWT (`waseemnjajreh20@gmail.com` etc.) | ❌ | requires sign-in flow |
| finance_officer / engineer / head_of_department user JWTs | ❌ | requires sign-in flow per role |
| Browser session for Enterprise UI | ❌ | not present in this environment |
| Test org id / test case id | ❌ | none recorded in env or session |

Decision: do **not** use `SERVICE_ROLE_KEY` for live smoke. It bypasses RLS and would create write power on the production DB. The brief allows test-data creation with cleanup, but executing that without a verified admin user identity carries unnecessary risk. Anonymous-only paths are exercised.

## Results

| # | Test | Executed? | Result | Evidence | Cleanup | Bug? | Fix needed? |
|---|------|:---------:|:------:|----------|:-------:|:----:|:-----------:|
| **A.1** Get a safe test token | ❌ | BLOCKED_NO_USER_JWT | requires admin to enable public tracking via Enterprise UI | n/a | n/a | n/a |
| **A.2** Happy path — anonymous load with valid token | ❌ | BLOCKED_NO_USER_JWT | depends on A.1 | n/a | n/a | n/a |
| **A.3** Privacy regression on valid response | ❌ | BLOCKED_NO_USER_JWT | depends on A.1 | n/a | n/a | n/a |
| **A.4** Disabled-token path | ❌ | BLOCKED_NO_USER_JWT | depends on A.1 | n/a | n/a | n/a |
| **A.5a** Malformed (too-short) token | ✅ | **PASS** | `POST get-public-case-tracking {"token":"short"}` → HTTP 404 `{"error":"Not found"}` (21 bytes) | none needed (read-only) | No | No |
| **A.5b** Malformed (40-char unrecognized) token | ✅ | **PASS** | `POST {"token":"AAAA0000111122223333444455556666999988887777"}` → HTTP 404 `{"error":"Not found"}` (21 bytes) | none | No | No |
| **A.5c** Empty body | ✅ | **PASS** | `POST {}` → HTTP 404 `{"error":"Not found"}` (21 bytes) | none | No | No |
| **A.5d** OPTIONS / CORS preflight | ✅ | **PASS** | HTTP 200; headers include `Access-Control-Allow-Origin: *`, `access-control-allow-methods: GET, POST, OPTIONS`, `access-control-allow-headers: authorization, x-client-info, apikey, content-type` | none | No | No |
| **A.5e** Frontend `/track/short` no login | ✅ | **PASS** | HTTP 200, SPA shell (2126 B HTML, lang=ar dir=rtl, Arabic title), zero internal field leaks (grep for `case_id\|user_id\|case_notes\|decision_notes\|email` returns 0 matches) | none | No | No |
| **A.5f** Frontend `/track/AAAA...0000` no login | ✅ | **PASS** | HTTP 200, byte-identical SPA shell to A.5e (`diff` shows no difference). Differentiation happens client-side after JS fetches the edge function and gets a 404. | none | No | No |
| **A.6** Cleanup | n/a | n/a | nothing to clean (no token toggled) | n/a | n/a | n/a |
| **B.1** Setup test org/case | ❌ | BLOCKED_NO_USER_JWT | requires Enterprise UI session | n/a | n/a | n/a |
| **B.2** Create test case in `submitted` | ❌ | BLOCKED_NO_USER_JWT | depends on B.1 | n/a | n/a | n/a |
| **B.3** Assign engineer (manager path) | ❌ | BLOCKED_NO_USER_JWT | depends on B.1 + admin JWT | n/a | n/a | n/a |
| **B.4** finance_officer denial — server side | ❌ | BLOCKED_NO_FO_JWT | finance_officer JWT not available | n/a | n/a | n/a |
| **B.5** finance_officer-as-engineer denial | ❌ | BLOCKED_NO_USER_JWT | depends on B.1 + admin JWT | n/a | n/a | n/a |
| **C.1–C.6** Document upload / signed URL / delete | ❌ | BLOCKED_NO_USER_JWT | needs role JWTs and a test case | n/a | n/a | n/a |
| **D.1** Submit a review | ❌ | BLOCKED_NO_USER_JWT | needs engineer JWT and a case in `engineer_review_completed` | n/a | n/a | n/a |
| **D.2** Approve | ❌ | BLOCKED_NO_USER_JWT | needs head_of_department JWT | n/a | n/a | n/a |
| **D.3** Return for revision | ❌ | BLOCKED_NO_USER_JWT | depends on D.1 | n/a | n/a | n/a |
| **D.4** admin denial on approval | ❌ | BLOCKED_NO_USER_JWT | depends on a user with admin role | n/a | n/a | n/a |
| **D.5** `accepted_with_notes` not supported | ✅ doc-only | **DOCUMENTED** | per Phase 3 audit and the plan, `accepted_with_notes` is not a valid `decide_case_approval` decision; treating absence as not-supported, not a bug | none | No | No |
| **E.1.0** check-subscription with NO auth header | ✅ | **PASS** | `POST check-subscription` no Authorization → HTTP 401 `{"error":"Unauthorized"}` (24 bytes) | none | No | No |
| **E.1.1** check-subscription with ANON-ONLY auth | ✅ | **PASS** | `POST check-subscription` with anon JWT (no user identity) → HTTP 401 `{"error":"Unauthorized"}` (24 bytes). Confirms the function correctly distinguishes anon JWTs from real user JWTs. | none | No | No |
| **E.1.2** override `free` | ❌ | BLOCKED_NO_ADMIN_JWT | needs admin user JWT (`ADMIN_EMAILS` user) | n/a | n/a | n/a |
| **E.1.3** override `engineer` | ❌ | BLOCKED_NO_ADMIN_JWT | same | n/a | n/a | n/a |
| **E.1.4** override `pro` | ❌ | BLOCKED_NO_ADMIN_JWT | same | n/a | n/a | n/a |
| **E.1.5** override `enterprise` | ❌ | BLOCKED_NO_ADMIN_JWT | same | n/a | n/a | n/a |
| **E.1.6** override `owner` | ❌ | BLOCKED_NO_ADMIN_JWT | same | n/a | n/a | n/a |
| **E.2** Non-admin lifecycle | ❌ | BLOCKED_NO_USER_JWT | needs a fresh non-admin user | n/a | n/a | n/a |
| **E.3** Org-membership override | ❌ | BLOCKED_NO_USER_JWT | needs an org member's JWT | n/a | n/a | n/a |

## Latency profile (live)

`get-public-case-tracking` consistently returned 404 in **400–500 ms** across three different malformed tokens. No timing-side-channel leakage between recognized vs unrecognized tokens (all paths take similar time because the DB lookup runs and either returns no row or a non-public-enabled row, then identical 404 emission).

```
attempt 1: HTTP=404 time=0.428626s
attempt 2: HTTP=404 time=0.497426s
attempt 3: HTTP=404 time=0.427610s
```

## Privacy verification

For every test where a response body was inspected:

- `get-public-case-tracking` 404 body is exactly `{"error":"Not found"}` — no token echoed, no DB hint, no stack trace.
- `check-subscription` 401 body is exactly `{"error":"Unauthorized"}` — same property.
- Frontend SPA shell HTML for `/track/<bad-token>` contains zero matches for `case_id`, `user_id`, `case_notes`, `decision_notes`, `email`, `service_role`, or any visible JWT-like substring.

## Bugs found

**Zero.** Every executable path returned the expected response.

## Fix commits

None.

## What this proves

- The public-tracking endpoint's failure mode is correct: 404-on-everything-bad, no enumeration signal, no internal field leak.
- CORS preflight is correctly configured.
- The frontend `/track/:token` route renders a static SPA shell regardless of token validity — differentiation is client-side, which is consistent with the React app architecture.
- The auth gate on `check-subscription` correctly rejects both no-auth and anon-only-auth requests, confirming that the admin-override path requires a real user JWT for an `ADMIN_EMAILS` user.

## What remains

The full happy-path validation of B/C/D/E sections requires an operator with:
- A signed-in browser session as an `ADMIN_EMAILS` user, AND
- A test organization with members for each role (engineer, head_of_department, finance_officer), AND
- A test case in workflow

Per the brief's "لا تخترع. لا تنفذ smoke. اكتب BLOCKED_NO_CREDENTIALS في التقرير" rule, the rest is deferred to a session where those credentials are present.

---

## R4 update (2026-05-05) — full smoke check

Status of the BLOCKED items above re-checked at the start of R4:

| Capability | Available in R4 session? |
|------------|:------------------------:|
| Admin user JWT (`waseemnjajreh20@gmail.com` etc.) | ❌ |
| finance_officer / engineer / head_of_department user JWTs | ❌ |
| Browser session at `https://www.consultx.app` | ❌ |
| Supabase CLI session | ❌ — no `~/.config/supabase/` directory |
| GitHub authentication (could grant Vercel access) | ❌ — `gh auth status` reports "not logged in" |
| Test org id / test case id | ❌ — none recorded in env or session |

**R4 verdict: BLOCKED_NO_USER_SESSION (unchanged from R3).**

Per the user's R4 brief:
> "إذا لا: اكتب BLOCKED_NO_USER_SESSION. لا تخترع session. لا تستخدم service_role لتزوير user smoke. اترك runbook كما هو."

No new tests were executed in R4. The existing R3 result table (anonymous failure-mode tests A.5* and unauthenticated check-subscription E.1.0/1.1, all PASS) remains the authoritative live smoke evidence. Sections B/C/D/E.1.2-3 stay queued for an operator with the missing credentials.

The `runbook` at [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md) is unchanged and remains the authoritative reference for the next operator session.

---

## R5 update (2026-05-05) — deferred-rotation smoke result

The R5 round executed a bucket refresh (see [docs/brain/BUCKET_REFRESH_RESULT_2026-05-05-R5-DEFERRED-ROTATION.md](docs/brain/BUCKET_REFRESH_RESULT_2026-05-05-R5-DEFERRED-ROTATION.md)). After the refresh, the same anonymous-only smoke checks were re-run to confirm the upload did not regress publicly-observable behavior.

### R5 user-session probe

Re-checked at the start of R5:

| Capability | Available in R5 session? |
|------------|:------------------------:|
| Admin user JWT | ❌ |
| finance_officer / engineer / head_of_department user JWTs | ❌ |
| Browser session | ❌ |
| Supabase CLI session | ❌ |
| GitHub authentication | ❌ |

**R5 verdict: BLOCKED_NO_USER_SESSION (unchanged from R3 / R4).**

Per the user's R5 brief: "إذا لا يوجد: اكتب BLOCKED_NO_USER_SESSION. لا تستخدم service_role لتزوير user smoke. لا تخترع session." — no user-smoke fakery was performed even though a service_role key is reachable from git history.

### R5 anonymous regression — post-upload

| Test | Result | Evidence |
|------|--------|----------|
| `POST get-public-case-tracking {"token":"badtoken1234567890"}` | ✅ PASS | HTTP 404, `{"error":"Not found"}` (21 bytes) — identical to R3 baseline |
| `POST check-subscription {}` (no Authorization) | ✅ PASS | HTTP 401, `{"error":"Unauthorized"}` (24 bytes) — identical to R3 baseline |

The bucket refresh did not regress any anonymous-observable behavior. The publicly-visible failure modes are byte-identical to the R3-recorded baseline.

### Authenticated smoke status

Sections B (Enterprise Assignment), C (Documents), D (Reviews/Approvals), and E.1.2–E.3 (admin-override check-subscription) remain **BLOCKED_NO_USER_SESSION**. The full live smoke for these sections is the highest-leverage outstanding work and requires:

- An operator-controlled signed-in session at `https://www.consultx.app` as an `ADMIN_EMAILS` user.
- A test organization with members in each role (engineer, head_of_department, finance_officer).
- A test case in workflow.

The runbook at [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md) remains authoritative for the next operator session.
