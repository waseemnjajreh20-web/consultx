# Advisory Post-R5 — Root Cause Classification

Date: 2026-05-05 (R6)
Companions:
- [docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md](docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md)
- [docs/advisory/ADVISORY_POST_R5_TEST_MATRIX.md](docs/advisory/ADVISORY_POST_R5_TEST_MATRIX.md)
- [docs/advisory/ADVISORY_POST_R5_SMOKE_RESULT.md](docs/advisory/ADVISORY_POST_R5_SMOKE_RESULT.md)

---

## Disclosure: classification basis

**Live smoke was BLOCKED in R6** (no user JWT / browser session). This classification therefore distinguishes:

- **CONFIRMED** — observed directly via code inspection, file inventory, or fixture results.
- **SUSPECTED** — strongly indicated by the static evidence but unverified live.
- **NOT-AN-ISSUE** — explicitly ruled out by the static evidence.

Each row cites the specific evidence that places it in its bucket.

---

## 1. Confirmed issues

### 1.1 R5 framing was overstated — production retrieval surface barely changed

| Field | Value |
|-------|-------|
| Category | **Sidecar loader/fallback issue** + reporting accuracy |
| Evidence | Code at [supabase/functions/fire-safety-chat/index.ts:1202](supabase/functions/fire-safety-chat/index.ts:1202) reads `brain_full_v1/${key}` only inside `loadBrainFullV1Sidecars`. The primary `fetchSBCContext` at line 2022 reads from the bucket root instead. Bucket listing confirms 21 chunk files at root, separate from the 5 files in `brain_full_v1/`. |
| Impact | The R5 closeout claimed "production now serves 65% of SBC ledger". This is misleading. The Citation Verifier's source-of-truth is the Evidence Ledger built from *bucket-root* retrieval — that corpus was not touched by R5. R5 only refreshed the *reasoning aid* layer for Advisory queries that hit a narrow trigger regex. Main and Analytical see no change at all. |
| Recommended response | Either (a) accept that the gated 358-chunk corpus only feeds the secondary path and update reporting accordingly, or (b) wire the gated corpus into the primary path. Option (b) is a code change with measurable user effect; not in scope for read-only R6. |

### 1.2 Orphaned `brain_full_v3/` corpus in the production bucket

| Field | Value |
|-------|-------|
| Category | **Sidecar loader / fallback issue** + future-vector |
| Evidence | Bucket listing shows `brain_full_v3/` with 6 files totaling ~13 MB. Manifest reports 403 SBC-201 + 1132 SBC-801 chunks. Spot-check confirms `sbc-201-section-102` is present (a section the R3 policy gate blocks because its `.meta.json` has `requires_review:true`). Grep across `*.ts/*.tsx/*.cjs/*.mjs/*.js` for `brain_full_v3` returns zero matches. |
| Impact | If any future PR wires the V1 sidecar (or a new path) to read from `brain_full_v3/`, the R3 policy gate is bypassed in production. `requires_review:true` content lands in the runtime. This is also where the Phase 3B v2 corpus *would have lived* if Phase 3B were ever re-enabled. |
| Recommended response | Either delete the v3 folder from the bucket (operator action — needs service_role) or document it as "do-not-use" with a README in the bucket. The cleanest path is delete; the orphan has no documented purpose and was generated 2026-05-01 23:23 UTC, suggesting a parallel build artifact. |

### 1.3 Two SBC-801 page ranges are effectively empty in the primary corpus

| Field | Value |
|-------|-------|
| Category | **Corpus coverage gap** (primary path) |
| Evidence | Bucket listing shows `SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json` at 12,245 bytes and `... 801-1000_extracted_chunks.json` at 200 bytes. Both should contain Chapter 7-9 content; both are effectively empty. |
| Impact | Queries about Chapters 7–9 of SBC-801 (which include fire alarm system requirements 907.x, sprinkler requirements 903.x, fire pump 913) may have weak primary retrieval. The model still gets the V1 sidecar's reasoning aid for those triggers, but the Citation Verifier's source-of-truth is the empty-or-near-empty primary file. |
| Recommended response | Re-extract those page ranges from the source PDFs (operator-side / orchestrator session) and upload to bucket root. This is the highest-leverage corpus fix for the Advisory + Main pipelines. |

### 1.4 V1 sidecar trigger regex misses common Arabic singular forms

