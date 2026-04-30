# ConsultX — Promise Ledger v1

**Status:** Draft — awaiting owner sign-off
**Date:** 2026-04-30
**Phase:** A (Documentation Only)
**Scope:** Inventory of all current ConsultX product promises that the Advisory Promise Realization Master Plan must make technically true.

> **Operating principle:** No promise on this ledger is to be removed or softened. Each row defines what must become true in production for the promise to be honest, the technical work required, and the phase that delivers it.

---

## How to read this ledger

| Column | Meaning |
|---|---|
| `promise_id` | Stable identifier used by downstream phase artifacts and benchmark questions. |
| `promise` | The user-visible claim, in the language it appears. |
| `ui_location` | Exact file/component/line where the promise surfaces today. |
| `status_today` | Verified state at HEAD as of 2026-04-30 (no implementation work has occurred since). |
| `gap` | The specific technical fact that prevents the promise from being literally true today. |
| `target_truth` | The state the system must reach for the promise to be honestly defensible. |
| `required_systems` | Subsystems that must change to close the gap (corpus / retrieval / prompt / citation UI / metrics / benchmark). |
| `acceptance_criteria` | Measurable assertion that confirms the promise has been realized. |
| `target_phase` | Phase letter (B–I) from the master plan that delivers this promise. |
| `risk_if_unfulfilled` | Consequence of leaving the gap open (trust, legal, retention). |
| `owner_signoff` | Blank — owner initials when row is approved as binding. |

---

## P1 — Precise engineering answers from fire protection codes

| Field | Value |
|---|---|
| **promise_id** | P1 |
| **promise** | Precise engineering answers grounded in fire protection codes; no guessing. |
| **ui_location** | Hero claim on landing; reinforced in `src/components/FAQSection.tsx:15-16` (AR + EN); Advisory mode framing throughout `ChatInterface.tsx`. |
| **status_today** | Partially true. The Advisory system prompt (`getStandardPrompt()` in `supabase/functions/fire-safety-chat/index.ts`) enforces a Mandatory Diagnostic Protocol, verbatim quotation rules, and certainty labels. The retrieval layer underneath, however, is keyword-only over JSON chunks in bucket `ssss` — it does not yet exercise the indexed knowledge graph. |
| **gap** | Retrieval recall is bounded by keyword overlap; the model can produce engineering-quality prose grounded in whatever chunks happen to match keywords, missing semantically related sections. |
| **target_truth** | Advisory retrieval routes through the shared GraphRAG module (Phase D) and structured tables (existing `sbc_code_tables`); the prompt is hardened (Phase B) to refuse claims not supported by retrieved evidence. |
| **required_systems** | Prompt (Phase B) + Retrieval (Phase D) + Benchmark (Phase G). |
| **acceptance_criteria** | Phase G benchmark shows ≥80% citation discipline rate; ≤5% hallucinated section/table values; no confident answer emitted when critical inputs are missing. |
| **target_phase** | B + D, validated by G. |
| **risk_if_unfulfilled** | Engineering trust erosion; users discover citation gaps and abandon Advisory mode. |
| **owner_signoff** | _____ |

---

## P2 — Every answer references the closest exact SBC source/section when possible

