-- ConsultX 2026-08-25 -- add public.profiles.audience_preference.
--
-- APPLY VIA THE SUPABASE SQL EDITOR ONLY. NEVER `supabase db push` -- the
-- local/production migration lineage on this project is broken (see
-- 20260501000002_phase1_truth_layer_remediation.sql and
-- 20260823000001_restore_missing_profile_preference_columns.sql for prior
-- incidents caused by trusting CLI push against this project). Apply this
-- file's statements directly against production, then verify with
-- information_schema.columns / pg_constraint as done for prior profiles
-- column additions, and document the result here or in the recovery notes.
--
-- WHAT THIS IS FOR:
-- Part of the Advisory Brain plan's audience-aware output work. The column
-- records which reader profile (engineer / decision maker / project owner /
-- technician) a user wants advisory answers presented for. It is read-only
-- storage in this migration -- no retrieval, prompt, or routing behavior in
-- fire-safety-chat is changed here, and any behavior that later reads this
-- column ships behind its own default-OFF flag per the project's hard
-- rules.
--
-- WHY NULLABLE, NO DEFAULT:
-- NULL means "no audience preference set" and MUST be treated by all
-- readers as equivalent to 'engineer' -- i.e. the current, undifferentiated
-- HEAD presentation. Every existing row becomes NULL on ADD COLUMN, so
-- with no reader code touching this column yet (true as of this
-- migration) and with any future flagged reader defaulting NULL to
-- 'engineer', system behavior stays byte-identical to HEAD until a user
-- explicitly sets a preference through a UI that does not exist yet. Do
-- not add a DEFAULT here -- that would silently change every existing
-- user's row on the day this migration is applied, before any UI or flag
-- exists to explain why.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op if the column already
-- exists; the DO block only adds the CHECK constraint if a constraint of
-- that exact name does not already exist. Safe to re-run.
--
-- NO RLS CHANGES: this column rides the existing public.profiles RLS
-- policies (row ownership already scoped by auth.uid() = id -- see
-- 20260309064547_3ad1ed6b-acf8-4dcc-aa29-29af061b3096.sql and
-- 20260426000007_enterprise_profiles_realtime_roles.sql). A new column on
-- an existing table does not require a new policy; the existing
-- select/update policies on public.profiles already cover it. No policy
-- is added, altered, or dropped by this migration.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS audience_preference text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_audience_preference_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_audience_preference_check
      CHECK (audience_preference IN ('engineer', 'decision_maker', 'project_owner', 'technician'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.audience_preference IS
  'Reader profile for advisory output presentation: engineer | decision_maker | project_owner | technician. NULL (the default for all existing and new rows) means no preference set and MUST be treated as "engineer" -- the current, undifferentiated HEAD presentation. Part of the Advisory Brain plan; any code that reads this column ships behind its own default-OFF flag, per CLAUDE.md.';
