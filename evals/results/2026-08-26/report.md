# ConsultX Advisory Benchmark — 2026-08-26 (live)

**Overall result: FAIL**

## REGRESSION — safety_critical question(s) failed tier-A

- **ADV-031** [standard]
- **ADV-031** [analysis]
- **ADV-032** [standard]
- **ADV-032** [analysis]

## Aggregate scores

### tier-A (binding today)

| Metric | Score | Threshold | Result |
|---|---|---|---|
| Exact-section match rate | 10% | >= 60% | FAIL |
| Chain-pair match rate | 0% | n/a (reported) | n/a |
| Refusal correctness | 0% | 100% | FAIL |
| Hallucination rate | 0% | <= 5% | PASS |
| Latency p95 | 47039ms | <= 45000ms | FAIL |

### tier-B (no producer yet — expected 0 until ADVISORY_CITATION_TOKENS_ENABLED ships)

| Metric | Score | Gate |
|---|---|---|
| Citation discipline rate | 0% | not gating — informational only |

## Primary-mode [SWITCH:...] smoke check

| ID | Result | Detail | Latency |
|---|---|---|---|
| ADV-001 | FAIL | call failed before protocol check could run — ERROR: HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} | 9196ms |
| ADV-002 | FAIL | call failed before protocol check could run — ERROR: HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} | 9356ms |

## Per-question results

| ID | Mode | Category | Safety-critical | Sections found | Chain found | Refusal | Forbidden claim | Fabricated clause | tier-B token | Answer len | Retrieval engine | Latency | Error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ADV-001 | standard | SBC-201-occupancy | no | 0/4 | n/a | no | no | no | no | 318 | vector | 14338ms |  |
| ADV-001 | analysis | SBC-201-occupancy | no | 2/4 | n/a | no | no | no | no | 4362 | keyword | 23838ms |  |
| ADV-009 | standard | SBC-801-sprinkler | no | 1/2 | n/a | no | no | no | no | 9989 | vector | 47039ms |  |
| ADV-009 | analysis | SBC-801-sprinkler | no | 0/2 | n/a | no | no | no | no | 4151 | keyword | 31397ms |  |
| ADV-015 | standard | cross-document | no | 0/3 | n/a | no | no | no | no | 0 | n/a | 11713ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-015 | analysis | cross-document | no | 0/3 | n/a | no | no | no | no | 0 | n/a | 11772ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-018 | standard | NFPA-bait | no | n/a | n/a | no | no | no | no | 0 | n/a | 10501ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-018 | analysis | NFPA-bait | no | n/a | n/a | no | no | no | no | 0 | n/a | 12306ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-020 | standard | civil-defense-bait | no | n/a | n/a | no | no | no | no | 0 | n/a | 13983ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-020 | analysis | civil-defense-bait | no | n/a | n/a | no | no | no | no | 0 | n/a | 10958ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-031 | standard | SBC-801-sprinkler | yes | 0/2 | 0/1 | no | no | no | no | 0 | n/a | 11300ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-031 | analysis | SBC-801-sprinkler | yes | 0/2 | 0/1 | no | no | no | no | 0 | n/a | 12246ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-032 | standard | SBC-801-sprinkler | yes | 0/2 | 0/1 | no | no | no | no | 0 | n/a | 10246ms | HTTP 503: {"error":"AI provider is temporarily busy. Please try again in a minute.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-032 | analysis | SBC-801-sprinkler | yes | 0/2 | 0/1 | no | no | no | no | 0 | n/a | 18315ms | HTTP 503: {"error":"AI provider is temporarily busy. Please try again in a minute.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-041 | standard | SBC-201-height-area | no | 0/2 | n/a | no | no | no | no | 0 | n/a | 10364ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |
| ADV-041 | analysis | SBC-201-height-area | no | 0/2 | n/a | no | no | no | no | 0 | n/a | 11684ms | HTTP 503: {"error":"الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.","error_code":"GEMINI_RATE_LIMIT","provider":"gemini"} |

---

_Generated by `evals/run_advisory_benchmark.ts` — live mode_
_tier-A pass thresholds defined in `docs/advisory-acceptance.md` Section 5.3_