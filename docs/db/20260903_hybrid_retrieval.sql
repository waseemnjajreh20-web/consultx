-- ConsultX 2026-09-03 -- hybrid retrieval: Postgres full-text (tsvector/GIN)
-- fused with pgvector via Reciprocal Rank Fusion (wave 1 item B1b).
-- Idempotent. Safe to re-run. The OWNER (وسيم) applies this by hand in the
-- Supabase SQL Editor. NEVER `supabase db push` -- this repo has known
-- migration drift (CLAUDE.md hard rule). The canonical copy lives here
-- (docs/db/) rather than supabase/migrations/ because the guard-migrations
-- hook protects that directory from unattended writes -- move it there only
-- with the owner's explicit go-ahead, same pattern as
-- docs/db/20260901_user_memory.sql.
--
-- Sequencing (docs/launch/next-wave-progress.md "SQL apply" order): apply
-- AFTER 20260903_perf_events.sql, BEFORE 20260903_retrieval_cache.sql. Does
-- not depend on either -- the order is the orchestrator's rollout plan, not
-- a hard dependency of this file.
--
-- ============================================================================
-- WHAT THIS IS
-- ============================================================================
-- A second, ADDITIVE retrieval RPC, public.match_sbc_hybrid, fusing two
-- independent ranking signals over the existing public.sbc_documents table:
--
--   1. pgvector cosine similarity -- the existing signal. Same distance
--      operator (`embedding <=> query_embedding`) and the same deterministic
--      `..., id ASC` tie-break as public.match_sbc_documents_v2
--      (supabase/migrations/20260824100001_match_sbc_documents_v2.sql).
--
--   2. Postgres full-text search over a NEW generated `tsv` column, built on
--      an Arabic-normalized form of `content` so diacritic/tatweel/letter-
--      variant spelling differences ("السَّلامة" / "السّلامة" / "السلامة")
--      collapse to one searchable form before tokenization.
--
-- The two ranked candidate lists (top `candidate_pool` rows each, independent
-- ORDER BYs) are fused with Reciprocal Rank Fusion: for a rank r in a list,
-- that list contributes 1/(rrf_k + r); a document absent from a list
-- contributes 0 for it. rrf_k defaults to 60 -- Cormack, Clarke & Buettcher's
-- own tuned constant (SIGIR 2009, "Reciprocal Rank Fusion Outperforms
-- Condorcet and Individual Rank Learning Methods"), not invented here.
--
-- NOTHING EXISTING IS MODIFIED. public.sbc_documents, public.match_sbc_documents
-- and public.match_sbc_documents_v2 are untouched -- this migration only ADDS
-- two small IMMUTABLE helper functions, one generated column + its GIN index,
-- and one new RPC.
--
-- ============================================================================
-- STATUS AS OF THIS MIGRATION -- UNWIRED, exactly like v2 was on 2026-08-24
-- ============================================================================
-- ZERO deployed code calls match_sbc_hybrid. The Deno caller
-- (supabase/functions/fire-safety-chat/hybridRetrieval.ts, this same wave,
-- item B1b) is provisioned but has no call site in index.ts yet -- that is a
-- separate, surgical wiring change owned by the wave-2 integrator, behind
-- ADVISORY_HYBRID_RETRIEVAL_ENABLED (exact string "1", same house pattern as
-- every other ADVISORY_* flag in retrievalPolicy.ts). Applying this SQL file
-- changes NOTHING observable in production by itself -- it only makes the
-- function callable. See docs/launch/hybrid-retrieval-notes.md for what must
-- be true (SQL applied, generated column backfilled, gate green) before that
-- flag is ever set to "1" anywhere a real request can reach it.
--
-- ============================================================================
-- SECURITY POSTURE -- mirrors match_sbc_documents_v2, not the older v1 gap
-- ============================================================================
-- v1 (scripts/setup-vector-db.sql) declares no SECURITY clause and no
-- explicit grants, so it is born reachable by anon/authenticated via
-- Supabase's public-schema default ACL (the gap v2's header documents and
-- closes). v2 is the RIGHT reference point, not v1: SECURITY INVOKER
-- (Postgres default, stated explicitly below), explicit REVOKE from
-- PUBLIC/anon/authenticated, explicit GRANT to service_role only. This
-- migration reproduces that exact shape for match_sbc_hybrid so it is never
-- born with a wider blast radius than v2. sbc_normalize_ar and
-- sbc_to_tsvector_simple are pure text transforms with no table access and no
-- side channel to anything sensitive -- they are left at Supabase's default
-- public-schema EXECUTE grant (anon/authenticated included), the same
-- treatment any ordinary text utility gets. The only function this migration
-- locks down is the one that reads sbc_documents.
--
-- ============================================================================
-- IMMUTABILITY NOTE -- why there are TWO helper functions, not one
-- ============================================================================
-- `to_tsvector(regconfig, text)` is marked STABLE in pg_proc (it depends on
-- the named text-search configuration, which Postgres treats as capable of
-- changing between calls even though 'simple' is a built-in nobody redefines
-- in practice). A GENERATED ALWAYS AS ... STORED column requires an IMMUTABLE
-- expression -- Postgres rejects a generated column built directly on
-- `to_tsvector('simple', ...)` with "generation expression is not immutable".
-- The standard, widely-used fix is exactly what SECTION 3 below does: wrap it
-- in a small SQL function explicitly declared IMMUTABLE (safe here because
-- 'simple' is a stable built-in config, not a caller-supplied or mutable
-- one). sbc_normalize_ar (SECTION 2) is genuinely, not just declaratively,
-- immutable -- pure regexp_replace/translate/lower/trim over its argument,
-- nothing session- or catalog-dependent.
--
-- ============================================================================
-- pg_trgm: PROVISIONED, DELIBERATELY NOT INDEXED
-- ============================================================================
-- The extension is created (SECTION 1) because it is cheap and the task spec
-- for this migration calls for it, but no trigram GIN index is built here.
-- Judgement call, stated rather than silently skipped: match_sbc_hybrid's
-- full-text side uses tsvector/GIN + websearch_to_tsquery, never pg_trgm's
-- `%`/similarity() operators -- a trigram index would not be touched by any
-- query this RPC issues. At the current corpus size (~5,600 rows across
-- SBC201/801/401/501), a GIN(tsv) index already gives sub-millisecond FTS
-- lookups; a trigram index here would be pure write-amplification (extra
-- index maintenance on every future ingest) for zero read benefit. pg_trgm is
-- left installed only so a future fuzzy/typo-tolerant lookup (e.g. on
-- section_number) does not need its own migration to add the extension.
--
-- ============================================================================
-- OPERATIONAL GOTCHA -- generated columns do not retroactively refresh
-- ============================================================================
-- If sbc_normalize_ar's logic is ever edited after this ships, existing `tsv`
-- values do NOT recompute automatically -- STORED generated columns are
-- computed at INSERT/UPDATE time only. A logic change needs a forced rewrite
-- (e.g. `UPDATE public.sbc_documents SET content = content;`) to take effect
-- on rows that already exist. CREATE OR REPLACE on the function itself is
-- safe to re-run (same signature/return type = no dependency error); it just
-- does not reach already-stored tsv values.
--
-- ============================================================================
-- DEPLOY ORDER (this file, top to bottom -- also the order to paste/run if
-- splitting into multiple SQL Editor statements)
-- ============================================================================
--   1. SECTION 1 -- create extension pg_trgm
--   2. SECTION 2 -- create/replace sbc_normalize_ar
--   3. SECTION 3 -- create/replace sbc_to_tsvector_simple
--   4. SECTION 4 -- add generated column sbc_documents.tsv (guarded DO block;
--      full-table rewrite -- see docs/launch/hybrid-retrieval-notes.md for
--      the expected backfill time and a low-traffic-window recommendation)
--   5. SECTION 5 -- GIN index on tsv
--   6. SECTION 6 -- create/replace match_sbc_hybrid
--   7. SECTION 7 -- grants (REVOKE PUBLIC/anon/authenticated, GRANT service_role)
--   8. SECTION 8 -- NOTIFY pgrst, 'reload schema' (PostgREST schema-cache
--      refresh -- without this the RPC is invisible to supabase-js as
--      PGRST202 until the cache next refreshes on its own, same note as v2)
--
-- Post-apply sanity check (owner runs manually in the SQL Editor):
--   select public.sbc_normalize_ar('الأَمان في نظام السَّلامة  من  الحريق (903.2.11.3)');
--   -- expect: 'الامان في نظام السلامه من الحريق 903.2.11.3'
--   -- (أ->ا, diacritics gone, ة->ه, parentheses stripped, section number
--   --  intact, whitespace collapsed)
--
--   select count(*), count(tsv) from public.sbc_documents;
--   -- expect both counts equal once SECTION 4 finishes (tsv is NOT NULL
--   -- wherever content is, since sbc_normalize_ar(coalesce(content,'')) never
--   -- returns NULL)
--
-- ============================================================================
-- ROLLBACK (reverse order -- drop function / drop column, per task spec)
-- ============================================================================
--   drop function if exists public.match_sbc_hybrid(text, vector, int, text[], int, int);
--   drop index if exists public.idx_sbc_documents_tsv;
--   alter table public.sbc_documents drop column if exists tsv;
--   drop function if exists public.sbc_to_tsvector_simple(text);
--   drop function if exists public.sbc_normalize_ar(text);
--   -- pg_trgm left in place deliberately: harmless to keep, and dropping an
--   -- extension another future feature may already be relying on is a
--   -- needless risk. `drop extension if exists pg_trgm;` only if the owner
--   -- confirms nothing else uses it.
--   notify pgrst, 'reload schema';

