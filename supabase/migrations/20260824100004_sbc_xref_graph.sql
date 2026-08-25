-- ConsultX 2026-08-24 -- GraphRAG cross-reference graph: three new tables
-- Part of the Advisory Brain plan (P3 / GraphRAG G0).
-- Idempotent. Safe to re-run. The OWNER applies this by hand in the Supabase
-- SQL Editor. NEVER `supabase db push` -- this repo has known migration drift.
--
-- WHAT THIS IS
-- ------------
-- Schema only, from docs/audits/graphrag-design-20260823.md, Section 2.7
-- (schema decision: new tables, no reuse of the existing graph_nodes /
-- graph_edges / community_summaries tables). Three tables that let a future
-- retrieval step follow deterministic, extractor-derived "chunk cites
-- section" edges across public.sbc_documents:
--
--   sbc_section_defs   -- which chunk DEFINES which section (from an
--                          in-text heading, not the drifted section_number
--                          column -- see design doc Section 2.4/2.8).
--   sbc_xref_edges      -- chunk -> chunk edges: "this chunk's text cites
--                          that section", with the literal evidence text
--                          the edge was derived from, so a human can audit
--                          any edge without re-running the extractor.
--   sbc_xref_indegree   -- precomputed in-degree per doc_id, computed once
--                          at build time (feeds a future hub-damping step).
--
-- THIS MIGRATION SHIPS SCHEMA ONLY. No extractor script, no first
-- population, no edge-count report, and no change to fire-safety-chat are
-- part of this file -- those are separate G0 deliverables per the design
-- doc's phase gates (Section (j), "G0 -- build without a reader"). Immediately
-- after this migration is applied, all three tables are empty: ZERO readers,
-- ZERO writers, ZERO effect on any answer the product gives today.
--
-- WHY NEW TABLES, NOT graph_nodes / graph_edges / community_summaries
-- ---------------------------------------------------------------------
-- Design doc Section 2.7 gives six independently-measured reasons; summary
-- (full detail in that section -- do not re-derive from this comment):
--   1. graph_nodes.chunk_id is NULL on 171 of 171 rows (CONFIRMED) -- no
--      join key to public.sbc_documents exists today.
--   2. Different retrieval unit: graph_nodes holds 171 LLM-extracted
--      CONCEPTS; this design's nodes are the 4,630 sbc_documents CHUNKS.
--      Mixing the two in one table loses the deterministic-vs-generated
--      provenance distinction a safety audit needs.
--   3. graph_edges.relationship_type is free text (18 distinct values, e.g.
--      "is titled"), not the controlled vocabulary edge_kind needs.
--   4. graph_nodes/graph_edges keys are uuid; sbc_documents keys are bigint.
--   5. sbc-graph-indexer still writes graph_nodes/graph_edges with its own
--      semantics; a second writer with a different meaning on the same
--      table is a data-integrity risk with no offsetting benefit.
--   6. admin-stats reads graph_nodes/graph_edges counts as a health metric;
--      inflating 171/133 to ~4,800/~9,700 would corrupt an operator-visible
--      number silently.
-- The existing tables are left untouched -- no ALTER, no DROP, no data
-- migration into them. Deleting them is an owner decision outside this
-- design's scope (design doc Section 2.7: "what is done to the existing
-- tables: nothing").
--
-- NO NEW INFRASTRUCTURE. Same Postgres database as everything else in this
-- project (CLAUDE.md hard rule: no Neo4j, no separate graph database, no new
-- Postgres extension). Traversal is a plain btree-indexed JOIN.
--
-- RLS -- service_role only, matching public.job_locks and public.sbc_documents
-- -------------------------------------------------------------------------
-- All three tables: RLS ENABLED, NO policy for anon or authenticated (not
-- even a read policy), and an explicit REVOKE from PUBLIC/anon/authenticated
-- plus an explicit GRANT to service_role. RLS is never weakened anywhere in
-- this file, and no table here is ever exposed to a client-held key.

-- ============================================================================
-- SECTION 1 -- sbc_section_defs
-- ============================================================================
-- Definition index: which chunk defines which section, built from in-text
-- headings (the defining-occurrence regex in design doc Section 2.4), not
-- from sbc_documents.section_number, which is known to drift.

