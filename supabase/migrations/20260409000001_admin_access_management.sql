-- ============================================================
-- Admin Access Management
-- 2026-04-09
--
-- 1. Add  column to profiles
--    Values: 'user' (default), 'admin', 'super_admin'
--    The two hardcoded super_admin emails are seeded here.
--
-- 2. Create admin_audit_log table
--    Append-only record of every admin mutation.
--    Service-role writes only; no direct user access.
-- ============================================================

-- 1. profiles.role
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'super_admin'));

UPDATE public.profiles
  SET role = 'super_admin'
  WHERE user_id IN (
    SELECT id FROM auth.users
    WHERE lower(email) IN (
      'njajrehwaseem@gmail.com',
      'waseemnjajreh20@gmail.com'
    )
  );

CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles (role)
  WHERE role != 'user';

-- 2. admin_audit_log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id   UUID        NOT NULL,
  admin_email     TEXT        NOT NULL,
  target_user_id  UUID        NOT NULL,
  action          TEXT        NOT NULL,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_audit_log_deny_all"
  ON public.admin_audit_log
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_admin_audit_target
  ON public.admin_audit_log (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON public.admin_audit_log (created_at DESC);