-- ============================================================================
-- SECTION 1 -- pg_trgm extension (provisioned; not indexed -- see header)
-- ============================================================================

create extension if not exists pg_trgm;

-- ============================================================================
-- SECTION 2 -- sbc_normalize_ar: Arabic-aware text normalization, IMMUTABLE
-- ============================================================================
-- Order of operations, each chosen to not interfere with the others (the
-- diacritic and letter-variant sets are disjoint from the punctuation set,
-- and from the Latin case-folding set, so the steps commute in practice even
-- though they are applied in this fixed order):
--   1. strip combining diacritics U+064B-U+0652 (the 8 harakat + shadda +
--      sukun) and tatweel U+0640 (kashida).
--   2. unify letter variants: أ/إ/آ -> ا, ى -> ي, ة -> ه.
--   3. lower() -- folds Latin case; a no-op on Arabic, which has none.
--   4. strip punctuation, EXCEPT '.' and '-' -- kept because section numbers
--      use both ("903.2.11.3" dot-style; SBC 401's IEC-style "41-1.4" /
--      "712-" hyphen-style, per supabase/functions/ingest-sbc-2024/index.ts's
--      extractSection() comment) and must "stay intact" for FTS to match a
--      literal section-number query. Everything else (Arabic and Latin
--      punctuation alike -- '،؛؟"'()[]!' etc.) becomes a space.
--   5. collapse whitespace runs to one space and trim.
-- Idempotent by construction: re-normalizing an already-normalized string is
-- a no-op (relied on by the RPC, which normalizes query_text once more in
-- SQL even though the TS caller in hybridRetrieval.ts already normalized it
-- before sending -- see that file's header for why both sides normalize).

create or replace function public.sbc_normalize_ar(input text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            regexp_replace(coalesce(input, ''), '[ـً-ْ]', '', 'g'),
            'أإآىة', 'ااايه'
          )
        ),
        '[^[:alnum:]\s.\-]', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  )
