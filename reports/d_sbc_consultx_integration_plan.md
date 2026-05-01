# D:\sbc_consultx → ConsultX Live — Integration Plan

**Date:** 2026-05-01
**Companion to:** `reports/d_sbc_consultx_architecture_audit.{md,json}`
**Status:** plan only. Nothing implemented in this report.

---

## Goals

1. Stop one-off manual row authoring. Drive every future `sbc_code_tables` row from the canonical Layer-C section MD via a deterministic generator.
2. Surface the existing local cross-code reasoning (12 PROVEN edges) inside live answers.
3. Lift Advisory retrieval out of the page-range bucket-chunk-only path into section-aware retrieval, with the `match_sbc_documents` RPC enabled and the `sbc_documents` rows backed by clean Layer-C bodies.
4. Defer GraphRAG activation until Layer B (canonical chunks) is in place — graph edges without clean nodes are noise.

## Scope guards (re-stated)
- No payment / Moyasar.
- No Enterprise tables.
- No prompt restructuring beyond what alias additions trivially require.
- No PDF re-extraction (Layer C is the canonical text source).
- No section-symbol character introduction.

---

## Phase 0 — Immediate: fix the live 907.2.7 surfacing bug

| Item | Detail |
|---|---|
| Change | widen the SEMANTIC_ALIAS co-occurrence window for the two `907.2.7` regexes from `[\s\S]{0,80}` to `[\s\S]{0,400}` in `supabase/functions/fire-safety-chat/index.ts` (Step 4.2 block). |
| Risk | low — same shape as existing aliases. |
| Files | `supabase/functions/fire-safety-chat/index.ts` only. |
| DB | none. |
| Deploy | one edge function (`fire-safety-chat`). |
| Validation | live retest the Mercantile / 1,200 m² question; both `🗂️ 903.2.7` and `🗂️ 907.2.7` chips must appear; no expected-reference fallback for 907.2.7. |
| Rollback | `git revert` the alias edit; redeploy. |

This is the single command needed to close the live failing-case loop.

---

## Phase 1 — Generator-driven structured-table seeding (replaces manual row authoring)

