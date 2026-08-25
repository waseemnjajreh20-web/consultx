-- ConsultX 2026-08-24 -- formalize public.sbc_documents into supabase/migrations
-- Part of the Advisory Brain plan (P0-A3).
-- Idempotent. Safe to re-run. The OWNER applies this by hand in the Supabase
-- SQL Editor. NEVER `supabase db push` -- this repo has known migration drift.
--
-- WHAT THIS IS
-- ------------
-- public.sbc_documents, its embedding column, and its indexes were created in
-- production by scripts/setup-vector-db.sql, a one-off operator script run
-- directly against the database -- NOT through supabase/migrations/. That is
-- how ~4,630 rows of SBC201/SBC801 content with 768-dim gemini-embedding-001
-- vectors already exist in production today (referenced throughout
-- docs/audits/graphrag-design-20260823.md and
-- docs/audits/advisory-vector-bench-20260823.md), while supabase/migrations/
-- has never carried a CREATE for this table. Every fresh `supabase db pull`
-- or migration-history reconciliation therefore treats sbc_documents as an
-- object with no lineage.
--
-- This migration closes that gap the way CLAUDE.md's inspect -> delta ->
-- idempotent-migration -> verify-live -> document method requires: it
-- encodes the OBSERVED production shape -- table, embedding column, ivfflat
-- index, and the two btree indexes, taken verbatim from
-- scripts/setup-vector-db.sql -- as an idempotent migration file, so the
-- migration history matches what production has actually had since that
-- script ran. As of the 2026-08-24 audits, every object below already
-- exists in production; this file therefore changes NOTHING there. It is
-- documentation given a schema, expressed the only way Postgres schema
-- documentation can be verified: as statements that are no-ops when the
-- object is already present.
--
-- SCOPE -- deliberately narrow
-- -----------------------------
-- This file reproduces exactly the three kinds of statements
-- scripts/setup-vector-db.sql issues for sbc_documents: CREATE EXTENSION,
-- CREATE TABLE, CREATE INDEX. It does NOT reproduce that script's
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY / CREATE POLICY block (lines
-- 62-73 of scripts/setup-vector-db.sql). Production has carried RLS on this
-- table since that script first ran -- it is not an open gap -- but this
-- migration's task scope is the table/index/extension shape only. Formally
-- encoding the RLS policies themselves is left to a follow-up migration that
-- first re-verifies the live policy names and definitions directly (the
-- same inspect-before-assume discipline CLAUDE.md requires), rather than
-- re-asserting policy text from this file from memory of the setup script.
--
-- NOT part of this migration: the three GraphRAG tables (sbc_section_defs,
-- sbc_xref_edges, sbc_xref_indegree -- see
-- 20260824100004_sbc_xref_graph.sql) and sbc_external_refs (see
-- 20260824100005_sbc_external_refs.sql). Those are new objects, not a
-- formalization of something already live, and ship in their own files.

-- ============================================================================
-- SECTION 1 -- pgvector extension
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- SECTION 2 -- sbc_documents table
-- ============================================================================
-- Verbatim shape from scripts/setup-vector-db.sql. `embedding` is nullable
-- (36 of 4,630 production rows currently have no embedding, all SBC201, per
-- docs/audits/graphrag-design-20260823.md) -- do not add NOT NULL here.

CREATE TABLE IF NOT EXISTS public.sbc_documents (
  id bigserial PRIMARY KEY,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  embedding vector(768),
  code_type text,
  section_number text,
  chapter_number text,
  page_start integer,
  page_end integer,
  file_name text,
  chunk_index integer,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- SECTION 3 -- indexes
-- ============================================================================
-- One ivfflat index for approximate nearest-neighbour vector search, plus
-- the two btree indexes setup-vector-db.sql creates for the columns the
-- keyword-fallback and code-type-filtered retrieval paths filter on.

CREATE INDEX IF NOT EXISTS idx_sbc_documents_embedding ON public.sbc_documents
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_sbc_documents_code_type ON public.sbc_documents(code_type);
CREATE INDEX IF NOT EXISTS idx_sbc_documents_section ON public.sbc_documents(section_number);