| Field | Value |
|---|---|
| **promise_id** | P2 |
| **promise** | "كل إجابة تُحيل إلى الفقرة الدقيقة من المعيار المعتمد" / "Every answer cites the exact clause." |
| **ui_location** | `src/components/FAQSection.tsx:15-16`; reinforced by SourcePanel UI (`src/components/SourcePanel.tsx`). |
| **status_today** | Partial. Citations are exact for queries that match a known structured table ID (e.g. "Table 1004.5") because `fetchStructuredTables` resolves these against `sbc_code_tables`. For all other queries, source precision is `chunk_range_only` — i.e. file-level page range like "Pages 1–250" — not section-level. |
| **gap** | `graph_nodes` lack a normalized `section_ref` column. Chunk-level metadata in storage JSON does not carry exact section IDs. SourcePanel cannot deep-link to a specific section. |
| **target_truth** | Indexer enriches every node with `section_ref` and `section_confidence`; retrieval propagates these into `X-SBC-Source-Meta`; SourcePanel renders a section badge and opens the PDF at the cited section's page. When section_ref is unavailable, citation visibly degrades to page range with confidence label. |
| **required_systems** | Migration (add columns) + Indexer (Phase C) + Retrieval pass-through + SourcePanel UI (Phase I) + Benchmark (Phase G). |
| **acceptance_criteria** | After Phase C re-index: ≥70% of `graph_nodes` carry `section_confidence IN ('high','medium')`; benchmark answers cite exact section in ≥60% of code-prescriptive claims; remainder explicitly degrade to "pp.X-Y" with `conf:medium`. |
| **target_phase** | C, validated by G. |
| **risk_if_unfulfilled** | The "exact clause" promise drives engineering trust; vague page ranges look amateur next to competing tools that cite section IDs. |
| **owner_signoff** | _____ |

---

## P3 — SBC 201 and SBC 801 coverage

| Field | Value |
|---|---|
| **promise_id** | P3 |
| **promise** | Comprehensive coverage of SBC 201 (General Building Code) and SBC 801 (Fire Protection Code), 2024 edition. |
| **ui_location** | Multiple: HeroSection, HowItWorksSection, FAQSection, prompt expertise framing in `getStandardPrompt():109`. |
| **status_today** | True at the corpus level — both standards are present in storage bucket `ssss` as `_chunks.json` files (admin dashboard reports 18 indexed files). However, `sbc_code_tables` has only 6 SBC 201 tables seeded and **zero** SBC 801 tables. |
| **gap** | Structured-table coverage of SBC 801 is empty; chunk coverage may be uneven across chapters; depth of indexing into SBC 801 Chapters 9 (sprinklers), 10 (standpipes), 11 (alarms) is not yet measured. |
| **target_truth** | `sbc_code_tables` carries ≥20 SBC 801 rows (sprinkler density, standpipe class, pump capacity, occupant-load tables); chunk inventory documents which chapters of each standard are fully indexed; Phase G benchmark covers both standards proportionally. |
| **required_systems** | Data seeding (Phase E) + indexer re-run (Phase E) + benchmark (Phase G). |
| **acceptance_criteria** | `SELECT COUNT(*) FROM sbc_code_tables WHERE source_code='SBC 801'` ≥ 20; chunk-coverage report shows every advertised chapter has ≥1 indexed chunk; Phase G benchmark passes for both standards. |
| **target_phase** | E (deepen), validated by G. |
| **risk_if_unfulfilled** | Asymmetric coverage means Advisory answers about fire-protection systems (the most engineering-critical territory) are systematically weaker than answers about building classification. |
| **owner_signoff** | _____ |

---

## P4 — Civil Defense / AHJ consideration when source-backed

| Field | Value |
|---|---|
| **promise_id** | P4 |
| **promise** | ConsultX considers Civil Defense / Authority Having Jurisdiction (AHJ) requirements when source material supports it. |
| **ui_location** | `src/components/HowItWorksSection.tsx:31` ("SBC, NFPA, or Civil Defense"); `src/lib/translations.ts:375-376` footer label "أنظمة الدفاع المدني"; prompt framing in `getStandardPrompt()`. |
| **status_today** | False at the corpus level. No Civil Defense PDF, JSON, or graph node exists in any Supabase bucket. The claim is currently prompt-level only — the model is told to consider Civil Defense, but has no retrievable Civil Defense corpus to ground citations against. |
| **gap** | No indexed Civil Defense source material; no licensing review documenting which Civil Defense circulars/standards are usable. |
| **target_truth** | Two-track honesty (master plan Section 8). **Track 1 (today):** prompt contract requires Advisory to refuse fabricated Civil Defense citations and emit the standard refusal sentence (see `advisory-acceptance.md` Section 3). **Track 2 (when corpus acquired):** Civil Defense PDFs uploaded to `source-pdfs/civil-defense/`, indexed by `sbc-graph-indexer` with `corpus='CD'` tag, retrieved via the same shared retrieval module. |
| **required_systems** | Prompt refusal contract (Phase B) → corpus acquisition → indexing extension (Phase F). |
| **acceptance_criteria** | Either (a) `SELECT COUNT(*) FROM graph_nodes WHERE corpus='CD'` > 0 and Advisory cites Civil Defense when relevant chunks are retrieved, or (b) Advisory emits the refusal sentence on 100% of Civil Defense bait questions in Phase G benchmark. |
| **target_phase** | B (Track 1) + F (Track 2). |
| **risk_if_unfulfilled** | Confident Civil Defense citations without source backing are a regulatory misrepresentation risk in Saudi engineering practice. |
| **owner_signoff** | _____ |