### 1.1 Inputs
- `D:\sbc_consultx\sbc-{201,801}-section-*.md` (518 files).
- `D:\sbc_consultx\wiki\architecture\canonical-build-ledger.json` (550 nodes; filter to `EXISTS_CANONICAL`).
- `D:\sbc_consultx\extracted_sections.md` + `extracted_907_909*.txt` (verbatim text where the section MD's CANONICAL_SOURCE block is incomplete — e.g. 907.2.7).

### 1.2 Output
- One SQL migration per batch of ~20–30 sections. Each migration is one `BEGIN/COMMIT` with N idempotent `INSERT … ON CONFLICT DO UPDATE` statements on `public.sbc_code_tables`.
- Companion alias edits in `fire-safety-chat/index.ts` mapping 1–3 short Arabic+English keyword phrases per section to the new `table_id`.

### 1.3 Generator script (proposed, not yet authored)
File: `scripts/gen-sbc-tables-from-md.cjs`

Behavior:
1. Parse YAML frontmatter from each section MD (no extra dependencies — tiny inline parser).
2. Read `record_id` (e.g. `sbc-801-section-907`) → derive `table_id` (e.g. `907.2.7` from the section path) and `source_code` (`SBC 801` / `SBC 201`).
3. Filter against `canonical-build-ledger.json` — only `EXISTS_CANONICAL` proceeds. Emit a manifest of dropped sections for owner review.
4. Extract the body block between `> **[CANONICAL_SOURCE` and the first `> ⚠️` synthesis marker — that is the verbatim source.
5. If verbatim text is missing (stub or commentary-only), fall back to a manual override map sourced from `extracted_*.txt` line ranges.
6. Build the `content_md` field as: `## Section X.Y.Z — Title` + `**SBC … | Chapter N | Section X.Y.Z**` + verbatim body + cross-references from the frontmatter `dependencies` block.
7. Emit one INSERT per row, mirroring the Step 4.2 migration shape exactly.
8. Write the manifest to `reports/sbc-tables-seed-batch-<n>-manifest.json` for human review **before** owner runs the migration.

### 1.4 Batch order (recommended)

| Batch | Sections | Rationale |
|---|---|---|
| 1 | 903.2.1, 903.2.2, 903.2.3, 903.2.6, 903.2.8, 903.2.9, 903.2.10, 903.2.11 | full Group A/B/E/I/R/S/Underground/High-rise sprinkler triggers. Closes the Advisory "where required" question family. |
| 2 | 907.2.1, 907.2.2, 907.2.3, 907.2.6, 907.2.8, 907.2.9, 907.2.10, 907.2.11, 907.2.13 | full Group A/B/E/I/R/S alarm triggers. |
| 3 | 1006.x, 1011.x, 1014.x, 1017.x, 1020.x | egress sub-clauses most cited by Advisory egress questions. |
| 4 | 308 (institutional), 310/311 (residential/storage) sub-clauses | occupancy classification rounding. |

Each batch ≈ 20–30 rows, one migration, one alias edit. After Phase 0 the alias-window-fix pattern can be reused, and we should adopt the broader rule (drop co-occurrence — match (Mercantile OR Group M) AND (sprinkler OR alarm) anywhere in query) to keep aliases simple.

### 1.5 Acceptance per batch
- Run the existing `apply-migration-*.cjs` template; verify pre/post row counts match the planned delta exactly.
- Live retest 5 representative Advisory questions (one per occupancy group) and confirm structured chips surface.

---

## Phase 2 — Layer-C bulk import into `sbc_documents` + enable vector RPC

### 2.1 Why
- Today the Advisory text path bypasses `match_sbc_documents` because the RPC is not provisioned and `sbc_documents.section_number` drifts (Step 2.5).
- Section-level Layer-C text is clean and labelled. A re-index from Layer C would set `section_number` to the canonical id and split bodies on real section boundaries.

### 2.2 Plan (high-level — owner-gated)
1. Author `scripts/reindex-sbc-documents-from-md.cjs`:
   - read `sbc-{201,801}-section-*.md`,
   - emit one `sbc_documents` row per section (and one per `STRUCTURED_FACT` sub-block) with `code_type`, `section_number`, `chapter`, `page_start/page_end` from frontmatter,
   - call Gemini's `gemini-embedding-001:embedContent` (already used in `fetchSBCContextVector`) to populate the embedding,
   - run inside a transaction; idempotent via `ON CONFLICT (code_type, section_number) DO UPDATE`.
2. Enable the RPC in Supabase (it is documented as "not provisioned"; this is an owner action, not a code change).
3. Flip a feature flag (or a direct call site change) so `mode === "standard"` uses `fetchSBCContextVector` instead of `fetchSBCContext`. Keep keyword as fallback.
4. Re-test the same Mercantile question; expect richer cited content + correct page anchors.

### 2.3 Risks
- Embedding cost (one-time per section, then cached).
- RPC enablement is an admin action — must be owner-confirmed.
- Vector results may rank differently than current keyword path; A/B-test before flipping.

### 2.4 Rollback
- Drop new `sbc_documents` rows by `(code_type, section_number)` slug filter.
- Keep keyword path as the default until vector beats it on the regression set.

---

## Phase 3 — Cross-code edges → `graph_edges` (owner-gated)

### 3.1 Inputs
`D:\sbc_consultx\wiki\architecture\cross-code-relations.json` (12 PROVEN edges; expandable as the corpus grows).

### 3.2 Plan (sketch)
1. Confirm whether `graph_nodes` / `graph_edges` tables already exist in the live schema (the local `sbc-graph-indexer` edge function suggests yes — verify before authoring schema).
2. If schema exists: import the 12 edges directly via a small migration. If not: author a thin schema migration first.
3. Add a "graph context" branch in `fetchSBCContext` (or a new `fetchSBCGraphContext`) that, given a retrieved section, pulls related sections via `graph_edges` and adds them to the model context with a `[GRAPH_RELATION]` label.
4. Wire this branch behind a feature flag — Step 4 verifier already handles unsupported citations gracefully if the model misuses the new context.

### 3.3 Defer until
Phase 2 is in. Edges over drifted nodes are not useful.

---

## Phase 4 — Optional: surface synthesis pages as concept-context chips

`wiki/synthesis/sprinkler-required-decision.md` and `wiki/synthesis/egress-design-checklist.md` are Advisory-shaped already. They could be ingested as `community_summaries` rows (or as a new `concept_pages` table) and offered to the model as TIER-3 (community_summary) evidence with a clear `LLM_SYNTHESIS` chip in the source panel. This complements Phase 1 (verbatim) by giving the model a structured engineering-decision skeleton.

---

## Inventory of helper assets we should NOT reinvent

| Local asset | Purpose | Live equivalent | Action |
|---|---|---|---|
| `gen_ledger.py` | rebuild canonical-build-ledger from MD frontmatter | none | reuse logic in the .cjs generator (Phase 1.3) |
| `add_relations*.py`, `harden_relations*.py` | append/promote cross-code edges | none | port to a node script for Phase 3 |
| `reconcile_corpus.py` | walk MDs and rebuild ledger + status flags | partial via `sbc-graph-indexer` | keep as the upstream owner workflow |
| `check_ledger_*.py` | validate per-chapter completeness | none | reuse before each migration to assert no `EXISTS_CANONICAL` is missed |
| `quarantine_*.py` | flag QUARANTINED nodes | none | mirror status in `sbc_documents` if Phase 2 happens |
| `extract_*.py`, `find_*.py` | OCR/PDF re-extraction | n/a | **DO NOT re-run** — Layer C MD is the canonical text now |

---

## Stop-doing list

1. Stop authoring `sbc_code_tables` rows by hand. After Phase 1.3, every row is generated.
2. Stop adding co-occurrence aliases that depend on byte distance. Use boolean (term-A AND term-B in query) and keep windows ≥ 400 chars or drop them entirely.
3. Stop re-extracting from PDFs. Layer C is the canonical text and is already cleaner than any new OCR pass.
4. Stop relying on `sbc_documents.section_number` for click-time deep-linking until Phase 2 cleans the drift.

---

## Exact next implementation command (a single, smallest action)

```
# Phase 0: close the 907.2.7 surfacing bug
1) edit supabase/functions/fire-safety-chat/index.ts
   replace the two "[\\s\\S]{0,80}" occurrences inside the
   "Step 4.2 — Group M fire-protection sub-clauses" block with
   "[\\s\\S]{0,400}".  (Two-character change in two regex literals.)
2) npx supabase functions deploy fire-safety-chat --project-ref hrnltxmwoaphgejckutk
3) live retest Mercantile / 1,200 m² question.
   Expected pass: source panel shows both
     🗂️ SBC 801 — جدول 903.2.7 (دليل منظم)
     🗂️ SBC 801 — جدول 907.2.7 (دليل منظم)
   answer cites both at conf:medium with no expected-reference fallback.
```

Phase 1 generator + batch migrations follow only after Phase 0 passes live.
