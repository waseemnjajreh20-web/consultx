# ConsultX — Phase 2 Production Release Validation

**Project:** `hrnltxmwoaphgejckutk`
**Date:** 2026-08-22
**Scope:** End-to-end validation of ConsultX as a real user would experience it, from landing to payment and full usage. No Phase 3 work started.

## Release Decision: NO-GO

ConsultX cannot be re-launched publicly until the **Gemini rate-limit issue** is resolved or explicitly accepted and the affected flows are re-tested.

---

## 1. Root cause of the current failure

The previous **RELEASE BLOCKER** (invalid `GOOGLE_GEMINI_API_KEY`) was resolved by the owner. All three AI modes returned `200` streamed responses immediately after the key replacement.

Within a short period, production users began seeing:

```text
Error
Rate limit exceeded, please try again later
```

Evidence gathered from the backend before the fix:

* The message text matches the hardcoded response returned by `fire-safety-chat/index.ts` when Gemini replies with HTTP `429`.
* The `429` comes from the Gemini provider, **not** from ConsultX daily limits.
* The previous implementation had no retry, no model fallback beyond one model, and no distinction between a ConsultX daily limit and a Gemini provider rate limit.
* Daily message quota was incremented **before** the Gemini call and was **not rolled back** when Gemini failed, causing quota leakage for every failed request.

---

## 2. Fix implemented

A production reliability fix was applied to `fire-safety-chat` without changing architecture, modes, retrieval paths, or daily user quotas.

### 2.1 New helper module

`supabase/functions/fire-safety-chat/geminiResilience.ts`

