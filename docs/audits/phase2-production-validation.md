# ConsultX — Phase 2 Production Release Validation

**Project:** `hrnltxmwoaphgejckutk`  
**Date:** 2026-08-22  
**Scope:** End-to-end validation of ConsultX as a real user would experience it, from landing to payment and full usage. No Phase 3 work started.

## Release Decision: NO-GO

ConsultX cannot be re-launched publicly until the **Gemini production quota issue** is resolved or explicitly accepted. The code fix is deployed and verified, but the Gemini API key/project is returning `429` for every request, making all AI functionality unavailable.

---

## 1. Gemini 429 Root Cause

The message `Rate limit exceeded, please try again later` came from the Gemini provider (`429` on `streamGenerateContent`), not from ConsultX daily limits. The previous code:

* Called Gemini once with no retry.
* Had only a single-model fallback.
* Returned the raw `429` to the user as a generic rate-limit message.
* Incremented the user's daily quota **before** the Gemini call and never rolled it back on failure.

---

## 2. Fix

A production reliability fix was deployed to `fire-safety-chat`.

### 2.1 New helper module

`supabase/functions/fire-safety-chat/geminiResilience.ts`

* **Model discovery:** queries the Gemini `models` endpoint and caches the result for 5 minutes, building the fallback chain only from models the current key/project supports.
* **Fallback chain:**
  ```text
  preferred model
  → supported fallback model
  → supported fallback model
  → final provider error
  ```
  Candidate models: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`.
* **Retry policy:** up to 3 attempts per model with exponential backoff `1s → 2s → 4s`, only for `429`, transient `5xx`, and `408`. No retry for `400`, `401`, `403`, or malformed requests.
* **Error classification:**
  * `GEMINI_RATE_LIMIT`
  * `GEMINI_PROVIDER_ERROR`
  * `GEMINI_AUTH_ERROR`
  * `GEMINI_REQUEST_ERROR`
* **Safe logging:** provider, model, status, attempt, classification, latency. No secrets logged.
* **Quota rollback:** records the increment kind (mode/daily) and rolls it back if the provider fails before producing a response.

### 2.2 `fire-safety-chat/index.ts` changes

* Uses the resilience helper for both streaming chat and non-streaming vision pipeline.
* Records quota increment after a successful limit check.
* Clears the pending increment once a successful response starts streaming.
* Rolls back the increment when all models fail or an unhandled error occurs.
* Returns classified provider errors with:
  * HTTP `503` (not `429`, to avoid confusion with ConsultX daily limits)
  * `error_code: "GEMINI_RATE_LIMIT"`
  * Bilingual user-facing message:
    * Arabic: `الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.`
    * English: `AI provider is temporarily busy. Please try again in a minute.`

### 2.3 `src/components/ChatInterface.tsx` changes

* Distinguishes `CONSULTX_DAILY_LIMIT` from `GEMINI_RATE_LIMIT` / `GEMINI_PROVIDER_ERROR`.
* Surfaces the backend's message when available instead of a generic red error.

### 2.4 Bug fix during validation

During the first production smoke test, the streaming path failed with `ReadableStream is already locked`. The helper was consuming the response body with `resp.text()` before checking `resp.ok`. Fixed by reading the body **only on error**. Added a unit test to guard against regression.

### 2.5 Plan config normalization

Fixed inherited `planConfig` test failures by normalizing enterprise plan lookup keys to snake_case (`enterprise_team`, `enterprise_office`) while keeping the `slugs` aliases as camelCase. Fixed `EID50_LIVE` to accept an optional env object for testability.

---

## 3. Tests

| Suite | Result |
|---|---|
| `npx deno check supabase/functions/fire-safety-chat/index.ts` | **PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npx vitest --run` | **338/338 PASS** |

New tests in `src/__tests__/geminiResilience.test.ts` cover:

* fallback chain construction
* error classification for `429`, `5xx`, `401`, `400`
* `429` retry up to 3 attempts
* no retry for `400`/`401`
* quota rollback for mode and daily increments
* failed provider requests do not consume quota
* successful response body is not consumed by the helper

---

## 4. Deployment

| Item | Value |
|---|---|
| Function | `fire-safety-chat` |
| Status | ACTIVE |
| Version | 157 |
| Deployed at | 2026-08-22 01:45:40 UTC |
| Assets uploaded | `index.ts`, `geminiResilience.ts` |

Commit history:

* `dbccc81` — `fix(ai): add Gemini rate-limit resilience, quota rollback, and plan config normalization`
* `3572a93` — `fix(ai): do not consume Gemini response body before checking status`

---

## 5. Production Smoke Test

Performed via `POST /functions/v1/fire-safety-chat` against production using a real test account.

| Mode | Question | Result |
|---|---|---|
| `primary` | "What is ConsultX?" | `503 GEMINI_RATE_LIMIT` |
| `standard` | "ما هي متطلبات نظام الإنذار في SBC 801؟" | `503 GEMINI_RATE_LIMIT` |
| `analysis` | "قارن بين SBC 201 و SBC 801 من حيث نظام الإنذار" | `503 GEMINI_RATE_LIMIT` |

Observations:

