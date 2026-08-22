-- Restore 4 profiles columns confirmed missing from production (docs/audits
-- session 2026-08-23). Applied directly to production via `supabase db
-- query --linked` (NOT `supabase db push` — local/production migration
-- lineage is broken, see 20260501000002_phase1_truth_layer_remediation.sql;
-- do not run `supabase db push` against this project). This file exists
-- purely as a source-of-truth record and is safe to re-run (idempotent).
--
-- Root cause: supabase/migrations/20260315120000_user_preferences.sql and
-- supabase/migrations/20260328000001_launch_trial_system.sql were authored
-- locally but never applied to production (both are in the 44 local-only /
-- zero-overlap migration set). Verified via `supabase gen types typescript
-- --linked`: the live `profiles` table had zero of ai_memory_level,
-- output_format, preferred_standards, launch_trial_welcomed.
--
-- Impact before this fix:
--   - usePreferences.ts writes to ai_memory_level/output_format/
--     preferred_standards could not persist (columns didn't exist).
--   - check-subscription (deployed 2026-04-30) and launch-trial-activate
--     (deployed 2026-04-08) SELECT launch_trial_welcomed without checking
--     the query error, so profile likely came back null on that fetch,
--     degrading plan/trial resolution.
--
-- Scope: ONLY the 4 missing columns are added here, copied verbatim from
-- their original source migrations above. No other statements from those
-- two files (e.g. mode_daily_usage table, launch_trial_status/start/end —
-- already present in production via an untracked migration) are included,
-- per explicit instruction to avoid unrelated/conflicting changes.
--
-- Verified post-apply (2026-08-23):
--   - information_schema.columns shows all 4 columns present with correct
--     type/default.
--   - REST smoke test (anon key, no session) returned HTTP 200 with `[]`
--     (RLS correctly blocks anonymous read; no "column does not exist"
--     error).
--   - Direct replication of check-subscription's exact profiles SELECT
--     against a real test-account row succeeded and returned all fields
--     with their defaults.
--   - `supabase gen types typescript --linked` regenerated cleanly and the
--     real (non-vacuous) `tsc --noEmit -p tsconfig.app.json` typecheck
--     dropped the useLaunchTrial.ts / useProfile.ts errors that depended on
--     this column.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_memory_level text DEFAULT 'session' CHECK (ai_memory_level IN ('none', 'session', 'persistent'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS output_format text DEFAULT 'detailed' CHECK (output_format IN ('concise', 'detailed', 'report'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_standards text[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS launch_trial_welcomed BOOLEAN NOT NULL DEFAULT FALSE;