---

## P5 — NFPA consideration when source-backed

| Field | Value |
|---|---|
| **promise_id** | P5 |
| **promise** | ConsultX considers NFPA standards (e.g. NFPA 13, NFPA 72, NFPA 101) where applicable. |
| **ui_location** | HowItWorksSection, FAQ, Subscribe page plan tables, prompt expertise framing. |
| **status_today** | False at the corpus level. Same as P4: no NFPA files in any bucket, no `nfpa_*` corpus tag, no NFPA chunks. NFPA is referenced only inside system prompts as a domain frame for the model. |
| **gap** | No indexed NFPA corpus; NFPA standards are licensed material, so import is gated on legal review. |
| **target_truth** | Same two-track structure as P4. **Track 1:** refusal sentence on every NFPA reference attempt. **Track 2:** licensed NFPA pack uploaded under `source-pdfs/nfpa/`, indexed with `corpus='NFPA'`, citation rules give SBC priority and surface NFPA only when explicitly relevant. |
| **required_systems** | Prompt refusal contract (Phase B) → licensing review → corpus acquisition → indexing extension (Phase F). |
| **acceptance_criteria** | Either (a) `SELECT COUNT(*) FROM graph_nodes WHERE corpus='NFPA'` > 0 with citations gated to retrieved chunks, or (b) NFPA bait questions in Phase G benchmark trigger refusal sentence in 100% of cases. |
| **target_phase** | B (Track 1) + F (Track 2). |
| **risk_if_unfulfilled** | Same as P4 plus copyright exposure if model paraphrases NFPA content from training data without licensed source. |
| **owner_signoff** | _____ |

---

## P6 — GraphRAG available

| Field | Value |
|---|---|
| **promise_id** | P6 |
| **promise** | "GraphRAG متاح" / "GraphRAG enabled" — sold as a paid-plan feature on the Subscribe page. |
| **ui_location** | `src/pages/Subscribe.tsx:499-501` (per-plan checkbox); `src/components/CoreBenefitsSection.tsx:111` (landing benefit bullet); `src/components/InChatUpgradePrompt.tsx:87,92`; prompt mention at `fire-safety-chat/index.ts:4567` (Primary mode only). |
| **status_today** | False at runtime. The graph schema is populated (`graph_nodes`=171, `graph_edges`=133, `community_summaries`=10) but **no production query path reads these tables**. The full GraphRAG runtime (`localSearch + globalSearch + driftSearch + fetchContextRouter`) lives in `supabase/functions/fire-safety-chat-v2/index.ts:471-786` but v2 is confirmed not used (zero frontend references). Production `fire-safety-chat` falls through to `fetchSBCContext()` — keyword storage retrieval — and the comment at line 4599 reads `// vector RPC (match_sbc_documents) is not provisioned`. |
| **gap** | Production code path does not invoke GraphRAG functions; the `match_sbc_documents` RPC and pgvector table do not exist in the database. |
| **target_truth** | A shared retrieval module under `supabase/functions/_shared/retrieval/` contains the four search functions lifted verbatim from v2; both `fire-safety-chat` and `fire-safety-chat-v2` import from this module; routing is mode-driven (Main → naive RAG only; Advisory → always local+global, with drift on multi-system queries; Analytical → local+global seeded by vision entities); responses carry an `X-Search-Method` header. |
| **required_systems** | Shared retrieval module extraction + production cutover with feature flag (Phase D) + telemetry table + benchmark proof (Phase G). |
| **acceptance_criteria** | Advisory production responses carry `X-Search-Method` header showing `local+global` or `local+global+drift` in ≥95% of requests; Phase G benchmark with `RETRIEVAL_ENGINE=graph` matches or exceeds legacy on citation discipline; v1 keyword path retained behind env flag for one-week rollback window. |
| **target_phase** | D, validated by G. |
| **risk_if_unfulfilled** | Highest commercial-honesty risk on this ledger: GraphRAG is a paid-plan differentiator. Selling a feature that does not run is the single biggest exposure. |
| **owner_signoff** | _____ |

