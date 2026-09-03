-- ConsultX 2026-09-03 (b) -- hybrid retrieval TUNING: weighted RRF, a
-- guaranteed vector quota, and the vector-leg similarity floor.
-- Idempotent. Safe to re-run. Applied through the Management API by the
-- orchestrator (DDL only, no data writes). NEVER `supabase db push`.
--
-- ============================================================================
-- WHY THIS EXISTS -- the 2026-09-03 gate failure, measured
-- ============================================================================
-- 20260903_hybrid_retrieval.sql shipped match_sbc_hybrid with EQUAL-weight RRF
-- (k=60), two 40-row candidate pools, and no similarity floor. The live gate
-- (13 questions x 2 modes, docs/launch/next-wave-progress.md) FAILED against
-- the flag-OFF baseline: exact-section match 52% -> 41%, chain pairs 75% ->
-- 50%, and the loss concentrated in multi-section questions (ADV-001: 2/4 ->
-- 0/4 sections found).
--
-- The mechanism is arithmetic, not mysterious. With equal weights and equal
-- k, the FTS list interleaves 1:1 with the vector list: an FTS rank-1 row
-- scores 1/(60+1) = 0.016393, which BEATS the vector rank-2 row's
-- 1/(60+2) = 0.016129. So a 25-row result is roughly 12 vector + 13 lexical
-- rows -- the vector path's ranks 13-25, which carry the secondary sections a
-- multi-part question needs, are pushed out by lexically-similar chunks that
-- no vector evidence supports. Recall of a lexically-exact chunk (the reason
-- hybrid exists) is worth having; paying for it with half the vector budget
-- is not.
--
-- Three knobs, every one defaulting to the CURRENT behaviour so this file
-- alone changes nothing until a caller passes them:
--
--   fts_weight        (default 1.0)  Weighted RRF: the FTS contribution
--                                    becomes fts_weight/(rrf_k + rank). At
--                                    0.5 a lexical-only row must sit roughly
--                                    twice as high in its own list to displace
--                                    a vector row -- recall kept, dominance
--                                    removed.
--   vector_quota      (default 0)    The first `vector_quota` rows of the
--                                    (floored) vector list are ALWAYS
--                                    returned, ordered ahead of the rest. This
--                                    is the hard bound the gate needed: with
--                                    quota = 0 the result is exactly today's
--                                    fused ranking; with quota = match_count
--                                    it degenerates to the pure vector path;
--                                    in between, at most (match_count -
--                                    vector_quota) slots can ever be lexical.
--   min_similarity_rel / _abs        The vector leg's similarity floor, the
--                     (default null) same two-axis rule the non-hybrid path
--                                    applies in TypeScript
--                                    (applySimilarityFloor in
--                                    retrievalPolicy.ts): cut =
--                                    max(abs, rel * top_similarity_of_this_query).
--                                    Applied to the VECTOR leg only -- an
--                                    FTS-only hit is judged by its lexical
--                                    evidence, which is the whole point of
--                                    fusing two independent channels, so it is
--                                    never floored on a similarity it was not
--                                    ranked by. Both null = no floor = today.
--
-- Everything else -- candidate CTE ordering, the deterministic `id ASC`
-- tie-break, tsquery parsing and its fallback, the returned column list and
-- its order, SECURITY INVOKER, the grant posture -- is unchanged from
-- 20260903_hybrid_retrieval.sql. Read that file first; this one only
-- re-creates SECTION 6.
--
-- ============================================================================
-- WHY DROP-THEN-CREATE RATHER THAN CREATE OR REPLACE
-- ============================================================================
-- Postgres identifies a function by its ARGUMENT TYPES: adding parameters --
-- even with defaults -- produces a second, overloaded function rather than
-- replacing the first. Two overloads whose leading parameters match would
-- then make a PostgREST named-argument call ambiguous ("function
-- public.match_sbc_hybrid(...) is not unique"), which fails CLOSED at exactly
-- the moment the flag is turned on. The old signature is therefore dropped
-- first, in the same transaction-less script, immediately before the new one
-- is created. Safe: ADVISORY_HYBRID_RETRIEVAL_ENABLED is "0" in production
-- (its gate failed), so nothing calls this function while it is briefly
-- absent, and fetchSBCContextHybrid fails OPEN on a missing function anyway
-- (returns null, caller keeps the vector path).
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--   drop function if exists public.match_sbc_hybrid(text, vector, int, text[], int, int, float, int, float, float);
--   -- then re-run SECTION 6 of docs/db/20260903_hybrid_retrieval.sql
--   notify pgrst, 'reload schema';

-- ============================================================================
-- SECTION 1 -- drop the previous signature (see header)
-- ============================================================================

drop function if exists public.match_sbc_hybrid(text, vector, int, text[], int, int);

-- ============================================================================
-- SECTION 2 -- match_sbc_hybrid, tunable
-- ============================================================================

create or replace function public.match_sbc_hybrid(
  query_text text,
  query_embedding vector(768),
  match_count int,
  filter_codes text[] default null,
  rrf_k int default 60,
  candidate_pool int default 40,
  fts_weight float default 1.0,
  vector_quota int default 0,
  min_similarity_rel float default null,
  min_similarity_abs float default null
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
  similarity float,
  rrf_score float,
  vector_rank int,
  fts_rank int,
  fts_score float
)
language plpgsql
stable
security invoker
as $$
declare
  norm_query text := public.sbc_normalize_ar(query_text);
  tsq tsquery := websearch_to_tsquery('simple', norm_query);
begin
  if tsq is null or tsq = ''::tsquery then
    tsq := plainto_tsquery('simple', norm_query);
  end if;

  return query
  with vector_all as (
    select
      d.id,
      1 - (d.embedding <=> query_embedding) as vsim,
      row_number() over (order by d.embedding <=> query_embedding, d.id asc) as raw_rank
    from public.sbc_documents d
    where d.embedding is not null
      and (filter_codes is null or d.code_type = any(filter_codes))
    order by d.embedding <=> query_embedding, d.id asc
    limit candidate_pool
  ),
  -- cut = max(abs_floor, rel_floor * best similarity IN THIS RESULT SET) --
  -- the relative axis is what does the work (see retrievalPolicy.ts's measured
  -- distribution); the absolute axis is a backstop. One row always, even over
  -- an empty vector_all (aggregate over no rows), hence the coalesces.
  vector_cut as (
    select greatest(
             coalesce(min_similarity_abs, 0),
             coalesce(min_similarity_rel, 0) * coalesce(max(vsim), 0)
           ) as cut
    from vector_all
  ),
  -- Ranks are renumbered AFTER flooring so RRF sees a dense 1..n list: a
  -- floored-out row must not leave a hole that shifts every later row's
  -- score downward.
  vector_candidates as (
    select v.id, v.vsim, row_number() over (order by v.raw_rank) as vrank
    from vector_all v cross join vector_cut c
    where (min_similarity_rel is null and min_similarity_abs is null)
       or v.vsim >= c.cut
  ),
  fts_candidates as (
    select
      d.id,
      row_number() over (order by ts_rank_cd(d.tsv, tsq) desc, d.id asc) as frank,
      ts_rank_cd(d.tsv, tsq) as fscore
    from public.sbc_documents d
    where d.tsv @@ tsq
      and (filter_codes is null or d.code_type = any(filter_codes))
    order by ts_rank_cd(d.tsv, tsq) desc, d.id asc
    limit candidate_pool
  ),
  fused as (
    select
      coalesce(v.id, f.id) as doc_id,
      v.vrank as vector_rank,
      f.frank as fts_rank,
      f.fscore as fts_score,
      (case when v.vrank is not null then 1.0 / (rrf_k + v.vrank) else 0.0 end)
        + (case when f.frank is not null then fts_weight / (rrf_k + f.frank) else 0.0 end) as rrf_score,
      -- 1 for a row inside the guaranteed vector quota, 0 otherwise. Sorted
      -- FIRST, so those rows can never be displaced; within the quota, and
      -- within the remainder, the fused score still decides the order.
      (case when v.vrank is not null and v.vrank <= vector_quota then 1 else 0 end) as quota_hit
    from vector_candidates v
    full outer join fts_candidates f on v.id = f.id
  )
  -- EVERY fusion column is cast to its DECLARED type. Without this the
  -- function raises 42804 "structure of query does not match function result
  -- type" on EVERY call: row_number() returns bigint (not the declared int),
  -- `1.0 / (...)` is numeric (not float8) because the literal 1.0 is numeric,
  -- and ts_rank_cd returns real. That defect shipped in the original
  -- 20260903_hybrid_retrieval.sql and made match_sbc_hybrid fail on every
  -- invocation -- which fetchSBCContextHybrid swallows by design (fail-open
  -- to the vector path), so the flag looked "on" while nothing hybrid ever
  -- ran. It is why the first gate's numbers moved at all: both arms were the
  -- plain vector path and the deltas were provider noise. Verified after this
  -- fix by calling the function directly in SQL.
  select
    d.id, d.content, d.metadata, d.code_type,
    d.section_number, d.chapter_number,
    d.page_start, d.page_end, d.file_name,
    case when d.embedding is not null then (1 - (d.embedding <=> query_embedding))::float8 else null end as similarity,
    fused.rrf_score::float8,
    fused.vector_rank::int,
    fused.fts_rank::int,
    fused.fts_score::float8
  from fused
  join public.sbc_documents d on d.id = fused.doc_id
  order by fused.quota_hit desc, fused.rrf_score desc, d.id asc
  limit match_count;
end;
$$;

comment on function public.match_sbc_hybrid(text, vector, int, text[], int, int, float, int, float, float) is
  'Hybrid retrieval over sbc_documents: pgvector cosine + Postgres FTS (Arabic-normalized tsv), fused with weighted Reciprocal Rank Fusion. Tuning added 2026-09-03 after the first live gate failed (equal-weight RRF let lexical-only rows take half the result set): fts_weight scales the FTS contribution, vector_quota guarantees the first N floored vector rows are returned and ordered first, min_similarity_rel/_abs apply the retrievalPolicy.ts similarity floor to the VECTOR leg only. Every new parameter defaults to the pre-tuning behaviour. Caller: supabase/functions/fire-safety-chat/hybridRetrieval.ts (flag ADVISORY_HYBRID_RETRIEVAL_ENABLED).';

-- ============================================================================
-- SECTION 3 -- grants (identical posture to the original SECTION 7)
-- ============================================================================

revoke all on function public.match_sbc_hybrid(text, vector, int, text[], int, int, float, int, float, float) from public;
revoke all on function public.match_sbc_hybrid(text, vector, int, text[], int, int, float, int, float, float) from anon;
revoke all on function public.match_sbc_hybrid(text, vector, int, text[], int, int, float, int, float, float) from authenticated;
grant execute on function public.match_sbc_hybrid(text, vector, int, text[], int, int, float, int, float, float) to service_role;

-- ============================================================================
-- SECTION 4 -- PostgREST schema-cache refresh
-- ============================================================================

notify pgrst, 'reload schema';
