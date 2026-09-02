-- Building Profile foundation (C1a, 2026-09-03). Owner-ordered scope:
-- engineers using ConsultX (SBC fire-safety assistant, modes
-- primary/standard/analysis) repeatedly re-describe the same building in
-- every question. A structured profile attached to a conversation lets
-- answers be computed in that context (src/lib/buildingProfile.ts) and lets
-- a formal compliance report be generated (src/lib/complianceReport.ts).
--
-- Isolation contract: a user can only ever see/manage THEIR OWN rows
-- (auth.uid() = user_id on every policy) — same contract as
-- docs/db/20260901_user_memory.sql. No cross-user path. Reads from the
-- fire-safety-chat edge function use the service-role client (bypasses RLS
-- by design, same as the user_memory fetch) and MUST filter by the
-- authenticated caller's own user_id/conversation_id — RLS is the backstop
-- for direct client access, not the only guard.
--
-- A profile is USER-PROVIDED FACTS, never a code source. It must never be
-- injected into the retrieval/citation pipeline and must never be citable
-- as [SBC-XXX ...] — see profileToPromptBlock() in buildingProfile.ts, which
-- labels the block explicitly and keeps it out of the citation-token parser.
--
-- Idempotent by construction — safe to re-run. NOT applied via
-- `supabase db push` (known migration drift, see CLAUDE.md). Apply to
-- production via the Management API only with the owner's explicit
-- go-ahead, then verify live with section 4 below. The canonical copy lives
-- here (docs/db/) because the guard-migrations hook protects
-- supabase/migrations/ from unattended writes; move it there only with the
-- owner's explicit go-ahead.
--
-- ============================================================================
-- 1. Table
-- ============================================================================

create table if not exists public.building_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- The `conversations` table exists (see src/hooks/useConversations.ts,
  -- src/integrations/supabase/types.ts) with a uuid `id` column — confirmed
  -- by the existing FK in supabase/migrations/20260128150602_..._.sql
  -- ("conversation_id uuid REFERENCES public.conversations(id) ON DELETE
  -- CASCADE NOT NULL" on public.messages). This FK mirrors that column type.
  -- Nullable + ON DELETE SET NULL: a profile is reusable across a user's
  -- conversations (not owned by exactly one), so deleting one conversation
  -- must not delete or corrupt the profile.
  conversation_id  uuid null references public.conversations(id) on delete set null,

  name             text not null default '',

  -- SBC 201 occupancy classifications. Bare letters (B, E, M, U) have no
  -- SBC-defined subtype; every other family requires a specific subtype
  -- (A-1..A-5, F-1/F-2, H-1..H-5, I-1..I-4, R-1..R-4, S-1/S-2) — there is no
  -- bare "A"/"F"/"H"/"I"/"R"/"S" value in the list on purpose. Review this
  -- list against the published SBC 201 occupancy chapter before go-live.
  occupancy_group  text null,

  stories          integer null,
  height_m         numeric null,
  gross_area_m2    numeric null,
  sprinklered      boolean null,

  -- SBC 201 construction types (fire-resistance classification).
  construction_type text null,

  -- Free text on purpose — no fixed enum was specified for hazard
  -- classification (e.g. NFPA-style commodity/hazard grouping used in
  -- sprinkler design) and inventing one here would be a fabricated
  -- authority list. Left for manual entry / a future dedicated lookup.
  hazard_class     text null,

  occupant_load    integer null,
  notes            text not null default '',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint building_profiles_occupancy_group_check check (
    occupancy_group is null or occupancy_group in (
      'A-1','A-2','A-3','A-4','A-5',
      'B',
      'E',
      'F-1','F-2',
      'H-1','H-2','H-3','H-4','H-5',
      'I-1','I-2','I-3','I-4',
      'M',
      'R-1','R-2','R-3','R-4',
      'S-1','S-2',
      'U'
    )
  ),
  constraint building_profiles_construction_type_check check (
    construction_type is null or construction_type in (
      'I-A','I-B','II-A','II-B','III-A','III-B','IV','V-A','V-B'
    )
  ),
  constraint building_profiles_stories_check       check (stories        is null or stories        >= 0),
  constraint building_profiles_height_check        check (height_m       is null or height_m       >= 0),
  constraint building_profiles_area_check          check (gross_area_m2  is null or gross_area_m2  >= 0),
  constraint building_profiles_occupant_load_check check (occupant_load  is null or occupant_load  >= 0)
);