CREATE TABLE IF NOT EXISTS public.sbc_section_defs (
  doc_id        bigint NOT NULL REFERENCES public.sbc_documents(id) ON DELETE CASCADE,
  code_type     text   NOT NULL,           -- SBC201 | SBC801
  section       text   NOT NULL,           -- e.g. '903.3.1.1'
  extractor_ver text   NOT NULL,
  PRIMARY KEY (doc_id, section)
);

CREATE INDEX IF NOT EXISTS idx_sbc_section_defs_lookup
  ON public.sbc_section_defs (code_type, section);

COMMENT ON TABLE public.sbc_section_defs IS
  'GraphRAG G0 (docs/audits/graphrag-design-20260823.md, Section 2.7): one row per (chunk, section) it DEFINES, i.e. where the section number appears as an in-text heading in that chunk -- not derived from the drift-prone sbc_documents.section_number column. Used to resolve sbc_xref_edges.tgt_section to a target doc_id. Empty until the extractor script (a separate deliverable) populates it. RLS on, service_role only.';
COMMENT ON COLUMN public.sbc_section_defs.section IS
  'Section number as it appears at the defining heading, e.g. ''903.3.1.1''. Not the section-sign character; always the word "Section" in any surrounding prose.';
COMMENT ON COLUMN public.sbc_section_defs.extractor_ver IS
  'Version tag of the extractor run that produced this row. Lets a re-extraction be told apart from the previous one and rolled back independently.';

-- ============================================================================
-- SECTION 2 -- sbc_xref_edges
-- ============================================================================
-- Chunk -> chunk edges: src_doc_id's text cites tgt_section (resolved via
-- sbc_section_defs to tgt_doc_id). `evidence` carries the literal source
-- text an edge was derived from, so a human can audit any edge against the
-- printed page without re-running the extractor (design doc Section 2.7:
-- the evidence column is not a luxury).

CREATE TABLE IF NOT EXISTS public.sbc_xref_edges (
  id            bigserial   PRIMARY KEY,
  src_doc_id    bigint      NOT NULL REFERENCES public.sbc_documents(id) ON DELETE CASCADE,
  tgt_doc_id    bigint      NOT NULL REFERENCES public.sbc_documents(id) ON DELETE CASCADE,
  tgt_code      text        NOT NULL,
  tgt_section   text        NOT NULL,
  edge_kind     text        NOT NULL
                CHECK (edge_kind IN ('section_ref', 'cross_code', 'table_ref', 'section_list')),
  cue           text        NOT NULL,      -- 'in_accordance_with' | 'see' | 'comply_with'
                                            -- | 'required_by' | 'specified_in' | 'bare'
  occurrences   int         NOT NULL DEFAULT 1,
  evidence      text        NOT NULL,      -- verbatim source text the edge was derived from
  extractor_ver text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (src_doc_id, tgt_doc_id, tgt_section, edge_kind)
);

CREATE INDEX IF NOT EXISTS idx_sbc_xref_src ON public.sbc_xref_edges (src_doc_id);
CREATE INDEX IF NOT EXISTS idx_sbc_xref_tgt ON public.sbc_xref_edges (tgt_doc_id);

COMMENT ON TABLE public.sbc_xref_edges IS
  'GraphRAG G0 (docs/audits/graphrag-design-20260823.md, Section 2.7): one row per distinct (src_doc_id, tgt_doc_id, tgt_section, edge_kind) reference edge extracted from sbc_documents chunk text. edge_kind is a controlled vocabulary (section_ref | cross_code | table_ref | section_list). Zero edges to sbc_code_tables and zero edges sourced from an external-standard reference (NFPA/SFPE/IBC/IFC) are hard G0 gates -- see the design doc's G0 acceptance section. Empty until the extractor script (a separate deliverable) populates it. RLS on, service_role only.';
COMMENT ON COLUMN public.sbc_xref_edges.tgt_code IS
  'Code the target section belongs to, as named at the citation site (e.g. SBC201, SBC801) -- independent of whether tgt_doc_id could be resolved.';
