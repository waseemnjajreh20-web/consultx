-- ConsultX 2026-08-24 -- match_sbc_documents_v2: hardened, deterministic vector RPC
-- Part of the Advisory Brain plan (P0-A2).
-- Idempotent. Safe to re-run. The OWNER applies this by hand in the Supabase
-- SQL Editor. NEVER `supabase db push` -- this repo has known migration drift.
--
-- WHAT THIS IS
-- ------------
-- A NEW function, public.match_sbc_documents_v2. It is additive only.
--
-- THE EXISTING public.match_sbc_documents (created by
-- scripts/setup-vector-db.sql, currently live) IS DELIBERATELY NOT MODIFIED
-- BY THIS MIGRATION. It is the function fetchSBCContextVector() in
-- supabase/functions/fire-safety-chat/index.ts calls today, on the live
-- vision/advisory retrieval path, behind ADVISORY_VECTOR_RETRIEVAL_ENABLED.
-- Changing its behaviour in place is a production retrieval-quality change
-- and therefore an owner decision gated by its own benchmark (see
-- docs/audits/advisory-vector-bench-20260823.md); this migration does not
-- make that decision. v2 sits next to it, unused by any deployed code path,
-- until a separate, reviewed change wires a caller to it.
--
-- WHY A NEW FUNCTION INSTEAD OF EXTENDING THE OLD ONE
-- ----------------------------------------------------
-- match_sbc_documents has two new optional needs that surfaced designing the
-- GraphRAG cross-reference expansion (docs/audits/graphrag-design-20260823.md,
-- Section 2.7 / G1):
--   1. An optional similarity floor IN SQL. retrievalPolicy.ts today applies
--      the floor on the CALLER side, after the RPC returns, precisely
--      because the RPC has no such parameter (see the comment above
--      applySimilarityFloor() in that file). Doing it in SQL as well lets a
--      future caller cut the floored rows before they cross the network,
--      without touching the caller-side floor or the currently-live RPC.
--   2. A DETERMINISTIC tie-break. match_sbc_documents orders by
--      `embedding <=> query_embedding` alone. When two or more rows are
--      equidistant (duplicate or near-duplicate chunks are known to exist in
--      the corpus), Postgres may return them in a different order across
--      runs, because ties are broken by physical row order, which is not
--      guaranteed stable across vacuum/autoanalyze. The GraphRAG plan's G1
--      gate 4 requires "the same question twice produces byte-identical
--      context" (design doc, Section (j), G1 acceptance gates). An unstable
--      tie-break would fail that gate for reasons having nothing to do with
--      the graph expansion being tested. `ORDER BY ..., id ASC` removes the
--      ambiguity.
--
-- Both are OPT-IN (DEFAULT NULL): calling v2 with only
-- (query_embedding, match_count, filter_code) returns the same rows in the
-- same order as match_sbc_documents would for those same arguments, plus the
-- deterministic tie-break. min_similarity is the only behaviour change, and
-- it is inert unless a caller passes it.
--
-- SECURITY POSTURE -- replicated from match_sbc_documents, then hardened
-- ------------------------------------------------------------------------
-- match_sbc_documents (scripts/setup-vector-db.sql) declares no SECURITY
-- clause, so it runs SECURITY INVOKER (Postgres default). It has no
-- REVOKE/GRANT statements of its own, so it is born holding whatever
-- Supabase's schema-level default privileges grant every new function in
-- `public` -- see docs/audits/SECURITY-quota-rpc-bypass-20260823.md Section
-- 2.a: the public-schema default ACL grants EXECUTE to every function born
-- in it, to `anon` by name, and REVOKE ... FROM PUBLIC alone does not
-- remove that named-role grant -- anon and authenticated must be revoked
-- explicitly by name. The only caller of match_sbc_documents in this
-- codebase is supabaseAdmin.rpc('match_sbc_documents', ...) in
-- fire-safety-chat/index.ts, i.e. the service_role key -- never `src/`,
-- never `anon`, never `authenticated` (grep-verified 2026-08-24, the same
-- pattern the quota-RPC audit documented for the daily-usage RPCs).
--
-- v2 replicates the exact same security shape (SECURITY INVOKER, same body
-- pattern, same intended sole caller) and closes the gap the audit named:
-- an explicit REVOKE from PUBLIC/anon/authenticated and an explicit GRANT
-- to service_role only, so v2 is never born reachable by a client key even
-- though nothing in `src/` or any edge function calls it yet.
--
-- Read-only function: SELECT only, no writes, so there is no quota- or
-- billing-shaped abuse surface even before the grant layer is considered --
-- the grant layer is still the correct and only enforcement point, and is
-- what this migration adds.

-- ============================================================================
-- SECTION 1 -- create the function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_sbc_documents_v2(
  query_embedding vector(768),
  match_count int DEFAULT 20,
  filter_code text DEFAULT NULL,
  min_similarity float DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  code_type text,
  section_number text,
  chapter_number text,
  page_start integer,
  page_end integer,
  file_name text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id, d.content, d.metadata, d.code_type,
    d.section_number, d.chapter_number,
    d.page_start, d.page_end, d.file_name,
    1 - (d.embedding <=> query_embedding) as similarity
  FROM public.sbc_documents d
  WHERE (filter_code IS NULL OR d.code_type = filter_code)
    AND (min_similarity IS NULL OR 1 - (d.embedding <=> query_embedding) >= min_similarity)
  ORDER BY d.embedding <=> query_embedding, d.id ASC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_sbc_documents_v2(vector, int, text, float) IS
  'Vector similarity search over public.sbc_documents. Identical result shape and default-argument behaviour to public.match_sbc_documents (which is NOT modified and remains the live vision/advisory retrieval path), plus two opt-in additions: an in-SQL min_similarity floor and a deterministic (embedding <=> query_embedding, id ASC) tie-break for byte-identical repeat queries. Not called by any deployed code path as of this migration -- provisioned ahead of the GraphRAG/Advisory Brain retrieval work (docs/audits/graphrag-design-20260823.md). SECURITY INVOKER (matches match_sbc_documents). service_role only.';

-- ============================================================================
-- SECTION 2 -- grants (defence in depth; see header)
-- ============================================================================
-- Supabase ships ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT EXECUTE
-- ON FUNCTIONS TO anon, authenticated, service_role, so a function created in
-- `public` is born holding an anon and authenticated grant. REVOKE ... FROM
-- PUBLIC does NOT remove an explicit named-role grant, so anon and
-- authenticated are revoked by name, matching the fix pattern in
-- docs/audits/SECURITY-quota-rpc-bypass-20260823.md Section 4.

REVOKE ALL     ON FUNCTION public.match_sbc_documents_v2(vector, int, text, float) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.match_sbc_documents_v2(vector, int, text, float) FROM anon;
REVOKE ALL     ON FUNCTION public.match_sbc_documents_v2(vector, int, text, float) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.match_sbc_documents_v2(vector, int, text, float) TO service_role;

-- ============================================================================
-- SECTION 3 -- PostgREST schema cache
-- ============================================================================
-- PostgREST caches the schema. Without this reload the new RPC stays
-- invisible (PGRST202) to any future caller until the cache next refreshes
-- on its own.

NOTIFY pgrst, 'reload schema';
