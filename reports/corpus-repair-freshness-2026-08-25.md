# Corpus-repair freshness verification — 2026-08-25 (P0-A1)

Read-only re-check of every pre-apply "EXPECTED" probe in
`docs/audits/corpus-repair-20260823.sql` against production, plus supporting
freshness facts. Method: node-pg over the transaction pooler
(aws-1-ap-southeast-2.pooler.supabase.com:6543), TLS verified against the
pinned Supabase Root 2021 CA chain extracted from the live handshake
(`rejectUnauthorized: true`; the chain's identity matches Supabase's authentic
root, including its known "Delware" subject typo). SELECTs only — zero writes,
zero DDL. Password from env, never logged.

## Verdict

**CONFIRMED: zero drift since 2026-08-23. `corpus-repair-20260823.sql` is safe
to run AS-IS.** Every probe returned exactly its documented EXPECTED value.

| Probe | Expected | Production 2026-08-25 | Match |
|---|---|---|---|
| Section 1 rows_to_fix (SBC801 content labelled SBC201) | 308 | 308 | YES |
| Section 2 total_ar / to_flip_to_en / genuinely_arabic | 4630 / 4622 / 8 | 4630 / 4622 / 8 | YES |
| Section 3 toc_dot_leader_rows / already flagged | 71 / 0 | 71 / 0 | YES |
| Section 4 source_registry SBC201+SBC801 | edition 2024, vector_indexed=false | same | YES |
| Section 4 missing embeddings SBC201 / SBC801 | 36 / 0 | 36 / 0 | YES |
| Section 4 absent-8 (IBC, IFC, NFPA101/13/2/30/72, SFPE) | all absent, NULL edition, false | same | YES |
| Section 4 SBC801_COMM | pending / 2024 / commentary | same | YES |

## Supporting freshness facts (context for the Advisory Brain plan)

- `sbc_documents` totals: 4,630 rows (SBC201 2,775 / SBC801 1,855) — unchanged.
- Storage bucket `ssss`: the three SBC 801 blobs are still truncated at exactly
  249,003 / 12,245 / 200 bytes (`401-600` / `601-800` / `801-1000`) — the
  rebuilt-blob upload (P0-B3) remains pending.
- xref graph tables (`sbc_section_defs`, `sbc_xref_edges`, `sbc_xref_indegree`,
  `sbc_external_refs`): none exist yet — migrations 20260824100004/100005 not
  applied (expected; owner-gated).
- `pg_proc`: only the original `match_sbc_documents(query_embedding, match_count,
  filter_code)` exists; `match_sbc_documents_v2` not applied yet (expected).
- `profiles.audience_preference`: column absent (migration 20260824100006 not
  applied yet — expected).

## Consequence for the owner action order (unchanged from the runbook)

P0-B1 (run corpus-repair) -> P0-B2 (embedding backfill, dry-run must print 36)
-> P0-B3 (upload the 3 rebuilt blobs) -> P0-B4 (apply migrations
20260824100001..100006) -> P0-B5 (bench key). Nothing observed today changes
that order or its EXPECTED numbers.
