-- ============================================================
-- Enterprise Workspace Functional Completion (Phase E7.6)
--
-- Adds the RPCs and table needed to convert placeholder UI into
-- real institutional workspace functionality:
--
--   A. organization_branding_settings   (new table)
--   B. accept_org_invitation            (new RPC)
--   C. revoke_org_invitation            (new RPC)
--   D. update_org_member_role           (new RPC)
--   E. update_org_member_status         (new RPC)
--   F. upsert_organization_branding     (new RPC)
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify organizations, org_members, org_invitations (E2)
--   * does NOT modify enterprise_cases, case_documents,
--     case_status_history, case_notes, enterprise_case_counters (E3)
--   * does NOT modify case_reviews, case_approvals (E4)
--   * does NOT modify case_ai_sessions, ai_report_versions,
--     case_review_ai_reports (E5)
--   * does NOT modify user_subscriptions, payment_transactions,
--     profiles, or subscription_plans
--   * does NOT alter any existing edge function behavior
--   * does NOT touch billing, auth, or Analytical Mode
--   * does NOT touch fire-safety-chat or fire-safety-chat-v2
--
-- Migration tracking note:
--   CLI tracking is divergent. Apply via controlled execution only.
--   Do NOT use supabase db push.
--
-- Operating model: docs/enterprise/enterprise-operating-model-v1.md
-- ============================================================


-- ============================================================
-- A. organization_branding_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organization_branding_settings (
  org_id              UUID         NOT NULL PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  logo_url            TEXT         NULL,
  report_header_ar    TEXT         NULL,
  report_header_en    TEXT         NULL,
  primary_color       TEXT         NULL,
  secondary_color     TEXT         NULL,
  default_report_style TEXT        NOT NULL DEFAULT 'standard'
    CHECK (default_report_style IN ('standard', 'formal', 'minimal', 'technical')),
  updated_by          UUID         NULL REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_branding_settings IS
  'Per-organization branding and report style preferences. One row per org (upsert pattern). PDF rendering uses these settings in a future report phase; saving is live as of E7.6.';

DROP TRIGGER IF EXISTS update_organization_branding_settings_updated_at
  ON public.organization_branding_settings;
CREATE TRIGGER update_organization_branding_settings_updated_at
  BEFORE UPDATE ON public.organization_branding_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.organization_branding_settings ENABLE ROW LEVEL SECURITY;

-- Any active org member may read branding (needed for report rendering).
CREATE POLICY "branding_select_active_member"
  ON public.organization_branding_settings
  FOR SELECT
  TO authenticated
  USING (public.is_active_org_member(org_id, auth.uid()));

-- Only owner/admin may write branding settings.
CREATE POLICY "branding_insert_owner_or_admin"
  ON public.organization_branding_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_owner_or_admin(org_id, auth.uid()));

CREATE POLICY "branding_update_owner_or_admin"
  ON public.organization_branding_settings
  FOR UPDATE
  TO authenticated
  USING  (public.is_org_owner_or_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_owner_or_admin(org_id, auth.uid()));

-- No DELETE policy: branding rows are not user-deletable.


