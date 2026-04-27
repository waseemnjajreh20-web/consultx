-- ============================================================
-- E7.10A: Enterprise Public Case Tracking — Tables + RPCs
-- Migration: 20260427000001_enterprise_public_tracking
-- ============================================================
-- Adds the additive schema layer for the external client tracking portal:
--   1. case_client_contacts  -- one row per case: client name, phone, email, channel pref
--   2. case_public_tracking  -- one row per case: public_token, visibility flags, branding text
--   3. case_public_updates   -- append-only published events (timeline entries the client sees)
--
-- RPCs:
--   ensure_case_public_tracking          -- lazily create tracking row + token
--   regenerate_case_public_token         -- rotate token (owner/admin only)
--   update_case_public_tracking_settings -- toggle visibility flags + public title/summary
--   upsert_case_client_contact           -- save client contact info
--   publish_case_public_update           -- create an immutable public timeline entry
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify enterprise_cases, case_documents, case_status_history,
--     case_notes, enterprise_case_counters (E3)
--   * does NOT modify case_reviews, case_approvals (E4)
--   * does NOT modify case_ai_sessions, ai_report_versions, case_review_ai_reports (E5)
--   * does NOT modify organizations, org_members, org_invitations (E2)
--   * does NOT modify organization_branding_settings (E7.6)
--   * does NOT modify org_messages, org_member_presence (E7.7)
--   * does NOT modify user_public_profiles, org_member_profiles (E7.8)
--   * does NOT modify the enterprise-case-documents storage bucket (E7.9)
--   * does NOT modify subscription_plans, user_subscriptions, payment_transactions
--   * does NOT touch fire-safety-chat or fire-safety-chat-v2
--   * does NOT touch the Analytical Mode / corpus / brain pipeline
--   * does NOT alter any existing edge function behavior
--
-- Public anonymous reads are served via the get-public-case-tracking edge
-- function (service role) -- there are NO direct anon RLS policies on these
-- tables. Member writes are gated by is_active_case_member() (excludes
-- finance_officer per the operating model).
-- ============================================================


-- ============================================================
-- Helper: extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_bytes() for token generation


-- ============================================================
-- A. case_client_contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_client_contacts (
  id                UUID         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID         NOT NULL REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id            UUID         NOT NULL REFERENCES public.organizations(id)    ON DELETE CASCADE,
  client_name       TEXT,
  phone_e164        TEXT,
  email             TEXT,
  preferred_channel TEXT         NOT NULL DEFAULT 'none'
                       CHECK (preferred_channel IN ('sms', 'whatsapp', 'email', 'none')),
  receive_updates   BOOLEAN      NOT NULL DEFAULT true,
  created_by        UUID         REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT case_client_contacts_unique_per_case UNIQUE (case_id)
);

COMMENT ON TABLE public.case_client_contacts IS
  'One contact record per enterprise case. Stores client name, phone (E.164), '
  'email, preferred notification channel, and an opt-in flag. org_id is denormalized '
  'from enterprise_cases for RLS efficiency. The org_id/case_id consistency invariant '
  'is enforced inside the upsert_case_client_contact RPC. Phone/email are intentionally '
  'never returned in the public tracking payload -- clients already know their own '
  'contact info; the portal does not echo it back.';

CREATE INDEX IF NOT EXISTS idx_case_client_contacts_org_id
  ON public.case_client_contacts (org_id);