---

## P7 — Knowledge graph / knowledge nodes claim ("+5,700")

| Field | Value |
|---|---|
| **promise_id** | P7 |
| **promise** | "+5,700 عقدة معرفية" / "5,700+ Knowledge Nodes." |
| **ui_location** | `src/lib/translations.ts:332` (AR), `:732` (EN); `src/components/CoreBenefitsSection.tsx:112` (landing bullet). |
| **status_today** | Hardcoded translation string. The actual live count exposed by `supabase/functions/admin-stats/index.ts:71-77` (`graph_nodes` rows) is 171. The "5,700" figure is not computed and has no data backing. |
| **gap** | The displayed value is a literal, not a derived metric. Even if the graph were grown to 5,700 nodes, the UI would not reflect it. |
| **target_truth** | The displayed knowledge-node count is computed from a defensible definition: `knowledge_node_count = chunks_in_ssss + graph_nodes.count + community_summaries.count + sbc_code_tables.count`. Each term is a discrete retrievable knowledge unit; the sum is honestly defensible and crosses 4-digit thousands after Phase E. UI never displays a smaller number than the current "5,700" claim — until the live count crosses the floor, the marketing claim is shown verbatim with a "+ growing" suffix; once it crosses, the live number takes over. |
| **required_systems** | Corpus growth via indexer re-run (Phase E) + structured-table seeding (Phase E) + dynamic metric edge function + frontend hook + translation placeholder (Phase H). |
| **acceptance_criteria** | After Phase E: live count from new public-stats endpoint ≥ 5,700; landing and admin display the same number from the same source; CI test asserts `count ≥ 5700`. |
| **target_phase** | E (grow corpus) + H (dynamic metric). |
| **risk_if_unfulfilled** | A 33× overstatement (171 vs 5,700) visible to any user who clicks Admin is a direct credibility hit. |
| **owner_signoff** | _____ |

---

## P8 — Visual plan analysis

| Field | Value |
|---|---|
| **promise_id** | P8 |
| **promise** | Engineering drawings can be uploaded and analyzed visually for fire-safety compliance. |
| **ui_location** | HeroSection upload affordance; Analytical mode framing; `runVisionPipeline()` in `fire-safety-chat/index.ts`. |
| **status_today** | True. The 5-stage vision pipeline (Planning → Chain-of-Thought → SBC retrieval → Merge → Final) runs on Gemini 2.5 Pro and emits structured analytical reports. Drawing text-layer extraction and page inventory are wired through. |
| **gap** | None for the basic promise. Stage 3 retrieval falls back to keyword search when the vector RPC is unavailable; this is improved by Phase D, but the promise itself is honored. |
| **target_truth** | Same as today — promise is met. Phase D will upgrade vision retrieval quality without changing the user-facing capability. |
| **required_systems** | None to fulfill the promise. Phase D incidentally improves it. |
| **acceptance_criteria** | A test image upload completes the 5-stage pipeline and produces a citation-bearing analytical response. (No regression gate beyond ongoing benchmark.) |
| **target_phase** | None (already met). |
| **risk_if_unfulfilled** | n/a — already true. |
| **owner_signoff** | _____ |

---

## P9 — Three modes (Main / Advisory / Analytical)

