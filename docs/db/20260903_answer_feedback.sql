-- Answer feedback capture (2026-09-03).
--
-- Backs src/pages/AdminFeedback.tsx (the /admin/feedback review queue) and a
-- future in-chat "up/down + why" widget (not part of this batch — this file
-- is schema-only; no chat UI wiring happens here). Each row is one piece of
-- end-user signal on one assistant answer: a thumbs up/down, an optional
-- free-text note on what was wrong with a citation, a general comment, and
-- which mode the answer came from. The admin queue in AdminFeedback.tsx lets
-- an admin mark a row reviewed (with a note) and export a batch of rows as
-- draft entries for evals/golden/ (see docs/launch/golden-set-notes.md for
-- why an exported feedback row still needs manual completion before it is a
-- usable benchmark candidate — this table does not store the original
-- question/answer text, only the feedback on it).
--
-- Access model (same shape as perf_events in
-- docs/db/20260903_perf_events.sql, plus an owner-write lane like
-- user_memory in docs/db/20260901_user_memory.sql): RLS enabled, a signed-in
-- user may insert and read their OWN feedback rows (auth.uid() = user_id),
-- and an admin (profiles.role in ('admin','super_admin'), the same
-- correlated-subquery check every admin-gated table in this repo uses) may
-- select every row and update the three review fields (reviewed,
-- reviewed_at, review_note). The UPDATE policy is row-level only — Postgres
-- RLS has no column-level grant primitive — so it technically permits an
-- admin to update any column on a row they can see; AdminFeedback.tsx's own
-- update calls only ever send {reviewed, reviewed_at, review_note}. If that
-- ever needs to be enforced at the database layer too (not just by client
-- discipline), the fix is a BEFORE UPDATE trigger that rejects changes to
-- the other columns, not a weaker policy — out of scope for this batch.
--
-- Idempotent by construction — safe to re-run. Apply to production via the
-- Management API (no `supabase db push`, per the operating contract) or by
-- pasting into the Supabase SQL Editor. Canonical copy lives here (docs/db/)
-- because the guard-migrations hook protects supabase/migrations/ from
-- unattended writes; move it there only with the owner's explicit go-ahead.

create table if not exists public.answer_feedback (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  message_id      text,
  -- 'up' | 'down'; null means no thumbs rating was given (e.g. a citation-only note).
  rating          text check (rating in ('up', 'down')),
  citation_issue  text,
  comment         text,
  -- Fixed mode IDs per the operating contract (CLAUDE.md): primary/standard/analysis.
  -- Null is allowed for rows captured before mode was threaded through, or from a
  -- surface that doesn't know its mode.
  mode            text check (mode in ('primary', 'standard', 'analysis')),
  created_at      timestamptz not null default now(),
  reviewed        boolean not null default false,
  reviewed_at     timestamptz,
  review_note     text
);

comment on table public.answer_feedback is
  'One row per end-user thumbs up/down or citation-issue note on a fire-safety-chat '
  'answer. Written by the giving user only (own row); read by that user (own rows) '
  'or an admin (all rows); reviewed/reviewed_at/review_note are updated by admins '
  'from the /admin/feedback queue (src/pages/AdminFeedback.tsx). Does not store the '
  'original question/answer text -- conversation_id/message_id are pointers only.';

create index if not exists idx_answer_feedback_reviewed_created
  on public.answer_feedback (reviewed, created_at desc);

create index if not exists idx_answer_feedback_user
  on public.answer_feedback (user_id);

alter table public.answer_feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'answer_feedback'
      and policyname = 'answer_feedback_insert_own'
  ) then
    create policy "answer_feedback_insert_own"
      on public.answer_feedback for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'answer_feedback'
      and policyname = 'answer_feedback_select_own'
  ) then
    create policy "answer_feedback_select_own"
      on public.answer_feedback for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'answer_feedback'
      and policyname = 'answer_feedback_select_admin'
  ) then
    create policy "answer_feedback_select_admin"
      on public.answer_feedback for select
      using (
        exists (
          select 1 from public.profiles
          where profiles.user_id = auth.uid()
            and profiles.role in ('admin', 'super_admin')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'answer_feedback'
      and policyname = 'answer_feedback_update_admin'
  ) then
    create policy "answer_feedback_update_admin"
      on public.answer_feedback for update
      using (
        exists (
          select 1 from public.profiles
          where profiles.user_id = auth.uid()
            and profiles.role in ('admin', 'super_admin')
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where profiles.user_id = auth.uid()
            and profiles.role in ('admin', 'super_admin')
        )
      );
  end if;
end $$;
-- select_own and select_admin are both permissive SELECT policies on the same
-- table, so Postgres OR's them together: a row is visible when it is the
-- caller's own row OR the caller is an admin. No insert/delete policy for
-- admins -- reviewing never deletes user-submitted feedback.

notify pgrst, 'reload schema';
