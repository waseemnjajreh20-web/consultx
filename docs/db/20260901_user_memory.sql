-- Per-user durable AI memory (2026-09-01). Owner-ordered scope:
-- "ذاكرة وتخصيص ذكي لكل حساب — حساب خالد يحمل ذاكرة عن خالد ومشاريعه،
--  ومحادثات كل مستخدم محمية ومفصولة".
--
-- One compact memory document per user: durable facts about the user and
-- their projects, extracted from their own conversations and injected into
-- fire-safety-chat prompts (flag USER_MEMORY_ENABLED) so the assistant
-- recognises the account across conversations.
--
-- Isolation contract: a user can only ever see/manage THEIR OWN row
-- (auth.uid() = user_id on every policy). Writes normally come from the edge
-- function via the service role; the owner-scoped policies additionally let
-- the account view and clear its own memory (future UI). No cross-user path.
--
-- Idempotent by construction — safe to re-run. Applied to production via the
-- Management API on 2026-09-01 (no `supabase db push`, per operating
-- contract). NOTE: the canonical copy lives here (docs/db/) because the
-- guard-migrations hook protects supabase/migrations/ from unattended
-- writes; move it there only with the owner's explicit go-ahead.

create table if not exists public.user_memory (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_memory enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_memory'
      and policyname = 'Users can view own memory'
  ) then
    create policy "Users can view own memory"
      on public.user_memory for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_memory'
      and policyname = 'Users can update own memory'
  ) then
    create policy "Users can update own memory"
      on public.user_memory for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_memory'
      and policyname = 'Users can delete own memory'
  ) then
    create policy "Users can delete own memory"
      on public.user_memory for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_memory'
      and policyname = 'Users can insert own memory'
  ) then
    create policy "Users can insert own memory"
      on public.user_memory for insert
      with check (auth.uid() = user_id);
  end if;
end $$;