| Field | Value |
|-------|-------|
| Category | **Retrieval routing issue** (sidecar reasoning aid) |
| Evidence | Fixture B in [evals/advisory/intent_gate_fixtures.test.ts:108](evals/advisory/intent_gate_fixtures.test.ts:108) confirms that the regex requires `محلات\s+تجارية` (plural) and does not match `محل تجاري` (singular). The fixture is locked in as a contract — this is intentional, not a bug. But it means a common Arabic phrasing like "متطلبات الإشغال لمحل تجاري" will not get the V1 sidecar reasoning aid. The query will still go through primary retrieval, but the policy-gated 358-chunk corpus is invisible to it. |
| Impact | Limited — the model still has the bucket-root corpus to draw on. But the V1 sidecar's curated Group-M chain isn't presented for these queries. After R5, this means the gated corpus is even less reachable from common Arabic phrasings than it was before R5 (because R5 expanded what the sidecar carries; the trigger gate didn't expand). |
| Recommended response | **Do NOT edit the trigger regex** without fixture updates. The fixture deliberately locks the current narrow trigger ("false negatives are acceptable" per the in-code comment at [supabase/functions/fire-safety-chat/index.ts:1213-1218](supabase/functions/fire-safety-chat/index.ts:1213)). Any expansion needs a deliberate review of which phrasings should newly trigger and a corresponding fixture update. |

---

## 2. Suspected issues (require live smoke to confirm)

### 2.1 SBC-801 vs SBC-201 cross-family routing on `Section 907.x`

| Field | Value |
|-------|-------|
| Category | **Citation metadata issue** + retrieval routing |
| Evidence | Both SBC-201 and SBC-801 publish a `Section 907` (fire alarm). The Step 3.2 hard-stop wrong-family routing landed in commit `8fdfc6f`. Static code review at [supabase/functions/fire-safety-chat/index.ts:2551, 2583](supabase/functions/fire-safety-chat/index.ts:2551) shows `LEGACY_IDS = new Set(["503", "1004.1.2", "1004.1"])` for the routing gate, but the precise behavior on Section 907 from a Mercantile-context query is unverified. |
| Why suspected | Test D in the matrix specifically probes this. A response that cites `[SBC-201 Section 907 ...]` when the operative source is SBC-801 would be a confirmed bug. |
| Recommended response | Run test D live. If it fails, the next surgical fix is in the family-routing logic, not in retrieval. |

### 2.2 Table 1004.5 structured-table fallback

| Field | Value |
|-------|-------|
| Category | **Table evidence issue** |
| Evidence | The DB-first structured-table path is invoked at [supabase/functions/fire-safety-chat/index.ts:5395-5404](supabase/functions/fire-safety-chat/index.ts:5395). Whether `1004.5` is actually present in the `sbc_code_tables` DB (i.e. what the structured fallback resolves to) cannot be determined from code alone. |
| Why suspected | Test C probes this. If structured-table doesn't fire, keyword retrieval against a Phase 1 corpus must surface the verbatim table — not certain. |
| Recommended response | Run test C live. If structured-table doesn't fire, either seed the row in `sbc_code_tables` (DB write — operator) or add a more aggressive table-id detector. |

### 2.3 Numerical threshold hallucination guard

| Field | Value |
|-------|-------|
| Category | **Prompt overconfidence issue** |
| Evidence | The system prompt has explicit "binding citation rules" at [supabase/functions/fire-safety-chat/index.ts:5429-5444](supabase/functions/fire-safety-chat/index.ts:5429) that forbid emitting code text from general memory when retrieval doesn't surface it. The Citation Verifier is supposed to downgrade unsupported tokens. But these protections operate in different layers — the prompt is best-effort, the verifier is post-hoc. |
| Why suspected | Tests E (sprinkler thresholds) and F (fire pump GPM) probe this. Either model emits a number with a section ref (good) or without (bad — should be downgraded by the verifier, but the user might still see the unanchored value in the streamed body before the verifier rewrites). |
| Recommended response | Run E and F live. If thresholds appear without source-backing, the next surgical fix is to tighten the verifier rewrite scope or to add an explicit "no-numeric-without-citation" guard in the post-stream pass. |

### 2.4 Empty-retrieval diagnostic protocol on Chapter 12-63 queries

| Field | Value |
|-------|-------|
| Category | **Prompt overconfidence** |
| Evidence | The empty-retrieval branch at [supabase/functions/fire-safety-chat/index.ts:5447-5462](supabase/functions/fire-safety-chat/index.ts:5447) appends a `RETRIEVAL NOTE` and forbids citations from general memory. Whether the model actually obeys this when asked about, e.g., Section 6304.2.1.1 is the central anti-hallucination test. |
| Why suspected | Test G probes this. Likely outcome: the model asks a clarifying question or declines to provide the section text. Possible failure: the model reaches into general memory and emits paraphrased SBC-801 hazmat content with no citation. |
| Recommended response | Run G live. If the model hallucinates, the surgical fix is to strengthen the empty-retrieval prompt note and/or to make the verifier downgrade *uncited content* in addition to unsupported citation tokens. |

---

## 3. Not-an-issue (ruled out by static evidence)

### 3.1 scoreChunk emission gate not reintroduced

| Evidence | The reverted `scoreChunk` relevance gate (commit `5db4cf0` → `4e4f032` revert) is not present in the current code. Verified by code reading at [supabase/functions/fire-safety-chat/index.ts:1766-1842](supabase/functions/fire-safety-chat/index.ts:1766) — the function is the structural-only post-revert version. |

### 3.2 Phase 3B v2-first sidecar not reintroduced

| Evidence | The reverted `brainV1FetchAt` v2-first lane (commit `6ec141b` → `395c63d` revert) is not present. Current `brainV1Fetch` at [supabase/functions/fire-safety-chat/index.ts:1198-1209](supabase/functions/fire-safety-chat/index.ts:1198) downloads only from `brain_full_v1/`. The `brain_full_v3/` orphan in the bucket is not touched by any code path. |

### 3.3 503-on-empty-retrieval not reintroduced

| Evidence | The empty-retrieval branch at [supabase/functions/fire-safety-chat/index.ts:5447](supabase/functions/fire-safety-chat/index.ts:5447) emits a `console.warn` and continues; no 503 response is returned. The `RETRIEVAL NOTE` is appended to the prompt instead. Commit `4922cb3`'s removal stands. |

### 3.4 Non-code intent gate working as designed

| Evidence | 11/11 fixtures pass in [evals/advisory/intent_gate_fixtures.test.ts](evals/advisory/intent_gate_fixtures.test.ts). Casual greetings, empty input, and short ambiguous strings all short-circuit to canned replies before any retrieval runs. Verified deterministically. |

### 3.5 Diagnostic logs in place

| Evidence | The four `[AdvisoryBrain] sidecar=v1 ...` log lines from R1 commit `9a53040` are present at the four exit branches of `loadBrainFullV1Sidecars`. The `[Advisory] SBC context empty after retrieval` warn is also present. Future debugging will have the observability points it needs. |

### 3.6 Auth gate on `fire-safety-chat`

| Evidence | Live probe in R6 confirmed: HTTP 401 + `{"error":"Invalid session, please login again"}` for anon-only authentication. Anon JWTs cannot fake user-mode Advisory calls — verified live. |

---

## 4. Recommended next surgical fix

Per the brief: "بناءً على الفحص والاختبار، صنّف مشاكل Advisory الحالية" + "recommended next surgical fix".

Without live smoke, the highest-leverage non-code fix is **bucket cleanup**, specifically:

### 4.A (Bucket-only, owner-side) — Refresh empty SBC-801 page-range files

Re-extract Chapter 7-9 content from the source PDFs (`D:/sbc_consultx/SBC 801 ...-601-800.pdf` and `...-801-1000.pdf`) and upload them to the bucket root. This addresses Confirmed issue 1.3 directly and improves primary retrieval for fire-protection queries — the most common Advisory use case. No code change.

### 4.B (Bucket-only, owner-side) — Remove the `brain_full_v3/` orphan

Delete the 6 v3 files from the bucket. Removes the latent risk in Confirmed issue 1.2 of accidentally bypassing the R3 policy gate. No code change.

### 4.C (Code change, deferred until live smoke confirms need) — Wire the gated corpus into the primary path

If live smoke confirms that Advisory's primary retrieval is missing content that's present in `brain_full_v1/`, the code change is to point a portion of `fetchSBCContext` (or a new sibling) at `brain_full_v1/` instead of (or in addition to) the bucket-root files. This is the option-3 from the runtime audit — "Advisory-only retrieval source that reads `brain_full_v1/` and feeds the Evidence Ledger directly". Out of scope for R6.

### 4.D (DO NOT) — Reintroduce Phase 3B / scoreChunk gate / 503-on-empty

Explicitly out of bounds per user policy and per R1 diagnosis. Documented here only to make the policy boundaries visible alongside the next-step recommendations.

---

## 5. Summary

| Bucket | Count |
|--------|------:|
| Confirmed issues | 4 |
| Suspected issues (need live smoke) | 4 |
| Not-an-issue (ruled out) | 6 |
| Recommended next surgical fixes | 2 bucket-only + 1 code change deferred |

The next dependent action is the live smoke. Until that runs, classification-by-static-evidence is as far as this work can reach.