-- ============================================================
-- B. case_public_tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_public_tracking (
  case_id                UUID         NOT NULL PRIMARY KEY
                            REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id                 UUID         NOT NULL
                            REFERENCES public.organizations(id) ON DELETE CASCADE,
  public_token           TEXT         NOT NULL UNIQUE,
  public_enabled         BOOLEAN      NOT NULL DEFAULT true,
  public_title           TEXT,
  public_summary         TEXT,
  show_engineer_contact  BOOLEAN      NOT NULL DEFAULT false,
  show_progress_percent  BOOLEAN      NOT NULL DEFAULT true,
  last_published_at      TIMESTAMPTZ,
  created_by             UUID         REFERENCES auth.users(id),
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.case_public_tracking IS
  'One row per enterprise case opened for external tracking. public_token is a '
  '32-char URL-safe random string (NOT a UUID -- UUIDs leak v4 marker bits) '
  'consumed by the get-public-case-tracking edge function. public_enabled=false '
  'revokes tracking instantly without losing settings. show_engineer_contact and '
  'show_progress_percent are explicit per-case opt-ins (default off / on). No anon '
  'RLS policies on this table -- public reads go through the edge function with '
  'service role + strict allow-list output.';

CREATE INDEX IF NOT EXISTS idx_case_public_tracking_org_id
  ON public.case_public_tracking (org_id);


-- ============================================================
-- C. case_public_updates  (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_public_updates (
  id                       UUID         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  UUID         NOT NULL REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id                   UUID         NOT NULL REFERENCES public.organizations(id)    ON DELETE CASCADE,
  title_ar                 TEXT         NOT NULL,
  title_en                 TEXT,
  body_ar                  TEXT,
  body_en                  TEXT,
  public_status            TEXT         NOT NULL,
  progress_percent         INTEGER      NOT NULL CHECK (progress_percent >= 0 AND progress_percent <= 100),
  client_action_required   BOOLEAN      NOT NULL DEFAULT false,
  required_action_ar       TEXT,
  required_action_en       TEXT,
  published_by             UUID         NOT NULL REFERENCES auth.users(id),
  published_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  notify_client            BOOLEAN      NOT NULL DEFAULT false,
  notification_status      TEXT         NOT NULL DEFAULT 'not_sent'
                              CHECK (notification_status IN
                                ('not_sent', 'queued', 'sent', 'failed', 'skipped'))
);

COMMENT ON TABLE public.case_public_updates IS
  'Append-only timeline of published external updates for a case. Each row is a '
  'snapshot of public_status + progress_percent at publish time. The client portal '
  'renders these in reverse-chronological order -- internal case_status_history is '
  'never exposed. notification_status defaults to not_sent; provider integration is '
  'deferred to E7.10C. No UPDATE/DELETE policies -- published events are immutable.';

CREATE INDEX IF NOT EXISTS idx_case_public_updates_case_published
  ON public.case_public_updates (case_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_public_updates_org_published
  ON public.case_public_updates (org_id, published_at DESC);


-- ============================================================
-- D. updated_at triggers (reuses helper function from earlier phases)
-- ============================================================
DROP TRIGGER IF EXISTS update_case_client_contacts_updated_at
  ON public.case_client_contacts;
CREATE TRIGGER update_case_client_contacts_updated_at
  BEFORE UPDATE ON public.case_client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_case_public_tracking_updated_at
  ON public.case_public_tracking;
CREATE TRIGGER update_case_public_tracking_updated_at
  BEFORE UPDATE ON public.case_public_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- E. RLS enable
-- ============================================================
ALTER TABLE public.case_client_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_public_tracking  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_public_updates   ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- F. RLS policies -- member-gated (excludes finance_officer)
-- ============================================================
-- case_client_contacts
DROP POLICY IF EXISTS "case_client_contacts_select_members" ON public.case_client_contacts;
CREATE POLICY "case_client_contacts_select_members"
  ON public.case_client_contacts
  FOR SELECT TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "case_client_contacts_insert_members" ON public.case_client_contacts;
CREATE POLICY "case_client_contacts_insert_members"
  ON public.case_client_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_case_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "case_client_contacts_update_members" ON public.case_client_contacts;
CREATE POLICY "case_client_contacts_update_members"
  ON public.case_client_contacts
  FOR UPDATE TO authenticated
  USING      (public.is_active_case_member(org_id, auth.uid()))
  WITH CHECK (public.is_active_case_member(org_id, auth.uid()));

-- No DELETE policy: contact info is preserved across the case lifecycle.

-- case_public_tracking
DROP POLICY IF EXISTS "case_public_tracking_select_members" ON public.case_public_tracking;
CREATE POLICY "case_public_tracking_select_members"
  ON public.case_public_tracking
  FOR SELECT TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "case_public_tracking_insert_members" ON public.case_public_tracking;
CREATE POLICY "case_public_tracking_insert_members"
  ON public.case_public_tracking
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_case_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "case_public_tracking_update_members" ON public.case_public_tracking;
CREATE POLICY "case_public_tracking_update_members"
  ON public.case_public_tracking
  FOR UPDATE TO authenticated
  USING      (public.is_active_case_member(org_id, auth.uid()))
  WITH CHECK (public.is_active_case_member(org_id, auth.uid()));

-- No DELETE policy: tracking rows persist; revoke via public_enabled=false.

-- case_public_updates
DROP POLICY IF EXISTS "case_public_updates_select_members" ON public.case_public_updates;
CREATE POLICY "case_public_updates_select_members"
  ON public.case_public_updates
  FOR SELECT TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

-- No INSERT/UPDATE/DELETE policies: writes are gated entirely by the
-- publish_case_public_update RPC (SECURITY DEFINER). Published events are
-- immutable from the client; only the RPC can mint a new row.


-- ============================================================
-- G. RPC: ensure_case_public_tracking
--    Lazily creates the tracking row + 32-char URL-safe token. Idempotent.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_case_public_tracking(
  p_case_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_case    RECORD;
  v_token   TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, org_id INTO v_case
    FROM public.enterprise_cases
   WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  IF NOT public.is_active_case_member(v_case.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Not authorized for this case';
  END IF;

  SELECT public_token INTO v_token
    FROM public.case_public_tracking
   WHERE case_id = p_case_id;

  IF FOUND THEN
    RETURN v_token;
  END IF;

  -- 24 random bytes -> base64 (32 chars), then translate to URL-safe alphabet
  -- and strip any trailing pad chars. Result is a stable URL-safe slug.
  v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_~');
  v_token := rtrim(v_token, '~');

  INSERT INTO public.case_public_tracking (
    case_id, org_id, public_token, created_by
  )
  VALUES (
    p_case_id, v_case.org_id, v_token, v_user_id
  );

  RETURN v_token;
END;
$func$;

COMMENT ON FUNCTION public.ensure_case_public_tracking(UUID) IS
  'Returns the existing public tracking token for a case, or creates a fresh '
  'tracking row with a 32-char URL-safe random token if none exists. Idempotent. '
  'Requires the caller to be an active case member (owner/admin/head/engineer; '
  'finance_officer is rejected by is_active_case_member).';

REVOKE ALL ON FUNCTION public.ensure_case_public_tracking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_case_public_tracking(UUID) TO authenticated;


-- ============================================================
-- H. RPC: regenerate_case_public_token
--    Rotates the public token, invalidating the previous QR / link.
--    Owner/admin only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.regenerate_case_public_token(
  p_case_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id  UUID := auth.uid();
  v_case     RECORD;
  v_role     TEXT;
  v_token    TEXT;
  v_rowcount INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, org_id INTO v_case
    FROM public.enterprise_cases
   WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  v_role := public.get_org_member_role(v_case.org_id, v_user_id);

  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only owner or admin may rotate a tracking token';
  END IF;

  v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_~');
  v_token := rtrim(v_token, '~');

  UPDATE public.case_public_tracking
     SET public_token = v_token,
         updated_at   = now()
   WHERE case_id = p_case_id;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  IF v_rowcount = 0 THEN
    INSERT INTO public.case_public_tracking (
      case_id, org_id, public_token, created_by
    )
    VALUES (
      p_case_id, v_case.org_id, v_token, v_user_id
    );
  END IF;

  RETURN v_token;
END;
$func$;

COMMENT ON FUNCTION public.regenerate_case_public_token(UUID) IS
  'Rotates the public_token on case_public_tracking, instantly invalidating '
  'the previous URL/QR. Restricted to owner/admin (operator-level "kill switch" '
  'for a leaked or compromised QR card).';

REVOKE ALL ON FUNCTION public.regenerate_case_public_token(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_case_public_token(UUID) TO authenticated;


-- ============================================================
-- I. RPC: update_case_public_tracking_settings
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_case_public_tracking_settings(
  p_case_id               UUID,
  p_public_enabled        BOOLEAN DEFAULT NULL,
  p_public_title          TEXT    DEFAULT NULL,
  p_public_summary        TEXT    DEFAULT NULL,
  p_show_engineer_contact BOOLEAN DEFAULT NULL,
  p_show_progress_percent BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_case    RECORD;
  v_role    TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, org_id INTO v_case
    FROM public.enterprise_cases
   WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  v_role := public.get_org_member_role(v_case.org_id, v_user_id);

  IF v_role NOT IN ('owner', 'admin', 'head_of_department') THEN
    RAISE EXCEPTION 'Only owner, admin, or head_of_department may change tracking settings';
  END IF;

  PERFORM public.ensure_case_public_tracking(p_case_id);

  UPDATE public.case_public_tracking
     SET
       public_enabled        = COALESCE(p_public_enabled,        public_enabled),
       public_title          = COALESCE(NULLIF(trim(COALESCE(p_public_title,   '')), ''), public_title),
       public_summary        = COALESCE(NULLIF(trim(COALESCE(p_public_summary, '')), ''), public_summary),
       show_engineer_contact = COALESCE(p_show_engineer_contact, show_engineer_contact),
       show_progress_percent = COALESCE(p_show_progress_percent, show_progress_percent),
       updated_at            = now()
   WHERE case_id = p_case_id;
END;
$func$;

COMMENT ON FUNCTION public.update_case_public_tracking_settings(UUID, BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN) IS
  'Adjusts the public-facing settings on case_public_tracking. NULL parameters '
  'leave the existing value unchanged. public_enabled=false revokes tracking '
  'instantly. Restricted to owner/admin/head_of_department.';

REVOKE ALL ON FUNCTION public.update_case_public_tracking_settings(UUID, BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_case_public_tracking_settings(UUID, BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;


-- ============================================================
-- J. RPC: upsert_case_client_contact
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_case_client_contact(
  p_case_id           UUID,
  p_client_name       TEXT    DEFAULT NULL,
  p_phone_e164        TEXT    DEFAULT NULL,
  p_email             TEXT    DEFAULT NULL,
  p_preferred_channel TEXT    DEFAULT 'none',
  p_receive_updates   BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_case    RECORD;
  v_role    TEXT;
  v_id      UUID;
  v_channel TEXT := COALESCE(NULLIF(trim(p_preferred_channel), ''), 'none');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, org_id INTO v_case
    FROM public.enterprise_cases
   WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  v_role := public.get_org_member_role(v_case.org_id, v_user_id);

  IF v_role NOT IN ('owner', 'admin', 'head_of_department', 'engineer') THEN
    RAISE EXCEPTION 'Not authorized to edit client contact for this case';
  END IF;

  IF v_channel NOT IN ('sms', 'whatsapp', 'email', 'none') THEN
    RAISE EXCEPTION 'Invalid preferred_channel: %', v_channel;
  END IF;

  INSERT INTO public.case_client_contacts (
    case_id, org_id, client_name, phone_e164, email,
    preferred_channel, receive_updates, created_by
  )
  VALUES (
    p_case_id, v_case.org_id,
    NULLIF(trim(COALESCE(p_client_name, '')), ''),
    NULLIF(trim(COALESCE(p_phone_e164,  '')), ''),
    NULLIF(trim(COALESCE(p_email,       '')), ''),
    v_channel,
    COALESCE(p_receive_updates, true),
    v_user_id
  )
  ON CONFLICT (case_id) DO UPDATE SET
    client_name       = EXCLUDED.client_name,
    phone_e164        = EXCLUDED.phone_e164,
    email             = EXCLUDED.email,
    preferred_channel = EXCLUDED.preferred_channel,
    receive_updates   = EXCLUDED.receive_updates,
    updated_at        = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$func$;

COMMENT ON FUNCTION public.upsert_case_client_contact(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) IS
  'Upserts a case_client_contacts row keyed by case_id. Trims input, '
  'coerces empty strings to NULL, validates preferred_channel. '
  'Restricted to owner/admin/head_of_department/engineer.';

REVOKE ALL ON FUNCTION public.upsert_case_client_contact(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_case_client_contact(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;


-- ============================================================
-- K. RPC: publish_case_public_update
-- ============================================================
CREATE OR REPLACE FUNCTION public.publish_case_public_update(
  p_case_id                 UUID,
  p_title_ar                TEXT,
  p_title_en                TEXT    DEFAULT NULL,
  p_body_ar                 TEXT    DEFAULT NULL,
  p_body_en                 TEXT    DEFAULT NULL,
  p_public_status           TEXT    DEFAULT NULL,
  p_progress_percent        INTEGER DEFAULT NULL,
  p_client_action_required  BOOLEAN DEFAULT false,
  p_required_action_ar      TEXT    DEFAULT NULL,
  p_required_action_en      TEXT    DEFAULT NULL,
  p_notify_client           BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id             UUID    := auth.uid();
  v_case                RECORD;
  v_role                TEXT;
  v_title_ar            TEXT    := NULLIF(trim(COALESCE(p_title_ar, '')), '');
  v_public_status       TEXT;
  v_progress            INTEGER := p_progress_percent;
  v_notification_status TEXT;
  v_id                  UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_title_ar IS NULL THEN
    RAISE EXCEPTION 'title_ar is required';
  END IF;

  SELECT id, org_id, status INTO v_case
    FROM public.enterprise_cases
   WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  v_role := public.get_org_member_role(v_case.org_id, v_user_id);

  IF v_role NOT IN ('owner', 'admin', 'head_of_department', 'engineer') THEN
    RAISE EXCEPTION 'Not authorized to publish updates on this case';
  END IF;

  v_public_status := COALESCE(NULLIF(trim(COALESCE(p_public_status, '')), ''), v_case.status);

  IF v_progress IS NULL THEN
    v_progress := CASE v_case.status
      WHEN 'draft'                     THEN 5
      WHEN 'submitted'                 THEN 15
      WHEN 'assigned'                  THEN 25
      WHEN 'under_engineering_review'  THEN 40
      WHEN 'ai_review_attached'        THEN 55
      WHEN 'engineer_review_completed' THEN 65
      WHEN 'submitted_to_head'         THEN 75
      WHEN 'returned_for_revision'     THEN 50
      WHEN 'approved_internal'         THEN 85
      WHEN 'delivered_to_client'       THEN 95
      WHEN 'closed'                    THEN 100
      WHEN 'cancelled'                 THEN 0
      ELSE 0
    END;
  END IF;

  IF v_progress < 0 OR v_progress > 100 THEN
    RAISE EXCEPTION 'progress_percent must be between 0 and 100';
  END IF;

  IF p_notify_client THEN
    v_notification_status := 'queued';
  ELSE
    v_notification_status := 'not_sent';
  END IF;

  PERFORM public.ensure_case_public_tracking(p_case_id);

  INSERT INTO public.case_public_updates (
    case_id, org_id, title_ar, title_en, body_ar, body_en,
    public_status, progress_percent,
    client_action_required, required_action_ar, required_action_en,
    published_by, notify_client, notification_status
  )
  VALUES (
    p_case_id, v_case.org_id,
    v_title_ar,
    NULLIF(trim(COALESCE(p_title_en, '')), ''),
    NULLIF(trim(COALESCE(p_body_ar,  '')), ''),
    NULLIF(trim(COALESCE(p_body_en,  '')), ''),
    v_public_status,
    v_progress,
    COALESCE(p_client_action_required, false),
    NULLIF(trim(COALESCE(p_required_action_ar, '')), ''),
    NULLIF(trim(COALESCE(p_required_action_en, '')), ''),
    v_user_id,
    COALESCE(p_notify_client, false),
    v_notification_status
  )
  RETURNING id INTO v_id;

  UPDATE public.case_public_tracking
     SET last_published_at = now(),
         updated_at        = now()
   WHERE case_id = p_case_id;

  RETURN v_id;
END;
$func$;

COMMENT ON FUNCTION public.publish_case_public_update(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, BOOLEAN) IS
  'Inserts an immutable case_public_updates row and bumps the parent '
  'case_public_tracking.last_published_at. Defaults public_status to the '
  'current internal status, and progress_percent to a deterministic mapping '
  'of internal status. notify_client=true marks notification_status=queued '
  'but does NOT dispatch a notification -- provider integration is E7.10C.';

REVOKE ALL ON FUNCTION public.publish_case_public_update(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_case_public_update(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, TEXT, BOOLEAN) TO authenticated;


-- ============================================================
-- End of E7.10A migration.
-- Adds public client tracking foundation + QR token + published updates.
-- Public reads served via get-public-case-tracking edge function (anon).
-- Notification provider integration deferred to E7.10C.
-- AI command dashboard + AI insights deferred to E7.10B / E7.10D.
-- ============================================================