* **Model discovery:** calls the Gemini `models` endpoint once every 5 minutes (cached) and builds the fallback chain only from models the current API key/project supports.
* **Fallback chain:**
  ```text
  preferred model
  → supported fallback model
  → second supported fallback model
  → final provider error
  ```
  Candidates considered: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`.
* **Retry policy:** 3 attempts per model with exponential backoff (`1s → 2s → 4s`) only for retryable errors (`429`, `5xx`, `408`, network transient). No retry for `400`, `401`, `403`, or malformed requests.
* **Error classification:**
  * `GEMINI_RATE_LIMIT`
  * `GEMINI_PROVIDER_ERROR`
  * `GEMINI_AUTH_ERROR`
  * `GEMINI_REQUEST_ERROR`
* **Safe logging:** logs provider, model, status, attempt, classification, and latency. Never logs the API key or raw quota internals.
* **Quota rollback helpers:** record the increment kind (mode/daily) and roll it back if the provider fails before a response is produced.

### 2.2 `fire-safety-chat/index.ts` changes

* Imports the resilience helper.
* Replaces the single-shot Gemini call with the retry + fallback chain for both streaming chat and non-streaming vision pipeline.
* Adds `recordQuotaIncrement(...)` after every successful quota increment that does **not** exceed the user's limit.
* Calls `clearQuotaIncrement()` once a successful streamed response is returned.
* Calls `rollbackQuotaIfNeeded(adminClient)` when all models fail or when an unhandled error occurs, preventing quota consumption for failed provider requests.
* Returns provider-rate-limit errors with:
  * HTTP `503` (not `429`, so it is not confused with ConsultX daily limits)
  * `error_code: "GEMINI_RATE_LIMIT"`
  * Bilingual user-facing message:
    * Arabic: `الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.`
    * English: `AI provider is temporarily busy. Please try again in a minute.`
* Also fixed a pre-existing Deno type error: added `sourceMeta: []` to an empty `fetchSBCContext` return branch.
* Moved `adminClient` declaration to the main handler scope so it is available for quota rollback in the error path.

### 2.3 `src/components/ChatInterface.tsx` changes

* Distinguishes backend error codes:
  * `CONSULTX_DAILY_LIMIT` / HTTP `429` → daily limit message
  * `GEMINI_RATE_LIMIT` / `GEMINI_PROVIDER_ERROR` → provider-busy message
  * Other errors → generic service error
* Continues to surface the backend's exact message when available instead of showing a generic red `Error`.

### 2.4 Tests added

`src/__tests__/geminiResilience.test.ts`

Covers:

* Fallback chain construction
* Error classification for `429`, `401/403`, `5xx`, `400`, and API-key-invalid text
* Retry behavior for `429` and transient `5xx`
* No retry for `400`/`401`
* Quota rollback for mode and daily increments
* Failed provider requests do not consume quota

---

## 3. Verification status

| Command | Status | Notes |
|---|---|---|
| `npx deno check supabase/functions/fire-safety-chat/index.ts` | **BLOCKED — ENVIRONMENT** | Shell execution environment became unresponsive during verification. The command was previously used successfully; the code was corrected for the errors reported before the freeze. |
| `npm run typecheck` | **BLOCKED — ENVIRONMENT** | Same shell freeze. |
| `npm test -- --run` / `npx vitest --run` | **BLOCKED — ENVIRONMENT** | Same shell freeze; could not be executed. |
| Redeploy `fire-safety-chat` | **BLOCKED — ENVIRONMENT** | Requires working shell/CLI. |
| Production smoke test | **BLOCKED — ENVIRONMENT** | Cannot deploy, therefore cannot test. |

### What was attempted

1. Ran `npx deno check supabase/functions/fire-safety-chat/index.ts` — initial run reported 4 errors (`sourceMeta` missing, `adminClient` and `language` out of scope in new rollback paths).
2. Fixed all 4 errors in the source.
3. Re-ran `npx deno check` — the local shell/CLI session became unresponsive and eventually timed out.
4. Attempted `npm run typecheck`, `npx vitest --run`, and even `echo hello` — all timed out, indicating the execution environment is frozen, not the commands themselves.
5. Attempted PowerShell as an alternative shell — same timeout.

### Why this is an environment blocker, not a code blocker

* The same commands completed earlier in this session (e.g., the first `deno check` that reported the 4 errors).
* Simple shell commands such as `echo hello` and `cd` also fail.
* All background sessions either hung waiting for input or had to be terminated.

---

## 4. Production inconsistencies and risks

| Risk | Severity | Notes |
|---|---|---|
| Gemini rate limits / quota insufficient | **CRITICAL** | The resilience fix reduces user-visible failures but does **not** increase Gemini quota. If the current key/project has a low RPM/TPM limit, users will still hit rate limits during real usage. |
| Regression checks not executed | **HIGH** | Could not run `deno check`, `typecheck`, or tests due to environment freeze. The fix must be re-verified once the environment is restored. |
| Fix not deployed | **HIGH** | Until `fire-safety-chat` is redeployed, production still runs the old code that shows `Rate limit exceeded, please try again later` and leaks quota. |
| Moyasar payment flow unverified | **HIGH** | No sandbox credentials available; revenue flow still not validated. |
| `check-subscription` source/deployment drift | **MEDIUM** | Still unresolved from previous pass. |

---

## 5. Required owner actions to reach GO

1. **Restore the local execution environment** so `deno check`, `typecheck`, and `npm test` can run.
2. **Run regression checks** on the fix:
   ```bash
   npx deno check supabase/functions/fire-safety-chat/index.ts
   npm run typecheck
   npm test -- --run
   ```
3. **Redeploy `fire-safety-chat`** after regression passes.
4. **Verify production smoke tests** for Main, Advisory, and Analytical modes.
5. **Check Google AI Studio / Google Cloud quota and billing** for the production key. The resilience fix is not a substitute for sufficient quota. If the project is on a free/trial tier with low limits, upgrade or enable billing.
6. **Validate Moyasar** trial → payment → webhook → entitlement flow with real or sandbox transaction.
7. **Reconcile `check-subscription`** source and deployed code.

---

## 6. Files changed in this fix

| File | Change |
|---|---|
| `supabase/functions/fire-safety-chat/geminiResilience.ts` | New helper: model discovery, retry, fallback, error classification, quota rollback |
| `supabase/functions/fire-safety-chat/index.ts` | Use resilience helper; record/clear/rollback quota; return classified provider errors; fix `sourceMeta` return type; move `adminClient` to handler scope |
| `src/components/ChatInterface.tsx` | Distinguish ConsultX daily limit from Gemini provider rate limit in error UI |
| `src/__tests__/geminiResilience.test.ts` | Unit tests for retry, fallback, classification, and quota rollback |
| `docs/audits/phase2-production-validation.md` | This report |

---

## 7. Final release gate table

| Area | Status | Evidence | Fix | Remaining risk | Release impact |
|---|---|---|---|---|---|
| Registration | PASS | Real signup + email + login + session refresh verified earlier | — | None | None |
| Trial/Entitlement | PASS | Trialing row created; UI shows modes + 20 msg/day | — | `access_state` label misleading | Low |
| Main Mode | **RELEASE BLOCKER** | Gemini `429` shown to users; fix written but not deployed | Deploy resilience fix + verify quota | Quota may still be insufficient | **Launch blocked** |
| Advisory Mode | **RELEASE BLOCKER** | Same | Same | Same | **Launch blocked** |
| Analytical Mode | **RELEASE BLOCKER** | Same | Same | Same | **Launch blocked** |
| File Analysis | **RELEASE BLOCKER** | Depends on AI | Same | Same | **Launch blocked** |
| Citation/Provenance | **RELEASE BLOCKER** | Cannot evaluate without answers | Same | Same | **Launch blocked** |
| Subscription/Moyasar | NOT TESTED | No sandbox credentials | Owner provides credentials | Revenue flow unverified | High |
| Auth/RLS | PARTIAL | Login isolation confirmed earlier | Deeper tests after AI fix | Limited evidence | Medium |
| Production Stability | **BLOCKED — ENVIRONMENT** | Could not run final regression | Restore environment, re-run checks | Unknown until checks pass | High |

**Verdict: NO-GO for public re-launch until the fix is deployed, regression checks pass, and Gemini quota/billing is confirmed sufficient for production traffic.**
