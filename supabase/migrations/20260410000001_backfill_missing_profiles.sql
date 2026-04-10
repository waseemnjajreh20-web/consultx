-- Backfill profiles rows for auth users who have no profiles entry.
-- Root cause: Google SSO signup trigger failed silently for these users,
-- leaving auth.users rows with no corresponding profiles row. Every admin
-- mutation (set_plan, set_role, etc.) used UPDATE and silently hit 0 rows,
-- making admin changes appear to "revert" immediately.
--
-- Applied live on 2026-04-10 via MCP apply_migration.
-- This file tracks that migration in source control.

INSERT INTO public.profiles (user_id, plan_type, role, created_at, updated_at)
SELECT
  au.id,
  COALESCE(
    au.raw_user_meta_data->>'plan_type',
    'free'
  ) AS plan_type,
  'user' AS role,
  au.created_at,
  now()
FROM auth.users au
LEFT JOIN public.profiles p ON p.user_id = au.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