$$;

comment on function public.sbc_normalize_ar(text) is
  'Arabic-aware normalization for search: strips harakat (U+064B-U+0652) and tatweel (U+0640), unifies alef/yeh/ta-marbuta variants, lowercases Latin, strips punctuation except "." and "-" (section numbers), collapses whitespace. IMMUTABLE and idempotent. Used by sbc_to_tsvector_simple() (SECTION 3) and by match_sbc_hybrid() (SECTION 6) to normalize query_text the same way the corpus was normalized. TS mirror for pre-normalizing the query client-side: supabase/functions/fire-safety-chat/hybridRetrieval.ts sbcNormalizeAr().';

-- ============================================================================
-- SECTION 3 -- sbc_to_tsvector_simple: IMMUTABLE wrapper (see header note)
-- ============================================================================

create or replace function public.sbc_to_tsvector_simple(input text)
returns tsvector
language sql
immutable
parallel safe
as $$
  select to_tsvector('simple', public.sbc_normalize_ar(input))
$$;

comment on function public.sbc_to_tsvector_simple(text) is
  'IMMUTABLE wrapper around to_tsvector(''simple'', sbc_normalize_ar(input)). Exists solely because to_tsvector(regconfig, text) is STABLE in pg_proc, and a GENERATED ALWAYS AS ... STORED column requires an IMMUTABLE expression -- see the migration header "IMMUTABILITY NOTE". Safe to declare IMMUTABLE here because ''simple'' is a built-in text-search config this database does not redefine.';

