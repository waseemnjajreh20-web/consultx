# R25 — Advisory 503 Failure Classification

**Date:** 2026-05-07  
**Sprint:** R25 Emergency Stabilization

---

## Classification: Gemini Upstream Transient 503

**Confidence:** HIGH

### Evidence FOR Gemini Upstream 503

1. Error message `"Service error: 503"` maps exactly to `index.ts` line 5713:  
   `error: \`Service error: ${response.status}\`` where `response.status === 503`

2. `response` is the Gemini API `fetch()` result (line 5674–5685).  
   `response.status === 503` means the Gemini endpoint returned HTTP 503.

3. HTTP 503 from Gemini = documented transient overload behavior. Gemini 2.5 Pro  
   can return 503 under high load, especially for streaming endpoints.

4. No code change between R24 (working) and R25 (broken) that would introduce a 503.  
   R24 only modified `workflow_constraints.ts` (pure TypeScript logic, no network calls).

5. Advisory mode uses `gemini-2.5-pro` (line 5663: `mode !== "primary"` → pro model).  
   Pro model has stricter quota and more frequent 503 under load vs. Flash.

### Evidence AGAINST Code Bug

- B2 code blocks are all try/catch non-fatal
- No new network calls added in R24
- `workflow_constraints.ts` has no async operations
- `m²` character is valid UTF-8, not a serialization issue

### Evidence AGAINST Infrastructure Failure

- Edge function itself deployed successfully (R24 deploy confirmed)
- CORS preflight returns 200 (no total outage)
- Main mode (Flash model) continues to work

---

## Failure Flow

```
Advisory query → edge function → Gemini 2.5 Pro
                                       ↓
                               HTTP 503 (overloaded)
                                       ↓
               Pre-R25 code: no fallback for 503
                                       ↓
               return { error: "Service error: 503" }
                                       ↓
               Frontend: onError("Service error: 503")
```

---

## Fix Direction

**Immediate:** Add retry logic for Gemini 503 in `index.ts`.

Per R25 spec:
- If upstream Gemini 503: single retry with 1500ms backoff
- Also add 503 to the existing model fallback (pro → flash) condition
- If retry also fails: user-friendly bilingual message
- "لا تغيّر العقل" — do not touch B2 flags, brain package, constraints
