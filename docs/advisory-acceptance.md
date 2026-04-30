# ConsultX — Advisory Mode Acceptance Criteria v1

**Status:** Draft — awaiting owner sign-off
**Date:** 2026-04-30
**Phase:** A (Documentation Only)
**Companion document:** [`docs/promise-ledger.md`](./promise-ledger.md)
**Scope:** Binding acceptance criteria for Advisory Mode (`mode === "standard"`). Defines the answer shape, citation discipline, refusal contract, latency budget, benchmark gate, mode boundaries, and metric definitions that subsequent implementation phases (B–I) must satisfy.

> **Operating principle:** Advisory is the consultant-level mode. The bar set in this document is the bar at which Advisory becomes honestly defensible as "real engineering code consulting." Nothing in this document softens the existing prompt contract; it formalizes and extends it.

---

## 1. Target Advisory Answer Structure

Every Advisory answer that proceeds past the Mandatory Diagnostic Protocol gate (i.e. all critical inputs are present) must be structured around the following six sections. Section headers may be rendered in Arabic or English depending on user language; the underlying obligations are the same.

### 1.1 الخلاصة الهندسية (Engineering Conclusion)

- **Length:** 2–3 lines maximum.
- **Content:** The decisive answer to the engineer's question — is it required? what value? when does it apply?
- **Forbidden:** Restating the question; preambles; hedging language ("usually", "approximately", "غالباً", "تقريباً") — the existing CORE_RULES Rule 6️⃣ is reaffirmed.

### 1.2 المرجع / المراجع المعتمدة (Authoritative References)

- **Content:** One line per cited source, in the form:
  - `**SBC 801 — Section 903.2.1:** "<verbatim English text from the retrieved chunk>"`
  - Or, when only a page range is available: `**SBC 201 — Pages 412–415:** "<closest verbatim text>"` with a precision/confidence label (see Section 2).
- **Multiple references:** Each on its own line.
- **Missing source:** If no chunk in the retrieval bundle supports the claim, omit this section and surface the corpus-boundary refusal in Section 1.5 instead.

### 1.3 سبب القرار (Reasoning)

- **Length:** 3–5 lines.
- **Content:** Why this code provision applies to the engineer's situation; what triggers it; what hinges on it; any simple calculation shown step-by-step with units.
- **Forbidden:** Repeating Section 1.1 verbatim; introducing facts not present in retrieval or in the user's input.

### 1.4 متطلبات التصميم أو التطبيق (Design or Application Requirements)

- **Content:** Concrete, actionable items the engineer must do, in priority order. Bullet list permitted.
- **Forbidden:** Generic best-practice advice not tied to a retrieved code clause; speculative future-state requirements.

### 1.5 معلومات ناقصة يجب تأكيدها (Missing Information / Required Confirmations)

- **Content:** Specific facts whose absence would change the conclusion if revealed; AHJ-determination items; site-specific verifications.
- **Required when retrieval is empty:** This section becomes the home of the corpus-boundary refusal sentence (see Section 3).

### 1.6 حدود الثقة / مستوى الاستناد (Confidence Bounds / Grounding Level)

- **Content:** A single confidence statement summarizing the answer's evidentiary state:
  - `الاستناد: عالٍ — جميع الادعاءات الجوهرية مستندة إلى نصوص كود مُسترجعة حرفياً.`
  - `الاستناد: متوسط — بعض الادعاءات مدعومة بنطاق صفحات لا بفقرة محددة.`
  - `الاستناد: محدود — اعتمد على المعطيات المحددة ولا تستند إلى هذه الإجابة وحدها.`
- **Forbidden:** Inflating confidence beyond what citation density supports.

### 1.7 Mode-comparison note

