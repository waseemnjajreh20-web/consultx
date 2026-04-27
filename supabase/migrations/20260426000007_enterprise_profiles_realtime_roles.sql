-- ============================================================
-- Enterprise Profiles, Realtime, and Flexible Role Labels (Phase E7.8)
--
-- Adds:
--   1. Realtime publication entries for org_messages, org_member_presence,
--      and case_notes so postgres_changes events flow to subscribed clients.
--   2. user_public_profiles  -- per-user display name, avatar URL, job title,
--                               phone, bio, preferred language.
--   3. org_member_profiles   -- per-org display overrides: custom role title
--                               (Arabic/English), department, phone extension,
--                               and admin-visible notes.
--
-- RPCs:
--   upsert_my_public_profile(...)    -- self-update of user_public_profiles
--   upsert_org_member_profile(...)   -- owner/admin or self update of
--                                      org_member_profiles. Self callers may
--                                      only edit personal fields; admin-only
--                                      fields are silently coerced to current
--                                      values when caller is not admin.
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify organizations, org_members, org_invitations (E2)
--   * does NOT modify enterprise_cases, case_documents,
--     case_status_history, case_notes, enterprise_case_counters (E3)
--   * does NOT modify case_reviews, case_approvals (E4)
--   * does NOT modify case_ai_sessions, ai_report_versions,
--     case_review_ai_reports (E5)
--   * does NOT modify organization_branding_settings, accept_org_invitation,
--     revoke_org_invitation, update_org_member_role,
--     update_org_member_status, upsert_organization_branding (E7.6)
--   * does NOT modify org_member_presence, org_messages, touch_org_presence,
--     send_org_message, edit_org_message, soft_delete_org_message (E7.7)
--   * does NOT modify user_subscriptions, payment_transactions,
--     profiles, subscription_plans, or any Moyasar/billing/webhook surface
--   * does NOT alter any existing edge function behavior
--   * does NOT touch fire-safety-chat or fire-safety-chat-v2
--   * does NOT touch the Analytical Mode pipeline
-- ============================================================


-- ============================================================
-- A. Realtime publication (idempotent)
--
-- Adds existing E7.7 messaging/presence tables and E3 case_notes to the
-- supabase_realtime publication so the frontend can subscribe to
-- postgres_changes events. Each block guards against re-adding a table
-- already in the publication so the migration is safe to re-run.
-- ============================================================
DO $realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'org_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.org_messages';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'org_member_presence'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.org_member_presence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'case_notes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.case_notes';
  END IF;
END
$realtime$;