comment on table public.building_profiles is
  'User-provided building facts attached to a conversation (C1a, 2026-09-03). '
  'Not a code source — never cite a row as an SBC authority. Owner-scoped RLS below.';

-- ============================================================================
-- 2. Row Level Security — owner-scoped, same pattern as user_memory
-- ============================================================================

alter table public.building_profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'building_profiles'
      and policyname = 'Users can view own building profiles'
  ) then
    create policy "Users can view own building profiles"
      on public.building_profiles for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'building_profiles'
      and policyname = 'Users can insert own building profiles'
  ) then
    create policy "Users can insert own building profiles"
      on public.building_profiles for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'building_profiles'
      and policyname = 'Users can update own building profiles'
  ) then
    create policy "Users can update own building profiles"
      on public.building_profiles for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'building_profiles'
      and policyname = 'Users can delete own building profiles'
  ) then
    create policy "Users can delete own building profiles"
      on public.building_profiles for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- ============================================================================
-- 3. updated_at trigger + index
-- ============================================================================

-- Canonical trigger function, identical to the one created in
-- supabase/migrations/20260210180359_a6915db1-2f7d-4635-8a7a-f8d0cb896029.sql
-- and reused by 15+ tables since (organizations, org_members, user_subscriptions,
-- ...). CREATE OR REPLACE is idempotent; redefining it here with the SAME body
-- makes this doc self-contained even if applied standalone, with zero effect
-- on the existing production definition.
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists update_building_profiles_updated_at on public.building_profiles;
create trigger update_building_profiles_updated_at
  before update on public.building_profiles
  for each row execute function public.update_updated_at_column();

create index if not exists idx_building_profiles_user_conversation
  on public.building_profiles (user_id, conversation_id);

-- ============================================================================
-- 4. SECURITY TEST — owner isolation (run manually: Supabase SQL Editor or
-- psql against the pooler). Fully rolled back — no durable writes, no real
-- users touched. Style matches scripts/verify-seat-enforcement.cjs
-- (set_config('request.jwt.claims', ...) to simulate auth.uid()) and
-- docs/audits/rls-audit-20260823.md (BEGIN / SET LOCAL ROLE / ROLLBACK).
-- ============================================================================

/*
BEGIN;

-- Synthetic users A and B (namespaced UUIDs — never collide with real users).
-- Required because building_profiles.user_id has an FK to auth.users(id);
-- both rows are discarded by the final ROLLBACK.
INSERT INTO auth.users (id, email, instance_id, aud, role, email_confirmed_at)
VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'bp-test-a@example.invalid',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
  ('b0000000-0000-4000-8000-00000000000b', 'bp-test-b@example.invalid',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());

-- Act as user A: insert one profile.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

INSERT INTO public.building_profiles (user_id, name, occupancy_group, stories)
VALUES ('a0000000-0000-4000-8000-00000000000a', 'Test Tower A', 'B', 6);

-- Still as user A: must see exactly 1 row.
SELECT count(*) AS user_a_sees FROM public.building_profiles; -- expect 1

-- Switch to user B: must see ZERO rows (owner isolation, the core assertion).
SELECT set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

SELECT count(*) AS user_b_sees FROM public.building_profiles; -- expect 0

-- User B tries to insert a row claiming user A's id — WITH CHECK must reject
-- it. Wrapped in a DO block so the *expected* failure doesn't abort the test
-- transaction; if the insert unexpectedly SUCCEEDS we raise our own failure.
DO $$
BEGIN
  INSERT INTO public.building_profiles (user_id, name)
  VALUES ('a0000000-0000-4000-8000-00000000000a', 'Spoofed row');
  RAISE EXCEPTION 'SECURITY TEST FAILED: user B inserted a row owned by user A';
EXCEPTION
  WHEN insufficient_privilege OR others THEN
    RAISE NOTICE 'OK: user B could not insert a row owned by user A (%): %', SQLSTATE, SQLERRM;
END $$;

-- User B tries to update user A's row directly — must affect 0 rows (USING
-- clause on UPDATE filters it out of B's visible set before WITH CHECK even
-- runs).
UPDATE public.building_profiles
  SET name = 'hijacked'
  WHERE user_id = 'a0000000-0000-4000-8000-00000000000a';
-- expect: UPDATE 0

-- User B tries to delete user A's row — must affect 0 rows.
DELETE FROM public.building_profiles
  WHERE user_id = 'a0000000-0000-4000-8000-00000000000a';
-- expect: DELETE 0

ROLLBACK; -- discards everything above, including the two synthetic auth.users rows
*/