| Mode | Required answer structure |
|---|---|
| Main (`primary`) | Free-form, brief, conversational. Sections Section 1.1–Section 1.6 do **not** apply. May suggest switching to Advisory via `[SWITCH:استشاري]` marker. |
| Advisory (`standard`) | Sections Section 1.1–Section 1.6 apply; this document is binding. |
| Analytical (`analysis`) | Existing analytical report structure (Sections I–VIII per `getAnalysisPrompt()`) continues to apply; this document does not replace it. The corpus-boundary refusal (Section 3) and citation discipline (Section 2) extend across all three modes. |

---

## 2. Citation Discipline

### 2.1 Citation token format

Every code-prescriptive claim — meaning any sentence that asserts a code requirement, threshold, exception, or numerical value attributed to SBC, NFPA, or Civil Defense — must end with a citation token in one of the following forms:

| Source available | Token format | Example |
|---|---|---|
| Exact section retrieved verbatim | `[SBC-{201\|801} Section {section_ref} \| conf:high]` | `[SBC-801 Section 903.2.1 \| conf:high]` |
| Section inferred from adjacent chunk in same file | `[SBC-{201\|801} Section {section_ref} \| conf:medium]` | `[SBC-201 Section 1006.3.3 \| conf:medium]` |
| Only page range available (no section_ref yet) | `[SBC-{201\|801} pp.{start}-{end} \| conf:medium]` | `[SBC-201 pp.412-415 \| conf:medium]` |
| Structured table row (DB-backed) | `[SBC-{201\|801} Table {table_id}]` | `[SBC-201 Table 1004.5]` |
| No retrieved source supports the claim | Do not emit a citation token; emit refusal sentence (see Section 3). | — |

### 2.2 Citation density floor

Every Advisory answer must carry **at least one** valid citation token OR an explicit corpus-boundary refusal sentence (Section 3). An answer that meets neither criterion is a validator failure and is retried up to the existing 3-retry limit at `src/components/ChatInterface.tsx:533`.

### 2.3 Pre-existing rules that remain in force

- CORE_RULES 1️⃣ (authorized sources only): unchanged.
- CORE_RULES 2️⃣ (numerical precision, zero rounding): unchanged.
- CORE_RULES 3️⃣ (verbatim English quotation): unchanged — the citation token is **in addition to** the verbatim quote, not a replacement.
- CORE_RULES 4️⃣-B (certainty labeling): unchanged — the `conf:` field in the new token is reconciled with the existing `[REQUIRES SOURCE CONFIRMATION]` and `[NO SOURCE]` labels (see Section 3.4).

### 2.4 Forbidden citation behaviors

- Inventing section numbers or table IDs.
- Citing NFPA or Civil Defense sections without a retrieved chunk from the corresponding corpus tag (`corpus IN ('NFPA','CD')`).
- Citing "SBC says…" without a specific document and section.
- Using the section-symbol character in any output — render `Section X.X.X` in full instead (existing CORE_RULES 3️⃣ rule restated).
- Producing a citation token whose `conf` field is `high` when section_ref came from regex inference rather than an in-chunk heading.

---

## 3. Refusal / Boundary Contract

### 3.1 Empty-corpus refusal — Arabic

> هذا الادعاء غير موثق في القاعدة المفهرسة الحالية، ويحتاج إلى مصدر معتمد قبل اعتماده هندسياً.

### 3.2 Empty-corpus refusal — English

> This claim is not documented in the currently indexed corpus and requires an authoritative source before engineering reliance.

### 3.3 NFPA / Civil Defense boundary — Arabic

> يتطلب هذا المرجع حزمة مصادر NFPA أو الدفاع المدني المقابلة، وهي غير مفهرسة حالياً في ConsultX.

### 3.4 NFPA / Civil Defense boundary — English

> This reference requires the corresponding NFPA or Civil Defense source pack, which is not currently indexed in ConsultX.

### 3.5 When to emit which sentence

| Situation | Required sentence | Section of answer |
|---|---|---|
| Retrieval bundle contains zero chunks | Section 3.1 / Section 3.2 | Either Section 1.5 (Missing Information) or as a standalone reply when the question is unanswerable |
| User explicitly asks about NFPA / Civil Defense and no chunk from that corpus is retrieved | Section 3.3 / Section 3.4 | Section 1.5; do not produce Section 1.2 references for that source |
| Retrieval has SBC chunks but none supports a specific claim within the answer | Section 3.1 / Section 3.2 | Inline before the unsupported claim, in Section 1.4 or Section 1.5 |
| Retrieval supports the answer in full | No refusal sentence required | n/a |