-- ============================================================
-- B. user_public_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_public_profiles (
  user_id            UUID        NOT NULL PRIMARY KEY
                       REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name       TEXT,
  avatar_url         TEXT,
  job_title          TEXT,
  phone              TEXT,
  bio                TEXT,
  preferred_language TEXT        NOT NULL DEFAULT 'ar'
                       CHECK (preferred_language IN ('ar', 'en')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_public_profiles IS
  'Per-user public profile metadata (display name, avatar URL, job title, '
  'phone, bio, preferred language). One row per auth.users id. '
  'SELECT is open to any authenticated user so the workspace can resolve '
  'names/avatars without joining auth.users from the client. '
  'Writes are scoped to the row owner (auth.uid()) via RLS and the '
  'upsert_my_public_profile RPC.';


-- ============================================================
-- C. org_member_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_member_profiles (
  member_id             UUID        NOT NULL PRIMARY KEY
                          REFERENCES public.org_members(id) ON DELETE CASCADE,
  org_id                UUID        NOT NULL
                          REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL
                          REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name_override TEXT,
  role_title_ar         TEXT,
  role_title_en         TEXT,
  department            TEXT,
  phone_ext             TEXT,
  notes                 TEXT,
  updated_by            UUID        REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_member_profiles IS
  'Per-organization display overrides for an org_members row: custom role '
  'title in Arabic/English, department, phone extension, admin notes, and '
  'an optional display name override that takes precedence over the user '
  'public profile when rendered inside this org. SELECT is scoped to active '
  'members of the same organization. Writes are gated by '
  'upsert_org_member_profile (owner/admin OR self with personal fields only).';


-- ============================================================
-- D. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_org_member_profiles_org_id
  ON public.org_member_profiles (org_id);

CREATE INDEX IF NOT EXISTS idx_org_member_profiles_user_id
  ON public.org_member_profiles (user_id);


-- ============================================================
-- E. updated_at triggers
-- ============================================================
DROP TRIGGER IF EXISTS update_user_public_profiles_updated_at
  ON public.user_public_profiles;
CREATE TRIGGER update_user_public_profiles_updated_at
  BEFORE UPDATE ON public.user_public_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_org_member_profiles_updated_at
  ON public.org_member_profiles;
CREATE TRIGGER update_org_member_profiles_updated_at
  BEFORE UPDATE ON public.org_member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- F. RLS
-- ============================================================
ALTER TABLE public.user_public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_member_profiles  ENABLE ROW LEVEL SECURITY;

-- user_public_profiles: any authenticated user may read any profile.
DROP POLICY IF EXISTS "user_public_profiles_select_authenticated"
  ON public.user_public_profiles;
CREATE POLICY "user_public_profiles_select_authenticated"
  ON public.user_public_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- user_public_profiles: a user may insert their own row.
DROP POLICY IF EXISTS "user_public_profiles_insert_self"
  ON public.user_public_profiles;
CREATE POLICY "user_public_profiles_insert_self"
  ON public.user_public_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- user_public_profiles: a user may update their own row.
DROP POLICY IF EXISTS "user_public_profiles_update_self"
  ON public.user_public_profiles;
CREATE POLICY "user_public_profiles_update_self"
  ON public.user_public_profiles
  FOR UPDATE
  TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy on user_public_profiles.

-- org_member_profiles: SELECT for any active member of the same org.
DROP POLICY IF EXISTS "org_member_profiles_select_same_org"
  ON public.org_member_profiles;
CREATE POLICY "org_member_profiles_select_same_org"
  ON public.org_member_profiles
  FOR SELECT
  TO authenticated
  USING (public.is_active_org_member(org_id, auth.uid()));

-- No direct INSERT/UPDATE/DELETE on org_member_profiles: gated by
-- upsert_org_member_profile (SECURITY DEFINER) below.


-- ============================================================
-- G. RPC: upsert_my_public_profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_my_public_profile(
  p_display_name       TEXT,
  p_avatar_url         TEXT,
  p_job_title          TEXT,
  p_phone              TEXT,
  p_bio                TEXT,
  p_preferred_language TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_lang    TEXT := COALESCE(NULLIF(trim(p_preferred_language), ''), 'ar');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_lang NOT IN ('ar', 'en') THEN
    RAISE EXCEPTION 'Invalid preferred_language: %', v_lang;
  END IF;

  INSERT INTO public.user_public_profiles (
    user_id, display_name, avatar_url, job_title, phone, bio, preferred_language
  )
  VALUES (
    v_user_id,
    NULLIF(trim(COALESCE(p_display_name, '')), ''),
    NULLIF(trim(COALESCE(p_avatar_url,   '')), ''),
    NULLIF(trim(COALESCE(p_job_title,    '')), ''),
    NULLIF(trim(COALESCE(p_phone,        '')), ''),
    NULLIF(trim(COALESCE(p_bio,          '')), ''),
    v_lang
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name       = EXCLUDED.display_name,
    avatar_url         = EXCLUDED.avatar_url,
    job_title          = EXCLUDED.job_title,
    phone              = EXCLUDED.phone,
    bio                = EXCLUDED.bio,
    preferred_language = EXCLUDED.preferred_language,
    updated_at         = now();
END;
$func$;

COMMENT ON FUNCTION public.upsert_my_public_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Upserts the calling user''s row in user_public_profiles. Trims input, '
  'coerces empty strings to NULL, validates preferred_language in (ar,en).';

REVOKE ALL ON FUNCTION
  public.upsert_my_public_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.upsert_my_public_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================
-- H. RPC: upsert_org_member_profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_org_member_profile(
  p_member_id              UUID,
  p_display_name_override  TEXT,
  p_role_title_ar          TEXT,
  p_role_title_en          TEXT,
  p_department             TEXT,
  p_phone_ext              TEXT,
  p_notes                  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id  UUID := auth.uid();
  v_member   RECORD;
  v_existing RECORD;
  v_is_admin BOOLEAN;
  v_is_self  BOOLEAN;

  v_role_title_ar TEXT := NULLIF(trim(COALESCE(p_role_title_ar, '')), '');
  v_role_title_en TEXT := NULLIF(trim(COALESCE(p_role_title_en, '')), '');
  v_department    TEXT := NULLIF(trim(COALESCE(p_department,    '')), '');
  v_notes         TEXT := NULLIF(trim(COALESCE(p_notes,         '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, org_id, user_id
    INTO v_member
    FROM public.org_members
   WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  v_is_admin := public.is_org_owner_or_admin(v_member.org_id, v_user_id);
  v_is_self  := (v_member.user_id = v_user_id);

  IF NOT (v_is_admin OR v_is_self) THEN
    RAISE EXCEPTION 'Not authorized to edit this member profile';
  END IF;

  -- A non-admin self-editor can only update personal fields. Coerce the
  -- admin-only fields back to whatever is currently stored so a buggy or
  -- malicious client cannot self-promote a role title or department.
  IF NOT v_is_admin THEN
    SELECT role_title_ar, role_title_en, department, notes
      INTO v_existing
      FROM public.org_member_profiles
     WHERE member_id = p_member_id;

    IF FOUND THEN
      v_role_title_ar := v_existing.role_title_ar;
      v_role_title_en := v_existing.role_title_en;
      v_department    := v_existing.department;
      v_notes         := v_existing.notes;
    ELSE
      v_role_title_ar := NULL;
      v_role_title_en := NULL;
      v_department    := NULL;
      v_notes         := NULL;
    END IF;
  END IF;

  INSERT INTO public.org_member_profiles (
    member_id, org_id, user_id,
    display_name_override, role_title_ar, role_title_en,
    department, phone_ext, notes, updated_by
  )
  VALUES (
    v_member.id, v_member.org_id, v_member.user_id,
    NULLIF(trim(COALESCE(p_display_name_override, '')), ''),
    v_role_title_ar,
    v_role_title_en,
    v_department,
    NULLIF(trim(COALESCE(p_phone_ext, '')), ''),
    v_notes,
    v_user_id
  )
  ON CONFLICT (member_id) DO UPDATE SET
    display_name_override = EXCLUDED.display_name_override,
    role_title_ar         = EXCLUDED.role_title_ar,
    role_title_en         = EXCLUDED.role_title_en,
    department            = EXCLUDED.department,
    phone_ext             = EXCLUDED.phone_ext,
    notes                 = EXCLUDED.notes,
    updated_by            = v_user_id,
    updated_at            = now();
END;
$func$;

COMMENT ON FUNCTION public.upsert_org_member_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Upserts a row in org_member_profiles. Owner/admin of the org can edit '
  'any field for any member; the member themselves can edit only personal '
  'fields (display_name_override, phone_ext) — admin-only fields '
  '(role_title_ar/en, department, notes) are silently coerced to current '
  'values when caller is not admin. Owner row''s base role is not touched.';

REVOKE ALL ON FUNCTION
  public.upsert_org_member_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.upsert_org_member_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================
-- End of E7.8 migration.
-- Adds realtime + per-user / per-org-member display profile layer.
-- Next phases:
--   E8 -- enterprise billing (organization_subscriptions)
--   E9 -- client portal
-- ============================================================
