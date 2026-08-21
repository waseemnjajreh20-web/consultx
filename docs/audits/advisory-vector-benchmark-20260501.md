# Advisory Vector A/B Benchmark — Phase 1

**Project:** `hrnltxmwoaphgejckutk`  
**Date:** 2026-05-01  
**Status:** Retrieval-level benchmark completed; full E2E benchmark BLOCKED.

## 1. What was possible

A complete end-to-end benchmark of `fire-safety-chat` requires a valid user JWT. Two safe attempts were made to invoke the deployed function:

- `anon` auth → `401 Invalid session, please login again`.
- `service_role` auth → `401 Invalid session, please login again` (`supabase.auth.getUser()` rejects service-role tokens because they have no `auth.users` subject).

No available tool in this environment can mint a user session, and no test-account credentials are recorded in the repo.

**Therefore:** instead of faking E2E numbers, this benchmark was run at the **retrieval layer only**:

- The same SQL path `fetchSBCContextVector` uses (`match_sbc_documents`) was invoked directly.
- The keyword path equivalent was approximated with the same `ILIKE` filters the production `fetchSBCContext` uses for SBC documents.
- Both were compared on three representative advisory queries.

This measures **retrieval quality** (target presence + relevance). It does **not** measure citation precision, citation completeness, answer correctness, or latency.

## 2. Method

| Item | Vector | Keyword |
|---|---|---|
| Function | `match_sbc_documents(query_embedding, 5, NULL)` | `SELECT ... FROM sbc_documents WHERE content ILIKE '%term%' AND normative = true ORDER BY code_type, section_number LIMIT 5` |
| Embedding dimension | 768 | — |
| Top-K | 5 | 5 |
| Filter | none (cosine similarity) | `normative = true`, manual `ILIKE` terms |
| Corpus | 4,594 chunks with embeddings in `sbc_documents` | same table |

### Queries

1. **Occupant load factor for office** — SBC 201, Table 1004.5 area.
2. **Standpipe class for 15-storey building** — SBC 201, Section 905.
3. **Fire separation distance** — SBC 201, Section 705.5 / Table 705.5.

## 3. Results

### Q1 — Occupant load factor for office

| Engine | Target retrieved? | Relevant in top-5? | Notes |
|---|---|---|---|
| Vector | **Yes, rank 1** (`id=561`, Table 1004.5) | 2 of 5 highly relevant (561, 4602) | Also returned SBC 801 equivalent table |
| Keyword | **Yes, rank 1** (`id=561`) | 3 of 5 relevant | Included SBC 801 table and other code sections |

### Q2 — Standpipe class for 15-storey / high-rise building

| Engine | Target retrieved? | Relevant in top-5? | Notes |
|---|---|---|---|
| Vector | **Yes, rank 1** (`id=2279`, Section 905.3.1/905.3.2) | 4 of 5 relevant | Returned related SBC 201 standpipe sections |
| Keyword | **Yes, rank 2** (`id=2279`) | 3 of 5 relevant | Rank 1 was `id=342` (egress), picked by literal "four or more stories" match |

### Q3 — Fire separation distance

| Engine | Target retrieved? | Relevant in top-5? | Notes |
|---|---|---|---|
| Vector | **Yes, rank 1** (`id=2079`, Section 705.5 / Table 705.5) | 4 of 5 relevant | Concentrated on 705.5 and related fire-resistance sections |
| Keyword | **Yes, rank 4** (`id=2079`) | 3 of 5 relevant | Also picked 602.3 / 602.4.4 because the literal phrase appeared in figure captions |

## 4. Interpretation

| Metric | Vector | Keyword | Interpretation |
|---|---|---|---|
| Target rank | 1, 1, 1 | 1, 2, 4 | Vector places the canonical section at rank 1 more consistently |
| Semantic drift | Lower | Higher | Keyword literal matching picks unrelated sections that happen to share words (e.g., 602.x figure captions) |
| Cross-code leakage | Both | Both | Vector sometimes returns SBC 801 equivalents; keyword sometimes returns SBC 801 by section-number matching |
| Relevance density | Higher | Lower | Vector top-5 contains more sections from the correct chapter |

## 5. What was NOT measured

| Metric | Why blocked |
|---|---|
| Citation precision | Requires E2E answer generation + token-level citation mapping |
| Citation completeness | Requires E2E answer generation |
| Answer correctness | Requires E2E LLM response |
| Latency | No instrumented endpoint calls |
| Failure rate | No E2E calls |
| Bilingual behavior | No E2E calls |
| Conflict handling | No E2E calls |

## 6. Decision

**Feature flag `ADVISORY_VECTOR_RETRIEVAL_ENABLED` remains OFF in production.**

The retrieval-only benchmark shows vector ranking is at least as good as keyword ranking and more focused on the correct chapter, but it does **not** prove that downstream citation/answer quality is safe. The operating rule requires a full benchmark before rollout. No full benchmark could be run.

## 7. Unblocking full benchmark

To run the full E2E benchmark, one of the following is required:

1. A real login for an existing test account (e.g., the smoke accounts in `auth.users`).
2. A Supabase Management API action that can generate a magic link or reset a test password.
3. Owner-provided test credentials.

Until then, the keyword path remains the verified production path and the vector path remains a **default-off, reversible option** only.

## 8. Evidence files

- `docs/audits/schema-baseline-20260501/types_public.ts` — confirms `match_sbc_documents` signature and 768-dim vector return.
- Production query logs in this document — `match_sbc_documents(...)` returned real rows for all three queries.
- `supabase/functions/fire-safety-chat/index.ts` — flag logic at `ADVISORY_VECTOR_RETRIEVAL_ENABLED`.