* The deployed code is running (new `x-deno-execution-id` each request).
* Error classification works: every response contains `error_code: "GEMINI_RATE_LIMIT"`.
* Bilingual messages work: Arabic for Arabic questions, English for English questions.
* No `ReadableStream is already locked` error after the body-consumption fix.
* No `Service error: 400` or generic `Rate limit exceeded` message.
* Retry/fallback logic likely executed internally, but every model hit the same quota wall, so the final response was `503`.

Because every Gemini request is rate-limited, it was not possible to observe a successful AI response, citations, or file analysis end-to-end.

---

## 6. Quota Status

| Item | Status |
|---|---|
| Gemini key present in Supabase secrets | Confirmed |
| Gemini API accepting requests | Yes, but rejecting with `429` |
| Quota sufficient for production traffic | **No** |
| Billing/quota check | **OWNER ACTION** — requires access to Google AI Studio / Google Cloud Console |

The resilience fix reduces user-visible failures and prevents quota leakage, but it **cannot increase the API quota**. If the project is on a free/trial tier or has a low RPM/TPM limit, users will continue to see busy messages.

---

## 7. Remaining Release Gate Items

| Area | Status | Evidence | Remaining Risk |
|---|---|---|---|
| Registration / Authentication | PASS | Previously verified with real signup + email + login + session refresh | Low |
| Trial / Entitlement | PASS with finding | Trialing row created; UI shows modes + 20 msg/day; `access_state` label still misleading | Low |
| Main Mode | **BLOCKED** | `503 GEMINI_RATE_LIMIT` on every request | **Release blocker until quota fixed** |
| Advisory Mode | **BLOCKED** | Same | **Release blocker** |
| Analytical Mode | **BLOCKED** | Same | **Release blocker** |
| File / Project Workflow | **BLOCKED** | Upload UI works; analysis depends on AI | **Release blocker** |
| Advisory File Analysis | **BLOCKED** | Depends on AI | **Release blocker** |
| Analytical File Analysis | **BLOCKED** | Depends on AI | **Release blocker** |
| Citation / Provenance QA | **BLOCKED** | Cannot evaluate without AI-generated answers | **Release blocker** |
| Subscription / Moyasar | NOT TESTED | No sandbox credentials | High |
| Authorization / RLS | PARTIAL | Login isolation confirmed earlier; deeper cross-user tests after AI fix | Medium |
| `check-subscription` source/deploy drift | NOT FIXED | Deployed version 38 from 2026-04-30; local source differs | Medium |

---

## 8. Required owner actions

1. **Check and increase Gemini production quota** in Google AI Studio / Google Cloud Console for the key stored in Supabase secrets. This is the only remaining release blocker for AI functionality.
2. **After quota is increased, re-run the production smoke test** for Main, Advisory, and Analytical modes.
3. **Verify file upload + analysis** once AI responses are working.
4. **Provide Moyasar sandbox credentials** or perform a controlled payment test.
5. **Reconcile `check-subscription`** source and deployed code.

---

## 9. Files changed

| File | Change |
|---|---|
| `supabase/functions/fire-safety-chat/geminiResilience.ts` | New helper: model discovery, retry, fallback, error classification, quota rollback |
| `supabase/functions/fire-safety-chat/index.ts` | Integrate resilience helper; quota record/clear/rollback; classified error responses |
| `src/components/ChatInterface.tsx` | Distinguish ConsultX daily limit from Gemini provider rate limit |
| `src/__tests__/geminiResilience.test.ts` | New unit tests for retry, fallback, classification, quota rollback, body consumption |
| `src/config/plans.ts` | Normalize enterprise plan lookup keys to snake_case |
| `src/lib/campaigns/eid50.ts` | Make `EID50_LIVE` accept optional env object for tests |
| `docs/audits/phase2-production-validation.md` | This report |

---

## 10. Final release gate table

| Area | Status | Evidence | Release Impact |
|---|---|---|---|
| Registration | PASS | Real signup + email + login verified earlier | None |
| Email Verification | PASS | Resend delivery + confirmation verified | None |
| Invitation | PASS | Create + accept invite verified earlier | None |
| Trial | PASS | Trialing row created; modes unlocked | Low |
| Main | **BLOCKED** | `503 GEMINI_RATE_LIMIT` on production | **Launch blocked** |
| Advisory | **BLOCKED** | Same | **Launch blocked** |
| Analytical | **BLOCKED** | Same | **Launch blocked** |
| File Upload | PARTIAL | UI works; analysis blocked by AI | Medium |
| Advisory File Analysis | **BLOCKED** | Depends on AI | **Launch blocked** |
| Analytical File Analysis | **BLOCKED** | Depends on AI | **Launch blocked** |
| Citations | **BLOCKED** | Cannot evaluate without AI answers | **Launch blocked** |
| Moyasar | NOT TESTED | No sandbox credentials | High |
| Entitlement | PASS with finding | Trial works; `access_state` label misleading | Low |
| RLS | PARTIAL | Auth isolation confirmed; deeper tests pending | Medium |
| Tests | PASS | 338/338 PASS | None |

**Verdict: NO-GO for public re-launch until Gemini production quota is increased and a successful AI smoke test is completed.**
