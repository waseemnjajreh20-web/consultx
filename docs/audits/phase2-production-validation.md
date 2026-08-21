# ConsultX — Phase 2 Production Release Validation

**Project:** `hrnltxmwoaphgejckutk`  
**Date:** 2026-08-21  
**Scope:** End-to-end validation of ConsultX as a real user would experience it, from landing to payment and full usage. No Phase 3 work started.

## Release Decision: NO-GO

ConsultX cannot be re-launched publicly until the **RELEASE BLOCKER** below is resolved and the affected flows are re-tested.

---

## 1. Release Blocker

| Area | Status | Evidence | Fix | Remaining risk |
|---|---|---|---|---|
| AI Chat (Main / Advisory / Analytical) | **RELEASE BLOCKER** | Every chat request to `fire-safety-chat` returns `500 Service error: 400`. Deployed debug function confirmed `GOOGLE_GEMINI_API_KEY` exists (length 39) but Gemini API responds `API key not valid. Please pass a valid API key.` | Replace `GOOGLE_GEMINI_API_KEY` in Supabase secrets with a valid AI Studio key, then redeploy `fire-safety-chat`. Re-run P2.3–P2.5, P2.7–P2.9, P2.12. | Until key is replaced, no AI functionality works; all citation/provenance QA is blocked. |

### How the blocker was proven

1. Created a real test user via production Auth API: `njajrehwaseem+consultxphase2test2@gmail.com`.
2. Confirmed email, logged in, and verified session persistence.
3. Called `POST /functions/v1/fire-safety-chat` for `primary`, `standard`, and `analysis` modes.
4. All three returned `500 {"error":"Service error: 400"}`.
5. Deployed a temporary `gemini-debug` function that made the same Gemini API call.
6. Gemini API returned `400 API_KEY_INVALID`.
7. Deployed a second temporary function that confirmed `GOOGLE_GEMINI_API_KEY` is set (length 39).
8. Deleted the temporary functions after testing.

Conclusion: the stored key is present but invalid (revoked, expired, or wrong project).

---

## 2. Area-by-area results

| # | Area | Status | Evidence |
|---|---|---|---|
| 1 | Registration / Authentication | **PASS** | Real signup on production, Resend confirmation email delivered and clicked, login/logout/session refresh verified via Playwright. |
| 2 | Trial / Entitlement | **PASS with finding** | New user gets `user_subscriptions.status = trialing` with 7-day end date; workspace shows all three modes and `6/20` daily messages. `check-subscription` returns `access_state: ineligible` for trialing users because the launch-campaign window (`CAMPAIGN_END = 2026-04-28`) has passed; frontend fallback still treats `status=trialing` as active. |
| 3 | Main Mode | **BLOCKED** | Cannot test response quality; chat fails with 500. |
| 4 | Advisory Mode | **BLOCKED** | Same blocker. |
| 5 | Analytical Mode | **BLOCKED** | Same blocker. |
| 6 | File / Project Workflow | **PARTIAL** | UI workspace visible; upload button present; cannot verify extraction/analysis because analysis depends on `fire-safety-chat`. |
| 7 | Advisory File Analysis | **BLOCKED** | Depends on working AI. |
| 8 | Analytical File Analysis | **BLOCKED** | Depends on working AI. |
| 9 | Citation / Provenance QA | **BLOCKED** | No AI-generated answers to evaluate citations. |
| 10 | Subscription / Moyasar | **NOT TESTED** | No sandbox credentials; core trial works; payment flow not validated. |
| 11 | Authorization / RLS | **PARTIAL** | Auth isolation confirmed by login tests; deeper cross-user project/file isolation not exercised. |
| 12 | AI Answer Quality Benchmark | **BLOCKED** | Cannot run without working AI. |
| 13 | Production Smoke (build/type/tests) | **MIXED** | `npx deno check supabase/functions/fire-safety-chat/index.ts` PASS after fixing one missing `sourceMeta` return. `npx vitest --run` 295/314 passed; 19 failures are inherited (`planConfig` camelCase vs snake_case aliases; `eid50` flag). |

---

## 3. Findings requiring action

### RELEASE BLOCKER
- **Invalid `GOOGLE_GEMINI_API_KEY`** — all AI chat broken.

### OWNER ACTION (not release-blocking alone, but must be resolved before full launch)

