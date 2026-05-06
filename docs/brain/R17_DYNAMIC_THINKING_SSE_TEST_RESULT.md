# R17 — Dynamic Thinking SSE Test Result

**Date:** 2026-05-06  
**Task:** TASK 5 — Tests

---

## Test File

`scripts/validate_r17_dynamic_thinking_sse.cjs`

## Results

```
R17 Dynamic Thinking SSE Tests

--- Flag gate ---
  PASS  flag OFF → 0 thinking events emitted
  PASS  flag ON + advisory + workflow → N events built
  PASS  events converted to thinking_status SSE frames

--- Message safety ---
  PASS  no CoT / scoring / private paths in any MESSAGES entry
  PASS  no unsafe content in built SSE frames

--- Frontend parser ---
  PASS  thinking_status events captured by onThinkingStatus
  PASS  thinking_status events NOT sent to onDelta
  PASS  fullContent only accumulates choices[0].delta.content
  PASS  thinking messages never mixed into fullContent

--- Mode isolation ---
  PASS  Main mode: no thinking events (flag-gated inside standard block)
  PASS  Analytical mode: no thinking events (separate bufferingStream, no B2 path)

--- Static phrase exclusion ---
  PASS  FORBIDDEN_STATIC_PHRASES_AR loaded (6 entries)
  PASS  FORBIDDEN_STATIC_PHRASES_EN loaded (4 entries)
  PASS  no FORBIDDEN_STATIC_PHRASES_AR appear in MESSAGES matrix
  PASS  no FORBIDDEN_STATIC_PHRASES_EN appear in MESSAGES matrix

--- Message length ---
  PASS  all MESSAGES entries ≤ 80 chars
  PASS  no U+00A7 § in any MESSAGES entry

========================================
Results: 17 PASS, 0 FAIL
ALL TESTS PASS
```

## Fixes Applied During Test Run

4 English messages in `thinking_ux_emitter.ts` exceeded the 80-char limit. Trimmed:

| Before | After |
|--------|-------|
| `"Separating occupancy type from fire-area size before applying sprinkler thresholds..."` (85) | `"Separating occupancy type from fire-area size before applying thresholds..."` |
| `"Sprinkler requirements under review — verifying source bounds before answering..."` (81) | `"Sprinkler requirements under review — verifying source bounds..."` |
| `"Pointing to official PDF for Section 903 since the text is not in the V4 corpus..."` (82) | `"Pointing to official PDF for Section 903 — text not in V4 corpus..."` |
| `"Smoke-control requirements under review — not publishing unsupported estimates..."` (81) | `"Smoke-control requirements under review — no unsupported estimates..."` |

## Also Ran: Existing B2 Validation Tests

```
node scripts/validate_advisory_brain_b2.cjs
Results: 22 PASS, 0 FAIL  ALL TESTS PASS
```

## Verdict: 17/17 R17 tests + 22/22 B2 tests = 39 total PASS, 0 FAIL