| Field | Value |
|---|---|
| **promise_id** | P9 |
| **promise** | Three operating modes with distinct purposes: Main (rapid Q&A), Advisory (engineering consulting), Analytical (review of completed designs). |
| **ui_location** | `src/components/ChatInterface.tsx:90` (`ChatMode` type), mode picker UI, landing mode descriptions. |
| **status_today** | True. All three modes exist, route to distinct prompts, have distinct color identities (cyan / orange / crimson), and enforce per-mode quotas. |
| **gap** | Boundary purity: vision pipeline currently flips Primary mode with images into Advisory framing (`fire-safety-chat/index.ts:4522`), which is a useful UX behavior but should be made explicit in user-facing copy. |
| **target_truth** | Mode boundaries are documented (this ledger) and enforced. Advisory and Analytical retrieval paths diverge correctly under the new shared retrieval module (Phase D). |
| **required_systems** | None to fulfill the promise. Phase D refines the boundary. |
| **acceptance_criteria** | All three modes remain functionally distinct; `validateResponse()` rules in `ChatInterface.tsx:533` continue to enforce the per-mode answer shape. |
| **target_phase** | None (already met). |
| **risk_if_unfulfilled** | n/a — already true. |
| **owner_signoff** | _____ |

---

## P10 — Advisory Mode as a real engineering code-consulting mode

| Field | Value |
|---|---|
| **promise_id** | P10 |
| **promise** | Advisory is a substantive consultant — not a keyword search dressed in code-speak. Engineers receive design-stage guidance grounded in retrievable code clauses. |
| **ui_location** | `ChatInterface.tsx:1551-1554` (mode badge "الوضع الاستشاري"); landing copy describing Advisory as the consultant-level mode. |
| **status_today** | Partial. The Advisory prompt is strong (Mandatory Diagnostic Protocol, 4-section answer template, certainty labels). The retrieval underneath is keyword-only, which limits the prompt's effectiveness on semantically phrased questions. There is no benchmark suite to measure Advisory quality, no telemetry to detect regression, and the citation discipline is not enforced by the validator beyond loose regex on the Document/Section keywords. |
| **gap** | Three combined: weak retrieval (P1, P2, P6 root cause), no benchmark, soft citation enforcement. Together these mean Advisory quality varies invisibly. |
| **target_truth** | Advisory runs on the shared GraphRAG retrieval module (Phase D), with the hardened prompt contract (Phase B), measured by the 20-question benchmark suite (Phase G). Citation discipline is enforced by `validateResponse()` — every Advisory answer must contain at least one `[SBC-...]` citation token OR an explicit corpus-boundary refusal sentence. |
| **required_systems** | Prompt (Phase B) + Retrieval (Phase D) + Benchmark (Phase G) + Validator extension (Phase B). |
| **acceptance_criteria** | Phase G benchmark exit gate: ≥80% citation discipline; 100% refusal correctness on NFPA/CD bait; ≤5% hallucination rate; p95 latency ≤45s. Manual review of 5 sample Advisory answers by a domain engineer confirms consultant-level quality. |
| **target_phase** | B + D + G. |
| **risk_if_unfulfilled** | Advisory is ConsultX's main differentiator over generic LLMs. Failing to deliver consultant-level grounding here erodes the entire product proposition. |
| **owner_signoff** | _____ |

---

## Cross-cutting notes

### D:\sbc_consultx availability

The external corpus/brain at `D:\sbc_consultx` is **not available** on this machine as of 2026-04-30. None of the promises on this ledger depend on it. Should it become available, P3 (SBC 801 table seeding) and P2 (section_ref backfill) phase work would be accelerated; ledger acceptance criteria do not change.

### Promises not on this ledger

If a UI claim is discovered during Phase B–I work that is not represented here (for example a feature bullet on a future pricing redesign or a copy claim added in a marketing iteration), append a new row before that phase begins. The ledger is a living document until all claims are sign-off green.

### Sign-off protocol

Each row's `owner_signoff` column is initialed by the owner (Waseem Najajreh) when:
1. The acceptance criteria language is approved as binding,
2. The target phase assignment is correct, and
3. The risk language is acceptable for inclusion in any external compliance documentation.

Once all 10 rows are signed off, this ledger becomes the authoritative reference for Phase B–I implementation.

---

**End of Promise Ledger v1.**