| # | Item | Severity | Evidence | Suggested action |
|---|---|---|---|---|
| 1 | Moyasar payment flow not validated | HIGH | No sandbox credentials available; cannot complete trial → upgrade → checkout → webhook → entitlement | Provide Moyasar test credentials or perform one real payment test in a controlled browser session |
| 2 | `check-subscription` deployed code differs from source | MEDIUM | Deployed response includes `effective_access_source` and `effective_access` fields not present in `supabase/functions/check-subscription/index.ts` | Reconcile and redeploy `check-subscription` from source, or update source to match production |
| 3 | `access_state: ineligible` for active trialing users | MEDIUM | `check-subscription` only sets `trial_active` via `launch_trial_status`; paid-subscription trial (`user_subscriptions.status=trialing`) is not mapped to `trial_active` | Decide whether to map `trialing` to `trial_active` in `access_state`, or keep frontend fallback as the canonical path and document it |
| 4 | Inherited unit-test failures in `planConfig` and `eid50` | MEDIUM | 19/314 tests fail; `enterpriseTeam`/`enterpriseOffice` camelCase aliases vs expected snake_case | Fix plan config key names or update tests; these affect enterprise upgrade paths |
| 5 | Failed chat requests consume daily message quota | LOW | `increment_daily_usage` runs before Gemini call and is not rolled back on 500 | Move increment after successful response, or add rollback on error |

---

## 4. Regression checks

| Command | Result |
|---|---|
| `npx deno check supabase/functions/fire-safety-chat/index.ts` | **PASS** (after fixing `sourceMeta: []` return at line 1453) |
| `npx vitest --run` | **295/314 PASS**, 19 inherited failures |
| `npm run typecheck` | **NOT AVAILABLE** — no such script in `package.json` |
| `npm test -- --run` | **NOT AVAILABLE** — no such script in `package.json`; use `npx vitest --run` |

### Code change made
- `supabase/functions/fire-safety-chat/index.ts:1453` — added `sourceMeta: []` to match the function return type (Deno type-check regression fix).

---

## 5. Remaining risks

| Risk | Severity | Notes |
|---|---|---|
| AI entirely non-functional | CRITICAL | Release blocker. |
| Payment flow unverified | HIGH | Could block monetization at launch. |
| Source-vs-deployed drift in `check-subscription` | MEDIUM | Makes incident response harder. |
| Inherited plan-config test failures | MEDIUM | Enterprise upgrade paths may be broken. |
| Daily quota leak on failed requests | LOW | Degrades trial user experience. |

---

## 6. Required owner actions to reach GO

1. **Replace `GOOGLE_GEMINI_API_KEY`** in Supabase secrets with a valid AI Studio key.
2. **Redeploy `fire-safety-chat`**.
3. **Re-run Phase 2 P2.3–P2.9 and P2.12** (or have the agent re-run them).
4. **Verify Moyasar** trial → payment → webhook → entitlement flow with real or sandbox transaction.
5. **Decide** on `access_state` mapping for paid trials and reconcile `check-subscription` source/deployment drift.

---

## 7. Files changed in this phase

| File | Change |
|---|---|
| `supabase/functions/fire-safety-chat/index.ts` | Added `sourceMeta: []` to fix Deno type error |
| `docs/audits/phase2-production-validation.md` | This report |

### Temporary artifacts created and removed
- `supabase/functions/gemini-debug/index.ts` — deployed, tested, deleted from deployment and local filesystem.
- `.verdent/testing/e2e/p2_1_auth_api.py`
- `.verdent/testing/e2e/p2_1_auth_complete.py`
- `.verdent/testing/e2e/p2_1_auth_state.json`
- `.verdent/testing/e2e/p2_2_trial_ui.py`
- `.verdent/testing/e2e/p2_chat_quality.py`
- `.verdent/testing/e2e/p2_chat_results.json`
- `.verdent/testing/e2e/.anon_key`
- `.verdent/testing/e2e/.user_jwt`

These test scripts/state files remain under `.verdent/testing/e2e/` for reuse; they are not committed.

---

## 8. Final release gate table

| Area | Status | Evidence | Fix | Remaining risk | Release impact |
|---|---|---|---|---|---|
| Registration | PASS | Real signup + email + login + session refresh verified | — | None | None |
| Trial/Entitlement | PASS | Trialing row created; UI shows modes + 20 msg/day | Document `access_state` mapping | `access_state` label misleading | Low |
| Main Mode | RELEASE BLOCKER | Chat returns 500 | Replace Gemini key | AI broken | **Launch blocked** |
| Advisory Mode | RELEASE BLOCKER | Same | Replace Gemini key | AI broken | **Launch blocked** |
| Analytical Mode | RELEASE BLOCKER | Same | Replace Gemini key | AI broken | **Launch blocked** |
| File Analysis | RELEASE BLOCKER | Depends on AI | Replace Gemini key | AI broken | **Launch blocked** |
| Citation/Provenance | RELEASE BLOCKER | Cannot evaluate without answers | Replace Gemini key | AI broken | **Launch blocked** |
| Subscription/Moyasar | NOT TESTED | No sandbox credentials | Owner provides credentials | Revenue flow unverified | High |
| Auth/RLS | PARTIAL | Login isolation confirmed | Deeper cross-user tests after AI fix | Limited evidence | Medium |
| Production Stability | MIXED | deno PASS, 295/314 tests PASS | Fix inherited 19 tests | Config drift exists | Medium |

**Verdict: NO-GO for public re-launch until the Gemini key is replaced and chat/citation/file flows are re-validated.**