### 3.6 Reconciliation with existing certainty labels

The new citation token coexists with the existing CORE_RULES 4️⃣-B labels:

- `[REQUIRES SOURCE CONFIRMATION]` — used in compliance verdicts when source is absent. Continues to be valid; an Advisory answer using this label must also emit one of the Section 3.1–Section 3.4 sentences.
- `[NO SOURCE]` — used in Section VIII (Technical References) of analytical reports to mark which quote could not be retrieved. Unchanged.
- `[INDIRECT — Section Y context]` — used when adjacent text is cited rather than the literal clause. Compatible with `conf:medium` in the new token.

### 3.7 Forbidden refusal behaviors

- Refusing without naming the missing source family ("the document is unavailable" with no specifics).
- Asking the user to supply the code text — existing rule at `fire-safety-chat/index.ts:4625-4627` prohibits this; the prohibition is reaffirmed.
- Emitting refusal as a hedge inside an otherwise confident answer; refusal sentence must be load-bearing on a specific gap.

---

## 4. Latency Targets

| Metric | Target |
|---|---|
| Time to first streaming chunk (TTFB), p50 | ≤ 8s |
| Time to first streaming chunk (TTFB), p95 | ≤ 15s |
| Total response time, p50 | ≤ 25s |
| Total response time, p95 | ≤ 45s |
| Vision pipeline total time (Advisory with image), p95 | ≤ 90s |

These targets are measured server-side via the `retrieval_telemetry` table introduced in Phase G. Targets are evaluated against production traffic on a 7-day rolling window, excluding cold-start invocations (first request after >10min idle).

### 4.1 Latency violation policy

- p95 violation lasting >24h triggers a Phase G benchmark re-run and a retrieval-method audit.
- p95 violation lasting >72h triggers a rollback consideration via the `RETRIEVAL_ENGINE` env flag (Phase D rollback path).

---

## 5. Benchmark Gate

The Phase G benchmark suite (`evals/advisory_benchmark.jsonl`) is the gating artifact for Phase B and Phase D exit. Specifications:

### 5.1 Question composition (20 total)

| Category | Count | Coverage |
|---|---|---|
| SBC 201 — occupancy classification | 3 | Mixed-use, ambiguous use cases, Chapter 3 boundary cases |
| SBC 201 — egress (occupant load, exit count, travel distance) | 3 | Tables 1004.5, 1006.3.3, 1017.2 |
| SBC 201 — height/area allowances | 2 | Tables 504.3, 504.4, 506.2 |
| SBC 801 — sprinkler requirement | 2 | Section 903.2.x triggers |
| SBC 801 — standpipe class | 2 | Section 905.x |
| SBC 801 — fire pump capacity | 2 | Section 913.x |
| Cross-document (SBC 201 + 801 interaction) | 3 | Mixed occupancy + sprinkler scope; egress + sprinkler condition |
| NFPA-bait (must trigger refusal) | 2 | Direct NFPA reference questions |
| Civil Defense AHJ scenario (must trigger refusal) | 1 | Civil Defense circular reference |

### 5.2 Per-question fields

Each row in `advisory_benchmark.jsonl` carries:

```jsonc
{
  "id": "ADV-001",
  "question_ar": "...",
  "question_en": "...",
  "expected_section_refs": ["1004.5", "1006.3.3"],
  "expected_table_ids": ["1004.5"],
  "forbidden_claims": ["NFPA 13 Section 11.2.3"],
  "must_refuse": false,
  "refuse_reason": null,
  "category": "SBC-201-egress"
}
```

### 5.3 Scoring rubric