-- ============================================================
-- B. accept_org_invitation
--
-- Called by the invitee after clicking their /accept-invite link.
-- Returns the org_id so the frontend can navigate to /enterprise.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_org_invitation(
  p_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id    UUID := auth.uid();
  v_user_email TEXT;
  v_inv        RECORD;
  v_org_id     UUID;
BEGIN
  -- 1. Must be authenticated.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Look up the caller's email from auth.users (SECURITY DEFINER bypasses RLS).
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;

  -- 3. Fetch and lock the invitation row.
  SELECT * INTO v_inv
  FROM public.org_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or token is invalid';
  END IF;

  -- 4. Validate status.
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is % and can no longer be accepted', v_inv.status;
  END IF;

  -- 5. Validate expiry.
  IF v_inv.expires_at < now() THEN
    UPDATE public.org_invitations
    SET status = 'expired', updated_at = now()
    WHERE id = v_inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- 6. Email match check (case-insensitive).
  IF lower(v_user_email) <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'Your account email (%) does not match the invitation email (%)',
      v_user_email, v_inv.email;
  END IF;

  -- 7. Enforce one-org-per-user invariant.
  IF EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = v_user_id
      AND status IN ('active', 'invited', 'suspended')
  ) THEN
    RAISE EXCEPTION 'You already belong to an organization and cannot accept another invitation';
  END IF;

  v_org_id := v_inv.org_id;

  -- 8. Insert membership row.
  INSERT INTO public.org_members (
    org_id, user_id, role, status,
    invited_by, invited_at, joined_at
  ) VALUES (
    v_org_id,
    v_user_id,
    v_inv.role,
    'active',
    v_inv.created_by,
    v_inv.created_at,
    now()
  );

  -- 9. Mark invitation accepted.
  UPDATE public.org_invitations
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = v_inv.id;

  RETURN v_org_id;
END;
$func$;

COMMENT ON FUNCTION public.accept_org_invitation(TEXT) IS
  'Accepts a pending invitation token for the calling authenticated user. Validates: token exists, status=pending, not expired, email matches auth.users.email, user not already in any org. Inserts active membership and marks invitation accepted. Returns org_id.';

REVOKE ALL    ON FUNCTION public.accept_org_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_org_invitation(TEXT) TO authenticated;


