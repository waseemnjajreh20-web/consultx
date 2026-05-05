# Advisory Post-R5 Smoke — Result

Date: 2026-05-05 (R6)
Companion plan: [docs/advisory/ADVISORY_POST_R5_TEST_MATRIX.md](docs/advisory/ADVISORY_POST_R5_TEST_MATRIX.md)
Companion runtime audit: [docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md](docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md)

---

## Status: BLOCKED_NO_USER_SESSION

The `fire-safety-chat` edge function **requires a real user JWT** — anon-only authentication is correctly rejected. Verified live in this session:

```
POST https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat
  Authorization: Bearer <anon JWT>
  Body: {"messages":[{"role":"user","content":"السلام عليكم"}],"mode":"standard","language":"ar"}

→ HTTP 401
→ {"error":"Invalid session, please login again"}
```

This is the correct security behavior. Anon JWTs (which any browser visitor holds) cannot drive Advisory queries. Each Advisory call must be made by a signed-in user, whose own JWT carries an identifiable `auth.uid()`.

### Credential audit (no values printed)

| Capability | Available in this session? |
|------------|:--------------------------:|
| Admin user JWT (`waseemnjajreh20@gmail.com` etc.) | ❌ |
| Test user JWT | ❌ — `SMOKE_USER`, `TEST_USER_JWT`, `ADMIN_JWT` env vars: not set |
| Browser session at `https://www.consultx.app` | ❌ |
| Supabase CLI session | ❌ |

Per the user's R6 brief:
> "إذا تحتاج user JWT أو session غير متاحة: اكتب BLOCKED_NO_USER_SESSION ولا تزور session."
> "لا تستخدم service_role لتزوير user smoke."

The brief explicitly forbids using the leaked `service_role` key (which is reachable from git history) to forge a user smoke. That forbid was respected; no Advisory call was attempted with `service_role` credentials.

---

## What WAS verified live in R6

Two anonymous-safe checks were re-run to confirm no regression after R5:

| Test | Result | Note |
|------|--------|------|
| `POST get-public-case-tracking {"token":"badtoken1234567890"}` | **HTTP 404 + `{"error":"Not found"}`** | Same as R3/R4/R5 baseline. Public tracking failure mode unchanged. |
| `POST check-subscription` (no auth) | **HTTP 401 + `{"error":"Unauthorized"}`** | Same as baseline. |
| `POST fire-safety-chat` (anon JWT only) | **HTTP 401 + `{"error":"Invalid session, please login again"}`** | New evidence — confirms the function gates correctly on user JWT, not just bearer presence. |

The Advisory endpoint's auth gate works. Beyond that, the actual content/quality of Advisory responses cannot be verified without a user session.

---

## Result table

For each test in the matrix:

| # | Test | Executed? | Result | Retrieval family | Citation correctness | Main issue found | Fix needed? |
|---|------|:---------:|:------:|------------------|----------------------|------------------|-------------|
| A | Greeting (`السلام عليكم`) | ❌ | BLOCKED_NO_USER_SESSION | n/a | n/a | n/a | n/a |
| B | SBC-201 mercantile occupancy | ❌ | BLOCKED_NO_USER_SESSION | n/a | n/a | n/a | n/a |
| C | SBC-201 Table 1004.5 | ❌ | BLOCKED_NO_USER_SESSION | n/a | n/a | n/a | n/a |
| D | SBC-801 fire alarm | ❌ | BLOCKED_NO_USER_SESSION | n/a | n/a | n/a | n/a |
| E | SBC-801 sprinkler | ❌ | BLOCKED_NO_USER_SESSION | n/a | n/a | n/a | n/a |
| F | Fire pump / water supply | ❌ | BLOCKED_NO_USER_SESSION | n/a | n/a | n/a | n/a |
| G | Missing evidence (Section 6304.2.1.1) | ❌ | BLOCKED_NO_USER_SESSION | n/a | n/a | n/a | n/a |

---

## What can be done without a user session

The following deterministic checks **don't need a user JWT** and can be exercised offline:

1. **Intent classifier contract** — already covered by [evals/advisory/intent_gate_fixtures.test.ts](evals/advisory/intent_gate_fixtures.test.ts) (11/11 PASS, R1).
2. **V1 sidecar trigger regex** — same fixture file, same pass result.
3. **Bucket-root file inventory** — 21 chunk files at the bucket root, 5 files in `brain_full_v1/` (R5-refreshed), 6 files in `brain_full_v3/` (orphan). Verified via anon list API in [docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md](docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md).
4. **Edge function auth gate** — confirmed live (above).

What requires a user session:

1. The actual model response for any of A–G.
2. The Citation Verifier output (since it post-processes the streamed response).
3. The Evidence Ledger contents per query (logged to function stderr, not visible to anon).
4. Latency / streaming behavior.

---

## Recommendation

The full Advisory smoke is the highest-leverage outstanding action. It is the only path to confirm whether the runtime currently:

- Routes SBC-201 questions to SBC-201 citations (vs cross-leaking to SBC-801).
- Surfaces Table 1004.5 via the structured-table path (vs falling back to keyword-only retrieval).
- Distinguishes alarm vs sprinkler thresholds (vs conflating them).
- Honors the diagnostic protocol on missing-evidence queries (vs hallucinating section text).
- Behaves the same on triggered vs non-triggered queries after R5 (sanity check that the V1 sidecar refresh didn't introduce regressions).

This work needs:
- A signed-in user JWT (any of the `ADMIN_EMAILS` users from `check-subscription/index.ts:13`, or any test user with an active subscription).
- A way to invoke the function (curl with `Authorization: Bearer <user-jwt>`).
- A way to capture and review the SSE stream output + the `X-SBC-Sources` / `X-SBC-Source-Meta` response headers.

The runbook at [docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md](docs/qa/LIVE_PRODUCTION_SMOKE_TEST_PLAN.md) covers how to obtain such a JWT and run the smoke suite. This Advisory matrix should be appended to that runbook for the next operator session.

## Notes for Task 4 (root cause classification)

Without live smoke evidence, root-cause classification can only operate on:

1. The runtime audit (Task 1) — what the code actually does.
2. The fixture results (R1) — deterministic gates pass.
3. The bucket inventory — what the runtime can read.

That allows classifying *latent* / *suspected* / *not-issues*, but no *confirmed* runtime issue can be reported because no live response was observed in this session.
