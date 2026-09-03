-- ConsultX 2026-09-03 (c) — in-database keyword retrieval (wave item D3).
-- Idempotent. Safe to re-run. Applied through the Management API (DDL only).
-- NEVER `supabase db push`.
--
-- ============================================================================
-- WHAT THIS REPLACES
-- ============================================================================
-- The keyword path in fire-safety-chat today: list the storage bucket, score
-- and select up to 12 chunk-JSON files, DOWNLOAD them over the network,
-- parse every chunk in the isolate, score each one in TypeScript, and keep the
-- best ones. Measured on production 2026-09-03: 0.6-3.8s per request (median
-- ~1.1s), and it is the path most heavy-mode requests actually take, because
-- vector retrieval falls back to it whenever its similarity floor rejects the
-- result set.
--
-- Everything it computes is already in `public.sbc_documents` — the same
-- chunks, with a generated, Arabic-normalized `tsv` column and a GIN index
-- (added for hybrid retrieval in 20260903_hybrid_retrieval.sql, and useful
-- here whatever the hybrid gate decided). This RPC does the whole job in one
-- indexed query.
--
-- ============================================================================
-- WHY TERMS, NOT THE RAW QUESTION
-- ============================================================================
-- The corpus is English (measured: "مرشات" matches 0 of 5,553 rows through
-- tsv; "travel distance" matches 290; the section number "1017.2" matches 41).
-- The caller already builds a keyword list for its TypeScript scorer —
-- buildQueryKeywords() + buildQueryMeta(), which mixes the question's own
-- tokens with English search terms and any section numbers it recognised — so
-- this function takes THAT list rather than the raw Arabic question. Terms are
-- OR-ed: a chunk matching any of them is a candidate, ranked by how many and
-- how prominently (ts_rank_cd).
--
-- ============================================================================
-- SECURITY
-- ============================================================================
-- Same posture as match_sbc_documents_v2 and match_sbc_hybrid: SECURITY
-- INVOKER (stated explicitly), REVOKE from PUBLIC/anon/authenticated, GRANT to
-- service_role only. Callers reach it through the Edge Function's service-role
-- client, never from a browser.

-- ============================================================================
-- SECTION 1 — match_sbc_keywords
-- ============================================================================

drop function if exists public.match_sbc_keywords(text[], int, text[]);

create or replace function public.match_sbc_keywords(
  terms text[],
  match_count int,
  filter_codes text[] default null
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  code_type text,
  section_number text,
  chapter_number text,
  page_start integer,
  page_end integer,
  file_name text,
  score float
)
language plpgsql
stable
security invoker
as $$
declare
  -- Terms are normalized with the SAME function the corpus's tsv column was
  -- built with, so a diacritic or alef variant in a term cannot silently miss.
  -- Empty/blank terms are dropped; each is quoted so multi-word terms
  -- ("travel distance") stay phrases rather than becoming stray OR clauses.
  norm_terms text[];
  tsq tsquery;
begin
  select array_agg(t) into norm_terms
  from (
    select distinct public.sbc_normalize_ar(unnest) as t
    from unnest(terms)
  ) s
  where t is not null and length(trim(t)) > 1;

  if norm_terms is null or array_length(norm_terms, 1) is null then
    return; -- no usable terms: empty result, caller falls back
  end if;

  -- websearch_to_tsquery never raises on odd input (it degrades to an empty
  -- query), which is what makes it safe for caller-supplied text. OR syntax is
  -- part of its grammar.
  tsq := websearch_to_tsquery('simple', array_to_string(norm_terms, ' OR '));
  if tsq is null or tsq = ''::tsquery then
    return;
  end if;

  return query
  select
    d.id, d.content, d.metadata, d.code_type,
    d.section_number, d.chapter_number,
    d.page_start, d.page_end, d.file_name,
    ts_rank_cd(d.tsv, tsq)::float8 as score
  from public.sbc_documents d
  where d.tsv @@ tsq
    and (filter_codes is null or d.code_type = any(filter_codes))
  order by ts_rank_cd(d.tsv, tsq) desc, d.id asc
  limit match_count;
end;
$$;

comment on function public.match_sbc_keywords(text[], int, text[]) is
  'In-database keyword retrieval over sbc_documents.tsv (Arabic-normalized, GIN-indexed). Takes the caller''s already-built keyword list (fire-safety-chat buildQueryKeywords/buildQueryMeta), OR-s the terms, ranks by ts_rank_cd. Replaces the storage-download + in-isolate scoring keyword path (wave item D3) behind SBC_KEYWORD_FTS_ENABLED. Deterministic tie-break on id, same as the other match_* functions.';

-- ============================================================================
-- SECTION 2 — grants
-- ============================================================================

revoke all on function public.match_sbc_keywords(text[], int, text[]) from public;
revoke all on function public.match_sbc_keywords(text[], int, text[]) from anon;
revoke all on function public.match_sbc_keywords(text[], int, text[]) from authenticated;
grant execute on function public.match_sbc_keywords(text[], int, text[]) to service_role;

-- ============================================================================
-- SECTION 3 — PostgREST schema-cache refresh
-- ============================================================================

notify pgrst, 'reload schema';