-- ============================================================
-- C. revoke_org_invitation
--
-- Called by owner/admin to cancel a pending invitation.
-- Soft-delete: marks status='revoked'. Does not delete the row.
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_org_invitation(
  p_invitation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_inv     RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv
  FROM public.org_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  -- Only owner/admin of this invitation's org may revoke.
  IF NOT public.is_org_owner_or_admin(v_inv.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Only the organization owner or admin may revoke invitations';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending invitations can be revoked (current status: %)', v_inv.status;
  END IF;

  UPDATE public.org_invitations
  SET status = 'revoked', updated_at = now()
  WHERE id = p_invitation_id;
END;
$func$;

COMMENT ON FUNCTION public.revoke_org_invitation(UUID) IS
  'Marks a pending invitation as revoked. Only the org owner or admin may call this. Raises if invitation is not in pending state.';

REVOKE ALL    ON FUNCTION public.revoke_org_invitation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_org_invitation(UUID) TO authenticated;


-- ============================================================
-- D. update_org_member_role
--
-- Owner/admin may change a non-owner member's role.
-- Admin cannot promote to owner (ownership transfer deferred).
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_org_member_role(
  p_member_id UUID,
  p_role      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_member      RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate target role (owner not assignable through this function).
  IF p_role NOT IN ('admin', 'head_of_department', 'engineer', 'finance_officer') THEN
    RAISE EXCEPTION 'Invalid role: %. Valid roles: admin, head_of_department, engineer, finance_officer', p_role;
  END IF;

  SELECT * INTO v_member
  FROM public.org_members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Caller must be owner or admin of the same org.
  IF NOT public.is_org_owner_or_admin(v_member.org_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the organization owner or admin may change member roles';
  END IF;

  -- Cannot change the owner row via this function.
  IF v_member.role = 'owner' THEN
    RAISE EXCEPTION 'The organization owner role cannot be changed through this function. Ownership transfer is not yet supported.';
  END IF;

  -- Cannot change your own role (prevents privilege escalation).
  IF v_member.user_id = v_caller_id THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  UPDATE public.org_members
  SET role = p_role, updated_at = now()
  WHERE id = p_member_id;
END;
$func$;

COMMENT ON FUNCTION public.update_org_member_role(UUID, TEXT) IS
  'Changes the role of a non-owner org member. Only owner/admin may call this. Owner row is protected. Admin cannot promote to owner (ownership transfer is deferred). Caller cannot change own role.';

REVOKE ALL    ON FUNCTION public.update_org_member_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_org_member_role(UUID, TEXT) TO authenticated;


-- ============================================================
-- E. update_org_member_status
--
-- Owner/admin may suspend, reactivate, or soft-remove a member.
-- Cannot suspend/remove the org owner.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_org_member_status(
  p_member_id UUID,
  p_status    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller_id UUID := auth.uid();
  v_member    RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('active', 'suspended', 'removed') THEN
    RAISE EXCEPTION 'Invalid status: %. Valid values: active, suspended, removed', p_status;
  END IF;

  SELECT * INTO v_member
  FROM public.org_members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF NOT public.is_org_owner_or_admin(v_member.org_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the organization owner or admin may change member status';
  END IF;

  -- The org owner row is immutable via this function.
  IF v_member.role = 'owner' THEN
    RAISE EXCEPTION 'The organization owner cannot be suspended or removed through this function';
  END IF;

  -- Caller cannot change their own status.
  IF v_member.user_id = v_caller_id THEN
    RAISE EXCEPTION 'You cannot change your own membership status';
  END IF;

  UPDATE public.org_members
  SET
    status     = p_status,
    removed_at = CASE WHEN p_status = 'removed' THEN now() ELSE removed_at END,
    updated_at = now()
  WHERE id = p_member_id;
END;
$func$;

COMMENT ON FUNCTION public.update_org_member_status(UUID, TEXT) IS
  'Changes the status of a non-owner org member to active, suspended, or removed. Owner/admin only. Owner row is protected. Caller cannot change own status. removed_at is set when status becomes removed.';

REVOKE ALL    ON FUNCTION public.update_org_member_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_org_member_status(UUID, TEXT) TO authenticated;


-- ============================================================
-- F. upsert_organization_branding
--
-- Owner/admin upserts the branding settings row.
-- Using an RPC keeps the RLS upsert logic clean and avoids the
-- "no row to update" edge case on first save.
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_organization_branding(
  p_org_id              UUID,
  p_logo_url            TEXT    DEFAULT NULL,
  p_report_header_ar    TEXT    DEFAULT NULL,
  p_report_header_en    TEXT    DEFAULT NULL,
  p_primary_color       TEXT    DEFAULT NULL,
  p_secondary_color     TEXT    DEFAULT NULL,
  p_default_report_style TEXT   DEFAULT 'standard'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_owner_or_admin(p_org_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the organization owner or admin may update branding settings';
  END IF;

  IF p_default_report_style NOT IN ('standard', 'formal', 'minimal', 'technical') THEN
    RAISE EXCEPTION 'Invalid report style: %. Valid values: standard, formal, minimal, technical', p_default_report_style;
  END IF;

  INSERT INTO public.organization_branding_settings (
    org_id, logo_url, report_header_ar, report_header_en,
    primary_color, secondary_color, default_report_style, updated_by
  ) VALUES (
    p_org_id, p_logo_url, p_report_header_ar, p_report_header_en,
    p_primary_color, p_secondary_color, p_default_report_style, v_caller_id
  )
  ON CONFLICT (org_id) DO UPDATE SET
    logo_url             = EXCLUDED.logo_url,
    report_header_ar     = EXCLUDED.report_header_ar,
    report_header_en     = EXCLUDED.report_header_en,
    primary_color        = EXCLUDED.primary_color,
    secondary_color      = EXCLUDED.secondary_color,
    default_report_style = EXCLUDED.default_report_style,
    updated_by           = v_caller_id,
    updated_at           = now();
END;
$func$;

COMMENT ON FUNCTION public.upsert_organization_branding(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Upserts the branding settings row for an organization. Owner/admin only. PDF rendering is deferred; settings are persisted immediately.';

REVOKE ALL    ON FUNCTION public.upsert_organization_branding(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_organization_branding(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================
-- End of E7.6 migration.
-- ============================================================