COMMENT ON COLUMN public.sbc_xref_edges.cue IS
  'Which linguistic cue produced the edge: in_accordance_with | see | comply_with | required_by | specified_in | bare. Diagnostic, not used for filtering at G0.';
COMMENT ON COLUMN public.sbc_xref_edges.occurrences IS
  'How many times this exact (src, tgt, edge_kind) reference was seen while extracting src_doc_id''s chunk. Not a cross-chunk count.';
COMMENT ON COLUMN public.sbc_xref_edges.evidence IS
  'Verbatim source text the edge was derived from. Required so a human can audit any edge against the printed page without re-running the extractor (design doc Section 2.7, G0 gate 4: manual review of a 50-edge random sample, target >= 90% accuracy).';
COMMENT ON COLUMN public.sbc_xref_edges.extractor_ver IS
  'Version tag of the extractor run that produced this row. Lets a re-extraction be told apart from the previous one and rolled back independently.';

-- ============================================================================
-- SECTION 3 -- sbc_xref_indegree
-- ============================================================================
-- In-degree per doc_id, computed once at build time from sbc_xref_edges.
-- Precomputed rather than derived per-query so a future hub-damping step
-- (design doc Section 2.6.4) does not require a COUNT(*) aggregate on the
-- hot retrieval path.

CREATE TABLE IF NOT EXISTS public.sbc_xref_indegree (
  doc_id    bigint PRIMARY KEY REFERENCES public.sbc_documents(id) ON DELETE CASCADE,
  in_degree int    NOT NULL
);

COMMENT ON TABLE public.sbc_xref_indegree IS
  'GraphRAG G0 (docs/audits/graphrag-design-20260823.md, Section 2.7): precomputed in-degree per doc_id, i.e. COUNT(*) of sbc_xref_edges rows where tgt_doc_id = doc_id, refreshed by the extractor script alongside sbc_xref_edges. Feeds a future hub-damping step in re-ranking (design doc Section 2.6.4) -- not read by any deployed code path as of this migration. RLS on, service_role only.';

-- ============================================================================
-- SECTION 4 -- Row Level Security
-- ============================================================================
-- Enabled on all three tables. No policy is created for anon or authenticated
-- -- not even a read policy -- so with RLS on and no permissive policy, both
-- roles see zero rows regardless of the grants in SECTION 5. service_role
-- bypasses RLS entirely, which is how the (currently unwritten) extractor
-- script and any future reader are expected to reach these tables.

ALTER TABLE public.sbc_section_defs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sbc_xref_edges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sbc_xref_indegree ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 5 -- grants (defence in depth; see SECTION 4)
-- ============================================================================
-- Belt and suspenders alongside RLS, matching public.job_locks
-- (20260823000004_job_locks.sql): REVOKE the table-level grant a new table
-- in `public` is otherwise born with under Supabase's default privileges,
-- from every client-held role, then GRANT explicitly to service_role only.

REVOKE ALL ON TABLE public.sbc_section_defs  FROM PUBLIC;
REVOKE ALL ON TABLE public.sbc_section_defs  FROM anon;
REVOKE ALL ON TABLE public.sbc_section_defs  FROM authenticated;
GRANT  ALL ON TABLE public.sbc_section_defs  TO   service_role;

REVOKE ALL ON TABLE public.sbc_xref_edges    FROM PUBLIC;
REVOKE ALL ON TABLE public.sbc_xref_edges    FROM anon;
REVOKE ALL ON TABLE public.sbc_xref_edges    FROM authenticated;
GRANT  ALL ON TABLE public.sbc_xref_edges    TO   service_role;

REVOKE ALL ON TABLE public.sbc_xref_indegree FROM PUBLIC;
REVOKE ALL ON TABLE public.sbc_xref_indegree FROM anon;
REVOKE ALL ON TABLE public.sbc_xref_indegree FROM authenticated;
GRANT  ALL ON TABLE public.sbc_xref_indegree TO   service_role;

-- ============================================================================
-- SECTION 6 -- PostgREST schema cache
-- ============================================================================

NOTIFY pgrst, 'reload schema';