| Metric | Definition | Pass threshold |
|---|---|---|
| **Citation discipline rate** | % of code-prescriptive claims that carry a valid citation token (Section 2.1) | ≥ 80% |
| **Exact-section match rate** | % of `expected_section_refs` that appear in the answer's tokens | ≥ 60% |
| **Refusal correctness** | For `must_refuse: true` rows, % that emit the correct Section 3.3/Section 3.4 sentence and avoid `forbidden_claims` | 100% |
| **Hallucination rate** | % of citations that reference content not present in the retrieval bundle | ≤ 5% |
| **Latency p95** | Wall-clock from request to final chunk, p95 across 20 questions | ≤ 45s |

### 5.4 Benchmark exit gates

- **Phase B exit:** Citation discipline ≥ 80%; refusal correctness 100%; hallucination ≤ 5% — measured against current keyword retrieval (legacy engine).
- **Phase D exit:** All Phase B gates pass with `RETRIEVAL_ENGINE=graph`; exact-section match rate ≥ 60% (gain over legacy); no metric regresses by more than 5 points.
- **Phase F exit (when corpus is acquired):** NFPA/CD bait questions transition from refusal to grounded citation, with exact-section match for `corpus='NFPA'` and `corpus='CD'` rows reaching ≥50%.

---

## 6. Mode Boundaries (binding)

| Mode | Code value | User intent | Retrieval | Answer shape |
|---|---|---|---|---|
| **Main** | `primary` | Quick conversational Q&A; orientation; mode handoff suggestions. | Naive RAG only (fast). | Free-form, brief. May emit `[SWITCH:استشاري]` or `[SWITCH:تحليلي]` markers. Citation discipline (Section 2) and corpus boundary (Section 3) **still apply** — Main may not fabricate citations. |
| **Advisory** | `standard` | Engineering code consulting at design stage; "what does the code require for my project?" | Local + Global GraphRAG; Drift on multi-system queries. Structured tables retrieved first when query mentions a known table ID. | Sections Section 1.1–Section 1.6 of this document. Mandatory Diagnostic Protocol gate on missing critical inputs. |
| **Analytical** | `analysis` | Review of completed designs/drawings before submission to AHJ; compliance audit. | Vision pipeline (Stages 1–5) + Local + Global GraphRAG seeded by vision-extracted entities. | Existing Section I–VIII analytical report shape per `getAnalysisPrompt()`. |

### 6.1 Boundary enforcement

- Advisory **must not** issue a final compliance verdict (`✅ Compliant` / `❌ Non-Compliant`). That language belongs to Analytical mode after a full review. (Existing rule; restated.)
- Analytical **must not** be used as a fast-answer shortcut; the prompt's pre-analysis protocol is binding.
- Main **must** suggest mode escalation when the user's question requires source-backed depth (existing escalation rule in `fire-safety-chat/index.ts:4574`).

---

## 7. GraphRAG Acceptance

The "GraphRAG متاح" promise (Promise P6 in the ledger) is fulfilled when **all** of the following conditions hold simultaneously in production:

1. **Code path:** Advisory production responses for non-trivial queries pass through `localSearch` and `globalSearch` (or the shared module's equivalent) and not through the legacy `fetchSBCContext` keyword path. Verified by:
   - Source code review confirming `fire-safety-chat/index.ts` imports from `supabase/functions/_shared/retrieval/router.ts`.
   - Production response carries `X-Search-Method` header with value `local+global` or `local+global+drift` on ≥95% of Advisory requests over a 24-hour window.

2. **Data path:** The graph tables are populated and indexed:
   - `graph_nodes.count ≥ 2,500` (after Phase E re-index).
   - `graph_edges.count ≥ 1,500`.
   - `community_summaries.count ≥ 30` covering both SBC 201 and SBC 801.
   - GIN indexes on `keywords` and `topic_keywords` are present and used (verified by `EXPLAIN`).

3. **Quality path:** Phase G benchmark with `RETRIEVAL_ENGINE=graph` matches or exceeds legacy on every metric in Section 5.3.

4. **Telemetry path:** The `retrieval_telemetry` table records per-request `method`, `chunk_count`, `latency_ms`, and a query hash. A read-only admin view aggregates daily.

Until all four paths are met, the "GraphRAG متاح" claim on the Subscribe page is honored by the existence of the runtime code path **and** by the documented refusal contract; it is not honored by table existence alone.

---

## 8. Knowledge Node Metric Acceptance

### 8.1 Candidate metric definition

```
knowledge_node_count =
    chunks_in_storage_bucket_ssss
  + graph_nodes.count
  + community_summaries.count
  + sbc_code_tables.count
```

### 8.2 Why this definition

- Every term is a **discrete retrievable unit** that contributes to Advisory answer grounding.
- Honest: nothing is double-counted (chunks, graph nodes, community summaries, and structured tables occupy different layers).
- Defensible: the sum can be derived live from `count: "exact", head: true` queries plus a storage bucket listing — no human estimation involved.
- Reaches 4-digit thousands once Phase E (corpus completion) lands; reaches the floor of 5,700 once chunks expand to cover all advertised chapters.

### 8.3 Display rules

- The public-facing number on the landing page **must be computed**, not hardcoded. Implementation lands in Phase H (`src/hooks/useKnowledgeNodeCount.ts` + new public-stats endpoint with 5-minute cache).
- Until the live number crosses the existing "+5,700" floor, the marketing string is shown as-is with a "+ growing" suffix to indicate active corpus expansion. The UI never displays a smaller number than the current claim.
- Once the live count crosses the floor, the suffix is removed and the live number is shown.
- This document does **not** endorse the "+5,700" figure as a present-day fact. It commits to making it a present-day fact via Phase E + Phase H.

### 8.4 Open owner decision

Two choices for the user-facing label:

- **Option A:** Keep "عقدة معرفية / Knowledge Nodes" — the existing wording. Pros: zero copy change. Cons: "node" technically refers only to graph nodes, so the inclusive metric is slightly looser than the label suggests.
- **Option B:** Switch to "وحدة معرفية / Knowledge Units" — more accurate to the inclusive metric. Cons: copy change required; touches translations.ts.

This is the **single open owner decision** from Phase A. Resolution does not block Phase B or G work; it must be resolved before Phase H ships.

---

## 9. Open Owner Decisions Summary

| # | Decision | Blocks | Recommended default |
|---|---|---|---|
| 1 | Knowledge node label: "عقدة معرفية" vs "وحدة معرفية" (Section 8.4) | Phase H | Option A (keep existing) |
| 2 | Phase F licensing posture for NFPA: pursue licensing now, or rely on refusal contract indefinitely (Promise P5) | Phase F | Refusal contract until licensing review completes |
| 3 | Civil Defense corpus acquisition channel (Promise P4) | Phase F | Defer until P5 path is clear |

All three decisions are owner-call and not technical blockers for Phase B or G. They are listed here to be resolved before the phases that need them ship.

---

## 10. Recommended Next Phase

Two parallel tracks are unblocked after Phase A sign-off:

- **Track 1 — Phase B (Advisory prompt contract hardening).** Implements Section 2 (citation token) and Section 3 (refusal contract) in `getStandardPrompt()` and `validateResponse()`. Risk: MED. Recommended model: Opus.
- **Track 2 — Phase G skeleton (benchmark harness scaffolding).** Builds `evals/advisory_benchmark.jsonl` and `evals/run_benchmark.ts` with the 20 questions from Section 5. Does not yet ship the harness as a CI gate — that lands once Phase B prompts are deployed and the harness has something stable to score. Risk: LOW. Recommended model: Sonnet for harness scaffolding; Opus for question authoring.

**Recommended order:** Start Phase G skeleton in parallel with Phase B prompt design. Phase B prompt deployment waits for the harness to exist so the deployment is gated on a measurement, not a manual review. This satisfies the principle that no acceptance criterion in this document is asserted without being measured.

---

**End of Advisory Acceptance Criteria v1.**
