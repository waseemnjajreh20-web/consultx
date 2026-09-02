-- D1: embedding + retrieval-result caches (2026-09-03).
--
-- Backs supabase/functions/fire-safety-chat/retrievalCache.ts. Two tables:
--
--   retrieval_cache   — the cache itself. One row per (embedding OR
--                        retrieval-result) cache entry, keyed by a sha256 hex
--                        string computed in TypeScript (see retrievalCache.ts
--                        "KEY RECIPES"). Service-role only: this table has no
--                        user_id column at all — the corpus it caches
--                        (sbc_documents) is public building-code text, so
--                        cache entries are shared across every account by
--                        design. See retrievalCache.ts's "PRIVACY ARGUMENT"
--                        for the full statement of why that is safe. This
--                        table NEVER stores model answers — only query
--                        embeddings and retrieval results, both of which are
--                        deterministic functions of (question text, corpus
--                        state), never of who asked.
--
--   runtime_settings   — tiny owner-editable key/value config table. Seeded
--                        with two cache-epoch counters the OWNER bumps by
--                        hand (a single UPDATE — see the "HOW TO INVALIDATE"
--                        note at the bottom of this file):
--                          corpus_version          — bump after any SBC
--                                                     ingest/re-ingest so
--                                                     stale retrieval/
--                                                     embedding rows stop
--                                                     being trusted.
--                          retrieval_flags_version — bump after any code
--                                                     change to the
--                                                     retrieval pipeline
--                                                     itself (a regex fix, a
--                                                     prompt/context-format
--                                                     change, ...) that
--                                                     should invalidate
--                                                     cached retrieval
--                                                     results even though no
--                                                     env flag value
--                                                     changed. Not currently
--                                                     read by
--                                                     retrievalCache.ts
--                                                     itself — the caller
--                                                     (index.ts wiring) folds
--                                                     it into
--                                                     getRetrievalCached's
--                                                     `keyParts`; this row
--                                                     exists so that wiring
--                                                     has one canonical place
--                                                     to read it from rather
--                                                     than inventing an env
--                                                     var per fix.
--
-- Idempotent by construction — safe to re-run (create table/index IF NOT
-- EXISTS, seed rows ON CONFLICT DO NOTHING so re-running this file can never
-- silently reset a value the owner already bumped). Applied to production via
-- the Management API, never via `supabase db push` (repo operating contract —
-- known migration drift). NOTE: canonical copy lives here (docs/db/), not
-- supabase/migrations/, for the same reason docs/db/20260901_user_memory.sql
-- states: the guard-migrations hook protects supabase/migrations/ from
-- unattended writes.

-- ============================================================================
-- 1. retrieval_cache
-- ============================================================================

create table if not exists public.retrieval_cache (
  key            text primary key,
  kind           text not null check (kind in ('embedding', 'retrieval')),
  payload        jsonb not null,
  corpus_version integer not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null
);

create index if not exists retrieval_cache_expires_at_idx
  on public.retrieval_cache (expires_at);

alter table public.retrieval_cache enable row level security;

-- Deliberately NO policies. RLS enabled + zero policies = default-deny for
-- every role PostgREST enforces RLS against; only the service role (which
-- bypasses RLS entirely, same as every other admin-only table in this
-- schema) can read or write. The explicit REVOKE below is defense in depth
-- against whatever default grants this project's `anon`/`authenticated`
-- roles happen to carry — harmless no-op if they already had nothing.
revoke all on public.retrieval_cache from anon, authenticated;

-- ============================================================================
-- 2. runtime_settings
-- ============================================================================

create table if not exists public.runtime_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.runtime_settings enable row level security;
revoke all on public.runtime_settings from anon, authenticated;

-- ON CONFLICT DO NOTHING is load-bearing: this file is safe to re-run, and a
-- re-run must NEVER reset a value the owner has already bumped past '1'.
insert into public.runtime_settings (key, value)
values
  ('corpus_version', '1'),
  ('retrieval_flags_version', '1')
on conflict (key) do nothing;

-- ============================================================================
-- 3. retrieval_cache_gc() — expired-row cleanup
-- ============================================================================
--
-- SECURITY DEFINER so the owner can schedule it (pg_cron runs as the
-- scheduling role, not necessarily one with table privileges) without
-- granting EXECUTE to anon/authenticated. `set search_path = public` pins the
-- resolution path so a SECURITY DEFINER function can't be tricked by a
-- search_path set in the calling session — standard hardening for any
-- SECURITY DEFINER function, not specific to this table.

create or replace function public.retrieval_cache_gc()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.retrieval_cache where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.retrieval_cache_gc() from public, anon, authenticated;

-- Owner-run only — requires the pg_cron extension and is an owner-only
-- dashboard/schedule action per the repo operating contract. NOT executed by
-- this file; paste into the SQL editor (or Supabase's cron UI) by hand:
--
-- select cron.schedule(
--   'retrieval_cache_gc',
--   '*/30 * * * *',
--   $$select public.retrieval_cache_gc();$$
-- );
--
-- To remove it later: select cron.unschedule('retrieval_cache_gc');

-- ============================================================================
-- HOW TO INVALIDATE (owner, no deploy)
-- ============================================================================
-- After any SBC ingest/re-ingest:
--   update public.runtime_settings set value = (value::int + 1)::text,
--     updated_at = now() where key = 'corpus_version';
--
-- After any retrieval-pipeline code fix that should invalidate cached
-- results even though no env flag changed:
--   update public.runtime_settings set value = (value::int + 1)::text,
--     updated_at = now() where key = 'retrieval_flags_version';
--
-- Either statement makes every existing retrieval_cache row stop matching on
-- its very next read (getCorpusVersion's in-process memo is capped at 5
-- minutes, so the change is visible everywhere within that window). Old rows
-- are not deleted by the UPDATE itself — they simply age out via
-- retrieval_cache_gc() / their own expires_at, which is intentional: keeping
-- them costs nothing (they are never matched again) and deleting them
-- eagerly is not this statement's job.