-- ============================================================================
-- SECTION 4 -- sbc_documents.tsv generated column (guarded; full rewrite)
-- ============================================================================
-- IF NOT EXISTS via a DO block (not inline ADD COLUMN IF NOT EXISTS) per task
-- spec, so a re-run is a silent no-op rather than depending on that syntax
-- form alone. Adding a STORED generated column to an existing table is a
-- full-table rewrite under ACCESS EXCLUSIVE lock -- see
-- docs/launch/hybrid-retrieval-notes.md for the expected duration at this
-- corpus size and a low-traffic-window recommendation. `tsv` is nullable in
-- principle but never actually null: sbc_normalize_ar(coalesce(content,''))
-- never returns NULL, and content is NOT NULL on this table already.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sbc_documents' and column_name = 'tsv'
  ) then
    alter table public.sbc_documents
      add column tsv tsvector generated always as (public.sbc_to_tsvector_simple(coalesce(content, ''))) stored;
  end if;
end $$;

-- ============================================================================
-- SECTION 5 -- GIN index on tsv
-- ============================================================================

create index if not exists idx_sbc_documents_tsv on public.sbc_documents using gin (tsv);

-- ============================================================================
-- SECTION 6 -- match_sbc_hybrid: the fused RPC
-- ============================================================================
-- Returns the SAME columns as match_sbc_documents_v2, in the same order,
-- plus four fusion columns (rrf_score, vector_rank, fts_rank, fts_score), so
-- a caller that already knows v2's shape only has new fields to add, not
-- existing ones to rename.
--
-- match_count has NO default (unlike v1/v2's `DEFAULT 20`) -- deliberate: this
-- RPC also exposes rrf_k/candidate_pool tuning, where a silently-applied
-- default combination is less obviously safe than v1/v2's single-knob case.
-- Every caller, including manual SQL-editor testing, states the limit
-- explicitly. filter_codes is plural (text[], ANY-match) rather than v1/v2's
-- single filter_code -- a genuine capability addition (filter to "SBC201 OR
-- SBC801" in one call), not required for behavioural parity: a caller that
-- wants today's single-code behaviour passes a one-element array.
--
-- Candidate lists: vector_candidates orders by the same
-- `embedding <=> query_embedding, id ASC` as v2 (deterministic tie-break),
-- restricted to non-null embeddings (36 of ~4,630 SBC201 rows have none per
-- 20260824100002_sbc_documents_formalize.sql's comment) and to filter_codes
-- when given. fts_candidates orders by ts_rank_cd(tsv, tsq) DESC, id ASC,
-- same filter_codes, restricted to tsv @@ tsq so a document with zero lexical
-- overlap is never handed a fabricated fts_rank. Both lists cap at
-- candidate_pool (default 40) before fusion.
--
-- Query parsing: websearch_to_tsquery('simple', sbc_normalize_ar(query_text))
-- first (tolerant of raw, unsanitized search-box-style input -- never raises
-- a syntax error, degrades to an empty tsquery on meaningless input rather
-- than throwing); plainto_tsquery('simple', ...) as a fallback ONLY when that
-- comes back null or the empty tsquery (''::tsquery). If parsing somehow
-- still yields nothing, fts_candidates is simply empty (tsv @@ '' matches no
-- row) and the result degrades to a pure-vector ranking -- not an error.
-- Belt-and-braces: even if some future Postgres version made either tsquery
-- function throw on a pathological input, the exception surfaces to the
-- caller as an RPC error, and hybridRetrieval.ts's fetchSBCContextHybrid
-- fails OPEN on any RPC error (returns null; caller keeps its current path)
-- -- so a bug here degrades retrieval, it cannot break the chat response.
--
-- Fusion: RRF, score = sum over {vector, fts} of 1/(rrf_k + rank) for each
-- list the document appears in (0 contribution from a list it is absent
-- from) -- a FULL OUTER JOIN of the two candidate CTEs on id. similarity is
-- computed fresh in the final SELECT for every returned row (not carried
-- from vector_candidates), so an FTS-only hit still reports a real cosine
-- similarity instead of NULL, wherever the row has an embedding. Final order:
-- rrf_score DESC, id ASC (deterministic tie-break, matching v2's convention)
-- -- same "byte-identical repeat query" property v2's header requires.
--
-- STABLE (v1/v2 leave this unmarked, defaulting to VOLATILE, despite being
-- read-only): declared here because it is accurate and a genuine, zero-risk
-- planner hint for a function that only ever SELECTs.

create or replace function public.match_sbc_hybrid(
  query_text text,
  query_embedding vector(768),
  match_count int,
  filter_codes text[] default null,
  rrf_k int default 60,
  candidate_pool int default 40
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
  with vector_candidates as (
    select
      d.id,
      row_number() over (order by d.embedding <=> query_embedding, d.id asc) as vrank
    from public.sbc_documents d
    where d.embedding is not null
      and (filter_codes is null or d.code_type = any(filter_codes))
    order by d.embedding <=> query_embedding, d.id asc
    limit candidate_pool
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
        + (case when f.frank is not null then 1.0 / (rrf_k + f.frank) else 0.0 end) as rrf_score
    from vector_candidates v
    full outer join fts_candidates f on v.id = f.id
  )
  select
    d.id, d.content, d.metadata, d.code_type,
    d.section_number, d.chapter_number,
    d.page_start, d.page_end, d.file_name,
    case when d.embedding is not null then 1 - (d.embedding <=> query_embedding) else null end as similarity,
    fused.rrf_score,
    fused.vector_rank,
    fused.fts_rank,
    fused.fts_score
  from fused
  join public.sbc_documents d on d.id = fused.doc_id
  order by fused.rrf_score desc, d.id asc
  limit match_count;
end;
$$;

comment on function public.match_sbc_hybrid(text, vector, int, text[], int, int) is
  'Hybrid retrieval over public.sbc_documents: pgvector cosine similarity fused with Postgres full-text search (tsv, Arabic-normalized) via Reciprocal Rank Fusion (rrf_k default 60). Returns match_sbc_documents_v2''s columns plus rrf_score/vector_rank/fts_rank/fts_score. Deterministic tie-break (rrf_score DESC, id ASC), same convention as v2. SECURITY INVOKER, service_role only. Not called by any deployed code path as of this migration -- provisioned ahead of the wiring change behind ADVISORY_HYBRID_RETRIEVAL_ENABLED; see docs/launch/hybrid-retrieval-notes.md.';

-- ============================================================================
-- SECTION 7 -- grants (defence in depth; mirrors match_sbc_documents_v2)
-- ============================================================================
-- Supabase's public-schema default ACL grants EXECUTE to anon and
-- authenticated on every function born in `public` -- REVOKE ... FROM PUBLIC
-- alone does not remove an explicit named-role grant, so anon and
-- authenticated are revoked by name (same fix pattern as v2 and
-- docs/audits/SECURITY-quota-rpc-bypass-20260823.md Section 4). Only
-- match_sbc_hybrid is restricted -- see the "SECURITY POSTURE" header note
-- for why sbc_normalize_ar / sbc_to_tsvector_simple are left at the default.

revoke all     on function public.match_sbc_hybrid(text, vector, int, text[], int, int) from public;
revoke all     on function public.match_sbc_hybrid(text, vector, int, text[], int, int) from anon;
revoke all     on function public.match_sbc_hybrid(text, vector, int, text[], int, int) from authenticated;
grant  execute on function public.match_sbc_hybrid(text, vector, int, text[], int, int) to service_role;

-- ============================================================================
-- SECTION 8 -- PostgREST schema cache
-- ============================================================================
-- Without this reload the new RPC stays invisible (PGRST202) to any future
-- caller until the cache next refreshes on its own.

notify pgrst, 'reload schema';
